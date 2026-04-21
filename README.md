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

**4. Analysis & report** *(in progress)*
Joint angles are calculated from the landmarks and passed to Claude AI along with patient metadata, PROMs scores, and clinician focus areas to generate a structured clinical report.

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

These cover pure functions — phase time calculations, phase maps, signal utilities.

### Browser integration tests

The browser tests run real video files through the full pipeline inside a Chromium tab. Video files are **not checked into git** — place them in `test_data/` alongside a `test.yaml` describing each case:

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
npm run test:browser          # headless Chromium, one run
npm run test:browser:watch    # headless, watch mode
npm run test:browser:manual   # opens a visible browser — frames and skeleton overlays rendered in the page for visual inspection
```

The manual mode renders each pipeline step visually: extracted frames, selected phase frames with labels, and pose detection results with green skeleton overlays drawn on canvas.

On first run the browser tests download the MediaPipe WASM + model (~30 MB) and cache it. Subsequent runs are fast.

### Type checking

```bash
npx tsc --noEmit
```
