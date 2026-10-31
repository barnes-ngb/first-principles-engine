import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildArmorPiece } from './buildArmorPiece'
import { buildCharacter, CHARACTER_PROPORTIONS } from './buildCharacter'
import { buildHelmetCrest, HELMET_CREST_OPTIONS } from './buildHelmetCrest'
import { DEFAULT_CHARACTER_FEATURES } from '../../../core/types'
import type { VoxelArmorPieceId } from '../../../core/types'

// ── Diamond tier armor geometry ─────────────────────────────────────
//
// These tests pin the Diamond set's CONTRACT, not its art: dispatch,
// distinctness from the earlier tiers, the complexity ceiling, the
// material-role / attachment metadata the renderer reads, and the
// Gold/Netherite/unknown fallback to Iron.
//
// Everything asserted here is canonical — mesh names, counts, roles,
// transforms and bounding-box ratios. Colors are deliberately NOT
// asserted: `taggedBox` and `applyTierToArmor` both jitter per-face
// brightness with Math.random(), so any color comparison would flake.

const PIECES: VoxelArmorPieceId[] = [
  'helmet', 'breastplate', 'belt', 'shoes', 'shield', 'sword',
]

/** Pieces whose geometry derives from the SCALED body layout. */
const BODY_SCALED_PIECES: VoxelArmorPieceId[] = [
  'breastplate', 'belt', 'shoes', 'shield', 'sword',
]

const MATERIAL_ROLES = ['primary', 'secondary', 'accent', 'detail']

/**
 * Complexity ceiling for a single Diamond piece. The brief asks for a
 * new silhouette that stays bounded — if a later pass needs more blocks
 * than this, that is a design decision and this number moves with it.
 */
const MAX_MESHES_PER_PIECE = 40

/** `getBodyLayout`'s younger/older scale (buildCharacter.ts). */
const YOUNGER_SCALE = 0.85

function build(
  piece: VoxelArmorPieceId,
  tier?: string,
  ageGroup: 'older' | 'younger' = 'older',
): THREE.Group {
  return tier === undefined
    ? buildArmorPiece(piece, ageGroup)
    : buildArmorPiece(piece, ageGroup, undefined, tier)
}

function meshesOf(group: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })
  return meshes
}

function meshNames(group: THREE.Object3D): string[] {
  return meshesOf(group).map((m) => m.name).sort()
}

function lightsOf(group: THREE.Object3D): THREE.Light[] {
  const lights: THREE.Light[] = []
  group.traverse((child) => {
    if (child instanceof THREE.Light) lights.push(child)
  })
  return lights
}

function boxSize(group: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3())
}

function armAttachments(group: THREE.Group, side: 'L' | 'R'): THREE.Object3D[] {
  return group.children.filter((c) => c.userData.attachToArm === side)
}

// ── Dispatch ────────────────────────────────────────────────────────

describe('DIAMOND dispatch', () => {
  it('builds dedicated Diamond geometry for all six pieces', () => {
    for (const piece of PIECES) {
      const names = meshNames(build(piece, 'DIAMOND'))
      expect(names.length).toBeGreaterThan(0)
      for (const name of names) {
        expect(name, `${piece}: ${name}`).toMatch(/^diamond_/)
      }
    }
  })

  it('is case-insensitive on the tier string', () => {
    for (const piece of PIECES) {
      const canonical = meshNames(build(piece, 'DIAMOND'))
      expect(meshNames(build(piece, 'diamond'))).toEqual(canonical)
      expect(meshNames(build(piece, 'Diamond'))).toEqual(canonical)
    }
  })

  it('names every piece after its piece id and leaves it hidden until equipped', () => {
    for (const piece of PIECES) {
      const group = build(piece, 'DIAMOND')
      expect(group.name).toBe(piece)
      expect(group.visible).toBe(false)
    }
  })
})

// ── Distinct from the earlier tiers ─────────────────────────────────

describe('DIAMOND geometry is distinct', () => {
  it('shares no mesh with Wood, Stone or Iron on any piece', () => {
    for (const piece of PIECES) {
      const diamond = new Set(meshNames(build(piece, 'DIAMOND')))
      for (const earlier of ['WOOD', 'STONE', 'IRON']) {
        const other = meshNames(build(piece, earlier))
        const shared = other.filter((name) => diamond.has(name))
        expect(shared, `${piece} vs ${earlier}`).toEqual([])
      }
    }
  })

  it('differs from Iron on every piece', () => {
    for (const piece of PIECES) {
      expect(meshNames(build(piece, 'DIAMOND')))
        .not.toEqual(meshNames(build(piece, 'IRON')))
    }
  })

  it('keeps Wood, Stone and Iron mutually distinct (existing behaviour)', () => {
    for (const piece of PIECES) {
      const wood = meshNames(build(piece, 'WOOD'))
      const stone = meshNames(build(piece, 'STONE'))
      const iron = meshNames(build(piece, 'IRON'))
      expect(wood).not.toEqual(stone)
      expect(stone).not.toEqual(iron)
      expect(wood).not.toEqual(iron)
    }
  })
})

