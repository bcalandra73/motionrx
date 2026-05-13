# Test data and the pipeline runner

Reference for `test_data/` (real-video test cases) and the headless pipeline runner that executes them. The runner is the canonical end-to-end test — if a feature isn't exercised here, it isn't tested.

---

## `test_data/` directory layout

Each test case is a folder under `test_data/` containing one `test.yaml` and one or two video files:

```
test_data/
└── test_1/
    ├── test.yaml
    ├── side.mov            # primary video
    └── front.mov           # optional — triggers dual-plane analysis
```

The folder name (`test_1`) is the test-case identifier passed to `--test`. Add cases by creating a new folder; nothing else needs wiring up.

---

## `test.yaml` schema

Every parameter that controls a run lives in the YAML file. **The pipeline runner reads only this file** — there are no per-run CLI overrides for pipeline behaviour. The only CLI argument the runner accepts is `--test` to select the case.

```yaml
patient:
  name: Jane Doe
  age: 34
  diagnosis: Knee pain
  movement_type: Running        # must match a key in PHASE_MAPS / a registered analyzer
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

```

Movement-type-specific blocks (e.g. `running:`) are included only when relevant to `patient.movement_type`. If you add a new movement type that needs movement-specific parameters, add a new top-level block here, document it in this file, and update `src/assessment.ts` to parse it.

---

## Running the pipeline

The pipeline runner has two modes — one for batch runs from the terminal, one for interactive debugging from the browser console. Both execute the same underlying code (`src/runner/runner.ts`).

### CLI batch mode (Playwright + headless Chromium)

`scripts/run-pipeline.ts` starts a Vite dev server, launches headless Chromium via Playwright, runs the requested test case(s), writes output to disk, and shuts everything down.

First-time setup installs the Chromium binary Playwright needs:

```bash
npx playwright install chromium
```

Then:

```bash
npm run pipeline                          # run every case in test_data/
npm run pipeline -- --test test_1         # run a single case
```

Set `ANTHROPIC_API_KEY` in the environment to enable report generation. Without it, the runner produces everything up to and including `prompt.txt` but skips the Claude call.

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run pipeline -- --test test_1
```

### Browser console mode (interactive debugging)

Useful when you want to step through a single case with the browser devtools available. Start the dev server, navigate to the runner page, then invoke `runPipeline` from the console:

```bash
npm run dev
```

Open `http://localhost:5173/src/runner/index.html`. The status bar should say `Pipeline runner ready.` Then in the console:

```js
// Basic run — skips report generation
const result = await runPipeline({ dir: 'test_1' });

// With Claude report
const result = await runPipeline({ dir: 'test_1', apiKey: 'sk-ant-...' });
```

The returned `result` object contains the extracted frames, phase frames, annotated frames (base64), aggregated angles, the secondary pipeline output (when dual-plane), and the Claude report when an API key was provided.

---

## Output

CLI runs write to `test_output/<test_name>/`:

```
test_output/test_1/
├── frames/                       ← raw phase-selected frames
├── frames_annotated/             ← frames with MediaPipe skeleton overlay
├── frames_annotated_secondary/   ← secondary annotated frames (dual-plane only)
├── frames_paired/                ← primary + secondary side by side (dual-plane only)
├── summary.json                  ← patient info, phase labels, aggregated angles
├── prompt.txt                    ← full Claude prompt (always written)
└── report.json                   ← Claude's structured report (only when ANTHROPIC_API_KEY is set)
```

`test_output/` is for inspection and diffing across runs; nothing else in the codebase depends on its contents.
