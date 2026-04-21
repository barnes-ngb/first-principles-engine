import * as THREE from 'three'
import type { BodyLayout } from './buildArmorPiece'
import { taggedBox, taggedFlatBox, W } from './buildArmorPiece'

// ── Wood tier armor geometry ────────────────────────────────────────
//
// Humble, minimal shapes. The wood-tier set is the "starting kit":
// cloth/leather wraps, plank shields, training weapons. Nothing is
// polished or ornate. Dimensions are first-pass estimates and will
// need tuning after first render.

// ── Helmet: leather headband + small topknot ────────────────────────
export function buildWoodHelmet(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, headSize } = layout
  const h = headSize

  // Forehead band — four thin segments forming a ring at brow level
  const bandH = U * 1.6
  const bandW = h + U * 0.6
  const bandD = h + U * 0.6
  const front = taggedBox(bandW, bandH, U * 0.8, W, 'primary', 'wood_headband_front')
  front.position.set(0, h * 0.1, bandD / 2 - U * 0.3)
  group.add(front)

  const back = taggedBox(bandW, bandH, U * 0.8, W, 'primary', 'wood_headband_back')
  back.position.set(0, h * 0.1, -(bandD / 2 - U * 0.3))
  group.add(back)

  const sideL = taggedBox(U * 0.8, bandH, bandD - U * 1.4, W, 'primary', 'wood_headband_l')
  sideL.position.set(-(bandW / 2 - U * 0.3), h * 0.1, 0)
  group.add(sideL)

  const sideR = taggedBox(U * 0.8, bandH, bandD - U * 1.4, W, 'primary', 'wood_headband_r')
  sideR.position.set(bandW / 2 - U * 0.3, h * 0.1, 0)
  group.add(sideR)

  // Knot at back — small bump with two tails
  const knot = taggedFlatBox(U * 1.4, U * 1.2, U * 1.0, W, 'accent', 'wood_headband_knot')
  knot.position.set(0, h * 0.1, -(bandD / 2 + U * 0.5))
  group.add(knot)
  const tailL = taggedFlatBox(U * 0.4, U * 2.0, U * 0.4, W, 'accent', 'wood_headband_tail_l')
  tailL.position.set(-U * 0.6, h * 0.1 - U * 1.2, -(bandD / 2 + U * 0.8))
  group.add(tailL)
  const tailR = taggedFlatBox(U * 0.4, U * 2.0, U * 0.4, W, 'accent', 'wood_headband_tail_r')
  tailR.position.set(U * 0.6, h * 0.1 - U * 1.2, -(bandD / 2 + U * 0.8))
  group.add(tailR)

  return group
}

// ── Breastplate: leather vest with laces ────────────────────────────
export function buildWoodBreastplate(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, torsoCenter, torsoTop, torsoH, torsoW, torsoD, legTop } = layout

  // Thin leather vest — minimal padding beyond the torso (≥0.05*s proud)
  const vestW = torsoW + U * 0.8
  const vestH = torsoH + U * 0.2
  const vestD = torsoD + U * 1.2
  const vest = taggedBox(vestW, vestH, vestD, W, 'primary', 'wood_vest_body')
  vest.position.set(0, torsoCenter, U * 0.2)
  group.add(vest)

  // Small collar — thin strip at the top
  const collar = taggedFlatBox(torsoW * 0.6, U * 1.2, torsoD + U * 1.4, W, 'accent', 'wood_vest_collar')
  collar.position.set(0, torsoTop + U * 0.2, 0)
  group.add(collar)

  // Two vertical leather laces down the front
  const laceH = torsoH * 0.7
  const laceZ = vestD / 2 + U * 0.2
  const laceL = taggedFlatBox(U * 0.4, laceH, U * 0.2, W, 'accent', 'wood_vest_lace_l')
  laceL.position.set(-U * 1.2, torsoCenter, laceZ)
  group.add(laceL)
  const laceR = taggedFlatBox(U * 0.4, laceH, U * 0.2, W, 'accent', 'wood_vest_lace_r')
  laceR.position.set(U * 1.2, torsoCenter, laceZ)
  group.add(laceR)

  // Cross-stitches connecting the laces
  const stitchCount = 4
  const stitchSpacing = laceH / (stitchCount + 1)
  for (let i = 1; i <= stitchCount; i++) {
    const y = torsoCenter - laceH / 2 + i * stitchSpacing
    const stitch = taggedFlatBox(U * 2.8, U * 0.25, U * 0.2, W, 'detail', `wood_vest_stitch_${i}`)
    stitch.position.set(0, y, laceZ)
    group.add(stitch)
  }

  // Bottom hem
  const hem = taggedFlatBox(vestW + U * 0.1, U * 0.6, vestD + U * 0.1, W, 'accent', 'wood_vest_hem')
  hem.position.set(0, legTop + U * 0.2, U * 0.2)
  group.add(hem)

  return group
}

