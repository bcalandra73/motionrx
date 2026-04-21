interface GuideTip {
  icon: string;
  title: string;
  desc: string;
}

interface CameraGuide {
  title: string;
  sub: string;
  tips: GuideTip[];
}

export const CAMERA_GUIDES: Record<string, CameraGuide> = {
  'Hip Hinge / Deadlift Pattern': {
    title: 'Deadlift Camera Setup',
    sub: 'Side view gives the most accurate hip hinge and bar path data.',
    tips: [
      { icon: '📐', title: 'Camera angle: strict 90° side view', desc: 'Position camera perpendicular to the lifter. Even 15° of rotation significantly distorts hip/knee angles.' },
      { icon: '📏', title: 'Camera height: mid-thigh to hip level', desc: 'Align lens with approximately the bar height at setup — this captures the full kinetic chain without distortion.' },
      { icon: '🎽', title: 'Clothing: fitted, contrasting color', desc: 'Avoid baggy shorts. Bright top / dark bottom helps MediaPipe distinguish trunk from leg. Joint stickers on hip and knee dramatically improve accuracy.' },
      { icon: '💡', title: 'Lighting: consistent, avoid backlight', desc: 'Side windows behind the lifter cause silhouetting. Front or overhead lighting is ideal.' },
      { icon: '📱', title: 'Capture the full lift + 1 second each side', desc: 'Start recording before setup and stop after returning to standing. Capture at 60fps if possible.' },
    ],
  },
  'Squat (Double-Leg)': {
    title: 'Squat Camera Setup',
    sub: 'Side view for sagittal mechanics; add frontal for valgus assessment.',
    tips: [
      { icon: '📐', title: 'Side view: 90° perpendicular', desc: 'Essential for knee and hip flexion angles. Stand camera at knee-to-hip height.' },
      { icon: '➕', title: 'Add frontal view for knee valgus', desc: 'A second recording from the front captures medial knee collapse that side view misses entirely.' },
      { icon: '🎽', title: 'Shorts above the knee', desc: 'Knee joint must be visible. Kneecap position and tibial angle are critical for squat assessment.' },
      { icon: '👟', title: 'Capture footwear', desc: 'Heel lift or flat shoe changes ankle dorsiflexion demands significantly — include feet in frame.' },
      { icon: '📏', title: 'Full body in frame', desc: 'Ensure head through feet are all visible. Cropping changes landmark confidence.' },
    ],
  },
  'Gait / Walking': {
    title: 'Gait Analysis Camera Setup',
    sub: '3-4 metres of walking in frame gives the best full cycle capture.',
    tips: [
      { icon: '📐', title: 'True lateral view, camera stationary', desc: 'Do not pan with the patient. Camera should be still and capture 3-4 full steps in frame.' },
      { icon: '📏', title: 'Camera at greater trochanter height', desc: 'Hip-level camera minimises perspective distortion of knee and ankle angles.' },
      { icon: '👣', title: 'Capture at least 3 full gait cycles', desc: 'Upload 3-4 seconds of continuous walking. More cycles = better phase detection.' },
      { icon: '🎽', title: 'Shorts and close-fitting top', desc: 'Belt line, greater trochanter, knee centre, and lateral malleolus should all be clearly visible.' },
      { icon: '📏', title: 'Even surface, no incline', desc: 'Inclined surfaces alter all joint angles systematically and confound the norms.' },
    ],
  },
  'Running': {
    title: 'Running Analysis Camera Setup',
    sub: 'Treadmill side view gives the most consistent running gait data.',
    tips: [
      { icon: '🏃', title: 'Capture a full gait cycle (min 2 seconds)', desc: 'Running cycle = ~0.5–0.7s at typical pace. Capture at least 3 full cycles so phase detection can find initial contact and toe-off reliably.' },
      { icon: '📐', title: 'Strict lateral view — 90° perpendicular to treadmill', desc: 'Even 10° of rotation significantly distorts hip and knee flexion angles. Position camera at treadmill midpoint.' },
      { icon: '📏', title: 'Camera at hip height (~1m from ground)', desc: 'Aligns lens with the centre of mass. Too high distorts ankle angles; too low misses hip extension.' },
      { icon: '📱', title: '60fps strongly recommended', desc: 'Running limb velocity is 3-5× walking. At 30fps, foot-strike frames are often missed entirely. 60fps or 120fps captures contact and toe-off accurately.' },
      { icon: '💡', title: 'Bright, even lighting — avoid treadmill backlighting', desc: 'Fluorescent gym lighting can cause flicker artefacts. Position camera so the runner is lit from the front or side, not silhouetted against a window.' },
      { icon: '🎽', title: 'Fitted clothing, no loose shorts', desc: 'Knee joint must be visible throughout swing. Bright shoes help ankle tracking. Consider kinesiology tape on lateral knee and malleolus.' },
      { icon: '➕', title: 'Add posterior view for pelvic drop & crossover', desc: 'A second video from directly behind captures contralateral pelvic drop (Trendelenburg), foot crossover, and arm swing asymmetry that side view cannot assess.' },
    ],
  },
  'Drop Jump Landing': {
    title: 'Drop Jump Landing — Camera Setup',
    sub: '120-240fps slow-motion is essential. Landing happens in 40-100ms — standard 30fps captures only 1-3 frames.',
    tips: [
      { icon: '🎬', title: 'SLOW MOTION IS CRITICAL (120-240fps)', desc: 'iPhone: Camera → Video → set to 120fps or 240fps. Samsung: Pro Video → 120fps. At 30fps the peak valgus frame is almost certainly missed.' },
      { icon: '📐', title: 'Dual-plane setup: side view + frontal view', desc: 'Side view captures knee flexion, hip flexion, and trunk lean. Frontal/posterior captures knee valgus — the primary ACL risk factor. Upload both for a complete assessment.' },
      { icon: '📏', title: 'Camera at knee height, 6-10 feet away', desc: 'Knee-level camera on a tripod minimises distortion. Valgus angle is dramatically affected by camera height — consistent positioning is essential for serial assessments.' },
      { icon: '📦', title: 'Box height 30-45cm (12-18in) for standard DVJ', desc: 'Standard drop jump protocol: step off box (do not jump up), land on both feet, immediately jump as high as possible. Film the landing phase.' },
      { icon: '🎽', title: 'Tight shorts, tape knee centre if needed', desc: 'Knee patella centre, tibial tuberosity, and ASIS should be visible. Bright knee-height socks or tape on lateral malleolus improves ankle tracking.' },
    ],
  },
  'Countermovement Jump': {
    title: 'Countermovement Jump — Camera Setup',
    sub: 'Capture the full jump including landing. 120fps recommended for landing mechanics; 30fps acceptable for takeoff analysis only.',
    tips: [
      { icon: '🎬', title: '120fps minimum for landing assessment', desc: 'If landing mechanics are the clinical focus, slow-motion is required. 30fps can assess countermovement depth and takeoff symmetry but will miss peak valgus on landing.' },
      { icon: '📐', title: 'Side view for power/depth, frontal for valgus', desc: 'Side view: countermovement depth, trunk angle, triple extension quality. Frontal/posterior: bilateral symmetry, valgus on landing, pelvic drop.' },
      { icon: '📏', title: 'Camera at hip height, arms-length stable', desc: 'Full body must be in frame including full jump height. Step back 8-10 feet. Hip-level camera preferred for landing mechanics.' },
      { icon: '🔄', title: 'Perform 3 attempts, film best 2', desc: 'Bilateral LSI is most reliable with 3 trials. For post-op, compare operated vs non-operated limb knee flexion at landing as a simple screen.' },
      { icon: '🎽', title: 'Arms in frame for arm-swing assessment', desc: 'CMJ arm swing is a predictor of jump height and motor control. Ensure arms are visible throughout.' },
    ],
  },
  'Single-Leg Landing': {
    title: 'Single-Leg Landing (Hop & Stick) — Camera Setup',
    sub: 'The most sensitive unilateral ACL return-to-sport screen. 120-240fps strongly recommended.',
    tips: [
      { icon: '🎬', title: '240fps ideal, 120fps minimum', desc: 'Single-leg landing peak valgus occurs within the first 40ms of contact — essentially invisible at 30fps. This test is clinically meaningless without slow-motion video.' },
      { icon: '📐', title: 'Frontal camera is the PRIMARY view for this test', desc: 'Knee valgus, hip adduction, and trunk lateral lean are the three key ACL risk factors in unilateral landing. All are frontal-plane measures. Add a side view secondarily for knee/hip flexion.' },
      { icon: '📏', title: 'Hop distance: standardise to 40cm or leg-length', desc: 'Mark landing zone on floor with tape. Consistent hop distance enables serial comparisons. Video should capture both takeoff and landing.' },
      { icon: '🦵', title: 'Test operated limb first to avoid fatigue bias', desc: 'For post-op ACL, always assess the involved limb before the uninvolved. Fatigue increases valgus collapse.' },
      { icon: '🎯', title: 'Stick landing: hold for 3 seconds', desc: 'Patient must hold the landing position for 3 seconds. This differentiates strategy selection (controlled) from reactive landing (reflexive ACL loading).' },
    ],
  },
  'Tuck Jump': {
    title: 'Tuck Jump — Camera Setup',
    sub: 'Bilateral fatigue test. Capture 10 consecutive jumps. Compares landing mechanics early vs late to identify fatigue-related valgus breakdown.',
    tips: [
      { icon: '🎬', title: '120fps minimum — capture all 10 repetitions', desc: 'Film the full 10-jump sequence. The clinical purpose is detecting mechanics degradation across reps. Most protocols compare rep 1-2 vs rep 9-10.' },
      { icon: '📐', title: 'Frontal/anterior camera for primary view', desc: 'Knee valgus and bilateral symmetry are the key measures. A frontal camera captures both knees simultaneously for real-time comparison across reps.' },
      { icon: '📏', title: 'Camera at knee height, 8 feet away', desc: 'Patient should jump in place. Mark a small tape square on the floor to maintain position. Camera stays stationary throughout.' },
      { icon: '⏱', title: '10 jumps as fast as possible', desc: 'Standard Tuck Jump Assessment protocol: jump as high as possible with maximum tuck (knees to chest) on every rep. No pause between jumps.' },
      { icon: '👁', title: 'Watch for these fatigue signs', desc: 'Increasing knee valgus across reps, reduced tuck height, forward trunk collapse, and landing with wider/narrower base are all ACL risk indicators.' },
    ],
  },
  '_default': {
    title: 'Camera Setup Tips',
    sub: 'General guidelines for best joint tracking accuracy.',
    tips: [
      { icon: '📐', title: 'Side view (sagittal plane) as default', desc: '90° perpendicular to movement direction gives the most accurate joint angle measurements.' },
      { icon: '💡', title: 'Consistent, front-facing lighting', desc: 'Avoid backlighting. Natural light or overhead LED is ideal.' },
      { icon: '🎽', title: 'Fitted, contrasting clothing', desc: 'Loose clothing obscures joint positions. Bright top / dark bottoms or vice versa improves detection.' },
      { icon: '📱', title: 'Stable camera, 60fps if available', desc: 'Use a tripod or prop your phone. Higher frame rates improve phase detection.' },
      { icon: '📏', title: 'Full body in frame with margin', desc: 'All joints head-to-toe should be visible with some space around the body.' },
    ],
  },
};
