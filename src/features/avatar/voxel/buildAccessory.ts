import * as THREE from 'three'
import type { AccessoryId, CharacterProportions } from '../../../core/types'
import { getBodyLayout } from './buildCharacter'

// ── Helpers ─────────────────────────────────────────────────────────

function box(
  w: number, h: number, d: number,
  color: number,
  opts?: { transparent?: boolean; opacity?: number },
): THREE.Mesh {
  const mat = new THREE.MeshLambertMaterial({
    color,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1,
  })
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
}

// ── HEAD ACCESSORIES (head-local coords, head center = 0,0,0) ──────
// hU = head pixel unit = U * headPx / 8 (scales with head size)

function buildGlasses(hU: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_glasses'

  const frame = 0x333333
  // Left lens
  const lensL = box(hU * 2.4, hU * 2, hU * 0.6, 0x88ccff, { transparent: true, opacity: 0.35 })
  lensL.position.set(-hU * 1.8, hU * 0.5, hU * 4.3)
  g.add(lensL)
  // Right lens
  const lensR = box(hU * 2.4, hU * 2, hU * 0.6, 0x88ccff, { transparent: true, opacity: 0.35 })
  lensR.position.set(hU * 1.8, hU * 0.5, hU * 4.3)
  g.add(lensR)
  // Bridge
  const bridge = box(hU * 1.2, hU * 0.4, hU * 0.4, frame)
  bridge.position.set(0, hU * 0.8, hU * 4.3)
  g.add(bridge)
  // Frames around lenses
  const frameL = box(hU * 2.8, hU * 0.3, hU * 0.3, frame)
  frameL.position.set(-hU * 1.8, hU * 1.5, hU * 4.5)
  g.add(frameL)
  const frameR = box(hU * 2.8, hU * 0.3, hU * 0.3, frame)
  frameR.position.set(hU * 1.8, hU * 1.5, hU * 4.5)
  g.add(frameR)
  const frameLB = box(hU * 2.8, hU * 0.3, hU * 0.3, frame)
  frameLB.position.set(-hU * 1.8, -hU * 0.5, hU * 4.5)
  g.add(frameLB)
  const frameRB = box(hU * 2.8, hU * 0.3, hU * 0.3, frame)
  frameRB.position.set(hU * 1.8, -hU * 0.5, hU * 4.5)
  g.add(frameRB)
  // Temple arms (sides of head)
  const templeL = box(hU * 0.3, hU * 0.3, hU * 4, frame)
  templeL.position.set(-hU * 3.8, hU * 0.8, hU * 2)
  g.add(templeL)
  const templeR = box(hU * 0.3, hU * 0.3, hU * 4, frame)
  templeR.position.set(hU * 3.8, hU * 0.8, hU * 2)
  g.add(templeR)

  return g
}

function buildSunglasses(hU: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_sunglasses'

  const frame = 0x222222
  // Left lens — dark opaque
  const lensL = box(hU * 2.6, hU * 2.2, hU * 0.6, 0x333333)
  lensL.position.set(-hU * 1.8, hU * 0.5, hU * 4.3)
  g.add(lensL)
  // Right lens
  const lensR = box(hU * 2.6, hU * 2.2, hU * 0.6, 0x333333)
  lensR.position.set(hU * 1.8, hU * 0.5, hU * 4.3)
  g.add(lensR)
  // Bridge
  const bridge = box(hU * 1.2, hU * 0.4, hU * 0.4, frame)
  bridge.position.set(0, hU * 0.8, hU * 4.5)
  g.add(bridge)
  // Temple arms
  const templeL = box(hU * 0.3, hU * 0.3, hU * 4, frame)
  templeL.position.set(-hU * 3.8, hU * 0.8, hU * 2)
  g.add(templeL)
  const templeR = box(hU * 0.3, hU * 0.3, hU * 4, frame)
  templeR.position.set(hU * 3.8, hU * 0.8, hU * 2)
  g.add(templeR)

  return g
}

