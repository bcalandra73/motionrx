# MotionRx — Claude Code Context

## What this project does
MotionRx is a browser-based clinical motion analysis tool. A clinician uploads a patient video; the app extracts frames, runs MediaPipe Pose Landmarker to detect 33 body landmarks on every frame, uses a Zeni-method pelvis-relative analyzer to select the 8 most clinically relevant gait phase frames, calculates joint angles, and sends the annotated frames + angle data to Claude (via the Anthropic API) which generates a structured clinical report.

## About the maintainer

The maintainer is a practicing physical therapist with no programming background. They work through Claude Code on their own machine via git. Calibrate accordingly:

- **Keep answers simple and non-technical.** For how-to questions, direct the user to `README.md` — it is written in plain language for them. Avoid jargon and code-level detail unless they ask.
- **Plan before non-trivial changes.** For anything that touches multiple files, the pipeline, the data model, external APIs, or clinical assumptions, lay out the plan in plain language *first* and confirm before writing code. Small, localized changes (a copy edit, a styling tweak, a typo fix) don't need a plan.
- **Work on a branch by default.** For anything beyond a trivial fix, `git checkout -b <descriptive-name>`, make the change there, verify with `npm run dev` and `npm test`, and only merge to `main` once it's confirmed working. After merging, delete the topic branch.
- **Surface clinical and biomechanical assumptions.** If a change implies a clinical decision — which limb counts as "involved," how a phase is defined, what counts as a normative range, what threshold flags an abnormality — call it out and ask. The maintainer is the domain expert; you are not. Never silently encode a clinical assumption.
- **Append to `CHANGELOG.md` at the end of every session.** Log all changes made — one entry per session, compacted if the session was long. Include date, what changed, and any follow-ups left undone. Future Claude sessions and the maintainer both read it.
- **Explain in clinical/product terms first, code terms second.** When summarizing what you did, lead with the user-visible behaviour change, then the technical detail.

## Tech stack
- **React 19 + TypeScript** (Vite 8)
- **MediaPipe Tasks Vision 0.10.34** — Pose Landmarker Heavy, IMAGE mode, GPU→CPU fallback
- **fili** — IIR/FIR filter design for zero-phase Butterworth low-pass filtering
- **Vitest** for unit tests
- No backend — all processing runs in the browser; Claude API is called directly from the client with a user-supplied API key

## Pipeline (in order)
1. **Frame extraction** (`src/pipeline/frameExtraction.ts`) — two extraction paths: seek-based (`video.currentTime` + `seeked` event) and WebCodecs (`decodeVideoFrames`); both must be preserved when editing this file; configurable `startSecs`, `durationSecs`, `targetFps` (default 30 fps)
2. **Pose detection** (`src/pipeline/poseDetection.ts`) — `detectPoseOnFrames` runs MediaPipe `PoseLandmarker.detect()` (IMAGE mode) on every extracted frame; mild luma-based brightness pre-processing for underexposed footage
3. **Phase selection** (`src/pipeline/phaseSelection.ts`) — `selectPhaseFrames` calls `analyzeMovement()` from `src/pipeline/movement-analysis/` to identify 8 gait events (contact, loading, midstance, propulsion, toeoff, earlyswing, midswing, lateswing) using the Zeni pelvis-relative method; falls back to uniform sampling for non-gait movement types. *Detailed running-gait logic: `docs/running-analyzer.md`.*
4. **Angle calculation** (`src/pipeline/angleCalculation.ts`) — `extractAngles` + `aggregateAngles` per phase
5. **Report generation** (`src/pipeline/reportGeneration.ts` + `src/api.ts`) — structured prompt + annotated frame images → Claude API → JSON report

