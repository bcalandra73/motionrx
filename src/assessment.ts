/**
 * Assessment utilities.
 *
 * assessmentFromYaml() — converts a parsed YAML object (snake_case) into an Assessment.
 * defaultAssessment()  — returns an empty Assessment with sensible defaults.
 */

import type {
  Assessment,
  AssessmentCapture,
  MovementType,
  CameraView,
  HeightUnit,
  InjuredSide,
  SpeedUnit,
  RunningSurface,
  ShoeType,
  RunnerExperience,
  JumpInvolvedLimb,
  JumpProtocol,
  JumpTimePostOp,
} from './types';
import { PHASE_MAPS, DENSE_FRAME_MOVEMENTS } from './data/phaseMaps';

// ── Movement type normalization ───────────────────────────────────────────────
// YAML files may use any casing (e.g. "running", "Running", "RUNNING").
// Normalize to the canonical key used in PHASE_MAPS / DENSE_FRAME_MOVEMENTS.
const _allMovementKeys = [
  ...Object.keys(PHASE_MAPS),
  ...[...DENSE_FRAME_MOVEMENTS].filter(m => !PHASE_MAPS[m]),
];

function normalizeMovementType(raw: string): string {
  if (!raw) return raw;
  if (PHASE_MAPS[raw] || DENSE_FRAME_MOVEMENTS.has(raw)) return raw;
  const lower = raw.toLowerCase();
  return _allMovementKeys.find(k => k.toLowerCase() === lower) ?? raw;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export function defaultAssessment(): Assessment {
  return {
    patient: {
      name:         '',
      age:          '',
      diagnosis:    '',
      movementType: '' as MovementType,
      height:       '',
      heightUnit:   'in',
      injuredSide:  '' as InjuredSide,
      notes:        '',
    },
    media: {
      primary: { file: '', cameraView: 'side' },
    },
    focus:   [],
    running: undefined,
    jump:    undefined,
    proms:   undefined,
  };
}

// ── YAML → Assessment ─────────────────────────────────────────────────────────
// Converts the parsed YAML object (snake_case keys) to a typed Assessment.
// Unknown/missing fields fall back to defaults so partial YAML files are safe.

type YamlValue = string | number | boolean | null | YamlObject | YamlArray;
type YamlObject = Record<string, YamlValue>;
type YamlArray  = YamlValue[];

function str(v: YamlValue | undefined, fallback = ''): string {
  return v != null ? String(v) : fallback;
}

function num(v: YamlValue | undefined, fallback: number): number {
  const n = Number(v);
  return v != null && !isNaN(n) ? n : fallback;
}

function bool(v: YamlValue | undefined, fallback = false): boolean {
  if (v == null) return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true' || v === '1' || v === 'yes';
  return Boolean(v);
}

function obj(v: YamlValue | undefined): YamlObject {
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v as YamlObject : {};
}

function arr(v: YamlValue | undefined): YamlArray {
  return Array.isArray(v) ? v : [];
}

export function assessmentFromYaml(raw: YamlObject): Assessment {
  const base    = defaultAssessment();
  const patient = obj(raw.patient);
  const media   = obj(raw.media);
  const primary = obj(media.primary);
  const secondary = media.secondary ? obj(media.secondary) : null;

  // ── patient ──────────────────────────────────────────────────────────────
  base.patient = {
    name:         str(patient.name),
    age:          str(patient.age),
    diagnosis:    str(patient.diagnosis),
    movementType: normalizeMovementType(str(patient.movement_type)) as MovementType,
    height:       str(patient.height),
    heightUnit:   (str(patient.height_unit, 'in') as HeightUnit) || 'in',
    injuredSide:  str(patient.injured_side) as InjuredSide,
    notes:        str(patient.notes),
  };

  // ── media ─────────────────────────────────────────────────────────────────
  base.media.primary = {
    file:       str(primary.file),
    cameraView: (str(primary.camera_view, 'side') as CameraView) || 'side',
  };
  if (secondary) {
    base.media.secondary = {
      file:       str(secondary.file),
      cameraView: (str(secondary.camera_view, 'side') as CameraView) || 'side',
    };
  }

  // ── focus areas ───────────────────────────────────────────────────────────
  base.focus = arr(raw.focus).map(v => str(v as YamlValue)).filter(Boolean);

  // ── capture settings ──────────────────────────────────────────────────────
  if (media.capture != null) {
    const c = obj(media.capture);
    base.capture = {
      startSecs:    num(c.start,    0),
      durationSecs: num(c.duration, 2),
      targetFps:    num(c.fps,      5),
    } satisfies AssessmentCapture;
  }

  // ── running ───────────────────────────────────────────────────────────────
  if (raw.running != null) {
    const r = obj(raw.running);
    base.running = {
      treadmillSpeed:   str(r.treadmill_speed),
      speedUnit:        (str(r.speed_unit, 'mph') as SpeedUnit) || 'mph',
      treadmillIncline: str(r.treadmill_incline),
      runningSurface:   (str(r.surface, 'treadmill') as RunningSurface) || 'treadmill',
      videoFps:         num(r.fps, 30),
      shoe:             str(r.shoe) as ShoeType,
      experience:       str(r.experience) as RunnerExperience,
      includeFootwear:  bool(r.include_footwear, true),
    };
  }

  // ── jump ──────────────────────────────────────────────────────────────────
  if (raw.jump != null) {
    const j = obj(raw.jump);
    base.jump = {
      videoFps:     num(j.fps, 120),
      involvedLimb: str(j.involved_limb) as JumpInvolvedLimb,
      protocol:     str(j.protocol) as JumpProtocol,
      timePostOp:   str(j.time_post_op) as JumpTimePostOp,
    };
  }

  // ── proms ─────────────────────────────────────────────────────────────────
  if (raw.proms != null) {
    const p = obj(raw.proms);

    const nprsRaw = p.nprs ? obj(p.nprs) : null;
    const psfsRaw = arr(p.psfs);
    const lefsRaw = arr(p.lefs_scores);
    const odiRaw  = arr(p.odi_scores);

    base.proms = {
      nprs: nprsRaw ? {
        current: nprsRaw.current != null ? num(nprsRaw.current, 0) : null,
        best:    nprsRaw.best    != null ? num(nprsRaw.best,    0) : null,
        worst:   nprsRaw.worst   != null ? num(nprsRaw.worst,   0) : null,
      } : undefined,
      psfs: psfsRaw.length ? psfsRaw.map(item => {
        const i = obj(item as YamlValue);
        return { activity: str(i.activity), score: i.score != null ? num(i.score, 0) : null };
      }) : undefined,
      lefsScores:   lefsRaw.length ? lefsRaw.map(v => v != null ? num(v as YamlValue, 0) : null) : undefined,
      odiScores:    odiRaw.length  ? odiRaw.map(v => v != null ? num(v as YamlValue, 0) : null)  : undefined,
      lsiInjured:   str(p.lsi_injured),
      lsiUninjured: str(p.lsi_uninjured),
    };
  }

  return base;
}
