import { describe, it, expect } from 'vitest';
import { analyzeMovement, MovementAnalysisError } from '../movement-analysis';
import type { PoseFrame } from '../movement-analysis';
import { LM } from '../movement-analysis/signal/landmarks';

// ── Synthetic fixture generation ─────────────────────────────────────────────

const TWO_PI = 2 * Math.PI;

/**
 * Build a synthetic running pose sequence at the given fps.
 * Subject runs left→right (positive x direction).
 * Stride period ≈ 0.55s; step period ≈ 0.275s (left/right offset by half stride).
 */
function buildRunningFrames(fps: number, durationS: number): PoseFrame[] {
  const n = Math.round(fps * durationS);
  const stridePeriod = 0.55; // seconds per stride (≈109 steps/min)
  const frames: PoseFrame[] = [];

  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));

    // Pelvis (hips) — stationary on treadmill
    lm[LM.LEFT_HIP]  = { x: 0.48, y: 0.45, z: 0, visibility: 0.95 };
    lm[LM.RIGHT_HIP] = { x: 0.52, y: 0.45, z: 0, visibility: 0.95 };

    const pelvisX = 0.5;
    const stride = TWO_PI / stridePeriod;

    // Left side: heel is most forward at initial contact (peak of heel_rel signal)
    const leftPhase  = stride * t;
    const rightPhase = stride * t + Math.PI; // right is half-cycle offset

    // Heel: peaks (most forward) at IC, troughs (most behind) at midswing
    lm[LM.LEFT_HEEL]  = { x: pelvisX + 0.12 * Math.sin(leftPhase),  y: 0.85, z: 0, visibility: 0.95 };
    lm[LM.RIGHT_HEEL] = { x: pelvisX + 0.12 * Math.sin(rightPhase), y: 0.85, z: 0, visibility: 0.95 };

    // Foot index (toe): troughs (most behind) at toe-off
    lm[LM.LEFT_FOOT_INDEX]  = { x: pelvisX + 0.10 * Math.cos(leftPhase),  y: 0.88, z: 0, visibility: 0.95 };
    lm[LM.RIGHT_FOOT_INDEX] = { x: pelvisX + 0.10 * Math.cos(rightPhase), y: 0.88, z: 0, visibility: 0.95 };

    // Ankle: zero-crossing at midstance (under pelvis)
    lm[LM.LEFT_ANKLE]  = { x: pelvisX + 0.08 * Math.sin(leftPhase  - 0.3), y: 0.82, z: 0, visibility: 0.95 };
    lm[LM.RIGHT_ANKLE] = { x: pelvisX + 0.08 * Math.sin(rightPhase - 0.3), y: 0.82, z: 0, visibility: 0.95 };

    // Knees
    lm[LM.LEFT_KNEE]  = { x: 0.47, y: 0.65, z: 0, visibility: 0.95 };
    lm[LM.RIGHT_KNEE] = { x: 0.53, y: 0.65, z: 0, visibility: 0.95 };

    frames.push({ frameIndex: i, timestampMs: t * 1000, landmarks: lm });
  }
  return frames;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('analyzeMovement — edge inputs', () => {
  it('throws EMPTY_INPUT for zero frames', () => {
    expect(() => analyzeMovement('Running', [], 60)).toThrow(MovementAnalysisError);
    try { analyzeMovement('Running', [], 60); } catch (e) {
      expect((e as MovementAnalysisError).code).toBe('EMPTY_INPUT');
    }
  });

  it('throws INSUFFICIENT_FRAMES for fewer than 4 frames', () => {
    const frames = buildRunningFrames(60, 1).slice(0, 3);
    expect(() => analyzeMovement('Running', frames, 60)).toThrow(MovementAnalysisError);
    try { analyzeMovement('Running', frames, 60); } catch (e) {
      expect((e as MovementAnalysisError).code).toBe('INSUFFICIENT_FRAMES');
    }
  });

  it('throws UNSUPPORTED_MOVEMENT_TYPE for unknown type', () => {
    const frames = buildRunningFrames(60, 1);
    // @ts-expect-error — intentionally passing bad type
    expect(() => analyzeMovement('Underwater Basket Weaving', frames, 60)).toThrow(MovementAnalysisError);
  });
});

describe('analyzeMovement — Running (synthetic 60fps)', () => {
  const fps = 60;
  const frames = buildRunningFrames(fps, 5);
  const result = analyzeMovement('Running', frames, fps);

  it('returns all 8 RunningPhaseIds', () => {
    const ids = new Set(result.keyFrames.map(kf => kf.phaseId));
    const required = ['contact','loading','midstance','propulsion','toeoff','earlyswing','midswing','lateswing'];
    required.forEach(id => expect(ids.has(id as never)).toBe(true));
  });

  it('has exactly 8 keyFrames', () => {
    expect(result.keyFrames).toHaveLength(8);
  });

  it('has no duplicate frameIndex values', () => {
    const idxs = result.keyFrames.map(kf => kf.frameIndex);
    expect(new Set(idxs).size).toBe(idxs.length);
  });

  it('keyFrames are sorted by frameIndex ascending', () => {
    const idxs = result.keyFrames.map(kf => kf.frameIndex);
    for (let i = 1; i < idxs.length; i++) {
      expect(idxs[i]).toBeGreaterThanOrEqual(idxs[i - 1]);
    }
  });

  it('all frameIndex values are within bounds', () => {
    result.keyFrames.forEach(kf => {
      expect(kf.frameIndex).toBeGreaterThanOrEqual(0);
      expect(kf.frameIndex).toBeLessThan(frames.length);
    });
  });

  it('all confidence values are in [0, 1]', () => {
    result.keyFrames.forEach(kf => {
      expect(kf.confidence).toBeGreaterThanOrEqual(0);
      expect(kf.confidence).toBeLessThanOrEqual(1);
    });
  });

  it('emits LOW_FPS warning when fps < 60', () => {
    const lowFpsFrames = buildRunningFrames(30, 5);
    const r = analyzeMovement('Running', lowFpsFrames, 30);
    expect(r.warnings).toContain('LOW_FPS');
  });

  it('contact frame is within the first stride window', () => {
    const contactKf = result.keyFrames.find(kf => kf.phaseId === 'contact')!;
    expect(contactKf).toBeDefined();
    // First IC should be within the first stride (0.55s) at 60fps
    expect(contactKf.frameIndex).toBeGreaterThanOrEqual(0);
    expect(contactKf.frameIndex).toBeLessThan(Math.round(fps * 0.6));
  });

  it('refSide is left or right', () => {
    expect(['left', 'right']).toContain(result.refSide);
  });

  it('returns a warnings array', () => {
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
