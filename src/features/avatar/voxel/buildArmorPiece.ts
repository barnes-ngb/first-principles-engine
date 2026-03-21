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

// ── Armor piece colors ──────────────────────────────────────────────

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
  verse: string
  verseText: string
  xpRequired: number
  order: number
}

export const VOXEL_ARMOR_PIECES: ArmorPieceMeta[] = [
  {
    id: 'belt',
    name: 'Belt of Truth',
    verse: 'Ephesians 6:14',
    verseText: 'Stand firm then, with the belt of truth buckled around your waist.',
    xpRequired: 0,
    order: 1,
  },
  {
    id: 'breastplate',
    name: 'Breastplate of Righteousness',
    verse: 'Ephesians 6:14',
    verseText: 'With the breastplate of righteousness in place.',
    xpRequired: 150,
    order: 2,
  },
  {
    id: 'shoes',
    name: 'Shoes of Peace',
    verse: 'Ephesians 6:15',
    verseText: 'And with your feet fitted with the readiness that comes from the gospel of peace.',
    xpRequired: 300,
    order: 3,
  },
  {
    id: 'shield',
    name: 'Shield of Faith',
    verse: 'Ephesians 6:16',
    verseText: 'Take up the shield of faith, with which you can extinguish all the flaming arrows of the evil one.',
    xpRequired: 500,
    order: 4,
  },
  {
    id: 'helmet',
    name: 'Helmet of Salvation',
    verse: 'Ephesians 6:17',
    verseText: 'Take the helmet of salvation.',
    xpRequired: 750,
    order: 5,
  },
  {
    id: 'sword',
    name: 'Sword of the Spirit',
    verse: 'Ephesians 6:17',
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

// ── Armor geometry builders ─────────────────────────────────────────

function buildBelt(scale: number, yOffset: number): THREE.Group {
  const group = new THREE.Group()
  const colors = ARMOR_PIECE_COLORS.belt
  const mat = new THREE.MeshLambertMaterial({ color: colors.color })
  const accentMat = new THREE.MeshLambertMaterial({ color: colors.accent })

  // Main belt band — slightly wider than torso, sits at waist
  const band = box(1.14 * scale, 0.2 * scale, 0.72 * scale, mat)
  band.position.set(0, (1.35 + yOffset) * scale, 0)
  group.add(band)

  // Buckle — raised, centered front
  const buckle = box(0.22 * scale, 0.22 * scale, 0.1 * scale, accentMat)
  buckle.position.set(0, (1.35 + yOffset) * scale, 0.42 * scale)
  group.add(buckle)

  // Buckle detail (inner rectangle)
  const inner = box(0.12 * scale, 0.12 * scale, 0.02 * scale, new THREE.MeshLambertMaterial({ color: 0xb8860b }))
  inner.position.set(0, (1.35 + yOffset) * scale, 0.48 * scale)
  group.add(inner)

  return group
}

function buildBreastplate(scale: number, yOffset: number): THREE.Group {
  const group = new THREE.Group()
  const colors = ARMOR_PIECE_COLORS.breastplate
  const mat = new THREE.MeshLambertMaterial({ color: colors.color })
  const accentMat = new THREE.MeshLambertMaterial({ color: colors.accent })
  const rimMat = new THREE.MeshLambertMaterial({ color: 0xb8860b })

  // Main chest plate — wider & deeper than torso so it wraps around visibly
  const chest = box(1.12 * scale, 0.85 * scale, 0.72 * scale, mat)
  chest.position.set(0, (2.05 + yOffset) * scale, 0)
  group.add(chest)

  // Shoulder guards
  const shoulderL = box(0.3 * scale, 0.2 * scale, 0.6 * scale, mat)
  shoulderL.position.set(-0.6 * scale, (2.45 + yOffset) * scale, 0)
  group.add(shoulderL)
  const shoulderR = box(0.3 * scale, 0.2 * scale, 0.6 * scale, mat)
  shoulderR.position.set(0.6 * scale, (2.45 + yOffset) * scale, 0)
  group.add(shoulderR)

  // Golden cross emblem on front
  const crossV = box(0.08 * scale, 0.4 * scale, 0.06 * scale, accentMat)
  crossV.position.set(0, (2.1 + yOffset) * scale, 0.4 * scale)
  group.add(crossV)

  const crossH = box(0.28 * scale, 0.08 * scale, 0.06 * scale, accentMat)
  crossH.position.set(0, (2.2 + yOffset) * scale, 0.4 * scale)
  group.add(crossH)

  // Bottom rim (decorative, sits right at belt boundary)
  const rim = box(1.14 * scale, 0.06 * scale, 0.74 * scale, rimMat)
  rim.position.set(0, (1.60 + yOffset) * scale, 0)
  group.add(rim)

  return group
}

function buildShoes(scale: number, yOffset: number): THREE.Group {
  const group = new THREE.Group()
  const colors = ARMOR_PIECE_COLORS.shoes
  const mat = new THREE.MeshLambertMaterial({ color: colors.color })
  const accentMat = new THREE.MeshLambertMaterial({ color: colors.accent })

  // Left armored boot
  const bootL = box(0.5 * scale, 0.55 * scale, 0.7 * scale, mat)
  bootL.position.set(-0.25 * scale, (0.28 + yOffset) * scale, 0.03 * scale)
  group.add(bootL)

  // Right armored boot
  const bootR = box(0.5 * scale, 0.55 * scale, 0.7 * scale, mat)
  bootR.position.set(0.25 * scale, (0.28 + yOffset) * scale, 0.03 * scale)
  group.add(bootR)

  // Greave sections (shin guards)
  const greaveL = box(0.48 * scale, 0.4 * scale, 0.58 * scale, accentMat)
  greaveL.position.set(-0.25 * scale, (0.65 + yOffset) * scale, 0)
  group.add(greaveL)

  const greaveR = box(0.48 * scale, 0.4 * scale, 0.58 * scale, accentMat)
  greaveR.position.set(0.25 * scale, (0.65 + yOffset) * scale, 0)
  group.add(greaveR)

  return group
}

function buildShield(scale: number, yOffset: number): THREE.Group {
  const group = new THREE.Group()
  const colors = ARMOR_PIECE_COLORS.shield
  const mat = new THREE.MeshLambertMaterial({ color: colors.color })
  const accentMat = new THREE.MeshLambertMaterial({ color: colors.accent })

  // Shield body on left arm
  const body = box(0.7 * scale, 1.0 * scale, 0.15 * scale, mat)
  body.position.set(-0.95 * scale, (2.0 + yOffset) * scale, 0.1 * scale)
  group.add(body)

  // Golden boss in center
  const boss = box(0.25 * scale, 0.25 * scale, 0.1 * scale, accentMat)
  boss.position.set(-0.95 * scale, (2.0 + yOffset) * scale, 0.2 * scale)
  group.add(boss)

  // Rim (top and bottom)
  const rimMat = new THREE.MeshLambertMaterial({ color: colors.accent })
  const rimTop = box(0.72 * scale, 0.08 * scale, 0.17 * scale, rimMat)
  rimTop.position.set(-0.95 * scale, (2.5 + yOffset) * scale, 0.1 * scale)
  group.add(rimTop)

  const rimBot = box(0.72 * scale, 0.08 * scale, 0.17 * scale, rimMat)
  rimBot.position.set(-0.95 * scale, (1.5 + yOffset) * scale, 0.1 * scale)
  group.add(rimBot)

  return group
}

function buildHelmet(scale: number, yOffset: number): THREE.Group {
  const group = new THREE.Group()
  const colors = ARMOR_PIECE_COLORS.helmet
  const mat = new THREE.MeshLambertMaterial({ color: colors.color })
  const accentMat = new THREE.MeshLambertMaterial({ color: colors.accent })

  // Dome over head
  const dome = box(1.1 * scale, 0.7 * scale, 1.1 * scale, mat)
  dome.position.set(0, (3.45 + yOffset) * scale, 0)
  group.add(dome)

  // Face visor
  const visor = box(0.8 * scale, 0.35 * scale, 0.15 * scale, mat)
  visor.position.set(0, (3.15 + yOffset) * scale, 0.5 * scale)
  group.add(visor)

  // Golden crest on top
  const crest = box(0.15 * scale, 0.35 * scale, 0.8 * scale, accentMat)
  crest.position.set(0, (3.85 + yOffset) * scale, 0)
  group.add(crest)

  return group
}

function buildSword(scale: number, yOffset: number): THREE.Group {
  const group = new THREE.Group()
  const colors = ARMOR_PIECE_COLORS.sword
  const bladeMat = new THREE.MeshLambertMaterial({
    color: colors.color,
    emissive: new THREE.Color(colors.color),
    emissiveIntensity: 0.3,
  })
  const accentMat = new THREE.MeshLambertMaterial({ color: colors.accent })
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 })

  // Blade
  const blade = box(0.12 * scale, 1.4 * scale, 0.06 * scale, bladeMat)
  blade.position.set(0.95 * scale, (2.5 + yOffset) * scale, 0.1 * scale)
  group.add(blade)

  // Blade tip (narrower)
  const tip = box(0.08 * scale, 0.3 * scale, 0.05 * scale, bladeMat)
  tip.position.set(0.95 * scale, (3.35 + yOffset) * scale, 0.1 * scale)
  group.add(tip)

  // Crossguard
  const crossguard = box(0.4 * scale, 0.1 * scale, 0.1 * scale, accentMat)
  crossguard.position.set(0.95 * scale, (1.75 + yOffset) * scale, 0.1 * scale)
  group.add(crossguard)

  // Grip
  const grip = box(0.1 * scale, 0.35 * scale, 0.08 * scale, gripMat)
  grip.position.set(0.95 * scale, (1.5 + yOffset) * scale, 0.1 * scale)
  group.add(grip)

  // Glowing tip point light
  const glowLight = new THREE.PointLight(colors.color, 0.6, 2)
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