function buildHeadband(hU: number, color: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_headband'

  // Band wrapping around head just above eyes
  const halfHead = 4.2 // just past half of 8-px grid
  const front = box(hU * 8.4, hU * 1.2, hU * 0.6, color)
  front.position.set(0, hU * 2.8, hU * halfHead)
  g.add(front)
  const back = box(hU * 8.4, hU * 1.2, hU * 0.6, color)
  back.position.set(0, hU * 2.8, -hU * halfHead)
  g.add(back)
  const sideL = box(hU * 0.6, hU * 1.2, hU * 8.4, color)
  sideL.position.set(-hU * halfHead, hU * 2.8, 0)
  g.add(sideL)
  const sideR = box(hU * 0.6, hU * 1.2, hU * 8.4, color)
  sideR.position.set(hU * halfHead, hU * 2.8, 0)
  g.add(sideR)

  return g
}

function buildCrown(hU: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_crown'

  const gold = 0xffd700
  const darkGold = 0xdaa520
  // Horizontal band (sits on top of head)
  const band = box(hU * 7, hU * 1.6, hU * 7, gold)
  band.position.set(0, hU * 5.4, 0)
  g.add(band)
  // Three points
  const point1 = box(hU * 1.4, hU * 2.4, hU * 1.4, gold)
  point1.position.set(-hU * 2.4, hU * 7.2, 0)
  g.add(point1)
  const point2 = box(hU * 1.6, hU * 3.0, hU * 1.6, gold)
  point2.position.set(0, hU * 7.6, 0)
  g.add(point2)
  const point3 = box(hU * 1.4, hU * 2.4, hU * 1.4, gold)
  point3.position.set(hU * 2.4, hU * 7.2, 0)
  g.add(point3)
  // Gem on center point
  const gem = box(hU * 0.8, hU * 0.8, hU * 0.8, 0xff0000)
  gem.position.set(0, hU * 7.6, hU * 0.9)
  g.add(gem)
  // Base detail
  const trim = box(hU * 7.4, hU * 0.4, hU * 7.4, darkGold)
  trim.position.set(0, hU * 4.6, 0)
  g.add(trim)

  return g
}

function buildBandana(hU: number, color: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_bandana'

  // Triangle covering lower face
  const main = box(hU * 6, hU * 2.8, hU * 0.5, color)
  main.position.set(0, -hU * 1.8, hU * 4.3)
  g.add(main)
  // Knot behind head
  const knot = box(hU * 2, hU * 1.4, hU * 1, color)
  knot.position.set(0, -hU * 0.8, -hU * 4.3)
  g.add(knot)
  // Dangling tails
  const tail1 = box(hU * 0.8, hU * 2, hU * 0.5, color)
  tail1.position.set(-hU * 0.8, -hU * 2.5, -hU * 4.6)
  tail1.rotation.z = 0.2
  g.add(tail1)
  const tail2 = box(hU * 0.8, hU * 2, hU * 0.5, color)
  tail2.position.set(hU * 0.8, -hU * 2.5, -hU * 4.6)
  tail2.rotation.z = -0.2
  g.add(tail2)

  return g
}

// ── BACK ACCESSORIES (character-root coords, use layout positions) ──

function buildBackpack(U: number, layout: ReturnType<typeof getBodyLayout>): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_backpack'
  const tC = layout.torsoCenter / U // torso center in px
  const tT = layout.torsoTop / U
  const tD = layout.p.torsoPxD

  const green = 0x2e7d32
  const darkGreen = 0x1b5e20
  // Main box
  const body = box(U * 6, U * 7, U * 3, green)
  body.position.set(0, U * tC, -U * (tD / 2 + 2.5))
  g.add(body)
  // Flap
  const flap = box(U * 6.2, U * 2, U * 0.5, darkGreen)
  flap.position.set(0, U * (tC + 4), -U * (tD / 2 + 1.2))
  g.add(flap)
  // Straps (going over shoulders)
  const strapL = box(U * 1, U * 9, U * 0.5, darkGreen)
  strapL.position.set(-U * 2, U * (tC + 2), -U * 1)
  g.add(strapL)
  const strapR = box(U * 1, U * 9, U * 0.5, darkGreen)
  strapR.position.set(U * 2, U * (tC + 2), -U * 1)
  g.add(strapR)
  // Front strap connectors
  const strapFL = box(U * 1, U * 3, U * 0.4, darkGreen)
  strapFL.position.set(-U * 2, U * (tT - 2), U * (tD / 2 + 0.5))
  g.add(strapFL)
  const strapFR = box(U * 1, U * 3, U * 0.4, darkGreen)
  strapFR.position.set(U * 2, U * (tT - 2), U * (tD / 2 + 0.5))
  g.add(strapFR)
  // Pocket
  const pocket = box(U * 4, U * 2.5, U * 0.5, darkGreen)
  pocket.position.set(0, U * (tC - 2), -U * (tD / 2 + 4.2))
  g.add(pocket)

  return g
}

