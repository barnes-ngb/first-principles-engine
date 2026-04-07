export interface HeroAnimationTuning {
  // Feet / stance
  stanceWidth: number
  footSeparation: number
  footSway: number
  footLift: number
  footCenterLineGap: number
  footPlantY: number
  emoteFootSeparationMultiplier: number

  // Idle body language
  torsoTwist: number
  shoulderSwing: number
  headTurnAmount: number

  // Idle arm motion
  armSwingZ: number
  armSwingX: number
  armPhaseOffset: number
  elbowOutBias: number
  armSwingClampZ: number
  armSwingClampX: { min: number; max: number }
  silhouetteBias: {
    leftRotZ: number
    rightRotZ: number
  }
  postPoseArmClearanceBoost: number
  postPoseClearanceDurationSec: number

  // Procedural guardrails (applied after pose + idle calculations)
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

  // Collision avoidance
  torsoClearance: number
  torsoAvoidanceGain: number

  // General character motion
  bodyBobAmplitude: number
  bodyLateralShift: number

  // Emote/expression shaping
  emoteIntensity: number
}

export const HERO_ANIMATION_TUNING_DEFAULTS: HeroAnimationTuning = {
  // Feet / stance
  stanceWidth: 0.28,
  footSeparation: 0.24,
  footSway: 0.003,
  footLift: 0.003,
  footCenterLineGap: 0.1,
  footPlantY: 0,
  emoteFootSeparationMultiplier: 1.18,

  // Idle body language (stable, heroic read)
  torsoTwist: 0.026,
  shoulderSwing: 0.9,
  headTurnAmount: 0.05,

  // Idle arm motion
  armSwingZ: 0.014,
  armSwingX: 0.016,
  armPhaseOffset: Math.PI * 0.62,
  elbowOutBias: 0.33,
  armSwingClampZ: 1.55,
  armSwingClampX: { min: -1.0, max: 0.42 },
  silhouetteBias: {
    leftRotZ: 0.12,
    rightRotZ: 0.18,
  },
  postPoseArmClearanceBoost: 0.12,
  postPoseClearanceDurationSec: 0.65,

  // Procedural guardrails (applied after pose + idle calculations)
  guardrails: {
    armBySide: {
      L: { rotZMin: 0.32, rotZMax: 1.7, rotXMin: -1.0, rotXMax: 0.34 },
      R: { rotZMin: 0.36, rotZMax: 1.78, rotXMin: -0.9, rotXMax: 0.38 },
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
  torsoClearance: 0.22,
  torsoAvoidanceGain: 0.52,

  // General character motion
  bodyBobAmplitude: 0.008,
  bodyLateralShift: 0.015,

  // Emote/expression shaping
  emoteIntensity: 1,
}

export const HERO_ANIMATION_TUNING = HERO_ANIMATION_TUNING_DEFAULTS

export type HeroAnimationTuningOverride = Partial<
  Pick<HeroAnimationTuning,
    | 'stanceWidth'
    | 'footSeparation'
    | 'footSway'
    | 'footLift'
    | 'armSwingX'
    | 'armSwingZ'
    | 'torsoTwist'
    | 'shoulderSwing'
    | 'elbowOutBias'
    | 'torsoClearance'
    | 'headTurnAmount'
    | 'emoteIntensity'
  >
>

export interface HeroAnimationControlDef {
  key: keyof HeroAnimationTuningOverride
  label: string
  min: number
  max: number
  step: number
  help: string
}

export const HERO_ANIMATION_CONTROL_DEFS: HeroAnimationControlDef[] = [
  { key: 'stanceWidth', label: 'Stance width', min: 0.14, max: 0.32, step: 0.005, help: 'Primary idle leg width.' },
  { key: 'footSeparation', label: 'Foot spacing min', min: 0.14, max: 0.28, step: 0.005, help: 'Hard minimum distance between feet.' },
  { key: 'footLift', label: 'Foot lift', min: 0, max: 0.02, step: 0.001, help: 'Vertical idle bounce at each foot.' },
  { key: 'footSway', label: 'Foot sway', min: 0, max: 0.03, step: 0.001, help: 'Horizontal in/out sway per idle cycle.' },
  { key: 'armSwingX', label: 'Arm swing X', min: 0.004, max: 0.04, step: 0.001, help: 'Forward/back idle arm arc size.' },
  { key: 'armSwingZ', label: 'Arm swing Z', min: 0.004, max: 0.04, step: 0.001, help: 'Outward arm sweep size (silhouette).' },
  { key: 'torsoTwist', label: 'Torso twist', min: 0, max: 0.08, step: 0.002, help: 'Yaw sweep through idle loop.' },
  { key: 'shoulderSwing', label: 'Shoulder swing', min: 0, max: 1.8, step: 0.05, help: 'Multiplier for shoulder + arm idle arcs.' },
  { key: 'elbowOutBias', label: 'Elbow-out bias', min: 0.15, max: 0.4, step: 0.01, help: 'Forces outward arm silhouette.' },
  { key: 'torsoClearance', label: 'Hand→torso clearance', min: 0.1, max: 0.28, step: 0.01, help: 'Minimum arm clearance from body core.' },
  { key: 'headTurnAmount', label: 'Head turn amount', min: 0.02, max: 0.12, step: 0.002, help: 'Idle side-to-side head look.' },
  { key: 'emoteIntensity', label: 'Emote intensity', min: 0.7, max: 1.35, step: 0.01, help: 'Scales facial expression strength.' },
]

export const HERO_ANIMATION_PRIMARY_CONSTANTS = {
  stanceWidth: 'stanceWidth',
  footSeparation: 'footSeparation',
  armSwing: ['armSwingX', 'armSwingZ'],
  elbowAngle: 'elbowOutBias',
  torsoClearance: 'torsoClearance',
} as const

export function resolveHeroAnimationTuning(overrides?: HeroAnimationTuningOverride): HeroAnimationTuning {
  return {
    ...HERO_ANIMATION_TUNING_DEFAULTS,
    ...(overrides ?? {}),
  }
}

export const HERO_ANIMATION_COLLISION_NOTES = {
  footCollision: ['stanceWidth', 'footSeparation', 'footSway', 'footLift'] as const,
  armClipping: ['elbowOutBias', 'torsoClearance', 'shoulderSwing'] as const,
}
