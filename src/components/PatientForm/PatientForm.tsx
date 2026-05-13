import { Card } from '../Card/Card';
import type { PatientFormData, MovementType, InjuredSide, HeightUnit } from '../../types';

interface Props {
  form: PatientFormData;
  onChange: <K extends keyof PatientFormData>(key: K, value: PatientFormData[K]) => void;
}

export function PatientForm({ form, onChange }: Props) {
  const heightWarn = (() => {
    const h = parseFloat(form.patientHeight);
    if (!h) return null;
    if (form.heightUnit === 'in' && (h < 48 || h > 84)) return 'Height seems outside normal adult range — double-check units.';
    if (form.heightUnit === 'cm' && (h < 122 || h > 213)) return 'Height seems outside normal adult range — double-check units.';
    return null;
  })();

  return (
    <Card icon="👤" title="Patient Information" subtitle="Demographics and clinical context" className="no-mb">
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Patient Name</label>
          <input type="text" placeholder="Full name" value={form.patientName}
            onChange={e => onChange('patientName', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Age</label>
          <input type="number" placeholder="Years" min={1} max={120} value={form.patientAge}
            onChange={e => onChange('patientAge', e.target.value)} />
        </div>
        <div className="form-group full">
          <label className="form-label">Chief Complaint / Diagnosis</label>
          <input type="text" placeholder="e.g. Right knee pain, post-ACL reconstruction"
            value={form.diagnosis} onChange={e => onChange('diagnosis', e.target.value)} />
        </div>
        <div className="form-group full">
          <label className="form-label">Movement Being Assessed <span className="req">*</span></label>
          <select value={form.movementType} onChange={e => onChange('movementType', e.target.value as MovementType)}>
            <option value="">Select movement type...</option>
            <optgroup label="Lower Extremity">
              <option>Gait / Walking</option>
              <option>Running</option>
              <option>Squat (Double-Leg)</option>
              <option>Single-Leg Squat</option>
              <option>Lunge</option>
              <option>Step Up / Step Down</option>
              <option>Hip Hinge / Deadlift Pattern</option>
            </optgroup>
            <optgroup label="Jump &amp; Landing (ACL / Return to Sport)">
              <option>Drop Jump Landing</option>
              <option>Countermovement Jump</option>
              <option>Single-Leg Landing</option>
              <option>Tuck Jump</option>
            </optgroup>
            <optgroup label="Upper Extremity">
              <option>Overhead Press / Reach</option>
              <option>Shoulder Flexion / Abduction</option>
              <option>Pushing / Pulling Pattern</option>
            </optgroup>
            <optgroup label="Functional">
              <option>Sit to Stand</option>
              <option>Balance / Single-Leg Stance</option>
              <option>Stairs</option>
              <option>Other / General Posture</option>
            </optgroup>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Height <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="number" placeholder="e.g. 66" min={48} max={84} step={1} style={{ flex: 1 }}
              value={form.patientHeight} onChange={e => onChange('patientHeight', e.target.value)} />
            <select style={{ width: 72, flexShrink: 0 }} value={form.heightUnit}
              onChange={e => onChange('heightUnit', e.target.value as HeightUnit)}>
              <option value="in">in</option>
              <option value="cm">cm</option>
            </select>
          </div>
          {heightWarn && (
            <div style={{ fontSize: '.7rem', color: '#f59e0b', marginTop: 3, padding: '3px 8px', background: 'rgba(245,158,11,.12)', borderRadius: 4, borderLeft: '3px solid #f59e0b' }}>
              {heightWarn}
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Symptomatic Side <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
          <select value={form.injuredSide} onChange={e => onChange('injuredSide', e.target.value as InjuredSide)}>
            <option value="">Unknown</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="bilateral">Bilateral</option>
            <option value="none">No injury</option>
          </select>
        </div>
        <div className="form-group full">
          <label className="form-label">Clinical Notes</label>
          <textarea placeholder="Relevant history, surgical dates, prior findings, areas of concern..."
            value={form.clinicalNotes} onChange={e => onChange('clinicalNotes', e.target.value)} />
        </div>
      </div>
    </Card>
  );
}
