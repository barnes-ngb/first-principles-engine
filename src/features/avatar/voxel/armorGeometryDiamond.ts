import * as THREE from 'three'
import type { BodyLayout } from './buildArmorPiece'
import { taggedBox, taggedFlatBox, W } from './buildArmorPiece'

// ── Diamond tier armor geometry ─────────────────────────────────────
//
// The Stonebridge Guardian set: blue-steel plate cut into FACETS and
// stacked in LAYERS. Where Stone is carved and Iron is forged-and-
// riveted, Diamond is *faceted* — every mass is a stepped terrace or a
// 45°-turned block, so the whole set reads as cut crystal over steel
// even before the cyan `diamond` palette lands on it.
//
// Silhouette language (what makes it a new set at a glance):
//   • stepped crowns instead of domes (helmet, pauldrons, shin plates)
//   • chevrons and 45°-rotated "facet" blocks instead of rivets
//   • a tapering KITE shield instead of Iron's slab or Stone's tower,
//     carrying a small Stonebridge arch and a banner band
//   • a straight, parallel-edged blade with a plain straight crossguard
//
// Deliberately NOT here: spikes, skulls, magic/particle meshes, extra
// lights, and anything that crowds the face or the limbs. The face
// opening stays fully open and every mass stays inside the footprint
// the Iron set already occupies.
//
// Conventions are the established ones: colors are the `W` placeholder
// and the real color arrives from `applyTierToArmor` via the
// `primary` / `secondary` / `accent` / `detail` material role, and
// dimensions come from `getBodyLayout()` world units + `U` padding.
// Dimensions are first-pass estimates and will need render tuning.

