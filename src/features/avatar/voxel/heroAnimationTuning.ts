export const HERO_ANIMATION_TUNING = {
  // Feet / stance
  stanceWidth: 0.2,
  stanceWidthMin: 0.16,
  stanceWidthMax: 0.3,
  footSeparation: 0.18, // edge-to-edge clearance between boots
  footSway: 0.008,
  footPhaseOffset: Math.PI / 2.5,
  footPlantY: 0,

  // Idle arm motion
  armSwingZ: 0.01,
  armSwingX: 0.01,
  armPhaseOffset: Math.PI / 2,
  elbowOutBias: 0.22,
  armSwingClampZ: 1.5,
  armSwingClampX: { min: -1.0, max: 0.24 },

  // Collision avoidance
  torsoClearance: 0.14,
  torsoAvoidanceGain: 0.55,
  torsoAvoidanceMax: 0.24,

  // General character motion
  bodyBobAmplitude: 0.01,
  bodyLateralShift: 0.012,
} as const
