export const HERO_ANIMATION_TUNING = {
  // Feet / stance
  stanceWidth: 0.16,
  footSeparation: 0.14,
  footSway: 0.01,
  footCenterLineGap: 0.05,
  footPlantY: 0,

  // Idle arm motion
  armSwingZ: 0.014,
  armSwingX: 0.015,
  armPhaseOffset: Math.PI / 3,
  elbowOutBias: 0.18,
  armSwingClampZ: 1.55,
  armSwingClampX: { min: -1.0, max: 0.42 },
  silhouetteBias: {
    leftRotZ: 0.04,
    rightRotZ: 0.08,
  },

  // Procedural guardrails (applied after pose + idle calculations)
  guardrails: {
    armBySide: {
      L: { rotZMin: 0.16, rotZMax: 1.6, rotXMin: -1.05, rotXMax: 0.36 },
      R: { rotZMin: 0.2, rotZMax: 1.7, rotXMin: -0.95, rotXMax: 0.4 },
    },
    elbowInwardCollapseLimit: 0.24,
    torsoSoftCollision: {
      rotXStart: -0.1,
      rotXEnd: 0.45,
      forearmClearance: 0.14,
      handClearance: 0.06,
    },
  },

  // Collision avoidance
  torsoClearance: 0.12,
  torsoAvoidanceGain: 0.42,

  // General character motion
  bodyBobAmplitude: 0.012,
  bodyLateralShift: 0.018,
} as const