// ── Belt: rope belt with knot ───────────────────────────────────────
export function buildWoodBelt(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, legTop, torsoW, torsoD } = layout

  // Thin rope wrap
  const bandW = torsoW + U * 2.2
  const bandD = torsoD + U * 2.0
  const band = taggedBox(bandW, U * 1.6, bandD, W, 'primary', 'wood_belt_rope')
  band.position.y = legTop
  group.add(band)

  // Small knot at front (round-ish bump)
  const knot = taggedFlatBox(U * 2.0, U * 2.2, U * 1.2, W, 'accent', 'wood_belt_knot')
  knot.position.set(0, legTop, bandD / 2 + U * 0.5)
  group.add(knot)

  // Two short tails hanging from knot
  const tailL = taggedFlatBox(U * 0.4, U * 2.4, U * 0.4, W, 'accent', 'wood_belt_tail_l')
  tailL.position.set(-U * 0.6, legTop - U * 2.0, bandD / 2 + U * 0.8)
  group.add(tailL)
  const tailR = taggedFlatBox(U * 0.4, U * 2.0, U * 0.4, W, 'accent', 'wood_belt_tail_r')
  tailR.position.set(U * 0.6, legTop - U * 1.8, bandD / 2 + U * 0.8)
  group.add(tailR)

  return group
}

// ── Shoes: sandal wraps (no boot shaft) ─────────────────────────────
export function buildWoodShoes(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, legW, legD, legH } = layout
  const legX = legW / 2 + U * 0.15

  // Low ankle wrap — short segment at the bottom of each leg
  const wrapH = legH * 0.18
  const wrapW = legW + U * 1.2
  const wrapD = legD + U * 1.2
  const wrapL = taggedBox(wrapW, wrapH, wrapD, W, 'primary', 'wood_wrap_l')
  wrapL.position.set(-legX, wrapH / 2, 0)
  group.add(wrapL)
  const wrapR = taggedBox(wrapW, wrapH, wrapD, W, 'primary', 'wood_wrap_r')
  wrapR.position.set(legX, wrapH / 2, 0)
  group.add(wrapR)

  // Crossed strap bands wrapping higher up each calf
  const strapCount = 3
  for (let i = 0; i < strapCount; i++) {
    const y = wrapH + U * 0.6 + i * U * 1.6
    const strapL = taggedFlatBox(wrapW + U * 0.2, U * 0.4, wrapD - U * 0.4, W, 'accent', `wood_strap_l_${i}`)
    strapL.position.set(-legX, y, 0)
    group.add(strapL)
    const strapR = taggedFlatBox(wrapW + U * 0.2, U * 0.4, wrapD - U * 0.4, W, 'accent', `wood_strap_r_${i}`)
    strapR.position.set(legX, y, 0)
    group.add(strapR)
  }

  // Thin sole
  const soleL = taggedFlatBox(wrapW + U * 0.4, U * 0.4, wrapD + U * 0.6, W, 'detail', 'wood_sole_l')
  soleL.position.set(-legX, U * 0.2, U * 0.2)
  group.add(soleL)
  const soleR = taggedFlatBox(wrapW + U * 0.4, U * 0.4, wrapD + U * 0.6, W, 'detail', 'wood_sole_r')
  soleR.position.set(legX, U * 0.2, U * 0.2)
  group.add(soleR)

  return group
}

