import type { AutoSaveState } from '../../types';

interface Props {
  state: AutoSaveState;
  onRestore: () => void;
  onDismiss: () => void;
}

export function AutoSaveBanner({ state, onRestore, onDismiss }: Props) {
  const age = Math.round((Date.now() - state.ts) / 60000);
  const ageStr = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;
  const name = state.patient || 'unnamed patient';

  return (
    <div style={{
      display: 'flex', background: '#e8f5e9', border: '1px solid #a5d6a7',
      borderRadius: 8, padding: '12px 18px', marginBottom: 16,
      alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '.85rem', color: '#1b5e20', flex: 1 }}>
        💾 <strong>Session recovered</strong> — {name} · {state.movement || 'unknown movement'} · {ageStr}
      </span>
      <button
        onClick={onRestore}
        style={{ padding: '7px 16px', background: '#1b5e20', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}
      >
        Restore Last Session
      </button>
      <button
        onClick={onDismiss}
        style={{ padding: '7px 12px', background: 'none', border: '1px solid #a5d6a7', borderRadius: 6, fontSize: '.82rem', color: '#1b5e20', cursor: 'pointer' }}
      >
        Dismiss
      </button>
    </div>
  );
}
