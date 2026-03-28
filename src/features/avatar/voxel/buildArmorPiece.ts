import * as THREE from 'three'
import type { VoxelArmorPieceId } from '../../../core/types'

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
// Coordinate system matches buildCharacter.ts:
//   U = 0.125 * scale (1 Minecraft pixel)
//   Head center: Y = U*28
//   Body center: Y = U*18
//   Legs center: Y = U*6
//   Feet: Y = U*1

// White placeholder color — tier materials override these
const W = 0xffffff

function buildHelmet(U: number): THREE.Group {
  const group = new THREE.Group()

  // Helmet uses HEAD-LOCAL coordinates (headGroup center = 0,0,0).
  // Head is 8U × 8U × 8U spanning from -4U to +4U on all axes.
  // Crusader-style closed helmet: fully encloses the head, visor slit IS the face.

  // Main dome — 0.06-scale-units larger on each side than the head (9.6U vs 8U)
  const dome = taggedBox(U * 9.6, U * 9.6, U * 9.6, W, 'primary', 'helmet_dome')
  dome.position.set(0, U * 0.4, 0)
  group.add(dome)

  // Bottom brim/lip — thin strip around the bottom edge, extending outward
  const brimFront = taggedBox(U * 10.4, U * 0.8, U * 1.0, W, 'accent', 'helmet_brim_front')
  brimFront.position.set(0, -U * 4.0, U * 4.9)
  group.add(brimFront)
  const brimBack = taggedBox(U * 10.4, U * 0.8, U * 1.0, W, 'accent', 'helmet_brim_back')
  brimBack.position.set(0, -U * 4.0, -U * 4.9)
  group.add(brimBack)
  const brimL = taggedBox(U * 1.0, U * 0.8, U * 9.6, W, 'accent', 'helmet_brim_l')
  brimL.position.set(-U * 5.2, -U * 4.0, 0)
  group.add(brimL)
  const brimR = taggedBox(U * 1.0, U * 0.8, U * 9.6, W, 'accent', 'helmet_brim_r')
  brimR.position.set(U * 5.2, -U * 4.0, 0)
  group.add(brimR)

  // Front face plate — covers the face area (the dome alone leaves gaps at the front)
  const facePlate = taggedBox(U * 8.0, U * 5.0, U * 1.0, W, 'primary', 'helmet_faceplate')
  facePlate.position.set(0, -U * 1.2, U * 4.6)
  group.add(facePlate)

  // Visor slit — thin dark horizontal bar across the front face (~40% from top)
  const visor = taggedFlatBox(U * 7.6, U * 1.0, U * 0.6, 0x222222, 'detail', 'helmet_visor')
  visor.position.set(0, U * 0.6, U * 5.2)
  group.add(visor)

  // Nose guard — vertical bar from visor slit down to chin, classic crusader look
  const noseGuard = taggedBox(U * 1.0, U * 3.6, U * 0.8, W, 'accent', 'helmet_noseguard')
  noseGuard.position.set(0, -U * 1.6, U * 5.0)
  group.add(noseGuard)

  // Top crest — accent ridge running front to back
  const crest = taggedBox(U * 1.0, U * 1.4, U * 8.0, W, 'accent', 'helmet_crest')
  crest.userData.isAccent = true
  crest.position.set(0, U * 5.6, 0)
  group.add(crest)

  // Neck guard — extends below head at the back for protection
  const neckGuard = taggedBox(U * 8.0, U * 2.4, U * 1.4, W, 'primary', 'helmet_neckguard')
  neckGuard.position.set(0, -U * 4.8, -U * 4.4)
  group.add(neckGuard)

  return group
}

