import type { ExtractedFrame, NormalizedLandmark, PhaseLabel } from '../types';
import type { PoseFrameResult } from './poseDetection';
import { PHASE_MAPS } from '../data/phaseMaps';
import { getPhaseTimes } from './frameExtraction';
import { analyzeMovement } from './movement-analysis';
import type { PoseFrame } from './movement-analysis';
import { calcAngle } from './angleCalculation';

// ── Types ─────────────────────────────────────────────────────────────────────

type SparseLandmarks = (NormalizedLandmark | null)[];

export interface SelectPhaseOptions {
  cameraView?: 'side' | 'front' | 'posterior';
  onProgress?: (pct: number, label: string) => void;
  fps?: number;
}

export interface MovementAnalysisDiagnostics {
  refLeg: 'L' | 'R';
  lContactPeaks: number[];
  rContactPeaks: number[];
  warnings: string[];
}

export interface PhaseSelectionDiagnostics {
  movementAnalysis: MovementAnalysisDiagnostics | null;
}

// ── Signal utilities ──────────────────────────────────────────────────────────

function fillGaps(arr: (number | null)[]): number[] {
  const out = [...arr] as (number | null)[];
  for (let i = 1; i < out.length; i++) {
    if (out[i] == null && out[i - 1] != null) out[i] = out[i - 1];
  }
  for (let i = out.length - 2; i >= 0; i--) {
    if (out[i] == null && out[i + 1] != null) out[i] = out[i + 1];
  }
  return out as number[];
}

function oneEuroAlpha(cutoff: number, dt: number): number {
  return 1.0 / (1.0 + 1.0 / (2 * Math.PI * cutoff * dt));
}

function oneEuroFilter1D(
  values: (number | null)[],
  dt: number,
  minCutoff: number,
  beta: number,
  dCutoff: number,
): (number | null)[] {
  const n = values.length;
  if (n < 2) return [...values];
  const out: (number | null)[] = new Array(n);
  out[0] = values[0];
  let dxPrev = 0;
  let xPrev = values[0];
  for (let i = 1; i < n; i++) {
    const xi = values[i];
    if (xi == null || xPrev == null) { out[i] = xi; xPrev = xi; continue; }
    const dx = (xi - xPrev) / dt;
    const alphaD = oneEuroAlpha(dCutoff, dt);
    const dxHat = alphaD * dx + (1 - alphaD) * dxPrev;
    dxPrev = dxHat;
    const cutoff = minCutoff + beta * Math.abs(dxHat);
    const alpha = oneEuroAlpha(cutoff, dt);
    xPrev = alpha * xi + (1 - alpha) * xPrev;
    out[i] = xPrev;
  }
  return out;
}

function applyTemporalSmoothing(allLandmarks: (SparseLandmarks | null)[]): (SparseLandmarks | null)[] {
  const n = allLandmarks.length;
  if (n < 3) return allLandmarks;
  const DT = 1.0 / 10;
  const MIN_CUTOFF = 1.5, BETA = 0.5, D_CUTOFF = 1.0;

  const smoothed: (SparseLandmarks | null)[] = allLandmarks.map(lms =>
    lms ? lms.map(lm => lm ? { ...lm } : null) : null,
  );

  for (let li = 0; li < 33; li++) {
    const xs  = allLandmarks.map(f => f?.[li]?.x ?? null);
    const ys  = allLandmarks.map(f => f?.[li]?.y ?? null);
    const vis = allLandmarks.map(f => f?.[li]?.visibility ?? 0);
    if (xs.filter(v => v != null).length < 3) continue;

    const xS = oneEuroFilter1D(fillGaps(xs), DT, MIN_CUTOFF, BETA, D_CUTOFF);
    const yS = oneEuroFilter1D(fillGaps(ys), DT, MIN_CUTOFF, BETA, D_CUTOFF);

    for (let fi = 0; fi < n; fi++) {
      if (!smoothed[fi]?.[li] || xs[fi] == null) continue;
      const conf = vis[fi] ?? 0;
      const w = conf > 0.7 ? 0.2 : conf < 0.3 ? 0.8 : 0.2 + (0.7 - conf) * 1.5;
      smoothed[fi]![li] = {
        ...smoothed[fi]![li]!,
        x: xs[fi]! * (1 - w) + (xS[fi] ?? xs[fi]!) * w,
        y: ys[fi]! * (1 - w) + (yS[fi] ?? ys[fi]!) * w,
      };
    }
  }
  return smoothed;
}

