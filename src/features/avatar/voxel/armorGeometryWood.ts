import * as THREE from 'three'
import type { BodyLayout } from './buildArmorPiece'
import { taggedBox, taggedFlatBox, W } from './buildArmorPiece'

// ── Wood tier armor geometry ────────────────────────────────────────
//
// Humble, minimal shapes. The wood-tier set is the "starting kit":
// cloth/leather wraps, plank shields, training weapons. Nothing is
// polished or ornate. Dimensions are first-pass estimates and will
// need tuning after first render.

// ── Helmet: simple headband around the forehead ─────────────────────
//
// Helmet is a child of headGroup, so local (0,0,0) is the head center.
// Head block is headSize × headSize × headSize; head top = +h/2, face = +Z.
// Wood is the "I showed up" starting piece: a thin band at brow level,
// nothing covering the top of the skull. ALL hair stays visible.
export function buildWoodHelmet(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { headSize, scale: s } = layout
  const h = headSize
  const bandY = 0.15 * s // just above eye level, on the forehead
  const bandH = 0.3 * s  // tall enough to read clearly against skin/hair
  const bandT = 0.12 * s // band thickness

  // Front band — slightly wider than the sides so the corners overlap
  const front = taggedBox(h + 0.3 * s, bandH, bandT, W, 'primary', 'wood_band_front')
  front.position.set(0, bandY, h / 2 + bandT / 2)
  group.add(front)

  // Back band
  const back = taggedBox(h + 0.3 * s, bandH, bandT, W, 'primary', 'wood_band_back')
  back.position.set(0, bandY, -(h / 2 + bandT / 2))
  group.add(back)

  // Left side band — extended so it joins flush with front/back
  const sideL = taggedBox(bandT, bandH, h + 0.2 * s, W, 'primary', 'wood_band_l')
  sideL.position.set(-(h / 2 + bandT / 2), bandY, 0)
  group.add(sideL)

  // Right side band
  const sideR = taggedBox(bandT, bandH, h + 0.2 * s, W, 'primary', 'wood_band_r')
  sideR.position.set(h / 2 + bandT / 2, bandY, 0)
  group.add(sideR)

  // Decorative center notch on the front — chunkier and darker so it
  // reads clearly from straight-on.
  const notch = taggedBox(0.22 * s, 0.2 * s, 0.08 * s, W, 'secondary', 'wood_band_notch')
  notch.position.set(0, bandY, h / 2 + bandT + 0.04 * s)
  group.add(notch)

  return group
}

