import type * as THREE from 'three'
import { HERO_ANIMATION_TUNING, type HeroAnimationTuning } from './heroAnimationTuning'

// ── Pose Keyframes ──────────────────────────────────────────────────

export interface PoseKeyframes {
  rotX?: number[]
  rotY?: number[]
  rotZ?: number[]
  posY?: number[]
  times?: number[] // Normalized 0-1 timestamps for each keyframe
}

export interface FacialExpression {
  eyeScale?: number      // 1 = normal, 1.3 = wide, 0.1 = squint/closed
  mouthWidth?: number    // 1 = normal
  mouthHeight?: number   // 1 = normal, 0.3 = thin smile, 1.5 = open
  eyebrowAngle?: number  // 0 = neutral, positive = raised, negative = furrowed
}

export interface Pose {
  id: string
  name: string
  icon: string
  duration: number       // ms for the full animation (0 = static)
  requiresPiece?: string // Auto-triggers when this piece is equipped
  armL: PoseKeyframes
  armR: PoseKeyframes
  head: PoseKeyframes
  body: PoseKeyframes
}

// ── Pose definitions ────────────────────────────────────────────────

export const POSES: Pose[] = [
  // IDLE — default resting pose
  {
    id: 'idle',
    name: 'Standing',
    icon: '\u{1F9CD}',
    duration: 0,
    armL: { rotZ: [0.05], rotX: [0] },      // Very slight outward at rest
    armR: { rotZ: [0.05], rotX: [0] },
    head: { rotX: [0], rotY: [0] },
    body: { posY: [0] },
  },

  // VICTORY — sword arm raised overhead
  // Path: arm out to side → up overhead (clears body)
  {
    id: 'victory',
    name: 'Victory',
    icon: '\u2694\uFE0F',
    duration: 2000,
    requiresPiece: 'sword',
    armL: {
      rotZ: [0.05, 0.3, 0.3, 0.05],        // Slight pump
      rotX: [0, 0, 0, 0],
      times: [0, 0.3, 0.7, 1],
    },
    armR: {
      // Go OUT first (rotZ 0.8 ~45°), THEN up (rotZ 2.8 overhead)
      rotZ: [0.05, 0.8, 2.8, 2.8, 0.55],
      rotX: [0, -0.1, -0.2, -0.2, -0.1],    // Slight forward through the arc
      times: [0, 0.15, 0.4, 0.7, 1],
    },
    head: {
      rotX: [0, 0, -0.2, -0.2, 0],          // Look up at sword
      times: [0, 0.15, 0.4, 0.7, 1],
    },
    body: {
      posY: [0, 0, 0.12, 0.12, 0],
      times: [0, 0.15, 0.4, 0.7, 1],
    },
  },

  // SHIELD WALL — shield forward, crouch
  // Path: left arm goes FORWARD (rotX), not sideways through body
  {
    id: 'shieldWall',
    name: 'Shield Wall',
    icon: '\u{1F6E1}\uFE0F',
    duration: 1800,
    requiresPiece: 'shield',
    armL: {
      rotZ: [0.05, 0.25, 0.25, 0.2],       // Slight outward to clear body
      rotX: [0, -0.9, -0.9, -0.7],          // Forward — shield in front
      times: [0, 0.3, 0.7, 1],
    },
    armR: {
      rotZ: [0.05, 0.3, 0.3, 0.55],         // Sword arm slightly out
      rotX: [0, -0.2, -0.2, -0.1],
      times: [0, 0.3, 0.7, 1],
    },
    head: {
      rotX: [0, 0.08, 0.08, 0],             // Slight duck
      times: [0, 0.3, 0.7, 1],
    },
    body: {
      posY: [0, -0.25, -0.25, 0],           // Crouch
      times: [0, 0.25, 0.75, 1],
    },
  },

  // PRAYER — both arms FORWARD, meeting in front of chest
  // Path: arms swing forward (rotX), NOT sideways through torso
  {
    id: 'prayer',
    name: 'Prayer',
    icon: '\u{1F64F}',
    duration: 3000,
    armL: {
      rotZ: [0.05, 0.05, 0.05, 0.05],      // Stay at rest sideways — NO inward
      rotX: [0, -1.3, -1.3, 0],             // Forward — hands meet in front
      times: [0, 0.3, 0.85, 1],
    },
    armR: {
      rotZ: [0.05, 0.05, 0.05, 0.05],
      rotX: [0, -1.3, -1.3, 0],
      times: [0, 0.3, 0.85, 1],
    },
    head: {
      rotX: [0, 0.3, 0.3, 0],              // Head bows
      rotY: [0, 0, 0, 0],
      times: [0, 0.3, 0.85, 1],
    },
    body: { posY: [0] },
  },

  // WAVE — arm extends OUT to the character's right side (~80°), then waves forward/back via rotX
  // rotZ = -1.4 puts arm sideways (80° from body), hand ~well clear of head
  // Wave motion is entirely on rotX (toward/away from viewer) — no overhead movement
  {
    id: 'wave',
    name: 'Wave',
    icon: '\u{1F44B}',
    duration: 2200,
    armL: { rotZ: [0.05], rotX: [0] },
    armR: {
      // Arm extends sideways (rotZ=1.4 ≈ 80°) and stays there; wave is rotX only
      rotZ: [
        0.05,   // rest
        1.4,    // extend OUT to side (80°, fully clear of body)
        1.4,    // hold
        1.4,    // hold (waving happens on rotX)
        1.4,    // hold
        1.4,    // hold
        1.4,    // hold
        0.05,   // return to rest
      ],
      rotX: [
        0,      // rest
        0,      // arm goes out (no rotX yet)
        -0.5,   // wave: hand forward (toward viewer)
        0.3,    // wave: hand back (away from viewer)
        -0.5,   // forward
        0.3,    // back
        -0.5,   // forward
        0,      // return to rest
      ],
      times: [0, 0.12, 0.24, 0.40, 0.56, 0.72, 0.84, 1],
    },
    head: {
      rotY: [0, 0, 0.2, 0.2, 0.2, 0.2, 0.2, 0], // Look toward waving hand (starts after arm extends)
      times: [0, 0.12, 0.24, 0.40, 0.56, 0.72, 0.84, 1],
    },
    body: { posY: [0] },
  },

  // BATTLE READY — sword forward, shield up, low stance
  // Path: both arms go FORWARD via rotX
  {
    id: 'battleReady',
    name: 'Battle Ready',
    icon: '\u2694',
    duration: 1500,
    armL: {
      rotZ: [0.05, 0.3, 0.3, 0.2],         // Shield arm slightly out
      rotX: [0, -0.8, -0.8, -0.7],          // Forward
      times: [0, 0.3, 0.7, 1],
    },
    armR: {
      rotZ: [0.05, 0.5, 0.5, 0.55],         // Sword arm out to side
      rotX: [0, -0.7, -0.7, -0.15],          // Forward thrust, then relax
      times: [0, 0.3, 0.7, 1],
    },
    head: {
      rotX: [0, -0.08, -0.08, 0],            // Lean forward slightly
      times: [0, 0.3, 0.7, 1],
    },
    body: {
      posY: [0, -0.15, -0.15, 0],
      times: [0, 0.3, 0.7, 1],
    },
  },

  // DAB — left arm extends OUT, right arm goes up and FORWARD (in front of face)
  // Head tucks into right arm — arm doesn't go through head
  {
    id: 'dab',
    name: 'Dab',
    icon: '\u{1F60E}',
    duration: 1200,
    armL: {
      rotZ: [0.05, 1.5, 1.5, 0.05],        // Out to side and up
      rotX: [0, -0.2, -0.2, 0],              // Slight forward
      times: [0, 0.2, 0.7, 1],
    },
    armR: {
      rotZ: [0.05, 1.8, 1.8, 0.05],         // Up and out to side
      rotX: [0, -0.6, -0.6, 0],              // Forward — arm in front of face, not through it
      times: [0, 0.2, 0.7, 1],
    },
    head: {
      rotX: [0, 0.15, 0.15, 0],              // Head tilts down toward right arm
      rotY: [0, 0.35, 0.35, 0],              // Head turns right
      rotZ: [0, 0.15, 0.15, 0],              // Head tilts into the dab
      times: [0, 0.2, 0.7, 1],
    },
    body: { posY: [0] },
  },
]

