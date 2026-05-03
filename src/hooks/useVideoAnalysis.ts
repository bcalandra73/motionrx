import { useState } from 'react';
import type {
  CameraView,
  ExtractedFrame,
  AnnotatedFrame,
  AnalysisReport,
  StrideMetrics,
  PhaseSelection,
  NormalizedLandmark,
} from '../types';

export type AnalysisStage =
  | 'idle'
  | 'extracting'
  | 'detecting'
  | 'analyzing'
  | 'complete'
  | 'error';

export interface VideoSlot {
  file: File | null;
  cameraView: CameraView;
  extractedFrames: ExtractedFrame[];
  annotatedFrames: AnnotatedFrame[];
  landmarks: NormalizedLandmark[][];
  gifData: string | null;
  barTrackingFrames: ExtractedFrame[];
  rawBarPoints: Array<{ x: number; y: number; confidence: number; t: number }>;
}

const defaultSlot = (view: CameraView): VideoSlot => ({
  file: null,
  cameraView: view,
  extractedFrames: [],
  annotatedFrames: [],
  landmarks: [],
  gifData: null,
  barTrackingFrames: [],
  rawBarPoints: [],
});

export interface AnalysisState {
  stage: AnalysisStage;
  stageLabel: string;
  progress: number; // 0–100
  error: string | null;
  report: AnalysisReport | null;
  strideMetrics: StrideMetrics | null;
  phaseSelection: PhaseSelection | null;
  aggregated: Record<string, unknown>;
  aggregated2: Record<string, unknown>;
}

export function useVideoAnalysis() {
  const [primary, setPrimary] = useState<VideoSlot>(defaultSlot('side'));
  const [secondary, setSecondary] = useState<VideoSlot>(defaultSlot('front'));
  const [showSecondary, setShowSecondary] = useState(false);

  const [analysis, setAnalysis] = useState<AnalysisState>({
    stage: 'idle',
    stageLabel: '',
    progress: 0,
    error: null,
    report: null,
    strideMetrics: null,
    phaseSelection: null,
    aggregated: {},
    aggregated2: {},
  });

  function setPrimaryFile(file: File | null) {
    setPrimary(prev => ({ ...defaultSlot(prev.cameraView), file }));
  }

  function setSecondaryFile(file: File | null) {
    setSecondary(prev => ({ ...defaultSlot(prev.cameraView), file }));
  }

  function setPrimaryView(view: CameraView) {
    setPrimary(prev => ({ ...prev, cameraView: view }));
  }

  function setSecondaryView(view: CameraView) {
    setSecondary(prev => ({ ...prev, cameraView: view }));
  }

  function updatePrimary(patch: Partial<VideoSlot>) {
    setPrimary(prev => ({ ...prev, ...patch }));
  }

  function updateSecondary(patch: Partial<VideoSlot>) {
    setSecondary(prev => ({ ...prev, ...patch }));
  }

  function updateAnalysis(patch: Partial<AnalysisState>) {
    setAnalysis(prev => ({ ...prev, ...patch }));
  }

  function setStage(stage: AnalysisStage, label = '', progress = 0) {
    setAnalysis(prev => ({ ...prev, stage, stageLabel: label, progress, error: null }));
  }

  function setError(msg: string) {
    setAnalysis(prev => ({ ...prev, stage: 'error', error: msg }));
  }

function reset() {
    setPrimary(defaultSlot('side'));
    setSecondary(defaultSlot('front'));
    setShowSecondary(false);
    setAnalysis({
      stage: 'idle',
      stageLabel: '',
      progress: 0,
      error: null,
      report: null,
      strideMetrics: null,
      phaseSelection: null,
      aggregated: {},
      aggregated2: {},
    });
  }

  return {
    primary,
    secondary,
    showSecondary,
    setShowSecondary,
    analysis,
    setPrimaryFile,
    setSecondaryFile,
    setPrimaryView,
    setSecondaryView,
    updatePrimary,
    updateSecondary,
    updateAnalysis,
    setStage,
    setError,
    reset,
  };
}