function buildWings(U: number, layout: ReturnType<typeof getBodyLayout>): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_wings'
  const tC = layout.torsoCenter / U
  const tD = layout.p.torsoPxD

  const white = 0xf0f0f0
  // Left wing — angled flat boxes
  const wingL = new THREE.Group()
  wingL.name = 'wingL'
  const feather1L = box(U * 1, U * 6, U * 0.6, white, { transparent: true, opacity: 0.85 })
  feather1L.position.set(-U * 3, U * 1, 0)
  feather1L.rotation.z = 0.3
  wingL.add(feather1L)
  const feather2L = box(U * 1, U * 7, U * 0.6, white, { transparent: true, opacity: 0.85 })
  feather2L.position.set(-U * 4.5, U * 1.5, 0)
  feather2L.rotation.z = 0.5
  wingL.add(feather2L)
  const feather3L = box(U * 1, U * 5.5, U * 0.6, white, { transparent: true, opacity: 0.85 })
  feather3L.position.set(-U * 5.5, U * 0.5, 0)
  feather3L.rotation.z = 0.7
  wingL.add(feather3L)
  wingL.position.set(0, U * (tC + 2), -U * (tD / 2 + 1.5))
  g.add(wingL)

  // Right wing — mirror
  const wingR = new THREE.Group()
  wingR.name = 'wingR'
  const feather1R = box(U * 1, U * 6, U * 0.6, white, { transparent: true, opacity: 0.85 })
  feather1R.position.set(U * 3, U * 1, 0)
  feather1R.rotation.z = -0.3
  wingR.add(feather1R)
  const feather2R = box(U * 1, U * 7, U * 0.6, white, { transparent: true, opacity: 0.85 })
  feather2R.position.set(U * 4.5, U * 1.5, 0)
  feather2R.rotation.z = -0.5
  wingR.add(feather2R)
  const feather3R = box(U * 1, U * 5.5, U * 0.6, white, { transparent: true, opacity: 0.85 })
  feather3R.position.set(U * 5.5, U * 0.5, 0)
  feather3R.rotation.z = -0.7
  wingR.add(feather3R)
  wingR.position.set(0, U * (tC + 2), -U * (tD / 2 + 1.5))
  g.add(wingR)

  return g
}

// ── HAND ACCESSORIES (arm-local coords, shoulder pivot at Y=0) ─────

function buildBook(U: number, layout: ReturnType<typeof getBodyLayout>): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_book'
  g.userData.attachToArm = 'L'
  const handY = layout.p.armPxH - 1 // near bottom of arm

  const brown = 0x6d4c21
  const pages = 0xfaf0dc
  // Book body — held at forearm
  const cover = box(U * 3.5, U * 4.5, U * 1.2, brown)
  cover.position.set(-U * 3, -U * handY, U * 1)
  g.add(cover)
  // Pages edge
  const pageEdge = box(U * 0.4, U * 4, U * 1, pages)
  pageEdge.position.set(-U * 1.2, -U * handY, U * 1)
  g.add(pageEdge)
  // Spine detail
  const spine = box(U * 0.3, U * 4.5, U * 1.2, 0x4a3520)
  spine.position.set(-U * 4.8, -U * handY, U * 1)
  g.add(spine)

  return g
}