// ── Helmet: open-face stepped Guardian helm ─────────────────────────
//
// Helmet is a child of headGroup, so local (0,0,0) is the head center.
// Head block is headSize³; head top = +hw/2, face = +Z.
// A three-step ziggurat crown (the set's vertical signature — no fin,
// no spike), an angular brow visor, faceted cheek plates set outside
// the head so the whole face stays visible, and a two-step neck guard.
export function buildDiamondHelmet(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { headSize } = layout
  const hw = headSize

  // CROWN — three stacked terraces, each narrower than the one below.
  // This stepped profile is Diamond's helmet signature: it reads as a
  // cut crystal cap rather than Iron's dome + fin or Stone's helm.
  const stepBase = taggedBox(hw * 1.34, hw * 0.3, hw * 1.3, W, 'primary', 'diamond_helm_crown_base')
  stepBase.position.set(0, hw * 0.25, 0)
  group.add(stepBase)

  const stepMid = taggedBox(hw * 1.1, hw * 0.26, hw * 1.05, W, 'primary', 'diamond_helm_crown_mid')
  stepMid.position.set(0, hw * 0.53, 0)
  group.add(stepMid)

  const stepTopH = hw * 0.22
  const stepTopY = hw * 0.77
  const stepTop = taggedBox(hw * 0.82, stepTopH, hw * 0.78, W, 'primary', 'diamond_helm_crown_top')
  stepTop.position.set(0, stepTopY, 0)
  group.add(stepTop)

  // CREST ANCHOR — Diamond only. `buildHelmetCrest` bases a crest on the
  // OLD open-face dome top (`headPx * 0.53`), and the stepped crown rises
  // well past it, so a fin / plume / horns / crown would sit inside the
  // terraces. The helmet publishes the Y its crest should stand on and the
  // renderer lifts the crest to it. Earlier tiers publish nothing and keep
  // their exact current crest behaviour — including Iron's and Gold's own
  // partial burial, which is not this slice's to repair.
  group.userData.crestBaseY = stepTopY + stepTopH / 2

  // CROWN FACETS — four blocks turned 45° at the corners of the base
  // terrace. From any angle one of them catches the light edge-on,
  // which is what makes the crown read as cut rather than cast.
  const facetCorners: [number, number][] = [
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ]
  facetCorners.forEach(([sx, sz], i) => {
    const facet = taggedBox(hw * 0.24, hw * 0.28, hw * 0.24, W, 'secondary', `diamond_helm_crown_facet_${i}`)
    facet.position.set(sx * hw * 0.6, hw * 0.26, sz * hw * 0.58)
    facet.rotation.y = Math.PI / 4
    group.add(facet)
  })

  // BROW VISOR — angular brim above the face opening, tipped forward so
  // it casts a hard shadow line across the upper face.
  //
  // EYE CLEARANCE (round-1 render repair). The face's pupils sit at
  // `hU * 0.5` with height `hU * 1` (`buildCharacter`), i.e. 0.0 … 0.125 hw
  // around a centre at 0.0625 hw, and the first candidate put this visor's
  // forward lip at ~0.059 hw — below the pupil centre, which a front
  // raycast caught on both body layouts. The visor is now shallower, higher
  // and less steeply tipped so its forward lip clears the pupil TOP, not
  // just the centre. Iron's brow sits at 0.075 hw and blocks only the upper
  // eye ray, so this is at or above the Gold/Iron bar. Pinned by the
  // pupil-raycast tests; the stepped shape and the open face are unchanged.
  const visor = taggedBox(hw * 1.38, hw * 0.14, hw * 0.26, W, 'secondary', 'diamond_helm_visor')
  visor.position.set(0, hw * 0.21, hw * 0.58)
  visor.rotation.x = -0.08
  group.add(visor)

  // BROW FACET — a single 45°-turned block centered on the visor. The
  // one bright point on the helm, and the piece's "gem" read without
  // any glow, spike or emblem. Raised and shrunk with the visor: it now
  // clears the pupil top in Y **and** is narrower than the gap between the
  // pupils in X, so a pupil-centre ray misses it on both counts.
  const browFacet = taggedBox(hw * 0.14, hw * 0.14, hw * 0.16, W, 'accent', 'diamond_helm_brow_facet')
  browFacet.position.set(0, hw * 0.24, hw * 0.705)
  browFacet.rotation.z = Math.PI / 4
  group.add(browFacet)

  // CHEEK PLATES — angled outside the head block so they widen the
  // silhouette and frame the face WITHOUT covering it. The face opening
  // between them is fully open, as on Iron.
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r'
    const cheek = taggedBox(hw * 0.22, hw * 0.5, hw * 0.42, W, 'primary', `diamond_helm_cheek_${tag}`)
    cheek.position.set(side * hw * 0.58, -hw * 0.12, hw * 0.26)
    cheek.rotation.y = side * -0.28
    group.add(cheek)

    // Bright faceted edge along the front lip of each cheek plate.
    const cheekEdge = taggedFlatBox(hw * 0.1, hw * 0.5, hw * 0.12, W, 'accent', `diamond_helm_cheek_edge_${tag}`)
    cheekEdge.position.set(side * hw * 0.63, -hw * 0.12, hw * 0.44)
    cheekEdge.rotation.y = side * -0.28
    group.add(cheekEdge)

    // Side plate bridging crown to cheek so the skull has no gap.
    const sidePlate = taggedBox(hw * 0.2, hw * 0.55, hw * 0.8, W, 'primary', `diamond_helm_side_${tag}`)
    sidePlate.position.set(side * hw * 0.57, hw * 0.02, -hw * 0.04)
    group.add(sidePlate)
  }

  // NECK GUARD — two stepped plates down the back, echoing the crown's
  // terraces. Replaces Iron's chainmail aventail entirely.
  const neckUpper = taggedBox(hw * 1.06, hw * 0.22, hw * 0.2, W, 'primary', 'diamond_helm_neck_upper')
  neckUpper.position.set(0, -hw * 0.16, -hw * 0.56)
  group.add(neckUpper)

  const neckLower = taggedBox(hw * 0.84, hw * 0.18, hw * 0.16, W, 'secondary', 'diamond_helm_neck_lower')
  neckLower.position.set(0, -hw * 0.36, -hw * 0.6)
  group.add(neckLower)

  return group
}