// ── Bounded complexity + clean tagging ──────────────────────────────

describe('DIAMOND geometry is complete and bounded', () => {
  it('gives every piece real mass without exceeding the complexity ceiling', () => {
    for (const piece of PIECES) {
      const count = meshesOf(build(piece, 'DIAMOND')).length
      expect(count, piece).toBeGreaterThanOrEqual(6)
      expect(count, piece).toBeLessThanOrEqual(MAX_MESHES_PER_PIECE)
    }
  })

  it('tags every mesh with a material role the tier palette understands', () => {
    for (const piece of PIECES) {
      for (const mesh of meshesOf(build(piece, 'DIAMOND'))) {
        expect(MATERIAL_ROLES, `${piece}: ${mesh.name}`)
          .toContain(mesh.userData.materialRole)
      }
    }
  })

  it('uses a unique, non-empty name for every mesh', () => {
    for (const piece of PIECES) {
      const names = meshNames(build(piece, 'DIAMOND'))
      for (const name of names) expect(name, piece).not.toBe('')
      expect(new Set(names).size, piece).toBe(names.length)
    }
  })

  it('adds no lights — unlike the Iron sword, which keeps its glow', () => {
    for (const piece of PIECES) {
      expect(lightsOf(build(piece, 'DIAMOND')), piece).toEqual([])
    }
    // Positive control: the Iron sword's point light + glow blade are
    // untouched by this change.
    const ironSword = build('sword', 'IRON')
    expect(lightsOf(ironSword).length).toBeGreaterThan(0)
    expect(
      meshesOf(ironSword).some((m) => m.userData.materialRole === 'sword_blade'),
    ).toBe(true)
    // The Diamond blade is plain tier-palette steel, so the blade-pulse
    // loop simply finds nothing to pulse.
    expect(
      meshesOf(build('sword', 'DIAMOND')).some(
        (m) => m.userData.materialRole === 'sword_blade',
      ),
    ).toBe(false)
  })
})

// ── Both age-group proportions ──────────────────────────────────────

describe('DIAMOND geometry respects both proportions', () => {
  it('builds the same mesh set for younger and older characters', () => {
    for (const piece of PIECES) {
      expect(meshNames(build(piece, 'DIAMOND', 'younger')), piece)
        .toEqual(meshNames(build(piece, 'DIAMOND', 'older')))
    }
  })

  it('scales body-worn pieces by exactly the younger scale', () => {
    for (const piece of BODY_SCALED_PIECES) {
      const older = boxSize(build(piece, 'DIAMOND', 'older'))
      const younger = boxSize(build(piece, 'DIAMOND', 'younger'))
      expect(younger.x / older.x, `${piece}.x`).toBeCloseTo(YOUNGER_SCALE, 5)
      expect(younger.y / older.y, `${piece}.y`).toBeCloseTo(YOUNGER_SCALE, 5)
      expect(younger.z / older.z, `${piece}.z`).toBeCloseTo(YOUNGER_SCALE, 5)
    }
  })

  it('keeps the helmet head-sized for both age groups (head is never scaled)', () => {
    const older = boxSize(build('helmet', 'DIAMOND', 'older'))
    const younger = boxSize(build('helmet', 'DIAMOND', 'younger'))
    expect(younger.x).toBeCloseTo(older.x, 6)
    expect(younger.y).toBeCloseTo(older.y, 6)
    expect(younger.z).toBeCloseTo(older.z, 6)
  })

  it('stays inside the established footprint, so nothing reads as huge', () => {
    // A new set, not a bigger one: on every axis each Diamond piece stays
    // within 20% of the LARGEST earlier tier for that piece (Stone's tower
    // shield, Iron's war helm, …). This is a RUNAWAY GUARD, not a visual
    // proof of fit — Sol's render owns fit acceptance.
    //
    // History, kept deliberately: this started as Iron × 1.15 and the
    // root's first focused run failed it on `shield.y`, because Iron has
    // the SHORTEST shield of the three earlier tiers while Stone's tower
    // shield is the tall one. Widening the comparison to the widest earlier
    // tier is the honest form of the check, but the receipt stands — a
    // bound an author can move is not evidence about a silhouette.
    for (const piece of PIECES) {
      const diamond = boxSize(build(piece, 'DIAMOND'))
      const earlier = ['WOOD', 'STONE', 'IRON'].map((t) => boxSize(build(piece, t)))
      for (const axis of ['x', 'y', 'z'] as const) {
        const widest = Math.max(...earlier.map((size) => size[axis]))
        expect(diamond[axis], `${piece}.${axis}`).toBeLessThanOrEqual(widest * 1.2)
      }
    }
  })
})

