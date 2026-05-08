# Movement Analysis Module — Implementation Plan

## 1. Overview

Replace `runGaitFSM` in `src/pipeline/phaseSelection.ts` with a new Zeni pelvis-relative running
analyzer that is modular, unit-testable, and extensible to other movement types.

Initial scope: **running gait** using the **Zeni et al. (2008)** method. The architecture must
accommodate additional movement types (squat, jump, etc.) by implementing a single interface.

Video decoding and MediaPipe inference are out of scope — this module receives their outputs.

---

## 2. Goals & Non-Goals

**Goals**
- Pure TypeScript, runs in the browser, no Node-only APIs.
- Modular: adding a new movement type = adding one new analyzer file.
- Deterministic, easily unit-testable (pure functions where possible).
- Slots into the existing `selectPhaseFrames` call-site with minimal changes.
- Returns frame indices + event labels; does not own frame data.

**Non-goals**
- Video decoding, MediaPipe invocation, rendering/visualization.
- Real-time / streaming analysis (input is a complete sequence).
- Treadmill-specific calibration (note as future work).

---

## 3. Project Structure

New files live **inside the existing pipeline folder** to match project conventions:

```
src/pipeline/
├── phaseSelection.ts              # existing — isGait branch calls analyzeMovement()
├── movement-analysis/
│   ├── index.ts                   # public entry point: export analyzeMovement()
│   ├── types.ts                   # module-local types (KeyFrame, analyzer interface, etc.)
│   ├── registry.ts                # movementType → analyzer dispatch
│   ├── analyzers/
│   │   └── running.ts             # Zeni-method running analyzer
│   └── signal/
│       ├── filter.ts              # low-pass filter
│       ├── peaks.ts               # peak/trough detection
│       ├── interpolate.ts         # visibility-gap interpolation
│       └── landmarks.ts           # named landmark index constants
└── __tests__/
    ├── filter.test.ts             # existing test folder — add here
    ├── peaks.test.ts
    ├── interpolate.test.ts
    └── running.test.ts
```

---

## 4. Types

### 4.1 Reuse from `src/types/index.ts`

Do **not** redefine types that already exist in the project. Import from `../../types`:

```typescript
import type { NormalizedLandmark } from '../../types';
// NormalizedLandmark = { x, y, z, visibility?: number }
```

### 4.2 Module-local types (`movement-analysis/types.ts`)

```typescript
import type { NormalizedLandmark } from '../../types';

// Matches the existing project movementType string convention (capital first letter).
// Extend the union as new analyzers are added.
export type AnalyzableMovement = 'Running'; // | 'Gait / Walking' | ...

export type Side = 'left' | 'right';

// One frame's worth of pose data — mirrors PoseFrameResult from poseDetection.ts
export interface PoseFrame {
  frameIndex: number;    // 0-based index into the original frames array
  timestampMs: number;   // ms from video start (use ExtractedFrame.timestamp * 1000)
  landmarks: NormalizedLandmark[];  // length 33, MediaPipe indices
}

// Phase IDs must match the id strings in PHASE_MAPS['Running'] exactly.
export type RunningPhaseId =
  | 'contact'
  | 'loading'
  | 'midstance'
  | 'propulsion'
  | 'toeoff'
  | 'earlyswing'
  | 'midswing'
  | 'lateswing';

export type PhaseId = RunningPhaseId; // union grows with movement types

export interface KeyFrame {
  frameIndex: number;    // index into the PoseFrame[] input array
  timestampMs: number;
  phaseId: PhaseId;
  side: Side;
  confidence: number;    // [0,1] — informational; not used to filter
}

export interface MovementAnalysisResult {
  keyFrames: KeyFrame[];  // sorted by frameIndex ascending
  warnings: string[];     // non-fatal issues
  refSide: Side;          // which side was used as the reference leg
}

export class MovementAnalysisError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MovementAnalysisError';
  }
}

export interface MovementAnalyzer {
  readonly movementType: AnalyzableMovement;
  analyze(frames: PoseFrame[], fps: number): MovementAnalysisResult;
}
```

### 4.3 Landmark index constants (`signal/landmarks.ts`)

```typescript
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;
```

---

## 5. Public API (`movement-analysis/index.ts`)

```typescript
export function analyzeMovement(
  movementType: AnalyzableMovement,
  frames: PoseFrame[],
  fps: number,
): MovementAnalysisResult;
```

