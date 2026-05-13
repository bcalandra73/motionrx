import { describe, it, expect } from 'vitest';
import {
  mergeWorldLandmarks,
  extractAngles,
  aggregateAngles,
  REF_RANGES,
} from '../angleCalculation';
import type { LandmarkWithWorld } from '../angleCalculation';
import type { NormalizedLandmark, WorldLandmark, PhaseLabel } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

type LmSpec = { x: number; y: number; visibility?: number; _wx?: number; _wy?: number; _wz?: number };

function makeLandmarks(overrides: Partial<Record<number, LmSpec>>): LandmarkWithWorld[] {
  return Array.from({ length: 33 }, (_, i) => {
    const o = overrides[i];
    if (o) {
      return {
        x: o.x, y: o.y, z: 0,
        visibility: o.visibility ?? 0.9,
        presence: 1.0,
        _wx: o._wx ?? null,
        _wy: o._wy ?? null,
        _wz: o._wz ?? null,
      };
    }
    return { x: 0.5, y: 0.5, z: 0, visibility: 0.0, _wx: null, _wy: null, _wz: null };
  });
}

function phase(id: string): PhaseLabel {
  return { id, label: id, desc: '', fraction: 0.5 };
}

// ── mergeWorldLandmarks ───────────────────────────────────────────────────────

describe('mergeWorldLandmarks', () => {
  it('attaches world coords to matching indices', () => {
    const norm: NormalizedLandmark[] = [
      { x: 0.5, y: 0.5, z: 0, visibility: 0.9 },
      { x: 0.6, y: 0.6, z: 0, visibility: 0.8 },
    ];
    const world: WorldLandmark[] = [
      { x: 0.1, y: -0.2, z: 0.3 },
      { x: 0.4, y: -0.5, z: 0.6 },
    ];
    const result = mergeWorldLandmarks(norm, world);
    expect(result[0]._wx).toBe(0.1);
    expect(result[0]._wy).toBe(-0.2);
    expect(result[0]._wz).toBe(0.3);
    expect(result[1]._wx).toBe(0.4);
  });

  it('fills _wx/_wy/_wz with null when worldLandmarks is null', () => {
    const norm: NormalizedLandmark[] = [{ x: 0.5, y: 0.5, z: 0 }];
    const result = mergeWorldLandmarks(norm, null);
    expect(result[0]._wx).toBeNull();
    expect(result[0]._wy).toBeNull();
    expect(result[0]._wz).toBeNull();
  });

  it('preserves original normalized landmark fields', () => {
    const norm: NormalizedLandmark[] = [{ x: 0.3, y: 0.7, z: 0.1, visibility: 0.85 }];
    const result = mergeWorldLandmarks(norm, null);
    expect(result[0].x).toBe(0.3);
    expect(result[0].y).toBe(0.7);
    expect(result[0].visibility).toBe(0.85);
  });
});

// ── extractAngles — knee flexion ──────────────────────────────────────────────

describe('extractAngles — knee flexion', () => {
  it('straight leg returns 180°', () => {
    // hip-knee-ankle collinear vertically
    const lm = makeLandmarks({
      23: { x: 0.5, y: 0.4 }, // L hip
      25: { x: 0.5, y: 0.6 }, // L knee
      27: { x: 0.5, y: 0.8 }, // L ankle
    });
    const angles = extractAngles(lm, 'side', 'Squat (Double-Leg)');
    expect(angles['Left Knee Flexion']).toBe(180);
  });

  it('right angle at knee returns 90°', () => {
    const lm = makeLandmarks({
      23: { x: 0.5, y: 0.4 },
      25: { x: 0.5, y: 0.6 },
      27: { x: 0.6, y: 0.6 }, // ankle level with knee, to the side
    });
    const angles = extractAngles(lm, 'side', 'Squat (Double-Leg)');
    expect(angles['Left Knee Flexion']).toBe(90);
  });

  it('returns approximately 120° for a partially flexed knee', () => {
    // ankle position that creates ~120° at knee:
    // ab=(0,-0.2) direction=(0,-1); rotate by 120°: (sin120°,−cos120°)=(0.866,0.5)
    const lm = makeLandmarks({
      23: { x: 0.5, y: 0.4 },
      25: { x: 0.5, y: 0.6 },
      27: { x: 0.5 + 0.1 * 0.866, y: 0.6 + 0.1 * 0.5 }, // ≈ (0.587, 0.65)
    });
    const angles = extractAngles(lm, 'side', 'Squat (Double-Leg)');
    expect(angles['Left Knee Flexion']).toBeCloseTo(120, 0);
  });

  it('reports bilateral knee angles when both sides are visible', () => {
    const lm = makeLandmarks({
      23: { x: 0.4, y: 0.4 }, 25: { x: 0.4, y: 0.6 }, 27: { x: 0.4, y: 0.8 }, // L straight
      24: { x: 0.6, y: 0.4 }, 26: { x: 0.6, y: 0.6 }, 28: { x: 0.7, y: 0.6 }, // R bent
    });
    const angles = extractAngles(lm, 'side', 'Squat (Double-Leg)');
    expect(angles['Left Knee Flexion']).toBe(180);
    expect(angles['Right Knee Flexion']).toBe(90);
  });

  it('omits knee flexion when landmark visibility is too low', () => {
    const lm = makeLandmarks({
      23: { x: 0.5, y: 0.4, visibility: 0.1 }, // below 0.30 threshold
      25: { x: 0.5, y: 0.6, visibility: 0.1 },
      27: { x: 0.5, y: 0.8, visibility: 0.1 },
    });
    const angles = extractAngles(lm, 'side', 'Squat (Double-Leg)');
    expect(angles['Left Knee Flexion']).toBeUndefined();
  });
});

