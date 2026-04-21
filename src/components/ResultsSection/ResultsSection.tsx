import type { AnalysisReport, Branding, PatientFormData, AnnotatedFrame } from '../../types';

interface Props {
  report: AnalysisReport;
  patient: PatientFormData;
  branding: Branding;
  annotatedFrames: AnnotatedFrame[];
  annotatedFrames2: AnnotatedFrame[];
  onNewAssessment: () => void;
  onSaveSession: () => void;
  onExportPdf: () => void;
  onCompare: () => void;
}

function scoreClass(score: number) {
  if (score >= 75) return 'score-good';
  if (score >= 50) return 'score-warn';
  return 'score-poor';
}

function dotClass(priority: string) {
  if (priority === 'high') return 'dot-high';
  if (priority === 'positive') return 'dot-low';
  return 'dot-med';
}

function narrativeHtml(text: string) {
  return text.split('\n').filter(l => l.trim()).map(l => `<p>${l}</p>`).join('');
}

export function ResultsSection({ report, patient, branding, annotatedFrames, annotatedFrames2, onNewAssessment, onSaveSession, onExportPdf, onCompare }: Props) {
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const subtitle = [patient.patientName, patient.patientAge ? `Age ${patient.patientAge}` : '', patient.movementType, now].filter(Boolean).join(' · ');
  const practiceLabel = branding.practice || 'MotionRx';
  const hasDual = annotatedFrames2.length > 0;

  return (
    <div id="resultsSection" style={{ display: 'block' }}>
      {/* Report header */}
      <div className="report-header">
        <div>
          <div className="report-title">{practiceLabel} — Motion Analysis Report</div>
          <div className="report-subtitle" id="reportSubtitle">{subtitle}</div>
        </div>
        <div className="report-header-right">
          <button className="btn-outline" onClick={onNewAssessment}>+ New Assessment</button>
          <button className="btn-outline" onClick={onSaveSession}>Save Session</button>
          <button className="btn-outline" onClick={onCompare}>Compare</button>
          <button className="btn-solid" onClick={onExportPdf}>Export PDF</button>
        </div>
      </div>

      {/* Score strip */}
      {report.score != null && (
        <div className="score-strip" id="scoreStrip">
          <div className="score-tile">
            <div className={`score-tile-value ${scoreClass(report.score)}`}>{report.score}/100</div>
            <div className="score-tile-label">Movement Quality Score</div>
          </div>
          {report.score_summary && (
            <div className="score-tile" style={{ gridColumn: 'span 3', textAlign: 'left' }}>
              <div style={{ fontSize: '.84rem', color: 'var(--ink)', lineHeight: 1.6 }}>{report.score_summary}</div>
            </div>
          )}
        </div>
      )}

      {/* Frame gallery */}
      {annotatedFrames.length > 0 && (
        <div className={`frames-gallery${hasDual ? ' dual-view' : ''}`}>
          {annotatedFrames.map((frame, i) => (
            <div key={i} className="frame-card">
              <div className="frame-card-img">
                <img src={`data:image/jpeg;base64,${frame.base64}`} alt={`Frame ${i + 1}`} style={{ width: '100%', display: 'block' }} />
                <div className="frame-label">
                  <span>{frame.phaseId ?? `Frame ${i + 1}`}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main report grid */}
      <div className="report-grid" id="reportGrid">
        {/* Findings */}
        {report.findings?.length > 0 && (
          <div className="report-section">
            <div className="section-head">
              <span className="sh-icon">🔍</span>
              <h3>Key Findings</h3>
            </div>
            <div className="section-body">
              {report.findings.map((f, i) => (
                <div key={i} className="finding">
                  <div className={`finding-dot ${dotClass(f.priority)}`} />
                  <div>
                    <div className="finding-title">{f.title}</div>
                    <div className="finding-desc">{f.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {report.recommendations?.length > 0 && (
          <div className="report-section">
            <div className="section-head">
              <span className="sh-icon">📋</span>
              <h3>Recommendations</h3>
            </div>
            <div className="section-body">
              {report.recommendations.map((r, i) => (
                <div key={i} className="rec-item">
                  <div className="rec-num">{i + 1}</div>
                  <div className="rec-text">{r}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Biomechanical analysis */}
        {report.biomechanical_analysis && (
          <div className="report-section full">
            <div className="section-head">
              <span className="sh-icon">⚙️</span>
              <h3>Biomechanical Analysis</h3>
            </div>
            <div className="section-body">
              <div className="narrative" dangerouslySetInnerHTML={{ __html: narrativeHtml(report.biomechanical_analysis) }} />
            </div>
          </div>
        )}

        {/* Clinical impressions */}
        {report.clinical_impressions && (
          <div className="report-section full">
            <div className="section-head">
              <span className="sh-icon">🩺</span>
              <h3>Clinical Impressions</h3>
            </div>
            <div className="section-body">
              <div className="narrative" dangerouslySetInnerHTML={{ __html: narrativeHtml(report.clinical_impressions) }} />
            </div>
          </div>
        )}

        {/* Patient education */}
        {report.patient_education?.length > 0 && (
          <div className="report-section full">
            <div className="section-head">
              <span className="sh-icon">📚</span>
              <h3>Patient Education</h3>
            </div>
            <div className="section-body">
              {report.patient_education.map((e, i) => (
                <div key={i} className="edu-item">
                  <span className="edu-icon">💬</span>
                  <div className="edu-text">{e}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footwear recommendation */}
        {report.footwear_recommendation && (
          <div className="report-section full">
            <div className="section-head">
              <span className="sh-icon">👟</span>
              <h3>Footwear Recommendation</h3>
            </div>
            <div className="section-body">
              <div className="narrative">
                <p>{report.footwear_recommendation}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
