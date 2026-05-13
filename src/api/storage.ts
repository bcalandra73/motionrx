import type { AutoSaveState, Branding, SavedSession } from '../types';

const AUTOSAVE_KEY = 'motionrx_autosave';
const BRANDING_KEY = 'motionrx_branding';
const SESSION_KEY  = 'motionrx_sessions';

// ── Branding ───────────────────────────────────────────────────────────────

export function saveBranding(branding: Branding): void {
  try {
    localStorage.setItem(BRANDING_KEY, JSON.stringify(branding));
  } catch {
    // storage quota exceeded — silently ignore
  }
}

export function loadBranding(): Branding | null {
  try {
    const raw = localStorage.getItem(BRANDING_KEY);
    return raw ? (JSON.parse(raw) as Branding) : null;
  } catch {
    return null;
  }
}

// ── Auto-save ──────────────────────────────────────────────────────────────

const AUTOSAVE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

export function saveAutoSave(state: AutoSaveState): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state));
  } catch {
    // storage quota exceeded — silently ignore
  }
}

export function loadAutoSave(): AutoSaveState | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as AutoSaveState;
    if (!state.ts || Date.now() - state.ts > AUTOSAVE_TTL_MS) {
      clearAutoSave();
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function clearAutoSave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}

// ── Session comparison snapshots ───────────────────────────────────────────

export function saveSessions(sessions: SavedSession[]): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
  } catch {
    // ignore
  }
}

export function loadSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedSession[]) : [];
  } catch {
    return [];
  }
}
