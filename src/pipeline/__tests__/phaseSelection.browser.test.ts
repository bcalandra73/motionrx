/**
 * Browser integration tests for phaseSelection.ts.
 * Requires real video files in test_data/ (same ones used by extractFrames tests).
 *
 * Run interactively (selected frames visible in browser):
 *   npm run test:browser:watch
 *
 * Run headless:
 *   npm run test:browser
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { extractFrames } from '../frameExtraction';
import {
  initMoveNet,
  coarseScanWithMoveNet,
  runGaitFSM,
  runSmartPhaseRelabeling,
  selectPhaseFrames,
} from '../phaseSelection';
import type { SelectPhaseOptions } from '../phaseSelection';
import type { ExtractedFrame } from '../../types';
import { loadTestCase, renderFramesAlways } from './testUtils';
import type { TestCase } from './testUtils';

const TEST_DIRS = ['test_1', 'test_2'];

// ── Shared MoveNet detector — initialised once ────────────────────────────────

let moveNetAvailable = false;

beforeAll(async () => {
  const d = await initMoveNet();
  moveNetAvailable = d !== null;
  if (!moveNetAvailable) console.warn('[PhaseSelection tests] MoveNet unavailable — gait fallback path will be exercised');
}, 60_000);

// ── Per-test-case suites ──────────────────────────────────────────────────────

for (const dir of TEST_DIRS) {
  describe(`[${dir}] selectPhaseFrames`, () => {
    let tc: TestCase | undefined;
    let rawFrames: ExtractedFrame[] = [];
    let selected: ExtractedFrame[] = [];

    beforeAll(async () => {
      tc = (await loadTestCase(dir)) ?? undefined;
      if (!tc?.primaryFile) return;

      rawFrames = await extractFrames(tc.primaryFile, tc.movementType);

      const progressLog: number[] = [];
      const opts: SelectPhaseOptions = {
        cameraView: tc.yaml.media.primary.angle?.toLowerCase().includes('front') ? 'front'
          : tc.yaml.media.primary.angle?.toLowerCase().includes('post') ? 'posterior'
          : 'side',
        onProgress: (pct) => progressLog.push(pct),
      };
      selected = await selectPhaseFrames(rawFrames, tc.movementType, opts);

      renderPhaseFrames(
        rawFrames,
        selected,
        `[${dir}] ${tc.movementType} — phase selection (${tc.yaml.media.primary.angle})`,
        tc,
      );
    }, 120_000);

    it('returns at least 1 frame', () => {
      if (!tc?.primaryFile) return;
      expect(selected.length).toBeGreaterThan(0);
    });

    it('returns at most 8 frames for gait, same count otherwise', () => {
      if (!tc?.primaryFile) return;
      const isGait = /running|gait|walk/i.test(tc.movementType);
      if (isGait) {
        expect(selected.length).toBeLessThanOrEqual(moveNetAvailable ? 8 : 16);
      } else {
        expect(selected.length).toBe(rawFrames.length);
      }
    });

    it('all frames have valid base64 imageData', () => {
      if (!tc?.primaryFile) return;
      for (const f of selected) {
        expect(typeof f.imageData).toBe('string');
        expect(f.imageData.length).toBeGreaterThan(300);
        expect(f.imageData.startsWith('data:')).toBe(false);
      }
    });

    it('all frames have a phase label string', () => {
      if (!tc?.primaryFile) return;
      for (const f of selected) {
        expect(typeof f.phase.label).toBe('string');
        expect(f.phase.label.length).toBeGreaterThan(0);
      }
    });

    it('phase fractions are in [0, 1]', () => {
      if (!tc?.primaryFile) return;
      for (const f of selected) {
        expect(f.phase.fraction).toBeGreaterThanOrEqual(0);
        expect(f.phase.fraction).toBeLessThanOrEqual(1);
      }
    });

    it('no duplicate frames by source index', () => {
      if (!tc?.primaryFile) return;
      const isGait = /running|gait|walk/i.test(tc.movementType);
      if (!isGait) return; // only deduplicate gait (non-gait returns all 8 input frames)
      const seen = new Set<number>();
      for (const f of selected) {
        expect(seen.has(f.index)).toBe(false);
        seen.add(f.index);
      }
    });

    it('progress fires from 0 to 100 for movements that trigger a scan', async () => {
      if (!tc?.primaryFile) return;
      const needsScan = /running|gait|walk|squat|lunge|sit|deadlift|hinge|drop jump|countermovement jump|single-leg landing|tuck jump/i.test(tc.movementType);
      if (!needsScan) return;
      const pcts: number[] = [];
      await selectPhaseFrames(rawFrames, tc.movementType, {
        onProgress: pct => pcts.push(pct),
      });
      expect(pcts.length).toBeGreaterThan(0);
      expect(pcts[0]).toBe(0);
      expect(pcts[pcts.length - 1]).toBe(100);
    });

    it('passthrough movements return the same frames unchanged', async () => {
      if (!tc?.primaryFile) return;
      const needsScan = /running|gait|walk|squat|lunge|sit|deadlift|hinge|drop jump|countermovement jump|single-leg landing|tuck jump/i.test(tc.movementType);
      if (needsScan) return;
      const result = await selectPhaseFrames(rawFrames, tc.movementType);
      expect(result).toEqual(rawFrames);
    });
  });
}

// ── coarseScanWithMoveNet ─────────────────────────────────────────────────────

describe('coarseScanWithMoveNet', () => {
  it('returns one result per input frame', async () => {
    const tc = (await loadTestCase('test_1')) ?? undefined;
    if (!tc?.primaryFile) return;

    const d = await initMoveNet();
    if (!d) return;

    const frames = await extractFrames(tc.primaryFile, tc.movementType);
    const sample = frames.slice(0, 4);
    const results = await coarseScanWithMoveNet(d, sample);
    expect(results.length).toBe(sample.length);
  });

  it('each result is null or a 33-element sparse array', async () => {
    const tc = (await loadTestCase('test_1')) ?? undefined;
    if (!tc?.primaryFile) return;

    const d = await initMoveNet();
    if (!d) return;

    const frames = await extractFrames(tc.primaryFile, tc.movementType);
    const results = await coarseScanWithMoveNet(d, frames.slice(0, 4));

    for (const r of results) {
      if (r === null) continue;
      expect(r.length).toBe(33);
    }
  });

  it('detects a pose in at least one of the first 4 frames', async () => {
    const tc = (await loadTestCase('test_1')) ?? undefined;
    if (!tc?.primaryFile) return;

    const d = await initMoveNet();
    if (!d) return;

    const frames = await extractFrames(tc.primaryFile, tc.movementType);
    const results = await coarseScanWithMoveNet(d, frames.slice(0, 4));
    const detected = results.filter(r => r !== null && r.some(lm => lm !== null));
    expect(detected.length).toBeGreaterThanOrEqual(1);
  });
});

// ── runGaitFSM (unit-level) ───────────────────────────────────────────────────

describe('runGaitFSM', () => {
  it('returns at most 8 frames from synthetic landmarks', () => {
    const N = 32;
    const syntheticFrames: ExtractedFrame[] = Array.from({ length: N }, (_, i) => ({
      imageData: 'abc'.repeat(200),
      index: i,
      timestamp: i / 30,
      phase: { id: 'frame', label: `Frame ${i + 1}`, desc: '', fraction: i / (N - 1) },
    }));

    // Build synthetic landmarks: simple sinusoidal ankle positions
    const syntheticLandmarks = syntheticFrames.map((_, fi) => {
      const t = fi / N;
      const lAnkY = 0.75 + 0.08 * Math.sin(t * Math.PI * 4);
      const rAnkY = 0.75 + 0.08 * Math.sin(t * Math.PI * 4 + Math.PI);
      const arr = Array.from({ length: 33 }, () => null) as (null | { x: number; y: number; z: number; visibility: number })[];
      arr[0]  = { x: 0.5,  y: 0.1,    z: 0, visibility: 0.9 };  // nose
      arr[11] = { x: 0.42, y: 0.35,   z: 0, visibility: 0.9 };  // L shoulder
      arr[12] = { x: 0.58, y: 0.35,   z: 0, visibility: 0.9 };  // R shoulder
      arr[23] = { x: 0.44, y: 0.55,   z: 0, visibility: 0.9 };  // L hip
      arr[24] = { x: 0.56, y: 0.55,   z: 0, visibility: 0.9 };  // R hip
      arr[25] = { x: 0.43, y: 0.65 + 0.02 * Math.sin(t * Math.PI * 4), z: 0, visibility: 0.9 }; // L knee
      arr[26] = { x: 0.57, y: 0.65 + 0.02 * Math.sin(t * Math.PI * 4 + Math.PI), z: 0, visibility: 0.9 };
      arr[27] = { x: 0.42, y: lAnkY,  z: 0, visibility: 0.9 };  // L ankle
      arr[28] = { x: 0.58, y: rAnkY,  z: 0, visibility: 0.9 };  // R ankle
      return arr;
    });

    const proportions = syntheticFrames.map((_, i) => i / (N - 1));
    const result = runGaitFSM(syntheticLandmarks, syntheticFrames, proportions, 'side');

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(8);
  });

  it('falls back gracefully when fewer than 4 landmarks are valid', () => {
    const N = 16;
    const frames: ExtractedFrame[] = Array.from({ length: N }, (_, i) => ({
      imageData: 'abc'.repeat(200),
      index: i,
      timestamp: i / 30,
      phase: { id: 'frame', label: `Frame ${i + 1}`, desc: '', fraction: i / (N - 1) },
    }));
    const landmarks = frames.map(() => null);
    const proportions = frames.map((_, i) => i / (N - 1));
    const result = runGaitFSM(landmarks, frames, proportions);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(8);
  });
});

// ── runSmartPhaseRelabeling (unit-level) ──────────────────────────────────────

describe('runSmartPhaseRelabeling', () => {
  const makeFrames = (ids: string[]): ExtractedFrame[] =>
    ids.map((id, i) => ({
      imageData: 'abc'.repeat(200),
      index: i,
      timestamp: i / 8,
      phase: { id, label: id, desc: '', fraction: i / (ids.length - 1) },
    }));

  it('returns same frame count as input', () => {
    const frames = makeFrames(['start', 'descent', 'bottom', 'ascent', 'top', 'start2', 'descent2', 'bottom2']);
    const result = runSmartPhaseRelabeling(frames.map(() => null), frames, 'Squat (Double-Leg)');
    expect(result.length).toBe(frames.length);
  });

  it('passthrough for non-squat/hinge/landing movements', () => {
    const frames = makeFrames(['a', 'b', 'c', 'd']);
    const result = runSmartPhaseRelabeling(frames.map(() => null), frames, 'Shoulder Mobility');
    expect(result).toEqual(frames);
  });

  it('relabels best-score frame as "bottom" for squat', () => {
    const frames = makeFrames(['start', 'descent', 'bottom', 'ascent', 'top', 'start2', 'descent2', 'bottom2']);

    // Frame 5: deepest squat — knee at ~49° (ankle angled forward, hips dropped lower)
    // Other frames: straight-leg standing — knee at ~180°
    //
    // calcAngle(hip, knee, ankle): angle at knee between hip-knee and ankle-knee vectors.
    // 180° = straight leg (kneeScore=0), ~49° = deep squat (kneeScore≈131)
    const landmarks = frames.map((_, fi) => {
      const arr = Array.from({ length: 33 }, () => null) as (null | { x: number; y: number; z: number; visibility: number })[];
      if (fi === 5) {
        // Deep squat: hips dropped to y=0.55, ankle forward from knee
        arr[23] = { x: 0.5,  y: 0.55, z: 0, visibility: 0.9 }; // L hip (lower)
        arr[24] = { x: 0.55, y: 0.55, z: 0, visibility: 0.9 }; // R hip
        arr[25] = { x: 0.5,  y: 0.6,  z: 0, visibility: 0.9 }; // L knee
        arr[26] = { x: 0.55, y: 0.6,  z: 0, visibility: 0.9 }; // R knee
        arr[27] = { x: 0.65, y: 0.47, z: 0, visibility: 0.9 }; // L ankle (forward → small knee angle)
        arr[28] = { x: 0.7,  y: 0.47, z: 0, visibility: 0.9 }; // R ankle
      } else {
        // Standing: straight leg
        arr[23] = { x: 0.5,  y: 0.4,  z: 0, visibility: 0.9 }; // L hip
        arr[24] = { x: 0.55, y: 0.4,  z: 0, visibility: 0.9 }; // R hip
        arr[25] = { x: 0.5,  y: 0.6,  z: 0, visibility: 0.9 }; // L knee
        arr[26] = { x: 0.55, y: 0.6,  z: 0, visibility: 0.9 }; // R knee
        arr[27] = { x: 0.5,  y: 0.78, z: 0, visibility: 0.9 }; // L ankle (straight below)
        arr[28] = { x: 0.55, y: 0.78, z: 0, visibility: 0.9 }; // R ankle
      }
      return arr;
    });

    const result = runSmartPhaseRelabeling(landmarks, frames, 'Squat (Double-Leg)');
    const bottomFrame = result.find(f => f.phase.id === 'bottom');
    expect(bottomFrame).toBeDefined();
    expect(bottomFrame!.index).toBe(5);
  });

  it('relabels best-score frame as "lockout" for deadlift', () => {
    const frames = makeFrames(['setup', 'descent', 'lockout', 'bottom', 'mid', 'top', 'lockout2', 'end']);

    // Score for isHinge = calcAngle(shoulder, hip, knee) = hip angle.
    // Lockout (upright): shoulder above hip above knee → collinear → 180°  (highest score)
    // Hinge (bent over): torso horizontal, shoulder forward of hip → ~90° (low score)
    const landmarks = frames.map((_, fi) => {
      const arr = Array.from({ length: 33 }, () => null) as (null | { x: number; y: number; z: number; visibility: number })[];
      if (fi === 6) {
        // Upright lockout: shoulder-hip-knee collinear (vertical line) → hipAngle ≈ 180°
        arr[11] = { x: 0.5,  y: 0.3,  z: 0, visibility: 0.9 }; // L shoulder (above)
        arr[12] = { x: 0.55, y: 0.3,  z: 0, visibility: 0.9 }; // R shoulder
        arr[23] = { x: 0.5,  y: 0.5,  z: 0, visibility: 0.9 }; // L hip
        arr[24] = { x: 0.55, y: 0.5,  z: 0, visibility: 0.9 }; // R hip
        arr[25] = { x: 0.5,  y: 0.7,  z: 0, visibility: 0.9 }; // L knee (below)
        arr[26] = { x: 0.55, y: 0.7,  z: 0, visibility: 0.9 }; // R knee
      } else {
        // Hinge position: torso horizontal, shoulder forward of hip → hipAngle ≈ 90°
        arr[11] = { x: 0.3,  y: 0.5,  z: 0, visibility: 0.9 }; // L shoulder (forward)
        arr[12] = { x: 0.35, y: 0.5,  z: 0, visibility: 0.9 }; // R shoulder
        arr[23] = { x: 0.5,  y: 0.5,  z: 0, visibility: 0.9 }; // L hip
        arr[24] = { x: 0.55, y: 0.5,  z: 0, visibility: 0.9 }; // R hip
        arr[25] = { x: 0.5,  y: 0.65, z: 0, visibility: 0.9 }; // L knee
        arr[26] = { x: 0.55, y: 0.65, z: 0, visibility: 0.9 }; // R knee
      }
      return arr;
    });

    const result = runSmartPhaseRelabeling(landmarks, frames, 'Hip Hinge / Deadlift Pattern');
    const lockoutFrame = result.find(f => f.phase.id === 'lockout');
    expect(lockoutFrame).toBeDefined();
    expect(lockoutFrame!.index).toBe(6);
  });
});

// ── Phase frame visual renderer ───────────────────────────────────────────────
// Shows raw frames (before) and selected frames (after) side-by-side
// for manual inspection in interactive browser mode.

function renderPhaseFrames(
  rawFrames: ExtractedFrame[],
  selectedFrames: ExtractedFrame[],
  label: string,
  testCase?: TestCase,
) {
  if (typeof window === 'undefined') return;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'font-family:sans-serif;padding:16px;border-bottom:2px solid #ccc;margin-bottom:16px';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0 0 4px;font-size:14px;color:#333';
  title.textContent = label;
  wrap.appendChild(title);

  if (testCase) {
    const meta = document.createElement('p');
    meta.style.cssText = 'margin:0 0 12px;font-size:12px;color:#666';
    meta.textContent = [
      `Patient: ${testCase.yaml.patient_name}`,
      `Movement: ${testCase.movementType}`,
      `Raw: ${rawFrames.length} frames → Selected: ${selectedFrames.length} frames`,
    ].join(' · ');
    wrap.appendChild(meta);
  }

  const makeSection = (frames: ExtractedFrame[], heading: string, accent: string) => {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:14px';

    const h = document.createElement('div');
    h.style.cssText = `font-size:11px;font-weight:600;color:${accent};margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em`;
    h.textContent = heading;
    section.appendChild(h);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';

    for (const frame of frames) {
      const cell = document.createElement('div');
      cell.style.cssText = 'text-align:center';

      const img = document.createElement('img');
      img.src = `data:image/jpeg;base64,${frame.imageData}`;
      img.style.cssText = `display:block;width:140px;height:auto;border:2px solid ${accent};border-radius:4px`;
      img.title = `t=${frame.timestamp.toFixed(2)}s`;

      const caption = document.createElement('div');
      caption.style.cssText = 'font-size:10px;color:#555;margin-top:3px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      caption.textContent = frame.phase.label;
      caption.title = frame.phase.label;

      cell.appendChild(img);
      cell.appendChild(caption);
      grid.appendChild(cell);
    }

    section.appendChild(grid);
    return section;
  };

  wrap.appendChild(makeSection(rawFrames,      'Input frames (extracted)',   '#999'));
  wrap.appendChild(makeSection(selectedFrames, 'Selected phase frames (output)', '#00897b'));
  document.body.appendChild(wrap);
}