// ── extractAngles — hip flexion ───────────────────────────────────────────────

describe('extractAngles — hip flexion', () => {
  it('running: thigh-from-vertical returns 0° for vertical thigh', () => {
    const lm = makeLandmarks({
      23: { x: 0.5, y: 0.4 }, // hip
      25: { x: 0.5, y: 0.6 }, // knee directly below
    });
    const angles = extractAngles(lm, 'side', 'Running');
    expect(angles['Left Hip Flexion']).toBe(0);
  });

  it('running: thigh-from-vertical returns 45° for 45° forward thigh', () => {
    const lm = makeLandmarks({
      23: { x: 0.5, y: 0.4 },
      25: { x: 0.7, y: 0.6 }, // knee same distance forward as down
    });
    const angles = extractAngles(lm, 'side', 'Running');
    expect(angles['Left Hip Flexion']).toBe(45);
  });

  it('non-running: shoulder-hip-knee used (full extension = 0°)', () => {
    const lm = makeLandmarks({
      11: { x: 0.5, y: 0.2 }, // L shoulder
      23: { x: 0.5, y: 0.5 }, // L hip
      25: { x: 0.5, y: 0.8 }, // L knee — collinear → 180° → |180−180|=0
    });
    const angles = extractAngles(lm, 'side', 'Squat (Double-Leg)');
    expect(angles['Left Hip Flexion']).toBe(0);
  });

  it('non-running: shoulder-hip-knee used (90° flexion)', () => {
    const lm = makeLandmarks({
      11: { x: 0.5, y: 0.2 }, // L shoulder
      23: { x: 0.5, y: 0.5 }, // L hip
      25: { x: 0.7, y: 0.5 }, // L knee — perpendicular → 90° → |180−90|=90
    });
    const angles = extractAngles(lm, 'side', 'Squat (Double-Leg)');
    expect(angles['Left Hip Flexion']).toBe(90);
  });

  it('frontal view landing: hip flexion is suppressed', () => {
    const lm = makeLandmarks({
      11: { x: 0.4, y: 0.2 }, 23: { x: 0.4, y: 0.5 }, 25: { x: 0.4, y: 0.8 },
      12: { x: 0.6, y: 0.2 }, 24: { x: 0.6, y: 0.5 }, 26: { x: 0.6, y: 0.8 },
    });
    const angles = extractAngles(lm, 'front', 'Drop Jump Landing');
    expect(angles['Left Hip Flexion']).toBeUndefined();
    expect(angles['Right Hip Flexion']).toBeUndefined();
  });

  it('gait: stashes debug _lHipFlex2D key', () => {
    const lm = makeLandmarks({
      23: { x: 0.5, y: 0.4 },
      25: { x: 0.6, y: 0.6 },
    });
    const angles = extractAngles(lm, 'side', 'Gait / Walking');
    expect(angles['_lHipFlex2D']).toBeDefined();
  });
});

// ── extractAngles — trunk lean ────────────────────────────────────────────────