// ── Breastplate: angular faceted chestplate ─────────────────────────
//
// Two front plates tilted against each other so the chest has a shallow
// keel (Iron's front is one flat slab), a faceted cross raised on the
// upper plate, a chevron pair below it, stepped pauldrons, and layered
// vambraces on each arm. Arm pieces carry `attachToArm` so the renderer
// moves them onto armL/armR exactly as it does for the other tiers.
export function buildDiamondBreastplate(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, torsoCenter, torsoTop, torsoH, torsoW, torsoD, legTop, armH, armW, scale } = layout
  const s = scale

  const plateW = torsoW * 1.1
  const plateH = torsoH * 0.88
  const plateT = 0.2 * s
  const frontZ = torsoD / 2 + plateT / 2

  // FRONT UPPER / LOWER — tilted toward each other so the chest reads
  // as two cut planes meeting at the waistline rather than one slab.
  const frontUpper = taggedBox(plateW, plateH * 0.56, plateT, W, 'primary', 'diamond_chest_front_upper')
  frontUpper.position.set(0, torsoCenter + plateH * 0.22, frontZ)
  frontUpper.rotation.x = -0.08
  group.add(frontUpper)

  const frontLower = taggedBox(plateW * 0.86, plateH * 0.46, plateT, W, 'primary', 'diamond_chest_front_lower')
  frontLower.position.set(0, torsoCenter - plateH * 0.26, frontZ)
  frontLower.rotation.x = 0.08
  group.add(frontLower)

  // BACK — one plate plus a raised spine ridge.
  const back = taggedBox(plateW, plateH, plateT, W, 'primary', 'diamond_chest_back')
  back.position.set(0, torsoCenter, -frontZ)
  group.add(back)

  const backRidge = taggedFlatBox(U * 0.8, plateH * 0.8, 0.08 * s, W, 'secondary', 'diamond_chest_back_ridge')
  backRidge.position.set(0, torsoCenter, -(torsoD / 2 + plateT + 0.04 * s))
  group.add(backRidge)

  // SIDE PLATES — wrap front to back so the torso is enclosed.
  const sideD = torsoD + plateT * 2
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r'
    const sidePlate = taggedBox(plateT, plateH, sideD, W, 'primary', `diamond_chest_side_${tag}`)
    sidePlate.position.set(side * (torsoW / 2 + plateT / 2), torsoCenter, 0)
    group.add(sidePlate)
  }

  // GORGET — the neck ring, plus a wider shelf stepped out below it. The
  // ring sits in the neck gap exactly where Iron's collar does; the shelf
  // is the part that actually reads, since anything narrower than the
  // head block at that height disappears inside it.
  const collar = taggedBox(torsoW - U * 0.8, U * 1.6, torsoD + U * 1.4, W, 'primary', 'diamond_chest_collar')
  collar.position.set(0, torsoTop + U * 0.5, 0)
  group.add(collar)

  const collarShelf = taggedBox(torsoW + U * 0.6, U * 0.6, torsoD + U * 2.0, W, 'accent', 'diamond_chest_collar_shelf')
  collarShelf.position.set(0, torsoTop - U * 0.4, 0)
  group.add(collarShelf)

  // FACETED CROSS — the set keeps the Armor-of-God cross the earlier
  // tiers carry, but cut: a keel, a bar, and a 45°-turned centre facet.
  const reliefZ = frontZ + plateT / 2 + 0.04 * s
  const crossV = taggedBox(U * 1.1, plateH * 0.5, 0.08 * s, W, 'primary', 'diamond_chest_cross_v')
  crossV.position.set(0, torsoCenter + plateH * 0.2, reliefZ)
  group.add(crossV)

  const crossH = taggedBox(torsoW * 0.62, U * 1.1, 0.08 * s, W, 'primary', 'diamond_chest_cross_h')
  crossH.position.set(0, torsoCenter + plateH * 0.28, reliefZ)
  group.add(crossH)

  const crossFacet = taggedBox(U * 1.5, U * 1.5, 0.1 * s, W, 'accent', 'diamond_chest_cross_facet')
  crossFacet.position.set(0, torsoCenter + plateH * 0.28, reliefZ + 0.05 * s)
  crossFacet.rotation.z = Math.PI / 4
  group.add(crossFacet)

  // CHEVRON — two angled strips below the cross, pointing down. The
  // cheapest possible "this plate was cut, not cast" cue.
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r'
    const chevron = taggedFlatBox(U * 0.4, plateH * 0.3, 0.06 * s, W, 'secondary', `diamond_chest_chevron_${tag}`)
    chevron.position.set(side * plateW * 0.18, torsoCenter - plateH * 0.22, reliefZ)
    chevron.rotation.z = side * 0.55
    group.add(chevron)
  }

  // PAULDRONS — stepped shoulder caps: a broad lower plate and a
  // narrower upper terrace, with an accent lip under the lower plate.
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r'
    const shoulderX = side * (torsoW / 2 + U * 2.5)

    const pauldron = taggedBox(U * 4.2, U * 2.0, torsoD + U * 1.8, W, 'primary', `diamond_pauldron_${tag}`)
    pauldron.position.set(shoulderX, torsoTop - U * 0.4, 0)
    pauldron.rotation.z = side * -THREE.MathUtils.degToRad(5)
    group.add(pauldron)

    const pauldronStep = taggedBox(U * 3.0, U * 1.0, torsoD + U * 0.9, W, 'primary', `diamond_pauldron_step_${tag}`)
    pauldronStep.position.set(shoulderX, torsoTop + U * 0.9, 0)
    pauldronStep.rotation.z = side * -THREE.MathUtils.degToRad(5)
    group.add(pauldronStep)

    const pauldronLip = taggedFlatBox(U * 4.5, U * 0.5, torsoD + U * 2.2, W, 'accent', `diamond_pauldron_lip_${tag}`)
    pauldronLip.position.set(shoulderX, torsoTop - U * 1.6, 0)
    pauldronLip.rotation.z = side * -THREE.MathUtils.degToRad(5)
    group.add(pauldronLip)
  }

  // VAMBRACES — arm-local space (shoulder pivot at Y=0). Two layers plus
  // a bright cuff, so the arm matches the layered read of the torso.
  const upperH = armH * 0.46
  const lowerH = armH * 0.3
  for (const side of ['L', 'R'] as const) {
    const tag = side === 'L' ? 'l' : 'r'

    const upper = taggedBox(armW + U * 2.2, upperH, armW + U * 2.2, W, 'primary', `diamond_arm_upper_${tag}`)
    upper.position.set(0, -(upperH / 2 + U * 0.5), 0)
    upper.userData.attachToArm = side
    group.add(upper)

    const cuff = taggedFlatBox(armW + U * 2.6, U * 0.6, armW + U * 2.6, W, 'accent', `diamond_arm_cuff_${tag}`)
    cuff.position.set(0, -(upperH + U * 0.7), 0)
    cuff.userData.attachToArm = side
    group.add(cuff)

    const lower = taggedBox(armW + U * 1.6, lowerH, armW + U * 1.6, W, 'primary', `diamond_arm_lower_${tag}`)
    lower.position.set(0, -(upperH + U * 1.0 + lowerH / 2), 0)
    lower.userData.attachToArm = side
    group.add(lower)
  }

  // BOTTOM RIM — closes the plate at the waist, as on every tier.
  const rim = taggedBox(plateW + U * 0.3, U * 0.9, torsoD + plateT * 2 + U * 0.3, W, 'accent', 'diamond_chest_rim')
  rim.position.set(0, legTop + U * 0.2, 0)
  group.add(rim)

  return group
}

