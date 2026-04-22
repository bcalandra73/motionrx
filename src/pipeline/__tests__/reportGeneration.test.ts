import { describe, it, expect } from 'vitest';
import { buildReportPrompt } from '../reportGeneration';
import type { ReportContext } from '../reportGeneration';
import type { AngleStat } from '../angleCalculation';

// ── Helpers ───────────────────────────────────────────────────────────────────

function stat(min: number, avg: number, max: number): AngleStat {
  return { min, avg, max, count: 3, hitRate: 100, lowConfidence: false };
}

const BASE_PATIENT = {
  patientName:    'Jane Doe',
  patientAge:     '34',
  diagnosis:      'Left knee pain on stairs',
  movementType:   'Running' as const,
  patientHeight:  '170',
  heightUnit:     'cm' as const,
  injuredSide:    'left' as const,
  clinicalNotes:  '',
};

function makeCtx(overrides: Partial<ReportContext> = {}): ReportContext {
  return {
    patient:      BASE_PATIENT,
    movementType: 'Running',
    cameraView:   'side',
    hasDualView:  false,
    focusAreas:   [],
    aggregated:   {},
    proms:        {},
    frameCount:   8,
    ...overrides,
  };
}

// ── Patient metadata ──────────────────────────────────────────────────────────

describe('buildReportPrompt — patient metadata', () => {
  it('includes patient name', () => {
    const p = buildReportPrompt(makeCtx());
    expect(p).toContain('Jane Doe');
  });

  it('includes patient age', () => {
    const p = buildReportPrompt(makeCtx());
    expect(p).toContain('Age 34');
  });

  it('includes diagnosis', () => {
    const p = buildReportPrompt(makeCtx());
    expect(p).toContain('Left knee pain on stairs');
  });

  it('includes injured side', () => {
    const p = buildReportPrompt(makeCtx());
    expect(p).toContain('Symptomatic side: left');
  });

  it('includes movement type', () => {
    const p = buildReportPrompt(makeCtx());
    expect(p).toContain('Running');
  });

  it('includes clinical notes when present', () => {
    const p = buildReportPrompt(makeCtx({ patient: { ...BASE_PATIENT, clinicalNotes: 'Post ACLR 9mo' } }));
    expect(p).toContain('Post ACLR 9mo');
  });

  it('includes frame count', () => {
    const p = buildReportPrompt(makeCtx({ frameCount: 8 }));
    expect(p).toContain('8 frames');
  });

  it('includes focus areas when provided', () => {
    const p = buildReportPrompt(makeCtx({ focusAreas: ['Knee valgus', 'Hip drop'] }));
    expect(p).toContain('Knee valgus');
    expect(p).toContain('Hip drop');
  });
});

// ── Angle display values ──────────────────────────────────────────────────────
// gaitDisplayVal is tested indirectly through the formatted angle lines.

describe('buildReportPrompt — angle display values', () => {
  it('running knee flexion shows 180 - min (peak swing flexion)', () => {
    // min=60 (most bent = 120° peak flexion), avg=90, max=100
    const p = buildReportPrompt(makeCtx({
      movementType: 'Running',
      aggregated:   { 'Left Knee Flexion': stat(60, 90, 100) },
    }));
    // 180 - 60 = 120° should appear, not avg=90
    expect(p).toContain('Left Knee Flexion: 120°');
    expect(p).not.toContain('Left Knee Flexion: 90°');
  });

  it('running hip flexion shows max (peak swing hip angle)', () => {
    // max=62 is the peak thigh-from-vertical
    const p = buildReportPrompt(makeCtx({
      movementType: 'Running',
      aggregated:   { 'Left Hip Flexion': stat(30, 45, 62) },
    }));
    expect(p).toContain('Left Hip Flexion: 62°');
    expect(p).not.toContain('Left Hip Flexion: 45°');
  });

  it('non-gait metric shows avg', () => {
    const p = buildReportPrompt(makeCtx({
      movementType: 'Running',
      aggregated:   { 'Trunk Lean': stat(5, 11, 18) },
    }));
    expect(p).toContain('Trunk Lean: 11°');
  });

  it('landing knee flexion shows 180 - min (peak flexion)', () => {
    // min=85 (most bent) → 95° peak clinical flexion
    const p = buildReportPrompt(makeCtx({
      movementType: 'Drop Jump Landing',
      aggregated:   { 'Left Knee Flexion': stat(85, 100, 150) },
    }));
    expect(p).toContain('Left Knee Flexion: 95°');
  });

  it('landing valgus shows max (worst-case)', () => {
    const p = buildReportPrompt(makeCtx({
      movementType: 'Drop Jump Landing',
      aggregated:   { 'Left Knee Valgus': stat(2, 8, 14) },
    }));
    expect(p).toContain('Left Knee Valgus: 14°');
    expect(p).not.toContain('Left Knee Valgus: 8°');
  });

  it('shoulder flexion shows max (peak ROM)', () => {
    const p = buildReportPrompt(makeCtx({
      movementType: 'Overhead Press / Reach',
      aggregated:   { 'Left Shoulder Flexion': stat(60, 130, 170) },
    }));
    expect(p).toContain('Left Shoulder Flexion: 170°');
  });

  it('includes range (min–max) alongside display value', () => {
    const p = buildReportPrompt(makeCtx({
      movementType: 'Squat (Double-Leg)',
      aggregated:   { 'Left Knee Flexion': stat(40, 100, 120) },
    }));
    expect(p).toMatch(/Left Knee Flexion.*range 40°–120°/);
  });
});

