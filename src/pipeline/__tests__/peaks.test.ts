import { describe, it, expect } from 'vitest';
import { findPeaks, findTroughs } from '../movement-analysis/signal/peaks';

describe('findPeaks', () => {
  it('finds a single obvious peak', () => {
    const signal = [0, 1, 3, 1, 0];
    const peaks = findPeaks(signal);
    expect(peaks).toHaveLength(1);
    expect(peaks[0].index).toBe(2);
    expect(peaks[0].value).toBe(3);
  });

  it('finds multiple peaks sorted by index', () => {
    const signal = [0, 2, 0, 3, 0, 1, 0];
    const peaks = findPeaks(signal);
    expect(peaks.map(p => p.index)).toEqual([1, 3, 5]);
  });

  it('respects minProminence', () => {
    const signal = [0, 1, 0, 5, 0, 1, 0];
    const peaks = findPeaks(signal, { minProminence: 2 });
    expect(peaks).toHaveLength(1);
    expect(peaks[0].index).toBe(3);
  });

  it('respects minDistance — keeps higher peak', () => {
    const signal = [0, 3, 0, 4, 0];
    const peaks = findPeaks(signal, { minDistance: 3 });
    expect(peaks).toHaveLength(1);
    expect(peaks[0].index).toBe(3); // higher value wins
  });

  it('returns empty array for monotone signal', () => {
    expect(findPeaks([1, 2, 3, 4])).toHaveLength(0);
  });

  it('returns empty array for signal shorter than 3', () => {
    expect(findPeaks([1, 2])).toHaveLength(0);
  });

  it('computes prominence correctly', () => {
    // Peak at index 2, base is max(min_left, min_right) = max(0, 0) = 0
    const signal = [0, 0, 5, 0, 0];
    const peaks = findPeaks(signal);
    expect(peaks[0].prominence).toBeCloseTo(5);
  });
});

describe('findTroughs', () => {
  it('finds troughs as peaks of negated signal', () => {
    const signal = [0, -2, 0, -3, 0];
    const troughs = findTroughs(signal);
    expect(troughs).toHaveLength(2);
    expect(troughs[0].index).toBe(1);
    expect(troughs[0].value).toBe(-2);
    expect(troughs[1].index).toBe(3);
    expect(troughs[1].value).toBe(-3);
  });

  it('respects minProminence for troughs', () => {
    const signal = [0, -1, 0, -5, 0];
    const troughs = findTroughs(signal, { minProminence: 2 });
    expect(troughs).toHaveLength(1);
    expect(troughs[0].index).toBe(3);
  });
});
