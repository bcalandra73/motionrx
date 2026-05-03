/**
 * End-to-end pipeline runner.
 *
 * Usage:
 *   npm run pipeline                  # run all test_data/test_* cases
 *   npm run pipeline -- --test test_1 # run a single case
 *
 * All run parameters come from each test's test.yaml.
 * Set ANTHROPIC_API_KEY in the environment to enable report generation.
 * Output is written to test_output/<test_name>/.
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
  return { test: args.test ?? null };
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

  const view1 = result.cameraView ?? 'primary';
  const view2 = result.secondaryCameraView ?? 'secondary';

  // frames_annotated/ — all frames with wireframe overlay + frame counter
  if (result.allAnnotatedFrames.length) {
    const annotDir = path.join(outDir, 'frames_annotated');
    await fs.mkdir(annotDir, { recursive: true });
    const total = result.allAnnotatedFrames.length;
    for (let i = 0; i < total; i++) {
      const name = `${String(i + 1).padStart(3, '0')}_of_${total}_${view1}.jpg`;
      await fs.writeFile(path.join(annotDir, name), Buffer.from(result.allAnnotatedFrames[i], 'base64'));
    }
  }

  // phases/ — one annotated frame per detected phase
  if (result.phaseFrames.length && result.annotatedFrames.length) {
    const phasesDir = path.join(outDir, 'phases');
    await fs.mkdir(phasesDir, { recursive: true });
    for (let i = 0; i < result.phaseFrames.length; i++) {
      const f    = result.phaseFrames[i];
      const b64  = result.annotatedFrames[i];
      if (!b64) continue;
      const name = `${String(i + 1).padStart(2, '0')}_${f.phase.id}_${view1}.jpg`;
      await fs.writeFile(path.join(phasesDir, name), Buffer.from(b64, 'base64'));
    }
  }

  // frames_paired/ — primary + secondary composited side by side
  if (result.secondary?.pairedFrames.length) {
    const pairedDir = path.join(outDir, 'frames_paired');
    await fs.mkdir(pairedDir, { recursive: true });
    for (let i = 0; i < result.secondary.pairedFrames.length; i++) {
      const phaseId = result.phaseFrames[i]?.phase?.id ?? String(i);
      const name    = `${String(i).padStart(2, '0')}_${phaseId}.jpg`;
      await fs.writeFile(path.join(pairedDir, name), Buffer.from(result.secondary.pairedFrames[i], 'base64'));
    }
  }

  // summary.json
  const summary = {
    dir:                 result.dir,
    movementType:        result.movementType,
    cameraView:          result.cameraView,
    secondaryCameraView: result.secondaryCameraView ?? null,
    patient:             result.patient,
    frames:              result.allAnnotatedFrames.length,
    phaseFrames:         result.phaseFrames.map(({ imageData: _i, ...f }) => f),
    aggregated:          result.aggregated,
    secondary:           result.secondary
      ? { phaseFrames: result.secondary.phaseFrames.map(({ imageData: _i, ...f }) => f), aggregated: result.secondary.aggregated }
      : null,
  };
  await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  if (result.gif)    await fs.writeFile(path.join(outDir, 'animation.gif'), Buffer.from(result.gif, 'base64'));
  if (result.prompt) await fs.writeFile(path.join(outDir, 'prompt.txt'),    result.prompt);
  if (result.report) await fs.writeFile(path.join(outDir, 'report.json'),   JSON.stringify(result.report, null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { test } = parseArgs();
  const key = process.env.ANTHROPIC_API_KEY ?? null;
  const out = path.join(ROOT, 'test_output');

  const testDirs = await findTestDirs(test);
  console.log(`[runner] Found ${testDirs.length} test case(s): ${testDirs.map(d => path.basename(d)).join(', ')}`);
  if (key) console.log('[runner] API key provided — report generation enabled');
  else      console.log('[runner] No API key — skipping report (pass --key or set ANTHROPIC_API_KEY)');

  // Start Vite dev server — publicDir set to test_data/ so videos are fetchable at /{dir}/file
  console.log('[runner] Starting Vite dev server...');
  const server = await createServer({
    root:      ROOT,
    publicDir: path.join(ROOT, 'test_data'),
    plugins:   [react()],
    server: {
      port:       5174,
      strictPort: false,
      fs: { allow: [ROOT, path.join(ROOT, 'test_data')] },
    },
    logLevel: 'warn',
  });
  await server.listen();
  const port = (server.httpServer?.address() as { port: number })?.port ?? 5174;
  const base = `http://localhost:${port}`;
  console.log(`[runner] Vite server running at ${base}`);

  // Launch headless Chromium
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page    = await context.newPage();

  page.on('console',   msg => console.log(`  [browser] ${msg.text()}`));
  page.on('pageerror', err => console.error(`  [browser error] ${err.message}`));

  console.log('[runner] Loading pipeline runner page...');
  await page.goto(`${base}/src/runner/index.html`);
  await page.waitForFunction(
    () => typeof (window as unknown as Record<string, unknown>).runPipeline === 'function',
    { timeout: 60_000 },
  );
  console.log('[runner] Runner ready.\n');

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

    if (result.error) {
      console.error(`  ✗ ${result.error}`);
      continue;
    }

    await writeOutput(outDir, result);

    console.log(`  Frames extracted : ${result.allAnnotatedFrames.length}`);
    console.log(`  Phase frames     : ${result.phaseFrames.map(f => f.phase.id).join(', ')}`);
    if (result.secondary) {
      console.log(`  Secondary frames : ${result.secondary.phaseFrames.map(f => f.phase.id).join(', ')}`);
    }

    if (Object.keys(result.aggregated).length) {
      console.log('  Angles:');
      for (const [k, v] of Object.entries(result.aggregated as Record<string, { avg: number; min: number; max: number; hitRate: number; lowConfidence?: boolean }>)) {
        console.log(`    ${k}: avg=${v.avg}° min=${v.min}° max=${v.max}° (${v.hitRate}% hit rate${v.lowConfidence ? ' ⚠ low confidence' : ''})`);
      }
    }

    if (result.report) console.log('  Report: report.json');
    console.log(`  Total: ${Date.now() - t}ms  →  ${outDir}\n`);
  }

  await browser.close();
  await server.close();
  console.log('[runner] Done.');
}

main().catch(err => {
  console.error('[runner] Fatal:', err);
  process.exit(1);
});