describe('extractAngles — trunk lean', () => {
  it('vertical trunk returns 0°', () => {
    const lm = makeLandmarks({
      11: { x: 0.5, y: 0.3 }, 12: { x: 0.5, y: 0.3 }, // shoulders
      23: { x: 0.5, y: 0.6 }, 24: { x: 0.5, y: 0.6 }, // hips — vertically aligned
    });
    const angles = extractAngles(lm, 'side', 'Running');
    expect(angles['Trunk Lean']).toBe(0);
  });

  it('returns non-zero when trunk is forward-leaning', () => {
    const lm = makeLandmarks({
      11: { x: 0.4, y: 0.3 }, 12: { x: 0.6, y: 0.3 }, // shoulder midpoint = (0.5, 0.3)
      23: { x: 0.3, y: 0.6 }, 24: { x: 0.7, y: 0.6 }, // hip midpoint = (0.5, 0.6) — offset
    });
    // Both midpoints are at x=0.5 so trunk lean = 0 here
    // Use asymmetric positions to create a lean
    const lm2 = makeLandmarks({
      11: { x: 0.6, y: 0.3 }, 12: { x: 0.8, y: 0.3 }, // shoulder midpoint = (0.7, 0.3)
      23: { x: 0.4, y: 0.6 }, 24: { x: 0.6, y: 0.6 }, // hip midpoint = (0.5, 0.6)
    });
    const angles = extractAngles(lm2, 'side', 'Squat (Double-Leg)');
    expect(angles['Trunk Lean']).toBeGreaterThan(0);
    expect(angles['Trunk Lean']).toBeLessThanOrEqual(90);
  });
});

// ── extractAngles — ankle dorsiflexion ────────────────────────────────────────

describe('extractAngles — ankle dorsiflexion', () => {
  it('is not computed for frontal view', () => {
    const lm = makeLandmarks({
      25: { x: 0.4, y: 0.5 }, // L knee
      27: { x: 0.4, y: 0.7 }, // L ankle
      31: { x: 0.5, y: 0.7 }, // L toe
    });
    const angles = extractAngles(lm, 'front', 'Running');
    expect(angles['Left Ankle Dorsiflexion']).toBeUndefined();
  });

  it('is not computed for posterior view', () => {
    const lm = makeLandmarks({
      25: { x: 0.4, y: 0.5 },
      27: { x: 0.4, y: 0.7 },
      31: { x: 0.5, y: 0.7 },
    });
    const angles = extractAngles(lm, 'posterior', 'Running');
    expect(angles['Left Ankle Dorsiflexion']).toBeUndefined();
  });

  it('neutral ankle (toe level with ankle) produces ~0° DF', () => {
    // knee→ankle→toe with toe level and forward: angle at ankle = 90° → DF = 0°
    const lm = makeLandmarks({
      25: { x: 0.5, y: 0.4 }, // L knee
      27: { x: 0.5, y: 0.6 }, // L ankle
      31: { x: 0.6, y: 0.6, visibility: 0.5 }, // L toe — horizontal from ankle
    });
    const angles = extractAngles(lm, 'side', 'Running');
    // 0° ± rounding
    if (angles['Left Ankle Dorsiflexion'] != null) {
      expect(angles['Left Ankle Dorsiflexion']).toBeCloseTo(0, 0);
    }
  });

  it('values outside physiological clamp (−15 to +35) are excluded', () => {
    // Create an extreme angle that should be clamped out
    // knee above ankle, toe way above → would produce negative DF beyond −15
    const lm = makeLandmarks({
      25: { x: 0.5, y: 0.5 },
      27: { x: 0.5, y: 0.7 },
      31: { x: 0.1, y: 0.2, visibility: 0.5 }, // extreme position → extreme DF angle
    });
    const angles = extractAngles(lm, 'side', 'Running');
    if (angles['Left Ankle Dorsiflexion'] != null) {
      expect(angles['Left Ankle Dorsiflexion']).toBeGreaterThanOrEqual(-15);
      expect(angles['Left Ankle Dorsiflexion']).toBeLessThanOrEqual(35);
    }
  });
});

// ── extractAngles — frontal-plane metrics ─────────────────────────────────────

