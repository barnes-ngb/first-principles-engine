import * as THREE from 'three'
import type { VoxelArmorPieceId } from '../../../core/types'
import { getBodyLayout } from './buildCharacter'

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
function taggedBox(
  w: number,
  h: number,
  d: number,
  color: THREE.Color | number,
  role: 'primary' | 'accent' | 'detail',
  name?: string,
): THREE.Mesh {
  const mesh = texturedBox(w, h, d, color)
  mesh.userData.materialRole = role
  if (name) mesh.name = name
  return mesh
}

/** Create a flat box and tag it with a material role */
function taggedFlatBox(
  w: number,
  h: number,
  d: number,
  color: THREE.Color | number,
  role: 'primary' | 'accent' | 'detail',
  name?: string,
): THREE.Mesh {
  const mesh = box(w, h, d, color)
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

// ── Armor geometry builders (Minecraft armor-layer style) ────────────
//
// Minecraft armor is a second layer that sits slightly outside the body.
// Each armor piece is the body part's shape but ~1px bigger in all dimensions.
//
// Coordinate system matches buildCharacter.ts — uses getBodyLayout() for positions.
// Key Y positions (older): legTop=15U, torsoCenter=20U, torsoTop=25U, headCenter=29.5U

// White placeholder color — tier materials override these
const W = 0xffffff

function buildHelmet(U: number, headPx: number): THREE.Group {
  const group = new THREE.Group()

  // Helmet uses HEAD-LOCAL coordinates (headGroup center = 0,0,0).
  // Head is headPx × headPx × headPx (9px for Legends proportions).
  // Crusader-style closed helmet: fully encloses the head, visor slit IS the face.
  const h = headPx // shorthand for head pixel count
  const pad = 1.6  // padding pixels beyond head on each side

  // Main dome — slightly larger than head on all sides
  const domeSize = h + pad
  const dome = taggedBox(U * domeSize, U * domeSize, U * domeSize, W, 'primary', 'helmet_dome')
  dome.position.set(0, U * 0.4, 0)
  group.add(dome)

  // Bottom brim/lip — thin strip around the bottom edge, extending outward
  const brimW = h + pad + 0.8
  const brimFront = taggedBox(U * brimW, U * 0.8, U * 1.0, W, 'accent', 'helmet_brim_front')
  brimFront.position.set(0, -U * (h / 2), U * (domeSize / 2 + 0.1))
  group.add(brimFront)
  const brimBack = taggedBox(U * brimW, U * 0.8, U * 1.0, W, 'accent', 'helmet_brim_back')
  brimBack.position.set(0, -U * (h / 2), -U * (domeSize / 2 + 0.1))
  group.add(brimBack)
  const brimL = taggedBox(U * 1.0, U * 0.8, U * domeSize, W, 'accent', 'helmet_brim_l')
  brimL.position.set(-U * (domeSize / 2 + 0.4), -U * (h / 2), 0)
  group.add(brimL)
  const brimR = taggedBox(U * 1.0, U * 0.8, U * domeSize, W, 'accent', 'helmet_brim_r')
  brimR.position.set(U * (domeSize / 2 + 0.4), -U * (h / 2), 0)
  group.add(brimR)

  // Front face plate — covers the face area
  const facePlate = taggedBox(U * h, U * (h * 0.6), U * 1.0, W, 'primary', 'helmet_faceplate')
  facePlate.position.set(0, -U * (h * 0.15), U * (domeSize / 2 - 0.2))
  group.add(facePlate)

  // Visor slit — thin dark horizontal bar across the front face
  const visor = taggedFlatBox(U * (h - 0.4), U * 1.0, U * 0.6, 0x222222, 'detail', 'helmet_visor')
  visor.position.set(0, U * 0.6, U * (domeSize / 2 + 0.4))
  group.add(visor)

  // Nose guard — vertical bar from visor slit down to chin
  const noseGuard = taggedBox(U * 1.0, U * (h * 0.45), U * 0.8, W, 'accent', 'helmet_noseguard')
  noseGuard.position.set(0, -U * (h * 0.2), U * (domeSize / 2 + 0.2))
  group.add(noseGuard)

  // Top crest — accent ridge running front to back
  const crest = taggedBox(U * 1.0, U * 1.4, U * h, W, 'accent', 'helmet_crest')
  crest.userData.isAccent = true
  crest.position.set(0, U * (domeSize / 2 + 0.8), 0)
  group.add(crest)

  // Neck guard — extends below head at the back for protection
  const neckGuard = taggedBox(U * h, U * 2.4, U * 1.4, W, 'primary', 'helmet_neckguard')
  neckGuard.position.set(0, -U * (h * 0.6), -U * (h * 0.55))
  group.add(neckGuard)

  return group
}

function buildBreastplate(U: number, layout: ReturnType<typeof getBodyLayout>): THREE.Group {
  const group = new THREE.Group()
  const { torsoCenter, torsoTop, torsoH, torsoW, torsoD, legTop, armH } = layout
  const tC = torsoCenter / U // torso center in px
  const tT = torsoTop / U   // torso top in px
  const tW = torsoW / U     // torso width in px
  const tD = torsoD / U     // torso depth in px
  const tH = torsoH / U     // torso height in px
  const lT = legTop / U     // leg top in px
  const aH = armH / U       // arm height in px

  // Main chest plate — sits ON TOP of body, slightly wider and thicker
  const chestW = tW + 1.6   // 1.6px wider than torso
  const chestH = tH + 0.4
  const chestD = tD + 3     // substantial depth so it protrudes visibly
  const chest = taggedBox(U * chestW, U * chestH, U * chestD, W, 'primary', 'breastplate_body')
  chest.position.set(0, U * tC, U * 0.5)
  group.add(chest)

  // Neck guard/collar — at torso top
  const collar = taggedBox(U * (tW - 1), U * 2.0, U * (tD + 1.5), W, 'accent', 'breastplate_collar')
  collar.position.set(0, U * (tT + 1), 0)
  group.add(collar)

  // Cross emblem on front
  const crossV = taggedFlatBox(U * 1, U * (tH * 0.5), U * 0.5, W, 'detail', 'cross_v')
  crossV.position.set(0, U * (tC + 1), U * (chestD / 2 + 0.8))
  group.add(crossV)
  const crossH = taggedFlatBox(U * (tW * 0.75), U * 1, U * 0.5, W, 'detail', 'cross_h')
  crossH.position.set(0, U * (tC + tH * 0.2), U * (chestD / 2 + 0.8))
  group.add(crossH)

  // Left pauldron (shoulder guard) — at torso top, extends past body
  const pauldronL = taggedBox(U * 4.5, U * 2.4, U * (tD + 2), W, 'primary', 'pauldron_l')
  pauldronL.position.set(-U * (tW / 2 + 2.7), U * (tT - 0.2), 0)
  pauldronL.rotation.z = THREE.MathUtils.degToRad(5)
  group.add(pauldronL)
  const pauldronLipL = taggedFlatBox(U * 4.8, U * 0.5, U * (tD + 2.4), W, 'accent', 'pauldron_lip_l')
  pauldronLipL.position.set(-U * (tW / 2 + 2.7), U * (tT - 1.4), 0)
  pauldronLipL.rotation.z = THREE.MathUtils.degToRad(5)
  group.add(pauldronLipL)

  // Right pauldron — mirror of left
  const pauldronR = taggedBox(U * 4.5, U * 2.4, U * (tD + 2), W, 'primary', 'pauldron_r')
  pauldronR.position.set(U * (tW / 2 + 2.7), U * (tT - 0.2), 0)
  pauldronR.rotation.z = THREE.MathUtils.degToRad(-5)
  group.add(pauldronR)
  const pauldronLipR = taggedFlatBox(U * 4.8, U * 0.5, U * (tD + 2.4), W, 'accent', 'pauldron_lip_r')
  pauldronLipR.position.set(U * (tW / 2 + 2.7), U * (tT - 1.4), 0)
  pauldronLipR.rotation.z = THREE.MathUtils.degToRad(-5)
  group.add(pauldronLipR)

  // Arm covers (armor sleeves) — arm-local space (shoulder pivot at Y=0)
  const armArmorW = layout.p.armPxW + 2.5  // wider than thin arm
  const armArmorH = aH * 0.8               // cover upper 80% of arm
  const armArmorD = layout.p.armPxD + 2.5
  const armArmorL = taggedBox(U * armArmorW, U * armArmorH, U * armArmorD, W, 'primary', 'arm_armor_l')
  armArmorL.position.set(0, -U * (armArmorH / 2 + 0.5), 0)
  armArmorL.userData.attachToArm = 'L'
  group.add(armArmorL)
  const armArmorR = taggedBox(U * armArmorW, U * armArmorH, U * armArmorD, W, 'primary', 'arm_armor_r')
  armArmorR.position.set(0, -U * (armArmorH / 2 + 0.5), 0)
  armArmorR.userData.attachToArm = 'R'
  group.add(armArmorR)

  // Bottom trim
  const trim = taggedBox(U * (chestW + 0.2), U * 1, U * (chestD + 0.2), W, 'accent', 'breastplate_rim')
  trim.position.set(0, U * (lT + 0.2), U * 0.5)
  group.add(trim)

  // Horizontal plate lines across the chest (layered armor plates)
  const plateSpacing = tH / 4
  for (let i = 0; i < 3; i++) {
    const plateLine = taggedFlatBox(U * (chestW - 0.4), U * 0.3, U * (chestD + 0.1), W, 'accent', `plate_line_${i}`)
    plateLine.position.set(0, U * (tT - 1 - i * plateSpacing), U * 0.5)
    group.add(plateLine)
  }

  return group
}

function buildBelt(U: number, layout: ReturnType<typeof getBodyLayout>): THREE.Group {
  const group = new THREE.Group()
  const beltY = layout.legTop // Belt sits at waist (bottom of torso / top of legs)
  const beltYpx = beltY / U
  const tW = layout.torsoW / U
  const tD = layout.torsoD / U

  // Waist band — wider and thicker than body so it wraps AROUND the torso
  const bandW = tW + 3.4  // protrude past torso edges
  const bandD = tD + 3    // protrude front/back
  const band = taggedBox(U * bandW, U * 3.2, U * bandD, W, 'primary', 'belt_band')
  band.position.y = U * beltYpx
  group.add(band)

  // Side wrap pieces
  const wrapL = taggedBox(U * 1.0, U * 3.2, U * (bandD - 1), W, 'primary', 'belt_wrap_l')
  wrapL.position.set(-U * (bandW / 2 + 0.2), U * beltYpx, 0)
  group.add(wrapL)
  const wrapR = taggedBox(U * 1.0, U * 3.2, U * (bandD - 1), W, 'primary', 'belt_wrap_r')
  wrapR.position.set(U * (bandW / 2 + 0.2), U * beltYpx, 0)
  group.add(wrapR)

  // Buckle — gold square, protruding forward
  const buckle = taggedFlatBox(U * 3.2, U * 3.0, U * 1.2, 0xC8A84E, 'accent', 'belt_buckle')
  buckle.position.set(0, U * beltYpx, U * (bandD / 2 + 0.3))
  group.add(buckle)

  // Buckle inner detail — dark inset
  const inner = taggedFlatBox(U * 1.6, U * 1.4, U * 0.3, 0x111111, 'detail', 'belt_inner')
  inner.position.set(0, U * beltYpx, U * (bandD / 2 + 1))
  group.add(inner)

  // Buckle prong
  const prong = taggedFlatBox(U * 0.3, U * 2.0, U * 0.3, 0xC8A84E, 'accent', 'belt_prong')
  prong.position.set(U * 0.4, U * beltYpx, U * (bandD / 2 + 1))
  group.add(prong)

  // Rivets along the belt
  const rivetSpacing = (bandW - 2) / 6
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue // Skip center (buckle is there)
    const rivet = taggedFlatBox(U * 0.5, U * 0.5, U * 0.5, W, 'accent', `belt_rivet_${i}`)
    rivet.position.set(i * U * rivetSpacing, U * beltYpx, U * (bandD / 2 + 0.1))
    group.add(rivet)
  }

  return group
}

