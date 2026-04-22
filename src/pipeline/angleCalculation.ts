/**
 * Joint angle extraction and aggregation.
 *
 * extractAngles()   — computes all relevant angles for a single frame
 * aggregateAngles() — reduces an array of per-frame angle objects to { min, max, avg } stats
 * mergeWorldLandmarks() — combines NormalizedLandmark[] + WorldLandmark[] into LandmarkWithWorld[]
 */

import type { NormalizedLandmark, PhaseLabel, WorldLandmark } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Normalized landmark enriched with metric-space world coordinates.
 *  World coords are hip-centred in metres: X=right, Y=down, Z=toward camera (negative=forward).
 */
export interface LandmarkWithWorld {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number; // PoseLandmarker API — is landmark in frame? (falls back to 1.0 when absent)
  _wx: number | null;
  _wy: number | null;
  _wz: number | null;
}

export interface AngleStat {
  min: number;
  max: number;
  avg: number;
  count: number;
  hitRate: number;       // % of frames that produced a value (0–100)
  lowConfidence: boolean; // true when hitRate < 40%
}

export interface RefRange {
  min?: number;
  max?: number;
  warn?: number;
  ok?: number;
  ideal?: [number, number];
  label: string;
}

// ── Reference ranges ──────────────────────────────────────────────────────────

export const REF_RANGES: Record<string, RefRange> = {
  'Left Knee Flexion':        { min: 0, warn: 30, ok: 60,    label: 'Normal: 0–140°' },
  'Right Knee Flexion':       { min: 0, warn: 30, ok: 60,    label: 'Normal: 0–140°' },
  'Left Hip Flexion':         { min: 60, warn: 45, ok: 60,   label: 'Normal hip hinge: 60–90°' },
  'Right Hip Flexion':        { min: 60, warn: 45, ok: 60,   label: 'Normal hip hinge: 60–90°' },
  'Trunk Lean':               { max: 20, warn: 30,            label: 'Normal: <20° from vertical' },
  'Left Ankle Dorsiflexion':  { ideal: [10, 30], warn: 5,    label: 'Normal: +10 to +30° from neutral' },
  'Right Ankle Dorsiflexion': { ideal: [10, 30], warn: 5,    label: 'Normal: +10 to +30° from neutral' },
  'Left Shoulder Flexion':    { label: 'Normal: 0–180°' },
  'Right Shoulder Flexion':   { label: 'Normal: 0–180°' },
  'Left Knee Valgus':         { max: 5,  warn: 10,            label: 'Dynamic valgus: <5° (frontal view)' },
  'Right Knee Valgus':        { max: 5,  warn: 10,            label: 'Dynamic valgus: <5° (frontal view)' },
  'Pelvic Drop':              { max: 5,  warn: 8,             label: 'Contralateral pelvic drop: <5°' },
  'Left Pronation':           { max: 4,  warn: 8,             label: 'Calcaneal eversion: neutral 0–4°, mild 5–10°, significant >10°' },
  'Right Pronation':          { max: 4,  warn: 8,             label: 'Calcaneal eversion: neutral 0–4°, mild 5–10°, significant >10°' },
  'Left Hip Adduction':       { max: 10, warn: 12,            label: 'Hip adduction swing: 0–10° normal; >10° = crossover risk (frontal view)' },
  'Right Hip Adduction':      { max: 10, warn: 12,            label: 'Hip adduction swing: 0–10° normal; >10° = crossover risk (frontal view)' },
};

// ── Merge helper ──────────────────────────────────────────────────────────────

export function mergeWorldLandmarks(
  poseLandmarks: NormalizedLandmark[],
  worldLandmarks: WorldLandmark[] | null,
): LandmarkWithWorld[] {
  return poseLandmarks.map((lm, i) => {
    const wl = worldLandmarks?.[i] ?? null;
    return {
      ...lm,
      _wx: wl?.x ?? null,
      _wy: wl?.y ?? null,
      _wz: wl?.z ?? null,
    };
  });
}

// ── Angle math ────────────────────────────────────────────────────────────────

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

