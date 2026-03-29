import * as THREE from 'three'
import type { AccessoryId } from '../../../core/types'

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

function buildGlasses(U: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_glasses'

  const frame = 0x333333
  // Left lens
  const lensL = box(U * 2.4, U * 2, U * 0.6, 0x88ccff, { transparent: true, opacity: 0.35 })
  lensL.position.set(-U * 1.8, U * 0.5, U * 4.3)
  g.add(lensL)
  // Right lens
  const lensR = box(U * 2.4, U * 2, U * 0.6, 0x88ccff, { transparent: true, opacity: 0.35 })
  lensR.position.set(U * 1.8, U * 0.5, U * 4.3)
  g.add(lensR)
  // Bridge
  const bridge = box(U * 1.2, U * 0.4, U * 0.4, frame)
  bridge.position.set(0, U * 0.8, U * 4.3)
  g.add(bridge)
  // Frames around lenses
  const frameL = box(U * 2.8, U * 0.3, U * 0.3, frame)
  frameL.position.set(-U * 1.8, U * 1.5, U * 4.5)
  g.add(frameL)
  const frameR = box(U * 2.8, U * 0.3, U * 0.3, frame)
  frameR.position.set(U * 1.8, U * 1.5, U * 4.5)
  g.add(frameR)
  const frameLB = box(U * 2.8, U * 0.3, U * 0.3, frame)
  frameLB.position.set(-U * 1.8, -U * 0.5, U * 4.5)
  g.add(frameLB)
  const frameRB = box(U * 2.8, U * 0.3, U * 0.3, frame)
  frameRB.position.set(U * 1.8, -U * 0.5, U * 4.5)
  g.add(frameRB)
  // Temple arms (sides of head)
  const templeL = box(U * 0.3, U * 0.3, U * 4, frame)
  templeL.position.set(-U * 3.8, U * 0.8, U * 2)
  g.add(templeL)
  const templeR = box(U * 0.3, U * 0.3, U * 4, frame)
  templeR.position.set(U * 3.8, U * 0.8, U * 2)
  g.add(templeR)

  return g
}

function buildSunglasses(U: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_sunglasses'

  const frame = 0x222222
  // Left lens — dark opaque
  const lensL = box(U * 2.6, U * 2.2, U * 0.6, 0x333333)
  lensL.position.set(-U * 1.8, U * 0.5, U * 4.3)
  g.add(lensL)
  // Right lens
  const lensR = box(U * 2.6, U * 2.2, U * 0.6, 0x333333)
  lensR.position.set(U * 1.8, U * 0.5, U * 4.3)
  g.add(lensR)
  // Bridge
  const bridge = box(U * 1.2, U * 0.4, U * 0.4, frame)
  bridge.position.set(0, U * 0.8, U * 4.5)
  g.add(bridge)
  // Temple arms
  const templeL = box(U * 0.3, U * 0.3, U * 4, frame)
  templeL.position.set(-U * 3.8, U * 0.8, U * 2)
  g.add(templeL)
  const templeR = box(U * 0.3, U * 0.3, U * 4, frame)
  templeR.position.set(U * 3.8, U * 0.8, U * 2)
  g.add(templeR)

  return g
}

function buildHeadband(U: number, color: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_headband'

  // Band wrapping around head just above eyes
  const front = box(U * 8.4, U * 1.2, U * 0.6, color)
  front.position.set(0, U * 2.8, U * 4.2)
  g.add(front)
  const back = box(U * 8.4, U * 1.2, U * 0.6, color)
  back.position.set(0, U * 2.8, -U * 4.2)
  g.add(back)
  const sideL = box(U * 0.6, U * 1.2, U * 8.4, color)
  sideL.position.set(-U * 4.2, U * 2.8, 0)
  g.add(sideL)
  const sideR = box(U * 0.6, U * 1.2, U * 8.4, color)
  sideR.position.set(U * 4.2, U * 2.8, 0)
  g.add(sideR)

  return g
}

