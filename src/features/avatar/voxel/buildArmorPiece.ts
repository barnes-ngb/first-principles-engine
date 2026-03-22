import * as THREE from 'three'
import type { VoxelArmorPieceId } from '../../../core/types'

// ── Helpers ─────────────────────────────────────────────────────────

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
}

/** Create a box and tag it with a material role for tier coloring */
function taggedBox(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  role: 'primary' | 'accent' | 'detail',
  name?: string,
): THREE.Mesh {
  const mesh = box(w, h, d, material)
  mesh.userData.materialRole = role
  if (name) mesh.name = name
  return mesh
}

// ── Armor piece colors (defaults before tier is applied) ─────────────

export const ARMOR_PIECE_COLORS: Record<VoxelArmorPieceId, { color: number; accent: number }> = {
  belt:        { color: 0xdaa520, accent: 0xffd700 },
  breastplate: { color: 0xb87333, accent: 0xffd700 },
  shoes:       { color: 0x8b7355, accent: 0xa0896c },
  shield:      { color: 0xcd853f, accent: 0xffd700 },
  helmet:      { color: 0xc0c0c0, accent: 0xffd700 },
  sword:       { color: 0x87ceeb, accent: 0xb0e0e6 },
}

// ── Armor piece metadata (for UI) ───────────────────────────────────

export interface ArmorPieceMeta {
  id: VoxelArmorPieceId
  name: string
  shortName: string
  verse: string
  verseText: string
  xpRequired: number
  order: number
}

export const VOXEL_ARMOR_PIECES: ArmorPieceMeta[] = [
  {
    id: 'belt',
    name: 'Belt of Truth',
    shortName: 'Belt of Truth',
    verse: 'Ephesians 6:14a',
    verseText: 'Stand firm then, with the belt of truth buckled around your waist.',
    xpRequired: 0,
    order: 1,
  },
  {
    id: 'breastplate',
    name: 'Breastplate of Righteousness',
    shortName: 'Breastplate',
    verse: 'Ephesians 6:14b',
    verseText: 'With the breastplate of righteousness in place.',
    xpRequired: 150,
    order: 2,
  },
  {
    id: 'shoes',
    name: 'Shoes of Peace',
    shortName: 'Shoes of Peace',
    verse: 'Ephesians 6:15',
    verseText: 'And with your feet fitted with the readiness that comes from the gospel of peace.',
    xpRequired: 300,
    order: 3,
  },
  {
    id: 'shield',
    name: 'Shield of Faith',
    shortName: 'Shield of Faith',
    verse: 'Ephesians 6:16',
    verseText: 'In addition to all this, take up the shield of faith, with which you can extinguish all the flaming arrows of the evil one.',
    xpRequired: 500,
    order: 4,
  },
  {
    id: 'helmet',
    name: 'Helmet of Salvation',
    shortName: 'Helmet',
    verse: 'Ephesians 6:17a',
    verseText: 'Take the helmet of salvation.',
    xpRequired: 750,
    order: 5,
  },
  {
    id: 'sword',
    name: 'Sword of the Spirit',
    shortName: 'Sword',
    verse: 'Ephesians 6:17b',
    verseText: 'And the sword of the Spirit, which is the word of God.',
    xpRequired: 1000,
    order: 6,
  },
]

export const XP_THRESHOLDS: Record<VoxelArmorPieceId, number> = {
  belt: 0,
  breastplate: 150,
  shoes: 300,
  shield: 500,
  helmet: 750,
  sword: 1000,
}

// ── Armor geometry builders (with materialRole tags) ─────────────────

function buildBelt(scale: number, yOffset: number): THREE.Group {
  const group = new THREE.Group()
  // Use white placeholder colors — tier materials override these
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const accentMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const detailMat = new THREE.MeshLambertMaterial({ color: 0xffffff })

  // Main belt band — PRIMARY
  const band = taggedBox(1.14 * scale, 0.2 * scale, 0.72 * scale, mat, 'primary', 'belt_band')
  band.position.set(0, (1.35 + yOffset) * scale, 0)
  group.add(band)

  // Buckle — ACCENT
  const buckle = taggedBox(0.22 * scale, 0.22 * scale, 0.1 * scale, accentMat, 'accent', 'belt_buckle')
  buckle.position.set(0, (1.35 + yOffset) * scale, 0.42 * scale)
  group.add(buckle)

  // Buckle detail (inner rectangle) — DETAIL
  const inner = taggedBox(0.12 * scale, 0.12 * scale, 0.02 * scale, detailMat, 'detail', 'belt_inner')
  inner.position.set(0, (1.35 + yOffset) * scale, 0.48 * scale)
  group.add(inner)

  return group
}

