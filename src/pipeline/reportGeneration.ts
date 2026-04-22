/**
 * Builds the Claude prompt for clinical report generation.
 *
 * buildReportPrompt() — assembles patient context, measured angles, PROMs,
 * movement-specific norms, and the JSON schema into a single prompt string.
 */

import type { PatientFormData, MovementType, RunningInputs, JumpInputs, NPRSData, PSFSItem } from '../types';
import type { AngleStat } from './angleCalculation';

// ── Context type ─────────────────────────────────────────────────────────────

export interface ReportContext {
  patient:            PatientFormData;
  movementType:       MovementType;
  cameraView:         'side' | 'front' | 'posterior';
  hasDualView:        boolean;
  secondaryCameraView?: 'side' | 'front' | 'posterior';
  focusAreas:         string[];
  aggregated:         Record<string, AngleStat>;
  aggregated2?:       Record<string, AngleStat>;
  proms: {
    nprs?:      NPRSData;
    psfs?:      PSFSItem[];
    lefsTotal?: number | null;
    odiScore?:  number | null;
    lsi?:       number | null;
  };
  running?:    RunningInputs;
  jump?:       JumpInputs;
  frameCount:  number;
  frameCount2?: number;
}

// ── Movement norms ───────────────────────────────────────────────────────────

interface NormRange {
  min?: number;
  max?: number;
  warn?: number;
  ok?: number;
  ideal?: [number, number];
  label: string;
}

