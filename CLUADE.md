# MotionRx — Claude Development Guide

Clinical motion analysis tool for physiotherapists and sports medicine practitioners. Processes patient video through a five-step pipeline (frame extraction → phase selection → pose detection → angle calculation → report generation) and produces a structured clinical report via Claude AI.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React + TypeScript |
| Build tool | Vite (dev server at `localhost:5173`, output to `dist/`) |
| Pose detection | MediaPipe (WASM + model, ~30 MB, cached after first run) |
| Report generation | Anthropic Claude API (`/v1/messages`) |
| Testing (unit) | Vitest (Node, no browser) |
| Testing (E2E) | Playwright + headless Chromium + Vite dev server |
| Test data | Local video files in `test_data/` |

---

## Project structure

```
src/
  ├── components/         # React UI components
  ├── hooks/              # React hooks (useVideoAnalysis, usePatientForm, etc.)
  ├── pipeline/           # Core processing logic (pure functions where possible)
  │   ├── frameExtraction # getPhaseTimes, extractFrames — phase-targeted frame capture
  │   ├── phaseSelection  # selectPhaseFrames — MoveNet scan + movement-specific frame picking
  │   ├── poseDetection   # initPoseLandmarker, detectPoseOnFrames — MediaPipe Heavy
  │   ├── angleCalculation# mergeWorldLandmarks, extractAngles, aggregateAngles, REF_RANGES
  │   ├── reportGeneration# buildReportPrompt — assembles Claude prompt
  │   └── __tests__/      # Unit tests (*.test.ts)
  ├── api/                # generateReport — Anthropic API call + response parsing
  ├── runner/             # Browser-side pipeline runner (used by E2E script)
  ├── data/               # phaseMaps, cameraGuides
  ├── types/              # Shared TypeScript types
  └── ...

scripts/
  └── run-pipeline.ts     # E2E pipeline runner (Playwright + Vite)

test_data/                # Video files + test.yaml per case
test_output/              # E2E output (summary.json, frames/, prompt.txt, report.json)

_original_index.html      # Original single-file prototype — reference only, do not modify
```

---

## Processing pipeline (five steps)

Understanding this sequence is essential before modifying any pipeline code.

### 1. Frame extraction
Targets specific timestamps within each movement phase rather than decoding every frame. Frame count varies by movement type — running and gait extract more frames to capture complete stride patterns.

### 2. Phase selection
Selects the 8 most diagnostically useful frames using movement-specific logic:
- **Gait / Running** — identifies key stride events, picks one representative frame per phase
- **Strength / Landing** — finds true peak-flexion or lockout frame
- **Other** — frames pass through unchanged

### 3. Pose detection
Runs MediaPipe landmark detection on selected frames (33 landmarks per frame). Includes a pre-processing pass to improve results on underexposed footage.

### 3b. Secondary video pipeline *(dual-plane only)*
If a second camera angle is uploaded, steps 1–3 run independently on that video. Failures are non-fatal — the pipeline falls back to single-view if the secondary video cannot be processed.

### 4. Angle calculation
Computes joint angles from landmark positions and aggregates across frames:
- **Side view** — knee flexion, hip flexion, trunk lean, ankle dorsiflexion
- **Front / Posterior view** — pelvic drop, knee valgus, hip adduction, foot pronation
- **Dual-plane** — angles from both views are merged; primary view takes precedence on overlap

### 5. Report generation
Assembles patient metadata, measured angles (both views), limb symmetry index, and PROMs into a structured prompt → sends to Claude AI with annotated frames → parses response into a clinical report (findings, biomechanical analysis, clinical impressions, recommendations, patient education).

---

## Development commands

```bash
npm install             # install dependencies

# Development
npm run dev             # Vite dev server → http://localhost:5173
npx tsc --noEmit        # type-check without building

# Production
npm run build           # type-check + Vite build → dist/
npm run preview         # serve dist/ locally

# Unit tests (fast, Node only)
npm test                # run once
npm run test:watch      # watch mode

# E2E pipeline runner (requires test_data/)
npm run pipeline                          # all test cases
npm run pipeline -- --test test_1         # single case
npm run pipeline -- --key sk-ant-...      # include Claude report (step 5)
npm run pipeline -- --out results/        # custom output dir (default: test_output/)
```

---

## Test data setup

Video files are not committed. Place them in `test_data/` with a `test.yaml` per case:

```
test_data/
  test_1/
    test.yaml
    side.mov
    front.mov   # optional
```

