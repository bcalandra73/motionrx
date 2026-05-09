import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { ExtractedFrame } from '../types';
import { detectPoseOnFrames, buildMediaPipeDiagnostics } from './poseDetection';
import type { PoseFrameResult, MediaPipeDiagnostics } from './poseDetection';
import { selectPhaseFrames } from './phaseSelection';
import type { MovementAnalysisDiagnostics } from './phaseSelection';
import { annotateFrame } from './frameAnnotation';
import { mergeWorldLandmarks, extractAngles, aggregateAngles } from './angleCalculation';
import type { AngleStat, FrameAnglePoint } from './angleCalculation';
import type { FrameLandmarkPoint, NormalizedLandmark } from '../types';
import { extractFramesAtTimestamps } from './frameExtraction';
import { framesToGif } from './gifGeneration';

const VIS = 0.18;
function extractLandmarkPositions(lm: NormalizedLandmark[]): Record<string, number> {
  const get = (i: number, c: 'x' | 'y') =>
    (lm[i]?.visibility ?? 0) > VIS ? lm[i][c] : null;
  const entries: [string, number][] = [
    ['Left Hip Y',    get(23, 'y')!], ['Right Hip Y',   get(24, 'y')!],
    ['Left Knee Y',   get(25, 'y')!], ['Right Knee Y',  get(26, 'y')!],
    ['Left Ankle Y',  get(27, 'y')!], ['Right Ankle Y', get(28, 'y')!],
    ['Left Hip X',    get(23, 'x')!], ['Right Hip X',   get(24, 'x')!],
    ['Left Knee X',   get(25, 'x')!], ['Right Knee X',  get(26, 'x')!],
    ['Left Ankle X',  get(27, 'x')!], ['Right Ankle X', get(28, 'x')!],
  ];
  return Object.fromEntries(entries.filter(([, v]) => v != null));
}

export interface PrimaryAnalysisResult {
  allPoseResults: PoseFrameResult[];
  phaseFrames: ExtractedFrame[];
  poseResults: PoseFrameResult[];
  annotatedFrames: string[];       // phase-selected frames only (for report / UI slideshow)
  allAnnotatedFrames: string[];    // every extracted frame with wireframe + counter (for pipeline output / GIF)
  gifData: string;
  allFrameAngles: Record<string, number>[];
  aggregated: Record<string, AngleStat>;
  allFrameAngleSeries: FrameAnglePoint[];
  allFrameLandmarkSeries: FrameLandmarkPoint[];
  movementAnalysisDiag: MovementAnalysisDiagnostics | null;
  mediapipeDiag: MediaPipeDiagnostics | null;
}

export interface SecondaryAnalysisResult {
  phaseFrames: ExtractedFrame[];
  poseResults: PoseFrameResult[];
  annotatedFrames: string[];
  allFrameAngles: Record<string, number>[];
  aggregated: Record<string, AngleStat>;
  mediapipeDiag: MediaPipeDiagnostics | null;
}

