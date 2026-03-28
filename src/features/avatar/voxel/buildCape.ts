import * as THREE from 'three'

// ── Cape colors per tier (Gold+ only) ────────────────────────────

const CAPE_COLORS: Record<string, number> = {
  GOLD: 0x8b0000, // deep red
  DIAMOND: 0x1e3a8a, // royal blue
  NETHERITE: 0x1a0a2e, // black-purple
}

/**
 * Returns true if the given tier should have a cape.
 */
export function tierHasCape(tier: string): boolean {
  return tier in CAPE_COLORS
}

/**
 * Builds a voxel-style cape (3 stacked box segments, wider toward bottom).
 * Attaches to the torso group, positioned behind the character's back.
 */
export function buildCape(tier: string, ageGroup: 'older' | 'younger'): THREE.Group | null {
  const color = CAPE_COLORS[tier]
  if (color == null) return null

  const scale = ageGroup === 'younger' ? 0.88 : 1.0
  const U = 0.125 * scale

  const capeGroup = new THREE.Group()
  capeGroup.name = 'cape'
  const capeMat = new THREE.MeshLambertMaterial({ color })

  // Top section (shoulder width)
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(U * 6, U * 3, U * 0.5),
    capeMat,
  )
  top.position.set(0, 0, 0)
  capeGroup.add(top)

  // Middle section (slightly wider)
  const mid = new THREE.Mesh(
    new THREE.BoxGeometry(U * 7, U * 4, U * 0.5),
    capeMat.clone(),
  )
  mid.position.set(0, -U * 3.5, 0)
  capeGroup.add(mid)

  // Bottom section (widest)
  const bot = new THREE.Mesh(
    new THREE.BoxGeometry(U * 8, U * 3, U * 0.5),
    capeMat.clone(),
  )
  bot.position.set(0, -U * 7, 0)
  capeGroup.add(bot)

  // Position cape behind torso, near shoulders
  capeGroup.position.set(0, U * 3, -U * 4.5)

  capeGroup.userData.isCape = true

  return capeGroup
}

/**
 * Animate cape sway — call each frame.
 * Adds a subtle forward/back tilt to give it a flowing feel.
 */
export function animateCape(scene: THREE.Scene, time: number): void {
  scene.traverse((obj) => {
    if (obj.userData.isCape) {
      obj.rotation.x = Math.sin(time * 1.2) * 0.05
    }
  })
}
