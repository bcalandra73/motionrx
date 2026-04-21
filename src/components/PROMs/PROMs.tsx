import { useState } from 'react';
import { LEFS_ITEMS, LEFS_OPTIONS, ODI_ITEMS } from '../../hooks/usePROMs';
import type { NPRSData, PSFSItem } from '../../types';

interface Props {
  lefsScores: (number | null)[];
  lefsTotal: number | null;
  odiScores: (number | null)[];
  odiScore: number | null;
  nprs: NPRSData;
  psfs: PSFSItem[];
  lsiInjured: string;
  lsiUninjured: string;
  lsi: number | null;
  onLefsScore: (i: number, v: number | null) => void;
  onOdiScore: (i: number, v: number | null) => void;
  onNprs: (patch: Partial<NPRSData>) => void;
  onPsfsItem: (i: number, patch: Partial<PSFSItem>) => void;
  onLsiInjured: (v: string) => void;
  onLsiUninjured: (v: string) => void;
}

type Region = 'lower' | 'upper' | 'spine';

const LEFS_SCORE_OPTIONS = LEFS_OPTIONS.map((label, i) => ({ value: 4 - i, label }));

const DASH_ITEMS = [
  'Open a tight jar', 'Write', 'Turn a key',
  'Prepare a meal', 'Push open a heavy door',
  'Place an object on a shelf above your head',
  'Do heavy household chores', 'Garden or do yard work',
  'Make a bed', 'Carry a shopping bag',
  'Carry a heavy object (over 10 lbs)',
];
const DASH_OPTIONS = ['No difficulty', 'Mild difficulty', 'Moderate difficulty', 'Severe difficulty', 'Unable'];

