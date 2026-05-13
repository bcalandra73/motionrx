import { describe, it, expect } from 'vitest';
import { getPhaseTimes } from '../frameExtraction';
import { PHASE_MAPS, LANDING_MOVEMENTS, DENSE_FRAME_MOVEMENTS } from '../../data/phaseMaps';

// ── Invariants that must hold for every movement ──────────────────────────────

function assertInvariants(movementType: string) {
  const { times, labels } = getPhaseTimes(movementType);

  it(`[${movementType}] times and labels have matching length`, () => {
    expect(times.length).toBe(labels.length);
  });

  it(`[${movementType}] all times are clamped to [0.02, 0.97]`, () => {
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(0.02);
      expect(t).toBeLessThanOrEqual(0.97);
    }
  });

  it(`[${movementType}] no two times are within 3% of each other (deduplication)`, () => {
    for (let i = 0; i < times.length; i++) {
      for (let j = i + 1; j < times.length; j++) {
        expect(Math.abs(times[i] - times[j])).toBeGreaterThanOrEqual(0.03);
      }
    }
  });

  it(`[${movementType}] all labels have non-empty id and label strings`, () => {
    for (const l of labels) {
      expect(l.id.length).toBeGreaterThan(0);
      expect(l.label.length).toBeGreaterThan(0);
    }
  });

  it(`[${movementType}] fraction matches the corresponding time`, () => {
    for (let i = 0; i < times.length; i++) {
      expect(labels[i].fraction).toBe(times[i]);
    }
  });
}

// ── Target frame count rules ──────────────────────────────────────────────────

describe('target frame counts', () => {
  it('landing movements use their exact phase count (not padded to 8)', () => {
    for (const movement of LANDING_MOVEMENTS) {
      const phases = PHASE_MAPS[movement]!;
      const { times } = getPhaseTimes(movement);
      expect(times.length).toBe(phases.length);
    }
  });

  it('non-landing known movements produce exactly 8 frames', () => {
    for (const movement of Object.keys(PHASE_MAPS)) {
      if (LANDING_MOVEMENTS.has(movement) || DENSE_FRAME_MOVEMENTS.has(movement)) continue;
      const { times } = getPhaseTimes(movement);
      expect(times.length).toBe(8);
    }
  });

  it('unknown movement falls back to 8 evenly-spaced frames', () => {
    const { times, labels } = getPhaseTimes('Unknown Exercise XYZ');
    expect(times.length).toBe(8);
    expect(times[0]).toBeCloseTo(0.03, 5);
    expect(labels.every(l => l.id === 'frame')).toBe(true);
  });
});

// ── Specific phase content checks ─────────────────────────────────────────────

describe('phase content', () => {
  it('Hip Hinge / Deadlift Pattern includes Setup and Lockout phases', () => {
    const { labels } = getPhaseTimes('Hip Hinge / Deadlift Pattern');
    const ids = labels.map(l => l.id);
    expect(ids).toContain('setup');
    expect(ids).toContain('lockout');
  });

  it('Running produces 8 frames starting with Initial Contact', () => {
    const { times, labels } = getPhaseTimes('Running');
    expect(times.length).toBe(8);
    expect(labels[0].id).toBe('contact');
    expect(labels[0].label).toBe('Initial Contact');
  });

  it('Drop Jump Landing includes initial-contact frame (ACL key frame)', () => {
    const { labels } = getPhaseTimes('Drop Jump Landing');
    expect(labels.some(l => l.id === 'contact')).toBe(true);
  });

  it('Countermovement Jump includes both bottom and landing-contact frames', () => {
    const { labels } = getPhaseTimes('Countermovement Jump');
    const ids = labels.map(l => l.id);
    expect(ids).toContain('bottom');
    expect(ids).toContain('contact');
  });

  it('Tuck Jump includes two landing frames for fatigue comparison', () => {
    const { labels } = getPhaseTimes('Tuck Jump');
    const ids = labels.map(l => l.id);
    expect(ids).toContain('contact');
    expect(ids).toContain('contact2');
  });
});

// ── Partial match fallback ─────────────────────────────────────────────────────

describe('partial movement name matching', () => {
  // Partial match compares movementType.includes(firstWordOfKey).
  // "Squat assessment" includes "squat" (first word of "Squat (Double-Leg)")
  it('"Squat assessment" matches "Squat (Double-Leg)" phases', () => {
    const { times: exact }   = getPhaseTimes('Squat (Double-Leg)');
    const { times: partial } = getPhaseTimes('Squat assessment');
    expect(partial).toEqual(exact);
  });

  // "Hip mobility screen" includes "hip" (first word of "Hip Hinge / Deadlift Pattern")
  it('"Hip mobility screen" matches "Hip Hinge / Deadlift Pattern" phases', () => {
    const { times: exact }   = getPhaseTimes('Hip Hinge / Deadlift Pattern');
    const { times: partial } = getPhaseTimes('Hip mobility screen');
    expect(partial).toEqual(exact);
  });

  // A string that contains no first-word of any key falls back to generic
  it('"Deadlift" does NOT match any key (first word is "hip", not "deadlift")', () => {
    const { times } = getPhaseTimes('Deadlift');
    // Falls back to 8 generic evenly-spaced frames
    expect(times.length).toBe(8);
    expect(times[0]).toBeCloseTo(0.03, 5);
  });
});

// ── Per-movement invariant checks ─────────────────────────────────────────────

describe('per-movement invariants', () => {
  for (const movement of Object.keys(PHASE_MAPS)) {
    assertInvariants(movement);
  }
  assertInvariants('Unknown Exercise Fallback');
});