The function:
1. Validates input: non-empty, `fps > 0`, supported `movementType`.
2. Looks up the analyzer via the registry.
3. Runs it and returns the result.
4. Throws `MovementAnalysisError` on unrecoverable issues:
   - `'EMPTY_INPUT'` — zero frames
   - `'INSUFFICIENT_FRAMES'` — fewer than 4 frames
   - `'UNSUPPORTED_MOVEMENT_TYPE'`

---

## 6. Signal Processing Utilities

### 6.1 `signal/interpolate.ts`

```typescript
export function interpolateLowVisibility(
  values: number[],
  visibilities: number[],
  threshold?: number,     // default 0.5
  maxGapFrames?: number,  // default 5
): { values: number[]; gapsTooLarge: number[] };
```

- Marks samples where `visibility[i] < threshold` as missing.
- Linearly interpolates across gaps up to `maxGapFrames`.
- Returns indices of gaps too large to interpolate (caller emits a warning).
- Endpoints: hold nearest valid value.

### 6.2 `signal/filter.ts`

Zero-phase low-pass filter to suppress jitter before peak detection.

**Preferred: `fili`** (browser-compatible IIR/FIR design):
```bash
npm install fili
```

```typescript
export function lowPassFilter(signal: number[], fps: number, cutoffHz?: number): number[];
// cutoffHz default: 8 (appropriate for running kinematics)
```

Implementation: 4th-order Butterworth via `fili.CalcCascades`, applied forward–reverse–forward
(zero-phase, analogous to `filtfilt`). Pad signal with reflected edges (length ≈ 3× filter order)
to reduce edge artefacts.

**Fallback** (no dependency): Savitzky-Golay window-11 poly-3 implemented inline. Note the
trade-off (slightly less sharp roll-off) in a one-line code comment.

### 6.3 `signal/peaks.ts`

```typescript
export interface PeakOptions {
  minDistance?: number;    // samples; reject peaks closer than this
  minProminence?: number;  // signal units
}

export interface Peak {
  index: number;
  value: number;
  prominence: number;
}

export function findPeaks(signal: number[], opts?: PeakOptions): Peak[];
export function findTroughs(signal: number[], opts?: PeakOptions): Peak[];
// findTroughs = findPeaks on the negated signal
```

Algorithm:
1. Find all `i` where `signal[i] > signal[i-1]` and `signal[i] >= signal[i+1]`.
2. Compute prominence: walk left/right until a sample ≥ candidate (or array end); base = higher
   of the two minima; prominence = `signal[i] - base`.
3. Filter by `minProminence`.
4. Greedy `minDistance` enforcement: sort by descending value, accept in order, reject any within
   `minDistance` of an already-accepted peak.
5. Return sorted by `index` ascending.

---

## 7. Registry (`registry.ts`)

```typescript
import { runningAnalyzer } from './analyzers/running';

const analyzers: Partial<Record<AnalyzableMovement, MovementAnalyzer>> = {
  'Running': runningAnalyzer,
};

export function getAnalyzer(type: AnalyzableMovement): MovementAnalyzer { ... }
```

Adding a new movement type = create `analyzers/<type>.ts`, register here, extend `AnalyzableMovement`
and `PhaseId` unions.

---

## 8. Running Analyzer — Zeni Method (`analyzers/running.ts`)

### 8.1 Algorithm

**Step 1 — Build pelvis-relative position signals:**
```
pelvis_x(t) = (landmarks[LEFT_HIP].x + landmarks[RIGHT_HIP].x) / 2
heel_rel_S(t)  = landmarks[S_HEEL].x  - pelvis_x(t)
toe_rel_S(t)   = landmarks[S_FOOT_INDEX].x - pelvis_x(t)
ankle_rel_S(t) = landmarks[S_ANKLE].x - pelvis_x(t)
```

**Step 2 — Determine forward direction:**
```
forward_sign = sign( mean( foot_index_x - heel_x, all frames, both feet ) )
```
Robust to panning cameras; works on treadmill where pelvis x is nearly stationary.
If `|mean| < 0.01`, emit `"AMBIGUOUS_DIRECTION"` warning and assume +1.

**Step 3 — Sign-correct signals so "more positive = more forward":**
```
heel_fwd_S(t)  = forward_sign * heel_rel_S(t)
toe_fwd_S(t)   = forward_sign * toe_rel_S(t)
ankle_fwd_S(t) = forward_sign * ankle_rel_S(t)
```

