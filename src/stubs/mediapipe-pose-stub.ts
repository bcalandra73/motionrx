// Stub for @mediapipe/pose — we only use MoveNet, not BlazePose.
// The @tensorflow-models/pose-detection package statically imports Pose
// from this package even though it is not needed for MoveNet.
export class Pose {
  onResults(_cb: unknown) {}
  setOptions(_opts: unknown) {}
  initialize() { return Promise.resolve(); }
  send(_inputs: unknown) { return Promise.resolve(); }
  close() {}
}
export const POSE_CONNECTIONS: [number, number][] = [];
export const POSE_LANDMARKS: Record<string, number> = {};
export const POSE_LANDMARKS_LEFT: Record<string, number> = {};
export const POSE_LANDMARKS_RIGHT: Record<string, number> = {};
export const POSE_LANDMARKS_NEUTRAL: Record<string, number> = {};
export const VERSION = '0.0.0';