// ── Shield: flat plank shield ───────────────────────────────────────
export function buildWoodShield(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  group.userData.attachToArm = 'L'
  const { U, armH, scale: s } = layout

  const visual = new THREE.Group()
  visual.name = 'shield_visual'
  // Position: forearm level, slightly forward
  visual.position.set(
    0,             // centered on arm (don't offset sideways)
    -1.8 * s,      // forearm — between elbow (-1.5) and hand (-2.5)
    0.6 * s,       // well forward of the arm so it doesn't clip the body
  )
  // Rotation: reset everything, then just point the face forward
  visual.rotation.set(0, 0, 0)
  visual.rotation.y = Math.PI  // 180° — flip face toward the viewer
  visual.rotation.x = -0.2     // very slight backward lean (natural hold angle)
  group.add(visual)

  const shieldH = armH * 0.85
  const shieldW = U * 7.5
  const plankThick = U * 0.9

  // Three horizontal planks stacked vertically
  const plankH = shieldH / 3
  for (let i = 0; i < 3; i++) {
    const plank = taggedBox(plankThick, plankH - U * 0.1, shieldW, W, 'primary', `wood_plank_${i}`)
    const y = -shieldH / 2 + plankH * (i + 0.5)
    plank.position.set(0, y, 0)
    visual.add(plank)
  }

  // Vertical grain lines suggesting plank seams
  for (let i = -1; i <= 1; i++) {
    const seam = taggedFlatBox(U * 0.2, shieldH - U * 0.4, U * 0.15, W, 'detail', `wood_plank_seam_${i}`)
    seam.position.set(-U * 0.5, i * plankH, 0)
    visual.add(seam)
  }

  // Cross-brace reinforcement (two angled planks on the back)
  const brace1 = taggedFlatBox(U * 0.3, shieldH * 0.9, U * 0.8, W, 'accent', 'wood_brace_1')
  brace1.position.set(U * 0.6, 0, U * 2)
  brace1.rotation.x = THREE.MathUtils.degToRad(25)
  visual.add(brace1)
  const brace2 = taggedFlatBox(U * 0.3, shieldH * 0.9, U * 0.8, W, 'accent', 'wood_brace_2')
  brace2.position.set(U * 0.6, 0, -U * 2)
  brace2.rotation.x = THREE.MathUtils.degToRad(-25)
  visual.add(brace2)

  // Small iron boss in the center
  const boss = taggedFlatBox(U * 0.4, U * 1.6, U * 1.6, W, 'accent', 'wood_shield_boss')
  boss.userData.isAccent = true
  boss.position.set(-U * 0.8, 0, 0)
  visual.add(boss)

  // Emblem anchor (for custom emblem picker)
  const emblemAnchor = new THREE.Vector3(-U * 0.9, 0, 0)
    .applyEuler(visual.rotation)
    .add(visual.position)
  group.userData.emblemX = emblemAnchor.x
  group.userData.emblemY = emblemAnchor.y
  group.userData.emblemZ = emblemAnchor.z

  return group
}

// ── Sword: wooden training sword ────────────────────────────────────
// Geometry only: grip center at origin, pommel above (+Y, in hand),
// blade extending DOWN (-Y). Transform is applied by buildSword() in
// buildArmorPiece.ts.
export function buildWoodSword(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U } = layout

  // Simple wooden grip — centered at origin
  const grip = taggedFlatBox(U * 1.2, U * 3.5, U * 1.3, W, 'detail', 'wood_sword_grip')
  grip.position.set(0, 0, 0)
  group.add(grip)

  // Plain pommel — above grip (in the hand)
  const pommel = taggedFlatBox(U * 1.2, U * 0.9, U * 1.2, W, 'accent', 'wood_sword_pommel')
  pommel.position.set(0, U * 2.2, 0)
  group.add(pommel)

  // Narrow crossguard (single bar, no flares) — below grip
  const guard = taggedFlatBox(U * 1.2, U * 0.9, U * 4, W, 'accent', 'wood_sword_guard')
  guard.position.set(0, -U * 2.2, 0)
  group.add(guard)

  // Blade — wooden, shorter than iron, no glow. Two segments for taper.
  const bladeBase = taggedBox(U * 1, U * 7, U * 1.8, W, 'primary', 'wood_sword_blade_base')
  bladeBase.position.set(0, -U * 6.15, 0)
  group.add(bladeBase)

  const bladeUpper = taggedBox(U * 0.9, U * 5.5, U * 1.3, W, 'primary', 'wood_sword_blade_upper')
  bladeUpper.position.set(0, -U * 12.4, 0)
  group.add(bladeUpper)

  // Tapered tip — at bottom
  const tip = taggedFlatBox(U * 0.7, U * 1.5, U * 0.9, W, 'primary', 'wood_sword_tip')
  tip.position.set(0, -U * 15.9, 0)
  group.add(tip)

  return group
}
