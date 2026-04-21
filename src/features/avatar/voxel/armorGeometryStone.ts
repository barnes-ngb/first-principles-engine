import * as THREE from 'three'
import type { BodyLayout } from './buildArmorPiece'
import { taggedBox, taggedFlatBox, W } from './buildArmorPiece'

// ── Stone tier armor geometry ───────────────────────────────────────
//
// Mid-weight, grounded shapes: skullcap, stone chestplate, tower shield,
// stone blade, buckle belt, shin greaves. More substance than wood, but
// no pauldrons, gorget, or kite shield — that's the Iron silhouette.
// Dimensions are first-pass estimates and will need tuning.

// ── Helmet: stone skullcap ──────────────────────────────────────────
export function buildStoneHelmet(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, headSize } = layout
  const h = headSize
  const pad = U * 1.2

  // Domed cap covering the top third of the head
  const capW = h + pad
  const capH = h * 0.45
  const capD = h + pad
  const cap = taggedBox(capW, capH, capD, W, 'primary', 'stone_cap_dome')
  cap.position.set(0, h * 0.25 + capH / 2, 0)
  group.add(cap)

  // Inset layer to suggest a carved rim around the cap
  const capInner = taggedFlatBox(capW - U * 0.4, U * 0.6, capD - U * 0.4, W, 'accent', 'stone_cap_rim')
  capInner.position.set(0, h * 0.25, 0)
  group.add(capInner)

  // Headband base — a low stone strap around the forehead
  const bandH = U * 1.1
  const bandW = h + U * 0.4
  const bandD = h + U * 0.4
  const front = taggedBox(bandW, bandH, U * 0.7, W, 'primary', 'stone_band_front')
  front.position.set(0, h * 0.08, bandD / 2 - U * 0.25)
  group.add(front)
  const back = taggedBox(bandW, bandH, U * 0.7, W, 'primary', 'stone_band_back')
  back.position.set(0, h * 0.08, -(bandD / 2 - U * 0.25))
  group.add(back)
  const sideL = taggedBox(U * 0.7, bandH, bandD - U * 1.2, W, 'primary', 'stone_band_l')
  sideL.position.set(-(bandW / 2 - U * 0.25), h * 0.08, 0)
  group.add(sideL)
  const sideR = taggedBox(U * 0.7, bandH, bandD - U * 1.2, W, 'primary', 'stone_band_r')
  sideR.position.set(bandW / 2 - U * 0.25, h * 0.08, 0)
  group.add(sideR)

  // Small nose-guard dropping from the band (not a full visor)
  const nose = taggedFlatBox(U * 0.8, U * 1.2, U * 0.4, W, 'accent', 'stone_nose_guard')
  nose.position.set(0, h * 0.08 - U * 1.0, bandD / 2 + U * 0.2)
  group.add(nose)

  return group
}

