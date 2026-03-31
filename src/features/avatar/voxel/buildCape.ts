import * as THREE from 'three'
import { LEGENDS_OUTFIT, getBodyLayout } from './buildCharacter'

// ── Cape colors per tier (Gold+ override the base cape color) ───────

const TIER_CAPE_COLORS: Record<string, number> = {
  GOLD: 0x8b0000,     // deep red
  DIAMOND: 0x1e3a8a,  // royal blue
  NETHERITE: 0x1a0a2e, // black-purple
}

/** Lerp between two hex colors */
function lerpColor(colorA: number, colorB: number, t: number): number {
  const a = new THREE.Color(colorA)
  const b = new THREE.Color(colorB)
  a.lerp(b, t)
  return a.getHex()
}

/**
 * Returns true if the given tier has a special cape color override.
 * (All characters now have a base cape regardless of tier.)
 */
export function tierHasCape(tier: string): boolean {
  return tier in TIER_CAPE_COLORS
}

/**
 * Get the default base cape color for an age group.
 */
export function getDefaultCapeColor(ageGroup: 'older' | 'younger'): number {
  return LEGENDS_OUTFIT[ageGroup].capeColor
}

/**
 * Resolve the cape color: tier override > customization > age-group default.
 */
export function resolveCapeColor(
  tier: string,
  ageGroup: 'older' | 'younger',
  customCapeColor?: string,
): number {
  // Tier colors take precedence (Gold+)
  if (tier in TIER_CAPE_COLORS) return TIER_CAPE_COLORS[tier]
  // Then saved customization
  if (customCapeColor) return new THREE.Color(customCapeColor).getHex()
  // Then age-group default
  return getDefaultCapeColor(ageGroup)
}

/**
 * Builds a voxel-style Legends cape (3 stacked box segments, wider toward bottom).
 * Part of the BASE outfit — every character gets a cape, not just Gold+ tier.
 * The cape attaches to the torso, positioned behind the character's back.
 */
export function buildBaseCape(ageGroup: 'older' | 'younger', capeColor: number): THREE.Group {
  const layout = getBodyLayout(ageGroup)
  const { U } = layout
  const tW = layout.p.torsoPxW
  const tD = layout.p.torsoPxD
  const tH = layout.p.torsoPxH

  const capeGroup = new THREE.Group()
  capeGroup.name = 'cape'

  const capeMat = new THREE.MeshPhongMaterial({
    color: capeColor,
    specular: 0x222222,
    shininess: 8,
    flatShading: true,
    side: THREE.DoubleSide,
  })

  // Top section (shoulder width)
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(U * (tW + 0.2), U * (tH * 0.35), U * 0.5),
    capeMat,
  )
  top.position.set(0, -U * 0.8, 0)
  capeGroup.add(top)

  // Middle section (slightly wider)
  const midMat = capeMat.clone()
  midMat.color = new THREE.Color(lerpColor(capeColor, 0x000000, 0.08))
  const mid = new THREE.Mesh(
    new THREE.BoxGeometry(U * (tW + 1), U * (tH * 0.45), U * 0.5),
    midMat,
  )
  mid.position.set(0, -U * (tH * 0.45), 0)
  capeGroup.add(mid)

  // Bottom section (widest, darkest)
  const botMat = new THREE.MeshPhongMaterial({
    color: lerpColor(capeColor, 0x000000, 0.15),
    specular: 0x222222,
    shininess: 8,
    flatShading: true,
    side: THREE.DoubleSide,
  })
  const bot = new THREE.Mesh(
    new THREE.BoxGeometry(U * (tW + 1.8), U * (tH * 0.35), U * 0.5),
    botMat,
  )
  bot.position.set(0, -U * (tH * 0.85), 0)
  capeGroup.add(bot)

  // Clasp at top (gold, holds cape at shoulders)
  const clasp = new THREE.Mesh(
    new THREE.BoxGeometry(U * 1.2, U * 0.6, U * 0.6),
    new THREE.MeshPhongMaterial({ color: 0xC8A84E, shininess: 25, flatShading: true }),
  )
  clasp.position.set(0, U * 1.2, 0)
  capeGroup.add(clasp)

  // Position cape behind torso, attached near shoulders
  // torsoTop is relative to character root; cape needs torso-relative offset
  // Cape attaches at upper back: slightly below torso top, behind torso depth
  capeGroup.position.set(0, U * (tH * 0.3), -U * (tD / 2 + 2))

  capeGroup.userData.isCape = true

  return capeGroup
}

/**
 * Legacy compatibility: builds a cape for a given tier.
 * Now delegates to buildBaseCape with tier-specific color.
 */
export function buildCape(tier: string, ageGroup: 'older' | 'younger'): THREE.Group | null {
  const color = TIER_CAPE_COLORS[tier]
  if (color == null) return null
  return buildBaseCape(ageGroup, color)
}

/**
 * Animate cape sway — call each frame.
 * Adds a subtle forward/back tilt to give it a flowing feel.
 */
export function animateCape(scene: THREE.Scene, time: number): void {
  scene.traverse((obj) => {
    if (obj.userData.isCape) {
      obj.rotation.x = Math.sin(time * 1.2) * 0.04
    }
  })
}
