# MotionRx

Clinical motion analysis tool for physiotherapists and sports medicine practitioners. Upload a patient video, and MotionRx tracks joints with MediaPipe, identifies key movement phases using GaitFSM, calculates joint angles, then generates a structured clinical report via Claude AI.

---

## Processing pipeline

Each analysis runs through five sequential steps. When a second camera angle is provided, steps 1–4 run on both videos before report generation.

**1. Frame extraction**
Captures frames from a configurable analysis window (start time + duration) at 5 fps using seek-based extraction for precision. The window defaults to the first 10 seconds; both parameters are exposed in the UI.

**2. Pose detection**
Runs MediaPipe Pose Landmarker Heavy (IMAGE mode) on every extracted frame, detecting 33 body landmarks per frame. Includes a pre-processing pass that lifts brightness and contrast on underexposed footage before inference. GPU acceleration is used where available with automatic CPU fallback.

**3. Phase selection**
Feeds the per-frame landmark data into GaitFSM — a state machine that identifies the 8 most diagnostically useful gait events (initial contact, loading response, midstance, propulsion, toe-off, early swing, mid swing, late swing). For non-gait movement types (squats, jumps, overhead press, etc.) the app samples frames uniformly across the movement cycle.

**3b. Secondary video pipeline** *(dual-plane only)*
If a second camera angle is uploaded, steps 1–3 run independently on that video using the same movement type and the secondary camera's view setting. Failures are non-fatal — the pipeline falls back to single-view if the secondary video cannot be processed.

**4. Angle calculation**
Computes joint angles from landmark positions and summarizes them per phase. Side-view metrics include knee flexion, hip flexion, trunk lean, and ankle dorsiflexion. Front and posterior metrics include pelvic drop, knee valgus, hip adduction, and foot pronation. When dual-plane is active, angles from both views are merged — the primary view's values take precedence on any overlap.

**5. Report generation**
Assembles all available data — patient metadata, measured angles from both views, limb symmetry index, and patient-reported outcome measures — into a structured prompt and sends it to Claude AI along with the annotated frames from both cameras. The response is parsed into a structured clinical report covering findings, biomechanical analysis, clinical impressions, recommendations, and patient education.

---

## Running the project

```bash
npm install
npm run dev        # starts dev server at http://localhost:5173
```

Open the app, fill in patient details, upload a video, enter your Anthropic API key, and click **Generate Clinical Report**.

To build for production:

```bash
npm run build      # type-check + Vite build → dist/
npm run preview    # serve the dist/ build locally
```

---

## Development

### Unit tests

```bash
npm test           # run once
npm run test:watch # watch mode
```

These cover pure functions across three modules:
- `getPhaseTimes.test.ts` — phase time calculations and phase maps
- `angleCalculation.test.ts` — `mergeWorldLandmarks`, `extractAngles`, `aggregateAngles`, `REF_RANGES`
- `reportGeneration.test.ts` — `buildReportPrompt`: patient metadata, angle display-value selection, movement-specific norms, PROMs, ASI, camera view notes, footwear request, JSON schema

### Pipeline runner

The runner lets you execute the full pipeline against a real video file directly in the browser, without going through the React UI. It's useful for testing pipeline changes end-to-end.

**1. Place test data in `public/`**

```
public/
  test_1/
    test.yaml
    side.mov
    front.mov   # optional — triggers dual-plane analysis
```

`test.yaml` format:
```yaml
patient:
  name: Jane Doe
  age: 34
  diagnosis: Left knee pain on stairs
  movement_type: Running
  height: 170
  height_unit: cm
  injured_side: left

media:
  primary:
    file: side.mov
    camera_view: side         # side | front | posterior
  secondary:                  # optional
    file: front.mov
    camera_view: front

focus:
  - knee alignment and tracking
```

**2. Start the dev server**

```bash
npm run dev
```

**3. Open the runner page**

Navigate to `http://localhost:5173/src/runner/index.html`. The status bar will show `Pipeline runner ready.`

**4. Run the pipeline from the browser console**

```js
// Basic run — skips report generation
const result = await runPipeline({ dir: 'test_1' });

// With Claude report
const result = await runPipeline({ dir: 'test_1', apiKey: 'sk-ant-...' });

// Custom analysis window
const result = await runPipeline({ dir: 'test_1', startSecs: 5, durationSecs: 15 });
```

The returned `result` object contains the extracted frames, phase frames, annotated frames (base64), aggregated angles, secondary pipeline output, and the Claude report if an API key was provided.

**Alternatively: run from the terminal via the bash script**

The script starts a Vite dev server automatically, runs every test case in `public/`, saves output to disk, and shuts down.

First-time setup (installs the Chromium binary Playwright needs):
```bash
npm install
npx playwright install chromium
```

Then:
```bash
npm run pipeline                          # all test cases in public/
npm run pipeline -- --test test_1         # single test case
npm run pipeline -- --key sk-ant-...      # include Claude report
npm run pipeline -- --out results/        # custom output directory
npm run pipeline -- --start 5 --duration 15
```

Output is written to `test_output/<test_name>/`:
```
frames/                   ← raw phase-selected frames
frames_annotated/         ← frames with MediaPipe skeleton overlay
frames_annotated_secondary/  ← secondary camera annotated frames (dual-plane only)
frames_paired/            ← primary + secondary composited side by side (dual-plane only)
summary.json              ← patient info, phase labels, aggregated angles
prompt.txt                ← full Claude prompt (always written)
report.json               ← Claude's structured report (only with --key)
```

### Type checking

```bash
npx tsc --noEmit
```