// ── Breastplate: stone chestplate (solid wraparound, no gorget) ─────
//
// A substantial chestplate that wraps the torso with front, back, and side
// plates so the armor reads as solid stone — not strapped strips. Slightly
// less coverage than Iron (no gorget, smaller shoulder bumps, no pauldron
// lips) but the plate itself is just as chunky.
export function buildStoneBreastplate(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, torsoCenter, torsoTop, torsoH, torsoW, torsoD, scale } = layout
  const s = scale

  // Wraparound plate geometry — front/back/side panels thick enough to carry
  // the side silhouette, sized just below the Iron footprint.
  const plateW = torsoW * 1.08
  const plateH = torsoH * 0.82
  const plateThickness = 0.2 * s

  // Front plate — solid block covering the torso front
  const frontPlate = taggedBox(plateW, plateH, plateThickness, W, 'primary', 'stone_chest_front')
  frontPlate.position.set(0, torsoCenter, torsoD / 2 + plateThickness / 2)
  group.add(frontPlate)

  // Back plate — same footprint
  const backPlate = taggedBox(plateW, plateH, plateThickness, W, 'primary', 'stone_chest_back')
  backPlate.position.set(0, torsoCenter, -(torsoD / 2 + plateThickness / 2))
  group.add(backPlate)

  // Side plates — connect front to back so the armor wraps the torso
  const sidePlateW = plateThickness
  const sidePlateD = torsoD + plateThickness * 2
  const sidePlateL = taggedBox(sidePlateW, plateH, sidePlateD, W, 'primary', 'stone_chest_side_l')
  sidePlateL.position.set(-(torsoW / 2 + sidePlateW / 2), torsoCenter, 0)
  group.add(sidePlateL)
  const sidePlateR = taggedBox(sidePlateW, plateH, sidePlateD, W, 'primary', 'stone_chest_side_r')
  sidePlateR.position.set(torsoW / 2 + sidePlateW / 2, torsoCenter, 0)
  group.add(sidePlateR)

  // Carved cross on the front plate — raised relief in secondary color
  const crossProtrusion = 0.08 * s
  const crossZ = torsoD / 2 + plateThickness + crossProtrusion / 2
  const crossV = taggedBox(U * 0.9, plateH * 0.55, crossProtrusion, W, 'secondary', 'stone_chest_cross_v')
  crossV.position.set(0, torsoCenter + plateH * 0.1, crossZ)
  group.add(crossV)
  const crossH = taggedBox(plateW * 0.45, U * 0.9, crossProtrusion, W, 'secondary', 'stone_chest_cross_h')
  crossH.position.set(0, torsoCenter + plateH * 0.22, crossZ)
  group.add(crossH)

  // Horizontal waist groove across the front plate
  const groove = taggedFlatBox(plateW - U * 0.6, U * 0.35, U * 0.2, W, 'secondary', 'stone_chest_groove')
  groove.position.set(0, torsoCenter - plateH * 0.35, crossZ - U * 0.05)
  group.add(groove)

  // Shoulder bumps — smaller than Iron pauldrons, no lips
  const shoulderW = U * 2.6
  const shoulderH = U * 1.5
  const shoulderD = torsoD + U * 1.0
  const shoulderY = torsoTop - shoulderH / 2 + U * 0.2
  const shoulderX = torsoW / 2 + shoulderW / 2 + U * 0.4
  const shoulderL = taggedBox(shoulderW, shoulderH, shoulderD, W, 'primary', 'stone_shoulder_l')
  shoulderL.position.set(-shoulderX, shoulderY, 0)
  group.add(shoulderL)
  const shoulderR = taggedBox(shoulderW, shoulderH, shoulderD, W, 'primary', 'stone_shoulder_r')
  shoulderR.position.set(shoulderX, shoulderY, 0)
  group.add(shoulderR)

  // Bottom rim wrapping the plate base
  const rimW = plateW + U * 0.3
  const rimD = torsoD + plateThickness * 2 + U * 0.3
  const rim = taggedBox(rimW, U * 0.6, rimD, W, 'accent', 'stone_chest_rim')
  rim.position.set(0, torsoCenter - plateH / 2 - U * 0.1, 0)
  group.add(rim)

  return group
}

// ── Belt: thicker band with a square stone buckle ───────────────────
export function buildStoneBelt(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, legTop, torsoW, torsoD } = layout

  const bandW = torsoW + U * 3.0
  const bandD = torsoD + U * 2.6
  const band = taggedBox(bandW, U * 2.4, bandD, W, 'primary', 'stone_belt_band')
  band.position.y = legTop
  group.add(band)

  // Square stone buckle protruding forward — no prong
  const buckle = taggedFlatBox(U * 2.8, U * 2.6, U * 1.0, W, 'accent', 'stone_belt_buckle')
  buckle.position.set(0, legTop, bandD / 2 + U * 0.3)
  group.add(buckle)

  // Chiseled inset on the buckle face
  const inset = taggedFlatBox(U * 1.6, U * 1.4, U * 0.25, W, 'detail', 'stone_belt_inset')
  inset.position.set(0, legTop, bandD / 2 + U * 0.9)
  group.add(inset)

  // Two simple rivets flanking the buckle
  const rivL = taggedFlatBox(U * 0.6, U * 0.6, U * 0.4, W, 'accent', 'stone_belt_rivet_l')
  rivL.position.set(-U * 3.0, legTop, bandD / 2 + U * 0.15)
  group.add(rivL)
  const rivR = taggedFlatBox(U * 0.6, U * 0.6, U * 0.4, W, 'accent', 'stone_belt_rivet_r')
  rivR.position.set(U * 3.0, legTop, bandD / 2 + U * 0.15)
  group.add(rivR)

  return group
}