// ── Facial expressions per pose ──────────────────────────────────────

export const POSE_EXPRESSIONS: Record<string, FacialExpression> = {
  idle:        { eyeScale: 1, mouthWidth: 1, mouthHeight: 0.5, eyebrowAngle: 0 },
  victory:     { eyeScale: 1.2, mouthWidth: 1.3, mouthHeight: 1.2, eyebrowAngle: 0.1 },
  shieldWall:  { eyeScale: 0.7, mouthWidth: 0.8, mouthHeight: 0.3, eyebrowAngle: -0.15 },
  prayer:      { eyeScale: 0.1, mouthWidth: 0.9, mouthHeight: 0.4, eyebrowAngle: 0.05 },
  wave:        { eyeScale: 1.1, mouthWidth: 1.2, mouthHeight: 1.0, eyebrowAngle: 0.1 },
  battleReady: { eyeScale: 0.8, mouthWidth: 0.7, mouthHeight: 0.3, eyebrowAngle: -0.2 },
  dab:         { eyeScale: 1.3, mouthWidth: 1.4, mouthHeight: 1.3, eyebrowAngle: 0.15 },
}


export function getScaledExpression(poseId: string, tuning: HeroAnimationTuning): FacialExpression {
  const base = POSE_EXPRESSIONS[poseId] ?? POSE_EXPRESSIONS.idle ?? {}
  const intensity = tuning.emoteIntensity
  const neutral = { eyeScale: 1, mouthWidth: 1, mouthHeight: 1, eyebrowAngle: 0 }
  return {
    eyeScale: neutral.eyeScale + ((base.eyeScale ?? neutral.eyeScale) - neutral.eyeScale) * intensity,
    mouthWidth: neutral.mouthWidth + ((base.mouthWidth ?? neutral.mouthWidth) - neutral.mouthWidth) * intensity,
    mouthHeight: neutral.mouthHeight + ((base.mouthHeight ?? neutral.mouthHeight) - neutral.mouthHeight) * intensity,
    eyebrowAngle: neutral.eyebrowAngle + ((base.eyebrowAngle ?? neutral.eyebrowAngle) - neutral.eyebrowAngle) * intensity,
  }
}