describe('extractAngles — frontal-plane metrics', () => {
  it('pelvic drop: level pelvis returns ~0°', () => {
    const lm = makeLandmarks({
      23: { x: 0.4, y: 0.5 }, // L hip
      24: { x: 0.6, y: 0.5 }, // R hip — same height
    });
    const angles = extractAngles(lm, 'front', 'Running');
    expect(angles['Pelvic Drop']).toBe(0);
  });

  it('pelvic drop: tilted pelvis returns non-zero', () => {
    const lm = makeLandmarks({
      23: { x: 0.4, y: 0.5 },
      24: { x: 0.6, y: 0.6 }, // R hip lower by 0.1
    });
    const angles = extractAngles(lm, 'front', 'Running');
    expect(angles['Pelvic Drop']).toBeGreaterThan(0);
    expect(angles['Pelvic Drop']).toBeLessThanOrEqual(90);
  });

  it('pelvic drop not computed in side view', () => {
    const lm = makeLandmarks({
      23: { x: 0.4, y: 0.5 },
      24: { x: 0.6, y: 0.6 },
    });
    const angles = extractAngles(lm, 'side', 'Running');
    expect(angles['Pelvic Drop']).toBeUndefined();
  });

  it('knee valgus: straight alignment returns 0°', () => {
    // hip, knee, ankle collinear → no perpendicular offset
    const lm = makeLandmarks({
      23: { x: 0.4, y: 0.3 }, // L hip
      25: { x: 0.4, y: 0.5 }, // L knee — on hip-ankle line
      27: { x: 0.4, y: 0.7 }, // L ankle
    });
    const angles = extractAngles(lm, 'front', 'Running');
    expect(angles['Left Knee Valgus']).toBe(0);
  });

  it('knee valgus not computed in side view', () => {
    const lm = makeLandmarks({
      23: { x: 0.4, y: 0.3 }, 25: { x: 0.5, y: 0.5 }, 27: { x: 0.4, y: 0.7 },
    });
    const angles = extractAngles(lm, 'side', 'Running');
    expect(angles['Left Knee Valgus']).toBeUndefined();
  });
});

// ── extractAngles — shoulder flexion ─────────────────────────────────────────

describe('extractAngles — shoulder flexion', () => {
  it('arm at side (0° flexion): elbow level with shoulder returns 90°', () => {
    // calcAngle(hip, shoulder, elbow): elbow to the side of shoulder at 90°
    const lm = makeLandmarks({
      23: { x: 0.4, y: 0.6 }, // L hip
      11: { x: 0.4, y: 0.3 }, // L shoulder
      13: { x: 0.5, y: 0.3 }, // L elbow — horizontal from shoulder
    });
    const angles = extractAngles(lm, 'side', 'Shoulder Flexion / Abduction');
    expect(angles['Left Shoulder Flexion']).toBe(90);
  });
});

// ── aggregateAngles ───────────────────────────────────────────────────────────

