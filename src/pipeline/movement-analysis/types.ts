import type { NormalizedLandmark } from '../../types';

export type AnalyzableMovement = 'Running';

export type Side = 'left' | 'right';

export interface PoseFrame {
  frameIndex: number;
  timestampMs: number;
  landmarks: NormalizedLandmark[];
}

export type RunningPhaseId =
  | 'contact'
  | 'loading'
  | 'midstance'
  | 'propulsion'
  | 'toeoff'
  | 'earlyswing'
  | 'midswing'
  | 'lateswing';

export type PhaseId = RunningPhaseId;

export interface KeyFrame {
  frameIndex: number;
  timestampMs: number;
  phaseId: PhaseId;
  side: Side;
  confidence: number;
}

export interface MovementAnalysisResult {
  keyFrames: KeyFrame[];
  warnings: string[];
  refSide: Side;
}

export class MovementAnalysisError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MovementAnalysisError';
  }
}

export interface MovementAnalyzer {
  readonly movementType: AnalyzableMovement;
  analyze(frames: PoseFrame[], fps: number): MovementAnalysisResult;
}