```yaml
patient:
  name: Jane Doe
  age: 34
  diagnosis: Left knee pain on stairs
  movement_type: Running
  height: 170           # optional
  height_unit: cm       # cm | in
  injured_side: left    # optional
  notes: |              # optional
    Antalgic gait noted.

media:
  primary:
    file: side.mov
    camera_view: side           # side | front | posterior
  secondary:                    # optional
    file: front.mov
    camera_view: front

focus:                          # optional
  - knee alignment and tracking

running:                        # optional — running/gait only
  treadmill_speed: 6.0
  speed_unit: mph
  surface: treadmill
  fps: 60
  shoe: standard
  experience: recreational
  include_footwear: true

jump:                           # optional — jump/landing only
  fps: 120
  involved_limb: left
  protocol: 30cm
  time_post_op: 6mo

proms:                          # optional
  nprs:
    current: 5
    best: 2
    worst: 8
  psfs:
    - activity: Running 5km
      score: 4
  lsi_injured: 85
  lsi_uninjured: 100
```

E2E output lands in `test_output/{test_name}/`:
- `summary.json` — timings, phase labels, aggregated angles (both views), per-frame angles
- `prompt.txt` — full Claude prompt (always written)
- `report.json` — Claude's structured report (only with `--key`)
- `frames/` — raw phase-selected frames, all views (`{i}_{phaseId}_{view}.jpg`)
- `frames_annotated/` — skeleton overlay frames, all views (`{i}_{phaseId}_{view}.jpg`)
- `frames_paired/` — primary + secondary composited side by side (dual-plane only)

---

## Key modules to know

### `angleCalculation`
Contains the core math. Key exports tested in `angleCalculation.test.ts`:
- `mergeWorldLandmarks` — combines normalized landmarks with world-space (metric) coordinates for a single frame
- `extractAngles` — computes angles from a landmark set for one frame
- `aggregateAngles` — summarizes angles across multiple frames (min, max, avg, hitRate)
- `REF_RANGES` — reference angle ranges used for clinical flagging

### `reportGeneration` / `buildReportPrompt`
Assembles the Claude prompt. Tested extensively in `reportGeneration.test.ts` covering:
- Patient metadata formatting
- Angle display-value selection
- Movement-specific normative ranges
- PROMs (patient-reported outcome measures)
- ASI (asymmetry index)
- Camera view notes
- Footwear request
- JSON schema for structured response parsing

### `getPhaseTimes`
Calculates phase timestamps and phase maps for each movement type. Tested in `getPhaseTimes.test.ts`.

---

## Development conventions

- **Keep the README current** — if you add a pipeline step, change behaviour, or add a CLI flag, update `README.md` to reflect it before considering the task done.
- **Keep the E2E runner current** — any change to pipeline logic (new step, new output field, changed aggregation) must be reflected in `src/runner/runner.ts` and `scripts/run-pipeline.ts`. The runner is the canonical end-to-end test; if it doesn't exercise a feature, that feature is untested.

---

## Architecture notes

- **Pure functions** — pipeline logic (`angleCalculation`, `getPhaseTimes`, `buildReportPrompt`) is kept free of side effects and UI concerns. Keep it this way — it's why unit tests are fast.
- **Non-fatal secondary pipeline** — any failure in the secondary video path must not crash the primary pipeline. Always wrap secondary processing in try/catch and fall back gracefully.
- **Primary view precedence** — when merging dual-plane angle data, primary view values always win on overlap. Do not change this without updating tests.
- **MediaPipe is browser-only** — the WASM runtime cannot run in Node. Unit tests mock or avoid MediaPipe; only the E2E runner (Playwright + headless Chromium) exercises it.
- **`_original_index.html`** — the original single-file prototype. Treat as read-only reference. Do not modify or re-integrate it.

---

## Adding a new movement type

1. Add phase timestamps to `PHASE_MAPS` in `src/data/phaseMaps.ts` and update `getPhaseTimes.test.ts`.
2. Add phase selection logic (step 2) for the new type, following existing patterns.
3. Determine which angle metrics apply (side / front / posterior) and verify `extractAngles` covers them.
4. Add movement-specific normative ranges to `REF_RANGES` and `buildReportPrompt`.
5. Add a test case to `test_data/` and run the E2E pipeline to validate end-to-end.
6. Update `reportGeneration.test.ts` for any `buildReportPrompt` changes.

---

## Claude API usage

The app calls the Anthropic API client-side using a user-supplied API key (entered in the UI). The key is never stored beyond the session.

- **Model** — `claude-sonnet-4-6` (defined in `src/api/index.ts` as `ANALYSIS_MODEL`)
- **Input** — structured text prompt (`buildReportPrompt`) + annotated JPEG frames as base64 images
- **Output** — JSON-structured clinical report; parsed by `reportGeneration`
- **Step 5 only** — the API is called once per analysis at the very end of the pipeline

---

## Common gotchas

- MediaPipe WASM (~30 MB) is downloaded and cached on first E2E run — subsequent runs are fast.
- The E2E runner starts both a Vite dev server (port 5174) and headless Chromium; make sure port 5174 is free (it will try the next available port if not).
- `npm run build` runs `tsc` before Vite — fix type errors before attempting a production build.
- Secondary video failures are intentionally swallowed; check `summary.json` to confirm whether dual-plane data was captured.
