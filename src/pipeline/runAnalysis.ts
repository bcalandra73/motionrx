import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { ExtractedFrame } from '../types';
import { detectPoseOnFrames, buildMediaPipeDiagnostics } from './poseDetection';
import type { PoseFrameResult, MediaPipeDiagnostics } from './poseDetection';
import { selectPhaseFrames } from './phaseSelection';
import type { GaitFSMDiagnostics } from './phaseSelection';
import { annotateFrame } from './frameAnnotation';
import { mergeWorldLandmarks, extractAngles, aggregateAngles } from './angleCalculation';
import type { AngleStat } from './angleCalculation';
import { extractFramesAtTimestamps } from './frameExtraction';
import { framesToGif } from './gifGeneration';

export interface PrimaryAnalysisResult {
  allPoseResults: PoseFrameResult[];
  phaseFrames: ExtractedFrame[];
  poseResults: PoseFrameResult[];
  annotatedFrames: string[];       // phase-selected frames only (for report / UI slideshow)
  allAnnotatedFrames: string[];    // every extracted frame with wireframe + counter (for pipeline output / GIF)
  gifData: string;
  allFrameAngles: Record<string, number>[];
  aggregated: Record<string, AngleStat>;
  gaitFSMDiag: GaitFSMDiagnostics | null;
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

  const allPoseResults = await detectPoseOnFrames(landmarker, frames, { onProgress });

  const { frames: phaseFrames, diag } = await selectPhaseFrames(frames, allPoseResults, movementType, {
    cameraView,
    onProgress,
  });

  const poseResults = phaseFrames.map(f => allPoseResults[f.index]).filter(Boolean);
  const mediapipeDiag = buildMediaPipeDiagnostics(poseResults, phaseFrames);

  // Annotate every extracted frame with wireframe + "Frame: N/Total" counter
  const total = frames.length;
  const allAnnotatedFrames = await Promise.all(
    frames.map((f, i) => {
      const r = allPoseResults[i];
      const label = `Frame: ${i + 1}/${total}`;
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
  const gifData = await framesToGif(allAnnotatedFrames);

  return {
    allPoseResults,
    phaseFrames,
    poseResults,
    annotatedFrames,
    allAnnotatedFrames,
    gifData,
    allFrameAngles,
    aggregated,
    gaitFSMDiag: diag?.gaitFSM ?? null,
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
