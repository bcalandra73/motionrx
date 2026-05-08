import type { FrameAnglePoint } from '../../pipeline/angleCalculation';
import type { ExtractedFrame } from '../../types';
import { METRICS, W, H, ML, MR, MT, MB, IW, IH, Y_MAX, Y_TICKS, buildPath } from './angleChartCore';

export { buildAngleChartSvg } from './angleChartCore';

interface Props {
  series: FrameAnglePoint[];
  phaseFrames: ExtractedFrame[];
}

export function AngleChart({ series, phaseFrames }: Props) {
  if (!series.length) return null;

  const minT = series[0].timestamp;
  const maxT = series[series.length - 1].timestamp;
  const tRange = Math.max(maxT - minT, 0.001);

  const xs = (t: number) => ML + ((t - minT) / tRange) * IW;
  const ys = (deg: number) => MT + (1 - deg / Y_MAX) * IH;

  const tickStep = 0.1;
  const xTicks: number[] = [];
  for (let t = Math.ceil(minT / tickStep) * tickStep; t <= maxT + 1e-6; t += tickStep) {
    xTicks.push(parseFloat(t.toFixed(3)));
  }

  return (
    <div style={{
      background: 'var(--card-bg, #16213e)',
      border: '1px solid var(--border, #2a2a4a)',
      borderRadius: 8,
      padding: '12px 0 4px',
      marginBottom: 16,
    }}>
      <div style={{
        paddingLeft: 16, paddingBottom: 4,
        fontSize: '0.75rem', fontWeight: 600,
        color: 'var(--muted, #888)',
        letterSpacing: '0.07em', textTransform: 'uppercase',
      }}>
        Joint Angles Over Time
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>

        {/* Y gridlines + labels */}
        {Y_TICKS.map(deg => (
          <g key={deg}>
            <line x1={ML} y1={ys(deg)} x2={ML + IW} y2={ys(deg)}
              stroke="#ffffff14" strokeWidth={deg === 0 ? 1.5 : 1} />
            <text x={ML - 6} y={ys(deg)} textAnchor="end" dominantBaseline="middle"
              fontSize={10} fill="#ffffff44">
              {deg}°
            </text>
          </g>
        ))}

        {/* X-axis ticks + labels */}
        {xTicks.map(t => (
          <g key={t}>
            <line x1={xs(t)} y1={MT + IH} x2={xs(t)} y2={MT + IH + 4}
              stroke="#ffffff30" strokeWidth={1} />
            <text x={xs(t)} y={MT + IH + 16} textAnchor="middle"
              fontSize={10} fill="#ffffff44">
              {t.toFixed(1)}s
            </text>
          </g>
        ))}

        {/* Axis border */}
        <rect x={ML} y={MT} width={IW} height={IH}
          fill="none" stroke="#ffffff20" strokeWidth={1} />

        {/* Y axis label */}
        <text x={11} y={MT + IH / 2} textAnchor="middle" dominantBaseline="middle"
          fontSize={10} fill="#ffffff33"
          transform={`rotate(-90, 11, ${MT + IH / 2})`}>
          Degrees
        </text>

        {/* Phase markers */}
        {phaseFrames.map(f => {
          const x = xs(f.timestamp);
          if (x < ML || x > ML + IW) return null;
          return (
            <g key={f.phase.id}>
              <line x1={x} y1={MT} x2={x} y2={MT + IH}
                stroke="#ffffff28" strokeWidth={1} strokeDasharray="3,3" />
              <text x={x} y={MT - 4} textAnchor="start"
                fontSize={9} fill="#ffffff77"
                transform={`rotate(-60, ${x}, ${MT - 4})`}>
                {f.phase.label}
              </text>
            </g>
          );
        })}

        {/* Angle lines */}
        {METRICS.map(m => (
          <path
            key={m.key}
            d={buildPath(series, m.key, xs, ys)}
            fill="none"
            stroke={m.color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Legend */}
        {METRICS.map((m, i) => (
          <g key={m.key} transform={`translate(${ML + i * 120}, ${H - 10})`}>
            <line x1={0} y1={0} x2={18} y2={0} stroke={m.color} strokeWidth={2} strokeLinecap="round" />
            <text x={22} y={4} fontSize={11} fill={m.color}>{m.label}</text>
          </g>
        ))}

      </svg>
    </div>
  );
}