// ── BODY ACCESSORIES ────────────────────────────────────────────────

function buildScarf(U: number, color: number, layout: ReturnType<typeof getBodyLayout>): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_scarf'
  const tT = layout.torsoTop / U
  const tW = layout.p.torsoPxW
  const tD = layout.p.torsoPxD

  // Wrap around neck
  const wrap = box(U * (tW + 2), U * 2, U * (tD + 2), color)
  wrap.position.set(0, U * (tT + 0.5), 0)
  g.add(wrap)
  // Hanging tail in front
  const tail = box(U * 2.5, U * 5, U * 0.8, color)
  tail.position.set(U * 1.5, U * (tT - 4), U * (tD / 2 + 1.5))
  tail.rotation.z = -0.15
  g.add(tail)
  // Tail end fringe
  const fringe1 = box(U * 0.6, U * 0.8, U * 0.6, color)
  fringe1.position.set(U * 0.8, U * (tT - 7), U * (tD / 2 + 1.5))
  g.add(fringe1)
  const fringe2 = box(U * 0.6, U * 0.8, U * 0.6, color)
  fringe2.position.set(U * 2.2, U * (tT - 7), U * (tD / 2 + 1.5))
  g.add(fringe2)

  return g
}

function buildParrot(U: number, layout: ReturnType<typeof getBodyLayout>): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_parrot'
  const tT = layout.torsoTop / U
  const tW = layout.p.torsoPxW

  // Parrot sits on right shoulder — scaled up 1.6× for readable presence
  const pX = U * (tW / 2 + 3)
  const pY = U * tT
  const pZ = 0

  // Body group — animated as a unit (bob + sway)
  const parrotBody = new THREE.Group()
  parrotBody.name = 'parrotBody'

  // Body (bright red, chunky)
  const body = box(U * 3.2, U * 4, U * 3.2, 0xe94f37)
  body.position.set(0, 0, 0)
  parrotBody.add(body)

  // Head (green)
  const head = box(U * 2.6, U * 2.6, U * 2.6, 0x22aa44)
  head.position.set(0, U * 3.5, U * 0.4)
  head.name = 'parrotHead'
  parrotBody.add(head)

  // Beak (yellow, pointed forward)
  const beak = box(U * 1, U * 0.8, U * 1.6, 0xf6ae2d)
  beak.position.set(0, U * 3.2, U * 2.4)
  parrotBody.add(beak)

  // Eyes (dark with white rim)
  const eyeL = box(U * 0.5, U * 0.5, U * 0.4, 0x111111)
  eyeL.position.set(-U * 0.8, U * 4.0, U * 1.6)
  parrotBody.add(eyeL)
  const eyeR = box(U * 0.5, U * 0.5, U * 0.4, 0x111111)
  eyeR.position.set(U * 0.8, U * 4.0, U * 1.6)
  parrotBody.add(eyeR)

  // Wings (green, folded against sides)
  const wingL = box(U * 0.5, U * 2.8, U * 2, 0x4cb944)
  wingL.position.set(-U * 1.8, U * 0.2, -U * 0.2)
  parrotBody.add(wingL)
  const wingR = box(U * 0.5, U * 2.8, U * 2, 0x4cb944)
  wingR.position.set(U * 1.8, U * 0.2, -U * 0.2)
  parrotBody.add(wingR)

  // Tail (blue, long, angled down-back)
  const tail = box(U * 1.6, U * 4.8, U * 1.3, 0x2266cc)
  tail.position.set(0, -U * 4.5, -U * 1.3)
  tail.rotation.x = 0.3
  parrotBody.add(tail)

  // Feet (small yellow talons gripping shoulder)
  const footL = box(U * 0.6, U * 0.5, U * 1, 0xf6ae2d)
  footL.position.set(-U * 0.7, -U * 2.3, U * 0.3)
  parrotBody.add(footL)
  const footR = box(U * 0.6, U * 0.5, U * 1, 0xf6ae2d)
  footR.position.set(U * 0.7, -U * 2.3, U * 0.3)
  parrotBody.add(footR)

  // Position entire parrot on shoulder
  parrotBody.position.set(pX, pY, pZ)
  g.add(parrotBody)

  return g
}

