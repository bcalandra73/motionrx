import type { FrameLandmarkPoint } from '../../types';
import type { ExtractedFrame } from '../../types';
import { W, H, ML, MR, MT, MB, IW, IH, PHASE_ABBREV } from '../AngleChart/angleChartCore';

export { W, H, ML, MR, MT, MB, IW, IH };

export const Y_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

export const Y_METRICS = [
  { key: 'Left Hip Y',    color: '#a78bfa', label: 'L Hip'   },
  { key: 'Right Hip Y',   color: '#f472b6', label: 'R Hip'   },
  { key: 'Left Knee Y',   color: '#34d399', label: 'L Knee'  },
  { key: 'Right Knee Y',  color: '#fbbf24', label: 'R Knee'  },
  { key: 'Left Ankle Y',  color: '#60a5fa', label: 'L Ankle' },
  { key: 'Right Ankle Y', color: '#f87171', label: 'R Ankle' },
];

export const X_METRICS = [
  { key: 'Left Hip X',    color: '#a78bfa', label: 'L Hip'   },
  { key: 'Right Hip X',   color: '#f472b6', label: 'R Hip'   },
  { key: 'Left Knee X',   color: '#34d399', label: 'L Knee'  },
  { key: 'Right Knee X',  color: '#fbbf24', label: 'R Knee'  },
  { key: 'Left Ankle X',  color: '#60a5fa', label: 'L Ankle' },
  { key: 'Right Ankle X', color: '#f87171', label: 'R Ankle' },
];

export function buildLandmarkPath(
  data: FrameLandmarkPoint[],
  key: string,
  xs: (t: number) => number,
  ys: (v: number) => number,
): string {
  let d = '', pen = false;
  for (const pt of data) {
    const v = pt.positions[key];
    if (v == null) { pen = false; continue; }
    const x = xs(pt.timestamp).toFixed(1);
    const y = ys(v).toFixed(1);
    d += pen ? `L${x},${y} ` : `M${x},${y} `;
    pen = true;
  }
  return d;
}

function buildPanel(
  series: FrameLandmarkPoint[],
  phaseFrames: ExtractedFrame[],
  metrics: typeof Y_METRICS,
  title: string,
  offsetY: number,
): string {
  const minT = series[0].timestamp;
  const maxT = series[series.length - 1].timestamp;
  const tRange = Math.max(maxT - minT, 0.001);
  const xs = (t: number) => ML + ((t - minT) / tRange) * IW;
  // flipped: 0 = top of frame = high position → top of panel
  const ys = (v: number) => offsetY + MT + (1 - v) * IH;

  const xTicks: number[] = [];
  for (let t = Math.ceil(minT / 0.1) * 0.1; t <= maxT + 1e-6; t += 0.1) {
    xTicks.push(parseFloat(t.toFixed(3)));
  }

  const panelTop = offsetY + MT;
  const panelBot = offsetY + MT + IH;

  const yGrid = Y_TICKS.map(v =>
    `<line x1="${ML}" y1="${ys(v).toFixed(1)}" x2="${ML + IW}" y2="${ys(v).toFixed(1)}" stroke="#ffffff14" stroke-width="${v === 0 ? 1.5 : 1}"/>` +
    `<text x="${ML - 6}" y="${ys(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="#ffffff44">${v.toFixed(1)}</text>`,
  ).join('');

  const xAxis = xTicks.map(t =>
    `<line x1="${xs(t).toFixed(1)}" y1="${panelBot}" x2="${xs(t).toFixed(1)}" y2="${panelBot + 4}" stroke="#ffffff30" stroke-width="1"/>` +
    `<text x="${xs(t).toFixed(1)}" y="${panelBot + 16}" text-anchor="middle" font-size="10" fill="#ffffff44">${t.toFixed(1)}s</text>`,
  ).join('');

  const phases = phaseFrames.map(f => {
    const x = xs(f.timestamp);
    if (x < ML || x > ML + IW) return '';
    const abbrev = PHASE_ABBREV[f.phase.id] ?? f.phase.id;
    return `<line x1="${x.toFixed(1)}" y1="${panelTop}" x2="${x.toFixed(1)}" y2="${panelBot}" stroke="#ffffff28" stroke-width="1" stroke-dasharray="3,3"/>` +
           `<text x="${x.toFixed(1)}" y="${panelTop - 4}" text-anchor="start" font-size="9" fill="#ffffff77" transform="rotate(-60,${x.toFixed(1)},${panelTop - 4})">${f.phase.label}</text>`;
  }).join('');

  const paths = metrics.map(m =>
    `<path d="${buildLandmarkPath(series, m.key, xs, ys)}" fill="none" stroke="${m.color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`,
  ).join('');

  const legend = metrics.map((m, i) =>
    `<g transform="translate(${ML + i * 120},${offsetY + H - 10})">` +
    `<line x1="0" y1="0" x2="18" y2="0" stroke="${m.color}" stroke-width="2" stroke-linecap="round"/>` +
    `<text x="22" y="4" font-size="11" fill="${m.color}">${m.label}</text></g>`,
  ).join('');

  const panelTitle =
    `<text x="${ML}" y="${offsetY + 14}" font-size="10" font-weight="600" fill="#ffffff55" letter-spacing="0.07em">${title.toUpperCase()}</text>`;

  return panelTitle + yGrid + xAxis +
    `<rect x="${ML}" y="${panelTop}" width="${IW}" height="${IH}" fill="none" stroke="#ffffff20" stroke-width="1"/>` +
    `<text x="11" y="${(panelTop + IH / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#ffffff33" transform="rotate(-90,11,${(panelTop + IH / 2).toFixed(1)})">Position</text>` +
    phases + paths + legend;
}

export function buildLandmarkChartSvg(series: FrameLandmarkPoint[], phaseFrames: ExtractedFrame[]): string {
  if (!series.length) return '';
  const totalH = H * 2 + 20;
  const yPanel = buildPanel(series, phaseFrames, Y_METRICS, 'Vertical Position', 0);
  const xPanel = buildPanel(series, phaseFrames, X_METRICS, 'Horizontal Position', H + 20);
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" width="${W}" height="${totalH}" style="background:#16213e">` +
    yPanel + xPanel +
    `</svg>`;
}
