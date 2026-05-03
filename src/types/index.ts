// ── Movement & Camera ──────────────────────────────────────────────────────

export type MovementType =
  | 'Gait / Walking'
  | 'Running'
  | 'Squat (Double-Leg)'
  | 'Single-Leg Squat'
  | 'Lunge'
  | 'Step Up / Step Down'
  | 'Hip Hinge / Deadlift Pattern'
  | 'Drop Jump Landing'
  | 'Countermovement Jump'
  | 'Single-Leg Landing'
  | 'Tuck Jump'
  | 'Overhead Press / Reach'
  | 'Shoulder Flexion / Abduction'
  | string;

export type CameraView = 'side' | 'front' | 'posterior';

export type FootStrike = 'heel' | 'midfoot' | 'forefoot' | 'unknown';

export type InjuredSide = 'left' | 'right' | 'bilateral' | 'none' | '';

export type HeightUnit = 'in' | 'cm';

export type SpeedUnit = 'mph' | 'kph' | 'mps';

export type RunningSurface = 'treadmill' | 'track' | 'road' | 'trail';

export type ShoeType =
  | 'standard'
  | 'stability'
  | 'minimalist'
  | 'carbon'
  | 'maximalist'
  | '';

export type RunnerExperience = 'beginner' | 'recreational' | 'competitive' | 'elite' | '';

export type OverstrideFlag = 'overstride' | 'understride' | 'optimal';

// ── Patient & Form ─────────────────────────────────────────────────────────

export interface PatientFormData {
  patientName: string;
  patientAge: string;
  diagnosis: string;
  movementType: MovementType;
  patientHeight: string;
  heightUnit: HeightUnit;
  injuredSide: InjuredSide;
  clinicalNotes: string;
}

export interface RunningInputs {
  treadmillSpeed: string;
  speedUnit: SpeedUnit;
  treadmillIncline: string;
  runningSurface: RunningSurface;
  videoFps: number;
  shoe: ShoeType;
  experience: RunnerExperience;
  includeFootwear: boolean;
}

export type JumpInvolvedLimb = 'left' | 'right' | 'bilateral' | '';
export type JumpProtocol = '30cm' | '45cm' | 'dvj' | '3hop' | 'custom' | '';
export type JumpTimePostOp = '3mo' | '6mo' | '9mo' | '12mo' | '>12mo' | '';

export interface JumpInputs {
  videoFps: number;
  involvedLimb: JumpInvolvedLimb;
  protocol: JumpProtocol;
  timePostOp: JumpTimePostOp;
}

// ── Branding ───────────────────────────────────────────────────────────────

export interface Branding {
  practice: string;
  clinician: string;
  address: string;
  contact: string;
}

// ── Pose Landmarks ─────────────────────────────────────────────────────────

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface WorldLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface PoseLandmarkSet {
  poseLandmarks: NormalizedLandmark[] | null;
  poseWorldLandmarks: WorldLandmark[] | null;
  timestamp?: number;
}

// ── Frame & Video ──────────────────────────────────────────────────────────

export interface ExtractedFrame {
  imageData: string; // base64 JPEG (no data: prefix)
  phase: PhaseLabel;
  timestamp: number;
  index: number;
}

export interface AnnotatedFrame {
  base64: string;
  landmarks: NormalizedLandmark[] | null;
  timestamp: number;
  index: number;
  phaseId?: string;
}

// ── Phase Detection ────────────────────────────────────────────────────────

export interface PhaseLabel {
  id: string;
  label: string;
  desc: string;
  fraction: number;
  _footStrike?: FootStrike;
}

export interface PhaseSelection {
  fractions: number[];
  labels: string[];
  vizFractions: number[];
}

// ── Stride Metrics ─────────────────────────────────────────────────────────

export type FlagLevel = 'ok' | 'warn' | 'poor' | 'info';

export interface ClinicalFlag {
  level: FlagLevel;
  msg: string;
}

export interface StrideDetail {
  startIdx: number;
  endIdx: number;
  durationS: number;
  gcPct: number | null;
  floatPct: number | null;
  peakKneeFlex: number | null;
  hipAtToeoff: number | null;
  footStrike: FootStrike;
}

