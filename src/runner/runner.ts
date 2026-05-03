/**
 * Browser-side pipeline runner.
 * Exposes window.runPipeline(input) which Playwright calls via page.evaluate().
 */

import { load as parseYaml } from "js-yaml";
import { extractFramesSequential } from "../pipeline/frameExtraction";
import { initPoseLandmarker } from "../pipeline/poseDetection";
import {
  runPrimaryAnalysis,
  runSecondaryAnalysis,
} from "../pipeline/runAnalysis";
import type {
  PrimaryAnalysisResult,
  SecondaryAnalysisResult,
} from "../pipeline/runAnalysis";
import { buildReportPrompt } from "../pipeline/reportGeneration";
import { generateReport } from "../api";
import { assessmentFromYaml } from "../assessment";
import type { Assessment, ExtractedFrame } from "../types";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunnerInput {
  dir: string;
  apiKey?: string;
  startSecs?: number;
  durationSecs?: number;
  targetFps?: number;
}

export interface RunnerOutput {
  dir: string;
  movementType: string;
  cameraView: string;
  secondaryCameraView?: string;
  patient: { name: string; age: number | string; complaint: string };
  phaseFrames: FrameData[];
  annotatedFrames: string[];       // phase-selected (for report)
  allAnnotatedFrames: string[];    // every frame with wireframe + counter
  gif: string | null;
  aggregated: Record<string, unknown>;
  secondary: SecondaryOutput | null;
  report: unknown | null;
  prompt: string | null;
  error: string | null;
}

interface SecondaryOutput {
  phaseFrames: FrameData[];
  annotatedFrames: string[];
  pairedFrames: string[];
  aggregated: Record<string, unknown>;
}

interface FrameData {
  index: number;
  timestamp: number;
  phase: { id: string; label: string };
  imageData: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function status(msg: string) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
  console.log("[Runner]", msg);
}

async function fetchVideoFile(dir: string, filename: string): Promise<File> {
  const res = await fetch(`/${dir}/${filename}`);
  if (!res.ok)
    throw new Error(`Could not fetch /${dir}/${filename} (${res.status})`);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "video/quicktime" });
}

async function fetchAssessment(dir: string): Promise<Assessment> {
  const res = await fetch(`/${dir}/test.yaml`);
  if (!res.ok)
    throw new Error(`Could not fetch /${dir}/test.yaml (${res.status})`);
  const raw = parseYaml(await res.text()) as Record<string, unknown>;
  return assessmentFromYaml(raw);
}

async function compositeSideBySide(
  img1: string,
  img2: string,
  label: string,
  view1: string,
  view2: string,
): Promise<string> {
  return new Promise((resolve) => {
    const i1 = new Image(),
      i2 = new Image();
    let loaded = 0;
    const onLoad = () => {
      if (++loaded < 2) return;
      const LABEL_H = 32;
      const W = i1.width + i2.width;
      const H = Math.max(i1.height, i2.height) + LABEL_H;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(i1, 0, 0);
      ctx.drawImage(i2, i1.width, 0);
      ctx.strokeStyle = "#0e7c6a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(i1.width, 0);
      ctx.lineTo(i1.width, H - LABEL_H);
      ctx.stroke();
      ctx.fillStyle = "#0e7c6a";
      ctx.fillRect(0, H - LABEL_H, W, LABEL_H);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const mid = H - LABEL_H / 2;
      ctx.fillText(label, W / 2, mid);
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.textAlign = "left";
      ctx.fillText(view1, 8, mid);
      ctx.textAlign = "right";
      ctx.fillText(view2, W - 8, mid);
      resolve(
        canvas
          .toDataURL("image/jpeg", 0.88)
          .replace("data:image/jpeg;base64,", ""),
      );
    };
    i1.onload = onLoad;
    i2.onload = onLoad;
    i1.onerror = () => resolve(img1);
    i2.onerror = () => resolve(img1);
    i1.src = `data:image/jpeg;base64,${img1}`;
    i2.src = `data:image/jpeg;base64,${img2}`;
  });
}

function toFrameData(frames: ExtractedFrame[]): FrameData[] {
  return frames.map((f) => ({
    index: f.index,
    timestamp: f.timestamp,
    phase: { id: f.phase.id, label: f.phase.label },
    imageData: f.imageData,
  }));
}

// ── Landmarker singleton ──────────────────────────────────────────────────────

let _landmarker: PoseLandmarker | null = null;
async function getLandmarker() {
  if (!_landmarker) _landmarker = await initPoseLandmarker();
  return _landmarker;
}

// ── Main runner ───────────────────────────────────────────────────────────────

