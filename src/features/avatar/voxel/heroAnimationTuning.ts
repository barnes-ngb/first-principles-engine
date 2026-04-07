export const HERO_ANIMATION_TUNING = {
  // Feet / stance
  stanceWidth: 0.24,
  footSeparation: 0.24,
  footSway: 0.006,
  footCenterLineGap: 0.07,
  footPlantY: 0,

  // Idle arm motion
  armSwingZ: 0.016,
  armSwingX: 0.015,
  armPhaseOffset: Math.PI * 0.42,
  elbowOutBias: 0.27,
  armSwingClampZ: 1.55,
  armSwingClampX: { min: -1.0, max: 0.42 },
  silhouetteBias: {
    leftRotZ: 0.08,
    rightRotZ: 0.11,
  },

  // Procedural guardrails (applied after pose + idle calculations)
  guardrails: {
    armBySide: {
      L: { rotZMin: 0.2, rotZMax: 1.6, rotXMin: -1.0, rotXMax: 0.34 },
      R: { rotZMin: 0.24, rotZMax: 1.7, rotXMin: -0.9, rotXMax: 0.38 },
    },
    elbowInwardCollapseLimit: 0.28,
    torsoSoftCollision: {
      rotXStart: -0.16,
      rotXEnd: 0.36,
      forearmClearance: 0.2,
      handClearance: 0.1,
    },
  },

  // Collision avoidance
  torsoClearance: 0.19,
  torsoAvoidanceGain: 0.62,

  // General character motion
  bodyBobAmplitude: 0.01,
  bodyLateralShift: 0.018,
} as const
