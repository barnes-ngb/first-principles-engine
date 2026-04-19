import * as THREE from 'three'
import type { CharacterProportions, VoxelArmorPieceId } from '../../../core/types'
import { getBodyLayout } from './buildCharacter'
import {
  buildWoodHelmet, buildWoodBreastplate, buildWoodBelt,
  buildWoodShoes, buildWoodShield, buildWoodSword,
} from './armorGeometryWood'
import {
  buildStoneHelmet, buildStoneBreastplate, buildStoneBelt,
  buildStoneShoes, buildStoneShield, buildStoneSword,
} from './armorGeometryStone'

// ── Helpers ─────────────────────────────────────────────────────────

/** Create a textured box with per-face color variation (shiny armor material) */
function texturedBox(
  w: number,
  h: number,
  d: number,
  baseColor: THREE.Color | number,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const color = baseColor instanceof THREE.Color ? baseColor : new THREE.Color(baseColor)
  const materials: THREE.MeshPhongMaterial[] = []
  for (let i = 0; i < 6; i++) {
    const variation = 0.95 + Math.random() * 0.1
    const faceColor = color.clone().multiplyScalar(variation)
    materials.push(new THREE.MeshPhongMaterial({
      color: faceColor,
      specular: 0x444444,
      shininess: 15,
      flatShading: true,
    }))
  }
  return new THREE.Mesh(geo, materials)
}

/** Create a flat-colored box for small detail pieces (shiny armor material) */
function box(
  w: number,
  h: number,
  d: number,
  color: THREE.Color | number,
): THREE.Mesh {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color)
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshPhongMaterial({
      color: c,
      specular: 0x444444,
      shininess: 15,
      flatShading: true,
    }),
  )
}

/** Create a textured box and tag it with a material role for tier coloring */
export function taggedBox(
  w: number,
  h: number,
  d: number,
  color: THREE.Color | number,
  role: 'primary' | 'secondary' | 'accent' | 'detail',
  name?: string,
): THREE.Mesh {
  const mesh = texturedBox(w, h, d, color)
  mesh.userData.materialRole = role
  if (name) mesh.name = name
  return mesh
}

/** Create a flat box and tag it with a material role */
export function taggedFlatBox(
  w: number,
  h: number,
  d: number,
  color: THREE.Color | number,
  role: 'primary' | 'secondary' | 'accent' | 'detail',
  name?: string,
): THREE.Mesh {
  const mesh = box(w, h, d, color)
  mesh.userData.materialRole = role
  if (name) mesh.name = name
  return mesh
}

/** White placeholder — tier materials override these. Exported for tier builders. */
export const W = 0xffffff

/** Body layout type shared across tier geometry builders. */
export type BodyLayout = ReturnType<typeof getBodyLayout>

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

// ── Armor geometry builders ─────────────────────────────────────────
//
// Armor is a second layer slightly outside the body.
// Uses getBodyLayout() world-unit dimensions + U for detail padding.
// All positions in character-root space (feet at Y=0) unless attached to arm.
//
// Iron tier is the full knight geometry. Wood and Stone variants live in
// armorGeometryWood.ts / armorGeometryStone.ts. Gold/Diamond/Netherite fall
// through to Iron until Phase B.