function calcAngle3D(a: LandmarkWithWorld, b: LandmarkWithWorld, c: LandmarkWithWorld): number | null {
  if (a._wx == null || b._wx == null || c._wx == null) return null;
  if (a._wy == null || b._wy == null || c._wy == null) return null;
  if (a._wz == null || b._wz == null || c._wz == null) return null;
  const abx = a._wx - b._wx, aby = a._wy - b._wy, abz = a._wz - b._wz;
  const cbx = c._wx - b._wx, cby = c._wy - b._wy, cbz = c._wz - b._wz;
  const dot = abx * cbx + aby * cby + abz * cbz;
  const mag = Math.sqrt(abx ** 2 + aby ** 2 + abz ** 2) *
              Math.sqrt(cbx ** 2 + cby ** 2 + cbz ** 2);
  if (!mag) return null;
  return Math.round(Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI);
}

// Uses 3D world coordinates when available (removes foreshortening), falls back to 2D.
function calcAngleBest(a: LandmarkWithWorld, b: LandmarkWithWorld, c: LandmarkWithWorld): number | null {
  return calcAngle3D(a, b, c) ?? calcAngle(a, b, c);
}

// ── extractAngles ─────────────────────────────────────────────────────────────

/**
 * Computes all joint angles for a single frame.
 * Keys prefixed with `_` are diagnostic metadata (excluded from aggregation).
 */