// ── Upper extremity suppression ───────────────────────────────────────────────

describe('buildReportPrompt — upper extremity metric suppression', () => {
  const upperCtx = makeCtx({
    movementType: 'Overhead Press / Reach',
    aggregated: {
      'Left Shoulder Flexion': stat(60, 130, 170),
      'Left Knee Flexion':     stat(160, 170, 178), // should be suppressed
      'Left Ankle Dorsiflexion': stat(5, 10, 15),   // should be suppressed
    },
  });

  it('includes shoulder metric', () => {
    expect(buildReportPrompt(upperCtx)).toContain('Left Shoulder Flexion');
  });

  it('suppresses knee flexion for upper extremity movement', () => {
    expect(buildReportPrompt(upperCtx)).not.toContain('Left Knee Flexion');
  });

  it('suppresses ankle DF for upper extremity movement', () => {
    expect(buildReportPrompt(upperCtx)).not.toContain('Left Ankle Dorsiflexion');
  });
});

// ── Running context ───────────────────────────────────────────────────────────

describe('buildReportPrompt — running context', () => {
  const runCtx = makeCtx({
    movementType: 'Running',
    running: {
      treadmillSpeed:   '8',
      speedUnit:        'kph',
      treadmillIncline: '1',
      runningSurface:   'treadmill',
      videoFps:          60,
      shoe:             'stability',
      experience:       'recreational',
      includeFootwear:  false,
    },
  });

  it('includes running context section', () => {
    const p = buildReportPrompt(runCtx);
    expect(p).toContain('RUNNING CONTEXT');
  });

  it('includes treadmill speed', () => {
    expect(buildReportPrompt(runCtx)).toContain('8 kph');
  });

  it('includes running surface', () => {
    expect(buildReportPrompt(runCtx)).toContain('treadmill');
  });

  it('includes shoe type', () => {
    expect(buildReportPrompt(runCtx)).toContain('stability');
  });

  it('includes fps', () => {
    expect(buildReportPrompt(runCtx)).toContain('60fps');
  });

  it('includes patient height in cm', () => {
    expect(buildReportPrompt(runCtx)).toContain('170cm');
  });

  it('does NOT include running context for squat', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Squat (Double-Leg)' }));
    expect(p).not.toContain('RUNNING CONTEXT');
  });
});

// ── Jump/landing context ──────────────────────────────────────────────────────

describe('buildReportPrompt — jump context', () => {
  const jumpCtx = makeCtx({
    movementType: 'Drop Jump Landing',
    jump: {
      videoFps:      120,
      involvedLimb:  'left',
      protocol:      '45cm',
      timePostOp:    '9mo',
    },
  });

  it('includes jump context section', () => {
    expect(buildReportPrompt(jumpCtx)).toContain('JUMP/LANDING CONTEXT');
  });

  it('includes involved limb', () => {
    expect(buildReportPrompt(jumpCtx)).toContain('left');
  });

  it('includes time post-op with context', () => {
    const p = buildReportPrompt(jumpCtx);
    expect(p).toContain('9mo');
    expect(p).toContain('return-to-sport');
  });

  it('includes ACL LSI threshold note', () => {
    expect(buildReportPrompt(jumpCtx)).toContain('LSI');
  });

  it('does NOT include jump context for running', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Running' }));
    expect(p).not.toContain('JUMP/LANDING CONTEXT');
  });
});

// ── Footwear request ──────────────────────────────────────────────────────────

