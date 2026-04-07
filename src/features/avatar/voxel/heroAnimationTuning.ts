export const HERO_ANIMATION_TUNING = {
  // Feet / stance
  stanceWidth: 0.14,
  footSeparation: 0.12,
  footSway: 0.015,
  footPlantY: 0,

  // Idle arm motion
  armSwingZ: 0.018,
  armSwingX: 0.02,
  armPhaseOffset: Math.PI / 3,
  elbowOutBias: 0.14,
  armSwingClampZ: 1.55,
  armSwingClampX: { min: -1.05, max: 0.65 },

  // Collision avoidance
  torsoClearance: 0.12,

  // General character motion
  bodyBobAmplitude: 0.012,
} as const