// ── Shoes: shin greaves + knee guard ────────────────────────────────
export function buildStoneShoes(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, legW, legD, legH } = layout
  const legX = legW / 2 + U * 0.15

  // Short boot shaft
  const bootShaftH = legH * 0.3
  const bootW = legW + U * 1.8
  const bootD = legD + U * 1.8
  const bootL = taggedBox(bootW, bootShaftH, bootD, W, 'primary', 'stone_boot_l')
  bootL.position.set(-legX, bootShaftH / 2, 0)
  group.add(bootL)
  const bootR = taggedBox(bootW, bootShaftH, bootD, W, 'primary', 'stone_boot_r')
  bootR.position.set(legX, bootShaftH / 2, 0)
  group.add(bootR)

  // Sole
  const soleL = taggedBox(bootW + U * 0.4, U * 1.0, bootD + U * 1.0, W, 'accent', 'stone_sole_l')
  soleL.position.set(-legX, U * 0.2, U * 0.4)
  group.add(soleL)
  const soleR = taggedBox(bootW + U * 0.4, U * 1.0, bootD + U * 1.0, W, 'accent', 'stone_sole_r')
  soleR.position.set(legX, U * 0.2, U * 0.4)
  group.add(soleR)

  // Front-only shin plates above the boot
  const shinH = legH * 0.4
  const shinL = taggedFlatBox(legW - U * 0.1, shinH, U * 1.0, W, 'primary', 'stone_shin_l')
  shinL.position.set(-legX, bootShaftH + shinH / 2 + U * 0.2, bootD / 2 + U * 0.2)
  group.add(shinL)
  const shinR = taggedFlatBox(legW - U * 0.1, shinH, U * 1.0, W, 'primary', 'stone_shin_r')
  shinR.position.set(legX, bootShaftH + shinH / 2 + U * 0.2, bootD / 2 + U * 0.2)
  group.add(shinR)

  // Knee bumper (round, centered)
  const kneeY = bootShaftH + shinH + U * 0.3
  const kneeL = taggedFlatBox(legW + U * 0.2, U * 1.2, U * 1.4, W, 'accent', 'stone_knee_l')
  kneeL.position.set(-legX, kneeY, bootD / 2 + U * 0.3)
  group.add(kneeL)
  const kneeR = taggedFlatBox(legW + U * 0.2, U * 1.2, U * 1.4, W, 'accent', 'stone_knee_r')
  kneeR.position.set(legX, kneeY, bootD / 2 + U * 0.3)
  group.add(kneeR)

  return group
}

