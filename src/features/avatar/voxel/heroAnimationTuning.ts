export interface HeroAnimationTuning {
  stanceWidth: number
  footSeparation: number
  footSway: number
  footLift: number
  footCenterLineGap: number
  footPlantY: number

  shoulderSwing: {
    z: number
    x: number
    phaseOffset: number
  }
  torsoTwist: number
  headTurnAmount: number
  emoteIntensity: number

  elbowOutBias: number
  handToTorsoClearance: number

  guardrails: {
    armBySide: {
      L: { rotZMin: number; rotZMax: number; rotXMin: number; rotXMax: number }
      R: { rotZMin: number; rotZMax: number; rotXMin: number; rotXMax: number }
    }
    elbowInwardCollapseLimit: number
    torsoSoftCollision: {
      rotXStart: number
      rotXEnd: number
      forearmClearance: number
      handClearance: number
    }
  }

  silhouetteBias: {
    leftRotZ: number
    rightRotZ: number
  }

  torsoAvoidanceGain: number
  bodyBobAmplitude: number
  bodyLateralShift: number
}

export const HERO_ANIMATION_TUNING: HeroAnimationTuning = {
  // Feet / stance
  stanceWidth: 0.16,
  footSeparation: 0.14,
  footSway: 0.01,
  footLift: 0.004,
  footCenterLineGap: 0.05,
  footPlantY: 0,

  // Idle character motion
  shoulderSwing: {
    z: 0.014,
    x: 0.015,
    phaseOffset: Math.PI / 3,
  },
  torsoTwist: 0.02,
  headTurnAmount: 0.05,
  emoteIntensity: 1,

  // Arm spacing and clipping guardrails
  elbowOutBias: 0.18,
  handToTorsoClearance: 0.12,
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

  silhouetteBias: {
    leftRotZ: 0.04,
    rightRotZ: 0.08,
  },

  torsoAvoidanceGain: 0.42,
  bodyBobAmplitude: 0.012,
  bodyLateralShift: 0.018,
}

export const HERO_DEBUG_TUNING_KEYS = [
  'stanceWidth',
  'footSeparation',
  'footSway',
  'footLift',
  'torsoTwist',
  'shoulderSwing.z',
  'elbowOutBias',
  'handToTorsoClearance',
  'headTurnAmount',
  'emoteIntensity',
] as const

export type HeroDebugTuningKey = (typeof HERO_DEBUG_TUNING_KEYS)[number]