function buildBreastplate(U: number): THREE.Group {
  const group = new THREE.Group()

  // Main chest plate — body is 8×12×4, this is wider (+0.08 each side) and thicker (+0.06 front)
  // Visibly sits ON TOP of the body, not flush.
  const chest = taggedBox(U * 9.6, U * 12.4, U * 7, W, 'primary', 'breastplate_body')
  chest.position.set(0, U * 18, U * 0.5) // Shifted forward slightly so front protrudes
  group.add(chest)

  // Neck guard/collar — thin box at top center, rising above torso top
  const collar = taggedBox(U * 7, U * 2.0, U * 5.5, W, 'accent', 'breastplate_collar')
  collar.position.set(0, U * 25, 0)
  group.add(collar)

  // Cross emblem on front — darker shade of tier color
  const crossV = taggedFlatBox(U * 1, U * 6, U * 0.5, W, 'detail', 'cross_v')
  crossV.position.set(0, U * 19, U * 4.3)
  group.add(crossV)
  const crossH = taggedFlatBox(U * 5.4, U * 1, U * 0.5, W, 'detail', 'cross_h')
  crossH.position.set(0, U * 21, U * 4.3)
  group.add(crossH)

  // Left pauldron (shoulder guard) — extends PAST body width outward
  const pauldronL = taggedBox(U * 4.5, U * 2.4, U * 6.0, W, 'primary', 'pauldron_l')
  pauldronL.position.set(-U * 6.2, U * 24.8, 0)
  pauldronL.rotation.z = THREE.MathUtils.degToRad(5) // Slight outward angle
  group.add(pauldronL)
  // Pauldron lip/rim
  const pauldronLipL = taggedFlatBox(U * 4.8, U * 0.5, U * 6.4, W, 'accent', 'pauldron_lip_l')
  pauldronLipL.position.set(-U * 6.2, U * 23.6, 0)
  pauldronLipL.rotation.z = THREE.MathUtils.degToRad(5)
  group.add(pauldronLipL)

  // Right pauldron — mirror of left
  const pauldronR = taggedBox(U * 4.5, U * 2.4, U * 6.0, W, 'primary', 'pauldron_r')
  pauldronR.position.set(U * 6.2, U * 24.8, 0)
  pauldronR.rotation.z = THREE.MathUtils.degToRad(-5)
  group.add(pauldronR)
  const pauldronLipR = taggedFlatBox(U * 4.8, U * 0.5, U * 6.4, W, 'accent', 'pauldron_lip_r')
  pauldronLipR.position.set(U * 6.2, U * 23.6, 0)
  pauldronLipR.rotation.z = THREE.MathUtils.degToRad(-5)
  group.add(pauldronLipR)

  // Arm covers (armor sleeves) — stored in userData for attachment to arms later
  // They need to be children of the arm meshes so they rotate with them.
  // Positions are in arm-local space (shoulder pivot at Y=0, arm extends downward).
  const armArmorL = taggedBox(U * 5, U * 10, U * 5, W, 'primary', 'arm_armor_l')
  armArmorL.position.set(0, -U * 6, 0)
  armArmorL.userData.attachToArm = 'L'
  group.add(armArmorL)
  const armArmorR = taggedBox(U * 5, U * 10, U * 5, W, 'primary', 'arm_armor_r')
  armArmorR.position.set(0, -U * 6, 0)
  armArmorR.userData.attachToArm = 'R'
  group.add(armArmorR)

  // Bottom trim
  const trim = taggedBox(U * 9.8, U * 1, U * 7.2, W, 'accent', 'breastplate_rim')
  trim.position.set(0, U * 12.2, U * 0.5)
  group.add(trim)

  // Horizontal plate lines across the chest (layered armor plates)
  for (let i = 0; i < 3; i++) {
    const plateLine = taggedFlatBox(U * 9.2, U * 0.3, U * 7.1, W, 'accent', `plate_line_${i}`)
    plateLine.position.set(0, U * (22 - i * 3), U * 0.5)
    group.add(plateLine)
  }

  return group
}

