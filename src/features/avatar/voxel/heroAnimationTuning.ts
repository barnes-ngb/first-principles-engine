export const HERO_ANIMATION_TUNING = {
  // Feet / stance
  stanceWidth: 0.18,
  footSeparation: 0.2,
  footVisualClearance: 0.04,
  footSway: 0.008,
  footPhaseOffset: Math.PI,
  footCenterLineGap: 0.06,
  footPlantY: 0,

  // Idle arm motion
  armSwingZ: 0.01,
  armSwingX: 0.012,
  armPhaseOffset: Math.PI / 2.5,
  elbowOutBias: 0.22,
  armSwingClampZ: 1.55,
  armSwingClampX: { min: -0.95, max: 0.3 },
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
      forwardRotXStart: 0.05,
      forwardRotXEnd: 0.55,
      forearmClearance: 0.16,
      handClearance: 0.08,
    },
  },

  // Collision avoidance
  torsoClearance: 0.14,
  torsoAvoidanceGain: 0.48,

  // General character motion
  bodyBobAmplitude: 0.01,
  bodyLateralShift: 0.012,
} as const
