/**
 * Browser-side pipeline runner.
 * Exposes window.runPipeline(input) which the Playwright script calls via page.evaluate().
 * Each pipeline step is wrapped in a try/catch so partial results are always returned.
 */

import { load as parseYaml } from 'js-yaml';
import { extractFrames } from '../pipeline/frameExtraction';
import { selectPhaseFrames } from '../pipeline/phaseSelection';
import { initPoseLandmarker, detectPoseOnFrames } from '../pipeline/poseDetection';
import {
  mergeWorldLandmarks,
  extractAngles,
  aggregateAngles,
} from '../pipeline/angleCalculation';
import type { AngleStat } from '../pipeline/angleCalculation';
import { buildReportPrompt } from '../pipeline/reportGeneration';
import { generateReport } from '../api';
import { assessmentFromYaml } from '../assessment';
import type { Assessment } from '../types';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunnerInput {
  dir:        string;   // e.g. "test_1" — fetched from /test_data via publicDir
  apiKey?:    string;   // optional; step 5 skipped if absent
}

interface StepResult<T> {
  ok:    boolean;
  ms:    number;
  data:  T | null;
  error: string | null;
}

interface FrameData {
  index:     number;
  timestamp: number;
  phase:     { id: string; label: string; desc: string; fraction: number };
  imageData: string; // base64 JPEG
}

export interface RunnerOutput {
  dir:          string;
  movementType: string;
  cameraView:   string;
  patient: {
    name:      string;
    age:       number | string;
    complaint: string;
  };
  steps: {
    extraction:        StepResult<{ frameCount: number; frames: FrameData[] }>;
    phaseSelection:    StepResult<{ frameCount: number; phases: string[]; frames: FrameData[] }>;
    poseDetection:     StepResult<{ detectedCount: number; totalCount: number; perFrameAngles: Record<string, number>[]; annotatedFrames: string[] }>;
    angleCalculation:  StepResult<{ aggregated: Record<string, AngleStat> }>;
    reportGeneration:  StepResult<{ prompt: string; report: unknown }> | null;
  };
}

// ── Landmarker singleton ──────────────────────────────────────────────────────
// Persists across runPipeline() calls so subsequent test cases skip init.

let _landmarker: PoseLandmarker | null = null;

async function getLandmarker(): Promise<PoseLandmarker> {
  if (!_landmarker) _landmarker = await initPoseLandmarker();
  return _landmarker;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function status(msg: string) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
  console.log('[Runner]', msg);
}

function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t = performance.now();
  return fn().then(value => ({ ms: Math.round(performance.now() - t), value }));
}

async function fetchVideoFile(dir: string, filename: string): Promise<File> {
  const res = await fetch(`/${dir}/${filename}`);
  if (!res.ok) throw new Error(`Could not fetch /${dir}/${filename} (${res.status})`);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || 'video/quicktime' });
}

async function fetchAssessment(dir: string): Promise<Assessment> {
  const res = await fetch(`/${dir}/test.yaml`);
  if (!res.ok) throw new Error(`Could not fetch /${dir}/test.yaml (${res.status})`);
  const raw = parseYaml(await res.text()) as Record<string, unknown>;
  return assessmentFromYaml(raw);
}

const SKELETON_CONNECTIONS: [number, number][] = [
  // torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // left arm
  [11, 13], [13, 15],
  // right arm
  [12, 14], [14, 16],
  // left leg
  [23, 25], [25, 27], [27, 29], [27, 31],
  // right leg
  [24, 26], [26, 28], [28, 30], [28, 32],
];
const LEFT_IDX  = new Set([11, 13, 15, 23, 25, 27, 29, 31]);
const RIGHT_IDX = new Set([12, 14, 16, 24, 26, 28, 30, 32]);

function jointColor(i: number): string {
  if (LEFT_IDX.has(i))  return '#00FFFF';
  if (RIGHT_IDX.has(i)) return '#FFFF00';
  return '#FFFFFF';
}