**Step 4 — Preprocess each signal:**
1. `interpolateLowVisibility` (using the relevant landmark's visibility series).
2. `lowPassFilter` at 8 Hz.

**Step 5 — Detect primary biomechanical events per side:**

For each side `S ∈ {left, right}`:

- **Initial contact (IC)** → maps to `'contact'` (ref side) / `'earlyswing'` (opp side):
  peaks of `heel_fwd_S` — heel is most forward of pelvis.
  ```typescript
  findPeaks(heel_fwd_S, {
    minDistance: Math.round(fps * 0.25),
    minProminence: 0.02,
  });
  ```

- **Toe-off (TO)** → maps to `'toeoff'` (ref side) / `'lateswing'` (opp side):
  troughs of `toe_fwd_S` — toe is most behind pelvis.
  ```typescript
  findTroughs(toe_fwd_S, { minDistance: Math.round(fps * 0.25), minProminence: 0.02 });
  ```

- **Midstance**: frame where `ankle_fwd_S` crosses zero between IC and the following ipsilateral
  TO (ankle passes directly under pelvis). Use linear interpolation to pick the closer integer frame.

**Step 6 — Derive remaining gait phase frames:**

The Zeni method directly yields IC, midstance, and TO per side. The remaining 8-phase slots from
`PHASE_MAPS['Running']` are derived from these anchors:

| Phase ID     | Side | Derived from |
|---|---|---|
| `contact`    | ref  | ref IC |
| `loading`    | ref  | ref IC + ~8% of stride |
| `midstance`  | ref  | ref ankle-pelvis zero-crossing |
| `propulsion` | ref  | midpoint(midstance → ref TO) |
| `toeoff`     | ref  | ref TO |
| `earlyswing` | opp  | opp IC (nearest to 51% of cycle) |
| `midswing`   | ref  | ankle minimum in swing window |
| `lateswing`  | opp  | opp TO |

Percentage offsets are relative to the detected IC-to-IC stride length, not a fixed frame count.
Emit `KeyFrame` with the corresponding `phaseId` for each.

**Step 7 — Confidence scoring:**

For each detected event, `confidence ∈ [0, 1]`:
- Mean visibility of the relevant landmark in a ±3-frame window (weight 0.5).
- Normalized prominence relative to median prominence of all detected peaks of that type,
  capped at 1.0 (weight 0.5).

Confidence is informational — PT decides how to use it downstream.

**Step 8 — Assemble output:**

Emit one `KeyFrame` per phase. Sort by `frameIndex` ascending. Include `refSide` in result.

### 8.2 Warnings

- `"LOW_FPS"` — `fps < 60` (stance phase accuracy degrades).
- `"AMBIGUOUS_DIRECTION"` — forward direction unclear.
- `"LOW_VISIBILITY:<landmark>"` — mean visibility of a required landmark < 0.5.
- `"FEW_STRIDES"` — fewer than 2 IC events per side detected.
- `"UNINTERPOLABLE_GAP:<landmark>:<startFrame>-<endFrame>"` — gap too long to interpolate.

### 8.3 Module shape

```typescript
export const runningAnalyzer: MovementAnalyzer = {
  movementType: 'Running',
  analyze(frames, fps): MovementAnalysisResult {
    // Steps 1–8. Return { keyFrames, warnings, refSide }.
  },
};
```

Keep steps 1–7 as pure helper functions inside the file (or a subfolder if > ~300 lines). Each
helper: plain arrays in, plain arrays/objects out.

---

## 9. Integration with `phaseSelection.ts`

The new module replaces `runGaitFSM` in the `isGait` branch of `selectPhaseFrames`.

```typescript
// phaseSelection.ts — isGait branch (replaces existing runGaitFSM call)
import { analyzeMovement } from './movement-analysis';
import type { PoseFrame } from './movement-analysis/types';

// Convert ExtractedFrame[] + PoseFrameResult[] → PoseFrame[]
const poseFrames: PoseFrame[] = frames
  .map((f, i) => {
    const lms = poseResults[i]?.poseLandmarks;
    if (!lms) return null;
    return { frameIndex: i, timestampMs: f.timestamp * 1000, landmarks: lms };
  })
  .filter(Boolean) as PoseFrame[];

const result = analyzeMovement('Running', poseFrames, fps);

// Map KeyFrame[] back to ExtractedFrame[] with PhaseLabel attached
const phaseMap = PHASE_MAPS['Running'] ?? [];
const selected: ExtractedFrame[] = result.keyFrames.map(kf => {
  const phaseDef = phaseMap.find(p => p.id === kf.phaseId);
  const sideStr  = kf.side === 'left' ? 'Left' : 'Right';
  return {
    ...frames[kf.frameIndex],
    phase: {
      id: kf.phaseId,
      label: `${sideStr} ${phaseDef?.label ?? kf.phaseId}`,
      desc: `${sideStr} leg — ${phaseDef?.desc ?? ''}`,
      fraction: kf.timestampMs / (frames.at(-1)!.timestamp * 1000),
    },
  };
});
```

### 9.1 Diagnostics compatibility

`PhaseSelectionDiagnostics.gaitFSM` currently holds `GaitFSMDiagnostics`. After replacement,
update `GaitFSMDiagnostics` (or replace it) to surface the equivalent data from
`MovementAnalysisResult`:
- `refSide`, detected IC indices, TO indices, warnings → map to existing fields where used by UI.
- Remove fields only the old algorithm produced (composite signals, `icIsMin`, etc.) unless the UI
  still consumes them.

Check `src/App.tsx` and `src/runner/runner.ts` for any reads of `diag.gaitFSM` before removing fields.

### 9.2 Runner / E2E compliance (CLAUDE.md requirement)

After any pipeline change, update:
- `src/runner/runner.ts` — ensure it surfaces the new `warnings[]` from `MovementAnalysisResult`.
- `scripts/run-pipeline.ts` — no changes expected unless new CLI behaviour is added.

---

## 10. Dependencies

- `fili` — IIR/FIR filter design. Browser-compatible. No other runtime deps.
- Dev: `vitest` (already in project).

---

## 11. Testing

Tests live in `src/pipeline/__tests__/` alongside existing test files.

### 11.1 Unit tests

- **`filter.test.ts`**: `lowPassFilter` on a known sinusoid + noise; assert noise attenuated,
  sine phase preserved (zero-phase property).
- **`peaks.test.ts`**: Synthetic signals with known peaks at known indices; verify `minDistance`,
  `minProminence`, plateau handling, trough detection.
- **`interpolate.test.ts`**: Synthetic visibility dropouts; assert correct interpolation for short
  gaps and correct flagging for gaps > `maxGapFrames`.

### 11.2 Integration test (`running.test.ts`)

Fixture `src/pipeline/__tests__/fixtures/running-sample.json`: ~5 s of running landmarks at 60 fps
(hand-crafted sinusoidal heel/toe trajectories around a forward-moving pelvis, or a real MediaPipe
export). Assert:
- IC and TO events alternate per side.
- IC-to-IC interval per side is within 0.3–0.7 s.
- Ipsilateral TO follows IC by < 0.4 s.
- All 8 `RunningPhaseId` values appear in the output.
- No duplicate `frameIndex` values.

### 11.3 Acceptance criteria

- `analyzeMovement('Running', frames, fps)` runs on a real 60 fps clip and returns all 8 phase
  `KeyFrame`s.
- Detected IC frames match hand-labeled frames within ±2 frames at 60 fps on ≥ 90% of strides.
- Adding a new `AnalyzableMovement` requires changes only in `types.ts`, `registry.ts`, and a new
  file in `analyzers/`.
- Edge inputs: empty array → `MovementAnalysisError('EMPTY_INPUT')`; 1–3 frames →
  `MovementAnalysisError('INSUFFICIENT_FRAMES')`.

---

## 12. Implementation Order

1. `signal/landmarks.ts` + `types.ts` (no logic; unblocks everything).
2. `signal/peaks.ts` + `peaks.test.ts`.
3. `signal/interpolate.ts` + `interpolate.test.ts`.
4. `signal/filter.ts` + `filter.test.ts`.
5. `analyzers/running.ts` (steps 1–8) + `running.test.ts` with synthetic fixture.
6. `registry.ts` + `index.ts` wiring.
7. Integration: update `phaseSelection.ts` (`isGait` branch), update `GaitFSMDiagnostics`,
   update `runner.ts`.
8. Run full E2E pipeline (`npm run pipeline`) against existing test cases to validate.

Each step lands with passing tests before moving to the next.