// ── Belt: segmented plate belt ──────────────────────────────────────
//
// Not a band. Eight discrete plates around the waist — three front,
// three back, one each side — with 45°-turned link blocks at the
// corners and a faceted buckle. Reads as articulated plate, and is the
// clearest "different piece" at a glance next to Iron's banded belt.
export function buildDiamondBelt(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, legTop, torsoW, torsoD } = layout

  const segH = U * 2.2
  const segT = U * 1.2
  const frontZ = torsoD / 2 + U * 0.8
  const sideX = torsoW / 2 + U * 0.8
  const segW = torsoW * 0.3

  // FRONT + BACK segments — three plates per face with visible gaps.
  const segXs = [-torsoW * 0.33, 0, torsoW * 0.33]
  segXs.forEach((x, i) => {
    const front = taggedBox(segW, segH, segT, W, 'primary', `diamond_belt_seg_front_${i}`)
    front.position.set(x, legTop, frontZ)
    group.add(front)

    const back = taggedBox(segW, segH, segT, W, 'primary', `diamond_belt_seg_back_${i}`)
    back.position.set(x, legTop, -frontZ)
    group.add(back)
  })

  // SIDE segments.
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r'
    const seg = taggedBox(segT, segH, torsoD * 0.8, W, 'primary', `diamond_belt_seg_side_${tag}`)
    seg.position.set(side * sideX, legTop, 0)
    group.add(seg)
  }

  // CORNER LINKS — turned 45° so each hip corner shows an edge, which
  // is what makes the ring of plates read as one faceted belt.
  const linkCorners: [number, number][] = [
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ]
  linkCorners.forEach(([sx, sz], i) => {
    const link = taggedBox(U * 1.1, segH * 0.85, U * 1.1, W, 'secondary', `diamond_belt_link_${i}`)
    link.position.set(sx * sideX * 0.94, legTop, sz * frontZ * 0.94)
    link.rotation.y = Math.PI / 4
    group.add(link)
  })

  // BUCKLE — one 45°-turned plate with a smaller facet inside it.
  const buckle = taggedBox(U * 2.4, U * 2.4, U * 1.0, W, 'accent', 'diamond_belt_buckle')
  buckle.position.set(0, legTop, frontZ + segT / 2 + U * 0.4)
  buckle.rotation.z = Math.PI / 4
  group.add(buckle)

  const buckleFacet = taggedFlatBox(U * 1.1, U * 1.1, U * 0.4, W, 'secondary', 'diamond_belt_buckle_facet')
  buckleFacet.position.set(0, legTop, frontZ + segT / 2 + U * 1.0)
  buckleFacet.rotation.z = Math.PI / 4
  group.add(buckleFacet)

  // Small cross on the buckle face, as on the Iron and Stone belts.
  const crossZ = frontZ + segT / 2 + U * 1.3
  const crossV = taggedFlatBox(U * 0.35, U * 1.3, U * 0.25, W, 'primary', 'diamond_belt_cross_v')
  crossV.position.set(0, legTop, crossZ)
  group.add(crossV)

  const crossH = taggedFlatBox(U * 1.3, U * 0.35, U * 0.25, W, 'primary', 'diamond_belt_cross_h')
  crossH.position.set(0, legTop, crossZ)
  group.add(crossH)

  return group
}

