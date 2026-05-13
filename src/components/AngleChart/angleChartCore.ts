import type { FrameAnglePoint } from '../../pipeline/angleCalculation';
import type { ExtractedFrame } from '../../types';

export const METRICS = [
  { key: 'Left Knee Flexion',  color: '#22d3ee', label: 'L Knee' },
  { key: 'Right Knee Flexion', color: '#facc15', label: 'R Knee' },
  { key: 'Left Hip Flexion',   color: '#4ade80', label: 'L Hip'  },
  { key: 'Right Hip Flexion',  color: '#fb923c', label: 'R Hip'  },
];

export const PHASE_ABBREV: Record<string, string> = {
  contact: 'IC', loading: 'LR', midstance: 'MSt', propulsion: 'Prop',
  toeoff: 'TO', earlyswing: 'ESw', midswing: 'MSw', lateswing: 'LSw',
};

export const W = 800, H = 310;
export const ML = 52, MR = 20, MT = 82, MB = 40;
export const IW = W - ML - MR;
export const IH = H - MT - MB;
export const Y_MAX = 180;
export const Y_TICKS = [0, 45, 90, 135, 180];

export function buildPath(
  data: FrameAnglePoint[],
  metric: string,
  xs: (t: number) => number,
  ys: (d: number) => number,
): string {
  let d = '', pen = false;
  for (const pt of data) {
    const v = pt.angles[metric];
    if (v == null) { pen = false; continue; }
    const x = xs(pt.timestamp).toFixed(1);
    const y = ys(v).toFixed(1);
    d += pen ? `L${x},${y} ` : `M${x},${y} `;
    pen = true;
  }
  return d;
}

export function buildAngleChartSvg(series: FrameAnglePoint[], phaseFrames: ExtractedFrame[]): string {
  if (!series.length) return '';

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

  const yGrid = Y_TICKS.map(deg =>
    `<line x1="${ML}" y1="${ys(deg).toFixed(1)}" x2="${ML + IW}" y2="${ys(deg).toFixed(1)}" stroke="#ffffff14" stroke-width="${deg === 0 ? 1.5 : 1}"/>` +
    `<text x="${ML - 6}" y="${ys(deg).toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="#ffffff44">${deg}°</text>`,
  ).join('');

  const xAxis = xTicks.map(t =>
    `<line x1="${xs(t).toFixed(1)}" y1="${MT + IH}" x2="${xs(t).toFixed(1)}" y2="${MT + IH + 4}" stroke="#ffffff30" stroke-width="1"/>` +
    `<text x="${xs(t).toFixed(1)}" y="${MT + IH + 16}" text-anchor="middle" font-size="10" fill="#ffffff44">${t.toFixed(1)}s</text>`,
  ).join('');

  const phases = phaseFrames.map(f => {
    const x = xs(f.timestamp);
    if (x < ML || x > ML + IW) return '';
    return `<line x1="${x.toFixed(1)}" y1="${MT}" x2="${x.toFixed(1)}" y2="${MT + IH}" stroke="#ffffff28" stroke-width="1" stroke-dasharray="3,3"/>` +
           `<text x="${x.toFixed(1)}" y="${MT - 4}" text-anchor="start" font-size="9" fill="#ffffff77" transform="rotate(-60,${x.toFixed(1)},${MT - 4})">${f.phase.label}</text>`;
  }).join('');

  const paths = METRICS.map(m =>
    `<path d="${buildPath(series, m.key, xs, ys)}" fill="none" stroke="${m.color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`,
  ).join('');

  const legend = METRICS.map((m, i) =>
    `<g transform="translate(${ML + i * 120},${H - 10})">` +
    `<line x1="0" y1="0" x2="18" y2="0" stroke="${m.color}" stroke-width="2" stroke-linecap="round"/>` +
    `<text x="22" y="4" font-size="11" fill="${m.color}">${m.label}</text></g>`,
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#16213e">` +
    yGrid + xAxis +
    `<rect x="${ML}" y="${MT}" width="${IW}" height="${IH}" fill="none" stroke="#ffffff20" stroke-width="1"/>` +
    `<text x="11" y="${(MT + IH / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#ffffff33" transform="rotate(-90,11,${(MT + IH / 2).toFixed(1)})">Degrees</text>` +
    phases + paths + legend +
    `</svg>`;
}
