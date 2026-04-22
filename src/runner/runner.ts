/**
 * Browser-side pipeline runner.
 * Exposes window.runPipeline(input) which the Playwright script calls via page.evaluate().
 * Each pipeline step is wrapped in a try/catch so partial results are always returned.
 */

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
    poseDetection:     StepResult<{ detectedCount: number; totalCount: number; perFrameAngles: Record<string, number>[] }>;
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

function cameraViewFromAngle(angle: string | undefined): 'side' | 'front' | 'posterior' {
  const a = angle?.toLowerCase() ?? '';
  if (a.includes('front')) return 'front';
  if (a.includes('post')) return 'posterior';
  return 'side';
}

async function fetchVideoFile(dir: string, filename: string): Promise<File> {
  const res = await fetch(`/${dir}/${filename}`);
  if (!res.ok) throw new Error(`Could not fetch /${dir}/${filename} (${res.status})`);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || 'video/quicktime' });
}

interface TestYaml {
  patient_name:  string;
  age:           number;
  complaint:     string;
  movement_type: string;
  media: {
    primary:    { file: string; angle?: string };
    secondary?: { file: string; angle?: string };
  };
}

async function fetchYaml(dir: string): Promise<TestYaml> {
  const res = await fetch(`/${dir}/test.yaml`);
  if (!res.ok) throw new Error(`Could not fetch /${dir}/test.yaml (${res.status})`);
  // Minimal YAML parser sufficient for the flat test.yaml structure
  const text = await res.text();
  return parseSimpleYaml(text) as TestYaml;
}

// Lightweight YAML parser — handles the nested test.yaml structure without a library dep.
// Supports string scalars, numbers, and two levels of indentation.
function parseSimpleYaml(text: string): Record<string, unknown> {
  const lines = text.split('\n');
  const root: Record<string, unknown> = {};
  let current: Record<string, unknown> = root;
  let parent:  Record<string, unknown> = root;
  let parentKey = '';
  let depth = 0;

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.search(/\S/);
    const line   = raw.trim();
    const colon  = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();

    if (indent > depth) {
      parent    = current;
      parentKey = Object.keys(current)[Object.keys(current).length - 1];
      current   = {} as Record<string, unknown>;
      (parent as Record<string, unknown>)[parentKey] = current;
    } else if (indent < depth) {
      current = root;
      parent  = root;
    }
    depth = indent;

    if (val === '') {
      // nested object will be filled on next iteration
    } else if (val === 'true')  {
      (current as Record<string, unknown>)[key] = true;
    } else if (val === 'false') {
      (current as Record<string, unknown>)[key] = false;
    } else if (!isNaN(Number(val)) && val !== '') {
      (current as Record<string, unknown>)[key] = Number(val);
    } else {
      (current as Record<string, unknown>)[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }
  return root;
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
  const yaml     = await fetchYaml(dir);
  const cameraView = cameraViewFromAngle(yaml.media?.primary?.angle);

  // Resolve movement type against PHASE_MAPS keys (same logic as testUtils)
  const movementType = yaml.movement_type ?? 'Running';

  const output: RunnerOutput = {
    dir,
    movementType,
    cameraView,
    patient: { name: yaml.patient_name, age: yaml.age, complaint: yaml.complaint },
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
    const videoFile = await fetchVideoFile(dir, yaml.media.primary.file);
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

        output.steps.poseDetection = {
          ok: true, ms: ms3,
          data: { detectedCount, totalCount: poseResults.length, perFrameAngles: allFrameAngles },
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
              const isRunning = /running|gait|walk/i.test(movementType);
              const isJump    = /jump|landing/i.test(movementType);
              const prompt = buildReportPrompt({
                patient: {
                  patientName:   yaml.patient_name,
                  patientAge:    String(yaml.age),
                  diagnosis:     yaml.complaint,
                  movementType,
                  patientHeight: '',
                  heightUnit:    'cm',
                  injuredSide:   '',
                  clinicalNotes: '',
                },
                movementType,
                cameraView,
                hasDualView: false,
                focusAreas:  [],
                aggregated,
                proms:       {},
                running:     isRunning ? { treadmillSpeed: '', speedUnit: 'mph', treadmillIncline: '', runningSurface: 'road', videoFps: 30, shoe: '', experience: '', includeFootwear: false } : undefined,
                jump:        isJump    ? { videoFps: 30, involvedLimb: '', protocol: '', timePostOp: '' } : undefined,
                frameCount:  phaseFrames.length,
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