describe('buildReportPrompt — footwear recommendation', () => {
  const withFootwear = makeCtx({
    movementType: 'Running',
    aggregated: {
      'Left Pronation':  stat(2, 8, 12),
      'Right Pronation': stat(2, 6, 10),
    },
    running: {
      treadmillSpeed: '', speedUnit: 'mph', treadmillIncline: '',
      runningSurface: 'road', videoFps: 30, shoe: 'neutral',
      experience: '', includeFootwear: true,
    },
  });

  it('includes footwear recommendation request when checked', () => {
    expect(buildReportPrompt(withFootwear)).toContain('FOOTWEAR RECOMMENDATION REQUEST');
  });

  it('includes footwear_recommendation in JSON schema', () => {
    expect(buildReportPrompt(withFootwear)).toContain('footwear_recommendation');
  });

  it('includes pronation data in footwear section', () => {
    const p = buildReportPrompt(withFootwear);
    expect(p).toContain('Left pronation');
  });

  it('does NOT include footwear section when unchecked', () => {
    const p = buildReportPrompt(makeCtx({
      movementType: 'Running',
      running: { treadmillSpeed: '', speedUnit: 'mph', treadmillIncline: '', runningSurface: 'road', videoFps: 30, shoe: '', experience: '', includeFootwear: false },
    }));
    expect(p).not.toContain('FOOTWEAR RECOMMENDATION REQUEST');
    expect(p).not.toContain('footwear_recommendation');
  });

  it('does NOT include footwear section for non-running movements', () => {
    const p = buildReportPrompt(makeCtx({
      movementType: 'Squat (Double-Leg)',
      running: { treadmillSpeed: '', speedUnit: 'mph', treadmillIncline: '', runningSurface: 'road', videoFps: 30, shoe: '', experience: '', includeFootwear: true },
    }));
    expect(p).not.toContain('FOOTWEAR RECOMMENDATION REQUEST');
  });
});

// ── Limb symmetry index ───────────────────────────────────────────────────────

describe('buildReportPrompt — ASI / limb symmetry index', () => {
  it('includes ASI section when bilateral metrics are present', () => {
    const p = buildReportPrompt(makeCtx({
      movementType: 'Running',
      aggregated: {
        'Left Knee Flexion':  stat(60, 90, 110),
        'Right Knee Flexion': stat(70, 95, 115),
      },
    }));
    expect(p).toContain('LIMB SYMMETRY INDEX');
  });

  it('shows SIGNIFICANT ASYMMETRY when >15% difference', () => {
    // Left: 180-60=120, Right: 180-90=90 → large difference
    const p = buildReportPrompt(makeCtx({
      movementType: 'Running',
      aggregated: {
        'Left Knee Flexion':  stat(60, 80, 100),
        'Right Knee Flexion': stat(90, 95, 100),
      },
    }));
    expect(p).toContain('SIGNIFICANT ASYMMETRY');
  });

  it('shows symmetric when <10% difference', () => {
    // Left: 180-60=120, Right: 180-58=122 — nearly identical
    const p = buildReportPrompt(makeCtx({
      movementType: 'Running',
      aggregated: {
        'Left Knee Flexion':  stat(60, 85, 100),
        'Right Knee Flexion': stat(58, 83, 100),
      },
    }));
    expect(p).toContain('symmetric');
  });

  it('omits ASI section when only one side present', () => {
    const p = buildReportPrompt(makeCtx({
      movementType: 'Running',
      aggregated: { 'Left Knee Flexion': stat(60, 90, 110) },
    }));
    expect(p).not.toContain('LIMB SYMMETRY INDEX');
  });
});

// ── PROMs ─────────────────────────────────────────────────────────────────────

describe('buildReportPrompt — PROMs', () => {
  it('includes NPRS current pain', () => {
    const p = buildReportPrompt(makeCtx({
      proms: { nprs: { current: 6, best: 2, worst: 8 } },
    }));
    expect(p).toContain('NPRS Current Pain: 6/10');
    expect(p).toContain('Best 24h: 2/10');
    expect(p).toContain('Worst 24h: 8/10');
  });

  it('includes PSFS activities', () => {
    const p = buildReportPrompt(makeCtx({
      proms: { psfs: [{ activity: 'Running 5km', score: 4 }, { activity: 'Stairs', score: 3 }] },
    }));
    expect(p).toContain('Running 5km');
    expect(p).toContain('4/10');
  });

  it('includes LEFS with interpretation', () => {
    const p = buildReportPrompt(makeCtx({ proms: { lefsTotal: 55 } }));
    expect(p).toContain('LEFS: 55/80');
    expect(p).toContain('Moderate limitation');
  });

  it('includes ODI score with interpretation', () => {
    const p = buildReportPrompt(makeCtx({ proms: { odiScore: 35 } }));
    expect(p).toContain('ODI: 35% disability');
    expect(p).toContain('Moderate');
  });

  it('includes hop test LSI', () => {
    const p = buildReportPrompt(makeCtx({ proms: { lsi: 84 } }));
    expect(p).toContain('Hop Test LSI: 84%');
  });

  it('omits PROMs section when no data', () => {
    const p = buildReportPrompt(makeCtx({ proms: {} }));
    expect(p).not.toContain('PATIENT REPORTED OUTCOMES');
  });
});

