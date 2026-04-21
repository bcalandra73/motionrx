/**
 * Integration tests for extractFrames — runs in a real Chromium tab via Vitest browser mode
 * so HTMLVideoElement, canvas, and URL.createObjectURL all work as in production.
 *
 * Test cases are loaded from test_data/<dir>/test.yaml.
 * Video files are NOT checked into git; tests skip gracefully when files are absent.
 *
 * Run interactively (frames visible in browser):
 *   npm run test:browser:watch
 *
 * Run headless (CI):
 *   npm run test:browser
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { extractFrames } from '../frameExtraction';
import type { ExtractedFrame } from '../../types';
import { PHASE_MAPS, LANDING_MOVEMENTS } from '../../data/phaseMaps';
import { loadTestCase, renderFramesAlways } from './testUtils';
import type { TestCase } from './testUtils';

const TEST_DIRS = ['test_1', 'test_2'];

// ── Per-test-case suites ──────────────────────────────────────────────────────

for (const dir of TEST_DIRS) {
  describe(`[${dir}] primary video`, () => {
    let tc: TestCase | undefined;
    let frames: ExtractedFrame[] = [];

    beforeAll(async () => {
      tc = (await loadTestCase(dir)) ?? undefined;
      if (!tc?.primaryFile) return;
      frames = await extractFrames(tc.primaryFile, tc.movementType);
      renderFramesAlways(
        frames,
        `[${dir}] ${tc.movementType} — primary (${tc.yaml.media.primary.angle})`,
        tc,
      );
    });

    it('test.yaml loads and resolves a movement type', () => {
      if (!tc) return;
      expect(tc.yaml.movement_type).toBeTruthy();
      expect(tc.movementType).toBeTruthy();
    });

    it('primary video file is present', () => {
      if (!tc) return;
      expect(tc.primaryFile).not.toBeNull();
    });

    it('extracts the correct number of frames for the movement type', () => {
      if (!tc?.primaryFile) return;
      const phases = PHASE_MAPS[tc.movementType];
      if (!phases) {
        expect(frames.length).toBe(8);
      } else if (LANDING_MOVEMENTS.has(tc.movementType)) {
        expect(frames.length).toBe(phases.length);
      } else if (tc.movementType === 'Running') {
        expect(frames.length).toBe(128);
      } else if (tc.movementType === 'Gait / Walking') {
        expect(frames.length).toBe(64);
      } else {
        expect(frames.length).toBe(8);
      }
    });

    it('all frames have valid base64 imageData', () => {
      if (!tc?.primaryFile) return;
      for (const f of frames) {
        expect(typeof f.imageData).toBe('string');
        expect(f.imageData.length).toBeGreaterThan(300);
        expect(f.imageData.startsWith('data:')).toBe(false);
      }
    });

    it('timestamps are monotonically increasing', () => {
      if (!tc?.primaryFile) return;
      for (let i = 1; i < frames.length; i++) {
        expect(frames[i].timestamp).toBeGreaterThan(frames[i - 1].timestamp);
      }
    });

    it('index matches array position', () => {
      if (!tc?.primaryFile) return;
      frames.forEach((f, i) => expect(f.index).toBe(i));
    });

    it('phase fractions are within video bounds [0.02, 0.97]', () => {
      if (!tc?.primaryFile) return;
      for (const f of frames) {
        expect(f.phase.fraction).toBeGreaterThanOrEqual(0.02);
        expect(f.phase.fraction).toBeLessThanOrEqual(0.97);
      }
    });

    it('progress callbacks fire from 0 to 100 non-decreasing', async () => {
      if (!tc?.primaryFile) return;
      const percentages: number[] = [];
      // Run a lightweight extraction (Squat = 8 phase frames) just to test progress
      await extractFrames(tc.primaryFile, 'Squat (Double-Leg)', {
        onProgress: (pct) => percentages.push(pct),
      });
      expect(percentages[0]).toBe(0);
      expect(percentages[percentages.length - 1]).toBe(100);
      for (let i = 1; i < percentages.length; i++) {
        expect(percentages[i]).toBeGreaterThanOrEqual(percentages[i - 1]);
      }
    });
  });

  describe(`[${dir}] secondary video`, () => {
    let tc: TestCase | undefined;
    let frames: ExtractedFrame[] = [];

    beforeAll(async () => {
      tc = (await loadTestCase(dir)) ?? undefined;
      if (!tc?.secondaryFile) return;
      frames = await extractFrames(tc.secondaryFile, tc.movementType);
      renderFramesAlways(
        frames,
        `[${dir}] ${tc.movementType} — secondary (${tc.yaml.media.secondary?.angle ?? 'unknown'})`,
        tc,
      );
    });

    it('extracts frames from secondary file if present', () => {
      if (!tc?.secondaryFile) return;
      expect(frames.length).toBeGreaterThan(0);
    });

    it('all frames have valid base64 imageData', () => {
      if (!tc?.secondaryFile) return;
      for (const f of frames) {
        expect(typeof f.imageData).toBe('string');
        expect(f.imageData.length).toBeGreaterThan(300);
      }
    });
  });
}

// ── Cross-case consistency ─────────────────────────────────────────────────────

describe('cross-case consistency', () => {
  // Frame counts are deterministic from movement type alone — verified in unit tests.
  // Here we just confirm all cases loaded and resolved to the same movement type.
  it('all test cases resolve to the same movement type', async () => {
    const cases = (
      await Promise.all(TEST_DIRS.map(loadTestCase))
    ).filter((tc): tc is TestCase => tc !== null);

    if (cases.length < 2) return;

    const types = [...new Set(cases.map(tc => tc.movementType))];
    expect(
      types.length,
      `Expected all cases to share one movement type, got: ${types.join(', ')}`,
    ).toBe(1);
  });
});
