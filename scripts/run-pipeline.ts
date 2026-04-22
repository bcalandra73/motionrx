/**
 * End-to-end pipeline runner.
 *
 * Usage:
 *   npm run pipeline                        # run all test_data/test_* cases
 *   npm run pipeline -- --test test_1       # run a single case
 *   npm run pipeline -- --key sk-ant-...    # include Claude report generation
 *   npm run pipeline -- --out results/      # override output directory
 */

import { chromium } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { RunnerOutput } from '../src/runner/runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args: Record<string, string> = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith('--')) {
      args[raw[i].slice(2)] = raw[i + 1] ?? 'true';
      i++;
    }
  }
  return {
    test: args.test ?? null,
    key:  args.key  ?? process.env.ANTHROPIC_API_KEY ?? null,
    out:  args.out  ?? path.join(ROOT, 'test_output'),
  };
}

// ── Test dir discovery ────────────────────────────────────────────────────────

async function findTestDirs(filter: string | null): Promise<string[]> {
  const base = path.join(ROOT, 'test_data');
  let entries: string[];
  try {
    entries = await fs.readdir(base);
  } catch {
    console.error(`[runner] test_data/ directory not found at ${base}`);
    process.exit(1);
  }

  const dirs = entries
    .filter(e => !filter || e === filter)
    .map(e => path.join(base, e));

  const valid: string[] = [];
  for (const d of dirs) {
    const stat = await fs.stat(d).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const hasYaml = await fs.access(path.join(d, 'test.yaml')).then(() => true).catch(() => false);
    if (hasYaml) valid.push(d);
  }

  if (!valid.length) {
    console.error(filter
      ? `[runner] No test case found for --test ${filter}`
      : '[runner] No test cases found in test_data/');
    process.exit(1);
  }
  return valid;
}

// ── Output writer ─────────────────────────────────────────────────────────────

