export interface HeroAnimationConfig {
  stanceWidth: number
  footSeparationMin: number
  footLift: number
  footSway: number
  footPlantY: number
  torsoTwist: number
  shoulderSwing: number
  shoulderSwingForward: number
  armPhaseOffset: number
  elbowOutBias: number
  handToTorsoClearance: number
  torsoAvoidanceGain: number
  armSwingClampZ: number
  armSwingClampX: { min: number; max: number }
  headTurnAmount: number
  emoteIntensity: number
  bodyBobAmplitude: number
  bodyLateralShift: number
}

export const HERO_ANIMATION_DEFAULTS: HeroAnimationConfig = {
  // Feet / stance
  stanceWidth: 0.16,
  footSeparationMin: 0.14,
  footLift: 0.006,
  footSway: 0.01,
  footPlantY: 0,

  // Upper body readability
  torsoTwist: 0.025,
  shoulderSwing: 0.014,
  shoulderSwingForward: 0.015,
  armPhaseOffset: Math.PI / 3,

  // Collision avoidance
  elbowOutBias: 0.18,
  handToTorsoClearance: 0.12,
  torsoAvoidanceGain: 0.42,
  armSwingClampZ: 1.55,
  armSwingClampX: { min: -1.0, max: 0.42 },

  // Head + expression
  headTurnAmount: 0.05,
  emoteIntensity: 0.9,

  // General character motion
  bodyBobAmplitude: 0.012,
  bodyLateralShift: 0.018,
}

export interface HeroAnimationDebugControl {
  key: 'stanceWidth'
  | 'footSeparationMin'
  | 'footLift'
  | 'footSway'
  | 'torsoTwist'
  | 'shoulderSwing'
  | 'elbowOutBias'
  | 'handToTorsoClearance'
  | 'headTurnAmount'
  | 'emoteIntensity'
  label: string
  min: number
  max: number
  step: number
}

export const HERO_ANIMATION_DEBUG_CONTROLS: HeroAnimationDebugControl[] = [
  { key: 'stanceWidth', label: 'Stance Width', min: 0.12, max: 0.28, step: 0.005 },
  { key: 'footSeparationMin', label: 'Foot Spacing Min', min: 0.1, max: 0.24, step: 0.005 },
  { key: 'footLift', label: 'Foot Lift', min: 0, max: 0.03, step: 0.001 },
  { key: 'footSway', label: 'Foot Sway', min: 0, max: 0.03, step: 0.001 },
  { key: 'torsoTwist', label: 'Torso Twist', min: 0, max: 0.08, step: 0.002 },
  { key: 'shoulderSwing', label: 'Shoulder Swing', min: 0, max: 0.04, step: 0.001 },
  { key: 'elbowOutBias', label: 'Elbow-Out Bias', min: 0.08, max: 0.3, step: 0.005 },
  { key: 'handToTorsoClearance', label: 'Hand-to-Torso Clearance', min: 0.08, max: 0.25, step: 0.005 },
  { key: 'headTurnAmount', label: 'Head Turn', min: 0, max: 0.12, step: 0.002 },
  { key: 'emoteIntensity', label: 'Emote Intensity', min: 0.65, max: 1.2, step: 0.01 },
]

export function resolveHeroAnimationConfig(overrides?: Partial<HeroAnimationConfig>): HeroAnimationConfig {
  return {
    ...HERO_ANIMATION_DEFAULTS,
    ...overrides,
    armSwingClampX: {
      ...HERO_ANIMATION_DEFAULTS.armSwingClampX,
      ...(overrides?.armSwingClampX ?? {}),
    },
  }
}