const MOVEMENT_NORMS: Record<string, Record<string, NormRange>> = {
  'Hip Hinge / Deadlift Pattern': {
    'Left Hip Flexion':          { ideal: [60, 100], warn: 45,  label: 'Deadlift hip hinge: 60-100° at setup' },
    'Right Hip Flexion':         { ideal: [60, 100], warn: 45,  label: 'Deadlift hip hinge: 60-100° at setup' },
    'Left Knee Flexion':         { ideal: [30, 70],  warn: 20,  label: 'Deadlift knee: 30-70° at setup' },
    'Right Knee Flexion':        { ideal: [30, 70],  warn: 20,  label: 'Deadlift knee: 30-70° at setup' },
    'Trunk Lean':                { max: 45, warn: 55,            label: 'Deadlift torso: up to 45° acceptable' },
    'Left Ankle Dorsiflexion':   { ideal: [0, 20], warn: -5,    label: '0 to +20° from neutral during stance' },
    'Right Ankle Dorsiflexion':  { ideal: [0, 20], warn: -5,    label: '0 to +20° from neutral during stance' },
  },
  'Squat (Double-Leg)': {
    'Left Hip Flexion':          { ideal: [80, 130], warn: 70,  label: 'Squat hip: 80-130° at bottom' },
    'Right Hip Flexion':         { ideal: [80, 130], warn: 70,  label: 'Squat hip: 80-130° at bottom' },
    'Left Knee Flexion':         { ideal: [80, 140], warn: 70,  label: 'Squat knee: 80-140° at bottom' },
    'Right Knee Flexion':        { ideal: [80, 140], warn: 70,  label: 'Squat knee: 80-140° at bottom' },
    'Trunk Lean':                { max: 25, warn: 40,            label: 'Squat torso: <25° preferred' },
    'Left Ankle Dorsiflexion':   { ideal: [10, 30], warn: 5,    label: '+10 to +30° from neutral required for depth' },
    'Right Ankle Dorsiflexion':  { ideal: [10, 30], warn: 5,    label: '+10 to +30° from neutral required for depth' },
  },
  'Single-Leg Squat': {
    'Left Hip Flexion':          { ideal: [60, 110], warn: 50,  label: 'SL squat hip: 60-110°' },
    'Right Hip Flexion':         { ideal: [60, 110], warn: 50,  label: 'SL squat hip: 60-110°' },
    'Left Knee Flexion':         { ideal: [60, 120], warn: 50,  label: 'SL squat knee: 60-120°' },
    'Right Knee Flexion':        { ideal: [60, 120], warn: 50,  label: 'SL squat knee: 60-120°' },
    'Trunk Lean':                { max: 20, warn: 30,            label: '<20° lateral trunk lean' },
  },
  'Lunge': {
    'Left Knee Flexion':         { ideal: [80, 100], warn: 70,  label: 'Front knee: 80-100° at bottom' },
    'Right Knee Flexion':        { ideal: [80, 100], warn: 70,  label: 'Front knee: 80-100° at bottom' },
    'Left Hip Flexion':          { ideal: [80, 110], warn: 70,  label: 'Front hip: 80-110° at bottom' },
    'Right Hip Flexion':         { ideal: [80, 110], warn: 70,  label: 'Front hip: 80-110° at bottom' },
    'Trunk Lean':                { max: 15, warn: 25,            label: '<15° trunk lean preferred' },
  },
  'Gait / Walking': {
    'Left Hip Flexion':          { ideal: [20, 40], warn: 15,   label: 'Gait hip flexion: 20-40°' },
    'Right Hip Flexion':         { ideal: [20, 40], warn: 15,   label: 'Gait hip flexion: 20-40°' },
    'Left Knee Flexion':         { ideal: [0, 70],  warn: 0,    label: 'Stance: ~0°; swing: up to 70°' },
    'Right Knee Flexion':        { ideal: [0, 70],  warn: 0,    label: 'Stance: ~0°; swing: up to 70°' },
    'Left Ankle Dorsiflexion':   { ideal: [5, 25], warn: 0,     label: 'Min 5° DF during stance phase' },
    'Right Ankle Dorsiflexion':  { ideal: [5, 25], warn: 0,     label: 'Min 5° DF during stance phase' },
    'Trunk Lean':                { max: 10, warn: 15,            label: '<10° in gait' },
  },
  'Running': {
    'Left Hip Flexion':          { ideal: [35, 65], warn: 28,   label: 'Running hip flexion: 35-65° at peak swing' },
    'Right Hip Flexion':         { ideal: [35, 65], warn: 28,   label: 'Running hip flexion: 35-65° at peak swing' },
    'Left Knee Flexion':         { ideal: [90, 130], warn: 80,  label: 'Peak knee flexion swing: 90-130°' },
    'Right Knee Flexion':        { ideal: [90, 130], warn: 80,  label: 'Peak knee flexion swing: 90-130°' },
    'Left Ankle Dorsiflexion':   { ideal: [10, 25], warn: 5,    label: 'Ankle dorsiflexion at loading: +10 to +25° (from neutral)' },
    'Right Ankle Dorsiflexion':  { ideal: [10, 25], warn: 5,    label: 'Ankle dorsiflexion at loading: +10 to +25° (from neutral)' },
    'Trunk Lean':                { ideal: [5, 15], warn: 20,    label: 'Forward trunk lean: 5-15° from vertical' },
    'Pelvic Drop':               { max: 5, warn: 8,             label: 'Contralateral pelvic drop: <5° (hip abductor strength)' },
    'Left Hip Adduction':        { max: 10, warn: 12,           label: 'Hip adduction: 0-10° normal, >10° = crossover risk (frontal view)' },
    'Right Hip Adduction':       { max: 10, warn: 12,           label: 'Hip adduction: 0-10° normal, >10° = crossover risk (frontal view)' },
    'Left Knee Valgus':          { max: 5, warn: 10,            label: 'Dynamic valgus: <5° (frontal view)' },
    'Right Knee Valgus':         { max: 5, warn: 10,            label: 'Dynamic valgus: <5° (frontal view)' },
    'Left Pronation':            { max: 4, warn: 8,             label: 'Calcaneal eversion: neutral 0-4°, mild 5-10° (posterior view)' },
    'Right Pronation':           { max: 4, warn: 8,             label: 'Calcaneal eversion: neutral 0-4°, mild 5-10° (posterior view)' },
  },
  'Sit to Stand': {
    'Left Hip Flexion':          { ideal: [80, 120], warn: 70,  label: 'STS hip at initiation: 80-120°' },
    'Right Hip Flexion':         { ideal: [80, 120], warn: 70,  label: 'STS hip at initiation: 80-120°' },
    'Left Knee Flexion':         { ideal: [90, 110], warn: 80,  label: 'STS knee at initiation: 90-110°' },
    'Right Knee Flexion':        { ideal: [90, 110], warn: 80,  label: 'STS knee at initiation: 90-110°' },
    'Trunk Lean':                { max: 35, warn: 50,            label: 'Forward trunk lean at initiation: up to 35°' },
  },
  'Overhead Press / Reach': {
    'Left Shoulder Flexion':     { ideal: [150, 180], warn: 130, label: 'Full OH: 150-180°' },
    'Right Shoulder Flexion':    { ideal: [150, 180], warn: 130, label: 'Full OH: 150-180°' },
    'Trunk Lean':                { max: 10, warn: 20,             label: 'Minimal lumbar extension: <10°' },
  },
  'Shoulder Flexion / Abduction': {
    'Left Shoulder Flexion':     { ideal: [150, 180], warn: 130, label: 'Full shoulder flexion: 150-180°' },
    'Right Shoulder Flexion':    { ideal: [150, 180], warn: 130, label: 'Full shoulder flexion: 150-180°' },
    'Left Shoulder Abduction':   { ideal: [150, 180], warn: 130, label: 'Full abduction: 150-180°' },
    'Right Shoulder Abduction':  { ideal: [150, 180], warn: 130, label: 'Full abduction: 150-180°' },
  },
  'Drop Jump Landing': {
    'Left Knee Flexion':         { min: 45, warn: 30,            label: 'Peak landing knee flexion: ≥45° (soft landing), <30° = stiff landing risk' },
    'Right Knee Flexion':        { min: 45, warn: 30,            label: 'Peak landing knee flexion: ≥45° (soft landing), <30° = stiff landing risk' },
    'Left Hip Flexion':          { min: 30, warn: 20,            label: 'Hip flexion at landing: ≥30° reduces knee stress' },
    'Right Hip Flexion':         { min: 30, warn: 20,            label: 'Hip flexion at landing: ≥30° reduces knee stress' },
    'Left Knee Valgus':          { max: 8, warn: 15,             label: 'Dynamic valgus: <8° acceptable, >15° = high ACL risk' },
    'Right Knee Valgus':         { max: 8, warn: 15,             label: 'Dynamic valgus: <8° acceptable, >15° = high ACL risk' },
    'Left Hip Adduction':        { max: 10, warn: 18,            label: 'Hip adduction at landing: <10° normal, >18° = valgus risk' },
    'Right Hip Adduction':       { max: 10, warn: 18,            label: 'Hip adduction at landing: <10° normal, >18° = valgus risk' },
    'Trunk Lean':                { max: 20, warn: 35,            label: 'Forward trunk lean at landing: <20°, >35° = proximal mechanism ACL risk' },
    'Pelvic Drop':               { max: 5, warn: 10,             label: 'Pelvic drop: <5° (hip abductor strength indicator)' },
  },
  'Countermovement Jump': {
    'Left Knee Flexion':         { min: 45, warn: 30,            label: 'Landing knee flexion: ≥45° (soft landing)' },
    'Right Knee Flexion':        { min: 45, warn: 30,            label: 'Landing knee flexion: ≥45° (soft landing)' },
    'Left Hip Flexion':          { min: 30, warn: 20,            label: 'Landing hip flexion: ≥30°' },
    'Right Hip Flexion':         { min: 30, warn: 20,            label: 'Landing hip flexion: ≥30°' },
    'Left Knee Valgus':          { max: 8, warn: 15,             label: 'Dynamic valgus at landing: <8°' },
    'Right Knee Valgus':         { max: 8, warn: 15,             label: 'Dynamic valgus at landing: <8°' },
    'Left Hip Adduction':        { max: 10, warn: 18,            label: 'Hip adduction at landing: <10°' },
    'Right Hip Adduction':       { max: 10, warn: 18,            label: 'Hip adduction at landing: <10°' },
    'Trunk Lean':                { max: 20, warn: 35,            label: 'Trunk lean at landing: <20°' },
    'Pelvic Drop':               { max: 5, warn: 10,             label: 'Pelvic drop: <5°' },
  },
  'Single-Leg Landing': {
    'Left Knee Flexion':         { min: 40, warn: 25,            label: 'Single-leg landing knee flexion: ≥40°' },
    'Right Knee Flexion':        { min: 40, warn: 25,            label: 'Single-leg landing knee flexion: ≥40°' },
    'Left Hip Flexion':          { min: 30, warn: 15,            label: 'Single-leg landing hip flexion: ≥30°' },
    'Right Hip Flexion':         { min: 30, warn: 15,            label: 'Single-leg landing hip flexion: ≥30°' },
    'Left Knee Valgus':          { max: 8, warn: 15,             label: 'Single-leg dynamic valgus: <8°, >15° = high risk' },
    'Right Knee Valgus':         { max: 8, warn: 15,             label: 'Single-leg dynamic valgus: <8°, >15° = high risk' },
    'Left Hip Adduction':        { max: 10, warn: 18,            label: 'Single-leg hip adduction: <10°' },
    'Right Hip Adduction':       { max: 10, warn: 18,            label: 'Single-leg hip adduction: <10°' },
    'Trunk Lean':                { max: 20, warn: 35,            label: 'Trunk lean: <20°, lateral lean away from limb = valgus risk' },
    'Pelvic Drop':               { max: 5, warn: 10,             label: 'Pelvic drop (Trendelenburg): <5°' },
  },
  'Tuck Jump': {
    'Left Knee Flexion':         { min: 45, warn: 30,            label: 'Landing knee flexion: ≥45° — compare rep 1 vs rep 2 for fatigue' },
    'Right Knee Flexion':        { min: 45, warn: 30,            label: 'Landing knee flexion: ≥45°' },
    'Left Knee Valgus':          { max: 8, warn: 15,             label: 'Dynamic valgus: <8°, compare reps for fatigue effect' },
    'Right Knee Valgus':         { max: 8, warn: 15,             label: 'Dynamic valgus: <8°' },
    'Left Hip Adduction':        { max: 10, warn: 18,            label: 'Hip adduction at landing: <10°' },
    'Right Hip Adduction':       { max: 10, warn: 18,            label: 'Hip adduction at landing: <10°' },
    'Trunk Lean':                { max: 20, warn: 35,            label: 'Trunk lean at landing: <20°' },
  },
  'Step Up / Step Down': {
    'Left Knee Flexion':         { ideal: [60, 90], warn: 50,    label: 'Step-up knee: 60-90° at top' },
    'Right Knee Flexion':        { ideal: [60, 90], warn: 50,    label: 'Step-up knee: 60-90° at top' },
    'Left Hip Flexion':          { ideal: [50, 90], warn: 40,    label: 'Step-up hip: 50-90°' },
    'Right Hip Flexion':         { ideal: [50, 90], warn: 40,    label: 'Step-up hip: 50-90°' },
    'Trunk Lean':                { max: 20, warn: 30,             label: 'Trunk lean: <20° preferred' },
    'Pelvic Drop':               { max: 5, warn: 10,             label: 'Pelvic drop: <5° (hip abductor strength)' },
  },
};