function buildBreastplate(scale: number, yOffset: number): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const accentMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const detailMat = new THREE.MeshLambertMaterial({ color: 0xffffff })

  // Main chest plate — PRIMARY
  const chest = taggedBox(1.12 * scale, 0.85 * scale, 0.72 * scale, mat, 'primary', 'breastplate_body')
  chest.position.set(0, (2.05 + yOffset) * scale, 0)
  group.add(chest)

  // Shoulder guards — DETAIL
  const shoulderL = taggedBox(0.3 * scale, 0.2 * scale, 0.6 * scale, detailMat, 'detail', 'shoulder_l')
  shoulderL.position.set(-0.6 * scale, (2.45 + yOffset) * scale, 0)
  group.add(shoulderL)
  const shoulderR = taggedBox(0.3 * scale, 0.2 * scale, 0.6 * scale, detailMat, 'detail', 'shoulder_r')
  shoulderR.position.set(0.6 * scale, (2.45 + yOffset) * scale, 0)
  group.add(shoulderR)

  // Cross emblem — ACCENT
  const crossV = taggedBox(0.08 * scale, 0.4 * scale, 0.06 * scale, accentMat, 'accent', 'cross_v')
  crossV.position.set(0, (2.1 + yOffset) * scale, 0.4 * scale)
  group.add(crossV)
  const crossH = taggedBox(0.28 * scale, 0.08 * scale, 0.06 * scale, accentMat, 'accent', 'cross_h')
  crossH.position.set(0, (2.2 + yOffset) * scale, 0.4 * scale)
  group.add(crossH)

  // Bottom rim — ACCENT
  const rim = taggedBox(1.14 * scale, 0.06 * scale, 0.74 * scale, accentMat, 'accent', 'breastplate_rim')
  rim.position.set(0, (1.60 + yOffset) * scale, 0)
  group.add(rim)

  return group
}

function buildShoes(scale: number, yOffset: number): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const detailMat = new THREE.MeshLambertMaterial({ color: 0xffffff })

  // Left armored boot — PRIMARY
  const bootL = taggedBox(0.5 * scale, 0.55 * scale, 0.7 * scale, mat, 'primary', 'boot_l')
  bootL.position.set(-0.25 * scale, (0.28 + yOffset) * scale, 0.03 * scale)
  group.add(bootL)

  // Right armored boot — PRIMARY
  const bootR = taggedBox(0.5 * scale, 0.55 * scale, 0.7 * scale, mat, 'primary', 'boot_r')
  bootR.position.set(0.25 * scale, (0.28 + yOffset) * scale, 0.03 * scale)
  group.add(bootR)

  // Greave sections (shin guards) — DETAIL
  const greaveL = taggedBox(0.48 * scale, 0.4 * scale, 0.58 * scale, detailMat, 'detail', 'greave_l')
  greaveL.position.set(-0.25 * scale, (0.65 + yOffset) * scale, 0)
  group.add(greaveL)

  const greaveR = taggedBox(0.48 * scale, 0.4 * scale, 0.58 * scale, detailMat, 'detail', 'greave_r')
  greaveR.position.set(0.25 * scale, (0.65 + yOffset) * scale, 0)
  group.add(greaveR)

  return group
}