function buildShoes(U: number, layout: ReturnType<typeof getBodyLayout>): THREE.Group {
  const group = new THREE.Group()
  const lW = layout.p.legPxW
  const lD = layout.p.legPxD
  const lH = layout.p.legPxH
  const legX = lW / 2 + 0.15 // match leg X offset from buildCharacter

  // Boot shaft — covers lower ~45% of each leg (proportional to longer legs)
  const bootShaftH = lH * 0.45
  const bootW = lW + 2.2   // wider than leg for armor look
  const bootD = lD + 2.2
  const bootL = taggedBox(U * bootW, U * bootShaftH, U * bootD, W, 'primary', 'boot_l')
  bootL.position.set(-U * legX, U * (bootShaftH / 2), 0)
  group.add(bootL)
  const bootR = taggedBox(U * bootW, U * bootShaftH, U * bootD, W, 'primary', 'boot_r')
  bootR.position.set(U * legX, U * (bootShaftH / 2), 0)
  group.add(bootR)

  // Boot soles — wider than boot for a shoe shape
  const soleL = taggedBox(U * (bootW + 0.4), U * 1.2, U * (bootD + 1.2), W, 'accent', 'boot_sole_l')
  soleL.position.set(-U * legX, U * 0.2, U * 0.5)
  group.add(soleL)
  const soleR = taggedBox(U * (bootW + 0.4), U * 1.2, U * (bootD + 1.2), W, 'accent', 'boot_sole_r')
  soleR.position.set(U * legX, U * 0.2, U * 0.5)
  group.add(soleR)

  // Top cuff band
  const cuffL = taggedFlatBox(U * (bootW + 0.4), U * 1.0, U * (bootD + 0.4), W, 'accent', 'boot_cuff_l')
  cuffL.position.set(-U * legX, U * (bootShaftH + 0.2), 0)
  group.add(cuffL)
  const cuffR = taggedFlatBox(U * (bootW + 0.4), U * 1.0, U * (bootD + 0.4), W, 'accent', 'boot_cuff_r')
  cuffR.position.set(U * legX, U * (bootShaftH + 0.2), 0)
  group.add(cuffR)

  // Knee guards — raised plates on front of each boot
  const kneeY = bootShaftH - 1.5
  const kneeL = taggedFlatBox(U * (lW - 0.2), U * 2.4, U * 1.2, W, 'accent', 'knee_l')
  kneeL.position.set(-U * legX, U * kneeY, U * (bootD / 2 + 0.3))
  group.add(kneeL)
  const kneeR = taggedFlatBox(U * (lW - 0.2), U * 2.4, U * 1.2, W, 'accent', 'knee_r')
  kneeR.position.set(U * legX, U * kneeY, U * (bootD / 2 + 0.3))
  group.add(kneeR)

  return group
}

