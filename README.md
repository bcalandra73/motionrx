# MotionRx

Clinical motion analysis tool for physiotherapists and sports medicine practitioners. Upload a patient video, and MotionRx tracks joints with MediaPipe, calculates key angles across movement phases, then generates a structured clinical report via Claude AI.

---

## Processing pipeline

Each analysis runs through five sequential steps. When a second camera angle is provided, steps 1–4 run on both videos before report generation.

**1. Frame extraction**
Targets specific timestamps within each movement phase rather than decoding every frame. The number of frames extracted varies by movement type to ensure adequate cycle coverage — running and gait use more frames to capture complete stride patterns.

**2. Phase selection**
Analyzes the extracted frames and selects the 8 most diagnostically useful ones using movement-specific logic. Gait and running movements identify key stride events and pick one representative frame per phase. Strength and landing movements find the true peak-flexion or lockout frame. For other movements, frames pass through unchanged.

**3. Pose detection**
Runs landmark detection on the selected frames to identify 33 body landmarks per frame. Includes a pre-processing pass to improve results on underexposed footage.

**3b. Secondary video pipeline** *(dual-plane only)*
If a second camera angle is uploaded, steps 1–3 run independently on that video using the same movement type and the secondary camera's view setting. Failures are non-fatal — the pipeline falls back to single-view if the secondary video cannot be processed.

**4. Angle calculation**
Computes joint angles from landmark positions and summarizes them across frames. Side-view metrics include knee flexion, hip flexion, trunk lean, and ankle dorsiflexion. Front and posterior metrics include pelvic drop, knee valgus, hip adduction, and foot pronation. When dual-plane is active, angles from both views are merged — the primary view's values take precedence on any overlap.

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

Runs the full pipeline on real video files and saves all intermediate results to disk. Test cases live in `test_data/` — each case is a directory containing a `test.yaml` and the video files referenced by it.

**Running the tests:**

```bash
# Run all test cases in test_data/
npm run pipeline

# Run a single named case
npm run pipeline -- --test test_1

# Include Claude report generation (requires API key)
npm run pipeline -- --key sk-ant-...
# or set ANTHROPIC_API_KEY in your environment and just run npm run pipeline

# Write output to a custom directory (default: test_output/)
npm run pipeline -- --out results/
```

The script starts a Vite dev server and headless Chromium — the same code path as the production app. On first run, the MediaPipe WASM + model (~30 MB) is downloaded and cached; subsequent runs are fast.

**Test case structure:**

```
test_data/
  test_1/
    test.yaml
    side.mov
    front.mov       # optional — triggers dual-plane analysis
  test_2/
    test.yaml
    side.mov
```

`test.yaml` format:
```yaml
# Required
patient:
  name: Jane Doe
  age: 34
  diagnosis: Left knee pain on stairs
  movement_type: Running        # must match a movement type in the app
  height: 170                   # optional
  height_unit: cm               # cm | in  (default: in)
  injured_side: left            # left | right (optional)
  notes: |                      # optional free-text clinical notes
    Antalgic gait noted.

media:
  primary:
    file: side.mov
    camera_view: side           # side | front | posterior
  secondary:                    # optional — triggers dual-plane analysis
    file: front.mov
    camera_view: front

focus:                          # optional — analysis focus areas
  - knee alignment and tracking
  - hip symmetry and mobility

# Optional — include for running/gait movements
running:
  treadmill_speed: 6.0
  speed_unit: mph               # mph | kph | mps
  treadmill_incline: 0
  surface: treadmill            # treadmill | track | road | trail
  fps: 60
  shoe: standard                # standard | stability | minimalist | carbon | maximalist
  experience: recreational      # beginner | recreational | competitive | elite
  include_footwear: true

# Optional — include for jump/landing movements
jump:
  fps: 120
  involved_limb: left           # left | right | bilateral
  protocol: 30cm                # 30cm | 45cm | dvj | 3hop | custom
  time_post_op: 6mo             # 3mo | 6mo | 9mo | 12mo | >12mo

# Optional — patient-reported outcome measures
proms:
  nprs:
    current: 5
    best: 2
    worst: 8
  psfs:
    - activity: Running 5km
      score: 4
    - activity: Descending stairs
      score: 3
  lsi_injured: 85
  lsi_uninjured: 100
```

**Output** is written to `test_output/{test_name}/`:

```
test_output/
  test_1/
    summary.json          ← timings, phase labels, aggregated angles (both views), per-frame angles
    prompt.txt            ← full Claude prompt (always written)
    report.json           ← Claude's structured report (only with --key)
    frames/               ← raw phase-selected frames, all views
      00_contact_side.jpg
      00_contact_front.jpg
      ...
    frames_annotated/     ← same frames with MediaPipe skeleton overlay
      00_contact_side.jpg
      00_contact_front.jpg
      ...
    frames_paired/        ← primary + secondary composited side by side (dual-plane only)
      00_contact.jpg
      ...
```

### Type checking

```bash
npx tsc --noEmit
```
