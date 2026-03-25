import * as THREE from 'three'
import type { CharacterFeatures, OutfitCustomization } from '../../../core/types'
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

  // Colors from features (with fallbacks) — skin & hair from photo, clothes are child-specific
  const skinColor = new THREE.Color(features.skinTone ?? '#F5D6B8')
  const hairColor = new THREE.Color(features.hairColor ?? '#6B4C32')
  // Lincoln: light heather gray Minecraft creeper tee; London: bright blue (his favorite)
  const shirtColor = new THREE.Color(ageGroup === 'younger' ? '#4A90C2' : '#BBBBBB')
  const pantsColor = new THREE.Color('#2A3A52') // Dark navy shorts
  // Lincoln is barefoot — shoe color matches skin; London gets sneakers
  const shoeColor = new THREE.Color(ageGroup === 'younger' ? '#444444' : features.skinTone ?? '#F5D6B8')

  // --- HEAD GROUP (contains head mesh + face features + hair) ---
  // Everything attached to the head is a child of headGroup so it all
  // moves together during poses (nod, look-up, dab tilt, etc.).
  const headGroup = new THREE.Group()
  headGroup.name = 'headGroup'
  headGroup.position.y = U * 28 // Top of body + half head
  character.add(headGroup)

  const headMesh = texturedBox(U * 8, U * 8, U * 8, skinColor, 'head')
  // headMesh at (0,0,0) within headGroup
  headGroup.add(headMesh)

  // Face details — positions RELATIVE to headGroup center (0,0,0)
  // Eyes — white sclera with dark pupils
  const eyeWhiteL = box(U * 2, U * 1, U * 0.5, 0xffffff, 'eyeWhiteL')
  eyeWhiteL.position.set(-U * 1.5, U * 0.5, U * 4.1)
  headGroup.add(eyeWhiteL)
  const eyeColor = features.eyeColor ? new THREE.Color(features.eyeColor) : new THREE.Color(0x4a6b7a)
  const pupilL = box(U * 1, U * 1, U * 0.3, eyeColor, 'pupilL')
  pupilL.position.set(-U * 1.2, U * 0.5, U * 4.3) // Slightly offset for personality
  headGroup.add(pupilL)

  const eyeWhiteR = box(U * 2, U * 1, U * 0.5, 0xffffff, 'eyeWhiteR')
  eyeWhiteR.position.set(U * 1.5, U * 0.5, U * 4.1)
  headGroup.add(eyeWhiteR)
  const pupilR = box(U * 1, U * 1, U * 0.3, eyeColor, 'pupilR')
  pupilR.position.set(U * 1.8, U * 0.5, U * 4.3) // Slightly offset for personality
  headGroup.add(pupilR)

  // Eyebrows — gives expression
  const eyebrowColor = 0x5A3E28
  const eyebrowL = box(U * 1.8, U * 0.4, U * 0.3, eyebrowColor, 'eyebrowL')
  eyebrowL.position.set(-U * 1.5, U * 1.4, U * 4.15)
  headGroup.add(eyebrowL)
  const eyebrowR = box(U * 1.8, U * 0.4, U * 0.3, eyebrowColor, 'eyebrowR')
  eyebrowR.position.set(U * 1.5, U * 1.4, U * 4.15)
  headGroup.add(eyebrowR)

  // Nose — tiny bump
  const nose = box(U * 0.8, U * 0.8, U * 0.3, 0xe8c8a8, 'nose')
  nose.position.set(0, -U * 0.5, U * 4.15)
  headGroup.add(nose)

  // Mouth — subtle, slightly darker skin tone (not black)
  const mouth = box(U * 2, U * 0.5, U * 0.3, 0xD4A088, 'mouth')
  mouth.position.set(0, -U * 1.8, U * 4.2)
  headGroup.add(mouth)

  // Hair — built from the hair module, child of headGroup (headY = 0 in local space)
  const hairMat = new THREE.MeshLambertMaterial({ color: hairColor })
  const hairGroup = buildHair(features.hairStyle, features.hairLength, hairMat, 0, U)
  headGroup.add(hairGroup)

  // --- BODY (8×12×4 = 1×1.5×0.5) ---
  const torso = texturedBox(U * 8, U * 12, U * 4, shirtColor, 'torso')
  torso.position.y = U * 18 // Center of body
  character.add(torso)

  // Shirt design — Lincoln gets a creeper face, London gets a simple star
  if (ageGroup === 'older') {
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
  } else {
    // Simple yellow star on London's blue shirt
    const starColor = 0xFFD700
    const starV = box(U * 1.2, U * 3, U * 0.3, starColor, 'starV')
    starV.position.set(0, U * 19, U * 2.15)
    character.add(starV)
    const starH = box(U * 3, U * 1.2, U * 0.3, starColor, 'starH')
    starH.position.set(0, U * 19, U * 2.15)
    character.add(starH)
  }

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