## Key files
| Path | Role |
|---|---|
| `src/App.tsx` | Main pipeline orchestration, UI state |
| `src/pipeline/frameExtraction.ts` | Seek-based frame capture |
| `src/pipeline/poseDetection.ts` | MediaPipe init + per-frame detection |
| `src/pipeline/phaseSelection.ts` | Phase selection entry point (`selectPhaseFrames`) |
| `src/pipeline/movement-analysis/index.ts` | Public entry point: `analyzeMovement()` |
| `src/pipeline/movement-analysis/analyzers/running.ts` | Zeni-method running analyzer |
| `src/pipeline/movement-analysis/signal/` | Signal utilities: peaks, interpolation, filter |
| `src/pipeline/angleCalculation.ts` | Joint angle maths |
| `src/pipeline/frameAnnotation.ts` | Skeleton overlay on frames |
| `src/hooks/useVideoAnalysis.ts` | Video upload + analysis state |
| `src/hooks/usePoseDetector.ts` | MediaPipe singleton state |
| `src/types/index.ts` | Shared types (`ExtractedFrame`, `NormalizedLandmark`, etc.) |
| `src/assessment.ts` | YAML → runtime object bridge; update whenever `test.yaml` schema changes or a new movement-type block is added |
| `src/runner/runner.ts` | Headless pipeline runner — canonical E2E test |
| `scripts/run-pipeline.ts` | CLI entry point for the runner (`npm run pipeline`) |

## Running
```bash
npm run dev      # dev server at http://localhost:5173
npm run build    # production build → dist/
npm test         # unit tests (Vitest)
npx tsc --noEmit # type-check
```

For the headless pipeline runner against `test_data/`, see `docs/test-data.md`.

## Development conventions

- **Plan before complex changes** — see "About the maintainer" above.
- **Work on a branch** — see "About the maintainer" above. After merging, delete the topic branch.
- **Update `CHANGELOG.md`** — one entry per session covering all changes; compact if the session was long.
- **Run tests before declaring a task done** — `npm test` for unit tests; for any pipeline change, also `npm run pipeline -- --test <case>` against at least one real case in `test_data/`. Type-check with `npx tsc --noEmit`.
- **Keep the README current** — `README.md` is written for the (non-technical) maintainer. If you add a user-visible feature, a new CLI flag, change setup steps, or change the workflow, update it in plain language they can follow.
- **Keep `docs/` and this file in sync with reality** — if you add a pipeline step, change the movement-analysis module structure, add a new movement type, or change the `test.yaml` schema, update the relevant doc in lockstep with the code. Stale docs mislead future Claude sessions.
- **Keep the E2E runner current** — any change to pipeline logic (new step, new output field, changed aggregation) must be reflected in `src/runner/runner.ts` and `scripts/run-pipeline.ts`. The runner is the canonical end-to-end test; if it doesn't exercise a feature, that feature is untested.

## Architecture invariants — do not change without explicit confirmation

These behaviours are load-bearing. Changing any of them needs an explicit conversation with the maintainer, not a unilateral refactor.

- **Pure-function pipeline.** Pipeline logic under `src/pipeline/` is kept free of side effects, React state, DOM access, and network calls. This is why unit tests are fast — keep it this way.
- **Non-fatal secondary pipeline.** Any failure in the secondary video path must not crash the primary pipeline. Always wrap secondary processing in try/catch and fall back gracefully to single-view.
- **Primary view precedence.** When merging dual-plane angle data, primary-view values always win on overlap. Don't change this without updating tests in lockstep.
- **API key handling.** The Anthropic API key is user-supplied at runtime and lives only in memory on the client. Never log it, persist it to disk or storage, or send it anywhere other than `api.anthropic.com`. Don't introduce a backend that proxies it without an explicit discussion with the maintainer.
- **Pipeline runner inputs come from `test.yaml`.** Never from CLI args (except `--test` to select the case). Don't add per-run CLI overrides for pipeline behaviour.
- **`_original_index.html`.** The original single-file prototype, kept as a read-only reference. Do not modify or re-integrate.

## Further reading

In-depth references live in `docs/`. Read whichever applies before non-trivial work in that area:

- **`docs/architecture.md`** — code organisation, the movement-analysis module layout, MediaPipe landmark indices, and the canonical recipe for adding a new movement type. Read before any change to `src/pipeline/movement-analysis/` or before adding a new movement type anywhere.
- **`docs/running-analyzer.md`** — the Zeni-method running gait analyzer in detail (signal preparation, event detection, phase derivation, confidence scoring, failure modes). Required reading before changing `src/pipeline/movement-analysis/analyzers/running.ts`.
- **`docs/test-data.md`** — `test.yaml` schema and the headless pipeline runner (both CLI and in-browser modes).
