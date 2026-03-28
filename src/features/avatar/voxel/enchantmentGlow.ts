import * as THREE from 'three'

// ── Glow colors per tier (Iron+ only) ────────────────────────────

const GLOW_COLORS: Record<string, number> = {
  IRON: 0xccccff, // silver-white
  GOLD: 0xffd700, // gold
  DIAMOND: 0x00ffff, // cyan
  NETHERITE: 0x9b59b6, // purple
}

/**
 * Returns true if the given tier should have enchantment glow.
 */
export function tierHasGlow(tier: string): boolean {
  return tier in GLOW_COLORS
}

/**
 * Adds a pulsing glow aura to an armor piece mesh.
 * Creates a slightly larger, semi-transparent duplicate for each child mesh.
 */
export function addEnchantGlow(armorGroup: THREE.Group, tier: string): void {
  const color = GLOW_COLORS[tier]
  if (color == null) return

  const glowMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.1,
    side: THREE.FrontSide,
    depthWrite: false,
  })

  const meshesToGlow: THREE.Mesh[] = []
  armorGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && !child.userData.isGlow) {
      meshesToGlow.push(child)
    }
  })

  for (const mesh of meshesToGlow) {
    const glowGeo = mesh.geometry.clone()
    const glowMesh = new THREE.Mesh(glowGeo, glowMat.clone())
    glowMesh.scale.multiplyScalar(1.08)
    glowMesh.userData.isGlow = true
    glowMesh.userData.phaseOffset = Math.random() * Math.PI * 2
    mesh.add(glowMesh)
  }
}

/**
 * Removes all glow meshes from an armor group.
 */
export function removeEnchantGlow(armorGroup: THREE.Group): void {
  const toRemove: THREE.Object3D[] = []
  armorGroup.traverse((child) => {
    if (child.userData.isGlow) toRemove.push(child)
  })
  for (const obj of toRemove) {
    if (obj.parent) obj.parent.remove(obj)
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (obj.material instanceof THREE.Material) obj.material.dispose()
    }
  }
}

/**
 * Animate all glow meshes in the scene — call each frame.
 * Pulses opacity on a sine wave with per-piece phase offset.
 */
export function animateEnchantGlow(scene: THREE.Scene, time: number): void {
  scene.traverse((obj) => {
    if (obj.userData.isGlow && obj instanceof THREE.Mesh) {
      const mat = obj.material as THREE.MeshBasicMaterial
      const phase = (obj.userData.phaseOffset as number) ?? 0
      mat.opacity = 0.05 + 0.15 * Math.abs(Math.sin(time * 1.5 + phase))
    }
  })
}