function getNormsForMovement(movement: string): Record<string, NormRange> | null {
  if (MOVEMENT_NORMS[movement]) return MOVEMENT_NORMS[movement];
  for (const [key, val] of Object.entries(MOVEMENT_NORMS)) {
    if (movement.toLowerCase().includes(key.toLowerCase().split(' ')[0])) return val;
  }
  return null;
}

// ── Display value selection ───────────────────────────────────────────────────
// Converts stored included angles to clinically meaningful display values.
//
// Running/gait knee flexion: 180 - min (smallest included angle = most bent frame)
// Running/gait hip flexion: max (thigh-from-vertical already, pick peak)
// Landing knee/hip: 180 - min (same convention — peak flexion)
// Landing valgus/adduction/trunk: max (worst-case)
// Shoulder/elbow: max (peak ROM)
// Everything else: avg

const GAIT_USE_MAX   = new Set(['Left Hip Flexion', 'Right Hip Flexion']);
const GAIT_USE_MIN   = new Set(['Left Knee Flexion', 'Right Knee Flexion']);
const LANDING_PEAK_FLEX = new Set(['Left Knee Flexion', 'Right Knee Flexion', 'Left Hip Flexion', 'Right Hip Flexion']);
const LANDING_PEAK_MAX  = new Set([
  'Left Knee Valgus', 'Right Knee Valgus',
  'Left Hip Adduction', 'Right Hip Adduction',
  'Trunk Lean', 'Trunk Lateral Lean', 'Pelvic Drop',
]);