// ── Attachment metadata + equip pivots ──────────────────────────────

describe('DIAMOND attachment metadata matches the other tiers', () => {
  it('hangs the shield off the left arm on the shared pose transform', () => {
    const diamond = build('shield', 'DIAMOND')
    const iron = build('shield', 'IRON')

    expect(diamond.userData.attachToArm).toBe('L')
    expect(diamond.position.toArray()).toEqual(iron.position.toArray())
    expect(diamond.rotation.toArray()).toEqual(iron.rotation.toArray())

    const visual = diamond.getObjectByName('shield_visual')
    const ironVisual = iron.getObjectByName('shield_visual')
    expect(visual).toBeDefined()
    expect(visual!.position.toArray()).toEqual(ironVisual!.position.toArray())
    expect(visual!.rotation.toArray()).toEqual(ironVisual!.rotation.toArray())
  })

  it('exposes a finite emblem anchor on the shield', () => {
    const shield = build('shield', 'DIAMOND')
    for (const key of ['emblemX', 'emblemY', 'emblemZ'] as const) {
      const value = shield.userData[key]
      expect(typeof value, key).toBe('number')
      expect(Number.isFinite(value), key).toBe(true)
    }
  })

  it('hangs the sword off the right arm on the shared grip transform', () => {
    const diamond = build('sword', 'DIAMOND')
    const iron = build('sword', 'IRON')

    expect(diamond.userData.attachToArm).toBe('R')
    expect(diamond.position.toArray()).toEqual(iron.position.toArray())
    expect(diamond.rotation.toArray()).toEqual(iron.rotation.toArray())
  })

  it('puts symmetric breastplate arm pieces where the renderer detaches them', () => {
    const breastplate = build('breastplate', 'DIAMOND')
    const left = armAttachments(breastplate, 'L')
    const right = armAttachments(breastplate, 'R')

    expect(left.length).toBeGreaterThan(0)
    expect(right.length).toBe(left.length)
    // The renderer calls pieceGroup.remove(child) on each tagged node, so
    // every one has to be a DIRECT child of the piece group.
    const tagged = meshesOf(breastplate).filter((m) => m.userData.attachToArm)
    expect(tagged.length).toBe(left.length + right.length)
    expect(breastplate.userData.attachToArm).toBeUndefined()
  })

  it('leaves helmet, belt and shoes unattached to any arm', () => {
    for (const piece of ['helmet', 'belt', 'shoes'] as VoxelArmorPieceId[]) {
      const group = build(piece, 'DIAMOND')
      expect(group.userData.attachToArm, piece).toBeUndefined()
      group.traverse((child) => {
        expect(child.userData.attachToArm, `${piece}: ${child.name}`).toBeUndefined()
      })
    }
  })
})

// ── Kite orientation (round-1 render repair) ────────────────────────

describe('DIAMOND shield orientation', () => {
  const boxDepth = (mesh: THREE.Mesh) =>
    (mesh.geometry as THREE.BoxGeometry).parameters.depth

  it('puts the broad top one way and the point the other, monotonically', () => {
    const shield = build('shield', 'DIAMOND')
    const visual = shield.getObjectByName('shield_visual')
    expect(visual).toBeDefined()
    const part = (name: string) => {
      const found = visual!.getObjectByName(name)
      expect(found, name).toBeDefined()
      return found as THREE.Mesh
    }

    const rows = [0, 1, 2, 3, 4].map((i) => part(`diamond_shield_row_${i}`))
    const tip = part('diamond_shield_tip')
    const cap = part('diamond_shield_cap')

    // The render rejected the first candidate for being upside down, so the
    // sense of the kite is pinned, not just its shape: the broad top edge is
    // +Y in shield-local space and the point is -Y.
    expect(rows[0].position.y).toBeGreaterThan(0)
    expect(cap.position.y).toBeGreaterThan(rows[0].position.y)
    expect(tip.position.y).toBeLessThan(0)
    expect(tip.position.y).toBeLessThan(rows[4].position.y)

    // …and the taper runs the same way: each row sits below the one before
    // it and is no wider.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].position.y, `row ${i} y`).toBeLessThan(rows[i - 1].position.y)
      expect(boxDepth(rows[i]), `row ${i} width`)
        .toBeLessThanOrEqual(boxDepth(rows[i - 1]))
    }
    expect(boxDepth(tip)).toBeLessThan(boxDepth(rows[4]))
  })

  it('keeps the emblem on the boss at the kite\'s middle, not at an end', () => {
    const shield = build('shield', 'DIAMOND')
    const boss = shield.getObjectByName('diamond_shield_boss') as THREE.Mesh
    expect(boss).toBeDefined()
    expect(boss.position.y).toBeCloseTo(0, 6)

    // The arch reads above the boss and the banner below it, both ways up.
    const lintel = shield.getObjectByName('diamond_shield_arch_lintel') as THREE.Mesh
    const banner = shield.getObjectByName('diamond_shield_banner') as THREE.Mesh
    expect(lintel.position.y).toBeGreaterThan(boss.position.y)
    expect(banner.position.y).toBeLessThan(boss.position.y)
  })
})