async function writeOutput(outDir: string, result: RunnerOutput): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });

  // summary.json — everything except frame imageData (keep JSON small)
  const summary = {
    dir:          result.dir,
    movementType: result.movementType,
    cameraView:   result.cameraView,
    patient:      result.patient,
    steps: {
      extraction: result.steps.extraction
        ? { ok: result.steps.extraction.ok, ms: result.steps.extraction.ms, frameCount: result.steps.extraction.data?.frameCount ?? null, error: result.steps.extraction.error }
        : null,
      phaseSelection: result.steps.phaseSelection
        ? { ok: result.steps.phaseSelection.ok, ms: result.steps.phaseSelection.ms, frameCount: result.steps.phaseSelection.data?.frameCount ?? null, phases: result.steps.phaseSelection.data?.phases ?? null, error: result.steps.phaseSelection.error }
        : null,
      poseDetection: result.steps.poseDetection
        ? { ok: result.steps.poseDetection.ok, ms: result.steps.poseDetection.ms, detectedCount: result.steps.poseDetection.data?.detectedCount ?? null, totalCount: result.steps.poseDetection.data?.totalCount ?? null, error: result.steps.poseDetection.error }
        : null,
      angleCalculation: result.steps.angleCalculation
        ? { ok: result.steps.angleCalculation.ok, ms: result.steps.angleCalculation.ms, error: result.steps.angleCalculation.error }
        : null,
      reportGeneration: result.steps.reportGeneration
        ? { ok: result.steps.reportGeneration.ok, ms: result.steps.reportGeneration.ms, error: result.steps.reportGeneration.error }
        : null,
    },
    aggregated: result.steps.angleCalculation?.data?.aggregated ?? null,
    perFrameAngles: result.steps.poseDetection?.data?.perFrameAngles ?? null,
  };
  await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  // prompt.txt
  const prompt = result.steps.reportGeneration?.data?.prompt;
  if (prompt) {
    await fs.writeFile(path.join(outDir, 'prompt.txt'), prompt as string);
  }

  // report.json
  const report = result.steps.reportGeneration?.data?.report;
  if (report) {
    await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  }

  // frames/ — phase-selected frames as JPEG (plain)
  const frames = result.steps.phaseSelection?.data?.frames ?? [];
  if (frames.length) {
    const framesDir = path.join(outDir, 'frames');
    await fs.mkdir(framesDir, { recursive: true });
    for (const frame of frames) {
      const name = `${String(frame.index).padStart(2, '0')}_${frame.phase.id}.jpg`;
      await fs.writeFile(path.join(framesDir, name), Buffer.from(frame.imageData, 'base64'));
    }
  }

  // frames_annotated/ — same frames with skeleton overlay
  const annotatedFrames = result.steps.poseDetection?.data?.annotatedFrames ?? [];
  if (annotatedFrames.length && frames.length) {
    const annotDir = path.join(outDir, 'frames_annotated');
    await fs.mkdir(annotDir, { recursive: true });
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const name  = `${String(frame.index).padStart(2, '0')}_${frame.phase.id}.jpg`;
      await fs.writeFile(path.join(annotDir, name), Buffer.from(annotatedFrames[i] ?? frame.imageData, 'base64'));
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { test, key, out } = parseArgs();

  const testDirs = await findTestDirs(test);
  console.log(`[runner] Found ${testDirs.length} test case(s): ${testDirs.map(d => path.basename(d)).join(', ')}`);
  if (key) {
    console.log('[runner] API key provided — report generation enabled');
  } else {
    console.log('[runner] No API key — skipping step 5 (pass --key or set ANTHROPIC_API_KEY)');
  }

  // Start Vite dev server — publicDir set to test_data/ so videos are fetchable at /{dir}/file
  console.log('[runner] Starting Vite dev server...');
  const server = await createServer({
    root:      ROOT,
    publicDir: path.join(ROOT, 'test_data'),
    plugins:   [react()],
    resolve: {
      alias: {
        '@mediapipe/pose': path.resolve(ROOT, 'src/stubs/mediapipe-pose-stub.ts'),
      },
    },
    server: {
      port: 5174,
      strictPort: false,
      fs: { allow: [ROOT, path.join(ROOT, 'test_data')] },
    },
    logLevel: 'warn',
  });
  await server.listen();
  const port  = (server.httpServer?.address() as { port: number })?.port ?? 5174;
  const base  = `http://localhost:${port}`;
  console.log(`[runner] Vite server running at ${base}`);

  // Launch headless Chromium
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page    = await context.newPage();

  // Forward browser console to Node stdout
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') console.error(`  [browser] ${text}`);
    else console.log(`  [browser] ${text}`);
  });
  page.on('pageerror', err => console.error(`  [browser error] ${err.message}`));

  // Navigate to runner page and wait for it to be ready
  console.log('[runner] Loading pipeline runner page...');
  await page.goto(`${base}/src/runner/index.html`);
  await page.waitForFunction(() => typeof (window as unknown as Record<string, unknown>).runPipeline === 'function', { timeout: 60_000 });
  console.log('[runner] Runner ready.\n');

  // Run each test case
  for (const dir of testDirs) {
    const name   = path.basename(dir);
    const outDir = path.join(out, name);

    console.log(`─── ${name} ───────────────────────────────`);
    const t = Date.now();

    let result: RunnerOutput;
    try {
      result = await page.evaluate(
        async (input) => (window as unknown as Record<string, unknown>).runPipeline(input) as Promise<RunnerOutput>,
        { dir: name, apiKey: key ?? '' },
      ) as RunnerOutput;
    } catch (err) {
      console.error(`[runner] page.evaluate failed for ${name}:`, err);
      continue;
    }

    await writeOutput(outDir, result);

    // Print step summary
    const s = result.steps;
    const line = (label: string, step: { ok: boolean; ms: number; error: string | null } | null) => {
      if (!step) return `  ${label}: skipped`;
      if (step.ok) return `  ${label}: ✓ (${step.ms}ms)`;
      return `  ${label}: ✗ — ${step.error}`;
    };
    console.log(line('1. Extraction',       s.extraction));
    console.log(line('2. Phase selection',  s.phaseSelection));
    console.log(line('3. Pose detection',   s.poseDetection));
    console.log(line('4. Angle calc',       s.angleCalculation));
    console.log(line('5. Report',           s.reportGeneration));

    const angles = result.steps.angleCalculation?.data?.aggregated;
    if (angles && Object.keys(angles).length) {
      console.log('  Angles:');
      for (const [k, v] of Object.entries(angles)) {
        console.log(`    ${k}: avg=${v.avg}° min=${v.min}° max=${v.max}° (${v.hitRate}% hit rate${v.lowConfidence ? ' ⚠ low confidence' : ''})`);
      }
    }

    console.log(`  Total: ${Date.now() - t}ms  →  output written to ${outDir}\n`);
  }

  await browser.close();
  await server.close();
  console.log('[runner] Done.');
}

main().catch(err => {
  console.error('[runner] Fatal:', err);
  process.exit(1);
});