export async function runPrimaryAnalysis(
  frames: ExtractedFrame[],
  landmarker: PoseLandmarker,
  options: {
    movementType: string;
    cameraView: 'side' | 'front' | 'posterior';
    onProgress?: (pct: number, label: string) => void;
  },
): Promise<PrimaryAnalysisResult> {
  const { movementType, cameraView, onProgress } = options;

  // ── Step 2: Pose detection ────────────────────────────────────────────────
  const t2 = performance.now();
  const allPoseResults = await detectPoseOnFrames(landmarker, frames, { onProgress });
  const detectedCount = allPoseResults.filter(r => r.source === 'landmarker').length;
  const lumaVals = allPoseResults.map(r => r.preprocessingLuma).filter(l => l >= 0);
  const avgLuma = lumaVals.length
    ? (lumaVals.reduce((s, v) => s + v, 0) / lumaVals.length).toFixed(1) : '—';
  const boostedCount = allPoseResults.filter(r => r.preprocessingBrightOffset > 0).length;
  const allDiag = buildMediaPipeDiagnostics(allPoseResults, frames.map(f => ({ phase: f.phase })));
  console.log(
    `[Step 2 ✓] Pose: ${detectedCount}/${allPoseResults.length}` +
    ` (${((detectedCount / Math.max(1, allPoseResults.length)) * 100).toFixed(1)}%)` +
    ` | delegate=${allDiag.delegate} | avg luma=${avgLuma} | brightness-boosted=${boostedCount}` +
    ` | ${Math.round(performance.now() - t2)}ms`,
  );

  // ── Step 3: Phase selection ───────────────────────────────────────────────
  const t3 = performance.now();
  const { frames: phaseFrames, diag } = await selectPhaseFrames(frames, allPoseResults, movementType, {
    cameraView,
    onProgress,
  });
  const gd = diag?.movementAnalysis ?? null;
  if (gd) {
    const refLeg = gd.refLeg === 'L' ? 'Left' : 'Right';
    const warnStr = gd.warnings.length > 0 ? ` | warnings: ${gd.warnings.join(', ')}` : '';
    console.log(
      `[Step 3 ✓] Movement analysis: ref=${refLeg}` +
      ` | L-contacts=${gd.lContactPeaks.length} R-contacts=${gd.rContactPeaks.length}` +
      `${warnStr} | ${Math.round(performance.now() - t3)}ms`,
    );
  } else {
    console.log(
      `[Step 3 ✓] Phase selection: uniform sampling (${movementType})` +
      ` | ${phaseFrames.length} frames | ${Math.round(performance.now() - t3)}ms`,
    );
  }

  const poseResults = phaseFrames.map(f => allPoseResults[f.index]).filter(Boolean);
  const mediapipeDiag = buildMediaPipeDiagnostics(poseResults, phaseFrames);

  // ── Step 4: Annotation, angle calculation, GIF ────────────────────────────
  const t4 = performance.now();
  const total = frames.length;
  const allAnnotatedFrames = await Promise.all(
    frames.map((f, i) => {
      const r = allPoseResults[i];
      const label = `Frame: ${i + 1}/${total}  t=${f.timestamp.toFixed(3)}s`;
      return r?.poseLandmarks?.length
        ? annotateFrame(f.imageData, r.poseLandmarks, label)
        : annotateFrame(f.imageData, [], label);
    }),
  );

  // Phase-selected annotated frames (for report / UI slideshow) — reuse from allAnnotatedFrames
  const annotatedFrames = phaseFrames.map(f => allAnnotatedFrames[f.index]);

  const allFrameAngles = poseResults.map(r =>
    extractAngles(mergeWorldLandmarks(r.poseLandmarks ?? [], r.worldLandmarks), cameraView, movementType),
  );
  const aggregated = aggregateAngles(allFrameAngles, phaseFrames.map(f => f.phase));

  const allFrameLandmarkSeries: FrameLandmarkPoint[] = allPoseResults.map((r, i) => ({
    timestamp: frames[i].timestamp,
    frameIndex: i,
    positions: r.poseLandmarks ? extractLandmarkPositions(r.poseLandmarks) : {},
  }));

  const allFrameAngleSeries: FrameAnglePoint[] = allPoseResults.map((r, i) => ({
    timestamp: frames[i].timestamp,
    frameIndex: i,
    angles: r.poseLandmarks
      ? extractAngles(mergeWorldLandmarks(r.poseLandmarks, r.worldLandmarks), cameraView, movementType)
      : {},
  }));

  const gifData = await framesToGif(allAnnotatedFrames);
  console.log(
    `[Step 4 ✓] ${phaseFrames.length} frames annotated | ${Object.keys(aggregated).length} angle metrics` +
    ` | ${Math.round(performance.now() - t4)}ms`,
  );
  console.log(`[Step 4]   Phases: ${phaseFrames.map(f => f.phase.id).join(', ')}`);

  return {
    allPoseResults,
    phaseFrames,
    poseResults,
    annotatedFrames,
    allAnnotatedFrames,
    gifData,
    allFrameAngles,
    aggregated,
    allFrameAngleSeries,
    allFrameLandmarkSeries,
    movementAnalysisDiag: diag?.movementAnalysis ?? null,
    mediapipeDiag,
  };
}

export async function runSecondaryAnalysis(
  file: File,
  landmarker: PoseLandmarker,
  primaryPhaseFrames: ExtractedFrame[],
  options: {
    movementType: string;
    cameraView: 'side' | 'front' | 'posterior';
    onProgress?: (pct: number, label: string) => void;
  },
): Promise<SecondaryAnalysisResult> {
  const { movementType, cameraView, onProgress } = options;

  const phaseFrames = await extractFramesAtTimestamps(
    file,
    primaryPhaseFrames.map(f => ({ timestamp: f.timestamp, phase: f.phase, index: f.index })),
    { onProgress },
  );

  const poseResults = await detectPoseOnFrames(landmarker, phaseFrames, { onProgress });
  const mediapipeDiag = buildMediaPipeDiagnostics(poseResults, phaseFrames);

  const annotatedFrames = await Promise.all(
    poseResults.map((r, i) =>
      r.poseLandmarks?.length
        ? annotateFrame(phaseFrames[i].imageData, r.poseLandmarks)
        : Promise.resolve(phaseFrames[i].imageData),
    ),
  );

  const allFrameAngles = poseResults.map(r =>
    extractAngles(mergeWorldLandmarks(r.poseLandmarks ?? [], r.worldLandmarks), cameraView, movementType),
  );
  const aggregated = aggregateAngles(allFrameAngles, phaseFrames.map(f => f.phase));

  return { phaseFrames, poseResults, annotatedFrames, allFrameAngles, aggregated, mediapipeDiag };
}