// ── Pupil visibility (round-1 render repair) ────────────────────────
//
// Sol's render caught the first candidate's visor covering the pupil
// centres. These tests are the regression for it: they build the ACTUAL
// character head, parent the helmet to `headGroup` exactly as
// `VoxelCharacter` does, and raycast from in front of the face.

const PUPILS = ['pupilL', 'pupilR'] as const

function headRig(tier: string, ageGroup: 'older' | 'younger') {
  const character = buildCharacter(DEFAULT_CHARACTER_FEATURES, ageGroup)
  const headGroup = character.getObjectByName('headGroup') as THREE.Group
  const helmet = buildArmorPiece('helmet', ageGroup, undefined, tier)
  helmet.visible = true // equipped; buildArmorPiece hides until equipped
  headGroup.add(helmet)
  character.updateMatrixWorld(true)
  return { character, headGroup, helmet }
}

/** Name of the first MESH a front-on ray hits at `point`, or '' for none. */
function frontHitAt(character: THREE.Object3D, point: THREE.Vector3): string {
  const origin = new THREE.Vector3(point.x, point.y, point.z + 20)
  const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1))
  const hit = raycaster
    .intersectObject(character, true)
    .find((i) => i.object instanceof THREE.Mesh)
  return hit ? hit.object.name : ''
}

/** Pupil centre and the point a third of the way down it, in world space. */
function pupilSamples(headGroup: THREE.Group, name: string) {
  const pupil = headGroup.getObjectByName(name) as THREE.Mesh
  const height = (pupil.geometry as THREE.BoxGeometry).parameters.height
  const centre = pupil.getWorldPosition(new THREE.Vector3())
  return {
    centre,
    lower: centre.clone().setY(centre.y - height * 0.3),
  }
}

describe('DIAMOND helmet leaves the eyes visible', () => {
  for (const ageGroup of ['older', 'younger'] as const) {
    it(`shows both pupil centres from the front (${ageGroup})`, () => {
      const { character, headGroup } = headRig('DIAMOND', ageGroup)
      for (const name of PUPILS) {
        const { centre, lower } = pupilSamples(headGroup, name)
        expect(frontHitAt(character, centre), `${name} centre`).toBe(name)
        expect(frontHitAt(character, lower), `${name} lower`).toBe(name)
      }
    })
  }

  it('is at or above the Iron/Gold bar (same rig, Iron helm)', () => {
    // Positive control for the rig itself: the baseline the render compared
    // Diamond against passes these very assertions.
    const { character, headGroup } = headRig('IRON', 'older')
    for (const name of PUPILS) {
      const { centre, lower } = pupilSamples(headGroup, name)
      expect(frontHitAt(character, centre), `${name} centre`).toBe(name)
      expect(frontHitAt(character, lower), `${name} lower`).toBe(name)
    }
  })

  it('positive control: a visor dropped to brow level DOES block the pupil', () => {
    // Plants the failure the render found. Without this, the two tests above
    // would pass for a helmet with no visor at all.
    const { character, headGroup, helmet } = headRig('DIAMOND', 'older')
    const visor = helmet.getObjectByName('diamond_helm_visor') as THREE.Mesh
    expect(visor).toBeDefined()
    visor.position.y = CHARACTER_PROPORTIONS.headSize * 0.1
    character.updateMatrixWorld(true)
    for (const name of PUPILS) {
      const { centre } = pupilSamples(headGroup, name)
      expect(frontHitAt(character, centre), `${name} centre`).toBe('diamond_helm_visor')
    }
  })

  it('keeps the brow jewel narrower than the gap between the pupils', () => {
    const helmet = build('helmet', 'DIAMOND')
    const jewel = helmet.getObjectByName('diamond_helm_brow_facet') as THREE.Mesh
    expect(jewel).toBeDefined()
    const jewelHalfWidth = new THREE.Box3()
      .setFromObject(jewel)
      .getSize(new THREE.Vector3()).x / 2

    const { headGroup } = headRig('DIAMOND', 'older')
    for (const name of PUPILS) {
      const pupil = headGroup.getObjectByName(name) as THREE.Mesh
      expect(Math.abs(pupil.position.x), name).toBeGreaterThan(jewelHalfWidth)
    }
  })
})

