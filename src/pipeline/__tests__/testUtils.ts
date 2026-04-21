import { load as parseYaml } from 'js-yaml';
import { PHASE_MAPS } from '../../data/phaseMaps';
import type { ExtractedFrame } from '../../types';

// ── YAML schema ───────────────────────────────────────────────────────────────

export interface TestCaseMedia {
  file: string;
  angle: string;
}

export interface TestCaseYaml {
  patient_name: string;
  age: number;
  complaint: string;
  movement_type: string;
  media: {
    primary: TestCaseMedia;
    secondary?: TestCaseMedia;
  };
}

export interface TestCase {
  dir: string;
  yaml: TestCaseYaml;
  movementType: string; // resolved to exact PHASE_MAPS key (or closest match)
  primaryFile: File | null;
  secondaryFile: File | null;
}

// ── Movement type resolver ─────────────────────────────────────────────────────
// Maps a freeform YAML movement_type string (e.g. "running") to the exact
// PHASE_MAPS key (e.g. "Running").

export function resolveMovementType(raw: string): string {
  const lower = raw.toLowerCase().trim();
  // Exact case-insensitive match first
  for (const key of Object.keys(PHASE_MAPS)) {
    if (key.toLowerCase() === lower) return key;
  }
  // Prefix match on first word of each key
  for (const key of Object.keys(PHASE_MAPS)) {
    if (lower.includes(key.toLowerCase().split(' ')[0])) return key;
  }
  return raw; // passthrough — unknown movement handled by getPhaseTimes fallback
}

// ── File fetcher ──────────────────────────────────────────────────────────────
// Fetches a file from the Vite dev server (test_data is the publicDir).
// Returns null when absent so tests can skip gracefully.

export async function fetchTestFile(dir: string, name: string): Promise<File | null> {
  try {
    const res = await fetch(`/${dir}/${name}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], name, { type: blob.type || 'video/quicktime' });
  } catch {
    return null;
  }
}

// ── YAML loader ───────────────────────────────────────────────────────────────

export async function loadTestCase(dir: string): Promise<TestCase | null> {
  let yaml: TestCaseYaml;
  try {
    const res = await fetch(`/${dir}/test.yaml`);
    if (!res.ok) return null;
    yaml = parseYaml(await res.text()) as TestCaseYaml;
  } catch {
    return null;
  }

  const movementType = resolveMovementType(yaml.movement_type);
  const primaryFile  = await fetchTestFile(dir, yaml.media.primary.file);
  const secondaryFile = yaml.media.secondary
    ? await fetchTestFile(dir, yaml.media.secondary.file)
    : null;

  if (!primaryFile) {
    console.warn(`[testUtils] Primary file "${yaml.media.primary.file}" not found in ${dir}/`);
  }
  if (yaml.media.secondary && !secondaryFile) {
    console.warn(
      `[testUtils] Secondary file "${yaml.media.secondary.file}" not found in ${dir}/` +
      ` — check that the filename in test.yaml matches the actual file on disk.`,
    );
  }

  return { dir, yaml, movementType, primaryFile, secondaryFile };
}

// ── Frame visualiser ──────────────────────────────────────────────────────────
// Renders extracted frames as a labelled grid in the browser document.
// Only active when running in a browser context (window is defined) and
// the VITEST_MANUAL env var is set, OR when the suite is running interactively
// (not in --run / CI mode, detected via import.meta.env.MODE !== 'production').

function isBrowser() {
  return typeof window !== 'undefined';
}

function isManualMode() {
  if (!isBrowser()) return false;
  // Set VITEST_MANUAL=true in the env to always show frames, or run without --run
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITEST_MANUAL === 'true') return true;
  // In interactive watch mode, Vitest sets MODE to 'test'; in --run it is also 'test'.
  // We use a query param as an opt-in: ?manual in the browser URL.
  return typeof location !== 'undefined' && location.search.includes('manual');
}

export function renderFrames(
  frames: ExtractedFrame[],
  label: string,
  testCase?: TestCase,
) {
  if (!isBrowser()) return;

  const container = document.createElement('div');
  container.style.cssText = 'font-family:sans-serif;padding:16px;border-bottom:2px solid #ccc;margin-bottom:16px';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0 0 4px;font-size:14px;color:#333';
  title.textContent = label;
  container.appendChild(title);

  if (testCase) {
    const meta = document.createElement('p');
    meta.style.cssText = 'margin:0 0 10px;font-size:12px;color:#666';
    meta.textContent = [
      `Patient: ${testCase.yaml.patient_name}`,
      `Age: ${testCase.yaml.age}`,
      `Movement: ${testCase.movementType}`,
      `Complaint: ${testCase.yaml.complaint}`,
    ].join(' · ');
    container.appendChild(meta);
  }

  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';

  for (const frame of frames) {
    const cell = document.createElement('div');
    cell.style.cssText = 'text-align:center';

    const img = document.createElement('img');
    img.src = `data:image/jpeg;base64,${frame.imageData}`;
    img.style.cssText = 'display:block;width:160px;height:auto;border:1px solid #ddd;border-radius:4px';
    img.title = `t=${frame.timestamp.toFixed(2)}s`;

    const caption = document.createElement('div');
    caption.style.cssText = 'font-size:10px;color:#555;margin-top:3px;max-width:160px';
    caption.textContent = `${frame.phase.label}`;

    cell.appendChild(img);
    cell.appendChild(caption);
    grid.appendChild(cell);
  }

  container.appendChild(grid);
  document.body.appendChild(container);
}

// Always-on version: renders regardless of manual flag.
// Use this in browser tests directly — the frames are only visible
// when the browser window is open (interactive run), not in headless --run.
export function renderFramesAlways(
  frames: ExtractedFrame[],
  label: string,
  testCase?: TestCase,
) {
  if (!isBrowser()) return;
  renderFrames(frames, label, testCase);
}