function buildIronHelmet(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, headSize } = layout

  // Helmet uses HEAD-LOCAL coordinates (headGroup center = 0,0,0).
  // Open-face helmet: covers top, sides, and back of head.
  // Front is open — face (eyes, nose, mouth) fully visible.
  const h = headSize
  const pad = U * 1.6

  // TOP DOME — wide cap covering upper portion of head only
  const domeW = h + pad
  const domeH = h * 0.45
  const domeD = h + pad
  const dome = taggedBox(domeW, domeH, domeD, W, 'primary', 'helmet_dome')
  // Bottom edge sits just above eye level
  dome.position.set(0, h * 0.08 + domeH / 2, 0)
  group.add(dome)

  // BACK PANEL — extends from dome down to cover back of head
  const backH = h * 0.75
  const back = taggedBox(domeW - U * 2, backH, U * 1.4, W, 'primary', 'helmet_back')
  back.position.set(0, h * 0.08 - backH / 2 + U * 0.5, -(domeD / 2 - U * 0.3))
  group.add(back)

  // SIDE CHEEK GUARDS — cover sides of head, pulled back from face
  const sideH = h * 0.55
  const sideD = h * 0.45
  const sideL = taggedBox(U * 1.4, sideH, sideD, W, 'accent', 'helmet_side_l')
  sideL.position.set(-(domeW / 2 - U * 0.2), -h * 0.05, -h * 0.12)
  group.add(sideL)
  const sideR = taggedBox(U * 1.4, sideH, sideD, W, 'accent', 'helmet_side_r')
  sideR.position.set(domeW / 2 - U * 0.2, -h * 0.05, -h * 0.12)
  group.add(sideR)

  // BROW BAND — accent strip at top of face opening (like a visor flipped up)
  const browW = domeW + U * 0.4
  const brow = taggedBox(browW, U * 1.4, U * 1.0, W, 'accent', 'helmet_brow')
  brow.position.set(0, h * 0.08, domeD / 2 + U * 0.2)
  group.add(brow)

  // BOTTOM BRIM — back and sides only (front is open)
  const brimY = -h / 2
  const brimBack = taggedBox(domeW + U * 0.4, U * 0.8, U * 1.0, W, 'accent', 'helmet_brim_back')
  brimBack.position.set(0, brimY, -(domeD / 2 + U * 0.1))
  group.add(brimBack)
  const brimL = taggedBox(U * 1.0, U * 0.8, domeD * 0.6, W, 'accent', 'helmet_brim_l')
  brimL.position.set(-(domeW / 2 + U * 0.4), brimY, -h * 0.15)
  group.add(brimL)
  const brimR = taggedBox(U * 1.0, U * 0.8, domeD * 0.6, W, 'accent', 'helmet_brim_r')
  brimR.position.set(domeW / 2 + U * 0.4, brimY, -h * 0.15)
  group.add(brimR)

  // TOP CREST — accent ridge front to back
  const domeTopY = h * 0.08 + domeH
  const crest = taggedBox(U * 1.0, U * 1.4, h, W, 'accent', 'helmet_crest')
  crest.userData.isAccent = true
  crest.position.set(0, domeTopY + U * 0.5, 0)
  group.add(crest)

  // NECK GUARD — extends below head at the back
  const neckGuard = taggedBox(h, U * 2.4, U * 1.4, W, 'primary', 'helmet_neckguard')
  neckGuard.position.set(0, -h * 0.6, -h * 0.55)
  group.add(neckGuard)

  return group
}

