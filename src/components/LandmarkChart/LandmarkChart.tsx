import type { FrameLandmarkPoint } from '../../types';
import type { ExtractedFrame } from '../../types';
import { W, H, ML, MR, MT, MB, IW, IH, Y_TICKS, Y_METRICS, X_METRICS, buildLandmarkPath } from './landmarkChartCore';
import { PHASE_ABBREV } from '../AngleChart/angleChartCore';

export { buildLandmarkChartSvg } from './landmarkChartCore';

interface Props {
  series: FrameLandmarkPoint[];
  phaseFrames: ExtractedFrame[];
}

interface PanelProps {
  series: FrameLandmarkPoint[];
  phaseFrames: ExtractedFrame[];
  metrics: typeof Y_METRICS;
  title: string;
}

function Panel({ series, phaseFrames, metrics, title }: PanelProps) {
  const minT = series[0].timestamp;
  const maxT = series[series.length - 1].timestamp;
  const tRange = Math.max(maxT - minT, 0.001);
  const xs = (t: number) => ML + ((t - minT) / tRange) * IW;
  const ys = (v: number) => MT + (1 - v) * IH;

  const xTicks: number[] = [];
  for (let t = Math.ceil(minT / 0.1) * 0.1; t <= maxT + 1e-6; t += 0.1) {
    xTicks.push(parseFloat(t.toFixed(3)));
  }

  return (
    <div>
      <div style={{
        paddingLeft: 16, paddingBottom: 4,
        fontSize: '0.75rem', fontWeight: 600,
        color: 'var(--muted, #888)',
        letterSpacing: '0.07em', textTransform: 'uppercase',
      }}>
        {title}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>

        {Y_TICKS.map(v => (
          <g key={v}>
            <line x1={ML} y1={ys(v)} x2={ML + IW} y2={ys(v)}
              stroke="#ffffff14" strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={ML - 6} y={ys(v)} textAnchor="end" dominantBaseline="middle"
              fontSize={10} fill="#ffffff44">
              {v.toFixed(1)}
            </text>
          </g>
        ))}

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

        <rect x={ML} y={MT} width={IW} height={IH}
          fill="none" stroke="#ffffff20" strokeWidth={1} />

        <text x={11} y={MT + IH / 2} textAnchor="middle" dominantBaseline="middle"
          fontSize={10} fill="#ffffff33"
          transform={`rotate(-90, 11, ${MT + IH / 2})`}>
          Position
        </text>

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

        {metrics.map(m => (
          <path
            key={m.key}
            d={buildLandmarkPath(series, m.key, xs, ys)}
            fill="none"
            stroke={m.color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {metrics.map((m, i) => (
          <g key={m.key} transform={`translate(${ML + i * 120}, ${H - 10})`}>
            <line x1={0} y1={0} x2={18} y2={0} stroke={m.color} strokeWidth={2} strokeLinecap="round" />
            <text x={22} y={4} fontSize={11} fill={m.color}>{m.label}</text>
          </g>
        ))}

      </svg>
    </div>
  );
}

export function LandmarkChart({ series, phaseFrames }: Props) {
  if (!series.length) return null;

  const cardStyle = {
    background: 'var(--card-bg, #16213e)',
    border: '1px solid var(--border, #2a2a4a)',
    borderRadius: 8,
    padding: '12px 0 4px',
    marginBottom: 16,
  };

  return (
    <>
      <div style={cardStyle}>
        <Panel series={series} phaseFrames={phaseFrames} metrics={Y_METRICS} title="Landmark Vertical Position" />
      </div>
      <div style={cardStyle}>
        <Panel series={series} phaseFrames={phaseFrames} metrics={X_METRICS} title="Landmark Horizontal Position" />
      </div>
    </>
  );
}