/** Helper: recolor a mesh (handles both single material and material array) */
function recolorMesh(mesh: THREE.Mesh, color: THREE.Color): void {
  if (Array.isArray(mesh.material)) {
    for (let i = 0; i < mesh.material.length; i++) {
      const variation = 0.95 + Math.random() * 0.1
      mesh.material[i] = new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(variation) })
    }
  } else {
    mesh.material = new THREE.MeshLambertMaterial({ color })
  }
}

/** Apply a color to a specific outfit slot on the 3D character */
export function applyOutfitColor(
  character: THREE.Group,
  slot: 'shirt' | 'pants' | 'shoes',
  hexColor: string,
): void {
  const color = new THREE.Color(hexColor)

  switch (slot) {
    case 'shirt': {
      const torso = character.getObjectByName('torso')
      if (torso instanceof THREE.Mesh) recolorMesh(torso, color)
      character.traverse((child) => {
        if (child.name?.startsWith('sleeve') && child instanceof THREE.Mesh) {
          recolorMesh(child, color)
        }
      })
      // Adjust creeper face contrast against new shirt color
      const brightness = color.r * 0.299 + color.g * 0.587 + color.b * 0.114
      const creeperColor = brightness > 0.5 ? 0x2E7D32 : 0x4CAF50
      character.traverse((child) => {
        if (child.name?.startsWith('creeper') && child instanceof THREE.Mesh) {
          child.material = new THREE.MeshLambertMaterial({ color: creeperColor })
        }
      })
      break
    }
    case 'pants': {
      for (const name of ['legL', 'legR']) {
        const leg = character.getObjectByName(name)
        if (leg instanceof THREE.Mesh) recolorMesh(leg, color)
      }
      break
    }
    case 'shoes': {
      for (const name of ['footL', 'footR']) {
        const foot = character.getObjectByName(name)
        if (foot instanceof THREE.Mesh) recolorMesh(foot, color)
      }
      break
    }
  }
}

/** Apply all saved outfit colors from a profile's customization */
export function applyProfileOutfit(
  character: THREE.Group,
  customization: OutfitCustomization | undefined,
): void {
  if (!customization) return
  if (customization.shirtColor) applyOutfitColor(character, 'shirt', customization.shirtColor)
  if (customization.pantsColor) applyOutfitColor(character, 'pants', customization.pantsColor)
  if (customization.shoeColor) applyOutfitColor(character, 'shoes', customization.shoeColor)
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

  // Remove old hair from headGroup, add new
  const headGroup = character.getObjectByName('headGroup') as THREE.Group | undefined
  const headMesh = character.getObjectByName('head') as THREE.Mesh | undefined

  if (headGroup && headMesh) {
    const oldHair = headGroup.getObjectByName('hairGroup')
    if (oldHair) headGroup.remove(oldHair)

    const hairMat = new THREE.MeshLambertMaterial({ color: features.hairColor })
    const headGeo = headMesh.geometry as THREE.BoxGeometry
    const U = headGeo.parameters.width / 8
    // headY = 0 because hair is a child of headGroup (local space)
    const hairGroup = buildHair(features.hairStyle, features.hairLength, hairMat, 0, U)
    headGroup.add(hairGroup)
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
