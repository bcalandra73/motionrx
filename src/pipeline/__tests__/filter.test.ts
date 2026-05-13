import { describe, it, expect } from 'vitest';
import { lowPassFilter } from '../movement-analysis/signal/filter';

const TWO_PI = 2 * Math.PI;

function generateSine(freq: number, fps: number, durationS: number): number[] {
  const n = Math.round(fps * durationS);
  return Array.from({ length: n }, (_, i) => Math.sin(TWO_PI * freq * i / fps));
}

describe('lowPassFilter', () => {
  it('passes through a DC signal unchanged', () => {
    const dc = new Array(100).fill(3.5);
    const out = lowPassFilter(dc, 60, 8);
    out.forEach(v => expect(v).toBeCloseTo(3.5, 1));
  });

  it('attenuates high-frequency noise above cutoff', () => {
    const fps = 60;
    // 2 Hz signal (below cutoff=8) + 25 Hz noise (above cutoff)
    const n = fps * 3;
    const signal = Array.from({ length: n }, (_, i) => {
      return Math.sin(TWO_PI * 2 * i / fps) + 0.5 * Math.sin(TWO_PI * 25 * i / fps);
    });
    const filtered = lowPassFilter(signal, fps, 8);
    // RMS of residual (difference from clean 2Hz) should be much less than 0.5
    const clean2Hz = generateSine(2, fps, 3);
    const residual = filtered.map((v, i) => v - clean2Hz[i]);
    const rms = Math.sqrt(residual.reduce((s, v) => s + v * v, 0) / n);
    expect(rms).toBeLessThan(0.15);
  });

  it('preserves low-frequency sinusoid phase (zero-phase property)', () => {
    const fps = 60;
    const freq = 2; // well below cutoff
    const signal = generateSine(freq, fps, 3);
    const filtered = lowPassFilter(signal, fps, 8);
    // Cross-correlate to check lag; max correlation should be at lag 0
    const n = signal.length;
    let maxCorr = -Infinity, maxLag = 0;
    for (let lag = -5; lag <= 5; lag++) {
      let corr = 0;
      for (let i = 5; i < n - 5; i++) {
        const j = i + lag;
        if (j >= 0 && j < n) corr += filtered[i] * signal[j];
      }
      if (corr > maxCorr) { maxCorr = corr; maxLag = lag; }
    }
    expect(Math.abs(maxLag)).toBeLessThanOrEqual(1);
  });

  it('handles short signals gracefully', () => {
    expect(() => lowPassFilter([1, 2, 3], 60)).not.toThrow();
    expect(lowPassFilter([], 60)).toEqual([]);
  });
});
