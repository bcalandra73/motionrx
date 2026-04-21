import type { Branding } from '../../types';

interface Props {
  branding: Branding;
  onChange: (key: keyof Branding, value: string) => void;
}

export function BrandingCard({ branding, onChange }: Props) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <div className="card-header-icon">🏥</div>
        <div><h2>Practice Branding</h2><p>Appears on all generated PDF reports — saved in your browser</p></div>
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Practice Name</label>
          <input type="text" placeholder="e.g. Peak Performance Physical Therapy"
            value={branding.practice} onChange={e => onChange('practice', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Clinician Name &amp; Credentials</label>
          <input type="text" placeholder="e.g. Dr. Jane Smith, DPT, OCS"
            value={branding.clinician} onChange={e => onChange('clinician', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Practice Address</label>
          <input type="text" placeholder="123 Main St, Denver, CO 80202"
            value={branding.address} onChange={e => onChange('address', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Phone / Website</label>
          <input type="text" placeholder="(303) 555-0100 · www.yourpractice.com"
            value={branding.contact} onChange={e => onChange('contact', e.target.value)} />
        </div>
      </div>
    </div>
  );
}
