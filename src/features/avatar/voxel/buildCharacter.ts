import * as THREE from 'three'
import type { CharacterFeatures } from '../../../core/types'
import { buildHair } from './buildHair'

// ── Helpers ─────────────────────────────────────────────────────────

/** Create a box with per-face color variation for a Minecraft texture feel */
function texturedBox(
  w: number,
  h: number,
  d: number,
  baseColor: THREE.Color | number,
  name?: string,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const color = baseColor instanceof THREE.Color ? baseColor : new THREE.Color(baseColor)

  // Create material with slight variations per face
  const materials: THREE.MeshLambertMaterial[] = []
  for (let i = 0; i < 6; i++) {
    const variation = 0.95 + Math.random() * 0.1 // 95% to 105% brightness
    const faceColor = color.clone().multiplyScalar(variation)
    materials.push(new THREE.MeshLambertMaterial({ color: faceColor }))
  }

  const mesh = new THREE.Mesh(geo, materials)
  if (name) mesh.name = name
  return mesh
}

/** Flat-colored box for small detail pieces (eyes, mouth, etc.) */
function box(
  w: number,
  h: number,
  d: number,
  color: THREE.Color | number,
  name?: string,
): THREE.Mesh {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color)
  const geo = new THREE.BoxGeometry(w, h, d)
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: c }))
  if (name) mesh.name = name
  return mesh
}

/** Create an array of 6 slightly-varied materials for per-face texturing */
function createTexturedMaterials(baseColor: THREE.Color | number): THREE.MeshLambertMaterial[] {
  const color = baseColor instanceof THREE.Color ? baseColor : new THREE.Color(baseColor)
  const materials: THREE.MeshLambertMaterial[] = []
  for (let i = 0; i < 6; i++) {
    const variation = 0.95 + Math.random() * 0.1
    materials.push(new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(variation) }))
  }
  return materials
}

// ── Build character (Minecraft Steve proportions) ───────────────────
//
// Steve proportions:
//   Head:  8×8×8 px  → 1×1×1 units
//   Body:  8×12×4 px → 1×1.5×0.5 units
//   Arms:  4×12×4 px → 0.5×1.5×0.5 units
//   Legs:  4×12×4 px → 0.5×1.5×0.5 units
//   Total height = 1 + 1.5 + 1.5 = 4 units
//
// 1 pixel = U = 0.125 units at scale 1.0