async function annotateFrame(
  imageData: string,
  landmarks: { x: number; y: number; z: number; visibility?: number }[],
): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const W = canvas.width;
      const H = canvas.height;
      const VIS = 0.3;
      const lineW = Math.max(2, Math.round(W * 0.003));
      const dotR  = Math.max(4, Math.round(W * 0.006));

      ctx.lineWidth = lineW;
      for (const [a, b] of SKELETON_CONNECTIONS) {
        const lA = landmarks[a], lB = landmarks[b];
        if (!lA || !lB) continue;
        if ((lA.visibility ?? 1) < VIS || (lB.visibility ?? 1) < VIS) continue;
        ctx.strokeStyle = jointColor(a);
        ctx.beginPath();
        ctx.moveTo(lA.x * W, lA.y * H);
        ctx.lineTo(lB.x * W, lB.y * H);
        ctx.stroke();
      }
      for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        if (!lm || (lm.visibility ?? 1) < VIS) continue;
        ctx.fillStyle = jointColor(i);
        ctx.beginPath();
        ctx.arc(lm.x * W, lm.y * H, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      resolve(canvas.toDataURL('image/jpeg', 0.85).replace('data:image/jpeg;base64,', ''));
    };
    img.onerror = () => resolve(imageData);
    img.src = `data:image/jpeg;base64,${imageData}`;
  });
}

function toFrameData(frames: { index: number; timestamp: number; phase: { id: string; label: string; desc: string; fraction: number }; imageData: string }[]): FrameData[] {
  return frames.map(f => ({
    index:     f.index,
    timestamp: f.timestamp,
    phase:     f.phase,
    imageData: f.imageData,
  }));
}

// ── Main runner ───────────────────────────────────────────────────────────────