function buildIronBreastplate(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, torsoCenter, torsoTop, torsoH, torsoW, torsoD, legTop, armH } = layout

  // Main chest plate — sits ON TOP of body, slightly wider and thicker
  const chestW = torsoW + U * 1.6
  const chestH = torsoH + U * 0.4
  const chestD = torsoD + U * 3
  const chest = taggedBox(chestW, chestH, chestD, W, 'primary', 'breastplate_body')
  chest.position.set(0, torsoCenter, U * 0.5)
  group.add(chest)

  // Neck guard/collar
  const collar = taggedBox(torsoW - U * 1, U * 2.0, torsoD + U * 1.5, W, 'accent', 'breastplate_collar')
  collar.position.set(0, torsoTop + U * 1, 0)
  group.add(collar)

  // Cross emblem on front
  const crossV = taggedFlatBox(U * 1, torsoH * 0.5, U * 0.5, W, 'detail', 'cross_v')
  crossV.position.set(0, torsoCenter + U * 1, chestD / 2 + U * 0.8)
  group.add(crossV)
  const crossH = taggedFlatBox(torsoW * 0.75, U * 1, U * 0.5, W, 'detail', 'cross_h')
  crossH.position.set(0, torsoCenter + torsoH * 0.2, chestD / 2 + U * 0.8)
  group.add(crossH)

  // Pauldrons (shoulder guards)
  const pauldronL = taggedBox(U * 4.5, U * 2.4, torsoD + U * 2, W, 'primary', 'pauldron_l')
  pauldronL.position.set(-(torsoW / 2 + U * 2.7), torsoTop - U * 0.2, 0)
  pauldronL.rotation.z = THREE.MathUtils.degToRad(5)
  group.add(pauldronL)
  const pauldronLipL = taggedFlatBox(U * 4.8, U * 0.5, torsoD + U * 2.4, W, 'accent', 'pauldron_lip_l')
  pauldronLipL.position.set(-(torsoW / 2 + U * 2.7), torsoTop - U * 1.4, 0)
  pauldronLipL.rotation.z = THREE.MathUtils.degToRad(5)
  group.add(pauldronLipL)

  const pauldronR = taggedBox(U * 4.5, U * 2.4, torsoD + U * 2, W, 'primary', 'pauldron_r')
  pauldronR.position.set(torsoW / 2 + U * 2.7, torsoTop - U * 0.2, 0)
  pauldronR.rotation.z = THREE.MathUtils.degToRad(-5)
  group.add(pauldronR)
  const pauldronLipR = taggedFlatBox(U * 4.8, U * 0.5, torsoD + U * 2.4, W, 'accent', 'pauldron_lip_r')
  pauldronLipR.position.set(torsoW / 2 + U * 2.7, torsoTop - U * 1.4, 0)
  pauldronLipR.rotation.z = THREE.MathUtils.degToRad(-5)
  group.add(pauldronLipR)

  // Arm covers — arm-local space (shoulder pivot at Y=0)
  const armArmorW = layout.armW + U * 2
  const armArmorH = armH * 0.8
  const armArmorD = layout.armW + U * 2
  const armArmorL = taggedBox(armArmorW, armArmorH, armArmorD, W, 'primary', 'arm_armor_l')
  armArmorL.position.set(0, -(armArmorH / 2 + U * 0.5), 0)
  armArmorL.userData.attachToArm = 'L'
  group.add(armArmorL)
  const armArmorR = taggedBox(armArmorW, armArmorH, armArmorD, W, 'primary', 'arm_armor_r')
  armArmorR.position.set(0, -(armArmorH / 2 + U * 0.5), 0)
  armArmorR.userData.attachToArm = 'R'
  group.add(armArmorR)

  // Bottom trim
  const trim = taggedBox(chestW + U * 0.2, U * 1, chestD + U * 0.2, W, 'accent', 'breastplate_rim')
  trim.position.set(0, legTop + U * 0.2, U * 0.5)
  group.add(trim)

  // Horizontal plate lines
  const plateSpacing = torsoH / 4
  for (let i = 0; i < 3; i++) {
    const plateLine = taggedFlatBox(chestW - U * 0.4, U * 0.3, chestD + U * 0.1, W, 'accent', `plate_line_${i}`)
    plateLine.position.set(0, torsoTop - U * 1 - i * plateSpacing, U * 0.5)
    group.add(plateLine)
  }

  return group
}

