import { MovementAnalysisError } from './types';
import type { AnalyzableMovement, MovementAnalysisResult, PoseFrame } from './types';
import { getAnalyzer } from './registry';

export { MovementAnalysisError };
export type { AnalyzableMovement, MovementAnalysisResult, PoseFrame };
export type { KeyFrame, Side, PhaseId, RunningPhaseId } from './types';

export function analyzeMovement(
  movementType: AnalyzableMovement,
  frames: PoseFrame[],
  fps: number,
): MovementAnalysisResult {
  if (frames.length === 0) throw new MovementAnalysisError('Input contains no frames', 'EMPTY_INPUT');
  if (frames.length < 4)  throw new MovementAnalysisError('Fewer than 4 frames provided', 'INSUFFICIENT_FRAMES');
  if (fps <= 0)           throw new MovementAnalysisError('fps must be greater than 0', 'INVALID_FPS');

  let analyzer;
  try {
    analyzer = getAnalyzer(movementType);
  } catch {
    throw new MovementAnalysisError(`Unsupported movement type: ${movementType}`, 'UNSUPPORTED_MOVEMENT_TYPE');
  }

  return analyzer.analyze(frames, fps);
}
