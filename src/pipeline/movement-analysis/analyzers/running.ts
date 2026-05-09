import type { MovementAnalyzer, MovementAnalysisResult, PoseFrame, KeyFrame, Side } from '../types';
import { LM } from '../signal/landmarks';
import { interpolateLowVisibility } from '../signal/interpolate';
import { lowPassFilter } from '../signal/filter';
import { findPeaks, findTroughs } from '../signal/peaks';

// ── Signal extraction helpers ────────────────────────────────────────────────

function extractSignal(
  frames: PoseFrame[],
  lmIndex: number,
  component: 'x' | 'y',
): { values: number[]; visibilities: number[] } {
  return {
    values: frames.map(f => f.landmarks[lmIndex]?.[component] ?? 0),
    visibilities: frames.map(f => f.landmarks[lmIndex]?.visibility ?? 0),
  };
}

function prepareSignal(
  raw: number[],
  vis: number[],
  fps: number,
  warnings: string[],
  label: string,
): { signal: number[]; gapsTooLarge: number[] } {
  const { values: interp, gapsTooLarge } = interpolateLowVisibility(raw, vis);
  if (gapsTooLarge.length > 0) {
    warnings.push(`UNINTERPOLABLE_GAP:${label}:${gapsTooLarge[0]}-${gapsTooLarge[gapsTooLarge.length - 1]}`);
  }
  const filtered = lowPassFilter(interp, fps);
  return { signal: filtered, gapsTooLarge };
}

// ── Direction detection ──────────────────────────────────────────────────────

function detectForwardSign(frames: PoseFrame[]): { sign: 1 | -1; ambiguous: boolean } {
  // Primary: nose is in front of the ears in a side-on view.
  // nose.x > ear.x → facing right (+1); nose.x < ear.x → facing left (-1).
  let faceSum = 0;
  let faceCount = 0;
  for (const f of frames) {
    const nose = f.landmarks[LM.NOSE];
    if (!nose || (nose.visibility ?? 0) < 0.3) continue;
    const lEar = f.landmarks[LM.LEFT_EAR];
    const rEar = f.landmarks[LM.RIGHT_EAR];
    const ears = [lEar, rEar].filter(e => e && (e.visibility ?? 0) >= 0.3) as typeof lEar[];
    if (ears.length === 0) continue;
    const earX = ears.reduce((s, e) => s + e!.x, 0) / ears.length;
    faceSum += nose.x - earX;
    faceCount++;
  }
  if (faceCount >= Math.ceil(frames.length * 0.2)) {
    const mean = faceSum / faceCount;
    if (Math.abs(mean) >= 0.01) return { sign: mean > 0 ? 1 : -1, ambiguous: false };
  }

  // Fallback: foot-index ahead of heel in direction of travel.
  let footSum = 0;
  let footCount = 0;
  for (const f of frames) {
    const lHeel = f.landmarks[LM.LEFT_HEEL];
    const lFoot = f.landmarks[LM.LEFT_FOOT_INDEX];
    const rHeel = f.landmarks[LM.RIGHT_HEEL];
    const rFoot = f.landmarks[LM.RIGHT_FOOT_INDEX];
    if (lHeel && lFoot) { footSum += lFoot.x - lHeel.x; footCount++; }
    if (rHeel && rFoot) { footSum += rFoot.x - rHeel.x; footCount++; }
  }
  if (footCount === 0) return { sign: 1, ambiguous: true };
  const footMean = footSum / footCount;
  if (Math.abs(footMean) < 0.01) return { sign: 1, ambiguous: true };
  return { sign: footMean > 0 ? 1 : -1, ambiguous: false };
}

// ── Zero-crossing finder ─────────────────────────────────────────────────────

function findZeroCrossing(signal: number[], from: number, to: number): number {
  for (let i = from; i < to - 1 && i < signal.length - 1; i++) {
    if (signal[i] >= 0 && signal[i + 1] < 0) {
      // Linear interpolation
      const t = signal[i] / (signal[i] - signal[i + 1]);
      return Math.round(i + t) < i + 1 ? i : i + 1;
    }
  }
  // No crossing found — return midpoint
  return Math.round((from + to) / 2);
}