// ── Shoes: faceted sabatons + layered shin plates ───────────────────
export function buildDiamondShoes(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U, legW, legD, legH } = layout
  const legX = legW / 2 + U * 0.15

  const sabH = legH * 0.2
  const sabW = legW + U * 2.4
  const sabD = legD + U * 2.4

  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r'
    const x = side * legX

    // SABATON — the foot shell.
    const sabaton = taggedBox(sabW, sabH, sabD, W, 'primary', `diamond_sabaton_${tag}`)
    sabaton.position.set(x, sabH / 2, U * 0.3)
    group.add(sabaton)

    // TOE WEDGE — tipped forward so the foot ends in a cut angle rather
    // than a square block.
    const toe = taggedBox(sabW * 0.8, sabH * 0.55, U * 1.6, W, 'primary', `diamond_sabaton_toe_${tag}`)
    toe.position.set(x, sabH * 0.32, sabD / 2 + U * 0.6)
    toe.rotation.x = 0.35
    group.add(toe)

    // OUTER FACET — a 45°-turned block on the outside of each foot.
    const facet = taggedFlatBox(U * 1.0, sabH * 0.7, U * 1.0, W, 'secondary', `diamond_sabaton_facet_${tag}`)
    facet.position.set(side * (legX + sabW * 0.42), sabH * 0.5, U * 0.3)
    facet.rotation.y = Math.PI / 4
    group.add(facet)

    // SOLE — accent band at the ground.
    const sole = taggedBox(sabW + U * 0.3, U * 0.9, sabD + U * 0.8, W, 'accent', `diamond_sole_${tag}`)
    sole.position.set(x, U * 0.2, U * 0.5)
    group.add(sole)

    // SHIN — two stacked plates, lower broad and upper narrow, matching
    // the stepped read of the crown and the pauldrons.
    const shinLowerH = legH * 0.3
    const shinUpperH = legH * 0.24
    const shinZ = legD / 2 + U * 0.9
    const shinLowerY = sabH + shinLowerH / 2 + U * 0.3

    const shinLower = taggedFlatBox(legW + U * 0.8, shinLowerH, U * 1.0, W, 'primary', `diamond_shin_lower_${tag}`)
    shinLower.position.set(x, shinLowerY, shinZ)
    group.add(shinLower)

    const shinUpperY = shinLowerY + shinLowerH / 2 + shinUpperH / 2 + U * 0.15
    const shinUpper = taggedFlatBox(legW + U * 0.2, shinUpperH, U * 0.9, W, 'primary', `diamond_shin_upper_${tag}`)
    shinUpper.position.set(x, shinUpperY, shinZ - U * 0.05)
    group.add(shinUpper)

    // DIAGONAL FACET — one tilted strip across the lower shin plate.
    const shinFacet = taggedFlatBox(U * 0.35, shinLowerH * 0.8, U * 0.3, W, 'accent', `diamond_shin_facet_${tag}`)
    shinFacet.position.set(x, shinLowerY, shinZ + U * 0.5)
    shinFacet.rotation.z = 0.5
    group.add(shinFacet)

    // KNEE — a 45°-turned cap above the upper shin plate.
    const knee = taggedFlatBox(U * 1.8, U * 1.8, U * 1.2, W, 'secondary', `diamond_knee_${tag}`)
    knee.position.set(x, shinUpperY + shinUpperH / 2 + U * 0.5, shinZ)
    knee.rotation.z = Math.PI / 4
    group.add(knee)

    // CALF — short back plate so the leg is not open from behind.
    const calf = taggedFlatBox(legW + U * 0.2, legH * 0.34, U * 0.8, W, 'primary', `diamond_calf_${tag}`)
    calf.position.set(x, sabH + legH * 0.17 + U * 0.3, -(legD / 2 + U * 0.8))
    group.add(calf)
  }

  return group
}

