import { useEffect, useState } from 'react';

export function AppHeader() {
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
        <div className="header-badge">Clinical Prototype</div>
        <div className="header-date">{dateStr}</div>
      </div>
    </header>
  );
}
