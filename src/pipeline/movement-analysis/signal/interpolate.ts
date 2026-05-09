export function interpolateLowVisibility(
  values: number[],
  visibilities: number[],
  threshold = 0.5,
  maxGapFrames = 5,
): { values: number[]; gapsTooLarge: number[] } {
  const n = values.length;
  const out = [...values];
  const gapsTooLarge: number[] = [];

  let i = 0;
  while (i < n) {
    if (visibilities[i] < threshold) {
      // Find gap end
      let j = i;
      while (j < n && visibilities[j] < threshold) j++;
      const gapLen = j - i;

      // Find boundary values
      const leftVal = i > 0 ? out[i - 1] : null;
      const rightVal = j < n ? values[j] : null;

      if (gapLen > maxGapFrames) {
        gapsTooLarge.push(i);
        // Hold nearest valid value as fallback
        for (let k = i; k < j; k++) {
          if (leftVal !== null) out[k] = leftVal;
          else if (rightVal !== null) out[k] = rightVal;
        }
      } else {
        // Linear interpolation
        for (let k = i; k < j; k++) {
          if (leftVal !== null && rightVal !== null) {
            const t = (k - i + 1) / (gapLen + 1);
            out[k] = leftVal + t * (rightVal - leftVal);
          } else if (leftVal !== null) {
            out[k] = leftVal;
          } else if (rightVal !== null) {
            out[k] = rightVal;
          }
        }
      }
      i = j;
    } else {
      i++;
    }
  }

  return { values: out, gapsTooLarge };
}