function buildIronBelt(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, legTop, torsoW, torsoD } = layout

  // Waist band — wider and thicker than body
  const bandW = torsoW + U * 3.4
  const bandD = torsoD + U * 3
  const band = taggedBox(bandW, U * 3.2, bandD, W, 'primary', 'belt_band')
  band.position.y = legTop
  group.add(band)

  // Side wrap pieces
  const wrapL = taggedBox(U * 1.0, U * 3.2, bandD - U * 1, W, 'primary', 'belt_wrap_l')
  wrapL.position.set(-(bandW / 2 + U * 0.2), legTop, 0)
  group.add(wrapL)
  const wrapR = taggedBox(U * 1.0, U * 3.2, bandD - U * 1, W, 'primary', 'belt_wrap_r')
  wrapR.position.set(bandW / 2 + U * 0.2, legTop, 0)
  group.add(wrapR)

  // Buckle — gold square, protruding forward
  const buckle = taggedFlatBox(U * 3.2, U * 3.0, U * 1.2, 0xC8A84E, 'accent', 'belt_buckle')
  buckle.position.set(0, legTop, bandD / 2 + U * 0.3)
  group.add(buckle)

  // Buckle inner detail
  const inner = taggedFlatBox(U * 1.6, U * 1.4, U * 0.3, 0x111111, 'detail', 'belt_inner')
  inner.position.set(0, legTop, bandD / 2 + U * 1)
  group.add(inner)

  // Buckle prong
  const prong = taggedFlatBox(U * 0.3, U * 2.0, U * 0.3, 0xC8A84E, 'accent', 'belt_prong')
  prong.position.set(U * 0.4, legTop, bandD / 2 + U * 1)
  group.add(prong)

  // Rivets along the belt
  const rivetSpacing = (bandW - U * 2) / 6
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue
    const rivet = taggedFlatBox(U * 0.5, U * 0.5, U * 0.5, W, 'accent', `belt_rivet_${i}`)
    rivet.position.set(i * rivetSpacing, legTop, bandD / 2 + U * 0.1)
    group.add(rivet)
  }

  return group
}

function buildIronShoes(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, legW, legD, legH } = layout
  const legX = legW / 2 + U * 0.15

  // Boot shaft — covers lower ~45% of each leg (armor boots are taller than base boots)
  const bootShaftH = legH * 0.45
  const bootW = legW + U * 2.2
  const bootD = legD + U * 2.2
  const bootL = taggedBox(bootW, bootShaftH, bootD, W, 'primary', 'boot_l')
  bootL.position.set(-legX, bootShaftH / 2, 0)
  group.add(bootL)
  const bootR = taggedBox(bootW, bootShaftH, bootD, W, 'primary', 'boot_r')
  bootR.position.set(legX, bootShaftH / 2, 0)
  group.add(bootR)

  // Boot soles
  const soleL = taggedBox(bootW + U * 0.4, U * 1.2, bootD + U * 1.2, W, 'accent', 'boot_sole_l')
  soleL.position.set(-legX, U * 0.2, U * 0.5)
  group.add(soleL)
  const soleR = taggedBox(bootW + U * 0.4, U * 1.2, bootD + U * 1.2, W, 'accent', 'boot_sole_r')
  soleR.position.set(legX, U * 0.2, U * 0.5)
  group.add(soleR)

  // Top cuff band
  const cuffL = taggedFlatBox(bootW + U * 0.4, U * 1.0, bootD + U * 0.4, W, 'accent', 'boot_cuff_l')
  cuffL.position.set(-legX, bootShaftH + U * 0.2, 0)
  group.add(cuffL)
  const cuffR = taggedFlatBox(bootW + U * 0.4, U * 1.0, bootD + U * 0.4, W, 'accent', 'boot_cuff_r')
  cuffR.position.set(legX, bootShaftH + U * 0.2, 0)
  group.add(cuffR)

  // Knee guards
  const kneeY = bootShaftH - U * 1.5
  const kneeL = taggedFlatBox(legW - U * 0.2, U * 2.4, U * 1.2, W, 'accent', 'knee_l')
  kneeL.position.set(-legX, kneeY, bootD / 2 + U * 0.3)
  group.add(kneeL)
  const kneeR = taggedFlatBox(legW - U * 0.2, U * 2.4, U * 1.2, W, 'accent', 'knee_r')
  kneeR.position.set(legX, kneeY, bootD / 2 + U * 0.3)
  group.add(kneeR)

  return group
}

