import type { AnalysisStage } from '../../hooks/useVideoAnalysis';

interface Props {
  stage: AnalysisStage;
  label: string;
  hasDualView?: boolean;
}

const STEPS: { id: AnalysisStage; text: string }[] = [
  { id: 'extracting', text: 'Extracting frames' },
  { id: 'detecting',  text: 'Analysing movement & detecting poses' },
  { id: 'analyzing',  text: 'Generating clinical report' },
];

const STAGE_ORDER: AnalysisStage[] = ['extracting', 'detecting', 'analyzing', 'complete'];

export function LoadingState({ stage, label }: Props) {
  const current = STAGE_ORDER.indexOf(stage);

  return (
    <div id="loadingState" style={{ display: 'block', padding: '60px 24px', textAlign: 'center' }}>
      <div className="spinner" />
      <div className="loading-title">Generating Assessment Report</div>
      <div className="loading-sub">MediaPipe detects poses on every frame, GaitFSM selects key phase frames, then Claude AI generates your clinical report</div>
      <div className="step-list">
        {STEPS.map((step, i) => {
          const stepIdx = STAGE_ORDER.indexOf(step.id);
          const done   = current > stepIdx;
          const active = current === stepIdx;
          return (
            <div key={i} className={`step-item${done ? ' done' : active ? ' active' : ''}`}>
              <div className="step-icon">{done ? '✓' : active ? '•' : ''}</div>
              <span>
                {step.text}
                {active && label && (
                  <span style={{ display: 'block', fontSize: '0.72rem', opacity: 0.6, marginTop: 2 }}>
                    {label}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