// ── Shield: tapering kite shield (Stonebridge arch + banner) ────────
//
// The kite is built as five stacked rows whose widths hold straight for
// the top two fifths and then taper to a narrow tip — the voxel way to
// read a kite without leaving the block language. On its face sit a
// small bridge arch (two piers, two haunches, a lintel) and a banner
// band with a swallowtail: Stonebridge's own marks, modest and in the
// secondary/accent tones, not a crest or a sigil.
//
// `attachToArm`, the `shield_visual` sub-group, its pose transform and
// the `emblemX/Y/Z` anchor are byte-identical in intent to the other
// tiers — the renderer hangs the shield and the chosen emblem exactly
// as before.
export function buildDiamondShield(layout: BodyLayout): THREE.Group {
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

  // Shield-local sign of the kite's WIDE TOP edge — the end that must point
  // at the ELBOW, with the point hanging toward the knee.
  //
  // ROUND-1 RENDER REPAIR: the first candidate read this off the Iron
  // shield's own naming (`shield_rim_top` sits at -shieldH/2) and set it to
  // -1, which the production render and the shield-wall pose showed upside
  // down — tip at the elbow, broad edge at the knee. Iron's "top"/"bot"
  // labels do not survive the arm transform, so the sign is now the render's
  // answer, not the label's. Every y in this builder is expressed through
  // `TOP`, so this constant is the whole orientation; the group/visual pose
  // transforms, `attachToArm` and the emblem anchor are untouched by it.
  const TOP = 1

  const shieldH = armH * 1.0
  const shieldW = U * 8
  const thick = U * 1.5
  const faceX = -(thick / 2)

  /** y for a normalized position down the shield: t=0 top edge, t=1 tip. */
  const yAt = (t: number) => TOP * (shieldH / 2 - t * shieldH)
  /** Width fraction at t — straight shoulders, then a taper to the tip. */
  const widthAt = (t: number) =>
    t <= 0.4 ? 1 - t * 0.1 : 0.96 + ((t - 0.4) / 0.6) * (0.14 - 0.96)

  // BODY — five rows, each sized by the width at its upper edge so the
  // steps sit just inside the kite outline.
  const rows = 5
  const rowH = shieldH / rows
  for (let i = 0; i < rows; i++) {
    const tUpper = i / rows
    const row = taggedBox(
      thick,
      rowH,
      shieldW * widthAt(tUpper),
      W,
      'primary',
      `diamond_shield_row_${i}`,
    )
    row.position.set(0, yAt(tUpper + 0.5 / rows), 0)
    visual.add(row)
  }

  // TIP — the kite's point, just past the last row.
  const tip = taggedBox(thick * 0.8, rowH * 0.5, shieldW * 0.14, W, 'primary', 'diamond_shield_tip')
  tip.position.set(0, yAt(1) - TOP * (rowH * 0.25), 0)
  visual.add(tip)

  // INNER PANEL — a flush face plate on the broad upper half, the
  // surface the arch and the banner stand off from.
  const inner = taggedFlatBox(U * 0.3, shieldH * 0.5, shieldW * 0.82, W, 'primary', 'diamond_shield_inner')
  inner.position.set(faceX - U * 0.15, yAt(0.3), 0)
  visual.add(inner)

  // TOP CAP — the straight upper edge of the kite.
  const cap = taggedBox(thick + U * 0.2, U * 0.6, shieldW + U * 0.4, W, 'accent', 'diamond_shield_cap')
  cap.position.set(0, yAt(0) - TOP * U * 0.3, 0)
  visual.add(cap)

  // SHOULDER RIMS — the two straight side edges of the upper kite.
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r'
    const rim = taggedBox(thick + U * 0.1, rowH * 2, U * 0.6, W, 'accent', `diamond_shield_rim_${tag}`)
    rim.position.set(0, yAt(0.2), side * (shieldW / 2 + U * 0.1))
    visual.add(rim)
  }

  // TAPER RIMS — one bar down each diagonal edge, rotated to lie along
  // the taper so the kite outline reads as a cut edge, not a staircase.
  const tEdgeTop = 0.4
  const tEdgeTip = 1.0
  const zEdgeTop = (shieldW / 2) * widthAt(tEdgeTop)
  const zEdgeTip = (shieldW / 2) * widthAt(tEdgeTip)
  const edgeDy = yAt(tEdgeTip) - yAt(tEdgeTop)
  const edgeDz = zEdgeTip - zEdgeTop
  const edgeLen = Math.hypot(edgeDy, edgeDz)
  const edgeAngle = Math.atan2(edgeDz, edgeDy)
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r'
    const edge = taggedBox(thick + U * 0.1, edgeLen, U * 0.55, W, 'accent', `diamond_shield_edge_${tag}`)
    edge.position.set(
      0,
      (yAt(tEdgeTop) + yAt(tEdgeTip)) / 2,
      side * (zEdgeTop + zEdgeTip) / 2,
    )
    edge.rotation.x = side * edgeAngle
    visual.add(edge)
  }

  // STONEBRIDGE ARCH — two piers, two angled haunches and a lintel on
  // the upper face. The village's own mark, kept small and structural.
  const archT = yAt(0.28)
  const pierH = shieldH * 0.14
  // Stands clear of the inner panel's face so the arch is never coplanar
  // with it, and stays behind the boss.
  const archX = faceX - U * 0.6
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r'
    const pier = taggedFlatBox(U * 0.3, pierH, U * 0.45, W, 'secondary', `diamond_shield_arch_pier_${tag}`)
    pier.position.set(archX, archT, side * U * 1.5)
    visual.add(pier)

    const haunch = taggedFlatBox(U * 0.3, pierH * 0.7, U * 0.45, W, 'secondary', `diamond_shield_arch_haunch_${tag}`)
    haunch.position.set(archX, archT + TOP * pierH * 0.6, side * U * 1.1)
    haunch.rotation.x = side * 0.7
    visual.add(haunch)
  }

  const lintel = taggedFlatBox(U * 0.3, U * 0.45, U * 2.6, W, 'secondary', 'diamond_shield_arch_lintel')
  lintel.position.set(archX, archT + TOP * pierH * 1.05, 0)
  visual.add(lintel)

  // BANNER — a narrow band hanging below the boss with a two-block
  // swallowtail, the Banner Hall read in three small pieces.
  const bannerY = yAt(0.72)
  const bannerH = shieldH * 0.2
  const banner = taggedFlatBox(U * 0.35, bannerH, U * 1.2, W, 'accent', 'diamond_shield_banner')
  banner.position.set(faceX - U * 0.45, bannerY, 0)
  visual.add(banner)

  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r'
    const tail = taggedFlatBox(U * 0.35, bannerH * 0.45, U * 0.5, W, 'accent', `diamond_shield_banner_tail_${tag}`)
    tail.position.set(faceX - U * 0.45, bannerY - TOP * bannerH * 0.5, side * U * 0.35)
    tail.rotation.x = side * 0.5
    visual.add(tail)
  }

  // BOSS — the centre facet, turned 45° like the helm's brow block.
  const bossPos = new THREE.Vector3(faceX - U * 0.5, yAt(0.5), 0)
  const boss = taggedFlatBox(U * 0.6, U * 2.1, U * 2.1, W, 'accent', 'diamond_shield_boss')
  boss.userData.isAccent = true
  boss.position.copy(bossPos)
  boss.rotation.x = Math.PI / 4
  visual.add(boss)

  // Emblem anchor — same derivation as the other tiers, so the chosen
  // shield emblem lands on the boss.
  const emblemAnchor = bossPos.clone()
    .applyEuler(visual.rotation)
    .add(visual.position)
  group.userData.emblemX = emblemAnchor.x
  group.userData.emblemY = emblemAnchor.y
  group.userData.emblemZ = emblemAnchor.z

  return group
}