function buildIronShield(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  group.userData.attachToArm = 'L'
  const { U, armH } = layout
  const armMid = armH / 2

  // IMPORTANT:
  // Keep attachment translation (outward from arm + forward from torso) in parent-local space,
  // and apply facing yaw only to a child "visual" group.
  // Rotating the same node that also carries the attachment offset couples axes
  // (x/z mix) and can pull the shield inward across the chest when arm pose changes.
  const visual = new THREE.Group()
  visual.name = 'shield_visual'
  visual.rotation.y = THREE.MathUtils.degToRad(75)
  visual.rotation.x = -1.2 // ~70° tilt so shield face points forward/outward
  group.add(visual)

  // Attachment offset from arm pivot: outward (-X), down along forearm (-Y), forward (+Z)
  const anchorX = -U * 2.4
  const anchorY = -(armMid + U * 1)
  const anchorZ = U * 4.0
  visual.position.set(anchorX, anchorY, anchorZ)

  // Shield-local center
  const shX = 0
  const shZ = 0

  const shieldH = armH * 0.9
  const shieldW = U * 8

  // Main shield body
  const body = taggedBox(U * 1.6, shieldH, shieldW, W, 'primary', 'shield_body')
  body.position.set(shX, 0, shZ)
  visual.add(body)

  // Bevel layers
  const bevel1 = taggedFlatBox(U * 0.3, shieldH - U * 1.2, shieldW - U * 1, W, 'primary', 'shield_bevel1')
  bevel1.position.set(shX - U * 0.95, 0, shZ)
  visual.add(bevel1)
  const bevel2 = taggedFlatBox(U * 0.2, shieldH - U * 2.4, shieldW - U * 2.2, W, 'primary', 'shield_bevel2')
  bevel2.position.set(shX - U * 1.05, 0, shZ)
  visual.add(bevel2)

  // Front face panel
  const face = taggedFlatBox(U * 0.3, shieldH - U * 0.8, shieldW - U * 0.8, W, 'accent', 'shield_face')
  face.position.set(shX - U * 0.9, 0, shZ)
  visual.add(face)

  // Emblem placeholder
  const emblemAnchor = new THREE.Vector3(shX - U * 1.1, 0, shZ)
    .applyEuler(visual.rotation)
    .add(visual.position)
  group.userData.emblemX = emblemAnchor.x
  group.userData.emblemY = emblemAnchor.y
  group.userData.emblemZ = emblemAnchor.z

  // Cross emblem
  const crossV = taggedFlatBox(U * 0.2, shieldH * 0.55, U * 1.0, W, 'detail', 'shield_cross_v')
  crossV.position.set(shX - U * 1.05, 0, shZ)
  visual.add(crossV)
  const crossH = taggedFlatBox(U * 0.2, U * 1.0, U * 4.0, W, 'detail', 'shield_cross_h')
  crossH.position.set(shX - U * 1.05, U * 1, shZ)
  visual.add(crossH)

  // Border frame
  const rimTop = taggedBox(U * 1.8, U * 0.6, shieldW + U * 0.4, W, 'accent', 'shield_rim_top')
  rimTop.position.set(shX, -(shieldH / 2 - U * 0.3), shZ)
  visual.add(rimTop)
  const rimBot = taggedBox(U * 1.8, U * 0.6, shieldW + U * 0.4, W, 'accent', 'shield_rim_bot')
  rimBot.position.set(shX, shieldH / 2 - U * 0.3, shZ)
  visual.add(rimBot)
  const rimL = taggedBox(U * 1.8, shieldH, U * 0.6, W, 'accent', 'shield_rim_l')
  rimL.position.set(shX, 0, shZ + shieldW / 2 + U * 0.1)
  visual.add(rimL)
  const rimR = taggedBox(U * 1.8, shieldH, U * 0.6, W, 'accent', 'shield_rim_r')
  rimR.position.set(shX, 0, shZ - shieldW / 2 - U * 0.1)
  visual.add(rimR)

  // Center boss
  const boss = taggedFlatBox(U * 0.5, U * 2.4, U * 2.4, W, 'accent', 'shield_boss')
  boss.userData.isAccent = true
  boss.position.set(shX - U * 1.2, 0, shZ)
  visual.add(boss)

  // Vertical grain lines
  for (let i = -2; i <= 2; i++) {
    const grain = taggedFlatBox(U * 0.15, shieldH - U * 1.6, U * 0.15, W, 'detail', `shield_grain_${i}`)
    grain.position.set(shX - U * 1.0, 0, shZ + i * U * 1.5)
    visual.add(grain)
  }

  return group
}