function gaitDisplayVal(jointName: string, stat: AngleStat, movement: string): number {
  const isGait    = /running|gait|walk/i.test(movement);
  const isLanding = /drop jump|countermovement jump|single-leg landing|tuck jump/i.test(movement);

  if (isGait && GAIT_USE_MAX.has(jointName)) return stat.max;
  if (isGait && GAIT_USE_MIN.has(jointName)) return 180 - stat.min;

  if (isLanding && LANDING_PEAK_FLEX.has(jointName)) return 180 - stat.min;
  if (isLanding && LANDING_PEAK_MAX.has(jointName)) return stat.max;

  if (/Shoulder (Flexion|Abduction)|Elbow Flexion/.test(jointName)) return stat.max;

  return stat.avg;
}

// ── Angle lines formatter ─────────────────────────────────────────────────────

const SUPPRESS_LOWER_EX = new Set([
  'Left Knee Flexion', 'Right Knee Flexion', 'Left Knee Extension', 'Right Knee Extension',
  'Left Knee Valgus', 'Right Knee Valgus', 'Left Hip Adduction', 'Right Hip Adduction',
  'Left Ankle Dorsiflexion', 'Right Ankle Dorsiflexion', 'Left Pronation', 'Right Pronation',
]);

function formatAnglesForPrompt(
  aggregated: Record<string, AngleStat>,
  movement: string,
): string {
  const isUpperEx = /shoulder|overhead.*press|overhead.*reach/i.test(movement);

  return Object.entries(aggregated)
    .filter(([k]) => !(isUpperEx && SUPPRESS_LOWER_EX.has(k)))
    .map(([k, v]) => {
      const disp = gaitDisplayVal(k, v, movement);
      const isShoulderOrElbow = /Shoulder (Flexion|Abduction)|Elbow Flexion/.test(k);
      const peakNote = isShoulderOrElbow ? ' [peak ROM]'
        : (disp === v.max || disp === v.min) && disp !== v.avg ? ' [peak]' : '';
      return `${k}: ${disp}° ${peakNote}(range ${v.min}°–${v.max}°)`;
    })
    .join('\n');
}

// ── Limb symmetry index ───────────────────────────────────────────────────────

function formatASI(aggregated: Record<string, AngleStat>, movement: string): string {
  const pairs = [
    { label: 'Knee Flexion',     left: 'Left Knee Flexion',       right: 'Right Knee Flexion',       minMag: 10 },
    { label: 'Hip Flexion',      left: 'Left Hip Flexion',        right: 'Right Hip Flexion',         minMag: 5  },
    { label: 'Ankle DF',         left: 'Left Ankle Dorsiflexion', right: 'Right Ankle Dorsiflexion',  minMag: 5  },
    { label: 'Shoulder Flexion', left: 'Left Shoulder Flexion',   right: 'Right Shoulder Flexion',    minMag: 5  },
  ];

  const lines: string[] = [];
  for (const p of pairs) {
    const L = aggregated[p.left];
    const R = aggregated[p.right];
    if (!L || !R) continue;
    const lDisp = gaitDisplayVal(p.left, L, movement);
    const rDisp = gaitDisplayVal(p.right, R, movement);
    if (Math.min(lDisp, rDisp) < p.minMag) continue; // within noise floor
    const lsi   = Math.round((Math.min(lDisp, rDisp) / Math.max(lDisp, rDisp)) * 100);
    const asym  = Math.round(Math.abs(lDisp - rDisp) / ((lDisp + rDisp) / 2) * 100);
    const flag  = asym < 10 ? 'symmetric' : asym < 15 ? 'monitor' : 'SIGNIFICANT ASYMMETRY';
    lines.push(`  ${p.label}: L=${lDisp}° R=${rDisp}° → LSI ${lsi}% (${asym}% asymmetry — ${flag})`);
  }
  return lines.length ? 'LIMB SYMMETRY INDEX:\n' + lines.join('\n') : '';
}

