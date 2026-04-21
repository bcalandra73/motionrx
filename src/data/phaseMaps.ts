export interface PhaseEntry {
  id: string;
  label: string;
  time: number; // proportional position in video (0–1)
  desc: string;
}

export const PHASE_MAPS: Record<string, PhaseEntry[]> = {
  'Hip Hinge / Deadlift Pattern': [
    { id: 'setup',    label: 'Setup',     time: 0.04, desc: 'Starting position' },
    { id: 'liftoff',  label: 'Liftoff',   time: 0.20, desc: 'Bar leaving floor' },
    { id: 'midpull',  label: 'Mid-Pull',  time: 0.38, desc: 'Knees nearly straight, hips still low' },
    { id: 'lockout',  label: 'Lockout',   time: 0.52, desc: 'Full hip extension' },
    { id: 'descent1', label: 'Descent',   time: 0.68, desc: 'Hinging back down — hip break' },
    { id: 'descent2', label: 'Lower',     time: 0.84, desc: 'Bar returning to floor' },
  ],
  'Squat (Double-Leg)': [
    { id: 'stance',  label: 'Standing', time: 0.04, desc: 'Starting position' },
    { id: 'descent', label: 'Descent',  time: 0.22, desc: 'Initiating descent' },
    { id: 'bottom',  label: 'Bottom',   time: 0.48, desc: 'Deepest point' },
    { id: 'ascent1', label: 'Ascent',   time: 0.68, desc: 'Rising — hip drive' },
    { id: 'ascent2', label: 'Return',   time: 0.88, desc: 'Returning to standing' },
  ],
  'Single-Leg Squat': [
    { id: 'stance',  label: 'Standing', time: 0.04, desc: 'Start' },
    { id: 'descent', label: 'Descent',  time: 0.25, desc: 'Lowering' },
    { id: 'bottom',  label: 'Bottom',   time: 0.50, desc: 'Deepest point' },
    { id: 'ascent',  label: 'Return',   time: 0.80, desc: 'Return to stand' },
  ],
  'Lunge': [
    { id: 'stance',  label: 'Start',    time: 0.04, desc: 'Standing' },
    { id: 'descent', label: 'Step Out', time: 0.28, desc: 'Stepping forward' },
    { id: 'bottom',  label: 'Bottom',   time: 0.50, desc: 'Deepest lunge' },
    { id: 'ascent',  label: 'Return',   time: 0.80, desc: 'Returning to start' },
  ],
  'Gait / Walking': [
    { id: 'contact',    label: 'Heel Strike',     time: 0.04, desc: 'Initial contact, heel loading' },
    { id: 'loading',    label: 'Loading',         time: 0.14, desc: 'Weight acceptance, knee flexion' },
    { id: 'midstance',  label: 'Mid Stance',      time: 0.28, desc: 'Single limb support, peak load' },
    { id: 'terminal',   label: 'Terminal Stance', time: 0.42, desc: 'Heel rise, propulsion phase' },
    { id: 'toeoff',     label: 'Toe Off',         time: 0.54, desc: 'Stance limb leaving ground' },
    { id: 'earlyswing', label: 'Early Swing',     time: 0.66, desc: 'Limb clearance, hip flexing' },
    { id: 'midswing',   label: 'Mid Swing',       time: 0.78, desc: 'Max hip flexion, foot clearing' },
    { id: 'lateswing',  label: 'Late Swing',      time: 0.92, desc: 'Deceleration, foot descent' },
  ],
  'Running': [
    { id: 'contact',    label: 'Initial Contact',  time: 0.04, desc: '0% stride — foot strike, braking phase begins' },
    { id: 'loading',    label: 'Loading Response', time: 0.15, desc: '~7% stride — foot flat, impact absorbed' },
    { id: 'midstance',  label: 'Mid Stance',       time: 0.25, desc: '~20% stride — ankle under hip, single limb support' },
    { id: 'propulsion', label: 'Propulsion',       time: 0.38, desc: '~35% stride — heel rise, ankle push-off' },
    { id: 'toeoff',     label: 'Toe Off',          time: 0.50, desc: '~41% stride — terminal stance, foot leaves ground' },
    { id: 'earlyswing', label: 'Early Swing',      time: 0.62, desc: '~55% stride — limb clearance, hip flexing' },
    { id: 'midswing',   label: 'Mid Swing',        time: 0.76, desc: '~75% stride — peak knee flexion' },
    { id: 'lateswing',  label: 'Late Swing',       time: 0.92, desc: '~90% stride — knee extending, foot descending' },
  ],
  'Sit to Stand': [
    { id: 'setup',   label: 'Seated',   time: 0.05, desc: 'Starting position' },
    { id: 'descent', label: 'Lean',     time: 0.30, desc: 'Forward trunk lean' },
    { id: 'liftoff', label: 'Liftoff',  time: 0.55, desc: 'Seat departure' },
    { id: 'lockout', label: 'Standing', time: 0.90, desc: 'Full extension' },
  ],
  'Step Up / Step Down': [
    { id: 'stance',  label: 'Start',     time: 0.04, desc: 'Standing at step' },
    { id: 'liftoff', label: 'Step Up',   time: 0.28, desc: 'Leading foot on step' },
    { id: 'midpull', label: 'Top',       time: 0.52, desc: 'Both feet on step' },
    { id: 'descent', label: 'Step Down', time: 0.76, desc: 'Trailing foot descending' },
  ],
  'Drop Jump Landing': [
    { id: 'approach', label: 'Pre-Land',       time: 0.08, desc: 'Airborne — approaching ground' },
    { id: 'contact',  label: 'Initial Contact', time: 0.25, desc: 'Feet touch ground — critical valgus assessment frame' },
    { id: 'loading',  label: 'Loading',         time: 0.38, desc: 'Weight acceptance — knee/hip flexing' },
    { id: 'bottom',   label: 'Peak Flexion',    time: 0.52, desc: 'Maximum knee flexion — highest ACL load' },
    { id: 'ascent',   label: 'Stabilization',   time: 0.72, desc: 'Absorbing and stabilizing' },
    { id: 'lockout',  label: 'Recovery',        time: 0.90, desc: 'Return toward upright' },
  ],
  'Countermovement Jump': [
    { id: 'stance',  label: 'Standing',        time: 0.04, desc: 'Initial upright position' },
    { id: 'descent', label: 'Countermovement', time: 0.22, desc: 'Quick descent — hip/knee/ankle flexing' },
    { id: 'bottom',  label: 'Bottom',          time: 0.35, desc: 'Lowest point — maximum countermovement depth' },
    { id: 'ascent1', label: 'Takeoff Drive',   time: 0.46, desc: 'Explosive triple extension' },
    { id: 'flight',  label: 'Flight',          time: 0.58, desc: 'Airborne — maximum height' },
    { id: 'contact', label: 'Landing Contact', time: 0.72, desc: 'Feet return to ground — landing mechanics' },
    { id: 'loading', label: 'Landing Load',    time: 0.82, desc: 'Weight acceptance on landing' },
    { id: 'lockout', label: 'Stabilization',   time: 0.93, desc: 'Landing stabilized' },
  ],
  'Single-Leg Landing': [
    { id: 'approach', label: 'Pre-Land',        time: 0.10, desc: 'Airborne on single leg' },
    { id: 'contact',  label: 'Initial Contact', time: 0.28, desc: 'Foot touches ground — valgus assessment frame' },
    { id: 'loading',  label: 'Loading',         time: 0.42, desc: 'Single-leg weight acceptance' },
    { id: 'bottom',   label: 'Peak Flexion',    time: 0.58, desc: 'Maximum single-leg knee flexion — ACL load peak' },
    { id: 'lockout',  label: 'Stabilization',   time: 0.82, desc: 'Stick landing — hold position' },
  ],
  'Tuck Jump': [
    { id: 'stance',   label: 'Standing', time: 0.04, desc: 'Starting position' },
    { id: 'descent',  label: 'Dip',      time: 0.15, desc: 'Brief countermovement' },
    { id: 'flight',   label: 'Tuck',     time: 0.30, desc: 'Airborne — knees pulled toward chest' },
    { id: 'contact',  label: 'Landing 1', time: 0.45, desc: 'First landing — initial valgus assessment' },
    { id: 'loading',  label: 'Loading 1', time: 0.52, desc: 'Weight acceptance — rep 1' },
    { id: 'descent2', label: 'Dip 2',    time: 0.62, desc: 'Immediate re-jump' },
    { id: 'flight2',  label: 'Tuck 2',   time: 0.75, desc: 'Second tuck — assessing fatigue effect' },
    { id: 'contact2', label: 'Landing 2', time: 0.88, desc: 'Second landing — fatigue comparison frame' },
  ],
  'Overhead Press / Reach': [
    { id: 'start',   label: 'Start',    time: 0.05, desc: 'Ready position' },
    { id: 'midway',  label: 'Mid',      time: 0.35, desc: 'Midpoint of press' },
    { id: 'lockout', label: 'Lockout',  time: 0.60, desc: 'Full overhead extension' },
    { id: 'return',  label: 'Return',   time: 0.88, desc: 'Lowering back to start' },
  ],
};

export const LANDING_MOVEMENTS = new Set([
  'Drop Jump Landing',
  'Countermovement Jump',
  'Single-Leg Landing',
  'Tuck Jump',
]);

export const DENSE_FRAME_MOVEMENTS = new Set(['Gait / Walking', 'Running']);
