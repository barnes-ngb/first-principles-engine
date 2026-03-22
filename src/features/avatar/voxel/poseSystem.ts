import type * as THREE from 'three'

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
  {
    id: 'idle',
    name: 'Standing',
    icon: '\u{1F9CD}',
    duration: 0,
    armL: { rotZ: [0] },
    armR: { rotZ: [0] },
    head: { rotX: [0], rotY: [0] },
    body: { posY: [0] },
  },
  {
    id: 'victory',
    name: 'Victory',
    icon: '\u2694\uFE0F',
    duration: 2000,
    requiresPiece: 'sword',
    armL: {
      rotZ: [0, 0.3, 0.3, 0],
      times: [0, 0.2, 0.8, 1],
    },
    armR: {
      rotZ: [0, -2.8, -2.8, -0.55],
      rotX: [0, -0.3, -0.3, -0.15],
      times: [0, 0.3, 0.7, 1],
    },
    head: {
      rotX: [-0.1, -0.25, -0.25, 0],
      times: [0, 0.3, 0.7, 1],
    },
    body: {
      posY: [0, 0.15, 0.15, 0],
      times: [0, 0.3, 0.7, 1],
    },
  },
  {
    id: 'shieldWall',
    name: 'Shield Wall',
    icon: '\u{1F6E1}\uFE0F',
    duration: 1800,
    requiresPiece: 'shield',
    armL: {
      rotZ: [0, 0.2, 0.2, 0.2],          // Very slight outward
      rotX: [0, -1.0, -1.0, -0.8],        // FORWARD — shield presents in front of body
      times: [0, 0.3, 0.7, 1],
    },
    armR: {
      rotZ: [0, -0.3, -0.3, -0.55],
      times: [0, 0.3, 0.7, 1],
    },
    head: {
      rotX: [0, 0.1, 0.1, 0],
      times: [0, 0.3, 0.7, 1],
    },
    body: {
      posY: [0, -0.3, -0.3, 0],
      times: [0, 0.25, 0.75, 1],
    },
  },
  {
    id: 'prayer',
    name: 'Prayer',
    icon: '\u{1F64F}',
    duration: 3000,
    armL: {
      rotZ: [0, 0, 0, 0],                // NO side rotation — arms stay at sides
      rotX: [0, -1.2, -1.2, 0],           // Swing FORWARD (negative X = forward)
      times: [0, 0.3, 0.85, 1],
    },
    armR: {
      rotZ: [0, 0, 0, 0],
      rotX: [0, -1.2, -1.2, 0],           // Same — both arms forward
      times: [0, 0.3, 0.85, 1],
    },
    head: {
      rotX: [0, 0.3, 0.3, 0],
      rotY: [0, 0, 0, 0],
      times: [0, 0.3, 0.85, 1],
    },
    body: { posY: [0] },
  },
  {
    id: 'wave',
    name: 'Wave',
    icon: '\u{1F44B}',
    duration: 2000,
    armL: { rotZ: [0] },
    armR: {
      rotZ: [0, -2.2, -2.0, -2.2, -2.0, -2.2, 0],
      rotX: [0, -0.3, -0.3, -0.3, -0.3, -0.3, 0],
      times: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 1],
    },
    head: {
      rotY: [0, 0.2, 0.2, 0.2, 0.2, 0.2, 0],
      times: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 1],
    },
    body: { posY: [0] },
  },
  {
    id: 'battleReady',
    name: 'Battle Ready',
    icon: '\u2694',
    duration: 1500,
    armL: {
      rotZ: [0, 0.7, 0.7, 0.5],
      rotX: [0, 0.5, 0.5, 0.35],
      times: [0, 0.3, 0.7, 1],
    },
    armR: {
      rotZ: [0, -1.2, -1.2, -0.55],
      rotX: [0, -0.6, -0.6, -0.15],
      times: [0, 0.3, 0.7, 1],
    },
    head: {
      rotX: [-0.05, -0.1, -0.1, 0],
      times: [0, 0.3, 0.7, 1],
    },
    body: {
      posY: [0, -0.15, -0.15, 0],
      times: [0, 0.3, 0.7, 1],
    },
  },
  {
    id: 'dab',
    name: 'Dab',
    icon: '\u{1F60E}',
    duration: 1200,
    armL: {
      rotZ: [0, 1.2, 1.2, 0],
      rotX: [0, -0.3, -0.3, 0],
      times: [0, 0.2, 0.7, 1],
    },
    armR: {
      rotZ: [0, -2.0, -2.0, 0],
      rotX: [0, -0.8, -0.8, 0],
      times: [0, 0.2, 0.7, 1],
    },
    head: {
      rotX: [0, 0.3, 0.3, 0],
      rotY: [0, -0.4, -0.4, 0],
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

// ── Pose Animator ───────────────────────────────────────────────────

export class PoseAnimator {
  private currentPose: Pose | null = null
  private startTime = 0
  private isPlaying = false
  private onComplete?: () => void

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
    const isArm = obj.name === 'armL' || obj.name === 'armR'
    if (kf.rotX) {
      let val = this.interpolate(kf.rotX, kf.times, t)
      if (isArm) val = Math.max(-1.3, Math.min(1.3, val))
      obj.rotation.x = val
    }
    if (kf.rotY) obj.rotation.y = this.interpolate(kf.rotY, kf.times, t)
    if (kf.rotZ) {
      let val = this.interpolate(kf.rotZ, kf.times, t)
      if (isArm) val = Math.max(-2.8, Math.min(2.8, val))
      obj.rotation.z = val
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
  return {
    id: 'equipIdle',
    name: 'Idle',
    icon: '',
    duration: 500,
    armL: {
      rotZ: [equipped.includes('shield') ? 0.2 : 0],
      rotX: [equipped.includes('shield') ? -0.3 : 0],
    },
    armR: {
      rotZ: [equipped.includes('sword') ? -0.3 : 0],
      rotX: [equipped.includes('sword') ? -0.1 : 0],
    },
    head: { rotX: [0], rotY: [0] },
    body: { posY: [0] },
  }
}
