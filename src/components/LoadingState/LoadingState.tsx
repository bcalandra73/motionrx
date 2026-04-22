import type { AnalysisStage } from '../../hooks/useVideoAnalysis';

interface Props {
  stage: AnalysisStage;
  label: string;
  hasDualView?: boolean;
}

const BASE_STEPS: { id: AnalysisStage; text: string; dualOnly?: boolean }[] = [
  { id: 'extracting', text: 'Extracting video frames' },
  { id: 'detecting',  text: 'Running Pose Landmarker Heavy detection' },
  { id: 'detecting',  text: 'Processing second camera angle', dualOnly: true },
  { id: 'detecting',  text: 'Calculating joint angles' },
  { id: 'analyzing',  text: 'Sending to Claude AI for clinical analysis' },
  { id: 'complete',   text: 'Compiling report' },
];

const STAGE_ORDER: AnalysisStage[] = ['extracting', 'detecting', 'analyzing', 'complete'];

function stageIndex(s: AnalysisStage) {
  return STAGE_ORDER.indexOf(s);
}

export function LoadingState({ stage, hasDualView }: Props) {
  const current = stageIndex(stage);
  const steps = BASE_STEPS.filter(s => !s.dualOnly || hasDualView);

  return (
    <div id="loadingState" style={{ display: 'block', padding: '60px 24px', textAlign: 'center' }}>
      <div className="spinner" />
      <div className="loading-title">Generating Assessment Report</div>
      <div className="loading-sub">MediaPipe is measuring joint angles, then Claude AI will generate your clinical findings</div>
      <div className="step-list">
        {steps.map((step, i) => {
          const stepStage = stageIndex(step.id);
          const done = current > stepStage;
          const active = current === stepStage && !done;
          return (
            <div key={i} className={`step-item${done ? ' done' : active ? ' active' : ''}`}>
              <div className="step-icon">{done ? '✓' : active ? '•' : ''}</div>
              {step.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