export function extractAngles(
  lm: LandmarkWithWorld[],
  cameraView: 'side' | 'front' | 'posterior' = 'side',
  movementType = '',
): Record<string, number> {
  const angles: Record<string, number> = {};

  // Confidence-gated landmark accessors
  const v    = (i: number) => lm[i] && (lm[i].visibility ?? 0) > 0.30 ? lm[i] : null;
  const combinedConf = (lmItem: LandmarkWithWorld | null) => {
    if (!lmItem) return 0;
    return Math.min(lmItem.visibility ?? 0, lmItem.presence ?? 1);
  };
  const vHigh = (i: number) => lm[i] && combinedConf(lm[i]) > 0.40 ? lm[i] : null;
  const vMed  = (i: number) => lm[i] && combinedConf(lm[i]) > 0.35 ? lm[i] : null;

  const isFrontal = cameraView === 'front' || cameraView === 'posterior';
  const isGait    = /running|gait|walk/i.test(movementType);
  const isLanding = /drop jump|countermovement jump|single-leg landing|tuck jump/i.test(movementType);

  // ── Knee flexion ────────────────────────────────────────────────────────────
  const lHip = v(23), lKnee = v(25), lAnkle = v(27);
  const rHip = v(24), rKnee = v(26), rAnkle = v(28);

  if (lHip && lKnee && lAnkle) angles['Left Knee Flexion']  = calcAngleBest(lHip, lKnee, lAnkle)!;
  if (rHip && rKnee && rAnkle) angles['Right Knee Flexion'] = calcAngleBest(rHip, rKnee, rAnkle)!;

  // ── Hip flexion ─────────────────────────────────────────────────────────────
  // Running/gait: thigh-from-vertical, independent of arm swing.
  // Other: shoulder–hip–knee (trunk lean is the clinical reference).
  const lShoulder = v(11), rShoulder = v(12);

  // Thigh-from-vertical helpers (2D image and 3D world)
  const hipFlexV2D = (h: LandmarkWithWorld, k: LandmarkWithWorld): number | null => {
    const dy = k.y - h.y;
    if (dy < -0.10) return null; // knee substantially above hip — invalid for running
    return Math.min(90, Math.round(Math.atan2(Math.abs(k.x - h.x), dy) * 180 / Math.PI));
  };
  const hipFlexV3D = (h: LandmarkWithWorld, k: LandmarkWithWorld): number | null => {
    if (h._wx == null || k._wx == null || h._wy == null || k._wy == null) return null;
    const dy = k._wy - h._wy;
    if (dy < -0.15) return null;
    const dx = k._wx - h._wx, dz = (k._wz ?? 0) - (h._wz ?? 0);
    return Math.min(90, Math.round(Math.atan2(Math.hypot(dx, dz), dy) * 180 / Math.PI));
  };

  if (isGait) {
    // Take max(3D, 2D) — 3D depth estimation can underestimate in side view
    if (lHip && lKnee) {
      const v3 = hipFlexV3D(lHip, lKnee), v2 = hipFlexV2D(lHip, lKnee);
      const val = v3 != null && v2 != null ? Math.max(v3, v2) : (v3 ?? v2);
      if (val != null) angles['Left Hip Flexion'] = val;
      if (v2 != null) angles['_lHipFlex2D'] = v2;
      if (v3 != null) angles['_lHipFlex3D'] = v3;
    }
    if (rHip && rKnee) {
      const v3 = hipFlexV3D(rHip, rKnee), v2 = hipFlexV2D(rHip, rKnee);
      const val = v3 != null && v2 != null ? Math.max(v3, v2) : (v3 ?? v2);
      if (val != null) angles['Right Hip Flexion'] = val;
      if (v2 != null) angles['_rHipFlex2D'] = v2;
      if (v3 != null) angles['_rHipFlex3D'] = v3;
    }
  } else {
    // Frontal-view landing: hip flexion is unmeasurable — suppress rather than report nonsense
    if (!isFrontal || !isLanding) {
      if (lShoulder && lHip && lKnee) {
        const raw = calcAngleBest(lShoulder, lHip, lKnee);
        if (raw != null) angles['Left Hip Flexion'] = Math.abs(180 - raw);
      }
      if (rShoulder && rHip && rKnee) {
        const raw = calcAngleBest(rShoulder, rHip, rKnee);
        if (raw != null) angles['Right Hip Flexion'] = Math.abs(180 - raw);
      }
    }
  }

  // ── Trunk lean ──────────────────────────────────────────────────────────────
  if (lShoulder && rShoulder && lHip && rHip) {
    const sMid: LandmarkWithWorld = {
      x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2, z: 0,
      _wx: lShoulder._wx != null && rShoulder._wx != null ? (lShoulder._wx + rShoulder._wx) / 2 : null,
      _wy: lShoulder._wy != null && rShoulder._wy != null ? (lShoulder._wy + rShoulder._wy) / 2 : null,
      _wz: lShoulder._wz != null && rShoulder._wz != null ? (lShoulder._wz + rShoulder._wz) / 2 : null,
    };
    const hMid: LandmarkWithWorld = {
      x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2, z: 0,
      _wx: lHip._wx != null && rHip._wx != null ? (lHip._wx + rHip._wx) / 2 : null,
      _wy: lHip._wy != null && rHip._wy != null ? (lHip._wy + rHip._wy) / 2 : null,
      _wz: lHip._wz != null && rHip._wz != null ? (lHip._wz + rHip._wz) / 2 : null,
    };

    if (sMid._wx != null && hMid._wx != null && sMid._wz != null && hMid._wz != null) {
      const dz = sMid._wz - hMid._wz;
      const dy = hMid._wy! - sMid._wy!;
      angles['Trunk Lean'] = Math.round(Math.abs(Math.atan2(dz, Math.abs(dy)) * 180 / Math.PI));
    } else {
      angles['Trunk Lean'] = Math.round(
        Math.abs(Math.atan2(sMid.x - hMid.x, Math.abs(sMid.y - hMid.y)) * 180 / Math.PI),
      );
    }
  }

  // ── Ankle dorsiflexion (side view only) ────────────────────────────────────
  // calcAngle(knee, ankle, foot_distal) − 90 = DF in degrees.
  // Positive = dorsiflexion (heel contact), negative = plantarflexion (push-off).
  if (!isFrontal) {
    const lKneeP = v(25), lAnkleP = v(27);
    const rKneeP = v(26), rAnkleP = v(28);
    const lHeelLM = vHigh(29), lToeLM = vMed(31);
    const rHeelLM = vHigh(30), rToeLM = vMed(32);

    const pickDistal = (ankleLM: LandmarkWithWorld | null, heelLM: LandmarkWithWorld | null, toeLM: LandmarkWithWorld | null) => {
      if (heelLM && ankleLM && heelLM.y >= ankleLM.y - 0.04) return { lm: heelLM, src: 'heel' };
      if (toeLM) return { lm: toeLM, src: 'toe' };
      return null;
    };
    // Reject far-side ankles using Z-depth cross-check (0.48m threshold).
    const worldZReject = (ankleLM: LandmarkWithWorld | null, kneeLM: LandmarkWithWorld | null) => {
      if (!ankleLM?._wz || !kneeLM?._wz) return false;
      return Math.abs(ankleLM._wz - kneeLM._wz) > 0.48;
    };

    const applyDF = (
      kneeLM: LandmarkWithWorld | null,
      ankleLM: LandmarkWithWorld | null,
      heelLM: LandmarkWithWorld | null,
      toeLM: LandmarkWithWorld | null,
      side: 'Left' | 'Right',
    ) => {
      if (!kneeLM || !ankleLM) return;
      const distal = pickDistal(ankleLM, heelLM, toeLM);
      if (!distal || worldZReject(ankleLM, kneeLM)) return;
      const raw = calcAngle(kneeLM, ankleLM, distal.lm);
      if (raw == null) return;
      const df = raw - 90;
      if (df >= -15 && df <= 35) {
        angles[`${side} Ankle Dorsiflexion`] = df;
        angles[`_${side[0].toLowerCase()}AnkleSrc`]  = distal.src === 'heel' ? 1 : 0;
        angles[`_${side[0].toLowerCase()}AnkleConf`] = Math.round(combinedConf(distal.lm) * 100);
      }
    };

    applyDF(lKneeP, lAnkleP, lHeelLM, lToeLM, 'Left');
    applyDF(rKneeP, rAnkleP, rHeelLM, rToeLM, 'Right');
  }

  // ── Frontal-plane metrics ───────────────────────────────────────────────────
  if (isFrontal) {
    const lHipF = v(23), rHipF = v(24);
    const lKneeF = v(25), rKneeF = v(26);
    const lAnkF  = v(27), rAnkF  = v(28);

    // Pelvic drop (Trendelenburg)
    if (lHipF && rHipF) {
      const dx = rHipF.x - lHipF.x, dy = rHipF.y - lHipF.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.05) {
        angles['Pelvic Drop'] = Math.round(
          Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI),
        );
        angles['_pelvicDropSide'] = dy > 0.01 ? 1 : dy < -0.01 ? -1 : 0; // 1=right, -1=left, 0=neutral
      }
    }

    // Dynamic knee valgus
    const computeKneeValgus = (
      hip: LandmarkWithWorld | null,
      knee: LandmarkWithWorld | null,
      ankle: LandmarkWithWorld | null,
    ): number | null => {
      if (!hip || !knee || !ankle) return null;
      const axDx = ankle.x - hip.x, axDy = ankle.y - hip.y;
      const axLen = Math.hypot(axDx, axDy);
      if (axLen < 0.05) return null;
      const t = ((knee.x - hip.x) * axDx + (knee.y - hip.y) * axDy) / (axLen * axLen);
      const perpX = (knee.x - hip.x) - t * axDx;
      const perpY = (knee.y - hip.y) - t * axDy;
      const perpDist = Math.hypot(perpX, perpY);
      if (perpDist < 0.005) return 0;
      const projLen = t * axLen;
      if (projLen < 0.02) return null;
      return Math.round(Math.atan2(perpDist, projLen) * 180 / Math.PI);
    };

    const lValgus = computeKneeValgus(lHipF, lKneeF, lAnkF);
    const rValgus = computeKneeValgus(rHipF, rKneeF, rAnkF);
    if (lValgus != null && lValgus <= 25) angles['Left Knee Valgus']  = lValgus;
    if (rValgus != null && rValgus <= 25) angles['Right Knee Valgus'] = rValgus;

    // Hip adduction
    const computeHipAdduction = (
      hipLM: LandmarkWithWorld | null,
      kneeLM: LandmarkWithWorld | null,
    ): number | null => {
      if (!hipLM || !kneeLM) return null;
      const dx = kneeLM.x - hipLM.x, dy = kneeLM.y - hipLM.y;
      if (Math.hypot(dx, dy) < 0.03) return null;
      if (dy < -0.02) return null; // knee above hip — airborne
      const deg = Math.round(Math.atan2(Math.abs(dx), dy) * 180 / Math.PI);
      return deg > 30 ? null : deg;
    };

    const lAdd = computeHipAdduction(lHipF, lKneeF);
    const rAdd = computeHipAdduction(rHipF, rKneeF);
    if (lAdd != null) angles['Left Hip Adduction']  = lAdd;
    if (rAdd != null) angles['Right Hip Adduction'] = rAdd;

    // Pronation / calcaneal eversion (posterior view only — RCSP method)
    if (cameraView === 'posterior') {
      const minHeelConf = 0.65;
      const lKneePost = v(25), lAnkPost = v(27);
      const rKneePost = v(26), rAnkPost = v(28);
      const lHeelPost = lm[29] && combinedConf(lm[29]) > minHeelConf ? lm[29] : null;
      const rHeelPost = lm[30] && combinedConf(lm[30]) > minHeelConf ? lm[30] : null;

      const computePronation = (
        kneeLM: LandmarkWithWorld | null,
        ankleLM: LandmarkWithWorld | null,
        heelLM: LandmarkWithWorld | null,
        isLeft: boolean,
      ): { deg: number; everted: boolean } | null => {
        if (!kneeLM || !ankleLM || !heelLM) return null;
        const legLen = Math.hypot(ankleLM.x - kneeLM.x, ankleLM.y - kneeLM.y);
        if (legLen < 0.03) return null;
        const heelDx = heelLM.x - ankleLM.x, heelDy = heelLM.y - ankleLM.y;
        if (Math.hypot(heelDx, heelDy) < 0.005) return null;
        if (Math.hypot(heelDx, heelDy) > legLen * 0.80) return null; // misplaced
        if (heelDy < 0.005) return null; // heel must be below ankle
        const deg = Math.atan2(Math.abs(heelDx), heelDy) * 180 / Math.PI;
        if (deg > 14) return null;
        return { deg: Math.round(deg), everted: isLeft ? heelDx > 0 : heelDx < 0 };
      };

      const lStance = lAnkPost && lAnkPost.y > 0.60;
      const rStance = rAnkPost && rAnkPost.y > 0.60;
      const lPron = lStance ? computePronation(lKneePost, lAnkPost, lHeelPost, true)  : null;
      const rPron = rStance ? computePronation(rKneePost, rAnkPost, rHeelPost, false) : null;

      if (lPron) { angles['Left Pronation']  = lPron.deg; angles['_lPronEverted'] = lPron.everted ? 1 : 0; }
      if (rPron) { angles['Right Pronation'] = rPron.deg; angles['_rPronEverted'] = rPron.everted ? 1 : 0; }
    }

    // Trunk lateral lean (more accurate from frontal than sagittal)
    if (lShoulder && rShoulder && lHipF && rHipF) {
      const sMidX = (lShoulder.x + rShoulder.x) / 2, sMidY = (lShoulder.y + rShoulder.y) / 2;
      const hMidX = (lHipF.x + rHipF.x) / 2,         hMidY = (lHipF.y + rHipF.y) / 2;
      const vertDy = Math.abs(sMidY - hMidY);
      if (vertDy > 0.05) {
        angles['Trunk Lateral Lean'] = Math.round(
          Math.abs(Math.atan2(Math.abs(sMidX - hMidX), vertDy) * 180 / Math.PI),
        );
      }
    }
  }

  // ── Shoulder flexion ────────────────────────────────────────────────────────
  const lElbow = v(13), rElbow = v(14);
  if (lShoulder && lElbow && lHip) angles['Left Shoulder Flexion']  = calcAngle(lHip, lShoulder, lElbow)!;
  if (rShoulder && rElbow && rHip) angles['Right Shoulder Flexion'] = calcAngle(rHip, rShoulder, rElbow)!;

  return angles;
}

