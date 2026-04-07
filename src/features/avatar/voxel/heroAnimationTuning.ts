export const HERO_ANIMATION_TUNING = {
  // Feet / stance
  stanceWidth: 0.16,
  footSeparation: 0.14,
  footSway: 0.01,
  footPlantY: 0,

  // Idle arm motion
  armSwingZ: 0.014,
  armSwingX: 0.015,
  armPhaseOffset: Math.PI / 3,
  elbowOutBias: 0.18,
  armSwingClampZ: 1.55,
  armSwingClampX: { min: -1.0, max: 0.42 },

  // Collision avoidance
  torsoClearance: 0.12,
  torsoAvoidanceGain: 0.42,

  // General character motion
  bodyBobAmplitude: 0.012,
  bodyLateralShift: 0.018,
} as const