// ── Breastplate: leather vest — front + back panels with side laces ─
//
// Two flat leather panels rather than a single wraparound vest. Visible
// gaps at the sides show the magenta tunic underneath, and rope-tan
// laces span the gap connecting front and back — this is the humble
// "I showed up" piece, so we keep it clearly ad-hoc and hand-laced.
export function buildWoodBreastplate(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, torsoCenter, torsoTop, torsoH, torsoW, torsoD, legTop, scale } = layout
  const s = scale

  // Narrower than the torso so the tunic peeks out at the armpits
  const panelW = torsoW * 0.85
  const panelH = torsoH * 0.95
  const panelThickness = 0.12 * s
  const frontZ = torsoD / 2 + panelThickness / 2 + U * 0.1
  const backZ = -(torsoD / 2 + panelThickness / 2 + U * 0.1)

  // Front panel — flat leather slab covering only the chest center
  const front = taggedBox(panelW, panelH, panelThickness, W, 'primary', 'wood_vest_front')
  front.position.set(0, torsoCenter, frontZ)
  group.add(front)

  // Back panel — same shape mirrored to the back
  const back = taggedBox(panelW, panelH, panelThickness, W, 'primary', 'wood_vest_back')
  back.position.set(0, torsoCenter, backZ)
  group.add(back)

  // Small collar — thin strip at the top
  const collar = taggedFlatBox(torsoW * 0.6, U * 1.2, torsoD + U * 1.4, W, 'accent', 'wood_vest_collar')
  collar.position.set(0, torsoTop + U * 0.2, 0)
  group.add(collar)

  // Two vertical leather laces down the front panel
  const laceH = panelH * 0.75
  const laceZ = frontZ + panelThickness / 2 + U * 0.15
  const laceL = taggedFlatBox(U * 0.4, laceH, U * 0.2, W, 'accent', 'wood_vest_lace_l')
  laceL.position.set(-U * 1.2, torsoCenter, laceZ)
  group.add(laceL)
  const laceR = taggedFlatBox(U * 0.4, laceH, U * 0.2, W, 'accent', 'wood_vest_lace_r')
  laceR.position.set(U * 1.2, torsoCenter, laceZ)
  group.add(laceR)

  // Cross-stitches connecting the front laces
  const stitchCount = 4
  const stitchSpacing = laceH / (stitchCount + 1)
  for (let i = 1; i <= stitchCount; i++) {
    const y = torsoCenter - laceH / 2 + i * stitchSpacing
    const stitch = taggedFlatBox(U * 2.8, U * 0.25, U * 0.2, W, 'detail', `wood_vest_stitch_${i}`)
    stitch.position.set(0, y, laceZ)
    group.add(stitch)
  }

  // Stitching along the front panel edges — three short darker blocks on
  // each vertical edge so the seams read clearly against the leather.
  const edgeStitchX = panelW / 2 - U * 0.3
  const edgeStitchZ = frontZ + panelThickness / 2 + U * 0.05
  for (let i = -1; i <= 1; i++) {
    const y = torsoCenter + i * (panelH * 0.3)
    const eL = taggedFlatBox(U * 0.25, U * 0.4, U * 0.15, W, 'secondary', `wood_vest_edge_stitch_l_${i}`)
    eL.position.set(-edgeStitchX, y, edgeStitchZ)
    group.add(eL)
    const eR = taggedFlatBox(U * 0.25, U * 0.4, U * 0.15, W, 'secondary', `wood_vest_edge_stitch_r_${i}`)
    eR.position.set(edgeStitchX, y, edgeStitchZ)
    group.add(eR)
  }

  // Side rope ties — thin tan blocks spanning the exposed tunic gap on
  // each side, "lacing" the front and back panels together. Three ties
  // per side at shoulder / mid / hip height.
  const sideX = torsoW / 2 + U * 0.4
  const tieD = torsoD + U * 1.2
  for (let i = -1; i <= 1; i++) {
    const y = torsoCenter + i * (panelH * 0.3)
    const tieL = taggedFlatBox(U * 0.3, U * 0.3, tieD, W, 'accent', `wood_vest_tie_l_${i}`)
    tieL.position.set(-sideX, y, 0)
    group.add(tieL)
    const tieR = taggedFlatBox(U * 0.3, U * 0.3, tieD, W, 'accent', `wood_vest_tie_r_${i}`)
    tieR.position.set(sideX, y, 0)
    group.add(tieR)
  }

  // Bottom hem — only wraps the front/back panels, not the exposed sides
  const hemW = panelW + U * 0.2
  const hemFront = taggedFlatBox(hemW, U * 0.5, panelThickness + U * 0.2, W, 'accent', 'wood_vest_hem_front')
  hemFront.position.set(0, legTop + U * 0.2, frontZ)
  group.add(hemFront)
  const hemBack = taggedFlatBox(hemW, U * 0.5, panelThickness + U * 0.2, W, 'accent', 'wood_vest_hem_back')
  hemBack.position.set(0, legTop + U * 0.2, backZ)
  group.add(hemBack)

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
  group.position.set(-1.80 * s, -1.70 * s, 0.80 * s)
  group.rotation.set(-0.20, -3.04, -0.89)

  const visual = new THREE.Group()
  visual.name = 'shield_visual'
  visual.position.set(0, -1.8 * s, 0.6 * s)
  visual.rotation.set(-0.2, Math.PI, 0)
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