function buildIronSword(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  group.userData.attachToArm = 'R'
  group.rotation.x = 0.15  // slight forward angle (gripped)
  group.rotation.z = 0.1   // slight outward cant
  const { U, armH } = layout
  const handY = armH - U * 1

  // Sword offset — slightly outward from arm center, near hand, slightly forward
  const sX = U * 2.4

  // Handle/grip
  const grip = box(U * 1.2, U * 4, U * 1.5, 0x5D4037)
  grip.userData.materialRole = 'detail'
  grip.name = 'sword_grip'
  grip.position.set(sX, -handY, U * 1)
  group.add(grip)

  // Crossguard
  const guardY = handY - U * 2.5
  const guard = taggedFlatBox(U * 1.2, U * 1.5, U * 6, W, 'accent', 'sword_crossguard')
  guard.userData.isAccent = true
  guard.position.set(sX, -guardY, U * 1)
  group.add(guard)

  // Blade — two sections
  const bladeBaseMat = new THREE.MeshLambertMaterial({
    color: 0x87ceeb,
    emissive: new THREE.Color(0x2196f3),
    emissiveIntensity: 0.35,
  })
  const bladeBaseY = guardY - U * 5
  const bladeBase = new THREE.Mesh(
    new THREE.BoxGeometry(U * 1, U * 8, U * 2.4),
    bladeBaseMat,
  )
  bladeBase.name = 'sword_blade_base'
  bladeBase.userData.materialRole = 'sword_blade'
  bladeBase.position.set(sX, -bladeBaseY, U * 1)
  group.add(bladeBase)

  const bladeUpperY = bladeBaseY - U * 8
  const bladeTipMat = new THREE.MeshLambertMaterial({
    color: 0x87ceeb,
    emissive: new THREE.Color(0x2196f3),
    emissiveIntensity: 0.35,
  })
  const bladeUpper = new THREE.Mesh(
    new THREE.BoxGeometry(U * 1, U * 8, U * 1.6),
    bladeTipMat,
  )
  bladeUpper.name = 'sword_blade_upper'
  bladeUpper.userData.materialRole = 'sword_blade'
  bladeUpper.position.set(sX, -bladeUpperY, U * 1)
  group.add(bladeUpper)

  // Blade edge highlight
  const edgeMat = new THREE.MeshLambertMaterial({
    color: 0xb0e0e6,
    emissive: new THREE.Color(0x4fc3f7),
    emissiveIntensity: 0.4,
  })
  const edgeCenterY = (bladeBaseY + bladeUpperY) / 2
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(U * 0.3, U * 14, U * 0.5),
    edgeMat,
  )
  edge.name = 'sword_edge'
  edge.userData.materialRole = 'sword_blade'
  edge.position.set(sX, -edgeCenterY, U * 2.1)
  group.add(edge)

  // Blade tip
  const tipY = bladeUpperY - U * 5
  const tipMat = new THREE.MeshLambertMaterial({
    color: 0xadd8e6,
    emissive: new THREE.Color(0x2196f3),
    emissiveIntensity: 0.25,
  })
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(U * 0.8, U * 2, U * 1.0),
    tipMat,
  )
  tip.name = 'sword_tip'
  tip.userData.materialRole = 'sword_blade'
  tip.position.set(sX, -tipY, U * 1)
  group.add(tip)

  // Enchantment glow
  const glowMat = new THREE.MeshLambertMaterial({
    color: 0x87ceeb,
    emissive: new THREE.Color(0x2196f3),
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.15,
  })
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(U * 2.2, U * 18, U * 3.2),
    glowMat,
  )
  glow.name = 'sword_glow'
  glow.userData.materialRole = 'sword_blade'
  glow.position.set(sX, -edgeCenterY, U * 1)
  group.add(glow)

  // Pommel
  const pommel = taggedFlatBox(U * 1.6, U * 1.2, U * 1.6, W, 'accent', 'sword_pommel')
  pommel.userData.isAccent = true
  pommel.position.set(sX, -(handY + U * 2.5), U * 1)
  group.add(pommel)

  // Point light for glow effect
  const glowLight = new THREE.PointLight(0x87ceeb, 0.8, 3)
  glowLight.position.set(sX, -edgeCenterY, U * 2)
  group.add(glowLight)

  return group
}

