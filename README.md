# MotionRx

Clinical motion analysis tool for physiotherapists and sports medicine practitioners. Upload a patient video, and MotionRx tracks joints with MediaPipe, calculates key angles across movement phases, then generates a structured clinical report via Claude AI.

---

## Processing pipeline

Each analysis runs through four sequential steps:

**1. Frame extraction** (`src/pipeline/frameExtraction.ts`)
Seeks to phase-targeted timestamps rather than decoding every frame. Most movements extract 8 frames; Running extracts 128 and Gait / Walking extracts 64 to capture full stride cycles.

**2. Phase selection** (`src/pipeline/phaseSelection.ts`)
Runs a coarse MoveNet scan on the extracted frames and applies movement-specific logic to pick the 8 most diagnostically useful frames:
- *Gait / Running* — GaitFSM detects stride events (initial contact, midstance, toe-off, midswing, etc.) and selects one representative frame per canonical phase.
- *Squats / Deadlifts / Landing* — smart relabeling finds the true peak-flexion or lockout frame by a composite knee + hip score, then reassigns the phase label.
- *All other movements* — frames are already phase-targeted by extraction, so this step is a passthrough.

**3. Pose detection** (`src/pipeline/poseDetection.ts`)
Runs MediaPipe PoseLandmarker Heavy on the 8 selected frames. Returns 33 normalised landmarks and 33 world landmarks (in metres) per frame. Includes a mild contrast/brightness pre-processing pass for underexposed footage.

**4. Angle calculation** (`src/pipeline/angleCalculation.ts`)
Computes joint angles from the landmark data and aggregates them across frames:
- *Side view* — knee flexion, hip flexion (thigh-from-vertical for running/gait; shoulder-hip-knee for everything else), trunk lean, ankle dorsiflexion (stance frames only; heel preferred over toe; Z-depth cross-check to reject non-sagittal frames).
- *Front / posterior view* — pelvic drop, knee valgus (perpendicular offset method), hip adduction, pronation/RCSP (contact and midstance frames only).
- `extractAngles()` returns a flat `Record<string, number>` for one frame; `aggregateAngles()` reduces all frames to `{ min, max, avg, count, hitRate, lowConfidence }` per metric, with phase-aware filters.
- `REF_RANGES` provides physiological reference bands for each metric.

**5. Report generation** (`src/pipeline/reportGeneration.ts` + `src/api/index.ts`)
Builds a structured prompt from all available context and calls Claude AI (`claude-sonnet-4-6`) to generate the clinical report:
- `buildReportPrompt()` assembles: patient metadata, measured angles (with movement-aware display-value selection), limb symmetry index, PROMs (NPRS, PSFS, LEFS, ODI, hop LSI), movement-specific reference norms, angle interpretation conventions, and optional running/jump context.
- *Display-value selection* — running/gait knee flexion converts `180 − min_included` to peak swing flexion; landing knee/hip uses the same conversion; landing valgus/trunk uses `max` (worst-case); shoulder/elbow ROM uses `max`; everything else uses `avg`.
- *Upper extremity* — lower-body metrics are suppressed from the prompt for shoulder/overhead movements.
- *Footwear recommendation* — optionally requested (running/gait only) based on pronation and hip adduction data.
- `generateReport()` sends the phase frames as base64 images and the prompt to the Anthropic API; the response is parsed into a structured `AnalysisReport` (score, findings, biomechanical analysis, clinical impressions, recommendations, patient education).

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

### Unit tests (Node, fast)

```bash
npm test           # run once
npm run test:watch # watch mode
```

These cover pure functions across three modules:
- `getPhaseTimes.test.ts` — phase time calculations and phase maps
- `angleCalculation.test.ts` — `mergeWorldLandmarks`, `extractAngles`, `aggregateAngles`, `REF_RANGES`
- `reportGeneration.test.ts` — `buildReportPrompt`: patient metadata, angle display-value selection, movement-specific norms, PROMs, ASI, camera view notes, footwear request, JSON schema

### End-to-end pipeline runner

Runs the full pipeline on real video files and saves all intermediate results to disk. Video files are **not checked into git** — place them in `test_data/` alongside a `test.yaml` describing each case:

```
test_data/
  test_1/
    test.yaml
    side.mov
    front.mov   # optional secondary angle
  test_2/
    test.yaml
    side.mov
```

`test.yaml` format:
```yaml
patient_name: Jane Doe
age: 34
complaint: Left knee pain on stairs
movement_type: Running
media:
  primary:
    file: side.mov
    angle: Side (right)
  secondary:
    file: front.mov
    angle: Front
```

```bash
npm run pipeline                          # run all test cases
npm run pipeline -- --test test_1         # run a single case
npm run pipeline -- --key sk-ant-...      # include Claude report generation (step 5)
npm run pipeline -- --out results/        # override output directory (default: test_output/)
```

Output is written to `test_output/{test_name}/`:
```
test_output/
  test_1/
    summary.json    ← timings, phase labels, aggregated angles, per-frame angles
    prompt.txt      ← the full Claude prompt (always written)
    report.json     ← Claude's structured report (only with --key)
    frames/
      00_contact.jpg
      01_loading.jpg
      ...
```

The script starts a headless Chromium via Playwright and a Vite dev server — same code path as the production app. On first run the MediaPipe WASM + model (~30 MB) is downloaded and cached; subsequent runs are fast.

### Type checking

```bash
npx tsc --noEmit
```
