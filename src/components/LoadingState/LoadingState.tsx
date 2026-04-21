import type { AnalysisStage } from '../../hooks/useVideoAnalysis';

interface Props {
  stage: AnalysisStage;
  label: string;
}

const STEPS: { id: AnalysisStage; text: string }[] = [
  { id: 'extracting', text: 'Extracting video frames' },
  { id: 'detecting',  text: 'Running Pose Landmarker Heavy detection' },
  { id: 'detecting',  text: 'Calculating joint angles' },
  { id: 'analyzing',  text: 'Sending to Claude AI for clinical analysis' },
  { id: 'complete',   text: 'Compiling report' },
];

const STAGE_ORDER: AnalysisStage[] = ['extracting', 'detecting', 'analyzing', 'complete'];

function stageIndex(s: AnalysisStage) {
  return STAGE_ORDER.indexOf(s);
}

export function LoadingState({ stage }: Props) {
  const current = stageIndex(stage);

  return (
    <div id="loadingState" style={{ display: 'block', padding: '60px 24px', textAlign: 'center' }}>
      <div className="spinner" />
      <div className="loading-title">Generating Assessment Report</div>
      <div className="loading-sub">MediaPipe is measuring joint angles, then Claude AI will generate your clinical findings</div>
      <div className="step-list">
        {STEPS.map((step, i) => {
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