// ── Shield: tall tower shield ───────────────────────────────────────
export function buildStoneShield(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  group.userData.attachToArm = 'L'
  const { U, armH, scale: s } = layout
  group.position.set(-1.80 * s, -1.70 * s, 0.80 * s)
  group.rotation.set(-0.20, -3.04, -0.89)

  const visual = new THREE.Group()
  visual.name = 'shield_visual'
  visual.position.set(0, -1.8 * s, 0.6 * s)
  visual.rotation.set(-0.2, Math.PI, 0)
  group.add(visual)

  const shieldH = armH * 1.15  // taller than iron
  const shieldW = U * 7
  const thick = U * 1.4

  // Main slab
  const body = taggedBox(thick, shieldH, shieldW, W, 'primary', 'stone_shield_body')
  body.position.set(0, 0, 0)
  visual.add(body)

  // Recessed inner panel
  const inner = taggedFlatBox(U * 0.3, shieldH - U * 1.0, shieldW - U * 0.8, W, 'primary', 'stone_shield_inner')
  inner.position.set(-U * 0.85, 0, 0)
  visual.add(inner)

  // Horizontal groove bands (three)
  for (let i = -1; i <= 1; i++) {
    const groove = taggedFlatBox(U * 0.2, U * 0.5, shieldW - U * 1.0, W, 'secondary', `stone_shield_groove_${i}`)
    groove.position.set(-U * 0.95, i * (shieldH / 4), 0)
    visual.add(groove)
  }

  // Top and bottom frame caps
  const capTop = taggedBox(thick + U * 0.2, U * 0.8, shieldW + U * 0.3, W, 'accent', 'stone_shield_cap_top')
  capTop.position.set(0, shieldH / 2 - U * 0.3, 0)
  visual.add(capTop)
  const capBot = taggedBox(thick + U * 0.2, U * 0.8, shieldW + U * 0.3, W, 'accent', 'stone_shield_cap_bot')
  capBot.position.set(0, -(shieldH / 2 - U * 0.3), 0)
  visual.add(capBot)

  // Rounded stone boss (no cross emblem)
  const boss = taggedFlatBox(U * 0.6, U * 2.2, U * 2.2, W, 'accent', 'stone_shield_boss')
  boss.userData.isAccent = true
  boss.position.set(-U * 1.1, 0, 0)
  visual.add(boss)

  // Emblem anchor
  const emblemAnchor = new THREE.Vector3(-U * 1.1, 0, 0)
    .applyEuler(visual.rotation)
    .add(visual.position)
  group.userData.emblemX = emblemAnchor.x
  group.userData.emblemY = emblemAnchor.y
  group.userData.emblemZ = emblemAnchor.z

  return group
}

// ── Sword: short stone blade (no glow) ──────────────────────────────
// Geometry only: grip center at origin, pommel above (+Y, in hand),
// blade extending DOWN (-Y). Transform is applied by buildSword() in
// buildArmorPiece.ts.
export function buildStoneSword(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U } = layout

  // Wrapped grip — centered at origin
  const grip = taggedFlatBox(U * 1.3, U * 3.8, U * 1.4, W, 'detail', 'stone_sword_grip')
  grip.position.set(0, 0, 0)
  group.add(grip)

  // Pommel — above grip (in the hand)
  const pommel = taggedFlatBox(U * 1.4, U * 1.1, U * 1.4, W, 'accent', 'stone_sword_pommel')
  pommel.userData.isAccent = true
  pommel.position.set(0, U * 2.45, 0)
  group.add(pommel)

  // Crossguard — below grip, slightly wider than wood, flatter than iron
  const guard = taggedFlatBox(U * 1.3, U * 1.1, U * 5, W, 'accent', 'stone_sword_guard')
  guard.position.set(0, -U * 2.45, 0)
  group.add(guard)

  // Blade — stone-colored, thicker than wood, no glow.
  const bladeBase = taggedBox(U * 1.1, U * 6, U * 2.2, W, 'primary', 'stone_sword_blade_base')
  bladeBase.position.set(0, -U * 6.0, 0)
  group.add(bladeBase)

  const bladeUpper = taggedBox(U * 1.0, U * 5, U * 1.6, W, 'primary', 'stone_sword_blade_upper')
  bladeUpper.position.set(0, -U * 11.5, 0)
  group.add(bladeUpper)

  // Ridge running down the center of the blade (front face)
  const ridge = taggedFlatBox(U * 0.3, U * 10, U * 0.3, W, 'secondary', 'stone_sword_ridge')
  ridge.position.set(0, -U * 8.75, U * 1.2)
  group.add(ridge)

  // Short pyramidal tip — at bottom
  const tip = taggedFlatBox(U * 0.8, U * 1.6, U * 1.0, W, 'primary', 'stone_sword_tip')
  tip.position.set(0, -U * 14.8, 0)
  group.add(tip)

  return group
}