// ── Visibility check ─────────────────────────────────────────────────────────

function meanVisibility(frames: PoseFrame[], lmIndex: number, center: number, half = 3): number {
  let sum = 0;
  let n = 0;
  for (let i = Math.max(0, center - half); i <= Math.min(frames.length - 1, center + half); i++) {
    sum += frames[i].landmarks[lmIndex]?.visibility ?? 0;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

// ── Confidence scoring ───────────────────────────────────────────────────────

function computeConfidence(
  frames: PoseFrame[],
  lmIndex: number,
  frameIdx: number,
  prominence: number,
  medianProminence: number,
): number {
  const visScore = Math.min(1, meanVisibility(frames, lmIndex, frameIdx) / 0.8);
  const promScore = medianProminence > 0 ? Math.min(1, prominence / medianProminence) : 0.5;
  return 0.5 * visScore + 0.5 * promScore;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ── Main analyzer ────────────────────────────────────────────────────────────

export const runningAnalyzer: MovementAnalyzer = {
  movementType: 'Running',

  analyze(frames: PoseFrame[], fps: number): MovementAnalysisResult {
    const warnings: string[] = [];
    const n = frames.length;

    if (fps < 60) warnings.push('LOW_FPS');

    // Step 1 — Pelvis-relative position signals
    const pelvisX = frames.map(f => {
      const lh = f.landmarks[LM.LEFT_HIP];
      const rh = f.landmarks[LM.RIGHT_HIP];
      return lh && rh ? (lh.x + rh.x) / 2 : (lh?.x ?? rh?.x ?? 0.5);
    });

    // Step 2 — Forward direction
    const { sign: fwdSign, ambiguous } = detectForwardSign(frames);
    if (ambiguous) warnings.push('AMBIGUOUS_DIRECTION');

    // Check mean visibility of key landmarks
    for (const [label, idx] of [
      ['LEFT_HEEL', LM.LEFT_HEEL], ['RIGHT_HEEL', LM.RIGHT_HEEL],
      ['LEFT_FOOT_INDEX', LM.LEFT_FOOT_INDEX], ['RIGHT_FOOT_INDEX', LM.RIGHT_FOOT_INDEX],
      ['LEFT_ANKLE', LM.LEFT_ANKLE], ['RIGHT_ANKLE', LM.RIGHT_ANKLE],
    ] as [string, number][]) {
      const meanVis = frames.reduce((s, f) => s + (f.landmarks[idx]?.visibility ?? 0), 0) / n;
      if (meanVis < 0.5) warnings.push(`LOW_VISIBILITY:${label}`);
    }

    // Build per-side signals
    const sides: Side[] = ['left', 'right'];
    const heelIdx = { left: LM.LEFT_HEEL, right: LM.RIGHT_HEEL };
    const toeIdx  = { left: LM.LEFT_FOOT_INDEX, right: LM.RIGHT_FOOT_INDEX };
    const ankIdx  = { left: LM.LEFT_ANKLE, right: LM.RIGHT_ANKLE };

    type SideSignals = {
      heelFwd: number[];
      toeFwd: number[];
      ankleFwd: number[];
    };

    const sideSignals: Record<Side, SideSignals> = { left: null!, right: null! };

    for (const side of sides) {
      const heel = extractSignal(frames, heelIdx[side], 'x');
      const toe  = extractSignal(frames, toeIdx[side],  'x');
      const ank  = extractSignal(frames, ankIdx[side],  'x');

      const { signal: heelS } = prepareSignal(heel.values, heel.visibilities, fps, warnings, `${side.toUpperCase()}_HEEL`);
      const { signal: toeS }  = prepareSignal(toe.values,  toe.visibilities,  fps, warnings, `${side.toUpperCase()}_FOOT_INDEX`);
      const { signal: ankS }  = prepareSignal(ank.values,  ank.visibilities,  fps, warnings, `${side.toUpperCase()}_ANKLE`);

      // Steps 3+4 — sign-correct and make pelvis-relative
      sideSignals[side] = {
        heelFwd:  heelS.map((v, i) => fwdSign * (v - pelvisX[i])),
        toeFwd:   toeS.map((v, i)  => fwdSign * (v - pelvisX[i])),
        ankleFwd: ankS.map((v, i)  => fwdSign * (v - pelvisX[i])),
      };
    }

    // Step 5 — Detect IC (heel peaks) and TO (toe troughs) per side
    const minDist = Math.round(fps * 0.25);
    const minProm = 0.02;

    type Events = { ic: ReturnType<typeof findPeaks>; to: ReturnType<typeof findTroughs> };
    const events: Record<Side, Events> = { left: null!, right: null! };

    for (const side of sides) {
      const ic = findPeaks(sideSignals[side].heelFwd,  { minDistance: minDist, minProminence: minProm });
      const to = findTroughs(sideSignals[side].toeFwd, { minDistance: minDist, minProminence: minProm });
      events[side] = { ic, to };
    }

    // Determine ref side: whichever has greater total IC prominence (quality × quantity).
    // Interpolation-filled gaps produce flatter, lower-prominence peaks, so the occluded
    // leg naturally loses even if it happens to have an equal or higher raw peak count.
    // Ties → left.
    const leftScore  = events.left.ic.reduce((s, p) => s + p.prominence, 0);
    const rightScore = events.right.ic.reduce((s, p) => s + p.prominence, 0);
    const refSide: Side = leftScore >= rightScore ? 'left' : 'right';
    const oppSide: Side = refSide === 'left' ? 'right' : 'left';

    if (events[refSide].ic.length < 2) warnings.push('FEW_STRIDES');

    // Step 6 — Derive all 8 phase frames from the first complete stride
    const keyFrames: KeyFrame[] = [];

    const refIC = events[refSide].ic;
    const refTO = events[refSide].to;
    const oppIC = events[oppSide].ic;
    const oppTO = events[oppSide].to;

    if (refIC.length === 0) {
      // Degenerate: return uniform fallback
      const step = Math.floor(n / 8);
      const phases: [string, Side][] = [
        ['contact','left'],['loading','left'],['midstance','left'],['propulsion','left'],
        ['toeoff','left'],['earlyswing','right'],['midswing','left'],['lateswing','right'],
      ];
      phases.forEach(([phaseId, side], i) => {
        keyFrames.push({ frameIndex: Math.min(i * step, n - 1), timestampMs: frames[Math.min(i * step, n - 1)].timestampMs, phaseId: phaseId as never, side, confidence: 0 });
      });
      return { keyFrames, warnings, refSide };
    }

    // Use first IC as cycle start
    const ic0 = refIC[0];
    // Stride length: IC[0] → IC[1] if available
    const strideLen = refIC.length >= 2 ? refIC[1].index - refIC[0].index : Math.round(fps * 0.55);

    // Ref IC → contact
    const medIcProm = median(refIC.map(p => p.prominence));
    const contactIdx = ic0.index;
    keyFrames.push({
      frameIndex: contactIdx,
      timestampMs: frames[Math.min(contactIdx, n - 1)].timestampMs,
      phaseId: 'contact',
      side: refSide,
      confidence: computeConfidence(frames, heelIdx[refSide], contactIdx, ic0.prominence, medIcProm),
    });

    // Loading: IC + ~8% of stride
    const loadingIdx = Math.min(n - 1, Math.round(contactIdx + strideLen * 0.08));
    keyFrames.push({
      frameIndex: loadingIdx,
      timestampMs: frames[loadingIdx].timestampMs,
      phaseId: 'loading',
      side: refSide,
      confidence: 0.5,
    });

    // First ref TO after IC
    const refTOafter = refTO.find(t => t.index > contactIdx) ?? refTO[0];
    const toIdx = refTOafter ? Math.min(n - 1, refTOafter.index) : Math.min(n - 1, Math.round(contactIdx + strideLen * 0.6));

    // Midstance: ankle zero-crossing between IC and TO
    const msFrom = contactIdx;
    const msTo   = Math.min(toIdx, n - 1);
    const midstanceIdx = findZeroCrossing(sideSignals[refSide].ankleFwd, msFrom, msTo);
    const clampedMs = Math.min(n - 1, midstanceIdx);
    keyFrames.push({
      frameIndex: clampedMs,
      timestampMs: frames[clampedMs].timestampMs,
      phaseId: 'midstance',
      side: refSide,
      confidence: 0.6,
    });

    // Propulsion: midpoint(midstance → TO)
    const propIdx = Math.min(n - 1, Math.round((clampedMs + toIdx) / 2));
    keyFrames.push({
      frameIndex: propIdx,
      timestampMs: frames[propIdx].timestampMs,
      phaseId: 'propulsion',
      side: refSide,
      confidence: 0.5,
    });

    // Toeoff
    const medToProm = median(refTO.map(p => p.prominence));
    keyFrames.push({
      frameIndex: toIdx,
      timestampMs: frames[toIdx].timestampMs,
      phaseId: 'toeoff',
      side: refSide,
      confidence: refTOafter
        ? computeConfidence(frames, toeIdx[refSide], toIdx, refTOafter.prominence, medToProm)
        : 0.4,
    });

    // Earlyswing: nearest opp IC to ~51% of stride. OIC and TO are nearly coincident in
    // running (~50% of stride), so the nearest OIC may land on the same frame or just before
    // toeoff. Clamp to toIdx+1 to guarantee earlyswing follows toeoff without skipping to
    // the next stride's OIC.
    const targetEarly = Math.round(contactIdx + strideLen * 0.51);
    const earlyOppIC = oppIC.length > 0
      ? oppIC.reduce((best, cur) => Math.abs(cur.index - targetEarly) < Math.abs(best.index - targetEarly) ? cur : best)
      : null;
    const earlyIdx = Math.min(n - 1, Math.max(earlyOppIC?.index ?? targetEarly, toIdx + 1));
    const medOppIcProm = median(oppIC.map(p => p.prominence));
    keyFrames.push({
      frameIndex: earlyIdx,
      timestampMs: frames[earlyIdx].timestampMs,
      phaseId: 'earlyswing',
      side: refSide,
      confidence: earlyOppIC
        ? computeConfidence(frames, heelIdx[oppSide], earlyIdx, earlyOppIC.prominence, medOppIcProm)
        : 0.3,
    });

    // Midswing: ankle minimum in swing window (start 1 frame past TO → end of stride)
    const swingEnd = Math.min(n - 1, contactIdx + strideLen);
    const swingStart = Math.min(toIdx + 1, swingEnd);
    let midswingIdx = swingStart;
    let minAnk = Infinity;
    for (let i = swingStart; i <= swingEnd; i++) {
      if (sideSignals[refSide].ankleFwd[i] < minAnk) {
        minAnk = sideSignals[refSide].ankleFwd[i];
        midswingIdx = i;
      }
    }
    const clampedMsw = Math.min(n - 1, midswingIdx);
    keyFrames.push({
      frameIndex: clampedMsw,
      timestampMs: frames[clampedMsw].timestampMs,
      phaseId: 'midswing',
      side: refSide,
      confidence: 0.5,
    });

    // Lateswing: nearest opp TO after TO
    const oppTOafter = oppTO.find(t => t.index > toIdx) ?? oppTO[oppTO.length - 1];
    const lateIdx = Math.min(n - 1, oppTOafter?.index ?? Math.round(contactIdx + strideLen * 0.85));
    const medOppToProm = median(oppTO.map(p => p.prominence));
    keyFrames.push({
      frameIndex: lateIdx,
      timestampMs: frames[lateIdx].timestampMs,
      phaseId: 'lateswing',
      side: refSide,
      confidence: oppTOafter
        ? computeConfidence(frames, toeIdx[oppSide], lateIdx, oppTOafter.prominence, medOppToProm)
        : 0.3,
    });

    keyFrames.sort((a, b) => a.frameIndex - b.frameIndex);

    // Ensure no duplicate frameIndex values: nudge later colliding frames forward by 1
    for (let i = 1; i < keyFrames.length; i++) {
      if (keyFrames[i].frameIndex <= keyFrames[i - 1].frameIndex) {
        keyFrames[i].frameIndex = Math.min(n - 1, keyFrames[i - 1].frameIndex + 1);
        keyFrames[i].timestampMs = frames[keyFrames[i].frameIndex].timestampMs;
      }
    }

    return { keyFrames, warnings, refSide };
  },
};
