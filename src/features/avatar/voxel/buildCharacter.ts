import * as THREE from 'three'
import type { CharacterFeatures } from '../../../core/types'
import { buildHair } from './buildHair'

// ── Helpers ─────────────────────────────────────────────────────────

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  name?: string,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const mesh = new THREE.Mesh(geo, material)
  if (name) mesh.name = name
  return mesh
}

// ── Body templates ──────────────────────────────────────────────────

interface BodyTemplate {
  head: { w: number; h: number; d: number }
  torso: { w: number; h: number; d: number }
  arm: { w: number; h: number; d: number }
  leg: { w: number; h: number; d: number }
  foot: { w: number; h: number; d: number }
}

const OLDER_BODY: BodyTemplate = {
  head: { w: 1.0, h: 1.0, d: 1.0 },
  torso: { w: 1.0, h: 1.2, d: 0.6 },
  arm: { w: 0.4, h: 1.1, d: 0.5 },
  leg: { w: 0.45, h: 1.1, d: 0.55 },
  foot: { w: 0.45, h: 0.25, d: 0.65 },
}

const YOUNGER_BODY: BodyTemplate = {
  head: { w: 1.0, h: 1.0, d: 1.0 },
  torso: { w: 0.85, h: 1.0, d: 0.55 },
  arm: { w: 0.35, h: 0.9, d: 0.45 },
  leg: { w: 0.4, h: 0.85, d: 0.5 },
  foot: { w: 0.4, h: 0.22, d: 0.6 },
}

// ── Build character ─────────────────────────────────────────────────

export function buildCharacter(
  features: CharacterFeatures,
  ageGroup: 'older' | 'younger',
): THREE.Group {
  const character = new THREE.Group()
  character.name = 'character'

  const tmpl = ageGroup === 'older' ? OLDER_BODY : YOUNGER_BODY

  // Materials
  const skinMat = new THREE.MeshLambertMaterial({ color: features.skinTone })
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const shortsMat = new THREE.MeshLambertMaterial({ color: 0x607080 })
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x333333 })
  const eyeMat = new THREE.MeshLambertMaterial({
    color: features.eyeColor ?? '#2c1810',
  })
  const mouthMat = new THREE.MeshLambertMaterial({ color: 0x2c1810 })

  // Calculate Y positions (bottom-up)
  const footY = tmpl.foot.h / 2
  const legY = tmpl.foot.h + tmpl.leg.h / 2
  const torsoY = tmpl.foot.h + tmpl.leg.h + tmpl.torso.h / 2
  const headY = tmpl.foot.h + tmpl.leg.h + tmpl.torso.h + tmpl.head.h / 2
  const armY = tmpl.foot.h + tmpl.leg.h + tmpl.torso.h - tmpl.arm.h / 2

  // Head
  const head = box(tmpl.head.w, tmpl.head.h, tmpl.head.d, skinMat, 'head')
  head.position.y = headY
  character.add(head)

  // Eyes
  const eyeL = box(0.15, 0.1, 0.05, eyeMat, 'eyeL')
  eyeL.position.set(-0.2, headY + 0.05, tmpl.head.d / 2 + 0.01)
  character.add(eyeL)
  const eyeR = box(0.15, 0.1, 0.05, eyeMat, 'eyeR')
  eyeR.position.set(0.2, headY + 0.05, tmpl.head.d / 2 + 0.01)
  character.add(eyeR)

  // Mouth
  const mouth = box(0.25, 0.06, 0.05, mouthMat, 'mouth')
  mouth.position.set(0, headY - 0.2, tmpl.head.d / 2 + 0.01)
  character.add(mouth)

  // Torso (shirt)
  const torso = box(tmpl.torso.w, tmpl.torso.h, tmpl.torso.d, shirtMat, 'torso')
  torso.position.y = torsoY
  character.add(torso)

  // Arms
  const armL = box(tmpl.arm.w, tmpl.arm.h, tmpl.arm.d, skinMat, 'armL')
  armL.position.set(-(tmpl.torso.w / 2 + tmpl.arm.w / 2), armY, 0)
  character.add(armL)

  const armR = box(tmpl.arm.w, tmpl.arm.h, tmpl.arm.d, skinMat, 'armR')
  armR.position.set(tmpl.torso.w / 2 + tmpl.arm.w / 2, armY, 0)
  character.add(armR)

  // Legs (shorts)
  const legL = box(tmpl.leg.w, tmpl.leg.h, tmpl.leg.d, shortsMat, 'legL')
  legL.position.set(-tmpl.leg.w / 2 - 0.02, legY, 0)
  character.add(legL)

  const legR = box(tmpl.leg.w, tmpl.leg.h, tmpl.leg.d, shortsMat, 'legR')
  legR.position.set(tmpl.leg.w / 2 + 0.02, legY, 0)
  character.add(legR)

  // Feet (shoes)
  const footL = box(tmpl.foot.w, tmpl.foot.h, tmpl.foot.d, shoeMat, 'footL')
  footL.position.set(-tmpl.leg.w / 2 - 0.02, footY, 0.05)
  character.add(footL)

  const footR = box(tmpl.foot.w, tmpl.foot.h, tmpl.foot.d, shoeMat, 'footR')
  footR.position.set(tmpl.leg.w / 2 + 0.02, footY, 0.05)
  character.add(footR)

  // Hair
  const hairMat = new THREE.MeshLambertMaterial({ color: features.hairColor })
  const hairGroup = buildHair(features.hairStyle, features.hairLength, hairMat, headY)
  character.add(hairGroup)

  // Center the character so it sits on y=0
  // (feet bottom at y=0)

  return character
}

/** Apply new features to an existing character group (re-color skin, hair, etc.) */
export function applyFeatures(
  character: THREE.Group,
  features: CharacterFeatures,
): void {
  const skinMat = new THREE.MeshLambertMaterial({ color: features.skinTone })

  const skinParts = ['head', 'armL', 'armR']
  for (const name of skinParts) {
    const mesh = character.getObjectByName(name) as THREE.Mesh | undefined
    if (mesh) {
      mesh.material = skinMat
    }
  }

  // Remove old hair, add new
  const oldHair = character.getObjectByName('hairGroup')
  if (oldHair) character.remove(oldHair)

  const head = character.getObjectByName('head') as THREE.Mesh | undefined
  if (head) {
    const hairMat = new THREE.MeshLambertMaterial({ color: features.hairColor })
    const hairGroup = buildHair(features.hairStyle, features.hairLength, hairMat, head.position.y)
    character.add(hairGroup)
  }

  // Update eye color
  if (features.eyeColor) {
    const eyeMat = new THREE.MeshLambertMaterial({ color: features.eyeColor })
    for (const name of ['eyeL', 'eyeR']) {
      const mesh = character.getObjectByName(name) as THREE.Mesh | undefined
      if (mesh) mesh.material = eyeMat
    }
  }
}