// ── Camera view and dual-view ─────────────────────────────────────────────────

describe('buildReportPrompt — camera view', () => {
  it('includes single camera view label', () => {
    expect(buildReportPrompt(makeCtx({ cameraView: 'side' }))).toContain('CAMERA VIEW: Side view');
  });

  it('includes front view label', () => {
    expect(buildReportPrompt(makeCtx({ cameraView: 'front', movementType: 'Running' }))).toContain('Front view');
  });

  it('includes dual-plane note when hasDualView', () => {
    const p = buildReportPrompt(makeCtx({ hasDualView: true, secondaryCameraView: 'front' }));
    expect(p).toContain('DUAL-PLANE ANALYSIS');
    expect(p).toContain('DUAL-VIEW ADVANTAGE');
  });

  it('warns about side-view limitation for landing', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Drop Jump Landing', cameraView: 'side', hasDualView: false }));
    expect(p).toContain('SIDE VIEW ONLY');
    expect(p).toContain('MAJOR LIMITATION');
  });

  it('no side-view warning for landing with dual view', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Drop Jump Landing', cameraView: 'side', hasDualView: true }));
    expect(p).not.toContain('SIDE VIEW ONLY — MAJOR LIMITATION');
  });
});

// ── Movement norms ────────────────────────────────────────────────────────────

describe('buildReportPrompt — movement norms', () => {
  it('includes norms for Running', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Running' }));
    expect(p).toContain('MOVEMENT-SPECIFIC NORMS');
    expect(p).toContain('Running hip flexion');
  });

  it('includes norms for Squat', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Squat (Double-Leg)' }));
    expect(p).toContain('Squat knee');
  });

  it('includes norms for Drop Jump Landing', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Drop Jump Landing' }));
    expect(p).toContain('soft landing');
  });

  it('includes landing assessment section for landing movements', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Drop Jump Landing' }));
    expect(p).toContain('ACL RETURN-TO-SPORT CONTEXT');
  });

  it('does NOT include landing assessment for running', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Running' }));
    expect(p).not.toContain('ACL RETURN-TO-SPORT CONTEXT');
  });
});

// ── Angle conventions ─────────────────────────────────────────────────────────

describe('buildReportPrompt — angle conventions', () => {
  it('includes running knee convention warning', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Running' }));
    expect(p).toContain('RUNNING CONVENTION');
  });

  it('includes landing pre-conversion warning', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Countermovement Jump' }));
    expect(p).toContain('PRE-CONVERTED');
  });

  it('includes upper extremity conventions for shoulder', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Overhead Press / Reach' }));
    expect(p).toContain('UPPER EXTREMITY ANGLE CONVENTIONS');
  });

  it('does NOT include upper extremity conventions for running', () => {
    const p = buildReportPrompt(makeCtx({ movementType: 'Running' }));
    expect(p).not.toContain('UPPER EXTREMITY ANGLE CONVENTIONS');
  });
});

// ── JSON schema ───────────────────────────────────────────────────────────────

describe('buildReportPrompt — JSON schema', () => {
  it('always includes score field', () => {
    expect(buildReportPrompt(makeCtx())).toContain('"score"');
  });

  it('always includes findings array', () => {
    expect(buildReportPrompt(makeCtx())).toContain('"findings"');
  });

  it('always includes biomechanical_analysis', () => {
    expect(buildReportPrompt(makeCtx())).toContain('"biomechanical_analysis"');
  });

  it('always includes recommendations array', () => {
    expect(buildReportPrompt(makeCtx())).toContain('"recommendations"');
  });

  it('always includes patient_education array', () => {
    expect(buildReportPrompt(makeCtx())).toContain('"patient_education"');
  });

  it('instructs to return only JSON with no markdown', () => {
    const p = buildReportPrompt(makeCtx());
    expect(p).toContain('Return ONLY a JSON object');
    expect(p).toContain('no markdown');
  });
});
