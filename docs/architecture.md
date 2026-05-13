# Architecture

In-depth reference for MotionRx's code organisation. `CLAUDE.md` is the orientation; this file is the detail. Read before any structural change to `src/pipeline/movement-analysis/` or before adding a new movement type.

---

## Movement analysis module (`src/pipeline/movement-analysis/`)

The module is the single authoritative entry point for all movement-type phase selection. The public surface — `analyzeMovement(movementType, frames, fps)` — is exported from `index.ts` and called by `selectPhaseFrames` in `src/pipeline/phaseSelection.ts`. Everything else in the module is internal.

```
movement-analysis/
├── index.ts          # exports analyzeMovement(movementType, frames, fps)
├── types.ts          # PoseFrame, KeyFrame, MovementAnalysisResult, MovementAnalyzer
├── registry.ts       # movementType → analyzer dispatch
├── analyzers/
│   └── running.ts    # Zeni pelvis-relative running analyzer (8 phases)
└── signal/
    ├── landmarks.ts   # LM index constants (MediaPipe 33-point)
    ├── peaks.ts       # findPeaks / findTroughs with prominence + minDistance
    ├── interpolate.ts # visibility-gap linear interpolation
    └── filter.ts      # zero-phase Butterworth (fili) with SG-11 fallback
```

### Responsibilities by file

| File | Responsibility |
|---|---|
| `index.ts` | Public API. Looks up the right analyzer in `registry.ts` and invokes it. |
| `types.ts` | Shared types. `AnalyzableMovement` and `PhaseId` are the source-of-truth unions for "what movement types and phases exist." |
| `registry.ts` | Movement-type → analyzer dispatch. Each new analyzer registers itself here. |
| `analyzers/<type>.ts` | Per-movement-type analyzer implementing `MovementAnalyzer`. Stateless, pure. |
| `signal/landmarks.ts` | Constants for MediaPipe landmark indices (see table below). |
| `signal/peaks.ts` | `findPeaks` / `findTroughs` with prominence and `minDistance` controls. |
| `signal/interpolate.ts` | `interpolateLowVisibility` fills short low-visibility gaps in a signal. |
| `signal/filter.ts` | Zero-phase Butterworth low-pass filter (fili) with a Savitzky-Golay 11-point fallback. |

### Design rules

- **Analyzers are pure functions.** No I/O, no state, no React, no DOM. Given the same input they produce the same output. This keeps unit tests fast and makes failures reproducible from a saved fixture.
- **Signal utilities are reusable across analyzers.** If you find yourself reimplementing peak detection or filtering inside an analyzer, move it down into `signal/` instead.
- **Each analyzer owns its movement-type knowledge.** The registry doesn't know about phase definitions or biomechanics — those live entirely inside the analyzer file.

---

## MediaPipe landmark indices

MotionRx uses MediaPipe's 33-point pose format. Constants live in `signal/landmarks.ts`. The indices most often referenced by the running analyzer:

| Body part | Left | Right |
|---|---|---|
| Hip | 23 | 24 |
| Knee | 25 | 26 |
| Ankle | 27 | 28 |
| Heel | 29 | 30 |
| Foot index (big-toe area) | 31 | 32 |

Full diagram and the rest of the 33 landmarks: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker.

When you reference landmarks in new code, import the named constants from `signal/landmarks.ts` rather than hard-coding the numbers. This keeps the meaning visible at the call site and makes search/replace safer.

---

## Adding a new movement type

There are two paths depending on whether the movement is gait-like (needs biomechanical signal analysis) or not (uniform frame sampling is good enough).

### Non-gait movement (uniform sampling)

Use this path for movements where you don't need event detection — squats, jumps, overhead press, sit-to-stand, etc. The existing path samples 8 frames uniformly across the movement cycle.

1. Add phase timestamps to `PHASE_MAPS` in `src/data/phaseMaps.ts`. Update `getPhaseTimes.test.ts` to cover the new entry.
2. Determine which angle metrics apply for the relevant camera views (side / front / posterior) and verify `extractAngles` covers them. Add new metrics if needed.
3. Add movement-specific normative ranges to `REF_RANGES` and update `buildReportPrompt` so the report includes them.
4. Add a real test case under `test_data/` (a real video plus `test.yaml`) and run the E2E pipeline against it to validate end-to-end. See `docs/test-data.md`.
5. Update `reportGeneration.test.ts` for any `buildReportPrompt` changes.

### Gait-like movement (needs biomechanical signal analysis)

Use this path when the movement has discrete events that need to be detected from the signal (foot contacts, toe-offs, peak flexion, etc.). Running is the canonical example.

1. Create `src/pipeline/movement-analysis/analyzers/<type>.ts` implementing the `MovementAnalyzer` interface from `types.ts`.
2. Register it in `registry.ts`.
3. Extend the `AnalyzableMovement` and `PhaseId` unions in `types.ts` with the new movement type and any new phase names.
4. Update the `isGait` regex in `selectPhaseFrames` (in `src/pipeline/phaseSelection.ts`) so the dispatcher routes this movement type to the analyzer path instead of uniform sampling.
5. Add unit tests in `src/pipeline/__tests__/`. Cover at minimum: 8-phase output shape, edge cases (no events detected, single event, ambiguous direction), and one synthetic-fixture happy path.
6. Add a real test case under `test_data/` and run the E2E pipeline against it.
7. Write a per-analyzer reference doc in `docs/` modelled on `docs/running-analyzer.md`. Future Claude sessions will need it.

In both paths, finish by appending an entry to `CHANGELOG.md`.