function buildShield(scale: number, yOffset: number): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const accentMat = new THREE.MeshLambertMaterial({ color: 0xffffff })

  // Shield body — PRIMARY
  const body = taggedBox(0.7 * scale, 1.0 * scale, 0.15 * scale, mat, 'primary', 'shield_body')
  body.position.set(-0.95 * scale, (2.0 + yOffset) * scale, 0.1 * scale)
  group.add(body)

  // Golden boss — ACCENT
  const boss = taggedBox(0.25 * scale, 0.25 * scale, 0.1 * scale, accentMat, 'accent', 'shield_boss')
  boss.position.set(-0.95 * scale, (2.0 + yOffset) * scale, 0.2 * scale)
  group.add(boss)

  // Rim (top and bottom) — ACCENT
  const rimTop = taggedBox(0.72 * scale, 0.08 * scale, 0.17 * scale, accentMat, 'accent', 'shield_rim_top')
  rimTop.position.set(-0.95 * scale, (2.5 + yOffset) * scale, 0.1 * scale)
  group.add(rimTop)

  const rimBot = taggedBox(0.72 * scale, 0.08 * scale, 0.17 * scale, accentMat, 'accent', 'shield_rim_bot')
  rimBot.position.set(-0.95 * scale, (1.5 + yOffset) * scale, 0.1 * scale)
  group.add(rimBot)

  return group
}

function buildHelmet(scale: number, yOffset: number): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const accentMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const detailMat = new THREE.MeshLambertMaterial({ color: 0xffffff })

  // Dome over head — PRIMARY
  const dome = taggedBox(1.1 * scale, 0.7 * scale, 1.1 * scale, mat, 'primary', 'helmet_dome')
  dome.position.set(0, (3.45 + yOffset) * scale, 0)
  group.add(dome)

  // Face visor — DETAIL
  const visor = taggedBox(0.8 * scale, 0.35 * scale, 0.15 * scale, detailMat, 'detail', 'helmet_visor')
  visor.position.set(0, (3.15 + yOffset) * scale, 0.5 * scale)
  group.add(visor)

  // Golden crest on top — ACCENT
  const crest = taggedBox(0.15 * scale, 0.35 * scale, 0.8 * scale, accentMat, 'accent', 'helmet_crest')
  crest.position.set(0, (3.85 + yOffset) * scale, 0)
  group.add(crest)

  return group
}

function buildSword(scale: number, yOffset: number): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const accentMat = new THREE.MeshLambertMaterial({ color: 0xffffff })

  // Blade — PRIMARY
  const blade = taggedBox(0.12 * scale, 1.4 * scale, 0.06 * scale, mat, 'primary', 'sword_blade')
  blade.position.set(0.95 * scale, (2.5 + yOffset) * scale, 0.1 * scale)
  group.add(blade)

  // Blade tip — PRIMARY
  const tip = taggedBox(0.08 * scale, 0.3 * scale, 0.05 * scale, mat, 'primary', 'sword_tip')
  tip.position.set(0.95 * scale, (3.35 + yOffset) * scale, 0.1 * scale)
  group.add(tip)

  // Crossguard — ACCENT
  const crossguard = taggedBox(0.4 * scale, 0.1 * scale, 0.1 * scale, accentMat, 'accent', 'sword_crossguard')
  crossguard.position.set(0.95 * scale, (1.75 + yOffset) * scale, 0.1 * scale)
  group.add(crossguard)

  // Grip — DETAIL
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 })
  const grip = taggedBox(0.1 * scale, 0.35 * scale, 0.08 * scale, gripMat, 'detail', 'sword_grip')
  grip.position.set(0.95 * scale, (1.5 + yOffset) * scale, 0.1 * scale)
  group.add(grip)

  // Glowing tip point light
  const glowLight = new THREE.PointLight(0x87ceeb, 0.6, 2)
  glowLight.position.set(0.95 * scale, (3.5 + yOffset) * scale, 0.1 * scale)
  group.add(glowLight)

  return group
}

// ── Main builder ────────────────────────────────────────────────────

export function buildArmorPiece(
  pieceId: VoxelArmorPieceId,
  ageGroup: 'older' | 'younger',
): THREE.Group {
  const scale = ageGroup === 'younger' ? 0.85 : 1.0
  const yOffset = ageGroup === 'younger' ? -0.15 : 0

  let group: THREE.Group

  switch (pieceId) {
    case 'belt':
      group = buildBelt(scale, yOffset)
      break
    case 'breastplate':
      group = buildBreastplate(scale, yOffset)
      break
    case 'shoes':
      group = buildShoes(scale, yOffset)
      break
    case 'shield':
      group = buildShield(scale, yOffset)
      break
    case 'helmet':
      group = buildHelmet(scale, yOffset)
      break
    case 'sword':
      group = buildSword(scale, yOffset)
      break
  }

  group.name = pieceId
  group.visible = false // Hidden until equipped

  return group
}
