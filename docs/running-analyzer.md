# Running Phase Analyzer — Zeni Pelvis-Relative Method

Source: `src/pipeline/movement-analysis/analyzers/running.ts` → `runningAnalyzer`

---

## Overview

`runningAnalyzer` receives MediaPipe pose frames and the capture FPS, and returns 8 `KeyFrame` objects corresponding to the canonical running gait phases. It uses the Zeni method: foot positions are expressed relative to the pelvis and sign-corrected for travel direction, so peaks in the heel signal mark initial contact (IC) and troughs in the toe signal mark toe-off (TO).

---

## Stage 1 — Signal preparation

**Pelvis reference:** midpoint of left/right hip X across all frames.

**Forward direction detection** (`detectForwardSign`):
- *Primary:* nose is in front of the ears in a side-on view. If `nose.x > ear.x`, subject faces right (+1); otherwise left (−1). Requires ≥20% of frames with visible nose.
- *Fallback:* foot-index ahead of heel (averaged across both sides).
- If neither yields a confident result, `ambiguous = true` and a warning is emitted.

**Per-side signals** (left and right, for heel / toe / ankle):
1. Raw X values extracted from MediaPipe landmarks.
2. `interpolateLowVisibility` fills short low-visibility gaps.
3. `lowPassFilter` (zero-phase Butterworth, fili library) smooths the signal.
4. Sign-correct and make pelvis-relative: `fwdSign × (landmark.x − pelvisX[i])`.

This yields `heelFwd`, `toeFwd`, and `ankleFwd` for each side.

---

## Stage 2 — IC and TO event detection

| Signal | Method | Events |
|---|---|---|
| `heelFwd` | `findPeaks` | Initial contact (IC) — heel furthest ahead of pelvis |
| `toeFwd` | `findTroughs` | Toe-off (TO) — toe furthest behind pelvis |

Both use `minDistance = fps × 0.25` and `minProminence = 0.02`.

---

## Stage 3 — Reference side selection

| Condition | Reference side |
|---|---|
| Direction unambiguous (`fwdSign > 0`) | Right (near leg when facing right) |
| Direction unambiguous (`fwdSign < 0`) | Left |
| Ambiguous direction | Side with higher total IC prominence |

The opposite side is used for `earlyswing` and `lateswing` anchors.

If the reference side has fewer than 2 IC events, a `FEW_STRIDES` warning is emitted.

---

## Stage 4 — Phase derivation

All phases are derived from the first detected IC on the reference side (`ic0`).

**Stride length:** `IC[1].index − IC[0].index` when ≥2 IC events exist; otherwise `fps × 0.55`.

| Phase | Signal / method | Detail |
|---|---|---|
| **contact** | Ref heel IC peak | First `heelFwd` peak index |
| **loading** | Fixed offset | `contactIdx + 8% of strideLen` |
| **midstance** | `ankleFwd` zero-crossing | Frame where ref ankle transitions from ahead to behind pelvis, searched between IC and TO |
| **propulsion** | Midpoint | `(midstanceIdx + toIdx) / 2` |
| **toeoff** | Ref toe TO trough | First `toeFwd` trough after contact |
| **lateswing** | Opp toe TO trough | Nearest opposite-side `toeFwd` trough after toeoff |
| **earlyswing** | Swing subdivision | `toeIdx + ⌊swingSpan / 3⌋` |
| **midswing** | Swing subdivision | `toeIdx + ⌊(swingSpan × 2) / 3⌋` |

`swingSpan = lateIdx − toIdx`. When TO is not detected, toeoff falls back to `contactIdx + 60% of strideLen`.

---

## Stage 5 — Deduplication

`keyFrames` are sorted by `frameIndex`. Any frame whose index collides with the previous one is nudged forward by 1 (capped at `n − 1`).

---

## Confidence scoring

Each `KeyFrame` carries a `confidence` value in [0, 1]:

```
confidence = 0.5 × visScore + 0.5 × promScore
```

- `visScore`: mean landmark visibility in a ±3-frame window around the event, normalised to 0.8.
- `promScore`: event prominence relative to the median prominence of all same-type events on that side.

Fixed-position phases (loading, propulsion, earlyswing, midswing) use static confidence values (0.4–0.5).

---

## Warnings

| Code | Condition |
|---|---|
| `LOW_FPS` | `fps < 60` |
| `AMBIGUOUS_DIRECTION` | Direction detection indeterminate |
| `LOW_VISIBILITY:<LM>` | Mean visibility < 0.5 for a key landmark (heel, ankle, foot index) |
| `FEW_STRIDES` | Fewer than 2 IC events on the reference side |
| `UNINTERPOLABLE_GAP:<label>:<range>` | Visibility gap too large to interpolate |

---

## Fallback — no IC detected

If `refIC.length === 0`, the analyzer returns 8 uniformly-spaced frames with `confidence: 0` instead of running event detection.

---

## Known failure modes

| Failure | Cause | Symptom |
|---|---|---|
| Uniform fallback returned | No IC peaks detected | All 8 frames evenly spaced, zero confidence |
| Stride length estimated | Only 1 IC detected | `strideLen = fps × 0.55`; later phases may drift |
| Wrong reference side | Low heel visibility or ambiguous direction | Phases labelled for wrong leg |
| Swing phases compressed | `toeIdx ≈ lateIdx` | earlyswing / midswing almost identical frames |
| Poor TO detection | Weak toe signal | Toeoff falls back to `+60% of strideLen` |
