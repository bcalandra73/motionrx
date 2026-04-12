# MotionRx — Claude Code Session Context

## Project
Single-file HTML clinical motion analysis app.
- **File:** `index.html`
- **Deployed:** `bcalandra73.github.io/motionrx/`
- **Current version:** v0.9.5 (2026.04.11)
- **GitHub repo:** `bcalandra73/motionrx`

## Stack
- MediaPipe Pose Landmarker Heavy (primary, 3D worldLandmarks)
- MoveNet Thunder (secondary, dense 128-frame scan)
- Fused landmark pipeline + tibia reprojection + anatomy constraints
- Tape marker color detection (orange = left ankle, green = right foot)
- jsPDF for report export
- Vanilla JS, no build system — single file deployment

## Test Subject
- Brian, PT, age 37
- Treadmill running 7.0mph, iPhone 120fps slow-mo
- Runner faces LEFT in lateral/side view
- Primary video: `Run_Lat_Tape.mov` — 14.1s, 18 strides, 179spm, 670ms stride
- Secondary video: `Run_Post_Tape.mov` — 23.7s (NOT simultaneous with primary)

## Validated Ground Truth Measurements
| Metric | Left | Right |
|--------|------|-------|
| Hip Flexion | 49° | 53° |
| Hip Ext at TO | 15° | 15° |
| Knee Flexion (peak swing) | 115° | 123° |
| Hip Adduction | 5° | 8° |
| Knee Valgus | 1° | 4° |
| Pronation | 6° | 9° |
| Trunk Lean | 8° | bilateral |
| Pelvic Drop | 1° | bilateral |
| Cadence | 179spm | — |
| Stride Duration | 670ms | CV 8% |
| Vertical Oscillation | 6.3cm | — |
| Overstride | 24cm | — |
| Shin Angle at IC | 31° | — |

## Key Architecture

