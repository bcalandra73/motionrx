/**
 * Browser integration tests for poseDetection.ts.
 * Requires real video files in test_data/ and a network connection to download
 * the MediaPipe WASM + model on first run (~30 MB, cached after that).
 *
 * Run interactively (skeleton overlays visible in browser):
 *   npm run test:browser:watch
 *
 * Run headless:
 *   npm run test:browser
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { extractFrames } from '../frameExtraction';
import { selectPhaseFrames } from '../phaseSelection';
import {
  initPoseLandmarker,
  detectPoseOnFrames,
  preprocessFrame,
} from '../poseDetection';
import type { PoseFrameResult } from '../poseDetection';
import type { ExtractedFrame } from '../../types';
import { loadTestCase, renderFramesAlways } from './testUtils';
import type { TestCase } from './testUtils';
import { PoseLandmarker } from '@mediapipe/tasks-vision';

const TEST_DIRS = ['test_1', 'test_2'];

// ── Shared landmarker — initialised once for the whole suite ──────────────────

let landmarker: PoseLandmarker;

beforeAll(async () => {
  landmarker = await initPoseLandmarker();
}, 120_000); // model download can take a while on a cold cache

// ── preprocessFrame (no landmarker needed) ────────────────────────────────────

describe('preprocessFrame', () => {
  it('returns a non-empty base64 string', async () => {
    const tc = await loadTestCase('test_1');
    if (!tc?.primaryFile) return;

    const frames = await extractFrames(tc.primaryFile, 'Squat (Double-Leg)');
    if (!frames.length) return;

    const result = await preprocessFrame(frames[0].imageData);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(300);
    expect(result.startsWith('data:')).toBe(false);
  });

  it('does not crash on a valid frame', async () => {
    const tc = await loadTestCase('test_1');
    if (!tc?.primaryFile) return;
    const frames = await extractFrames(tc.primaryFile, 'Squat (Double-Leg)');
    if (!frames.length) return;
    await expect(preprocessFrame(frames[0].imageData)).resolves.toBeTruthy();
  });
});

// ── Per-test-case pose detection suites ───────────────────────────────────────

for (const dir of TEST_DIRS) {
  describe(`[${dir}] pose detection — primary video`, () => {
    let tc: TestCase | undefined;
    let frames: ExtractedFrame[] = [];
    let results: PoseFrameResult[] = [];

    beforeAll(async () => {
      tc = (await loadTestCase(dir)) ?? undefined;
      if (!tc?.primaryFile) return;

      const rawFrames = await extractFrames(tc.primaryFile, tc.movementType);
      frames = await selectPhaseFrames(rawFrames, tc.movementType, {
        cameraView: tc.yaml.media.primary.angle?.toLowerCase().includes('front') ? 'front'
          : tc.yaml.media.primary.angle?.toLowerCase().includes('post') ? 'posterior'
          : 'side',
      });
      results = await detectPoseOnFrames(landmarker, frames);

      // Render annotated skeleton grid for manual inspection
      renderPoseResults(
        frames,
        results,
        `[${dir}] ${tc.movementType} — pose detection (${tc.yaml.media.primary.angle})`,
        tc,
      );
    }, 120_000);

    it('returns one result per input frame', () => {
      if (!tc?.primaryFile) return;
      expect(results.length).toBe(frames.length);
    });

    it('frameIndex matches array position', () => {
      if (!tc?.primaryFile) return;
      results.forEach((r, i) => expect(r.frameIndex).toBe(i));
    });

    it('detects a pose in at least half the frames', () => {
      if (!tc?.primaryFile) return;
      const detected = results.filter(r => r.source === 'landmarker').length;
      expect(detected).toBeGreaterThanOrEqual(Math.ceil(results.length / 2));
    });

    it('detected landmarks have 33 keypoints', () => {
      if (!tc?.primaryFile) return;
      for (const r of results.filter(r => r.poseLandmarks !== null)) {
        expect(r.poseLandmarks!.length).toBe(33);
      }
    });

    it('landmark x/y values are normalised to [0, 1]', () => {
      if (!tc?.primaryFile) return;
      for (const r of results.filter(r => r.poseLandmarks !== null)) {
        for (const lm of r.poseLandmarks!) {
          expect(lm.x).toBeGreaterThanOrEqual(-0.5); // allow slight out-of-frame
          expect(lm.x).toBeLessThanOrEqual(1.5);
          expect(lm.y).toBeGreaterThanOrEqual(-0.5);
          expect(lm.y).toBeLessThanOrEqual(1.5);
        }
      }
    });

    it('world landmarks present for detected frames', () => {
      if (!tc?.primaryFile) return;
      for (const r of results.filter(r => r.source === 'landmarker')) {
        expect(r.worldLandmarks).not.toBeNull();
        expect(r.worldLandmarks!.length).toBe(33);
      }
    });

    it('progress fires from 0 to 100', async () => {
      if (!tc?.primaryFile) return;
      const pcts: number[] = [];
      await detectPoseOnFrames(landmarker, frames.slice(0, 3), {
        onProgress: pct => pcts.push(pct),
      });
      expect(pcts[0]).toBe(0);
      expect(pcts[pcts.length - 1]).toBe(100);
    });
  });
}

// ── Skeleton overlay renderer ─────────────────────────────────────────────────
// Draws detected landmarks over each extracted frame for visual inspection.

const SKELETON_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 7], // left face
  [0, 4], [4, 5], [5, 6], [6, 8], // right face
  [11, 12],                         // shoulders
  [11, 13], [13, 15],               // left arm
  [12, 14], [14, 16],               // right arm
  [11, 23], [12, 24], [23, 24],     // torso
  [23, 25], [25, 27], [27, 29], [27, 31], // left leg
  [24, 26], [26, 28], [28, 30], [28, 32], // right leg
];

function renderPoseResults(
  frames: ExtractedFrame[],
  results: PoseFrameResult[],
  label: string,
  testCase?: TestCase,
) {
  if (typeof window === 'undefined') return;

  const container = document.createElement('div');
  container.style.cssText = 'font-family:sans-serif;padding:16px;border-bottom:2px solid #ccc;margin-bottom:16px';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0 0 4px;font-size:14px;color:#333';
  title.textContent = label;
  container.appendChild(title);

  if (testCase) {
    const meta = document.createElement('p');
    meta.style.cssText = 'margin:0 0 10px;font-size:12px;color:#666';
    const detected = results.filter(r => r.source === 'landmarker').length;
    meta.textContent = [
      `Patient: ${testCase.yaml.patient_name}`,
      `Movement: ${testCase.movementType}`,
      `Detected: ${detected} / ${results.length} frames`,
    ].join(' · ');
    container.appendChild(meta);
  }

  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';

  frames.forEach((frame, i) => {
    const result = results[i];
    const cell = document.createElement('div');
    cell.style.cssText = 'text-align:center';

    const canvas = document.createElement('canvas');
    const img = new Image();
    img.onload = () => {
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      if (result?.poseLandmarks?.length) {
        const lms = result.poseLandmarks;
        const w = canvas.width, h = canvas.height;

        // Draw connections
        ctx.strokeStyle = 'rgba(0,230,118,0.85)';
        ctx.lineWidth = 2;
        for (const [a, b] of SKELETON_CONNECTIONS) {
          if (!lms[a] || !lms[b]) continue;
          ctx.beginPath();
          ctx.moveTo(lms[a].x * w, lms[a].y * h);
          ctx.lineTo(lms[b].x * w, lms[b].y * h);
          ctx.stroke();
        }

        // Draw joints
        ctx.fillStyle = '#ff4081';
        for (const lm of lms) {
          if (!lm) continue;
          ctx.beginPath();
          ctx.arc(lm.x * w, lm.y * h, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    img.src = `data:image/jpeg;base64,${frame.imageData}`;
    canvas.style.cssText = 'display:block;width:160px;height:auto;border:1px solid #ddd;border-radius:4px';

    const caption = document.createElement('div');
    caption.style.cssText = 'font-size:10px;color:#555;margin-top:3px';
    caption.textContent = result?.source === 'landmarker' ? `✓ ${frame.phase.label}` : `✗ ${frame.phase.label}`;

    cell.appendChild(canvas);
    cell.appendChild(caption);
    grid.appendChild(cell);
  });

  container.appendChild(grid);
  document.body.appendChild(container);
}