// ── Crest anchor (round-1 render repair) ────────────────────────────

describe('DIAMOND crest anchor', () => {
  const U = 0.125
  const CREST_TYPES = HELMET_CREST_OPTIONS.map((o) => o.id)
  const anchorOf = (tier: string) =>
    build('helmet', tier).userData.crestBaseY as number | undefined

  const boxOf = (group: THREE.Object3D) => new THREE.Box3().setFromObject(group)

  it('publishes a crest base at the crown top — and only Diamond does', () => {
    const anchor = anchorOf('DIAMOND')
    expect(typeof anchor).toBe('number')
    // The top face of the third crown terrace.
    expect(anchor).toBeCloseTo(CHARACTER_PROPORTIONS.headSize * 0.88, 6)

    for (const tier of ['WOOD', 'STONE', 'IRON', 'GOLD', 'NETHERITE', 'MYTHRIL', '']) {
      expect(anchorOf(tier), tier || 'empty').toBeUndefined()
    }
  })

  it('lifts every crest option clear of the stepped crown', () => {
    const anchor = anchorOf('DIAMOND') as number
    for (const type of CREST_TYPES) {
      const crest = buildHelmetCrest(type, U, 0xffffff, undefined, anchor)
      if (type === 'none') {
        // The model must not draw a crest for 'none'.
        expect(crest).toBeNull()
        continue
      }
      expect(crest, type).not.toBeNull()
      const box = boxOf(crest!)
      expect(box.max.y, `${type} top`).toBeGreaterThan(anchor)
      expect(box.min.y, `${type} base`).toBeGreaterThan(anchor - U * 3)
    }
  })

  it('leaves the legacy crest placement byte-identical without an anchor', () => {
    const anchor = anchorOf('DIAMOND') as number
    for (const type of CREST_TYPES) {
      if (type === 'none') continue
      const legacy = buildHelmetCrest(type, U, 0xffffff)
      const explicitUndefined = buildHelmetCrest(type, U, 0xffffff, undefined, undefined)
      expect(boxOf(explicitUndefined!).min.toArray())
        .toEqual(boxOf(legacy!).min.toArray())
      expect(boxOf(explicitUndefined!).max.toArray())
        .toEqual(boxOf(legacy!).max.toArray())
      // …and the legacy base is the thing that needed lifting: untouched, the
      // whole crest sits below Diamond's crown top.
      expect(boxOf(legacy!).max.y, type).toBeLessThan(anchor)
    }
  })

  it('is consumed once, in the one place the crest is built', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(resolve(here, '..', 'VoxelCharacter.tsx'), 'utf8')
    const calls = source.match(/buildHelmetCrest\(/g) ?? []
    expect(calls.length).toBe(1)
    expect(source).toMatch(/helmetGroup\.userData\.crestBaseY/)
    expect(source).toMatch(
      /buildHelmetCrest\(\s*crestType,\s*U,\s*crestColor,\s*undefined,\s*crestBaseY\s*\)/,
    )
  })
})

// ── Fallback stability ──────────────────────────────────────────────

describe('earlier-tier and unknown-tier fallback is unchanged', () => {
  it('still falls through to Iron for Gold, Netherite, unknown and missing tiers', () => {
    for (const piece of PIECES) {
      const iron = meshNames(build(piece, 'IRON'))
      for (const tier of ['GOLD', 'NETHERITE', 'MYTHRIL', '']) {
        expect(meshNames(build(piece, tier)), `${piece} @ "${tier}"`).toEqual(iron)
      }
      // No tier argument at all → the IRON default.
      expect(meshNames(build(piece)), `${piece} @ default`).toEqual(iron)
    }
  })

  it('keeps Wood and Stone geometry addressable by their own tier names', () => {
    for (const piece of PIECES) {
      const wood = meshNames(build(piece, 'wood'))
      const stone = meshNames(build(piece, 'stone'))
      expect(wood).toEqual(meshNames(build(piece, 'WOOD')))
      expect(stone).toEqual(meshNames(build(piece, 'STONE')))
    }
  })
})