// ── Pose Animator ───────────────────────────────────────────────────

export class PoseAnimator {
  private currentPose: Pose | null = null
  private readonly getTuning: () => HeroAnimationTuning
  private startTime = 0
  private isPlaying = false
  private onComplete?: () => void

  constructor(getTuning?: () => HeroAnimationTuning) {
    this.getTuning = getTuning ?? (() => HERO_ANIMATION_TUNING)
  }

  play(pose: Pose, onComplete?: () => void) {
    this.currentPose = pose
    this.startTime = performance.now()
    this.isPlaying = pose.duration > 0
    this.onComplete = onComplete
  }

  update(
    armL: THREE.Object3D,
    armR: THREE.Object3D,
    head: THREE.Object3D,
    body: THREE.Object3D,
    now: number,
  ) {
    if (!this.isPlaying || !this.currentPose) return false

    const elapsed = now - this.startTime
    const t = Math.min(elapsed / this.currentPose.duration, 1)

    this.applyKeyframes(armL, this.currentPose.armL, t)
    this.applyKeyframes(armR, this.currentPose.armR, t)
    this.applyKeyframes(head, this.currentPose.head, t)
    this.applyBodyKeyframes(body, this.currentPose.body, t)

    if (t >= 1) {
      this.isPlaying = false
      this.onComplete?.()
    }

    return true // Animation is active — caller should skip idle sway
  }

  private applyKeyframes(obj: THREE.Object3D, kf: PoseKeyframes, t: number) {
    const armSide = obj.name === 'armL' ? 'L' : obj.name === 'armR' ? 'R' : null
    const isArm = armSide !== null
    const tuning = this.getTuning()
    const sideConfig = armSide ? tuning.guardrails.armBySide[armSide] : null
    if (kf.rotX) {
      let val = this.interpolate(kf.rotX, kf.times, t)
      if (sideConfig) {
        val = Math.max(sideConfig.rotXMin, Math.min(sideConfig.rotXMax, val))
      }
      obj.rotation.x = val
    }
    if (kf.rotY) obj.rotation.y = this.interpolate(kf.rotY, kf.times, t)
    if (kf.rotZ) {
      let val = this.interpolate(kf.rotZ, kf.times, t)
      if (sideConfig && isArm) {
        const armX = obj.rotation.x
        const softTorso = tuning.guardrails.torsoSoftCollision
        const torsoT = Math.max(
          0,
          Math.min(1, (armX - softTorso.rotXStart) / (softTorso.rotXEnd - softTorso.rotXStart)),
        )
        const torsoPush = torsoT * (softTorso.forearmClearance + softTorso.handClearance)
        const minOutward = Math.max(
          sideConfig.rotZMin,
          tuning.torsoClearance + tuning.elbowOutBias + torsoPush,
          tuning.guardrails.elbowInwardCollapseLimit,
        )
        val = Math.max(
          minOutward,
          Math.min(sideConfig.rotZMax, val),
        )
      }
      // Left arm is at -X; positive rotation.z swings it inward (toward
      // the torso).  Negate so the same positive "outward" values used by
      // poses and guardrails produce outward motion on both sides.
      obj.rotation.z = armSide === 'L' ? -val : val
    }
  }

