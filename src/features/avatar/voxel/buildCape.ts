import * as THREE from 'three'
import type { CharacterProportions } from '../../../core/types'
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
 *
 * Cape dimensions (family-tuned):
 *   Top:    torsoW × 0.6 wide, torsoH × 0.3 tall, 0.04 deep
 *   Middle: torsoW × 0.7 wide, torsoH × 0.35 tall, 0.04 deep
 *   Bottom: torsoW × 0.8 wide, torsoH × 0.3 tall, 0.04 deep (darkened 20%)
 *   Clasp:  0.08 × 0.05 × 0.05 gold
 */
export function buildBaseCape(ageGroup: 'older' | 'younger', capeColor: number, customProportions?: Partial<CharacterProportions>): THREE.Group {
  const layout = getBodyLayout(ageGroup, customProportions)
  const s = layout.scale
  const { torsoW, torsoH, torsoD } = layout

  const capeGroup = new THREE.Group()
  capeGroup.name = 'cape'

  const capeMat = new THREE.MeshPhongMaterial({
    color: capeColor,
    specular: 0x222222,
    shininess: 8,
    flatShading: true,
    side: THREE.DoubleSide,
  })

  // Segment dimensions
  const topW = torsoW * 0.6
  const topH = torsoH * 0.3
  const topD = 0.04 * s

  const midW = torsoW * 0.7
  const midH = torsoH * 0.35
  const midD = 0.04 * s

  const botW = torsoW * 0.8
  const botH = torsoH * 0.3
  const botD = 0.04 * s

  // Top section (narrowest, at shoulders)
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(topW, topH, topD),
    capeMat,
  )
  top.position.set(0, -topH / 2, 0)
  top.userData.isCape = true
  capeGroup.add(top)

  // Middle section (slightly wider)
  const midMat = capeMat.clone()
  midMat.color = new THREE.Color(lerpColor(capeColor, 0x000000, 0.08))
  const mid = new THREE.Mesh(
    new THREE.BoxGeometry(midW, midH, midD),
    midMat,
  )
  mid.position.set(0, -(topH + midH / 2), 0)
  mid.userData.isCape = true
  capeGroup.add(mid)

  // Bottom section (widest, darkened 20%)
  const botMat = new THREE.MeshPhongMaterial({
    color: lerpColor(capeColor, 0x000000, 0.2),
    specular: 0x222222,
    shininess: 8,
    flatShading: true,
    side: THREE.DoubleSide,
  })
  const bot = new THREE.Mesh(
    new THREE.BoxGeometry(botW, botH, botD),
    botMat,
  )
  bot.position.set(0, -(topH + midH + botH / 2), 0)
  bot.userData.isCape = true
  capeGroup.add(bot)

  // Clasp at top (gold, holds cape at shoulders)
  const clasp = new THREE.Mesh(
    new THREE.BoxGeometry(0.08 * s, 0.05 * s, 0.05 * s),
    new THREE.MeshPhongMaterial({ color: 0xC8A84E, shininess: 25, flatShading: true }),
  )
  clasp.position.set(0, 0.025 * s, 0)
  capeGroup.add(clasp)

  // Position cape behind torso — torso-local coordinates (child of torso mesh)
  // Cape hangs from top of torso (shoulder level), behind the torso's back face
  capeGroup.position.set(0, torsoH / 2, -(torsoD / 2 + 0.03 * s))

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