// ── aggregateAngles ───────────────────────────────────────────────────────────

type PhaseWithSide = PhaseLabel & { _side?: 'L' | 'R' };

/**
 * Reduces per-frame angle objects to per-metric statistics.
 * Applies phase-aware filters: ankle DF excluded from swing; pronation stance-only;
 * hip flexion uses REF-leg awareness to avoid filtering out the contralateral peak.
 */
export function aggregateAngles(
  allFrameAngles: Record<string, number>[],
  framePhases: (PhaseWithSide | null)[],
): Record<string, AngleStat> {
  const combined: Record<string, number[]> = {};
  // allAttempts counts every time a key appeared in any frame's angle object
  // (including null values from degenerate landmarks) — used as the hitRate denominator
  // so lowConfidence triggers when a metric is computable in theory but often fails.
  const allAttempts: Record<string, number> = {};

  allFrameAngles.forEach(frameAngles => {
    Object.keys(frameAngles).forEach(key => {
      if (!key.startsWith('_')) allAttempts[key] = (allAttempts[key] ?? 0) + 1;
    });
  });

  // Determine REF leg from GaitFSM phase tags
  let refSide: 'L' | 'R' | null = null;
  for (const p of Object.values(framePhases)) {
    if (p?._side === 'L' || p?._side === 'R') { refSide = p._side; break; }
  }

  allFrameAngles.forEach((frameAngles, fi) => {
    const phase   = framePhases?.[fi] ?? null;
    const phaseId = phase?.id ?? null;
    const isSwing  = ['toeoff', 'earlyswing', 'midswing', 'lateswing'].includes(phaseId ?? '');
    const isStance = ['contact', 'loading', 'midstance', 'propulsion'].includes(phaseId ?? '');

    Object.entries(frameAngles).forEach(([key, val]) => {
      if (val == null) return;
      if (key.startsWith('_')) return; // diagnostic metadata

      // Ankle DF: stance only
      if (isSwing && key.includes('Ankle Dorsiflexion')) return;
      if (key.includes('Ankle Dorsiflexion') && (val < -5 || val > 30)) return;

      // Pronation: contact/loading/midstance only
      if (key.includes('Pronation') && (phaseId == null || !['loading', 'contact', 'midstance'].includes(phaseId))) return;

      // Hip Flexion: exclude frames where the measured leg is in its own stance phase.
      // REF leg stance = isStance; contralateral leg stance = isSwing (they are ~50% offset).
      if (key === 'Left Hip Flexion' || key === 'Right Hip Flexion') {
        const measuredIsL    = key === 'Left Hip Flexion';
        const measuredIsRef  = refSide ? ((measuredIsL && refSide === 'L') || (!measuredIsL && refSide === 'R')) : true;
        const ownLegInStance = measuredIsRef ? isStance : isSwing;
        if (ownLegInStance) {
          const stanceKey = key + '__stance';
          if (!combined[stanceKey]) combined[stanceKey] = [];
          combined[stanceKey].push(val);
          return;
        }
      }

      if (!combined[key]) combined[key] = [];
      combined[key].push(val);
    });
  });

  const result: Record<string, AngleStat> = {};
  Object.entries(combined).forEach(([key, vals]) => {
    if (!vals.length || key.endsWith('__stance')) return;

    const total   = allAttempts[key] || vals.length;
    const hitRate = vals.length / Math.max(1, total);

    // Ankle DF uses median (more robust to outliers from mixed stance/swing frames)
    let avg: number;
    if (key.includes('Ankle Dorsiflexion') && vals.length >= 3) {
      const sorted = [...vals].sort((a, b) => a - b);
      avg = sorted[Math.floor(sorted.length / 2)];
    } else {
      avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    }

    result[key] = {
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: Math.round(avg),
      count: vals.length,
      hitRate: Math.round(hitRate * 100),
      lowConfidence: hitRate < 0.40,
    };
  });

  return result;
}