function buildBelt(U: number): THREE.Group {
  const group = new THREE.Group()

  // Waist band — taller and thicker than body so it wraps AROUND the torso
  // Body is 4U deep; belt is 6.5U deep to protrude visibly
  const band = taggedBox(U * 10.4, U * 3.2, U * 6.5, W, 'primary', 'belt_band')
  band.position.y = U * 12
  group.add(band)

  // Side wrap pieces — extend past body edges for visible wrap-around
  const wrapL = taggedBox(U * 1.0, U * 3.2, U * 5.5, W, 'primary', 'belt_wrap_l')
  wrapL.position.set(-U * 5.2, U * 12, 0)
  group.add(wrapL)
  const wrapR = taggedBox(U * 1.0, U * 3.2, U * 5.5, W, 'primary', 'belt_wrap_r')
  wrapR.position.set(U * 5.2, U * 12, 0)
  group.add(wrapR)

  // Buckle — gold square, protruding forward
  const buckle = taggedFlatBox(U * 3.2, U * 3.0, U * 1.2, 0xC8A84E, 'accent', 'belt_buckle')
  buckle.position.set(0, U * 12, U * 3.6)
  group.add(buckle)

  // Buckle inner detail — dark inset
  const inner = taggedFlatBox(U * 1.6, U * 1.4, U * 0.3, 0x111111, 'detail', 'belt_inner')
  inner.position.set(0, U * 12, U * 4.3)
  group.add(inner)

  // Buckle prong — small vertical bar inside buckle
  const prong = taggedFlatBox(U * 0.3, U * 2.0, U * 0.3, 0xC8A84E, 'accent', 'belt_prong')
  prong.position.set(U * 0.4, U * 12, U * 4.3)
  group.add(prong)

  // Rivets along the belt — small raised dots for leather detail
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue // Skip center (buckle is there)
    const rivet = taggedFlatBox(U * 0.5, U * 0.5, U * 0.5, W, 'accent', `belt_rivet_${i}`)
    rivet.position.set(i * U * 2.5, U * 12, U * 3.4)
    group.add(rivet)
  }

  return group
}

function buildShoes(U: number): THREE.Group {
  const group = new THREE.Group()

  // Boot shaft — covers lower ~40% of each leg, extends upward like real armored boots
  // Legs span Y=0 (feet) to Y=12 (hips). Boot shaft covers Y=0 to ~Y=8.
  const bootL = taggedBox(U * 5.2, U * 8, U * 5.2, W, 'primary', 'boot_l')
  bootL.position.set(-U * 2, U * 4, 0)
  group.add(bootL)
  const bootR = taggedBox(U * 5.2, U * 8, U * 5.2, W, 'primary', 'boot_r')
  bootR.position.set(U * 2, U * 4, 0)
  group.add(bootR)

  // Boot soles — wider than boot top on each side for a shoe shape
  const soleL = taggedBox(U * 5.6, U * 1.2, U * 6.4, W, 'accent', 'boot_sole_l')
  soleL.position.set(-U * 2, U * 0.2, U * 0.5)
  group.add(soleL)
  const soleR = taggedBox(U * 5.6, U * 1.2, U * 6.4, W, 'accent', 'boot_sole_r')
  soleR.position.set(U * 2, U * 0.2, U * 0.5)
  group.add(soleR)

  // Top cuff band — lighter accent strip at top of each boot
  const cuffL = taggedFlatBox(U * 5.6, U * 1.0, U * 5.6, W, 'accent', 'boot_cuff_l')
  cuffL.position.set(-U * 2, U * 8.2, 0)
  group.add(cuffL)
  const cuffR = taggedFlatBox(U * 5.6, U * 1.0, U * 5.6, W, 'accent', 'boot_cuff_r')
  cuffR.position.set(U * 2, U * 8.2, 0)
  group.add(cuffR)

  // Knee guards — raised plates on front of each boot
  const kneeL = taggedFlatBox(U * 3, U * 2.4, U * 1.2, W, 'accent', 'knee_l')
  kneeL.position.set(-U * 2, U * 7, U * 3)
  group.add(kneeL)
  const kneeR = taggedFlatBox(U * 3, U * 2.4, U * 1.2, W, 'accent', 'knee_r')
  kneeR.position.set(U * 2, U * 7, U * 3)
  group.add(kneeR)

  return group
}