export function PROMs(props: Props) {
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState<Region>('lower');
  const [dashScores, setDashScores] = useState<(number | null)[]>(Array(DASH_ITEMS.length).fill(null));

  const dashScore: number | null = (() => {
    const filled = dashScores.filter(v => v !== null) as number[];
    if (filled.length < DASH_ITEMS.length) return null;
    const sum = filled.reduce((a, b) => a + b, 0);
    return Math.round(((sum - DASH_ITEMS.length) / (DASH_ITEMS.length * 4)) * 100);
  })();

  const summaryParts = [
    props.lefsTotal != null && `LEFS ${props.lefsTotal}/80`,
    dashScore != null && `QuickDASH ${dashScore}/100`,
    props.odiScore != null && `ODI ${props.odiScore}%`,
    props.lsi != null && `LSI ${props.lsi}%`,
  ].filter(Boolean);

  return (
    <>
      <button type="button" className={`proms-toggle${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)}>
        <div className="pt-left">
          <div className="pt-icon">📋</div>
          <div style={{ textAlign: 'left' }}>
            <div>Patient Reported Outcomes (PROMs) <span style={{ fontSize: '.72rem', fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>Optional</span></div>
            <div style={{ fontSize: '.72rem', fontWeight: 400, color: 'var(--muted)', marginTop: 1 }}>
              {summaryParts.length > 0
                ? summaryParts.join(' · ')
                : 'Expand to add pain, function, and quality-of-life scores — can also be added after analysis'}
            </div>
          </div>
        </div>
        <span className="pt-arrow">▼</span>
      </button>

      {open && (
        <div className="proms-panel open">
          {/* Region selector */}
          <div className="prom-block">
            <div className="prom-block-title">Assessment Region</div>
            <div className="prom-block-sub">Select the relevant body region to show appropriate outcome measures</div>
            <div className="prom-region-tabs">
              {(['lower', 'upper', 'spine'] as Region[]).map(r => (
                <button key={r} type="button" className={`prom-tab${region === r ? ' active' : ''}`} onClick={() => setRegion(r)}>
                  {r === 'lower' ? 'Lower Extremity' : r === 'upper' ? 'Upper Extremity' : 'Spine / General'}
                </button>
              ))}
            </div>
          </div>

          {/* NPRS — always shown */}
          <div className="prom-block">
            <div className="prom-block-title">NPRS — Numeric Pain Rating Scale</div>
            <div className="prom-block-sub">Current pain level (0 = no pain, 10 = worst imaginable pain)</div>
            <div className="prom-scale" id="nprsScale">
              {Array.from({ length: 11 }, (_, i) => (
                <label key={i}>
                  <input type="radio" name="nprs_current" value={i} checked={props.nprs.current === i}
                    onChange={() => props.onNprs({ current: i })} />
                  <div className="ps-num">{i}</div>
                </label>
              ))}
            </div>
            <div className="prom-scale-labels"><span>No pain</span><span>Worst pain</span></div>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div className="form-label" style={{ marginBottom: 4 }}>Best pain (last 24h)</div>
                <div className="prom-scale">
                  {Array.from({ length: 11 }, (_, i) => (
                    <label key={i}>
                      <input type="radio" name="nprs_best" value={i} checked={props.nprs.best === i}
                        onChange={() => props.onNprs({ best: i })} />
                      <div className="ps-num">{i}</div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="form-label" style={{ marginBottom: 4 }}>Worst pain (last 24h)</div>
                <div className="prom-scale">
                  {Array.from({ length: 11 }, (_, i) => (
                    <label key={i}>
                      <input type="radio" name="nprs_worst" value={i} checked={props.nprs.worst === i}
                        onChange={() => props.onNprs({ worst: i })} />
                      <div className="ps-num">{i}</div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* PSFS — always shown */}
          <div className="prom-block">
            <div className="prom-block-title">PSFS — Patient Specific Functional Scale</div>
            <div className="prom-block-sub">List up to 3 activities the patient finds difficult. Rate current ability (0 = unable, 10 = fully able).</div>
            <div id="psfsItems">
              {[
                'Activity 1 (e.g. climbing stairs)',
                'Activity 2 (e.g. running)',
                'Activity 3 (e.g. squatting)',
              ].map((placeholder, i) => (
                <div key={i} className="psfs-item">
                  <input type="text" placeholder={placeholder} value={props.psfs[i].activity}
                    onChange={e => props.onPsfsItem(i, { activity: e.target.value })} />
                  <div className="psfs-score">
                    {Array.from({ length: 11 }, (_, n) => (
                      <label key={n} className="psfs-score">
                        <input type="radio" name={`psfs_${i}`} value={n} checked={props.psfs[i].score === n}
                          onChange={() => props.onPsfsItem(i, { score: n })} />
                        <div className="ps-num">{n}</div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lower Extremity */}
          {region === 'lower' && (
            <>
              <div className="prom-block" id="promLower">
                <div className="prom-block-title">LEFS — Lower Extremity Functional Scale</div>
                <div className="prom-block-sub">Rate difficulty with each activity today (4 = no difficulty, 0 = unable). Max score: 80.</div>
                <div className="lefs-grid">
                  {LEFS_ITEMS.map((item, i) => (
                    <div key={i} className="lefs-item">
                      <div className="lefs-label">{item}</div>
                      <select value={props.lefsScores[i] ?? ''}
                        onChange={e => props.onLefsScore(i, e.target.value === '' ? null : parseInt(e.target.value, 10))}>
                        <option value="">—</option>
                        {LEFS_SCORE_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--navy)' }}>
                    Total: <span style={{ fontFamily: "'Source Serif 4',serif", fontSize: '1.1rem' }}>{props.lefsTotal ?? '—'}</span> / 80
                  </div>
                  <div style={{ fontSize: '.76rem', color: 'var(--muted)' }}>
                    {props.lefsTotal != null && (
                      props.lefsTotal >= 70 ? 'Minimal disability' :
                      props.lefsTotal >= 54 ? 'Mild disability' :
                      props.lefsTotal >= 38 ? 'Moderate disability' :
                      'Severe disability'
                    )}
                  </div>
                </div>
              </div>

              {/* LSI */}
              <div className="prom-block">
                <div className="prom-block-title">Limb Symmetry Index (LSI)</div>
                <div className="prom-block-sub">Enter hop / jump test distances or heights to compute side-to-side symmetry. Target: ≥90%.</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Injured Limb (cm or score)</label>
                    <input type="number" placeholder="e.g. 145" value={props.lsiInjured}
                      onChange={e => props.onLsiInjured(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Uninjured Limb</label>
                    <input type="number" placeholder="e.g. 168" value={props.lsiUninjured}
                      onChange={e => props.onLsiUninjured(e.target.value)} />
                  </div>
                </div>
                {props.lsi != null && (
                  <div style={{ marginTop: 10, textAlign: 'center' }}>
                    <div className={`asi-lsi-val ${props.lsi >= 90 ? 'asi-ok' : props.lsi >= 75 ? 'asi-warn' : 'asi-poor'}`}>
                      {props.lsi}%
                    </div>
                    <div className="asi-lsi-label">Limb Symmetry Index</div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Upper Extremity — QuickDASH */}
          {region === 'upper' && (
            <div className="prom-block" id="promUpper">
              <div className="prom-block-title">QuickDASH — Disabilities of Arm, Shoulder and Hand</div>
              <div className="prom-block-sub">Rate difficulty/symptoms (1 = no difficulty, 5 = unable). 11 items. Score 0–100 (lower = better).</div>
              <div className="lefs-grid">
                {DASH_ITEMS.map((item, i) => (
                  <div key={i} className="lefs-item">
                    <div className="lefs-label">{item}</div>
                    <select value={dashScores[i] ?? ''}
                      onChange={e => {
                        const next = [...dashScores];
                        next[i] = e.target.value === '' ? null : parseInt(e.target.value, 10);
                        setDashScores(next);
                      }}>
                      <option value="">—</option>
                      {DASH_OPTIONS.map((opt, j) => (
                        <option key={j} value={j + 1}>{opt}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--navy)' }}>
                  Score: <span style={{ fontFamily: "'Source Serif 4',serif", fontSize: '1.1rem' }}>{dashScore ?? '—'}</span> / 100
                </div>
                <div style={{ fontSize: '.76rem', color: 'var(--muted)' }}>
                  {dashScore != null && (
                    dashScore < 25 ? 'Mild disability' :
                    dashScore < 50 ? 'Moderate disability' :
                    'Severe disability'
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Spine — ODI */}
          {region === 'spine' && (
            <div className="prom-block" id="promSpine">
              <div className="prom-block-title">Oswestry Disability Index (ODI) — Abbreviated</div>
              <div className="prom-block-sub">6-item version. Rate how back/neck pain affects each activity (0–5 per item). Score 0–100%.</div>
              <div id="odiGrid">
                {ODI_ITEMS.map((item, i) => (
                  <div key={i} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--navy)', marginBottom: 6 }}>{item.label}</div>
                    {item.opts.map((opt, j) => (
                      <label key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: '.78rem', cursor: 'pointer' }}>
                        <input type="radio" name={`odi_${i}`} value={j} checked={props.odiScores[i] === j}
                          onChange={() => props.onOdiScore(i, j)} />
                        {opt}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--navy)' }}>
                  Disability: <span style={{ fontFamily: "'Source Serif 4',serif", fontSize: '1.1rem' }}>{props.odiScore ?? '—'}</span>%
                </div>
                <div style={{ fontSize: '.76rem', color: 'var(--muted)' }}>
                  {props.odiScore != null && (
                    props.odiScore < 20 ? 'Minimal disability' :
                    props.odiScore < 40 ? 'Moderate disability' :
                    props.odiScore < 60 ? 'Severe disability' :
                    'Crippling / bed-bound'
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