function buildCrown(U: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_crown'

  const gold = 0xffd700
  const darkGold = 0xdaa520
  // Horizontal band
  const band = box(U * 7, U * 1.6, U * 7, gold)
  band.position.set(0, U * 5.4, 0)
  g.add(band)
  // Three points
  const point1 = box(U * 1.4, U * 2.4, U * 1.4, gold)
  point1.position.set(-U * 2.4, U * 7.2, 0)
  g.add(point1)
  const point2 = box(U * 1.6, U * 3.0, U * 1.6, gold)
  point2.position.set(0, U * 7.6, 0)
  g.add(point2)
  const point3 = box(U * 1.4, U * 2.4, U * 1.4, gold)
  point3.position.set(U * 2.4, U * 7.2, 0)
  g.add(point3)
  // Gem on center point
  const gem = box(U * 0.8, U * 0.8, U * 0.8, 0xff0000)
  gem.position.set(0, U * 7.6, U * 0.9)
  g.add(gem)
  // Base detail
  const trim = box(U * 7.4, U * 0.4, U * 7.4, darkGold)
  trim.position.set(0, U * 4.6, 0)
  g.add(trim)

  return g
}

function buildBandana(U: number, color: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_bandana'

  // Triangle covering lower face
  const main = box(U * 6, U * 2.8, U * 0.5, color)
  main.position.set(0, -U * 1.8, U * 4.3)
  g.add(main)
  // Knot behind head
  const knot = box(U * 2, U * 1.4, U * 1, color)
  knot.position.set(0, -U * 0.8, -U * 4.3)
  g.add(knot)
  // Dangling tails
  const tail1 = box(U * 0.8, U * 2, U * 0.5, color)
  tail1.position.set(-U * 0.8, -U * 2.5, -U * 4.6)
  tail1.rotation.z = 0.2
  g.add(tail1)
  const tail2 = box(U * 0.8, U * 2, U * 0.5, color)
  tail2.position.set(U * 0.8, -U * 2.5, -U * 4.6)
  tail2.rotation.z = -0.2
  g.add(tail2)

  return g
}

// ── BACK ACCESSORIES (torso-local coords) ──────────────────────────

function buildBackpack(U: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_backpack'

  const green = 0x2e7d32
  const darkGreen = 0x1b5e20
  // Main box
  const body = box(U * 6, U * 7, U * 3, green)
  body.position.set(0, U * 18, -U * 4.5)
  g.add(body)
  // Flap
  const flap = box(U * 6.2, U * 2, U * 0.5, darkGreen)
  flap.position.set(0, U * 22, -U * 3.2)
  g.add(flap)
  // Straps (going over shoulders)
  const strapL = box(U * 1, U * 9, U * 0.5, darkGreen)
  strapL.position.set(-U * 2, U * 20, -U * 1)
  g.add(strapL)
  const strapR = box(U * 1, U * 9, U * 0.5, darkGreen)
  strapR.position.set(U * 2, U * 20, -U * 1)
  g.add(strapR)
  // Front strap connectors
  const strapFL = box(U * 1, U * 3, U * 0.4, darkGreen)
  strapFL.position.set(-U * 2, U * 22, U * 2.5)
  g.add(strapFL)
  const strapFR = box(U * 1, U * 3, U * 0.4, darkGreen)
  strapFR.position.set(U * 2, U * 22, U * 2.5)
  g.add(strapFR)
  // Pocket
  const pocket = box(U * 4, U * 2.5, U * 0.5, darkGreen)
  pocket.position.set(0, U * 16, -U * 6.2)
  g.add(pocket)

  return g
}

function buildWings(U: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_wings'

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
  wingL.position.set(0, U * 20, -U * 3.5)
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
  wingR.position.set(0, U * 20, -U * 3.5)
  g.add(wingR)

  return g
}

// ── HAND ACCESSORIES (arm-local coords, shoulder pivot at Y=0) ─────

function buildBook(U: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_book'
  g.userData.attachToArm = 'L'

  const brown = 0x6d4c21
  const pages = 0xfaf0dc
  // Book body
  const cover = box(U * 3.5, U * 4.5, U * 1.2, brown)
  cover.position.set(-U * 4, -U * 10, U * 1)
  g.add(cover)
  // Pages edge (lighter stripe on one side)
  const pageEdge = box(U * 0.4, U * 4, U * 1, pages)
  pageEdge.position.set(-U * 2.2, -U * 10, U * 1)
  g.add(pageEdge)
  // Spine detail
  const spine = box(U * 0.3, U * 4.5, U * 1.2, 0x4a3520)
  spine.position.set(-U * 5.8, -U * 10, U * 1)
  g.add(spine)

  return g
}

