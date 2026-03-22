import * as THREE from 'three'
import type { VoxelArmorPieceId } from '../../../core/types'

// ── Helpers ─────────────────────────────────────────────────────────

/** Create a textured box with per-face color variation */
function texturedBox(
  w: number,
  h: number,
  d: number,
  baseColor: THREE.Color | number,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const color = baseColor instanceof THREE.Color ? baseColor : new THREE.Color(baseColor)
  const materials: THREE.MeshLambertMaterial[] = []
  for (let i = 0; i < 6; i++) {
    const variation = 0.95 + Math.random() * 0.1
    const faceColor = color.clone().multiplyScalar(variation)
    materials.push(new THREE.MeshLambertMaterial({ color: faceColor }))
  }
  return new THREE.Mesh(geo, materials)
}

/** Create a flat-colored box for small detail pieces */
function box(
  w: number,
  h: number,
  d: number,
  color: THREE.Color | number,
): THREE.Mesh {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color)
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: c }),
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

  // Head is 8U × 8U × 8U centered at Y = U*28 (spans Y=24 to Y=32).
  // Open-face helmet: covers top + sides + back, face fully exposed.

  // Main shell — covers only the top half of the head (forehead/crown)
  const shellTop = taggedBox(U * 9.2, U * 4.8, U * 9.2, W, 'primary', 'helmet_dome')
  shellTop.position.set(0, U * 31.0, 0)
  group.add(shellTop)

  // Side guards — extend down past ears but pulled back so they don't block the front face
  const guardL = taggedBox(U * 1.2, U * 7.2, U * 7.2, W, 'primary', 'helmet_guardL')
  guardL.position.set(-U * 4.4, U * 28.0, -U * 0.8)
  group.add(guardL)
  const guardR = taggedBox(U * 1.2, U * 7.2, U * 7.2, W, 'primary', 'helmet_guardR')
  guardR.position.set(U * 4.4, U * 28.0, -U * 0.8)
  group.add(guardR)

  // Back plate — covers back of head down to neck
  const backPlate = taggedBox(U * 9.2, U * 8.0, U * 1.2, W, 'primary', 'helmet_back')
  backPlate.position.set(0, U * 28.0, -U * 4.4)
  group.add(backPlate)

  // Brow ridge — sits ABOVE the eyes (eyes are at ~Y=27.4, brow at Y=29.6+)
  const brow = taggedBox(U * 8.0, U * 0.8, U * 1.6, W, 'accent', 'helmet_brow')
  brow.position.set(0, U * 29.6, U * 4.0)
  group.add(brow)

  // NO nose guard — open face design, like a Viking helm

  // Top crest — accent ridge running front to back
  const crest = taggedBox(U * 1.0, U * 1.4, U * 8.0, W, 'accent', 'helmet_crest')
  crest.userData.isAccent = true
  crest.position.set(0, U * 33.8, 0)
  group.add(crest)

  // Chin strap — thin bar under the chin connecting the side guards, frames face from below
  const chinStrap = taggedFlatBox(U * 6.4, U * 0.5, U * 0.6, W, 'accent', 'helmet_chinstrap')
  chinStrap.position.set(0, U * 24.2, U * 3.2)
  group.add(chinStrap)

  // Neck guard — extends below head at the back
  const neckGuard = taggedBox(U * 8.0, U * 2.0, U * 1.2, W, 'primary', 'helmet_neckguard')
  neckGuard.position.set(0, U * 24.4, -U * 4.2)
  group.add(neckGuard)

  return group
}