export function buildCharacter(
  features: CharacterFeatures,
  ageGroup: 'older' | 'younger',
): THREE.Group {
  const character = new THREE.Group()
  character.name = 'character'

  const scale = ageGroup === 'younger' ? 0.88 : 1.0
  const U = 0.125 * scale // 1 Minecraft pixel

  // Colors from features (with fallbacks) — skin & hair from photo, clothes are fixed defaults
  const skinColor = new THREE.Color(features.skinTone ?? '#F5D6B8')
  const hairColor = new THREE.Color(features.hairColor ?? '#6B4C32')
  const shirtColor = new THREE.Color('#B0B0B0') // Light heather gray (Lincoln's Minecraft tee)
  const pantsColor = new THREE.Color('#2A3A52') // Dark navy blue (his actual shorts)
  const shoeColor = new THREE.Color('#3D3D3D')

  // --- HEAD (8×8×8 = 1×1×1) ---
  const head = texturedBox(U * 8, U * 8, U * 8, skinColor, 'head')
  head.position.y = U * 28 // Top of body + half head
  character.add(head)

  // Face details (on the front of the head)
  // Eyes — white sclera with dark pupils
  const eyeWhiteL = box(U * 2, U * 1, U * 0.5, 0xffffff, 'eyeWhiteL')
  eyeWhiteL.position.set(-U * 1.5, U * 28.5, U * 4.1)
  character.add(eyeWhiteL)
  const eyeColor = features.eyeColor ? new THREE.Color(features.eyeColor) : new THREE.Color(0x4a6b7a)
  const pupilL = box(U * 1, U * 1, U * 0.3, eyeColor, 'pupilL')
  pupilL.position.set(-U * 1.2, U * 28.5, U * 4.3) // Slightly offset for personality
  character.add(pupilL)

  const eyeWhiteR = box(U * 2, U * 1, U * 0.5, 0xffffff, 'eyeWhiteR')
  eyeWhiteR.position.set(U * 1.5, U * 28.5, U * 4.1)
  character.add(eyeWhiteR)
  const pupilR = box(U * 1, U * 1, U * 0.3, eyeColor, 'pupilR')
  pupilR.position.set(U * 1.8, U * 28.5, U * 4.3) // Slightly offset for personality
  character.add(pupilR)

  // Eyebrows — gives expression
  const eyebrowColor = 0x5A3E28
  const eyebrowL = box(U * 1.8, U * 0.4, U * 0.3, eyebrowColor, 'eyebrowL')
  eyebrowL.position.set(-U * 1.5, U * 29.4, U * 4.15)
  character.add(eyebrowL)
  const eyebrowR = box(U * 1.8, U * 0.4, U * 0.3, eyebrowColor, 'eyebrowR')
  eyebrowR.position.set(U * 1.5, U * 29.4, U * 4.15)
  character.add(eyebrowR)

  // Nose — tiny bump
  const nose = box(U * 0.8, U * 0.8, U * 0.3, 0xe8c8a8, 'nose')
  nose.position.set(0, U * 27.5, U * 4.15)
  character.add(nose)

  // Mouth — subtle, slightly darker skin tone (not black)
  const mouth = box(U * 2, U * 0.5, U * 0.3, 0xD4A088, 'mouth')
  mouth.position.set(0, U * 26.2, U * 4.2)
  character.add(mouth)

  // Hair — built from the hair module
  const hairMat = new THREE.MeshLambertMaterial({ color: hairColor })
  const hairGroup = buildHair(features.hairStyle, features.hairLength, hairMat, U * 28, U)
  character.add(hairGroup)

  // --- BODY (8×12×4 = 1×1.5×0.5) ---
  const torso = texturedBox(U * 8, U * 12, U * 4, shirtColor, 'torso')
  torso.position.y = U * 18 // Center of body
  character.add(torso)

  // Creeper face on gray shirt — darker green to contrast against gray
  const creeperGreen = 0x3D8C35
  const cEyeL = box(U * 1.2, U * 1.2, U * 0.3, creeperGreen, 'creeperEyeL')
  cEyeL.position.set(-U * 1.5, U * 20, U * 2.15)
  character.add(cEyeL)
  const cEyeR = box(U * 1.2, U * 1.2, U * 0.3, creeperGreen, 'creeperEyeR')
  cEyeR.position.set(U * 1.5, U * 20, U * 2.15)
  character.add(cEyeR)
  const cMouth = box(U * 2, U * 1, U * 0.3, creeperGreen, 'creeperMouth')
  cMouth.position.set(0, U * 17.5, U * 2.15)
  character.add(cMouth)

  // --- ARMS (4×12×4 each) ---
  // Geometry is shifted so pivot point is at the SHOULDER (top of arm),
  // enabling natural rotation from the shoulder joint.
  // Arms positioned far enough out to prevent clipping during pose rotations.
  // Arm inner edge at ±(7.2-2) = ±5.2U, torso edge at ±4U → 1.2U gap.
  const armGap = U * 1.2 // Gap between arm and torso edge (was 0.6 — too tight)
  const armGeoL = new THREE.BoxGeometry(U * 4, U * 12, U * 4)
  armGeoL.translate(0, -U * 6, 0) // Shift so top of arm (shoulder) is at local Y=0
  const armL = new THREE.Mesh(armGeoL, createTexturedMaterials(skinColor))
  armL.name = 'armL'
  armL.position.set(-U * 6 - armGap, U * 24, 0) // Shoulder height, further out
  character.add(armL)

  const armGeoR = new THREE.BoxGeometry(U * 4, U * 12, U * 4)
  armGeoR.translate(0, -U * 6, 0)
  const armR = new THREE.Mesh(armGeoR, createTexturedMaterials(skinColor))
  armR.name = 'armR'
  armR.position.set(U * 6 + armGap, U * 24, 0)
  character.add(armR)

  // Shirt sleeves — children of arms so they rotate together
  const sleeveGeoL = new THREE.BoxGeometry(U * 4.2, U * 5, U * 4.2)
  sleeveGeoL.translate(0, -U * 2.5, 0) // Upper portion of arm relative to shoulder pivot
  const sleeveL = new THREE.Mesh(sleeveGeoL, createTexturedMaterials(shirtColor))
  sleeveL.name = 'sleeveL'
  armL.add(sleeveL) // Child of arm — rotates with it

  const sleeveGeoR = new THREE.BoxGeometry(U * 4.2, U * 5, U * 4.2)
  sleeveGeoR.translate(0, -U * 2.5, 0)
  const sleeveR = new THREE.Mesh(sleeveGeoR, createTexturedMaterials(shirtColor))
  sleeveR.name = 'sleeveR'
  armR.add(sleeveR) // Child of arm — rotates with it

  // --- LEGS (4×12×4 each) ---
  const legL = texturedBox(U * 4, U * 12, U * 4, pantsColor, 'legL')
  legL.position.set(-U * 2, U * 6, 0)
  character.add(legL)

  const legR = texturedBox(U * 4, U * 12, U * 4, pantsColor, 'legR')
  legR.position.set(U * 2, U * 6, 0)
  character.add(legR)

  // Shoes (bottom 2px of legs)
  const footL = texturedBox(U * 4.1, U * 2, U * 4.5, shoeColor, 'footL')
  footL.position.set(-U * 2, U * 1, U * 0.2)
  character.add(footL)

  const footR = texturedBox(U * 4.1, U * 2, U * 4.5, shoeColor, 'footR')
  footR.position.set(U * 2, U * 1, U * 0.2)
  character.add(footR)

  // Character feet sit at Y=0
  return character
}

