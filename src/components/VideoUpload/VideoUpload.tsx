import { useRef, useState } from 'react';
import { Card } from '../Card/Card';
import type { CameraView } from '../../types';

interface UploadSlotProps {
  label: string;
  required?: boolean;
  file: File | null;
  cameraView: CameraView;
  frameProgress?: number;
  frameStatusText?: string;
  onFile: (file: File | null) => void;
  onViewChange: (view: CameraView) => void;
}

const VIEW_HINTS: Record<CameraView, string> = {
  side:      '📐 Side: sagittal plane — hip hinge, squat depth, bar path',
  front:     '📐 Front: frontal plane — valgus, pelvic tilt, symmetry',
  posterior: '📐 Posterior: rear view — foot strike, pelvic drop, asymmetry',
};

function UploadSlot({ label, required, file, cameraView, frameProgress, frameStatusText, onFile, onViewChange }: UploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const previewUrl = file ? URL.createObjectURL(file) : null;
  const isVideo = file?.type.startsWith('video/') ?? false;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  return (
    <div>
      <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}{' '}
        {required
          ? <span style={{ color: 'var(--teal)', fontWeight: 700 }}>Required</span>
          : <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '.68rem' }}>(Optional — improves accuracy)</span>}
      </div>

      {!file ? (
        <div
          className={`upload-zone${!required ? ' upload-zone-secondary' : ''} ${dragging ? 'drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept="video/*,image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          <span className="upload-icon" style={!required ? { fontSize: '1.4rem', opacity: .5 } : undefined}>
            {required ? '📁' : '➕'}
          </span>
          <div className="upload-title" style={!required ? { fontSize: '.82rem', opacity: .7 } : undefined}>
            {required ? 'Drop file or click to browse' : 'Add second camera angle'}
          </div>
          <div className="upload-sub">
            {required ? 'MP4, MOV, AVI · JPG, PNG' : 'Front, posterior, or opposite side'}
          </div>
        </div>
      ) : (
        <div className="file-preview" style={{ display: 'block' }}>
          <div className="preview-wrap">
            {isVideo
              ? <video src={previewUrl ?? undefined} style={{ width: '100%', display: 'block', borderRadius: 8 }} controls />
              : <img src={previewUrl ?? undefined} alt="preview" style={{ width: '100%', display: 'block', borderRadius: 8 }} />}
          </div>
          <div className="preview-actions">
            <span className="preview-filename">{file.name}</span>
            <button className="btn-link" onClick={() => onFile(null)}>Remove</button>
          </div>
          {frameStatusText && (
            <div className="frame-status visible">
              <span>{frameStatusText}</span>
              <div className="frame-bar">
                <div className="frame-bar-fill" style={{ width: `${frameProgress ?? 0}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 5 }}>
          Camera Angle
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['side', 'front', 'posterior'] as CameraView[]).map(v => (
            <button key={v} type="button" className={`view-btn ${cameraView === v ? 'active' : ''}`}
              onClick={() => onViewChange(v)}>
              <span className="view-btn-icon">{v === 'side' ? '◀▶' : v === 'front' ? '👁' : '↩'}</span>
              <span>{v === 'posterior' ? 'Post.' : v.charAt(0).toUpperCase() + v.slice(1)}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: '.68rem', color: 'var(--teal)', marginTop: 4, lineHeight: 1.4 }}>
          {VIEW_HINTS[cameraView]}
        </div>
      </div>
    </div>
  );
}

interface Props {
  primaryFile: File | null;
  primaryView: CameraView;
  secondaryFile: File | null;
  secondaryView: CameraView;
  primaryProgress?: number;
  primaryStatusText?: string;
  secondaryProgress?: number;
  secondaryStatusText?: string;
  onPrimaryFile: (file: File | null) => void;
  onPrimaryView: (view: CameraView) => void;
  onSecondaryFile: (file: File | null) => void;
  onSecondaryView: (view: CameraView) => void;
  onGuide: () => void;
  focusAreas: string[];
  onFocusToggle: (area: string) => void;
}

const FOCUS_OPTIONS = [
  { value: 'posture and spinal alignment',   label: 'Posture & Spine' },
  { value: 'knee alignment and tracking',    label: 'Knee Alignment' },
  { value: 'hip symmetry and mobility',      label: 'Hip Symmetry' },
  { value: 'ankle and foot mechanics',       label: 'Ankle & Foot' },
  { value: 'shoulder girdle mechanics',      label: 'Shoulder Girdle' },
  { value: 'balance and weight distribution',label: 'Balance & Load' },
  { value: 'compensation patterns',          label: 'Compensations' },
  { value: 'range of motion limitations',    label: 'ROM Limitations' },
  { value: 'pain-avoidance movement patterns',label: 'Pain Avoidance' },
];

export function VideoUpload({
  primaryFile, primaryView, secondaryFile, secondaryView,
  primaryProgress, primaryStatusText, secondaryProgress, secondaryStatusText,
  onPrimaryFile, onPrimaryView, onSecondaryFile, onSecondaryView,
  onGuide, focusAreas, onFocusToggle,
}: Props) {
  const dualActive = !!secondaryFile;

  return (
    <Card icon="🎬" title="Media Upload" subtitle="Upload one video or add a second angle for dual-plane analysis" className="no-mb">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <UploadSlot label="Primary View" required
          file={primaryFile} cameraView={primaryView}
          frameProgress={primaryProgress} frameStatusText={primaryStatusText}
          onFile={onPrimaryFile} onViewChange={onPrimaryView} />
        <UploadSlot label="Second Angle"
          file={secondaryFile} cameraView={secondaryView}
          frameProgress={secondaryProgress} frameStatusText={secondaryStatusText}
          onFile={onSecondaryFile} onViewChange={onSecondaryView} />
      </div>

      {dualActive && (
        <div style={{ background: 'linear-gradient(135deg,var(--teal-light),var(--navy-light))', border: '1px solid var(--teal)', borderRadius: 8, padding: '10px 14px', fontSize: '.78rem', color: 'var(--navy)', marginBottom: 12 }}>
          <strong style={{ color: 'var(--teal)' }}>✦ Dual-plane analysis active</strong> — MediaPipe will run on both videos independently.
          Sagittal angles from <strong>{primaryView} view</strong>, frontal plane angles from <strong>{secondaryView} view</strong>. Results merged for higher accuracy.
        </div>
      )}

      <button type="button" onClick={onGuide} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 14px', fontFamily: "'Inter',sans-serif", fontSize: '.78rem', fontWeight: 500, color: 'var(--navy-mid)', cursor: 'pointer', width: '100%', justifyContent: 'center', transition: 'all .15s' }}>
        💡 View camera setup tips for best tracking accuracy
      </button>

      <div style={{ marginTop: 8 }}>
        <hr style={{ margin: '4px 0 12px', border: 'none', borderTop: '1px solid var(--border)' }} />
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--navy)' }}>Analysis Focus Areas</div>
          <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 2 }}>Select all that apply</div>
        </div>
        <div className="focus-grid">
          {FOCUS_OPTIONS.map(opt => {
            const on = focusAreas.includes(opt.value);
            return (
              <label key={opt.value} className={`focus-chip${on ? ' on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => onFocusToggle(opt.value)} />
                <div className="focus-dot" />
                {opt.label}
              </label>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
