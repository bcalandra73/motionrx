/**
 * Phase selection — the step between frame extraction and MediaPipe pose detection.
 *
 * For running/gait:
 *   1. Coarse scan all dense frames with MoveNet (~8 ms/frame)
 *   2. GaitFSM finds stride events → selects 8 canonical phase frames
 *   3. MediaPipe Heavy then runs only on those 8 frames (not 64-128)
 *
 * For squats/deadlifts/landing:
 *   1. Quick scan the 8 extracted frames (MoveNet or MediaPipe)
 *   2. Smart relabeling: find true bottom/lockout by composite knee+hip score
 *
 * For everything else: pass through (frames already phase-targeted).
 */

import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs';
import type { ExtractedFrame, NormalizedLandmark, PhaseLabel } from '../types';
import { PHASE_MAPS } from '../data/phaseMaps';

// ── Types ─────────────────────────────────────────────────────────────────────

type SparseLandmarks = (NormalizedLandmark | null)[];

export interface SelectPhaseOptions {
  cameraView?: 'side' | 'front' | 'posterior';
  onProgress?: (pct: number, label: string) => void;
}

// ── MoveNet keypoint → MediaPipe landmark index map ───────────────────────────
// MoveNet: 0=nose, 5-6=shoulders, 7-8=elbows, 9-10=wrists,
//          11-12=hips, 13-14=knees, 15-16=ankles
const MOVENET_TO_MP: Record<number, number> = {
  0: 0,
  5: 11, 6: 12,
  7: 13, 8: 14,
  9: 15, 10: 16,
  11: 23, 12: 24,
  13: 25, 14: 26,
  15: 27, 16: 28,
};

// ── MoveNet init ──────────────────────────────────────────────────────────────

let _moveNetDetector: poseDetection.PoseDetector | null = null;

export async function initMoveNet(): Promise<poseDetection.PoseDetector | null> {
  if (_moveNetDetector) return _moveNetDetector;
  try {
    _moveNetDetector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER, enableSmoothing: false },
    );
    return _moveNetDetector;
  } catch (e) {
    console.warn('[MoveNet] Init failed (non-critical):', e);
    return null;
  }
}

async function runMoveNetOnImage(
  detector: poseDetection.PoseDetector,
  img: HTMLImageElement,
): Promise<poseDetection.Keypoint[] | null> {
  try {
    const poses = await detector.estimatePoses(img);
    if (!poses?.length) return null;
    return poses.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0].keypoints;
  } catch {
    return null;
  }
}

function moveNetToNormalized(
  keypoints: poseDetection.Keypoint[],
  imgW: number,
  imgH: number,
): Record<number, NormalizedLandmark> {
  const out: Record<number, NormalizedLandmark> = {};
  keypoints.forEach((kp, i) => {
    const mpIdx = MOVENET_TO_MP[i];
    if (mpIdx !== undefined) {
      out[mpIdx] = { x: kp.x / imgW, y: kp.y / imgH, z: 0, visibility: kp.score ?? 0 };
    }
  });
  return out;
}

// ── Signal utilities ──────────────────────────────────────────────────────────