async function runPipeline(input: RunnerInput): Promise<RunnerOutput> {
  const { dir, apiKey } = input;

  status(`[${dir}] Loading config...`);
  const assessment = await fetchAssessment(dir);

  // Precedence: RunnerInput args > YAML capture block > hardcoded defaults
  const startSecs    = input.startSecs    ?? assessment.capture?.startSecs    ?? 0;
  const durationSecs = input.durationSecs ?? assessment.capture?.durationSecs ?? 2;
  const targetFps    = input.targetFps    ?? assessment.capture?.targetFps    ?? 5;
  const movementType = assessment.patient.movementType || "Running";
  const cameraView = assessment.media.primary.cameraView;
  const secondaryMeta = assessment.media.secondary;

  const output: RunnerOutput = {
    dir,
    movementType,
    cameraView,
    secondaryCameraView: secondaryMeta?.cameraView,
    patient: {
      name: assessment.patient.name,
      age: assessment.patient.age,
      complaint: assessment.patient.diagnosis,
    },
    phaseFrames: [],
    annotatedFrames: [],
    allAnnotatedFrames: [],
    gif: null,
    aggregated: {},
    secondary: null,
    report: null,
    prompt: null,
    error: null,
  };

  try {
    status(`[${dir}] Step 1 — extracting frames...`);
    const videoFile = await fetchVideoFile(dir, assessment.media.primary.file);
    const frames = await extractFramesSequential(videoFile, {
      startSecs,
      durationSecs,
      targetFps,
    });
    status(`[${dir}] Step 1 ✓ — ${frames.length} frames`);

    status(`[${dir}] Steps 2–4 — detection, phase selection, angles...`);
    const landmarker = await getLandmarker();
    const primary: PrimaryAnalysisResult = await runPrimaryAnalysis(
      frames,
      landmarker,
      { movementType, cameraView },
    );
    output.phaseFrames = toFrameData(primary.phaseFrames);
    output.annotatedFrames = primary.annotatedFrames;
    output.allAnnotatedFrames = primary.allAnnotatedFrames;
    output.gif = primary.gifData;
    output.aggregated = primary.aggregated as Record<string, unknown>;
    status(
      `[${dir}] Steps 2–4 ✓ — ${primary.phaseFrames.length} phase frames: ${primary.phaseFrames.map((f) => f.phase.id).join(", ")}`,
    );

    if (secondaryMeta) {
      status(`[${dir}] Step 3b — secondary video...`);
      const cameraView2 = (secondaryMeta.cameraView ?? "front") as
        | "side"
        | "front"
        | "posterior";
      try {
        const videoFile2 = await fetchVideoFile(dir, secondaryMeta.file);
        const sec: SecondaryAnalysisResult = await runSecondaryAnalysis(
          videoFile2,
          landmarker,
          primary.phaseFrames,
          { movementType, cameraView: cameraView2 },
        );
        const pairCount = Math.min(
          primary.annotatedFrames.length,
          sec.annotatedFrames.length,
        );
        const pairedFrames: string[] = [];
        for (let i = 0; i < pairCount; i++) {
          pairedFrames.push(
            await compositeSideBySide(
              primary.annotatedFrames[i],
              sec.annotatedFrames[i],
              primary.phaseFrames[i]?.phase.label ?? `Frame ${i + 1}`,
              cameraView,
              cameraView2,
            ),
          );
        }
        output.secondary = {
          phaseFrames: toFrameData(sec.phaseFrames),
          annotatedFrames: sec.annotatedFrames,
          pairedFrames,
          aggregated: sec.aggregated as Record<string, unknown>,
        };
        status(
          `[${dir}] Step 3b ✓ — ${sec.phaseFrames.length} secondary frames`,
        );
      } catch (e) {
        status(
          `[${dir}] Step 3b ✗ (non-critical) — ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    if (apiKey?.trim()) {
      status(`[${dir}] Step 5 — generating report...`);
      const hasDualView = (output.secondary?.phaseFrames.length ?? 0) > 0;
      const prompt = buildReportPrompt({
        patient: {
          patientName: assessment.patient.name,
          patientAge: assessment.patient.age,
          diagnosis: assessment.patient.diagnosis,
          movementType,
          patientHeight: assessment.patient.height,
          heightUnit: assessment.patient.heightUnit,
          injuredSide: assessment.patient.injuredSide,
          clinicalNotes: assessment.patient.notes,
        },
        movementType,
        cameraView,
        hasDualView,
        secondaryCameraView: secondaryMeta?.cameraView as
          | "side"
          | "front"
          | "posterior"
          | undefined,
        focusAreas: assessment.focus,
        aggregated: primary.aggregated,
        aggregated2: hasDualView
          ? (output.secondary!.aggregated as typeof primary.aggregated)
          : undefined,
        proms: assessment.proms ?? {},
        running: assessment.running,
        jump: assessment.jump,
        frameCount: primary.phaseFrames.length,
        frameCount2: hasDualView
          ? output.secondary!.phaseFrames.length
          : undefined,
      });
      output.prompt = prompt;
      output.report = await generateReport({
        apiKey,
        prompt,
        frames: primary.phaseFrames,
        frames2: output.secondary
          ? output.secondary.phaseFrames
              .map((_, i) => primary.phaseFrames[i])
              .filter(Boolean)
          : [],
      });
      status(`[${dir}] Step 5 ✓`);
    }
  } catch (e) {
    output.error = e instanceof Error ? e.message : String(e);
    status(`[${dir}] ✗ — ${output.error}`);
  }

  status(`[${dir}] Done.`);
  return output;
}

// ── Expose on window ──────────────────────────────────────────────────────────

(window as unknown as Record<string, unknown>).runPipeline = runPipeline;
document.getElementById("status")!.textContent = "Pipeline runner ready.";