// ── BODY ACCESSORIES ────────────────────────────────────────────────

function buildScarf(U: number, color: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_scarf'

  // Wrap around neck
  const wrap = box(U * 9, U * 2, U * 5.5, color)
  wrap.position.set(0, U * 24.5, 0)
  g.add(wrap)
  // Hanging tail in front
  const tail = box(U * 2.5, U * 5, U * 0.8, color)
  tail.position.set(U * 1.5, U * 20, U * 3.5)
  tail.rotation.z = -0.15
  g.add(tail)
  // Tail end fringe
  const fringe1 = box(U * 0.6, U * 0.8, U * 0.6, color)
  fringe1.position.set(U * 0.8, U * 17.2, U * 3.5)
  g.add(fringe1)
  const fringe2 = box(U * 0.6, U * 0.8, U * 0.6, color)
  fringe2.position.set(U * 2.2, U * 17.2, U * 3.5)
  g.add(fringe2)

  return g
}

function buildParrot(U: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'accessory_parrot'

  // Body — sits on right shoulder (torso-local coords)
  const pX = U * 6.5  // On the right shoulder
  const pY = U * 24   // Above shoulder height
  const pZ = 0

  // Body (red)
  const body = box(U * 2, U * 2.5, U * 2, 0xcc2222)
  body.position.set(pX, pY, pZ)
  g.add(body)
  // Head (green)
  const head = box(U * 1.6, U * 1.6, U * 1.6, 0x22aa44)
  head.position.set(pX, pY + U * 2.2, pZ + U * 0.3)
  head.name = 'parrotHead'
  g.add(head)
  // Beak (yellow)
  const beak = box(U * 0.6, U * 0.5, U * 1, 0xffcc00)
  beak.position.set(pX, pY + U * 2, pZ + U * 1.5)
  g.add(beak)
  // Tail (blue)
  const tail = box(U * 1, U * 3, U * 0.8, 0x2266cc)
  tail.position.set(pX, pY - U * 2.8, pZ - U * 0.8)
  tail.rotation.x = 0.3
  g.add(tail)
  // Eye (tiny white dot)
  const eye = box(U * 0.4, U * 0.4, U * 0.3, 0xffffff)
  eye.position.set(pX + U * 0.5, pY + U * 2.5, pZ + U * 1)
  g.add(eye)

  return g
}

// ── Animation helpers ──────────────────────────────────────────────

/**
 * Animate accessories each frame. Call from the animation loop.
 * - Wings: subtle flutter (rotate Z ±3° on sine wave)
 * - Parrot: gentle head bob
 */
export function animateAccessories(scene: THREE.Scene, time: number): void {
  // Wing flutter
  const wingL = scene.getObjectByName('wingL')
  const wingR = scene.getObjectByName('wingR')
  if (wingL) wingL.rotation.z = Math.sin(time * 2.5) * 0.052  // ~3°
  if (wingR) wingR.rotation.z = -Math.sin(time * 2.5) * 0.052

  // Parrot head bob
  const parrotHead = scene.getObjectByName('parrotHead')
  if (parrotHead) {
    parrotHead.position.y = parrotHead.userData.baseY ??
      (parrotHead.userData.baseY = parrotHead.position.y)
    parrotHead.position.y = (parrotHead.userData.baseY as number) + Math.sin(time * 3) * 0.02
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
): THREE.Group {
  const scale = ageGroup === 'younger' ? 0.88 : 1.0
  const U = 0.125 * scale
  const color = options?.color ?? 0x4488cc

  let group: THREE.Group

  switch (type) {
    case 'glasses':    group = buildGlasses(U); break
    case 'sunglasses': group = buildSunglasses(U); break
    case 'headband':   group = buildHeadband(U, color); break
    case 'crown':      group = buildCrown(U); break
    case 'bandana':    group = buildBandana(U, color); break
    case 'backpack':   group = buildBackpack(U); break
    case 'wings':      group = buildWings(U); break
    case 'book':       group = buildBook(U); break
    case 'scarf':      group = buildScarf(U, color); break
    case 'parrot':     group = buildParrot(U); break
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
