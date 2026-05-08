# GaitFSM — Phase Selection Logic for Running

Source: `src/pipeline/phaseSelection.ts` → `runGaitFSM()`

---

## Overview

`runGaitFSM` receives smoothed MediaPipe landmarks for every extracted frame and returns 8 frames corresponding to the canonical running gait phases. It operates entirely in "proportion space" (0→1 across the frame array) and uses the reference leg's first detected gait cycle as the analysis window.

---

## Stage 1 — Per-frame signal extraction

For each frame, the following values are extracted (landmarks below visibility threshold 0.18 are treated as `null`):

| Signal | Landmarks | Notes |
|---|---|---|
| `lAnkY` / `rAnkY` | 27 / 28 | Y increases downward; grounded foot has larger Y |
| `lAnkX` / `rAnkX` | 27 / 28 | Used for ankle-forward detection |
| `lKnee` / `rKnee` | 23/25/27, 24/26/28 | Hip→knee→ankle angle in degrees |
| `lHip` / `rHip` | 11/23/25, 12/24/26 | Shoulder→hip→knee angle, capped at 90° |
| `noseX` / `hipMidX` | 0, 23+24 | Used to determine walking direction |

A 5-point weighted smoother (`smooth5`, weights: centre=2, ±1=1.5, ±2=1) is applied to all signals before peak detection.

> If fewer than 4 valid frames are found after filtering, the FSM returns `frames.slice(0, 8)` as a fallback.

---

## Stage 2 — Composite contact signal

For each leg, ankle-Y and knee angle are each normalised to [0, 1] across all frames, then blended:

```
composite = wA × normalised_ankleY + wK × normalised_kneeAngle
```

**Adaptive weighting** based on ankle signal quality:

| Condition | wA | wK |
|---|---|---|
| Ankle Y range ≥ 0.04 (normal) | 0.55 | 0.45 |
| Ankle Y range < 0.04 (weak — treadmill, posterior view) | 0.30 | 0.70 |

The composite signal peaks when the foot is on the ground (ankle is low/Y large and knee is extended).

---

## Stage 3 — Reference leg and gait cycle

`localMaxima` finds peaks in each leg's composite signal with a minimum prominence of `max(0.08, range × 0.15)`.

**Reference leg selection:** defaults to Left unless the Right leg has both more visible frames *and* more contact peaks.

**Gait cycle bounds:**

| Peaks found | cycleStart | cycleEnd |
|---|---|---|
| ≥ 2 | `refC[0]` | `refC[1]` |
| 1 | `peak − 1 frame` | `peak + 70% of N` |
| 0 | `0` | `N − 1` |

All downstream phase positions are expressed as percentages of `cycleLen = cycleEnd − cycleStart`.

**Facing direction** (`icIsMin`): mean of (noseX − hipMidX) across all frames. If negative, the subject walks right→left, which inverts the ankle-forward computation for initial contact detection.

---

## Stage 4 — Event detection

All positions are relative to `r0 = cycleStart`. REF = reference leg, OPP = opposite leg.

| Phase | Signal | Window | Method |
|---|---|---|---|
| **contact** | REF knee + ankle-forward | `[r0 − 18%, r0 − 1%]` | Side view: max of `0.55 × kneeNorm + 0.45 × ankleForwardNorm`. Other views: max knee angle. Finds the most extended, forward foot position just before loading. |
| **loading** | — | `r0` exactly | The composite contact peak itself — foot fully loaded. |
| **midstance** | REF ankle X | `[r0 + 8%, r0 + 20%]` | Side view: frame where `\|ankleX − hipMidX\|` is minimised (ankle directly under hip). Other views: fixed `+13%`. |
| **propulsion** | — | `r0 + 27%` | Fixed position — no search window. |
| **toeoff** | REF hip angle | `[r0 + 34%, r0 + 44%]` | Minimum hip angle = hip most extended = push-off. |
| **earlyswing** | OPP composite | `[r0 + 44%, r0 + 59%]` | OPP contact peak nearest to `+51%`; falls back to max OPP ankle Y in window. |
| **midswing** | REF ankle Y | `[r0 + 56%, r0 + 74%]` | Minimum REF ankle Y = foot highest in swing. |
| **lateswing** | OPP hip angle | `[r0 + 68%, r0 + 86%]` | Minimum OPP hip angle = opposite leg most extended before its next contact. |

---

## Stage 5 — Frame assignment

For each of the 8 phases in order:

1. Take `detectedEventIndex ± 8% of cycleLen` as the candidate window
2. Apply `effectiveFMin` — enforce strict temporal ordering (each frame must come after the previous)
3. Prefer frames that fall exactly on a detected event index; otherwise pick the closest frame to the ideal position
4. Mark the frame index as used — no frame can be assigned to two phases

Results are sorted by canonical phase order before returning.

---

## Known failure modes

| Failure | Cause | Symptom |
|---|---|---|
| Fewer than 8 phases returned | `cycleLen` too small → windows collapse to ±0 frames | Phases skipped in output |
| Wrong reference leg | Low landmark visibility on one side | Phases labelled for wrong leg |
| Poor contact detection | Weak ankle signal (treadmill / posterior view) | FSM falls back to knee-dominant weighting, less precise |
| Partial cycle | Only one contact peak detected | `cycleEnd` estimated from `+70% of N`; later phases may be inaccurate |

### Frame density requirement

The FSM parameters were calibrated for ~10 fps (≈20 frames over a 2 s clip). Dense input (30+ fps from WebCodecs) is subsampled to ≤20 frames before the FSM runs. The `.index` fields on subsampled frames still reference the original frame array, so all downstream lookups remain correct.