function buildShield(U: number): THREE.Group {
  // Shield positions are relative to the LEFT ARM's local space.
  // The arm pivots at the shoulder (local Y=0 = shoulder, Y=-12U = hand).
  // Shield is held on the outer side of the forearm.
  const group = new THREE.Group()
  group.userData.attachToArm = 'L'

  // Angle the shield ~15° on Y so it's not perfectly flat to camera
  group.rotation.y = THREE.MathUtils.degToRad(15)

  // Shield offset: further OUTSIDE the arm (negative X = away from body on left side)
  const shX = -U * 5  // Away from body on left side
  const shZ = U * 1.5 // Forward — shield presents to the front

  // Main shield body — real depth (not paper-thin)
  const body = taggedBox(U * 1.6, U * 11.2, U * 8, W, 'primary', 'shield_body')
  body.position.set(shX, -U * 7, shZ)
  group.add(body)

  // Bevel layers — stepped inward boxes for a rounded/beveled look
  const bevel1 = taggedFlatBox(U * 0.3, U * 10, U * 7, W, 'primary', 'shield_bevel1')
  bevel1.position.set(shX - U * 0.95, -U * 7, shZ)
  group.add(bevel1)
  const bevel2 = taggedFlatBox(U * 0.2, U * 8.8, U * 5.8, W, 'primary', 'shield_bevel2')
  bevel2.position.set(shX - U * 1.05, -U * 7, shZ)
  group.add(bevel2)

  // Front face panel — slightly lighter accent
  const face = taggedFlatBox(U * 0.3, U * 10.4, U * 7.2, W, 'accent', 'shield_face')
  face.position.set(shX - U * 0.9, -U * 7, shZ)
  group.add(face)

  // Emblem placeholder — for dynamic emblem (buildShieldEmblem)
  group.userData.emblemX = shX - U * 1.1
  group.userData.emblemY = -U * 7
  group.userData.emblemZ = shZ

  // Cross emblem on the face — vertical and horizontal bars
  const crossV = taggedFlatBox(U * 0.2, U * 6.0, U * 1.0, W, 'detail', 'shield_cross_v')
  crossV.position.set(shX - U * 1.05, -U * 7, shZ)
  group.add(crossV)
  const crossH = taggedFlatBox(U * 0.2, U * 1.0, U * 4.0, W, 'detail', 'shield_cross_h')
  crossH.position.set(shX - U * 1.05, -U * 6, shZ)
  group.add(crossH)

  // Border frame — 4 raised rim boxes around the edge
  const rimTop = taggedBox(U * 1.8, U * 0.6, U * 8.4, W, 'accent', 'shield_rim_top')
  rimTop.position.set(shX, -U * 1.3, shZ)
  group.add(rimTop)
  const rimBot = taggedBox(U * 1.8, U * 0.6, U * 8.4, W, 'accent', 'shield_rim_bot')
  rimBot.position.set(shX, -U * 12.7, shZ)
  group.add(rimBot)
  const rimL = taggedBox(U * 1.8, U * 11.2, U * 0.6, W, 'accent', 'shield_rim_l')
  rimL.position.set(shX, -U * 7, shZ + U * 4.1)
  group.add(rimL)
  const rimR = taggedBox(U * 1.8, U * 11.2, U * 0.6, W, 'accent', 'shield_rim_r')
  rimR.position.set(shX, -U * 7, shZ - U * 4.1)
  group.add(rimR)

  // Center boss — protruding square on the face
  const boss = taggedFlatBox(U * 0.5, U * 2.4, U * 2.4, W, 'accent', 'shield_boss')
  boss.userData.isAccent = true
  boss.position.set(shX - U * 1.2, -U * 7, shZ)
  group.add(boss)

  // Vertical grain lines on shield face (wood grain / material detail)
  for (let i = -2; i <= 2; i++) {
    const grain = taggedFlatBox(U * 0.15, U * 9.6, U * 0.15, W, 'detail', `shield_grain_${i}`)
    grain.position.set(shX - U * 1.0, -U * 7, shZ + i * U * 1.5)
    group.add(grain)
  }

  return group
}