### Phase Detection Pipeline
1. **StrideEngine** — 128-frame MoveNet scan, detects L/R ankle contacts, cadence, stride duration
2. **GaitFSM v4** — selects best stride (frames 44-50), computes IC/TO anchor
3. **Zeni2008** — refines IC using ankle displacement + knee angle (O'Connor method)
   - Consistently: IC=frame46 (d=-0.288, k=142°), TO corrected to 41% stance
   - `_icIsMin=true` (runner LEFT), `_refAnkKey='lAnkX'`, `_refKneeKey='lKnee'`
4. **Visual frame selection** — searches all 128 frames biomechanically for best visual match per phase
   - Stored as `window_primaryPhaseSelection.vizFractions`
   - Separate from `fractions` (used for measurements) — gallery display only
   - Time guards on swing phases (t > 0.10-0.25) prevent near-start frame selection
5. **FrameExtract2 (Option 2)** — independent secondary phase detection for non-simultaneous clips
   - Scans 32 frames of secondary video with MediaPipe, scores biomechanically
   - Skipped if saved secondary landmark corrections exist (preserves correction validity)

### Global State
- `window_primaryPhaseSelection` — `{fractions[], labels[], vizFractions[]}`
- `window._primaryVidEl` — primary video element reference
- `window._denseAnglesFrames` — 128-frame landmark array for angle aggregation
- `window._currentCorrKey` — localStorage key: `${filename}__${filesize}__${duration}`
- `window._lastAggregated` — cached angles for exportPDF
- `window_strideMetrics` — cadence, GCT, stride duration, etc.
- `CORRECTIONS_PREFIX = 'motionrx_corrections_'`

### Hip Flex Override Logic
Gallery (MP-Heavy 3D worldLandmarks) overrides dense (MoveNet 2D) when:
- `mpDiffers`: bilateral asymmetry ≥3° (confirms 3D fired, not perspective collapse)
- `mpInRange`: both values 35-70° (blocks bad IC frames: 28°/24° fails 35° floor)
- Target: gallery 49°/53° should override dense 56°/56°

### Skeleton Rendering (running side view)
- LEFT leg: teal (#00e5cc), full opacity — assess this side
- RIGHT leg: gold, 20% opacity — contralateral reference only
- "← Assess LEFT leg (teal)" label on every running side-view gallery frame
- `_isGaitSideView = /running|gait|walk/.test(_mvt) && view === 'side'`
- Declared BEFORE `if(poseResult && poseResult.poseLandmarks)` block (scope fix)

### Correction System
- Stored per video in localStorage: `{primary: [], pEd: [], sec: [], sEd: []}`
- 16 saved corrections (8 primary + 8 secondary) for current test video
- `_corrSave()`, `_corrLoad(key)`, `_corrApply(data)`, `_corrUnpack(packed)`
- Clear button: "🗑 Clear saved" — reverts landmarks and enables Option 2

## Known Issues / Active Work
1. **Visual frame selection tuning** — scorer thresholds need calibration against more test runs
   - Late swing was selecting t=0.53s (near clip start) — fixed with t>0.25 floor
   - MidSwing "VERIFY" badge appears when pose conflicts with phase label (expected at terminal swing)
2. **Secondary Option 2** — ~~detect() returning empty~~ **FIXED v0.9.5**: HTMLImageElement → canvas before detect()
   - Added per-frame console logging: `[FrameExtract2] Option 2 detect OK at t=X.XX — 33 landmarks`
   - Falls back to absolute timestamp conversion when scan fails
3. **Hip flex 49°/53° vs 56°/56°** — **PARTIALLY FIXED v0.9.5**: MidSwing scorer ankle-height guard added
   - Root cause: leg-swap frames have left knee tracking swinging right leg (high flexion) while left ankle is planted on ground (high y), producing 28°/24° gallery hip flex → fails 35° floor → dense wins
   - Fix: `midswing` scorer now requires `y < 0.87` (ankle off ground) + relaxed `k < 115` → `k < 120`
   - Needs test run to confirm 49°/53° override now fires correctly
4. **catmullRomSpline duplicate declaration** — benign syntax warning, doesn't affect runtime

## v0.9.5 Fixes (2026.04.11 — do not reintroduce)
- **Option 2 canvas fix**: `new Image()` → draw to `<canvas>` before `detect()` call in FrameExtract2 secondary scan loop (line ~3325). HTMLImageElement is inconsistent with MediaPipe Tasks Vision; canvas is reliable.
- **MidSwing y-guard**: scorer now `k < 120 && y < 0.87` instead of `k < 115`. Ankle height blocks leg-swap frames where left knee tracks the swinging right leg while left ankle is still planted. Applied to both primary vizScorers (line ~2751) and Option 2 secondary scorers (line ~3378).

## Scope Bugs Fixed This Session (do not reintroduce)
- `_isGaitSideView` — must be declared BEFORE the poseLandmarks if-block
- `movement` is LOCAL to `runAnalysis()` — never reference bare `movement` in:
  - `showLandmarkReviewPanel()` → use `_rvMovement = document.getElementById('movementType').value`
  - `exportPDF()` → use `_pdfMovement = document.getElementById('movementType').value`
- `_rvMovement` already declared at line ~9010 in showLandmarkReviewPanel

## Deployment Workflow
1. Edit `index.html` locally
2. Commit and push to `bcalandra73/motionrx` repo
3. GitHub Pages serves from root, no build step needed
4. Cache bust: append `?v=N` to URL (increment N each deploy)
5. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

## Report Structure (jsPDF)
- 6 pages: header, dual-plane gallery (8 phase frames × 2 views), joint angles table, stride metrics, findings, recommendations
- `renderReport()` → `exportPDF()`
- `_pdfMovement` for movement type inside exportPDF (not bare `movement`)
- Treadmill note appended to disclaimer when surface=treadmill AND running

## Session History Reference
Full transcript at: `/mnt/transcripts/2026-04-11-03-08-19-motionrx-phase-detection-session.txt`
Topics covered: Zeni2008 IC/TO, stance correction, visual frame selection, Option 2 secondary detection, scope bugs, right-leg fading, landmark correction persistence, version stamping.
