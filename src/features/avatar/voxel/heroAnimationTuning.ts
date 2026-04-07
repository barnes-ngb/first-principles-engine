export const HERO_ANIMATION_TUNING = {
  // Feet / stance
  stanceWidth: 0.2,
  footSeparation: 0.18,
  footSway: 0.008,
  footCenterLineGap: 0.07,
  footPlantY: 0,

  // Idle arm motion
  armSwingZ: 0.02,
  armSwingX: 0.02,
  armPhaseOffset: Math.PI / 3,
  elbowOutBias: 0.22,
  armSwingClampZ: 1.55,
  armSwingClampX: { min: -1.0, max: 0.42 },
  silhouetteBias: {
    leftRotZ: 0.07,
    rightRotZ: 0.1,
  },

  // Procedural guardrails (applied after pose + idle calculations)
  guardrails: {
    armBySide: {
      L: { rotZMin: 0.2, rotZMax: 1.6, rotXMin: -1.0, rotXMax: 0.34 },
      R: { rotZMin: 0.24, rotZMax: 1.7, rotXMin: -0.9, rotXMax: 0.38 },
    },
    elbowInwardCollapseLimit: 0.28,
    torsoSoftCollision: {
      rotXStart: -0.1,
      rotXEnd: 0.42,
      forearmClearance: 0.16,
      handClearance: 0.08,
    },
  },

  // Collision avoidance
  torsoClearance: 0.14,
  torsoAvoidanceGain: 0.48,

  // General character motion
  bodyBobAmplitude: 0.01,
  bodyLateralShift: 0.024,
} as const