function buildShield(U: number, layout: ReturnType<typeof getBodyLayout>): THREE.Group {
  // Shield positions are relative to the LEFT ARM's local space.
  // Arm pivots at shoulder (local Y=0), hand at Y=-armPxH*U.
  const group = new THREE.Group()
  group.userData.attachToArm = 'L'
  const aH = layout.p.armPxH
  const armMid = aH / 2 // arm center in px

  // Angle the shield ~15° on Y so it's not perfectly flat to camera
  group.rotation.y = THREE.MathUtils.degToRad(15)

  // Shield offset: outside the arm (negative X = away from body on left side)
  const shX = -U * 4  // Adjusted for thinner arm
  const shZ = U * 1.5 // Forward — shield presents to the front

  // Shield is tall relative to arm
  const shieldH = aH * 0.9
  const shieldW = 8

  // Main shield body
  const body = taggedBox(U * 1.6, U * shieldH, U * shieldW, W, 'primary', 'shield_body')
  body.position.set(shX, -U * (armMid + 1), shZ)
  group.add(body)

  // Bevel layers
  const bevel1 = taggedFlatBox(U * 0.3, U * (shieldH - 1.2), U * (shieldW - 1), W, 'primary', 'shield_bevel1')
  bevel1.position.set(shX - U * 0.95, -U * (armMid + 1), shZ)
  group.add(bevel1)
  const bevel2 = taggedFlatBox(U * 0.2, U * (shieldH - 2.4), U * (shieldW - 2.2), W, 'primary', 'shield_bevel2')
  bevel2.position.set(shX - U * 1.05, -U * (armMid + 1), shZ)
  group.add(bevel2)

  // Front face panel
  const face = taggedFlatBox(U * 0.3, U * (shieldH - 0.8), U * (shieldW - 0.8), W, 'accent', 'shield_face')
  face.position.set(shX - U * 0.9, -U * (armMid + 1), shZ)
  group.add(face)

  // Emblem placeholder
  group.userData.emblemX = shX - U * 1.1
  group.userData.emblemY = -U * (armMid + 1)
  group.userData.emblemZ = shZ

  // Cross emblem
  const crossV = taggedFlatBox(U * 0.2, U * (shieldH * 0.55), U * 1.0, W, 'detail', 'shield_cross_v')
  crossV.position.set(shX - U * 1.05, -U * (armMid + 1), shZ)
  group.add(crossV)
  const crossH = taggedFlatBox(U * 0.2, U * 1.0, U * 4.0, W, 'detail', 'shield_cross_h')
  crossH.position.set(shX - U * 1.05, -U * armMid, shZ)
  group.add(crossH)

  // Border frame — 4 rim boxes
  const rimTop = taggedBox(U * 1.8, U * 0.6, U * (shieldW + 0.4), W, 'accent', 'shield_rim_top')
  rimTop.position.set(shX, -U * (armMid + 1 - shieldH / 2 + 0.3), shZ)
  group.add(rimTop)
  const rimBot = taggedBox(U * 1.8, U * 0.6, U * (shieldW + 0.4), W, 'accent', 'shield_rim_bot')
  rimBot.position.set(shX, -U * (armMid + 1 + shieldH / 2 - 0.3), shZ)
  group.add(rimBot)
  const rimL = taggedBox(U * 1.8, U * shieldH, U * 0.6, W, 'accent', 'shield_rim_l')
  rimL.position.set(shX, -U * (armMid + 1), shZ + U * (shieldW / 2 + 0.1))
  group.add(rimL)
  const rimR = taggedBox(U * 1.8, U * shieldH, U * 0.6, W, 'accent', 'shield_rim_r')
  rimR.position.set(shX, -U * (armMid + 1), shZ - U * (shieldW / 2 + 0.1))
  group.add(rimR)

  // Center boss
  const boss = taggedFlatBox(U * 0.5, U * 2.4, U * 2.4, W, 'accent', 'shield_boss')
  boss.userData.isAccent = true
  boss.position.set(shX - U * 1.2, -U * (armMid + 1), shZ)
  group.add(boss)

  // Vertical grain lines
  for (let i = -2; i <= 2; i++) {
    const grain = taggedFlatBox(U * 0.15, U * (shieldH - 1.6), U * 0.15, W, 'detail', `shield_grain_${i}`)
    grain.position.set(shX - U * 1.0, -U * (armMid + 1), shZ + i * U * 1.5)
    group.add(grain)
  }

  return group
}

