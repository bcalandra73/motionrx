export interface PeakOptions {
  minDistance?: number;
  minProminence?: number;
}

export interface Peak {
  index: number;
  value: number;
  prominence: number;
}

export function findPeaks(signal: number[], opts: PeakOptions = {}): Peak[] {
  const { minDistance = 1, minProminence = 0 } = opts;
  const n = signal.length;
  const candidates: Peak[] = [];

  for (let i = 1; i < n - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] >= signal[i + 1]) {
      // Walk left until we find a sample >= signal[i] or array start; track min seen
      let leftMin = signal[i - 1];
      for (let j = i - 1; j >= 0; j--) {
        if (signal[j] >= signal[i]) break;
        if (signal[j] < leftMin) leftMin = signal[j];
      }
      // Walk right until we find a sample >= signal[i] or array end; track min seen
      let rightMin = signal[i + 1];
      for (let j = i + 1; j < n; j++) {
        if (signal[j] >= signal[i]) break;
        if (signal[j] < rightMin) rightMin = signal[j];
      }
      const base = Math.max(leftMin, rightMin);
      const prominence = signal[i] - base;
      if (prominence >= minProminence) {
        candidates.push({ index: i, value: signal[i], prominence });
      }
    }
  }

  // Greedy minDistance enforcement: sort by descending value, accept in order
  candidates.sort((a, b) => b.value - a.value);
  const accepted: Peak[] = [];
  for (const c of candidates) {
    if (accepted.every(a => Math.abs(a.index - c.index) >= minDistance)) {
      accepted.push(c);
    }
  }
  accepted.sort((a, b) => a.index - b.index);
  return accepted;
}

export function findTroughs(signal: number[], opts: PeakOptions = {}): Peak[] {
  const negated = signal.map(v => -v);
  return findPeaks(negated, opts).map(p => ({
    index: p.index,
    value: signal[p.index],
    prominence: p.prominence,
  }));
}