function calcAngle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number | null {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (!mag) return null;
  return Math.round(Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI);
}

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

  const smoothed: (SparseLandmarks | null)[] = allLandmarks.map(lms => {
    if (!lms) return null;
    return lms.map(lm => lm ? { ...lm } : null);
  });

  for (let li = 0; li < 33; li++) {
    const xs = allLandmarks.map(f => f?.[li]?.x ?? null);
    const ys = allLandmarks.map(f => f?.[li]?.y ?? null);
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

// ── Coarse scan ───────────────────────────────────────────────────────────────

async function loadImage(base64: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 2000);
    img.onload  = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

export async function coarseScanWithMoveNet(
  detector: poseDetection.PoseDetector,
  frames: ExtractedFrame[],
  onProgress?: (pct: number, label: string) => void,
): Promise<(SparseLandmarks | null)[]> {
  const results: (SparseLandmarks | null)[] = [];

  for (let i = 0; i < frames.length; i++) {
    onProgress?.(
      Math.round((i / frames.length) * 100),
      `Scanning for gait phases — frame ${i + 1} / ${frames.length}`,
    );
    try {
      const img = await loadImage(frames[i].imageData);
      if (!img) { results.push(null); continue; }

      const kps = await Promise.race([
        runMoveNetOnImage(detector, img),
        new Promise<null>(r => setTimeout(() => r(null), 3000)),
      ]);
      if (!kps) { results.push(null); continue; }

      const mnNorm = moveNetToNormalized(kps, img.width, img.height);
      const arr: SparseLandmarks = Array.from({ length: 33 }, (_, idx) => mnNorm[idx] ?? null);
      results.push(arr);
    } catch (e) {
      console.warn('[CoarseScan] Frame', i, 'error:', e);
      results.push(null);
    }
  }

  return applyTemporalSmoothing(results);
}

// ── GaitFSM — select 8 canonical phase frames from dense coarse scan ──────────

interface PerFrameData {
  fi: number;
  t: number;
  lAnkY: number | null; rAnkY: number | null;
  lAnkX: number | null; rAnkX: number | null;
  noseX: number | null;
  lKnee: number | null; rKnee: number | null;
  lHip:  number | null; rHip:  number | null;
  hipMidX: number | null; hipMidY: number | null;
}

function smooth5(arr: (number | null)[]): (number | null)[] {
  return arr.map((v, i) => {
    if (v == null) return null;
    const pts: number[] = [], ws: number[] = [];
    for (let d = -2; d <= 2; d++) {
      const idx = i + d;
      if (idx >= 0 && idx < arr.length && arr[idx] != null) {
        pts.push(arr[idx]!);
        ws.push(d === 0 ? 2 : Math.abs(d) === 1 ? 1.5 : 1);
      }
    }
    if (!pts.length) return null;
    return pts.reduce((s, val, j) => s + val * ws[j], 0) / ws.reduce((s, w) => s + w, 0);
  });
}

function normSig(arr: (number | null)[]): (number | null)[] {
  const vals = arr.filter(v => v != null) as number[];
  if (vals.length < 2) return arr.map(() => null);
  const lo = Math.min(...vals), hi = Math.max(...vals), range = hi - lo;
  if (range < 0.001) return arr.map(v => v != null ? 0.5 : null);
  return arr.map(v => v != null ? (v - lo) / range : null);
}

function localMaxima(arr: (number | null)[], minProm: number): number[] {
  const peaks: number[] = [];
  for (let i = 1; i < arr.length - 1; i++) {
    if (arr[i] == null) continue;
    const prev = arr.slice(Math.max(0, i - 2), i).filter(x => x != null) as number[];
    const next = arr.slice(i + 1, Math.min(arr.length, i + 3)).filter(x => x != null) as number[];
    if (!prev.length || !next.length) continue;
    if (arr[i]! > Math.max(...prev) && arr[i]! > Math.max(...next)) {
      if (arr[i]! - Math.min(...prev, ...next) >= minProm) peaks.push(i);
    }
  }
  if (!peaks.length) {
    let best = -Infinity, bi = 0;
    arr.forEach((v, i) => { if (v != null && v > best) { best = v; bi = i; } });
    peaks.push(bi);
  }
  return peaks;
}

function argMinR(arr: (number | null)[], from: number, to: number): number {
  let best = Infinity, bi = from;
  for (let i = from; i <= to && i < arr.length; i++) {
    if (arr[i] != null && arr[i]! < best) { best = arr[i]!; bi = i; }
  }
  return bi;
}

function argMaxR(arr: (number | null)[], from: number, to: number): number {
  let best = -Infinity, bi = from;
  for (let i = from; i <= to && i < arr.length; i++) {
    if (arr[i] != null && arr[i]! > best) { best = arr[i]!; bi = i; }
  }
  return bi;
}

export function runGaitFSM(
  coarseLandmarks: (SparseLandmarks | null)[],
  frames: ExtractedFrame[],
  proportions: number[],
  cameraView: 'side' | 'front' | 'posterior' = 'side',
): ExtractedFrame[] {
  const v = (lms: SparseLandmarks | null, n: number) =>
    lms?.[n] && (lms[n]!.visibility ?? 0) > 0.18 ? lms[n]! : null;

  // a) Per-frame kinematics
  const perFrame: PerFrameData[] = coarseLandmarks.map((lms, fi) => {
    if (!lms) return null as unknown as PerFrameData;
    const lH = v(lms, 23), lK = v(lms, 25), lA = v(lms, 27);
    const rH = v(lms, 24), rK = v(lms, 26), rA = v(lms, 28);
    const nose = v(lms, 0);
    return {
      fi,
      t: proportions[fi] ?? fi / Math.max(1, coarseLandmarks.length - 1),
      lAnkY: lA?.y ?? null, rAnkY: rA?.y ?? null,
      lAnkX: lA?.x ?? null, rAnkX: rA?.x ?? null,
      noseX: nose?.x ?? null,
      lKnee: lH && lK && lA ? calcAngle(lH, lK, lA) : null,
      rKnee: rH && rK && rA ? calcAngle(rH, rK, rA) : null,
      lHip: (lH && lK && lK.y - lH.y > -0.10)
        ? Math.min(90, Math.round(Math.atan2(Math.abs(lK.x - lH.x), lK.y - lH.y) * 180 / Math.PI)) : null,
      rHip: (rH && rK && rK.y - rH.y > -0.10)
        ? Math.min(90, Math.round(Math.atan2(Math.abs(rK.x - rH.x), rK.y - rH.y) * 180 / Math.PI)) : null,
      hipMidX: (lH && rH) ? (lH.x + rH.x) / 2 : lH?.x ?? rH?.x ?? null,
      hipMidY: (lH && rH) ? (lH.y + rH.y) / 2 : lH?.y ?? rH?.y ?? null,
    };
  }).filter(Boolean) as PerFrameData[];

  if (perFrame.length < 4) return frames.slice(0, 8);
  perFrame.sort((a, b) => a.t - b.t);
  const N = perFrame.length;

  // b) Smooth signals
  const lAnkS  = smooth5(perFrame.map(f => f.lAnkY));
  const rAnkS  = smooth5(perFrame.map(f => f.rAnkY));
  const lKneeS = smooth5(perFrame.map(f => f.lKnee));
  const rKneeS = smooth5(perFrame.map(f => f.rKnee));
  const lHipS  = smooth5(perFrame.map(f => f.lHip));
  const rHipS  = smooth5(perFrame.map(f => f.rHip));

  // c) Composite contact signal
  const lAnkRange = (() => { const v2 = lAnkS.filter(x => x != null) as number[]; return v2.length > 1 ? Math.max(...v2) - Math.min(...v2) : 0; })();
  const rAnkRange = (() => { const v2 = rAnkS.filter(x => x != null) as number[]; return v2.length > 1 ? Math.max(...v2) - Math.min(...v2) : 0; })();
  const ankWeak = (lAnkRange + rAnkRange) / 2 < 0.04;
  const wA = ankWeak ? 0.30 : 0.55, wK = ankWeak ? 0.70 : 0.45;
  const lAnkN = normSig(lAnkS), rAnkN = normSig(rAnkS);
  const lKnN  = normSig(lKneeS), rKnN = normSig(rKneeS);
  const mkComp = (aN: (number | null)[], kN: (number | null)[]) =>
    aN.map((_, i) => {
      const a = aN[i], k = kN[i];
      if (a == null && k == null) return null;
      const wa = a != null ? wA : 0, wk = k != null ? wK : 0, ws = wa + wk;
      if (ws < 0.1) return null;
      return ((a ?? 0.5) * wa + (k ?? 0.5) * wk) / ws;
    });
  const lComp = mkComp(lAnkN, lKnN);
  const rComp = mkComp(rAnkN, rKnN);
  const compRange = (() => {
    const all = [...lComp, ...rComp].filter(v => v != null) as number[];
    return all.length > 3 ? Math.max(...all) - Math.min(...all) : 0.12;
  })();
  const minProm = Math.max(0.08, compRange * 0.15);

  // d) REF leg — pick whichever has more contact events
  const lContacts = localMaxima(lComp, minProm);
  const rContacts = localMaxima(rComp, minProm);
  const lVis = lAnkS.filter(v => v != null).length;
  const rVis = rAnkS.filter(v => v != null).length;
  const switchToR = (rVis > lVis * 1.2) && (rContacts.length > lContacts.length);
  const REF = switchToR ? 'R' : 'L';
  const refAnkS  = REF === 'L' ? lAnkS  : rAnkS;
  const refKneeS = REF === 'L' ? lKneeS : rKneeS;
  const refHipS  = REF === 'L' ? lHipS  : rHipS;
  const oppAnkS  = REF === 'L' ? rAnkS  : lAnkS;
  const oppKneeS = REF === 'L' ? rKneeS : lKneeS;
  const oppHipS  = REF === 'L' ? rHipS  : lHipS;
  const refC     = REF === 'L' ? lContacts : rContacts;
  const oppC     = REF === 'L' ? rContacts : lContacts;

  // e) Facing direction (nose relative to hip midpoint)
  const noseDisps = perFrame.map(f => {
    const nx = f.noseX, hx = f.hipMidX;
    return nx != null && hx != null ? nx - hx : null;
  }).filter(v => v != null) as number[];
  const noseMean = noseDisps.length > 0
    ? noseDisps.reduce((s, v) => s + v, 0) / noseDisps.length : 0;
  const icIsMin = noseMean < 0;

  const refAnkFwdS = smooth5(perFrame.map(f => {
    const ax = REF === 'L' ? f.lAnkX : f.rAnkX;
    if (ax == null || f.hipMidX == null) return null;
    return icIsMin ? -(ax - f.hipMidX) : (ax - f.hipMidX);
  }));

  // f) Stride cycle bounds
  let cycleStart: number, cycleEnd: number;
  if (refC.length >= 2) { cycleStart = refC[0]; cycleEnd = refC[1]; }
  else if (refC.length === 1) {
    cycleStart = Math.max(0, refC[0] - 1);
    cycleEnd   = Math.min(N - 1, refC[0] + Math.round(N * 0.7));
  } else { cycleStart = 0; cycleEnd = N - 1; }
  const cycleLen = Math.max(2, cycleEnd - cycleStart);
  const r0 = cycleStart;

  // g) Detect phase events within cycle
  const refLoadingIdx = r0;

  const icSt = Math.max(0, r0 - Math.round(cycleLen * 0.18));
  const icEd = Math.max(icSt + 1, r0 - Math.round(cycleLen * 0.01));
  let refContactIdx = Math.max(0, r0 - Math.round(cycleLen * 0.08));
  if (icEd > icSt) {
    if (cameraView === 'side' && refAnkFwdS.some(v => v != null)) {
      const icKN = normSig(refKneeS.slice(icSt, icEd + 1));
      const icFN = normSig(refAnkFwdS.slice(icSt, icEd + 1));
      const icScore = icKN.map((k, ii) => {
        const f = icFN[ii];
        if (k == null && f == null) return null;
        return (k ?? 0.5) * 0.55 + (f ?? 0.5) * 0.45;
      });
      let bestScore = -Infinity;
      icScore.forEach((s, ii) => { if (s != null && s > bestScore) { bestScore = s; refContactIdx = icSt + ii; } });
      if (refContactIdx >= r0) refContactIdx = Math.max(0, r0 - Math.round(cycleLen * 0.08));
    } else {
      refContactIdx = argMaxR(refKneeS, icSt, icEd);
    }
  }

  const refMidstIdx = (() => {
    if (cameraView === 'side') {
      const st = Math.min(N - 1, r0 + Math.round(cycleLen * 0.08));
      const ed = Math.min(N - 1, r0 + Math.round(cycleLen * 0.20));
      const slice = refAnkFwdS.slice(st, ed);
      let minAbs = Infinity, minOff = 0;
      slice.forEach((v, ii) => { if (v != null && Math.abs(v) < minAbs) { minAbs = Math.abs(v); minOff = ii; } });
      if (minAbs < Infinity) return Math.min(N - 1, st + minOff);
    }
    return Math.min(N - 1, r0 + Math.round(cycleLen * 0.13));
  })();

  const toSt = Math.min(N - 1, r0 + Math.round(cycleLen * 0.34));
  const toEd = Math.min(N - 1, r0 + Math.round(cycleLen * 0.44));
  const refToeoffIdx = toSt < toEd
    ? argMinR(refHipS, toSt, toEd)
    : Math.min(N - 1, r0 + Math.round(cycleLen * 0.39));

  const refPropIdx = Math.min(N - 1, r0 + Math.round(cycleLen * 0.27));

  const mswSt = Math.min(N - 1, r0 + Math.round(cycleLen * 0.56));
  const mswEd = Math.min(N - 1, r0 + Math.round(cycleLen * 0.74));
  const refMidswingIdx = mswSt < mswEd
    ? argMinR(refAnkS, mswSt, mswEd)
    : Math.min(N - 1, r0 + Math.round(cycleLen * 0.64));

  const oppEswSt = Math.min(N - 1, r0 + Math.round(cycleLen * 0.44));
  const oppEswEd = Math.min(N - 1, r0 + Math.round(cycleLen * 0.59));
  const oppContactIdx = oppC.length > 0
    ? oppC.reduce((b, c) => { const tgt = r0 + Math.round(cycleLen * 0.51); return Math.abs(c - tgt) < Math.abs(b - tgt) ? c : b; }, oppC[0])
    : oppEswSt < oppEswEd ? argMaxR(oppAnkS, oppEswSt, oppEswEd) : Math.min(N - 1, r0 + Math.round(cycleLen * 0.51));

  const oppLswSt = Math.min(N - 1, r0 + Math.round(cycleLen * 0.68));
  const oppLswEd = Math.min(N - 1, r0 + Math.round(cycleLen * 0.86));
  const oppToeoffIdx = oppLswSt < oppLswEd
    ? argMinR(oppHipS, oppLswSt, oppLswEd)
    : Math.min(N - 1, r0 + Math.round(cycleLen * 0.78));

  // h) Build timeline with detected events
  const timeline: Array<{ i: number; phaseId: string }> = [
    { i: refContactIdx,  phaseId: 'contact' },
    { i: refLoadingIdx,  phaseId: 'loading' },
    { i: refMidstIdx,    phaseId: 'midstance' },
    { i: refPropIdx,     phaseId: 'propulsion' },
    { i: refToeoffIdx,   phaseId: 'toeoff' },
    { i: oppContactIdx,  phaseId: 'earlyswing' },
    { i: refMidswingIdx, phaseId: 'midswing' },
    { i: oppToeoffIdx,   phaseId: 'lateswing' },
  ];

  // i) Select 8 gallery frames — one per canonical phase window
  const runningPhases = PHASE_MAPS['Running'] ?? [];
  const phaseOrder = runningPhases.map(p => p.id);
  const eventIndexMap: Record<string, number> = {};
  timeline.forEach(ev => { if (!eventIndexMap[ev.phaseId]) eventIndexMap[ev.phaseId] = ev.i; });

  const cycleFrameN = cycleEnd - cycleStart + 1;
  const usedFisGal = new Set<number>();
  const dedupedFrames: ExtractedFrame[] = [];

  for (let pi = 0; pi < runningPhases.length && dedupedFrames.length < 8; pi++) {
    const ph = runningPhases[pi];
    const nextPh = runningPhases[pi + 1];
    const detectedIdx = eventIndexMap[ph.id];

    let idealLi: number, fMin: number, fMax: number;
    if (detectedIdx != null) {
      const halfWin = Math.max(1, Math.round(cycleFrameN * 0.08));
      fMin    = Math.max(cycleStart, detectedIdx - halfWin);
      fMax    = Math.min(cycleEnd,   detectedIdx + halfWin);
      idealLi = detectedIdx;
    } else {
      fMin    = cycleStart + Math.floor(ph.time * cycleFrameN);
      fMax    = cycleStart + Math.ceil((nextPh?.time ?? 1.0) * cycleFrameN);
      idealLi = cycleStart + Math.round(((ph.time + (nextPh?.time ?? 1.0)) / 2) * cycleFrameN);
    }

    let candidates = perFrame
      .map((fd, li) => ({ fd, li }))
      .filter(({ fd, li }) => li >= fMin && li <= fMax && !usedFisGal.has(fd.fi));

    if (!candidates.length) {
      const nearest = perFrame
        .map((fd, li) => ({ fd, li, dist: Math.abs(li - idealLi) }))
        .filter(c => !usedFisGal.has(c.fd.fi))
        .sort((a, b) => a.dist - b.dist)[0];
      if (!nearest) continue;
      candidates = [nearest];
    }

    const keySet = new Set(timeline.map(e => e.i));
    const detected = candidates.filter(c => keySet.has(c.li));
    const pool = detected.length > 0 ? detected : candidates;
    const best = pool.reduce((acc, cur) =>
      Math.abs(cur.li - idealLi) < Math.abs(acc.li - idealLi) ? cur : acc,
    );

    const sideStr = REF === 'L' ? 'Left' : 'Right';
    const phLabel: PhaseLabel = {
      id: ph.id, label: `${sideStr} ${ph.label}`, desc: `${sideStr} leg — ${ph.desc}`,
      fraction: perFrame[best.li]?.t ?? ph.time,
      _footStrike: undefined,
    };

    usedFisGal.add(best.fd.fi);
    dedupedFrames.push({ ...frames[best.fd.fi], phase: phLabel });
  }

  // Sort by canonical phase order
  dedupedFrames.sort((a, b) =>
    phaseOrder.indexOf(a.phase?.id ?? '') - phaseOrder.indexOf(b.phase?.id ?? ''),
  );

  return dedupedFrames.slice(0, 8);
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
  scores.forEach(({ i, score }) => {
    if (score != null && score > bestVal) { bestVal = score; bestIdx = i; }
  });

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
      phase: { id: targetId, label: isHinge ? 'Lockout' : 'Peak Flexion', desc: `Detected via pose score`, fraction: result[bestIdx].phase.fraction },
    };
  }

  return result;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function selectPhaseFrames(
  frames: ExtractedFrame[],
  movementType: string,
  options: SelectPhaseOptions = {},
): Promise<ExtractedFrame[]> {
  const { cameraView = 'side', onProgress } = options;
  const isGait = /running|gait|walk/i.test(movementType);
  const needsRelabel = /squat|lunge|sit|deadlift|hinge|drop jump|countermovement jump|single-leg landing|tuck jump/i.test(movementType);

  if (!isGait && !needsRelabel) return frames; // already phase-targeted, no scan needed

  onProgress?.(0, 'Initialising coarse scan model...');
  const detector = await initMoveNet();

  if (isGait) {
    if (!detector) {
      // MoveNet unavailable: subsample to 16 frames and return — full MediaPipe will run on all
      console.warn('[PhaseSelection] MoveNet unavailable for gait — using 16-frame subsample');
      const step = Math.max(1, Math.floor(frames.length / 16));
      const fallback = frames.filter((_, i) => i % step === 0).slice(0, 16);
      onProgress?.(100, `Phase selection complete — ${fallback.length} frames (MoveNet unavailable)`);
      return fallback;
    }

    const proportions = frames.map((_, i) => i / Math.max(1, frames.length - 1));
    const coarse = await coarseScanWithMoveNet(detector, frames, (pct, label) => {
      onProgress?.(Math.round(pct * 0.9), label);
    });
    onProgress?.(90, 'Running GaitFSM frame selection...');
    const selected = runGaitFSM(coarse, frames, proportions, cameraView);
    onProgress?.(100, `Selected ${selected.length} phase frames`);
    return selected;
  }

  // Non-gait smart relabeling: coarse scan all 8 frames
  const coarse = detector
    ? await coarseScanWithMoveNet(detector, frames, (pct, label) => {
        onProgress?.(Math.round(pct * 0.9), label);
      })
    : frames.map(() => null);

  onProgress?.(90, 'Detecting peak flexion / lockout frame...');
  const relabeled = runSmartPhaseRelabeling(coarse, frames, movementType);
  onProgress?.(100, 'Phase labels refined');
  return relabeled;
}