function buildBreastplate(U: number): THREE.Group {
  const group = new THREE.Group()

  // Main plate — body (8×12×4) but slightly bigger. Narrower than arm gap to prevent clipping.
  const chest = taggedBox(U * 9, U * 12, U * 6, W, 'primary', 'breastplate_body')
  chest.position.y = U * 18
  group.add(chest)

  // Cross emblem on front
  const crossV = taggedFlatBox(U * 1, U * 6, U * 0.5, W, 'accent', 'cross_v')
  crossV.position.set(0, U * 19, U * 3.3)
  group.add(crossV)
  const crossH = taggedFlatBox(U * 4, U * 1, U * 0.5, W, 'accent', 'cross_h')
  crossH.position.set(0, U * 21, U * 3.3)
  group.add(crossH)

  // Shoulder pads — must not extend past arm pivots (arms at ±U*7.2)
  const shoulderL = taggedBox(U * 4, U * 3, U * 5.5, W, 'primary', 'shoulder_l')
  shoulderL.position.set(-U * 5.4, U * 24, 0) // Inner edge at ~-U*3.4, outer at ~-U*7.4
  group.add(shoulderL)
  const shoulderR = taggedBox(U * 4, U * 3, U * 5.5, W, 'primary', 'shoulder_r')
  shoulderR.position.set(U * 5.4, U * 24, 0)
  group.add(shoulderR)

  // Arm covers (armor sleeves) — stored in userData for attachment to arms later
  // They need to be children of the arm meshes so they rotate with them.
  // Positions are in arm-local space (shoulder pivot at Y=0, arm extends downward).
  const armArmorL = taggedBox(U * 5, U * 10, U * 5, W, 'primary', 'arm_armor_l')
  armArmorL.position.set(0, -U * 6, 0) // Centered on arm in local space
  armArmorL.userData.attachToArm = 'L'
  group.add(armArmorL)
  const armArmorR = taggedBox(U * 5, U * 10, U * 5, W, 'primary', 'arm_armor_r')
  armArmorR.position.set(0, -U * 6, 0)
  armArmorR.userData.attachToArm = 'R'
  group.add(armArmorR)

  // Bottom trim
  const trim = taggedBox(U * 9, U * 1, U * 6.2, W, 'accent', 'breastplate_rim')
  trim.position.set(0, U * 12.5, 0)
  group.add(trim)

  return group
}

function buildBelt(U: number): THREE.Group {
  const group = new THREE.Group()

  // Waist band — sits between chest and legs
  const band = taggedBox(U * 10, U * 2, U * 5.5, W, 'primary', 'belt_band')
  band.position.y = U * 12
  group.add(band)

  // Buckle
  const buckle = taggedFlatBox(U * 3, U * 2.5, U * 1, W, 'accent', 'belt_buckle')
  buckle.position.set(0, U * 12, U * 3)
  group.add(buckle)

  // Buckle inner detail
  const inner = taggedFlatBox(U * 1.5, U * 1.2, U * 0.3, 0x111111, 'detail', 'belt_inner')
  inner.position.set(0, U * 12, U * 3.5)
  group.add(inner)

  return group
}

function buildShoes(U: number): THREE.Group {
  const group = new THREE.Group()

  // Boot armor on each leg — covers bottom half
  const bootL = taggedBox(U * 5, U * 7, U * 5, W, 'primary', 'boot_l')
  bootL.position.set(-U * 2, U * 3.5, 0)
  group.add(bootL)
  const bootR = taggedBox(U * 5, U * 7, U * 5, W, 'primary', 'boot_r')
  bootR.position.set(U * 2, U * 3.5, 0)
  group.add(bootR)

  // Boot soles (slightly extended forward)
  const soleL = taggedBox(U * 5, U * 1, U * 6, W, 'accent', 'boot_sole_l')
  soleL.position.set(-U * 2, U * 0.5, U * 0.5)
  group.add(soleL)
  const soleR = taggedBox(U * 5, U * 1, U * 6, W, 'accent', 'boot_sole_r')
  soleR.position.set(U * 2, U * 0.5, U * 0.5)
  group.add(soleR)

  // Knee guards
  const kneeL = taggedFlatBox(U * 3, U * 2, U * 1, W, 'accent', 'knee_l')
  kneeL.position.set(-U * 2, U * 6, U * 2.8)
  group.add(kneeL)
  const kneeR = taggedFlatBox(U * 3, U * 2, U * 1, W, 'accent', 'knee_r')
  kneeR.position.set(U * 2, U * 6, U * 2.8)
  group.add(kneeR)

  return group
}