// ── Animation helpers ──────────────────────────────────────────────

/**
 * Animate accessories each frame. Call from the animation loop.
 * - Wings: subtle flutter (rotate Z ±3° on sine wave)
 * - Parrot: body bob + gentle head look-around
 */
export function animateAccessories(scene: THREE.Scene, time: number): void {
  // Wing flutter
  const wingL = scene.getObjectByName('wingL')
  const wingR = scene.getObjectByName('wingR')
  if (wingL) wingL.rotation.z = Math.sin(time * 2.5) * 0.052  // ~3°
  if (wingR) wingR.rotation.z = -Math.sin(time * 2.5) * 0.052

  // Parrot body bob — whole bird rises and falls gently
  const parrotBody = scene.getObjectByName('parrotBody')
  if (parrotBody) {
    parrotBody.position.y = parrotBody.userData.baseY ??
      (parrotBody.userData.baseY = parrotBody.position.y)
    parrotBody.position.y = (parrotBody.userData.baseY as number) + Math.sin(time * 2) * 0.03
  }

  // Parrot head — gentle side-to-side look
  const parrotHead = scene.getObjectByName('parrotHead')
  if (parrotHead) {
    parrotHead.rotation.y = Math.sin(time * 0.7) * 0.15
  }
}

// ── Conflict resolution ────────────────────────────────────────────

/**
 * Determine which accessories should be hidden based on armor conflicts.
 * - Helmet equipped → crown hides (glasses/sunglasses still show through visor)
 * - Shield equipped → book hides (shield takes priority on left arm)
 */
export function getHiddenAccessories(
  equippedArmor: string[],
  equippedAccessories: AccessoryId[],
): Set<AccessoryId> {
  const hidden = new Set<AccessoryId>()
  if (equippedArmor.includes('helmet') && equippedAccessories.includes('crown')) {
    hidden.add('crown')
  }
  if (equippedArmor.includes('shield') && equippedAccessories.includes('book')) {
    hidden.add('book')
  }
  return hidden
}

// ── Main builder ────────────────────────────────────────────────────

export interface AccessoryBuildOptions {
  /** Color for customizable accessories (headband, scarf, bandana) */
  color?: number
}

export function buildAccessory(
  type: AccessoryId,
  ageGroup: 'older' | 'younger',
  options?: AccessoryBuildOptions,
  customProportions?: Partial<CharacterProportions>,
): THREE.Group {
  const layout = getBodyLayout(ageGroup, customProportions)
  const { U } = layout
  const hU = (U * layout.p.headPx) / 8 // head pixel unit — scales with head size
  const color = options?.color ?? 0x4488cc

  let group: THREE.Group

  switch (type) {
    case 'glasses':    group = buildGlasses(hU); break
    case 'sunglasses': group = buildSunglasses(hU); break
    case 'headband':   group = buildHeadband(hU, color); break
    case 'crown':      group = buildCrown(hU); break
    case 'bandana':    group = buildBandana(hU, color); break
    case 'backpack':   group = buildBackpack(U, layout); break
    case 'wings':      group = buildWings(U, layout); break
    case 'book':       group = buildBook(U, layout); break
    case 'scarf':      group = buildScarf(U, color, layout); break
    case 'parrot':     group = buildParrot(U, layout); break
  }

  group.userData.isAccessory = true
  group.userData.accessoryType = type

  return group
}

/** Which body part group an accessory attaches to */
export function getAccessoryAttachPoint(type: AccessoryId): 'headGroup' | 'torso' | 'armL' | 'character' {
  switch (type) {
    case 'glasses':
    case 'sunglasses':
    case 'headband':
    case 'crown':
    case 'bandana':
      return 'headGroup'
    case 'book':
      return 'armL'
    case 'backpack':
    case 'wings':
    case 'scarf':
    case 'parrot':
      return 'character'  // attached to root character group (torso-level coords)
  }
}