function buildSword(U: number): THREE.Group {
  // Sword positions are relative to the RIGHT ARM's local space.
  // Arm pivots at shoulder (local Y=0 = shoulder, Y=-12U = hand).
  // Sword is held in the hand, blade extends upward from grip.
  const group = new THREE.Group()
  group.userData.attachToArm = 'R'

  // Sword offset: further OUTSIDE the arm (positive X = away from body center)
  const sX = U * 4.5

  // Handle/grip — dark brown leather
  const grip = box(U * 1.2, U * 4, U * 1.5, 0x5D4037)
  grip.userData.materialRole = 'detail'
  grip.name = 'sword_grip'
  grip.position.set(sX, -U * 11, U * 1)
  group.add(grip)

  // Crossguard — wider than blade, darker accent color
  const guard = taggedFlatBox(U * 1.2, U * 1.5, U * 6, W, 'accent', 'sword_crossguard')
  guard.userData.isAccent = true
  guard.position.set(sX, -U * 8.5, U * 1)
  group.add(guard)

  // Blade — two sections: wider base near hilt, narrower upper section
  // Lower blade (wider, near hilt) — ~0.1 wide equivalent
  const bladeBaseMat = new THREE.MeshLambertMaterial({
    color: 0x87ceeb,
    emissive: new THREE.Color(0x2196f3),
    emissiveIntensity: 0.35,
  })
  const bladeBase = new THREE.Mesh(
    new THREE.BoxGeometry(U * 1, U * 8, U * 2.4),
    bladeBaseMat,
  )
  bladeBase.name = 'sword_blade_base'
  bladeBase.userData.materialRole = 'sword_blade' // Skip tier override — keep blue glow
  bladeBase.position.set(sX, -U * 3.5, U * 1)
  group.add(bladeBase)

  // Upper blade (narrower, toward tip)
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
  bladeUpper.position.set(sX, U * 4.5, U * 1)
  group.add(bladeUpper)

  // Blade edge highlight — brighter strip along the length
  const edgeMat = new THREE.MeshLambertMaterial({
    color: 0xb0e0e6,
    emissive: new THREE.Color(0x4fc3f7),
    emissiveIntensity: 0.4,
  })
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(U * 0.3, U * 14, U * 0.5),
    edgeMat,
  )
  edge.name = 'sword_edge'
  edge.userData.materialRole = 'sword_blade'
  edge.position.set(sX, U * 0.5, U * 2.1)
  group.add(edge)

  // Blade tip — pointed end
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
  tip.position.set(sX, U * 9.5, U * 1)
  group.add(tip)

  // Enchantment glow — slightly larger semi-transparent mesh behind the blade
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
  glow.position.set(sX, U * 0.5, U * 1)
  group.add(glow)

  // Pommel — small cube below grip, uses tier accent
  const pommel = taggedFlatBox(U * 1.6, U * 1.2, U * 1.6, W, 'accent', 'sword_pommel')
  pommel.userData.isAccent = true
  pommel.position.set(sX, -U * 13.5, U * 1)
  group.add(pommel)

  // Point light for glow effect
  const glowLight = new THREE.PointLight(0x87ceeb, 0.8, 3)
  glowLight.position.set(sX, U * 2, U * 2)
  group.add(glowLight)

  return group
}

// ── Main builder ────────────────────────────────────────────────────

export function buildArmorPiece(
  pieceId: VoxelArmorPieceId,
  ageGroup: 'older' | 'younger',
): THREE.Group {
  const scale = ageGroup === 'younger' ? 0.88 : 1.0
  const U = 0.125 * scale

  let group: THREE.Group

  switch (pieceId) {
    case 'helmet':
      group = buildHelmet(U)
      break
    case 'breastplate':
      group = buildBreastplate(U)
      break
    case 'belt':
      group = buildBelt(U)
      break
    case 'shoes':
      group = buildShoes(U)
      break
    case 'shield':
      group = buildShield(U)
      break
    case 'sword':
      group = buildSword(U)
      break
  }

  group.name = pieceId
  group.visible = false // Hidden until equipped

  return group
}
