import { useState, useRef } from 'react';

export type DetectorStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PoseDetectorState {
  mpReady: boolean;
  moveNetReady: boolean;
  status: DetectorStatus;
  error: string | null;
}

/**
 * Manages MediaPipe and MoveNet initialization state.
 * Actual init logic (initMediaPipe / initMoveNet) lives in the analysis pipeline
 * and calls the setters exposed here.
 */
export function usePoseDetector() {
  const [state, setState] = useState<PoseDetectorState>({
    mpReady: false,
    moveNetReady: false,
    status: 'idle',
    error: null,
  });

  // Refs so the async init callbacks always see current values
  const poseInstanceRef = useRef<unknown>(null);
  const moveNetDetectorRef = useRef<unknown>(null);

  function setMpReady(instance: unknown) {
    poseInstanceRef.current = instance;
    setState(prev => ({
      ...prev,
      mpReady: true,
      status: prev.moveNetReady ? 'ready' : prev.status,
    }));
  }

  function setMoveNetReady(detector: unknown) {
    moveNetDetectorRef.current = detector;
    setState(prev => ({
      ...prev,
      moveNetReady: true,
      status: prev.mpReady ? 'ready' : prev.status,
    }));
  }

  function setLoading() {
    setState(prev => ({ ...prev, status: 'loading', error: null }));
  }

  function setError(msg: string) {
    setState(prev => ({ ...prev, status: 'error', error: msg }));
  }

  function reset() {
    poseInstanceRef.current = null;
    moveNetDetectorRef.current = null;
    setState({ mpReady: false, moveNetReady: false, status: 'idle', error: null });
  }

  return {
    ...state,
    poseInstanceRef,
    moveNetDetectorRef,
    setMpReady,
    setMoveNetReady,
    setLoading,
    setError,
    reset,
  };
}
