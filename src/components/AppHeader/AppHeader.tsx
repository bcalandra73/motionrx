import { useEffect, useState } from 'react';

interface Props {
  onLoadCase?: () => void;
}

export function AppHeader({ onLoadCase }: Props) {
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    setDateStr(new Date().toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    }));
  }, []);

  return (
    <header>
      <div className="logo">
        <div className="logo-mark">🦴</div>
        <div className="logo-text">Motion<span>Rx</span></div>
      </div>
      <div className="header-right">
        {onLoadCase && (
          <button className="btn-outline" onClick={onLoadCase} style={{ fontSize: '.78rem', padding: '4px 12px' }}>
            Load Case
          </button>
        )}
        <div className="header-badge">Clinical Prototype</div>
        <div className="header-date">{dateStr}</div>
      </div>
    </header>
  );
}