function buildShield(U: number): THREE.Group {
  // Shield positions are relative to the LEFT ARM's local space.
  // The arm pivots at the shoulder (local Y=0 = shoulder, Y=-12U = hand).
  // Shield is held on the outer side of the forearm.
  const group = new THREE.Group()
  group.userData.attachToArm = 'L'

  // Shield offset: further OUTSIDE the arm (negative X = away from body on left side)
  const shX = -U * 5  // Was -U*3.5, now further out to avoid torso clipping
  const shZ = U * 1.5 // More forward — shield presents to the front

  // Main shield body — thicker, more substantial
  const body = taggedBox(U * 1.4, U * 11.2, U * 8, W, 'primary', 'shield_body')
  body.position.set(shX, -U * 7, shZ)
  group.add(body)

  // Front face panel — slightly lighter accent
  const face = taggedFlatBox(U * 0.3, U * 10.4, U * 7.2, W, 'accent', 'shield_face')
  face.position.set(shX - U * 0.8, -U * 7, shZ)
  group.add(face)

  // Cross emblem on shield front — vertical bar
  const crossV = taggedFlatBox(U * 0.2, U * 8.0, U * 1.0, W, 'accent', 'shield_cross_v')
  crossV.userData.isAccent = true
  crossV.position.set(shX - U * 1, -U * 7, shZ)
  group.add(crossV)

  // Cross emblem — horizontal bar
  const crossH = taggedFlatBox(U * 0.2, U * 1.0, U * 5.6, W, 'accent', 'shield_cross_h')
  crossH.userData.isAccent = true
  crossH.position.set(shX - U * 1, -U * 5.6, shZ)
  group.add(crossH)

  // Rim — top
  const rimTop = taggedBox(U * 1.5, U * 0.5, U * 8.2, W, 'accent', 'shield_rim_top')
  rimTop.position.set(shX, -U * 1.4, shZ)
  group.add(rimTop)
  // Rim — bottom
  const rimBot = taggedBox(U * 1.5, U * 0.5, U * 8.2, W, 'accent', 'shield_rim_bot')
  rimBot.position.set(shX, -U * 12.6, shZ)
  group.add(rimBot)
  // Rim — left side
  const rimL = taggedBox(U * 1.5, U * 11.2, U * 0.5, W, 'accent', 'shield_rim_l')
  rimL.position.set(shX, -U * 7, shZ + U * 4)
  group.add(rimL)
  // Rim — right side
  const rimR = taggedBox(U * 1.5, U * 11.2, U * 0.5, W, 'accent', 'shield_rim_r')
  rimR.position.set(shX, -U * 7, shZ - U * 4)
  group.add(rimR)

  // Center boss (raised square — Minecraft style)
  const boss = taggedFlatBox(U * 0.4, U * 2.0, U * 2.0, W, 'accent', 'shield_boss')
  boss.userData.isAccent = true
  boss.position.set(shX - U * 1.1, -U * 7, shZ)
  group.add(boss)

  return group
}

function buildSword(U: number): THREE.Group {
  // Sword positions are relative to the RIGHT ARM's local space.
  // Arm pivots at shoulder (local Y=0 = shoulder, Y=-12U = hand).
  // Sword is held in the hand, blade extends upward from grip.
  const group = new THREE.Group()
  group.userData.attachToArm = 'R'

  // Sword offset: further OUTSIDE the arm (positive X = away from body center)
  const sX = U * 4.5 // Was U*3, now further out to avoid torso clipping

  // Grip — leather brown, near the hand at bottom of arm
  const grip = box(U * 1.2, U * 4, U * 1.5, 0x4a3728)
  grip.userData.materialRole = 'detail'
  grip.name = 'sword_grip'
  grip.position.set(sX, -U * 11, U * 1)
  group.add(grip)

  // Crossguard — uses tier accent color
  const guard = taggedFlatBox(U * 1, U * 1.5, U * 5, W, 'accent', 'sword_crossguard')
  guard.userData.isAccent = true
  guard.position.set(sX, -U * 8.5, U * 1)
  group.add(guard)

  // Blade — glowing light blue (Sword of the Spirit = Word of God)
  const bladeMat = new THREE.MeshLambertMaterial({
    color: 0x87ceeb,
    emissive: new THREE.Color(0x2196f3),
    emissiveIntensity: 0.3,
  })
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(U * 1, U * 16, U * 2),
    bladeMat,
  )
  blade.name = 'sword_blade'
  blade.userData.materialRole = 'sword_blade' // Skip tier override — keep blue glow
  blade.position.set(sX, U * 0.5, U * 1)
  group.add(blade)

  // Blade edge highlight — brighter strip
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
  edge.userData.materialRole = 'sword_blade' // Skip tier override
  edge.position.set(sX, U * 1.5, U * 2)
  group.add(edge)

  // Blade tip
  const tipMat = new THREE.MeshLambertMaterial({
    color: 0xadd8e6,
    emissive: new THREE.Color(0x2196f3),
    emissiveIntensity: 0.25,
  })
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(U * 0.8, U * 2, U * 1.5),
    tipMat,
  )
  tip.name = 'sword_tip'
  tip.userData.materialRole = 'sword_blade' // Skip tier override
  tip.position.set(sX, U * 9, U * 1)
  group.add(tip)

  // Pommel — below grip, uses tier accent
  const pommel = taggedFlatBox(U * 1.5, U * 1.5, U * 1.5, W, 'accent', 'sword_pommel')
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