function buildSword(U: number, layout: ReturnType<typeof getBodyLayout>): THREE.Group {
  // Sword positions are relative to the RIGHT ARM's local space.
  // Arm pivots at shoulder (local Y=0), hand at Y=-armPxH*U.
  const group = new THREE.Group()
  group.userData.attachToArm = 'R'
  const aH = layout.p.armPxH
  const handY = aH - 1 // 1px above bottom of arm

  // Sword offset: outside the arm (positive X = away from body center)
  const sX = U * 3.5 // Adjusted for thinner arm

  // Handle/grip — dark brown leather, at hand position
  const grip = box(U * 1.2, U * 4, U * 1.5, 0x5D4037)
  grip.userData.materialRole = 'detail'
  grip.name = 'sword_grip'
  grip.position.set(sX, -U * handY, U * 1)
  group.add(grip)

  // Crossguard
  const guardY = handY - 2.5
  const guard = taggedFlatBox(U * 1.2, U * 1.5, U * 6, W, 'accent', 'sword_crossguard')
  guard.userData.isAccent = true
  guard.position.set(sX, -U * guardY, U * 1)
  group.add(guard)

  // Blade — two sections: wider base near hilt, narrower upper
  const bladeBaseMat = new THREE.MeshLambertMaterial({
    color: 0x87ceeb,
    emissive: new THREE.Color(0x2196f3),
    emissiveIntensity: 0.35,
  })
  const bladeBaseY = guardY - 5 // extends up from crossguard
  const bladeBase = new THREE.Mesh(
    new THREE.BoxGeometry(U * 1, U * 8, U * 2.4),
    bladeBaseMat,
  )
  bladeBase.name = 'sword_blade_base'
  bladeBase.userData.materialRole = 'sword_blade'
  bladeBase.position.set(sX, -U * bladeBaseY, U * 1)
  group.add(bladeBase)

  // Upper blade (narrower, toward tip)
  const bladeUpperY = bladeBaseY - 8
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
  bladeUpper.position.set(sX, -U * bladeUpperY, U * 1)
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
  edge.position.set(sX, -U * edgeCenterY, U * 2.1)
  group.add(edge)

  // Blade tip
  const tipY = bladeUpperY - 5
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
  tip.position.set(sX, -U * tipY, U * 1)
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
  glow.position.set(sX, -U * edgeCenterY, U * 1)
  group.add(glow)

  // Pommel — below grip
  const pommel = taggedFlatBox(U * 1.6, U * 1.2, U * 1.6, W, 'accent', 'sword_pommel')
  pommel.userData.isAccent = true
  pommel.position.set(sX, -U * (handY + 2.5), U * 1)
  group.add(pommel)

  // Point light for glow effect
  const glowLight = new THREE.PointLight(0x87ceeb, 0.8, 3)
  glowLight.position.set(sX, -U * edgeCenterY, U * 2)
  group.add(glowLight)

  return group
}

// ── Main builder ────────────────────────────────────────────────────

export function buildArmorPiece(
  pieceId: VoxelArmorPieceId,
  ageGroup: 'older' | 'younger',
): THREE.Group {
  const layout = getBodyLayout(ageGroup)
  const { U } = layout

  let group: THREE.Group

  switch (pieceId) {
    case 'helmet':
      group = buildHelmet(U, layout.p.headPx)
      break
    case 'breastplate':
      group = buildBreastplate(U, layout)
      break
    case 'belt':
      group = buildBelt(U, layout)
      break
    case 'shoes':
      group = buildShoes(U, layout)
      break
    case 'shield':
      group = buildShield(U, layout)
      break
    case 'sword':
      group = buildSword(U, layout)
      break
  }

  group.name = pieceId
  group.visible = false // Hidden until equipped

  return group
}
