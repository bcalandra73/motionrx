// Zero-phase low-pass filter via fili (4th-order Butterworth, forward–reverse–forward).
// Falls back to Savitzky-Golay window-11 poly-3 if fili is unavailable — slightly less sharp roll-off.

let filiLoaded = false;
let CalcCascades: (typeof import('fili'))['CalcCascades'] | null = null;
let IirFilter: (typeof import('fili'))['IirFilter'] | null = null;

async function tryLoadFili() {
  if (filiLoaded) return;
  filiLoaded = true;
  try {
    const fili = await import('fili');
    CalcCascades = fili.CalcCascades;
    IirFilter = fili.IirFilter;
  } catch {
    // fili unavailable — will use SG fallback
  }
}

// Pre-load eagerly (best-effort)
tryLoadFili();

function savitzkyGolay11(signal: number[]): number[] {
  // Poly-3 SG coefficients for window 11
  const coeffs = [-36, 9, 44, 69, 84, 89, 84, 69, 44, 9, -36].map(c => c / 429);
  const n = signal.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < 11; k++) {
      const idx = Math.max(0, Math.min(n - 1, i - 5 + k));
      sum += coeffs[k] * signal[idx];
    }
    out[i] = sum;
  }
  return out;
}

function reflectPad(signal: number[], padLen: number): number[] {
  const left = signal.slice(1, padLen + 1).reverse();
  const right = signal.slice(-padLen - 1, -1).reverse();
  return [...left, ...signal, ...right];
}

function applyIir(filter: InstanceType<NonNullable<typeof IirFilter>>, signal: number[]): number[] {
  return signal.map(v => (filter as unknown as { singleStep: (v: number) => number }).singleStep(v));
}

export function lowPassFilter(signal: number[], fps: number, cutoffHz = 8): number[] {
  const n = signal.length;
  if (n < 4) return [...signal];

  if (CalcCascades && IirFilter) {
    try {
      const calc = new CalcCascades();
      const coeffs = calc.butterworth({
        order: 4,
        characteristic: 'butterworth',
        Fs: fps,
        Fc: Math.min(cutoffHz, fps / 2 - 0.1),
        gain: 0,
        preGain: false,
        type: 'lowpass',
      });

      const padLen = Math.min(12, Math.floor(n / 2));
      const padded = reflectPad(signal, padLen);

      // Forward pass
      const f1 = new IirFilter(coeffs);
      const fwd = applyIir(f1, padded);
      // Reverse pass
      const f2 = new IirFilter(coeffs);
      const rev = applyIir(f2, [...fwd].reverse());
      // Forward pass again (zero-phase)
      const f3 = new IirFilter(coeffs);
      const fwd2 = applyIir(f3, [...rev].reverse());

      return fwd2.slice(padLen, padLen + n);
    } catch {
      // fall through to SG
    }
  }

  return savitzkyGolay11(signal);
}