async function runPipeline(input: RunnerInput): Promise<RunnerOutput> {
  const { dir, apiKey } = input;

  status(`[${dir}] Loading test config...`);
  const assessment  = await fetchAssessment(dir);
  const movementType = assessment.patient.movementType || 'Running';
  const cameraView   = assessment.media.primary.cameraView;

  const output: RunnerOutput = {
    dir,
    movementType,
    cameraView,
    patient: {
      name:      assessment.patient.name,
      age:       assessment.patient.age,
      complaint: assessment.patient.diagnosis,
    },
    steps: {
      extraction:       { ok: false, ms: 0, data: null, error: null },
      phaseSelection:   { ok: false, ms: 0, data: null, error: null },
      poseDetection:    { ok: false, ms: 0, data: null, error: null },
      angleCalculation: { ok: false, ms: 0, data: null, error: null },
      reportGeneration: null,
    },
  };

  // ── Step 1: Frame extraction ─────────────────────────────────────────────

  status(`[${dir}] Step 1 — extracting frames...`);
  try {
    const videoFile = await fetchVideoFile(dir, assessment.media.primary.file);
    const { ms, value: frames } = await timed(() => extractFrames(videoFile, movementType));
    output.steps.extraction = {
      ok: true, ms,
      data: { frameCount: frames.length, frames: toFrameData(frames) },
      error: null,
    };
    status(`[${dir}] Step 1 ✓ — ${frames.length} frames in ${ms}ms`);

    // ── Step 2: Phase selection ────────────────────────────────────────────

    status(`[${dir}] Step 2 — selecting phase frames...`);
    try {
      const { ms: ms2, value: phaseFrames } = await timed(() =>
        selectPhaseFrames(frames, movementType, { cameraView }),
      );
      output.steps.phaseSelection = {
        ok: true, ms: ms2,
        data: {
          frameCount: phaseFrames.length,
          phases:     phaseFrames.map(f => f.phase.id),
          frames:     toFrameData(phaseFrames),
        },
        error: null,
      };
      status(`[${dir}] Step 2 ✓ — ${phaseFrames.length} phase frames in ${ms2}ms`);

      // ── Step 3: Pose detection ───────────────────────────────────────────

      status(`[${dir}] Step 3 — running pose detection (loading model if needed)...`);
      try {
        const landmarker = await getLandmarker();
        const { ms: ms3, value: poseResults } = await timed(() =>
          detectPoseOnFrames(landmarker, phaseFrames),
        );
        const detectedCount = poseResults.filter(r => (r.poseLandmarks?.length ?? 0) > 0).length;

        // Pre-compute angles so we can include them in this step's output
        const allFrameAngles = poseResults.map(r =>
          extractAngles(
            mergeWorldLandmarks(r.poseLandmarks ?? [], r.worldLandmarks),
            cameraView,
            movementType,
          ),
        );

        const annotatedFrames = await Promise.all(
          poseResults.map((r, i) =>
            r.poseLandmarks
              ? annotateFrame(phaseFrames[i].imageData, r.poseLandmarks)
              : Promise.resolve(phaseFrames[i].imageData),
          ),
        );

        output.steps.poseDetection = {
          ok: true, ms: ms3,
          data: { detectedCount, totalCount: poseResults.length, perFrameAngles: allFrameAngles, annotatedFrames },
          error: null,
        };
        status(`[${dir}] Step 3 ✓ — ${detectedCount}/${poseResults.length} frames detected in ${ms3}ms`);

        // ── Step 4: Angle aggregation ──────────────────────────────────────

        try {
          const aggregated = aggregateAngles(allFrameAngles, phaseFrames.map(f => f.phase));
          output.steps.angleCalculation = {
            ok: true, ms: 0,
            data: { aggregated },
            error: null,
          };
          status(`[${dir}] Step 4 ✓ — ${Object.keys(aggregated).length} metrics computed`);

          // ── Step 5: Report generation (optional) ──────────────────────────

          if (apiKey?.trim()) {
            status(`[${dir}] Step 5 — generating report...`);
            try {
              const prompt = buildReportPrompt({
                patient: {
                  patientName:   assessment.patient.name,
                  patientAge:    assessment.patient.age,
                  diagnosis:     assessment.patient.diagnosis,
                  movementType,
                  patientHeight: assessment.patient.height,
                  heightUnit:    assessment.patient.heightUnit,
                  injuredSide:   assessment.patient.injuredSide,
                  clinicalNotes: assessment.patient.notes,
                },
                movementType,
                cameraView,
                hasDualView:  !!assessment.media.secondary,
                focusAreas:   assessment.focus,
                aggregated,
                proms:        assessment.proms ?? {},
                running:      assessment.running,
                jump:         assessment.jump,
                frameCount:   phaseFrames.length,
              });

              const { ms: ms5, value: report } = await timed(() =>
                generateReport({ apiKey, prompt, frames: phaseFrames }),
              );
              output.steps.reportGeneration = {
                ok: true, ms: ms5,
                data: { prompt, report },
                error: null,
              };
              status(`[${dir}] Step 5 ✓ — report generated in ${ms5}ms`);
            } catch (e) {
              const err = e instanceof Error ? e.message : String(e);
              output.steps.reportGeneration = { ok: false, ms: 0, data: null, error: err };
              status(`[${dir}] Step 5 ✗ — ${err}`);
            }
          } else {
            status(`[${dir}] Step 5 — skipped (no API key)`);
          }
        } catch (e) {
          output.steps.angleCalculation.error = e instanceof Error ? e.message : String(e);
          status(`[${dir}] Step 4 ✗ — ${output.steps.angleCalculation.error}`);
        }
      } catch (e) {
        output.steps.poseDetection.error = e instanceof Error ? e.message : String(e);
        status(`[${dir}] Step 3 ✗ — ${output.steps.poseDetection.error}`);
      }
    } catch (e) {
      output.steps.phaseSelection.error = e instanceof Error ? e.message : String(e);
      status(`[${dir}] Step 2 ✗ — ${output.steps.phaseSelection.error}`);
    }
  } catch (e) {
    output.steps.extraction.error = e instanceof Error ? e.message : String(e);
    status(`[${dir}] Step 1 ✗ — ${output.steps.extraction.error}`);
  }

  status(`[${dir}] Done.`);
  return output;
}

// ── Expose on window ──────────────────────────────────────────────────────────

(window as unknown as Record<string, unknown>).runPipeline = runPipeline;
document.getElementById('status')!.textContent = 'Pipeline runner ready.';