// ── Smart phase relabeling for squats / deadlifts / landing ───────────────────

export function runSmartPhaseRelabeling(
  scanLandmarks: (SparseLandmarks | null)[],
  frames: ExtractedFrame[],
  movementType: string,
): ExtractedFrame[] {
  const isFlexion = /squat|lunge|sit/i.test(movementType);
  const isHinge   = /deadlift|hinge/i.test(movementType);
  const isLanding = /drop jump|countermovement jump|single-leg landing|tuck jump/i.test(movementType);
  if (!isFlexion && !isHinge && !isLanding) return frames;

  const v = (lms: SparseLandmarks | null, n: number) =>
    lms?.[n] && (lms[n]!.visibility ?? 0) > 0.25 ? lms[n]! : null;

  const scores = scanLandmarks.map((lms, i) => {
    if (!lms) return { i, score: null };
    const lH = v(lms, 23), lK = v(lms, 25), lA = v(lms, 27);
    const rH = v(lms, 24), rK = v(lms, 26), rA = v(lms, 28);
    const lKneeAngle = lH && lK && lA ? calcAngle(lH, lK, lA) : null;
    const rKneeAngle = rH && rK && rA ? calcAngle(rH, rK, rA) : null;
    const kneeAngle = lKneeAngle != null && rKneeAngle != null
      ? (lKneeAngle + rKneeAngle) / 2 : (lKneeAngle ?? rKneeAngle);
    const hipY = lH && rH ? (lH.y + rH.y) / 2 : lH?.y ?? rH?.y ?? null;
    const lS = v(lms, 11), rS = v(lms, 12);
    const lHA = lS && lH && lK ? calcAngle(lS, lH, lK) : null;
    const rHA = rS && rH && rK ? calcAngle(rS, rH, rK) : null;
    const hipAngle = lHA != null && rHA != null ? (lHA + rHA) / 2 : (lHA ?? rHA);

    let score: number | null = null;
    if (isFlexion || isLanding) {
      const kneeScore = kneeAngle != null ? 180 - kneeAngle : null;
      const hipScore  = hipY != null ? hipY * 180 : null;
      if (kneeScore != null && hipScore != null) score = kneeScore * 0.7 + hipScore * 0.3;
      else score = kneeScore ?? hipScore ?? null;
    } else if (isHinge) {
      score = hipAngle;
    }
    return { i, score };
  });

  let bestIdx = -1, bestVal = -Infinity;
  scores.forEach(({ i, score }) => { if (score != null && score > bestVal) { bestVal = score; bestIdx = i; } });
  if (bestIdx < 0) return frames;

  const result = frames.map(f => ({ ...f }));
  const targetId = isHinge ? 'lockout' : 'bottom';
  const canonIdx = result.findIndex(f => f.phase?.id === targetId);

  if (canonIdx >= 0 && canonIdx !== bestIdx) {
    const tmp = result[canonIdx].phase;
    result[canonIdx] = { ...result[canonIdx], phase: { ...result[bestIdx].phase, id: 'inter', label: 'Coverage', _detected: false } as PhaseLabel & { _detected: boolean } };
    result[bestIdx]  = { ...result[bestIdx],  phase: { ...tmp, id: targetId, label: isHinge ? 'Lockout' : 'Peak Flexion', _detected: true } as PhaseLabel & { _detected: boolean } };
  } else if (canonIdx === -1) {
    result[bestIdx] = {
      ...result[bestIdx],
      phase: { id: targetId, label: isHinge ? 'Lockout' : 'Peak Flexion', desc: 'Detected via pose score', fraction: result[bestIdx].phase.fraction },
    };
  }
  return result;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function selectPhaseFrames(
  frames: ExtractedFrame[],
  poseResults: PoseFrameResult[],
  movementType: string,
  options: SelectPhaseOptions = {},
): Promise<{ frames: ExtractedFrame[]; diag: PhaseSelectionDiagnostics | null }> {
  const { onProgress } = options;
  const isGait      = /running|gait|walk/i.test(movementType);
  const needsRelabel = /squat|lunge|sit|deadlift|hinge|drop jump|countermovement jump|single-leg landing|tuck jump/i.test(movementType);

  const sparseLandmarks: (SparseLandmarks | null)[] = poseResults.map(r =>
    r.poseLandmarks ? r.poseLandmarks.map(lm => ({ ...lm })) : null,
  );
  const smoothed = applyTemporalSmoothing(sparseLandmarks);

  if (!isGait && !needsRelabel) {
    const { times, labels } = getPhaseTimes(movementType);
    const used = new Set<number>();
    const selected = labels.map((phaseLabel, idx) => {
      let bestFi = -1, bestDist = Infinity;
      frames.forEach((f, fi) => {
        if (used.has(fi)) return;
        const dist = Math.abs(f.phase.fraction - times[idx]);
        if (dist < bestDist) { bestDist = dist; bestFi = fi; }
      });
      if (bestFi < 0) bestFi = 0;
      used.add(bestFi);
      return { ...frames[bestFi], phase: phaseLabel };
    });
    return { frames: selected, diag: null };
  }

  if (isGait) {
    onProgress?.(0, 'Selecting gait phase frames...');

    const fps = options.fps ?? (
      frames.length >= 2
        ? (frames.length - 1) / (frames[frames.length - 1].timestamp - frames[0].timestamp)
        : 30
    );
    const poseFrames: PoseFrame[] = frames
      .map((f, i) => {
        const lms = poseResults[i]?.poseLandmarks;
        if (!lms) return null;
        return { frameIndex: i, timestampMs: f.timestamp * 1000, landmarks: lms };
      })
      .filter((x): x is PoseFrame => x !== null);

    const result = analyzeMovement('Running', poseFrames, fps);

    const phaseMap = PHASE_MAPS['Running'] ?? [];
    const selected: ExtractedFrame[] = result.keyFrames.map(kf => {
      const phaseDef = phaseMap.find(p => p.id === kf.phaseId);
      const sideStr  = kf.side === 'left' ? 'Left' : 'Right';
      const totalMs  = (frames.at(-1)?.timestamp ?? 1) * 1000;
      return {
        ...frames[kf.frameIndex],
        phase: {
          id:       kf.phaseId,
          label:    `${sideStr} ${phaseDef?.label ?? kf.phaseId}`,
          desc:     `${sideStr} leg — ${phaseDef?.desc ?? ''}`,
          fraction: totalMs > 0 ? kf.timestampMs / totalMs : 0,
        } as PhaseLabel,
      };
    });

    const lContactPeaks = result.keyFrames
      .filter(kf => kf.phaseId === 'contact' && kf.side === 'left')
      .map(kf => kf.frameIndex);
    const rContactPeaks = result.keyFrames
      .filter(kf => kf.phaseId === 'contact' && kf.side === 'right')
      .map(kf => kf.frameIndex);

    const movementDiag: MovementAnalysisDiagnostics = {
      refLeg: result.refSide === 'left' ? 'L' : 'R',
      lContactPeaks,
      rContactPeaks,
      warnings: result.warnings,
    };

    onProgress?.(100, `Selected ${selected.length} phase frames`);
    return { frames: selected, diag: { movementAnalysis: movementDiag } };
  }

  // Non-gait smart relabeling
  onProgress?.(0, 'Detecting peak flexion / lockout frame...');
  const relabeled = runSmartPhaseRelabeling(smoothed, frames, movementType);
  const targetId = /deadlift|hinge/i.test(movementType) ? 'lockout' : 'bottom';
  const detectedIdx = relabeled.findIndex(f => f.phase.id === targetId);
  const keyFrame = detectedIdx >= 0 ? relabeled[detectedIdx] : null;

  const { times, labels } = getPhaseTimes(movementType);
  const used = new Set<number>();
  if (detectedIdx >= 0) used.add(detectedIdx);

  const selected = labels.map((phaseLabel, idx) => {
    if (phaseLabel.id === targetId && keyFrame) return keyFrame;
    let bestFi = -1, bestDist = Infinity;
    frames.forEach((f, fi) => {
      if (used.has(fi)) return;
      const dist = Math.abs(f.phase.fraction - times[idx]);
      if (dist < bestDist) { bestDist = dist; bestFi = fi; }
    });
    if (bestFi < 0) bestFi = 0;
    used.add(bestFi);
    return { ...frames[bestFi], phase: phaseLabel };
  });

  onProgress?.(100, `Selected ${selected.length} phase frames`);
  return { frames: selected, diag: null };
}

export function isPhaseSelectionAdequate(
  result: { frames: ExtractedFrame[]; diag: PhaseSelectionDiagnostics | null },
  movementType: string,
): boolean {
  if (result.frames.length < 6) return false;
  if (/running|gait|walk/i.test(movementType) && result.diag?.movementAnalysis) {
    const { lContactPeaks, rContactPeaks } = result.diag.movementAnalysis;
    return lContactPeaks.length + rContactPeaks.length >= 2;
  }
  return true;
}