/** Apply new features to an existing character group (re-color skin, hair, etc.) */
export function applyFeatures(
  character: THREE.Group,
  features: CharacterFeatures,
): void {
  const skinColor = new THREE.Color(features.skinTone)

  const skinParts = ['head', 'armL', 'armR']
  for (const name of skinParts) {
    const mesh = character.getObjectByName(name) as THREE.Mesh | undefined
    if (mesh) {
      // Handle both single material and material array (texturedBox creates arrays)
      if (Array.isArray(mesh.material)) {
        for (let i = 0; i < mesh.material.length; i++) {
          const variation = 0.95 + Math.random() * 0.1
          const faceColor = skinColor.clone().multiplyScalar(variation)
          mesh.material[i] = new THREE.MeshLambertMaterial({ color: faceColor })
        }
      } else {
        mesh.material = new THREE.MeshLambertMaterial({ color: skinColor })
      }
    }
  }

  // Remove old hair, add new
  const oldHair = character.getObjectByName('hairGroup')
  if (oldHair) character.remove(oldHair)

  const head = character.getObjectByName('head') as THREE.Mesh | undefined
  if (head) {
    const hairMat = new THREE.MeshLambertMaterial({ color: features.hairColor })
    // Infer U from the head geometry width (head is 8U wide)
    const headGeo = head.geometry as THREE.BoxGeometry
    const headWidth = headGeo.parameters.width
    const U = headWidth / 8
    const hairGroup = buildHair(features.hairStyle, features.hairLength, hairMat, head.position.y, U)
    character.add(hairGroup)
  }

  // Update eye color
  if (features.eyeColor) {
    const eyeMat = new THREE.MeshLambertMaterial({ color: features.eyeColor })
    for (const name of ['pupilL', 'pupilR']) {
      const mesh = character.getObjectByName(name) as THREE.Mesh | undefined
      if (mesh) mesh.material = eyeMat
    }
  }
}