// ── PROMs formatter ───────────────────────────────────────────────────────────

function formatPROMs(proms: ReportContext['proms']): string {
  const lines: string[] = ['PATIENT REPORTED OUTCOMES:'];
  const { nprs, psfs, lefsTotal, odiScore, lsi } = proms;

  if (nprs?.current != null) {
    let s = `  NPRS Current Pain: ${nprs.current}/10`;
    if (nprs.best  != null) s += `, Best 24h: ${nprs.best}/10`;
    if (nprs.worst != null) s += `, Worst 24h: ${nprs.worst}/10`;
    lines.push(s);
  }

  const filledPsfs = psfs?.filter(p => p.activity.trim() && p.score != null) ?? [];
  if (filledPsfs.length) {
    lines.push('  PSFS (Patient-Specific Function):');
    filledPsfs.forEach(p => lines.push(`    "${p.activity}": ${p.score}/10`));
    const avg = Math.round(filledPsfs.reduce((s, p) => s + (p.score ?? 0), 0) / filledPsfs.length * 10) / 10;
    lines.push(`    Average PSFS: ${avg}/10`);
  }

  if (lefsTotal != null) {
    const interp = lefsTotal >= 65 ? 'Minimal' : lefsTotal >= 50 ? 'Moderate' : 'Severe';
    lines.push(`  LEFS: ${lefsTotal}/80 (${interp} limitation)`);
  }

  if (odiScore != null) {
    const interp = odiScore < 20 ? 'Minimal' : odiScore < 40 ? 'Moderate' : odiScore < 60 ? 'Severe' : 'Crippling';
    lines.push(`  ODI: ${odiScore}% disability (${interp})`);
  }

  if (lsi != null) {
    lines.push(`  Hop Test LSI: ${lsi}% (return-to-sport threshold: ≥90%)`);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

// ── Running context ───────────────────────────────────────────────────────────

function formatRunningContext(running: RunningInputs | undefined, patient: PatientFormData): string {
  if (!running) return '';
  const lines: string[] = [];

  if (running.runningSurface) lines.push(`Running surface: ${running.runningSurface}`);

  const sp = parseFloat(running.treadmillSpeed);
  if (!isNaN(sp) && sp > 0) lines.push(`Treadmill speed: ${sp} ${running.speedUnit}`);

  const inc = parseFloat(running.treadmillIncline);
  if (!isNaN(inc) && inc !== 0) lines.push(`Treadmill incline: ${inc}%`);

  if (running.shoe)       lines.push(`Shoe type: ${running.shoe}`);
  if (running.experience) lines.push(`Running experience: ${running.experience}`);

  const htRaw = parseFloat(patient.patientHeight);
  if (!isNaN(htRaw) && htRaw > 0) {
    const htCm = patient.heightUnit === 'in' ? htRaw * 2.54 : htRaw;
    lines.push(`Patient height: ${Math.round(htCm)}cm (leg length est. ${(htCm * 0.53 / 100).toFixed(2)}m)`);
  }

  if (patient.injuredSide) {
    lines.push(`Symptomatic/injured side: ${patient.injuredSide} — use this to interpret which side is compensating`);
  }

  lines.push(`Video frame rate: ${running.videoFps}fps${running.videoFps < 60 ? ' (GCT/float unreliable at this fps)' : ' (GCT measurement viable)'}`);

  return lines.length ? '\nRUNNING CONTEXT:\n' + lines.map(l => `- ${l}`).join('\n') : '';
}

// ── Jump context ──────────────────────────────────────────────────────────────

function formatJumpContext(jump: JumpInputs | undefined): string {
  if (!jump) return '';
  const lines: string[] = [];

  lines.push(`Video frame rate: ${jump.videoFps}fps${jump.videoFps < 120 ? ' ⚠️ Sub-optimal for landing mechanics — peak valgus may not be captured' : ' ✓ Adequate for landing assessment'}`);

  if (jump.involvedLimb) lines.push(`Involved/post-op limb: ${jump.involvedLimb} — focus LSI comparison on this limb`);
  if (jump.protocol)    lines.push(`Protocol: ${jump.protocol}`);

  if (jump.timePostOp) {
    const context = jump.timePostOp === '3mo' ? 'early rehab phase, high-impact landing not yet expected'
      : jump.timePostOp === '6mo' ? 'intermediate phase, beginning plyometric progression'
      : jump.timePostOp === '9mo' || jump.timePostOp === '12mo' ? 'late-stage return-to-sport assessment'
      : 'return-to-sport maintenance check';
    lines.push(`Time post-op: ${jump.timePostOp} — ${context}`);
  }

  lines.push('ACL LSI thresholds: ≥90% symmetry required for return to sport on all measures (knee flexion, valgus, hop distance)');

  return '\nJUMP/LANDING CONTEXT:\n' + lines.map(l => `- ${l}`).join('\n');
}

// ── Footwear section ──────────────────────────────────────────────────────────

function formatFootwearRequest(
  aggregated: Record<string, AngleStat>,
  running: RunningInputs | undefined,
  movement: string,
): string {
  if (!running?.includeFootwear) return '';
  if (!/running|gait|walk/i.test(movement)) return '';

  const pronL   = aggregated['Left Pronation']?.avg  ?? null;
  const pronR   = aggregated['Right Pronation']?.avg ?? null;
  const hipAddL = aggregated['Left Hip Adduction']?.avg  ?? null;
  const hipAddR = aggregated['Right Hip Adduction']?.avg ?? null;
  const shoe    = running.shoe || 'not specified';

  const dataLines = [
    `Current shoe: ${shoe}`,
    pronL != null ? `Left pronation: ${pronL}° (neutral 0-4°, mild 5-10°, significant >10°)` : null,
    pronR != null ? `Right pronation: ${pronR}°` : null,
    hipAddL != null ? `Left hip adduction (swing): ${hipAddL}° (normal 0-8°, crossover risk >10°)` : null,
    hipAddR != null ? `Right hip adduction (swing): ${hipAddR}°` : null,
  ].filter(Boolean).join('\n  ');

  return `
FOOTWEAR RECOMMENDATION REQUEST:
Based on the following biomechanical data, add a "footwear_recommendation" field to your JSON response with a short clinical footwear recommendation (2-4 sentences). Classify the runner into ONE of these categories and explain why:
  1. NEUTRAL — Good arch control, low pronation, midfoot/forefoot strike → neutral cushioned shoe (e.g. Brooks Ghost, New Balance 1080)
  2. STABILITY — Mild-moderate overpronation, medial collapse risk → medial post or guide rail shoe (e.g. Brooks Adrenaline, ASICS Kayano)
  3. MOTION CONTROL — Significant bilateral overpronation (>10°), flat foot, heavy heel strike → motion control shoe (e.g. Brooks Beast)
  4. MINIMALIST — Strong mechanics, forefoot/midfoot strike, low pronation → low-drop natural shoe
  5. MAXIMALIST — Good mechanics but high impact patterns, heel strike, rehab context → maximalist cushion (e.g. Hoka Clifton)

Biomechanical data for classification:
  ${dataLines}`;
}

// ── Camera view notes ─────────────────────────────────────────────────────────

function cameraViewNote(
  movement: string,
  cameraView: string,
  hasDualView: boolean,
  secondaryCameraView?: string,
  frameCount1?: number,
  frameCount2?: number,
): string {
  if (hasDualView) {
    const n1 = frameCount1 ?? 8;
    const n2 = frameCount2 ?? 8;
    const v2 = secondaryCameraView ?? 'front';
    return `DUAL-PLANE ANALYSIS: Two camera angles were captured. Images 1–${n1} are from the ${cameraView} view; images ${n1 + 1}–${n1 + n2} are from the ${v2} view. Angles have been merged: sagittal-plane measurements (hip/knee flexion, trunk lean) from the most appropriate view, frontal-plane measurements (valgus, pelvic tilt, symmetry) from the other.`;
  }

  const viewLabel = cameraView === 'side' ? 'Side view'
    : cameraView === 'front' ? 'Front view'
    : 'Posterior view';

  const isLanding = /drop jump|countermovement jump|single-leg landing|tuck jump/i.test(movement);
  if (isLanding && cameraView === 'side') {
    return `CAMERA VIEW: ${viewLabel}\n⚠️ SIDE VIEW ONLY — MAJOR LIMITATION: You are missing the most important ACL risk data. Knee valgus, hip adduction, and pelvic drop are ALL frontal-plane measures that cannot be assessed from a side camera. From a side view you can assess: knee flexion, hip flexion, trunk forward lean, and landing timing. Explicitly note this limitation and strongly recommend a frontal/anterior camera view for complete ACL risk screening.`;
  }

  return `CAMERA VIEW: ${viewLabel}`;
}

// ── Movement-specific angle conventions ──────────────────────────────────────

function angleConventions(movement: string, cameraView: string): string {
  const isUpperEx  = /shoulder|overhead.*press|overhead.*reach/i.test(movement);
  const isLanding  = /drop jump|countermovement jump|single-leg landing|tuck jump/i.test(movement);

  const base = `ANGLE MEASUREMENT CONVENTIONS (critical for correct interpretation):
- Hip Flexion/Extension: degrees FROM upright neutral (0° = standing straight). For running/gait, thigh-from-vertical (independent of arm swing). For lifts, shoulder-hip-knee angle corrected to 0°=neutral. Normal running peak hip flexion = 35-65°.
- SIDE VIEW LIMITATION: In side view, only the near leg can be measured reliably in 2D. Far-leg hip/knee values may be suppressed due to foreshortening. The available side's measurement IS valid. For bilateral comparison use posterior/frontal view.
- Knee Flexion: standard included angle. 180° = fully extended, 90° = right angle. Running swing norm = 90-130° peak flexion.
- Ankle Dorsiflexion: degrees FROM neutral (90° raw). Positive = dorsiflexion, negative = plantarflexion. Aggregated from STANCE frames only. Values outside −12° to +35° are likely tracking artefacts. If severely asymmetric (>20° L/R) or deeply plantarflexed (<−15°), flag as UNCONFIRMED and advise clinician to verify against skeleton overlay.
- Trunk Lean: degrees from vertical (0° = perfectly upright). Running norm = 5-15° forward.
- Pelvic Drop: pelvis tilt during single-leg stance from FRONT view. Normal <5°. Values >5° suggest weak hip abductors (Trendelenburg). Only valid from frontal camera.
- Knee Valgus: knee deviation from hip-ankle axis from FRONT view. Normal <5°. Values >10° suggest dynamic valgus collapse. Not reliable from side view.
- Hip Adduction: medial inclination angle of the thigh from vertical during swing (FRONT view). Normal 0-8°. Values >10° indicate crossover gait. Not reliable from side view.
- Shoulder Flexion: arm forward from body. In running side-view, shoulder asymmetry reflects timing — do NOT flag as clinically significant unless front view confirms it.`;

  const upperEx = isUpperEx ? `
⚠️ UPPER EXTREMITY ANGLE CONVENTIONS:
- Shoulder Flexion/Abduction values are PEAK ROM (maximum angle across all frames). A value of 168° = achieved 168° peak — excellent. Normal full flexion = 170-180°.
- Shoulder asymmetry: clinically significant if >15° L/R difference, or LSI <90%.
- Lower extremity data (knee flexion, hip adduction etc.) has been SUPPRESSED — only measures standing posture, not clinically relevant here.
- Hip flexion shown (if any) reflects sagittal trunk/pelvis position, NOT hip ROM — small values (5-20°) are normal for standing upright.` : '';

  const landing = isLanding ? `
⚠️ LANDING MOVEMENT ANGLE CONVENTIONS:
All flexion values are PRE-CONVERTED to clinical flexion angles where 0° = fully extended (straight leg), higher = more bent.
Example: "Knee Flexion = 95°" means the knee bent 95° from full extension — EXCELLENT, well above the ≥45° soft-landing threshold. Do NOT interpret as a raw included angle.
- Knee Flexion (peak): degrees of actual bending. ≥45° = soft landing; ≥90° = deep/controlled. 95° is GOOD.
- Hip Flexion (peak): degrees of hip flexion from neutral. ≥30° = adequate. 60-90° = normal controlled landing.
- Trunk Lean (peak): degrees FORWARD from vertical. 0° = upright. <20° = acceptable; >35° = ACL risk.
- Knee Valgus (peak): degrees of medial knee deviation. 0° = ideal. <8° = acceptable; >15° = high ACL risk.
- Hip Adduction (peak): degrees of medial thigh deviation. <10° = normal; >18° = risk threshold.
STIFF-KNEE LANDING: Only flag if Knee Flexion (peak) < 45°. Values of 80-100° are good.
HIP STRATEGY: Only flag inadequate if Hip Flexion (peak) < 30°. Values of 60-90° = good hip-dominant strategy.` : '';

  const runningKnee = /running|gait|walk/i.test(movement) ? `
- Knee Flexion (RUNNING CONVENTION — CRITICAL): Values are peak swing-phase flexion degrees (0°=straight, higher=more bent). A HIGHER value = MORE flexion = BETTER mechanics. Asymmetry clinically significant only if one side is >15° LOWER (less bent) than the other.` : '';

  const sideLimitation = !isLanding && cameraView === 'side' && /drop|jump|landing/i.test(movement) === false
    ? '' : '';

  return base + upperEx + landing + runningKnee + sideLimitation;
}

// ── Main prompt builder ───────────────────────────────────────────────────────

export function buildReportPrompt(ctx: ReportContext): string {
  const {
    patient, movementType, cameraView, hasDualView, secondaryCameraView,
    focusAreas, aggregated, aggregated2, proms, running, jump, frameCount, frameCount2,
  } = ctx;

  const isLanding  = /drop jump|countermovement jump|single-leg landing|tuck jump/i.test(movementType);
  const isRunning  = /running|gait|walk/i.test(movementType);
  const isUpperEx  = /shoulder|overhead.*press|overhead.*reach/i.test(movementType);

  const focusText  = focusAreas.length ? focusAreas.join(', ') : 'General movement quality and injury risk factors';

  // Merge secondary angles into primary — primary wins on conflict, secondary supplements
  const mergedAggregated: Record<string, AngleStat> = { ...aggregated2, ...aggregated };

  const angleLines = formatAnglesForPrompt(mergedAggregated, movementType);
  const asiText    = formatASI(mergedAggregated, movementType);
  const promsText  = formatPROMs(proms);
  const norms      = getNormsForMovement(movementType);
  const normsText  = norms
    ? Object.entries(norms).map(([joint, ref]) => `  ${joint}: ${ref.label}`).join('\n')
    : 'Standard clinical ranges apply.';

  const camNote      = cameraViewNote(movementType, cameraView, hasDualView, secondaryCameraView, frameCount, frameCount2);
  const conventions  = angleConventions(movementType, cameraView);
  const runCtx       = isRunning ? formatRunningContext(running, patient) : '';
  const jumpCtx      = isLanding ? formatJumpContext(jump) : '';
  const footwearReq  = formatFootwearRequest(mergedAggregated, running, movementType);

  const landingAssessment = isLanding ? `
LANDING MECHANICS ASSESSMENT — ACL RETURN-TO-SPORT CONTEXT:
Key priorities in order of ACL risk:
1. DYNAMIC KNEE VALGUS — primary ACL injury mechanism. Report bilateral knee valgus at initial contact and at peak flexion. >10° = clinically significant; >15° = high risk.
2. KNEE FLEXION AT INITIAL CONTACT — stiff-knee landing (<20° at contact) dramatically increases ACL load.
3. HIP FLEXION AT LANDING — inadequate hip flexion (<30°) shifts load from hip extensors to knee extensors.
4. TRUNK POSITION — forward lean >35° and lateral lean are associated with ACL injury mechanism.
5. LIMB SYMMETRY — for post-op return-to-sport, compare L vs R valgus, flexion, trunk lean. LSI <90% = not yet ready for sport.
6. PELVIC DROP — contralateral drop indicates hip abductor weakness.

Score the movement 1-10 where: 10=excellent mechanics; 7-9=minor technique issues; 4-6=moderate risk requiring intervention; 1-3=significant ACL risk pattern requiring activity modification.` : '';

  const dualViewAdvantage = hasDualView
    ? '\nDUAL-VIEW ADVANTAGE: With two camera angles you can identify frontal-plane issues (pelvic drop, knee valgus, lateral trunk lean, foot progression) that are invisible from a single sagittal view. Use both views actively in your analysis.'
    : '';

  const footwearJsonNote = running?.includeFootwear && isRunning
    ? '\n  "footwear_recommendation": "<2-4 sentence footwear recommendation with shoe category and rationale>",'
    : '';

  const prompt = `You are an expert physical therapist and clinical movement analyst. You are reviewing ${frameCount} annotated frame${frameCount > 1 ? 's' : ''} from a patient movement assessment. Each frame has a MediaPipe skeleton overlay: cyan joints/lines = high confidence, orange joints = estimated position (partially occluded), dashed lines = low confidence segment.

PATIENT: ${patient.patientName}${patient.patientAge ? `, Age ${patient.patientAge}` : ''}${patient.injuredSide ? `, Symptomatic side: ${patient.injuredSide}` : ''}
DIAGNOSIS / CHIEF COMPLAINT: ${patient.diagnosis || 'Not specified'}
MOVEMENT ASSESSED: ${movementType}
${camNote}
CLINICAL FOCUS: ${focusText}
${patient.clinicalNotes ? `CLINICAL NOTES: ${patient.clinicalNotes}` : ''}
${frameCount > 1 ? `FRAMES: ${frameCount} frames targeted to key movement phases rather than evenly spaced — each frame label indicates its phase.` : ''}

${angleLines ? `MEASURED JOINT ANGLES:\n${angleLines}` : ''}

${conventions}
${runCtx}
${jumpCtx}
${asiText ? '\n' + asiText : ''}
${promsText ? '\n' + promsText : ''}
${footwearReq}

MOVEMENT-SPECIFIC NORMS: Use the following reference ranges for ${movementType} when interpreting angles:
${normsText}
${landingAssessment}
${dualViewAdvantage}

Use all available data — skeleton overlays and joint angles — for a precise, data-driven clinical report. Reference specific measurements throughout.

Return ONLY a JSON object (no markdown, no preamble) in exactly this structure:
{
  "score": <integer 1-10>,
  "score_summary": "<one-sentence overall assessment>",
  "findings": [
    { "priority": "high|medium|positive", "title": "<short title>", "detail": "<specific observation referencing measured angles where possible>" }
  ],
  "biomechanical_analysis": "<2-3 paragraph narrative referencing angle measurements, symmetry, movement patterns>",
  "clinical_impressions": "<1-2 paragraph narrative: clinical significance, risk factors, functional implications>",
  "recommendations": ["<specific actionable PT recommendation>"],
  "patient_education": ["<simple patient-facing explanation>"],${footwearJsonNote}
}
Include 3-5 findings, 4-6 recommendations, 2-3 patient education points.${isUpperEx ? ' For upper extremity movements, focus findings on shoulder ROM, symmetry, and trunk compensation — omit lower extremity findings.' : ''}`;

  return prompt;
}