// ── Sword: straight Guardian blade ──────────────────────────────────
// Geometry only: grip center at origin, pommel above (+Y, in hand),
// blade extending DOWN (-Y). Transform is applied by buildSword() in
// buildArmorPiece.ts.
//
// A straight, parallel-edged blade with chamfer strips down both long
// edges, a plain straight crossguard with faceted ends, and a turned
// pommel. No glow mesh and no point light — the tier palette's emissive
// is the only light this piece carries.
export function buildDiamondSword(layout: BodyLayout): THREE.Group {
  const group = new THREE.Group()
  const { U } = layout

  // GRIP — wrapped handle, centered at origin.
  const grip = taggedFlatBox(U * 1.2, U * 4, U * 1.4, W, 'detail', 'diamond_sword_grip')
  grip.position.set(0, 0, 0)
  group.add(grip)

  // POMMEL — turned 45° so it reads as a cut stone in the hand.
  const pommel = taggedFlatBox(U * 1.5, U * 1.5, U * 1.5, W, 'accent', 'diamond_sword_pommel')
  pommel.userData.isAccent = true
  pommel.position.set(0, U * 2.6, 0)
  pommel.rotation.z = Math.PI / 4
  group.add(pommel)

  // CROSSGUARD — straight bar, no curve and no quillon flare. Sits
  // flush between the grip and the blade.
  const guardY = -U * 2.7
  const guard = taggedFlatBox(U * 1.2, U * 1.4, U * 5.6, W, 'accent', 'diamond_sword_crossguard')
  guard.userData.isAccent = true
  guard.position.set(0, guardY, 0)
  group.add(guard)

  // GUARD END FACETS — a turned block at each tip of the crossguard, so
  // the guard ends on an edge instead of a square cut.
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r'
    const end = taggedFlatBox(U * 0.8, U * 0.8, U * 0.8, W, 'secondary', `diamond_sword_guard_end_${tag}`)
    end.position.set(0, guardY, side * U * 2.8)
    end.rotation.x = Math.PI / 4
    group.add(end)
  }

  // BLADE — one straight parallel-edged section (Iron steps down in two
  // stages; this one does not), with a fuller ridge and chamfer strips.
  const bladeH = U * 14
  const bladeY = -U * 3.4 - bladeH / 2
  const blade = taggedBox(U * 1.0, bladeH, U * 2.2, W, 'primary', 'diamond_sword_blade')
  blade.position.set(0, bladeY, 0)
  group.add(blade)

  // The blade's broad faces are ±X and its cutting edges are ±Z, as on
  // the Iron blade — so the fuller runs down each FACE and the bright
  // chamfer strips sit on the EDGES.
  for (const face of [-1, 1] as const) {
    const tag = face < 0 ? 'b' : 'f'
    const fuller = taggedFlatBox(U * 0.3, bladeH - U * 1.0, U * 0.5, W, 'secondary', `diamond_sword_fuller_${tag}`)
    fuller.position.set(face * U * 0.6, bladeY, 0)
    group.add(fuller)
  }

  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'l' : 'r'
    const chamfer = taggedFlatBox(U * 0.45, bladeH - U * 0.6, U * 0.3, W, 'accent', `diamond_sword_chamfer_${tag}`)
    chamfer.position.set(0, bladeY, side * U * 1.1)
    group.add(chamfer)
  }

  // TIP — short point at the bottom.
  const tip = taggedFlatBox(U * 0.8, U * 2, U * 1.1, W, 'primary', 'diamond_sword_tip')
  tip.position.set(0, bladeY - bladeH / 2 - U * 1.0, 0)
  group.add(tip)

  return group
}
