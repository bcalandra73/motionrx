import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { ExtractedFrame, NormalizedLandmark } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorldLandmark {
  x: number; // metres, right = positive
  y: number; // metres, up = negative
  z: number; // metres, forward (toward camera) = negative
}

export interface PoseFrameResult {
  poseLandmarks: NormalizedLandmark[] | null;
  worldLandmarks: WorldLandmark[] | null;
  source: 'landmarker' | 'none';
  frameIndex: number;
}

// ── MediaPipe init ─────────────────────────────────────────────────────────────
// WASM files live in the npm package but Vite won't serve node_modules by default.
// The CDN WASM URL pinned to the exact installed version is the standard workaround.
const WASM_CDNS = [
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm`,
  `https://unpkg.com/@mediapipe/tasks-vision@0.10.34/wasm`,
];

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/' +
  'pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task';

const LANDMARKER_OPTIONS = {
  runningMode: 'IMAGE' as const,
  numPoses: 1,
  minPoseDetectionConfidence: 0.30,
  minPosePresenceConfidence: 0.30,
  minTrackingConfidence: 0.30,
  outputSegmentationMasks: false,
};

// Singleton so we only initialise once per page load.
let _landmarker: PoseLandmarker | null = null;

export async function initPoseLandmarker(): Promise<PoseLandmarker> {
  if (_landmarker) return _landmarker;

  let vision = null;
  for (const wasmUrl of WASM_CDNS) {
    try {
      vision = await FilesetResolver.forVisionTasks(wasmUrl);
      break;
    } catch {
      console.warn('[PoseLandmarker] WASM CDN failed:', wasmUrl);
    }
  }
  if (!vision) throw new Error('All WASM CDNs failed to load.');

  // Try GPU first; fall back to CPU
  try {
    _landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      ...LANDMARKER_OPTIONS,
    });
  } catch {
    console.warn('[PoseLandmarker] GPU delegate failed — using CPU');
    _landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      ...LANDMARKER_OPTIONS,
    });
  }

  return _landmarker;
}

// Exposed for tests that want to inject a pre-built landmarker.
export function setLandmarker(instance: PoseLandmarker) {
  _landmarker = instance;
}

// ── Frame pre-processing ──────────────────────────────────────────────────────
// Mild contrast / brightness lift before inference.
// MediaPipe landmark confidence degrades in underexposed gym/clinic footage.
// Only modifies frames where average luma < 90 (out of 255).

export function preprocessFrame(imageBase64: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onerror = () => resolve(imageBase64);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      // Sample a centre strip to estimate average luma
      const sample = ctx.getImageData(
        Math.floor(img.width * 0.25), Math.floor(img.height * 0.2),
        Math.floor(img.width * 0.5),  Math.floor(img.height * 0.6),
      );
      let lum = 0;
      for (let i = 0; i < sample.data.length; i += 16) {
        lum += sample.data[i] * 0.299 + sample.data[i + 1] * 0.587 + sample.data[i + 2] * 0.114;
      }
      lum /= sample.data.length / 16;

      const needsBrighten  = lum < 90;
      const contrastFactor = 1.12;
      const brightOffset   = needsBrighten ? Math.round((90 - lum) * 0.4) : 0;

      if (contrastFactor === 1.0 && brightOffset === 0) {
        resolve(imageBase64);
        return;
      }

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      const mid = 128;
      for (let i = 0; i < d.length; i += 4) {
        d[i]     = Math.min(255, Math.max(0, Math.round((d[i]     - mid) * contrastFactor + mid + brightOffset)));
        d[i + 1] = Math.min(255, Math.max(0, Math.round((d[i + 1] - mid) * contrastFactor + mid + brightOffset)));
        d[i + 2] = Math.min(255, Math.max(0, Math.round((d[i + 2] - mid) * contrastFactor + mid + brightOffset)));
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
    };
    img.src = `data:image/jpeg;base64,${imageBase64}`;
  });
}

// ── Single-frame detection ────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>(res => setTimeout(() => res(fallback), ms))]);
}

async function loadImage(base64: string): Promise<HTMLImageElement | null> {
  return withTimeout(
    new Promise(resolve => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `data:image/jpeg;base64,${base64}`;
    }),
    5000,
    null,
  );
}

export async function detectPoseOnFrame(
  landmarker: PoseLandmarker,
  imageBase64: string,
): Promise<Omit<PoseFrameResult, 'frameIndex'>> {
  const processedB64 = await withTimeout(preprocessFrame(imageBase64), 2000, imageBase64);
  const img = await loadImage(processedB64 !== imageBase64 ? processedB64 : imageBase64);

  if (!img) return { poseLandmarks: null, worldLandmarks: null, source: 'none' };

  let rawResult = null;
  try {
    rawResult = await withTimeout(Promise.resolve(landmarker.detect(img)), 8000, null);
  } catch (e) {
    console.warn('[PoseLandmarker] detect() error:', e);
  }

  if (rawResult?.landmarks?.length) {
    return {
      poseLandmarks:  rawResult.landmarks[0] as NormalizedLandmark[],
      worldLandmarks: (rawResult.worldLandmarks?.[0] ?? null) as WorldLandmark[] | null,
      source: 'landmarker',
    };
  }

  return { poseLandmarks: null, worldLandmarks: null, source: 'none' };
}

// ── All-frames entry point ────────────────────────────────────────────────────

export interface DetectPoseOptions {
  onProgress?: (percent: number, label: string) => void;
}

export async function detectPoseOnFrames(
  landmarker: PoseLandmarker,
  frames: ExtractedFrame[],
  options: DetectPoseOptions = {},
): Promise<PoseFrameResult[]> {
  const { onProgress } = options;
  const results: PoseFrameResult[] = [];

  for (let i = 0; i < frames.length; i++) {
    onProgress?.(
      Math.round((i / frames.length) * 100),
      `Detecting pose — frame ${i + 1} of ${frames.length}`,
    );

    const partial = await detectPoseOnFrame(landmarker, frames[i].imageData);
    results.push({ ...partial, frameIndex: i });
  }

  onProgress?.(100, `Pose detection complete — ${results.filter(r => r.source === 'landmarker').length} / ${frames.length} frames detected`);
  return results;
}