  private applyBodyKeyframes(obj: THREE.Object3D, kf: PoseKeyframes, t: number) {
    if (kf.posY) {
      const baseY = (obj.userData.basePoseY as number | undefined) ?? obj.position.y
      obj.userData.basePoseY = baseY
      obj.position.y = baseY + this.interpolate(kf.posY, kf.times, t)
    }
  }

  private interpolate(values: number[], times: number[] | undefined, t: number): number {
    if (values.length === 1) return values[0]

    const ts = times ?? values.map((_, i) => i / (values.length - 1))

    let i = 0
    while (i < ts.length - 1 && ts[i + 1] < t) i++

    if (i >= values.length - 1) return values[values.length - 1]

    const localT = (t - ts[i]) / (ts[i + 1] - ts[i])
    // Smooth step interpolation for natural movement
    const smooth = localT * localT * (3 - 2 * localT)
    return values[i] + (values[i + 1] - values[i]) * smooth
  }

  get playing() {
    return this.isPlaying
  }

  get currentPoseId() {
    return this.currentPose?.id ?? null
  }
}

// ── Apply facial expression to character ────────────────────────────

export function applyExpression(
  character: THREE.Group,
  expression: FacialExpression,
  skinColor?: number,
) {
  // Scale eye whites and pupils
  const eyeNames = ['eyeWhiteL', 'eyeWhiteR', 'pupilL', 'pupilR']
  for (const name of eyeNames) {
    const mesh = character.getObjectByName(name)
    if (mesh) {
      mesh.scale.y = expression.eyeScale ?? 1
    }
  }

  // Scale mouth
  const mouth = character.getObjectByName('mouth')
  if (mouth) {
    mouth.scale.x = expression.mouthWidth ?? 1
    mouth.scale.y = expression.mouthHeight ?? 1
  }

  // Rotate eyebrows
  const browL = character.getObjectByName('eyebrowL')
  const browR = character.getObjectByName('eyebrowR')
  if (browL) browL.rotation.z = expression.eyebrowAngle ?? 0
  if (browR) browR.rotation.z = -(expression.eyebrowAngle ?? 0)

  // For closed eyes (prayer), hide whites to simulate eyelids
  if ((expression.eyeScale ?? 1) < 0.2) {
    for (const name of ['eyeWhiteL', 'eyeWhiteR']) {
      const mesh = character.getObjectByName(name)
      if (mesh) mesh.visible = false
    }
    for (const name of ['pupilL', 'pupilR']) {
      const mesh = character.getObjectByName(name)
      if (mesh) mesh.visible = false
    }
  } else {
    for (const name of ['eyeWhiteL', 'eyeWhiteR', 'pupilL', 'pupilR']) {
      const mesh = character.getObjectByName(name)
      if (mesh) mesh.visible = true
    }
  }

  void skinColor // reserved for future eyelid coloring
}

// ── Equipment-based idle pose for smooth return ─────────────────────

/**
 * Build a Pose object that represents the equipment-based idle position.
 * Used for smooth return to idle after a pose animation completes.
 */
export function getEquipmentIdlePose(equipped: string[]): Pose {
  const hasSword = equipped.includes('sword')
  const hasShield = equipped.includes('shield')

  return {
    id: 'equipIdle',
    name: 'Idle',
    icon: '',
    duration: 500,
    armL: {
      rotZ: [hasShield ? 0.25 : 0.05],    // Shield arm slightly out
      rotX: [hasShield ? -0.3 : 0],       // And slightly forward
    },
    armR: {
      rotZ: [hasSword ? 0.35 : 0.05],     // Sword arm slightly out
      rotX: [hasSword ? -0.1 : 0],        // Barely forward
    },
    head: { rotX: [0], rotY: [0] },
    body: { posY: [0] },
  }
}
