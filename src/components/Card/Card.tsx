import { useState } from 'react';

interface Props {
  icon: string;
  title: string;
  subtitle?: string;
  optional?: boolean;
  defaultOpen?: boolean;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}

export function Card({ icon, title, subtitle, optional, defaultOpen = false, style, className, children }: Props) {
  const [open, setOpen] = useState(!optional || defaultOpen);

  return (
    <div className={`card${className ? ` ${className}` : ''}`} style={style}>
      <div
        className="card-header"
        style={{
          ...(optional && !open ? { borderBottom: 'none', paddingBottom: 0, marginBottom: 0 } : {}),
          ...(optional ? { cursor: 'pointer', userSelect: 'none' as const } : {}),
        }}
        onClick={optional ? () => setOpen(o => !o) : undefined}
      >
        <div className="card-header-icon">{icon}</div>
        <div style={{ flex: 1 }}>
          <h2>
            {title}
            {optional && <span style={{ fontSize: '.72rem', fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>Optional</span>}
          </h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {optional && (
          <span style={{
            fontSize: '.75rem',
            color: 'var(--muted)',
            flexShrink: 0,
            marginLeft: 12,
            display: 'inline-block',
            transition: 'transform .2s',
            transform: open ? 'rotate(180deg)' : 'none',
          }}>▼</span>
        )}
      </div>
      {open && children}
    </div>
  );
}
