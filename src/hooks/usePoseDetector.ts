import { useState, useRef } from 'react';

export type DetectorStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PoseDetectorState {
  mpReady: boolean;
  status: DetectorStatus;
  error: string | null;
}

export function usePoseDetector() {
  const [state, setState] = useState<PoseDetectorState>({
    mpReady: false,
    status: 'idle',
    error: null,
  });

  const poseInstanceRef = useRef<unknown>(null);

  function setMpReady(instance: unknown) {
    poseInstanceRef.current = instance;
    setState(prev => ({ ...prev, mpReady: true, status: 'ready' }));
  }

  function setLoading() {
    setState(prev => ({ ...prev, status: 'loading', error: null }));
  }

  function setError(msg: string) {
    setState(prev => ({ ...prev, status: 'error', error: msg }));
  }

  function reset() {
    poseInstanceRef.current = null;
    setState({ mpReady: false, status: 'idle', error: null });
  }

  return { ...state, poseInstanceRef, setMpReady, setLoading, setError, reset };
}