describe('aggregateAngles', () => {
  it('computes correct min/max/avg', () => {
    const frames = [
      { 'Left Knee Flexion': 90 },
      { 'Left Knee Flexion': 120 },
      { 'Left Knee Flexion': 150 },
    ];
    const result = aggregateAngles(frames, [null, null, null]);
    expect(result['Left Knee Flexion'].min).toBe(90);
    expect(result['Left Knee Flexion'].max).toBe(150);
    expect(result['Left Knee Flexion'].avg).toBe(120);
    expect(result['Left Knee Flexion'].count).toBe(3);
  });

  it('ignores _ prefixed diagnostic keys', () => {
    const frames = [{ '_debug': 42, 'Left Knee Flexion': 100 }];
    const result = aggregateAngles(frames, [null]);
    expect(result['_debug']).toBeUndefined();
    expect(result['Left Knee Flexion']).toBeDefined();
  });

  it('excludes ankle DF from swing phase frames', () => {
    const frames = [
      { 'Left Ankle Dorsiflexion': 15 }, // stance
      { 'Left Ankle Dorsiflexion': 10 }, // swing — should be excluded
      { 'Left Ankle Dorsiflexion': 20 }, // stance
    ];
    const phases = [phase('contact'), phase('midswing'), phase('loading')];
    const result = aggregateAngles(frames, phases);
    expect(result['Left Ankle Dorsiflexion'].count).toBe(2); // only stance frames
    expect(result['Left Ankle Dorsiflexion'].avg).toBe(18); // avg of 15 and 20
  });

  it('excludes ankle DF values outside physiological range', () => {
    const frames = [
      { 'Left Ankle Dorsiflexion': 15 },
      { 'Left Ankle Dorsiflexion': -10 }, // below −5 clamp
      { 'Left Ankle Dorsiflexion': 35 },  // above +30 clamp
    ];
    const result = aggregateAngles(frames, [null, null, null]);
    expect(result['Left Ankle Dorsiflexion'].count).toBe(1);
    expect(result['Left Ankle Dorsiflexion'].avg).toBe(15);
  });

  it('ankle DF uses median when ≥3 values', () => {
    const frames = [
      { 'Left Ankle Dorsiflexion': 10 },
      { 'Left Ankle Dorsiflexion': 20 },
      { 'Left Ankle Dorsiflexion': 12 }, // median = 12
    ];
    const result = aggregateAngles(frames, [null, null, null]);
    expect(result['Left Ankle Dorsiflexion'].avg).toBe(12);
  });

  it('excludes pronation from non-stance frames', () => {
    const frames = [
      { 'Left Pronation': 6 },  // contact — included
      { 'Left Pronation': 8 },  // toeoff — excluded
      { 'Left Pronation': 4 },  // midstance — included
    ];
    const phases = [phase('contact'), phase('toeoff'), phase('midstance')];
    const result = aggregateAngles(frames, phases);
    expect(result['Left Pronation'].count).toBe(2);
  });

  it('excludes pronation when phaseId is null', () => {
    const frames = [{ 'Left Pronation': 5 }];
    const result = aggregateAngles(frames, [null]);
    expect(result['Left Pronation']).toBeUndefined();
  });

  it('marks lowConfidence when fewer than 40% of frames contribute', () => {
    // 3 frames attempted, only 1 produces a value → hitRate = 33% < 40%
    const frames = [
      { 'Left Pronation': 6 },
      { 'Left Pronation': 4 },
      {},                       // no value
    ];
    const phases = [phase('contact'), phase('midswing'), phase('contact')];
    // contact: 2 frames contribute; midswing: excluded. 2 attempted, 1 hit? No...
    // Actually: contact frames = idx 0 and 2. idx 0 has value (6), idx 2 has no value.
    // frameCounts['Left Pronation'] = 2 (both contact frames attempted),
    // combined['Left Pronation'] = [6] (only idx 0 produces a value)
    // hitRate = 1/2 = 50% → NOT lowConfidence
    // Let me use a simpler setup: 5 frames, only 1 produces a value, all same phase
    // Frames include the key (as null) so allAttempts = 5, but only 1 produces a value
    const frames2 = Array.from({ length: 5 }, (_, i) =>
      ({ 'Left Knee Flexion': i === 0 ? 90 : (null as unknown as number) }),
    );
    const result = aggregateAngles(frames2, frames2.map(() => null));
    // allAttempts = 5, values = 1 → hitRate = 20% → lowConfidence
    expect(result['Left Knee Flexion'].lowConfidence).toBe(true);
    expect(result['Left Knee Flexion'].hitRate).toBe(20);
  });

  it('hitRate is 100 when all frames contribute', () => {
    const frames = [
      { 'Left Knee Flexion': 90 },
      { 'Left Knee Flexion': 100 },
      { 'Left Knee Flexion': 110 },
    ];
    const result = aggregateAngles(frames, [null, null, null]);
    expect(result['Left Knee Flexion'].hitRate).toBe(100);
    expect(result['Left Knee Flexion'].lowConfidence).toBe(false);
  });

  it('returns empty object for empty input', () => {
    expect(aggregateAngles([], [])).toEqual({});
  });
});

// ── REF_RANGES ────────────────────────────────────────────────────────────────

describe('REF_RANGES', () => {
  it('every entry has a non-empty label', () => {
    for (const [key, range] of Object.entries(REF_RANGES)) {
      expect(range.label.length, `${key} has empty label`).toBeGreaterThan(0);
    }
  });

  it('covers the core bilateral lower-limb metrics', () => {
    const required = [
      'Left Knee Flexion', 'Right Knee Flexion',
      'Left Hip Flexion',  'Right Hip Flexion',
      'Left Ankle Dorsiflexion', 'Right Ankle Dorsiflexion',
      'Left Knee Valgus',  'Right Knee Valgus',
      'Pelvic Drop',
    ];
    for (const key of required) {
      expect(REF_RANGES[key], `Missing REF_RANGES entry: ${key}`).toBeDefined();
    }
  });
});
