# MotionRx — Claude Code Context

## What this project does
MotionRx is a browser-based clinical motion analysis tool. A clinician uploads a patient video; the app extracts frames, runs MediaPipe Pose Landmarker to detect 33 body landmarks on every frame, uses a GaitFSM state machine to select the 8 most clinically relevant gait phase frames, calculates joint angles, and sends the annotated frames + angle data to Claude (via the Anthropic API) which generates a structured clinical report.

## Tech stack
- **React 19 + TypeScript** (Vite 8)
- **MediaPipe Tasks Vision 0.10.34** — Pose Landmarker Heavy, IMAGE mode, GPU→CPU fallback
- **Vitest** for unit tests
- No backend — all processing runs in the browser; Claude API is called directly from the client with a user-supplied API key

## Pipeline (in order)
1. **Frame extraction** (`src/pipeline/frameExtraction.ts`) — seek-based capture using `video.currentTime` + `seeked` event; configurable `startSecs`, `durationSecs`, `targetFps` (default 5 fps)
2. **Pose detection** (`src/pipeline/poseDetection.ts`) — `detectPoseOnFrames` runs MediaPipe `PoseLandmarker.detect()` (IMAGE mode) on every extracted frame; mild luma-based brightness pre-processing for underexposed footage
3. **Phase selection** (`src/pipeline/phaseSelection.ts`) — `selectPhaseFrames` feeds MediaPipe landmarks directly into `GaitFSM` to identify 8 gait events (contact, loading, midstance, propulsion, toeoff, earlyswing, midswing, lateswing); falls back to uniform sampling for non-gait movement types
4. **Angle calculation** (`src/pipeline/angleCalculation.ts`) — `extractAngles` + `aggregateAngles` per phase
5. **Report generation** (`src/pipeline/reportGeneration.ts` + `src/api.ts`) — structured prompt + annotated frame images → Claude API → JSON report

## Key files
| Path | Role |
|---|---|
| `src/App.tsx` | Main pipeline orchestration, UI state |
| `src/pipeline/frameExtraction.ts` | Seek-based frame capture |
| `src/pipeline/poseDetection.ts` | MediaPipe init + per-frame detection |
| `src/pipeline/phaseSelection.ts` | GaitFSM phase selection |
| `src/pipeline/angleCalculation.ts` | Joint angle maths |
| `src/pipeline/frameAnnotation.ts` | Skeleton overlay on frames |
| `src/hooks/useVideoAnalysis.ts` | Video upload + analysis state |
| `src/hooks/usePoseDetector.ts` | MediaPipe singleton state |
| `src/types.ts` | Shared types (`ExtractedFrame`, `NormalizedLandmark`, etc.) |

## MediaPipe landmark indices
33-point format. Key indices used by GaitFSM:
- Hips: 23 (L), 24 (R)
- Knees: 25 (L), 26 (R)
- Ankles: 27 (L), 28 (R)

## Pipeline runner (headless batch mode)
`scripts/run-pipeline.ts` runs test cases from `test_data/` headlessly via Playwright + Vite.

```bash
npm run pipeline                  # run all test_data/test_* cases
npm run pipeline -- --test test_1 # run a single case
```

**All run parameters come from each test's `test.yaml` — never from CLI args.** The only CLI argument is `--test` to select which case to run. Set `ANTHROPIC_API_KEY` in the environment to enable report generation. Output always goes to `test_output/<test_name>/`.

## test.yaml schema
Every parameter that controls a run lives in the YAML file. Key top-level blocks:

```yaml
patient:
  name: Jane Doe
  age: 34
  diagnosis: Knee pain
  movement_type: Running        # must match a key in PHASE_MAPS
  height: 65
  height_unit: in               # 'in' | 'cm'
  injured_side: left            # 'left' | 'right' | 'bilateral' | 'none'
  notes: Post-ACL reconstruction

media:
  primary:
    file: video.mov
    camera_view: side           # 'side' | 'front' | 'posterior'
  secondary:                    # optional second camera angle
    file: video2.mov
    camera_view: front
  capture:                      # optional — controls frame extraction
    start: 0                    # startSecs (default 0)
    duration: 2                 # durationSecs (default 2)
    fps: 30                     # targetFps (default 30)

focus:                          # optional — clinical areas to highlight in report
  - knee valgus
  - trunk lean

running:                        # include for Running movement type
  treadmill_speed: 7.5
  speed_unit: mph
  surface: treadmill
  fps: 240

jump:                           # include for jump/landing movement types
  fps: 120
  involved_limb: left
  protocol: 30cm
  time_post_op: 6mo
```

## Running
```bash
npm run dev      # dev server
npm run build    # production build
npm test         # unit tests
```

## Development conventions

- **Keep the README current** — if you add a pipeline step, change behaviour, or add a CLI flag, update `README.md` to reflect it before considering the task done.
- **Keep the E2E runner current** — any change to pipeline logic (new step, new output field, changed aggregation) must be reflected in `src/runner/runner.ts` and `scripts/run-pipeline.ts`. The runner is the canonical end-to-end test; if it doesn't exercise a feature, that feature is untested.

## Architecture notes

- **Pure functions** — pipeline logic is kept free of side effects and UI concerns. Keep it this way — it's why unit tests are fast.
- **Non-fatal secondary pipeline** — any failure in the secondary video path must not crash the primary pipeline. Always wrap secondary processing in try/catch and fall back gracefully.
- **Primary view precedence** — when merging dual-plane angle data, primary view values always win on overlap. Do not change this without updating tests.
- **`_original_index.html`** — the original single-file prototype. Treat as read-only reference. Do not modify or re-integrate it.

## Adding a new movement type

1. Add phase timestamps to `PHASE_MAPS` in `src/data/phaseMaps.ts` and update `getPhaseTimes.test.ts`.
2. Add phase selection logic (step 2) for the new type, following existing patterns.
3. Determine which angle metrics apply (side / front / posterior) and verify `extractAngles` covers them.
4. Add movement-specific normative ranges to `REF_RANGES` and `buildReportPrompt`.
5. Add a test case to `test_data/` and run the E2E pipeline to validate end-to-end.
6. Update `reportGeneration.test.ts` for any `buildReportPrompt` changes.
