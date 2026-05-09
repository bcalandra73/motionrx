import { describe, it, expect } from 'vitest';
import { interpolateLowVisibility } from '../movement-analysis/signal/interpolate';

describe('interpolateLowVisibility', () => {
  it('leaves high-visibility values unchanged', () => {
    const vals = [1, 2, 3, 4];
    const vis  = [0.9, 0.9, 0.9, 0.9];
    const { values } = interpolateLowVisibility(vals, vis);
    expect(values).toEqual([1, 2, 3, 4]);
  });

  it('linearly interpolates a short gap in the middle', () => {
    const vals = [0, 0, 0, 0, 4];
    const vis  = [0.9, 0.1, 0.1, 0.1, 0.9];
    const { values, gapsTooLarge } = interpolateLowVisibility(vals, vis);
    expect(gapsTooLarge).toHaveLength(0);
    expect(values[0]).toBe(0);
    expect(values[4]).toBe(4);
    // interpolated values should be between 0 and 4
    expect(values[1]).toBeGreaterThan(0);
    expect(values[3]).toBeLessThan(4);
    // monotonically increasing
    expect(values[1]).toBeLessThan(values[2]);
    expect(values[2]).toBeLessThan(values[3]);
  });

  it('flags gaps too large to interpolate', () => {
    const vals = [1, 0, 0, 0, 0, 0, 0, 0, 2]; // gap of 7 > default maxGapFrames=5
    const vis  = [0.9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9];
    const { gapsTooLarge } = interpolateLowVisibility(vals, vis);
    expect(gapsTooLarge).toHaveLength(1);
    expect(gapsTooLarge[0]).toBe(1);
  });

  it('holds left value for gap at end of signal', () => {
    const vals = [5, 0, 0];
    const vis  = [0.9, 0.1, 0.1];
    const { values } = interpolateLowVisibility(vals, vis, 0.5, 5);
    expect(values[1]).toBe(5);
    expect(values[2]).toBe(5);
  });

  it('holds right value for gap at start of signal', () => {
    const vals = [0, 0, 7];
    const vis  = [0.1, 0.1, 0.9];
    const { values } = interpolateLowVisibility(vals, vis, 0.5, 5);
    expect(values[0]).toBe(7);
    expect(values[1]).toBe(7);
  });

  it('respects custom threshold — interpolates sample below threshold', () => {
    // vis[1]=0.3 is below threshold=0.4, so index 1 should be interpolated
    // Linear interp between 1 and 5 gives 3 (midpoint of gap-len-1 gap)
    const vals = [1, 99, 5];
    const vis  = [0.9, 0.3, 0.9];
    const { values } = interpolateLowVisibility(vals, vis, 0.4);
    // Interpolated: t = (1-1+1)/(1+1) = 0.5 → 1 + 0.5*(5-1) = 3
    expect(values[1]).toBeCloseTo(3);
  });

  it('leaves sample above threshold unchanged', () => {
    const vals = [1, 99, 5];
    const vis  = [0.9, 0.9, 0.9]; // 0.9 >= 0.4, nothing interpolated
    const { values } = interpolateLowVisibility(vals, vis, 0.4);
    expect(values[1]).toBe(99);
  });
});