// ── Tier dispatchers ────────────────────────────────────────────────
// Gold/Diamond/Netherite currently fall through to Iron until Phase B.

function normalizeTier(tier?: string): 'WOOD' | 'STONE' | 'IRON' {
  const t = tier?.toUpperCase() ?? 'IRON'
  if (t === 'WOOD') return 'WOOD'
  if (t === 'STONE') return 'STONE'
  return 'IRON'
}

function buildHelmet(layout: BodyLayout, tier: string): THREE.Group {
  switch (normalizeTier(tier)) {
    case 'WOOD': return buildWoodHelmet(layout)
    case 'STONE': return buildStoneHelmet(layout)
    default: return buildIronHelmet(layout)
  }
}

function buildBreastplate(layout: BodyLayout, tier: string): THREE.Group {
  switch (normalizeTier(tier)) {
    case 'WOOD': return buildWoodBreastplate(layout)
    case 'STONE': return buildStoneBreastplate(layout)
    default: return buildIronBreastplate(layout)
  }
}

function buildBelt(layout: BodyLayout, tier: string): THREE.Group {
  switch (normalizeTier(tier)) {
    case 'WOOD': return buildWoodBelt(layout)
    case 'STONE': return buildStoneBelt(layout)
    default: return buildIronBelt(layout)
  }
}

function buildShoes(layout: BodyLayout, tier: string): THREE.Group {
  switch (normalizeTier(tier)) {
    case 'WOOD': return buildWoodShoes(layout)
    case 'STONE': return buildStoneShoes(layout)
    default: return buildIronShoes(layout)
  }
}

function buildShield(layout: BodyLayout, tier: string): THREE.Group {
  switch (normalizeTier(tier)) {
    case 'WOOD': return buildWoodShield(layout)
    case 'STONE': return buildStoneShield(layout)
    default: return buildIronShield(layout)
  }
}

function buildSword(layout: BodyLayout, tier: string): THREE.Group {
  switch (normalizeTier(tier)) {
    case 'WOOD': return buildWoodSword(layout)
    case 'STONE': return buildStoneSword(layout)
    default: return buildIronSword(layout)
  }
}

// ── Main builder ────────────────────────────────────────────────────

export function buildArmorPiece(
  pieceId: VoxelArmorPieceId,
  ageGroup: 'older' | 'younger',
  customProportions?: Partial<CharacterProportions>,
  tier: string = 'IRON',
): THREE.Group {
  const layout = getBodyLayout(ageGroup, customProportions)

  // DEBUG: temporary — verify which tier each piece is rendering at.
  // eslint-disable-next-line no-console
  console.log(`[ARMOR] Building ${pieceId} at tier ${tier}, ageGroup=${ageGroup}`)

  let group: THREE.Group

  switch (pieceId) {
    case 'helmet':
      group = buildHelmet(layout, tier)
      break
    case 'breastplate':
      group = buildBreastplate(layout, tier)
      break
    case 'belt':
      group = buildBelt(layout, tier)
      break
    case 'shoes':
      group = buildShoes(layout, tier)
      break
    case 'shield':
      group = buildShield(layout, tier)
      break
    case 'sword':
      group = buildSword(layout, tier)
      break
  }

  group.name = pieceId
  group.visible = false // Hidden until equipped

  return group
}
