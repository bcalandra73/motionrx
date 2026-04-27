import { useState } from 'react';
import { Card } from '../Card/Card';

type TapeColor = 'orange' | 'green' | 'yellow' | 'blue' | 'pink' | 'red' | 'white';
type TapeLeg   = 'left' | 'right' | 'left_knee' | 'right_knee' | 'both_knees' | 'both_feet';
type TapeLoc   = 'ankle' | 'heel' | 'toe' | 'knee';

interface ColorConfig {
  color: TapeColor;
  leg:   TapeLeg;
  locs:  TapeLoc[];
}

const COLOR_OPTIONS: { value: TapeColor; label: string }[] = [
  { value: 'orange', label: '🟠 Neon orange'   },
  { value: 'green',  label: '🟢 Neon green'    },
  { value: 'yellow', label: '🟡 Yellow'         },
  { value: 'blue',   label: '🔵 Blue'           },
  { value: 'pink',   label: '🩷 Pink / magenta' },
  { value: 'red',    label: '🔴 Red'            },
  { value: 'white',  label: '⚪ White'          },
];

const LEG_OPTIONS: { value: TapeLeg; label: string }[] = [
  { value: 'left',       label: 'Left leg'        },
  { value: 'right',      label: 'Right leg'       },
  { value: 'left_knee',  label: 'Left knee only'  },
  { value: 'right_knee', label: 'Right knee only' },
  { value: 'both_knees', label: 'Both knees'      },
  { value: 'both_feet',  label: 'Both feet'       },
];

const LOC_OPTIONS: { value: TapeLoc; label: string }[] = [
  { value: 'ankle', label: 'Ankle / malleolus' },
  { value: 'heel',  label: 'Heel'              },
  { value: 'toe',   label: 'Toe / forefoot'    },
  { value: 'knee',  label: 'Knee'              },
];

const DEFAULT_LOCS: TapeLoc[] = ['ankle', 'heel', 'toe'];

function ColorRow({ label, config, onChange }: {
  label:    string;
  config:   ColorConfig;
  onChange: (c: ColorConfig) => void;
}) {
  const toggleLoc = (loc: TapeLoc) => {
    const locs = config.locs.includes(loc)
      ? config.locs.filter(l => l !== loc)
      : [...config.locs, loc];
    onChange({ ...config, locs });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', width: 54, flexShrink: 0 }}>
          {label}
        </div>
        <select style={{ width: 148 }} value={config.color} onChange={e => onChange({ ...config, color: e.target.value as TapeColor })}>
          {COLOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ fontSize: '.78rem', color: 'var(--muted)', flexShrink: 0 }}>assigned to</span>
        <select style={{ width: 160 }} value={config.leg} onChange={e => onChange({ ...config, leg: e.target.value as TapeLeg })}>
          {LEG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 64 }}>
        {LOC_OPTIONS.map(o => (
          <label key={o.value} className="tape-loc-chip">
            <input type="checkbox" checked={config.locs.includes(o.value)} onChange={() => toggleLoc(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function TapeMarkerCard() {
  const [colorA, setColorA] = useState<ColorConfig>({ color: 'orange', leg: 'left',  locs: DEFAULT_LOCS });
  const [colorB, setColorB] = useState<ColorConfig>({ color: 'green',  leg: 'right', locs: DEFAULT_LOCS });

  return (
    <Card icon="🎯" title="Tape Marker Configuration" subtitle="Configure color tape for bony landmark detection" optional style={{ marginTop: 12 }}>
      <ColorRow label="Color A" config={colorA} onChange={setColorA} />
      <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
      <ColorRow label="Color B" config={colorB} onChange={setColorB} />
      <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button
          disabled
          title="Tape detection test coming soon"
          style={{ padding: '7px 16px', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.78rem', fontWeight: 600, cursor: 'not-allowed', opacity: 0.5 }}
        >
          🔍 Test tape detection on uploaded frame
        </button>
        <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Detection test coming soon</span>
      </div>
      <div style={{ padding: '9px 13px', background: 'var(--teal-light)', borderRadius: 6, fontSize: '.73rem', color: 'var(--teal)', lineHeight: 1.65 }}>
        💡 <strong>Placement guide — </strong>
        <strong>Lateral view:</strong> near-leg = lateral malleolus, heel, 5th metatarsal head; far-leg = medial malleolus, heel, 1st metatarsal head ·{' '}
        <strong>Posterior view:</strong> Achilles insertion, calcaneus centre, plantar heel ·{' '}
        <strong>Jump:</strong> lateral femoral condyle (knee), lateral malleolus, 5th metatarsal head ·{' '}
        Strips work best; ~1 cm wide × 2–3 cm long oriented perpendicular to the limb. ·{' '}
        <strong>Frontal view:</strong> ensure tape is below clothing hem and fully visible from camera — knee tape must not be covered by shorts.
      </div>
    </Card>
  );
}
