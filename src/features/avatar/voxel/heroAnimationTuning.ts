export const HERO_ANIMATION_TUNING = {
  // Feet / stance
  stanceWidth: 0.2,
  footSeparation: 0.18,
  footSway: 0.012,
  footPlantY: 0,

  // Idle arm motion
  armSwingZ: 0.02,
  armSwingX: 0.024,
  armPhaseOffset: Math.PI / 3,
  elbowOutBias: 0.2,
  armSwingClampZ: 1.55,
  armSwingClampX: { min: -1.0, max: 0.36 },

  // Collision avoidance
  torsoClearance: 0.14,
  torsoAvoidanceGain: 0.5,

  // General character motion
  bodyBobAmplitude: 0.012,
  bodyLateralShift: 0.014,
  chestYaw: 0.032,
  chestRoll: 0.018,
  shoulderDip: 0.04,
  headYaw: 0.06,
  headPitch: 0.022,
} as const