export interface StrideMetrics {
  stridesDetected: number;
  cadenceSpm: number;
  avgDuration: number;
  cvStridePct: number | null;
  gcPct: number | null;
  floatPct: number | null;
  hasFloat: boolean;
  gcpReliable: boolean;
  floatReliable: boolean;
  // Kinematics
  peakKneeFlex: number | null;
  kneeFlexAtContact: number | null;
  hipExtAtToeoff: number | null;
  fsConsensus: FootStrike;
  stepLengthAsymPct: number | null;
  // Stride length
  strideLengthM: number | null;
  stepLengthM: number | null;
  legLengthM: number | null;
  strideLengthNorm: number | null;
  overstrideFlag: OverstrideFlag | null;
  // Running context
  speedMps: number | null;
  inclinePct: number;
  surface: RunningSurface | '';
  shoe: ShoeType;
  experience: RunnerExperience;
  heightCm: number | null;
  // Reliability
  gctFpsOk: boolean;
  floatFpsOk: boolean;
  // Meta
  refSide: 'left' | 'right';
  fps: number;
  videoDurationS: number;
  bestStrideFrameRange: [number, number] | null;
  bestStrideDetails: StrideDetail | null;
  allStrideDetails: StrideDetail[];
  lContactIdxs: number[];
  rContactIdxs: number[];
  flags: Record<string, ClinicalFlag>;
}

// ── AI Report ──────────────────────────────────────────────────────────────

export type FindingPriority = 'high' | 'medium' | 'positive';

export interface Finding {
  priority: FindingPriority;
  title: string;
  detail: string;
}

export interface AnalysisReport {
  score: number;
  score_summary: string;
  findings: Finding[];
  biomechanical_analysis: string;
  clinical_impressions: string;
  recommendations: string[];
  patient_education: string[];
  footwear_recommendation?: string;
}

// ── Anthropic API ──────────────────────────────────────────────────────────

export interface AnthropicImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg';
    data: string;
  };
}

export interface AnthropicTextContent {
  type: 'text';
  text: string;
}

export type AnthropicContent = AnthropicImageContent | AnthropicTextContent;

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContent[];
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
}

export interface AnthropicResponseBlock {
  type: string;
  text?: string;
}

export interface AnthropicResponse {
  content: AnthropicResponseBlock[];
  error?: { message: string };
}

// ── Session Persistence ────────────────────────────────────────────────────

export interface AutoSaveState {
  ts: number;
  patient: string;
  age: string;
  movement: MovementType;
  cameraView: CameraView;
  reportHtml: string;
  subtitleHtml: string;
  scoreStrip: string;
  strideSection: string;
  strideVisible: boolean;
}

export interface SavedSession {
  ts: number;
  label: string;
  patient: string;
  movement: MovementType;
  reportHtml: string;
  metrics?: Partial<StrideMetrics>;
}

// ── Landmark Review ────────────────────────────────────────────────────────

export interface ReviewState {
  landmarks: NormalizedLandmark[] | null;
  landmarks2: NormalizedLandmark[] | null;
  zoom: number;
  panX: number;
  panY: number;
  panning: boolean;
  activeFrame: number;
  edited: boolean;
  edited2: boolean;
  hoverLm: number | null;
}

// ── Correction Pack ────────────────────────────────────────────────────────

export interface CorrectionPack {
  landmarks: NormalizedLandmark[][];
  landmarks2: NormalizedLandmark[][];
  videoKey: string;
}

// ── Bar Path ───────────────────────────────────────────────────────────────

export interface BarPoint {
  x: number;
  y: number;
  frameIdx: number;
  timestamp?: number;
}

export interface BarPathStats {
  totalDrift: number;
  maxDeviation: number;
  pathLength: number;
}

// ── PROMs ──────────────────────────────────────────────────────────────────

export interface LEFSData {
  scores: (number | null)[];
  total: number | null;
}

export interface ODIData {
  scores: (number | null)[];
  total: number | null;
}

export interface NPRSData {
  current: number | null;
  best: number | null;
  worst: number | null;
}

export interface PSFSItem {
  activity: string;
  score: number | null;
}

export interface PROMs {
  lefs?: LEFSData;
  odi?: ODIData;
  nprs?: NPRSData;
  psfs?: PSFSItem[];
  lsi?: number | null;
}

// ── Assessment ─────────────────────────────────────────────────────────────
// Serialisable representation of all inputs for one clinical assessment.
// Used to pre-populate the app from a test YAML, and later for save/load.

export interface AssessmentProms {
  nprs?:         NPRSData;
  psfs?:         PSFSItem[];
  lefsScores?:   (number | null)[];
  odiScores?:    (number | null)[];
  lsiInjured?:   string;
  lsiUninjured?: string;
}

export interface AssessmentMedia {
  file:       string;      // filename only — actual File object loaded separately
  cameraView: CameraView;
}

export interface AssessmentCapture {
  startSecs:    number;
  durationSecs: number;
  targetFps:    number;
}

export interface Assessment {
  patient: {
    name:         string;
    age:          string;
    diagnosis:    string;
    movementType: MovementType;
    height:       string;
    heightUnit:   HeightUnit;
    injuredSide:  InjuredSide;
    notes:        string;
  };
  media: {
    primary:    AssessmentMedia;
    secondary?: AssessmentMedia;
  };
  focus:     string[];
  capture?:  AssessmentCapture;
  running?:  RunningInputs;
  jump?:     JumpInputs;
  proms?:    AssessmentProms;
}
