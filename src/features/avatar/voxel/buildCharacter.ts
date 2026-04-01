import * as THREE from 'three'
import type { CharacterFeatures, CharacterProportions, OutfitCustomization } from '../../../core/types'
import { buildHair } from './buildHair'

// ── Helpers ─────────────────────────────────────────────────────────

/** Lerp between two hex colors. t=0 → colorA, t=1 → colorB */
function lerpColor(colorA: number, colorB: number, t: number): number {
  const a = new THREE.Color(colorA)
  const b = new THREE.Color(colorB)
  a.lerp(b, t)
  return a.getHex()
}

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

  // Create material with slight variations per face — Phong for Legends lighting response
  const materials: THREE.MeshPhongMaterial[] = []
  for (let i = 0; i < 6; i++) {
    const variation = 0.95 + Math.random() * 0.1 // 95% to 105% brightness
    const faceColor = color.clone().multiplyScalar(variation)
    materials.push(new THREE.MeshPhongMaterial({
      color: faceColor,
      specular: 0x222222,
      shininess: 8,
      flatShading: true,
    }))
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
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    color: c,
    specular: 0x222222,
    shininess: 8,
    flatShading: true,
  }))
  if (name) mesh.name = name
  return mesh
}

/** Create an array of 6 slightly-varied materials for per-face texturing */
function createTexturedMaterials(
  baseColor: THREE.Color | number,
  specular = 0x222222,
  shininess = 8,
): THREE.MeshPhongMaterial[] {
  const color = baseColor instanceof THREE.Color ? baseColor : new THREE.Color(baseColor)
  const materials: THREE.MeshPhongMaterial[] = []
  for (let i = 0; i < 6; i++) {
    const variation = 0.95 + Math.random() * 0.1
    materials.push(new THREE.MeshPhongMaterial({
      color: color.clone().multiplyScalar(variation),
      specular,
      shininess,
      flatShading: true,
    }))
  }
  return materials
}

// ── Default outfit palettes (Minecraft Legends hero style) ─────────

export const LEGENDS_OUTFIT = {
  older: {
    shirtColor: 0xCC5500,    // warm burnt orange
    pantsColor: 0x2A3A52,    // dark navy
    bootColor: 0x3D2B1F,     // dark brown leather
    beltColor: 0x5C4033,     // medium brown leather
    capeColor: 0x8B0000,     // dark red (heroic)
    trimColor: 0xC8A84E,     // gold accents
    wrapColor: 0x5C4033,     // brown wrist wraps
  },
  younger: {
    shirtColor: 0xE8A838,    // mustard yellow
    pantsColor: 0xC4B998,    // khaki
    bootColor: 0x3D2B1F,     // dark brown leather
    beltColor: 0x5C4033,     // medium brown leather
    capeColor: 0x2255AA,     // blue
    trimColor: 0xC8A84E,     // gold accents
    wrapColor: 0x5C4033,     // brown wrist wraps
  },
} as const

// ── Family-tuned character proportions (hand-picked via visual tuning tool) ──
//
// Base dimensions in world units. Body parts are multiplied by `s` (scale factor):
//   older (Lincoln, age 10): s = 1.0
//   younger (London, age 6): s = 0.85
// Head stays at 1.8 for BOTH (bigger head-to-body ratio on smaller body).
//
// Total height (older): legH + torsoH + headSize = 2.8 + 2.6 + 1.8 = 7.2
// Total height (younger): 2.38 + 2.21 + 1.8 = 6.39

export const CHARACTER_PROPORTIONS = {
  headSize: 1.8,
  torsoW: 1.7,
  torsoH: 2.6,
  torsoD: 1.1,
  armW: 1.0,
  armH: 2.6,
  legW: 0.8,
  legH: 2.8,
  armGap: 0,        // arms flush against torso sides
  sleeveRatio: 0.7, // 70% of arm length is shirt-colored sleeve
  bootRatio: 0.3,   // 30% of leg is boot-colored
} as const

/** Compute key layout coordinates from proportions (shared with armor/cape/accessories) */
export function getBodyLayout(ageGroup: 'older' | 'younger', customProportions?: Partial<CharacterProportions>) {
  const scale = ageGroup === 'younger' ? 0.85 : 1.0
  const s = scale
  const U = 0.125 * s // Detail unit for armor/accessory padding
  const cp = customProportions
    ? { ...CHARACTER_PROPORTIONS, ...customProportions }
    : CHARACTER_PROPORTIONS

  // World-unit dimensions (head NOT scaled — same absolute size for both)
  const headSize = cp.headSize
  const torsoW = cp.torsoW * s
  const torsoH = cp.torsoH * s
  const torsoD = cp.torsoD * s
  const armW = cp.armW * s
  const armH = cp.armH * s
  const armD = armW // square cross-section
  const legW = cp.legW * s
  const legH = cp.legH * s
  const legD = legW * 0.9

  // Backward-compatible pixel values: p.xxx * U === world value
  // (armor, cape, and accessory code uses these for detail offsets)
  const p = {
    headPx: headSize / U,
    torsoPxH: torsoH / U,
    torsoPxW: torsoW / U,
    torsoPxD: torsoD / U,
    armPxH: armH / U,
    armPxW: armW / U,
    armPxD: armD / U,
    legPxH: legH / U,
    legPxW: legW / U,
    legPxD: legD / U,
  }

  // Stacking: feet at Y = 0
  const legTop = legH
  const torsoCenter = legTop + torsoH / 2
  const torsoTop = legTop + torsoH
  const headCenter = torsoTop + headSize / 2 + 0.02 * s // tiny neck gap

  return {
    U, p, scale, headSize,
    torsoH, torsoW, torsoD,
    armH, armW, armD,
    legH, legW, legD,
    legTop, torsoCenter, torsoTop, headCenter,
  }
}

export function buildCharacter(
  features: CharacterFeatures,
  ageGroup: 'older' | 'younger',
  customProportions?: Partial<CharacterProportions>,
): THREE.Group {
  const character = new THREE.Group()
  character.name = 'character'

  const layout = getBodyLayout(ageGroup, customProportions)
  const s = layout.scale
  const outfit = LEGENDS_OUTFIT[ageGroup]

  const { headSize, torsoW, torsoH, torsoD, armW, armH, legW, legH, legD } = layout
  const { torsoCenter, torsoTop, headCenter } = layout

  // Colors from features (with fallbacks) — skin & hair from photo, clothes are Legends outfit
  const skinColor = new THREE.Color(features.skinTone ?? '#F5D6B8')
  const hairColor = new THREE.Color(features.hairColor ?? '#6B4C32')
  const shirtColor = new THREE.Color(outfit.shirtColor)
  const pantsColor = new THREE.Color(outfit.pantsColor)

  // --- HEAD GROUP (contains head mesh + face features + hair) ---
  const headGroup = new THREE.Group()
  headGroup.name = 'headGroup'
  headGroup.position.y = headCenter
  character.add(headGroup)

  const headMesh = texturedBox(headSize, headSize, headSize, skinColor, 'head')
  headGroup.add(headMesh)

  // Face details — positions RELATIVE to headGroup center (0,0,0)
  // hU = head pixel unit: headSize / 8 (8-pixel face grid)
  const hU = headSize / 8

  // Eyes — white sclera with dark pupils
  const eyeWhiteL = box(hU * 2, hU * 1, hU * 0.5, 0xffffff, 'eyeWhiteL')
  eyeWhiteL.position.set(-hU * 1.5, hU * 0.5, hU * 4.1)
  headGroup.add(eyeWhiteL)
  const eyeColor = features.eyeColor ? new THREE.Color(features.eyeColor) : new THREE.Color(0x4a6b7a)
  const pupilL = box(hU * 1, hU * 1, hU * 0.3, eyeColor, 'pupilL')
  pupilL.position.set(-hU * 1.2, hU * 0.5, hU * 4.3)
  headGroup.add(pupilL)

  const eyeWhiteR = box(hU * 2, hU * 1, hU * 0.5, 0xffffff, 'eyeWhiteR')
  eyeWhiteR.position.set(hU * 1.5, hU * 0.5, hU * 4.1)
  headGroup.add(eyeWhiteR)
  const pupilR = box(hU * 1, hU * 1, hU * 0.3, eyeColor, 'pupilR')
  pupilR.position.set(hU * 1.8, hU * 0.5, hU * 4.3)
  headGroup.add(pupilR)

  // Eyebrows
  const eyebrowColor = ageGroup === 'younger' ? 0x9B7B3A : 0x5A3E28
  const eyebrowL = box(hU * 1.8, hU * 0.4, hU * 0.3, eyebrowColor, 'eyebrowL')
  eyebrowL.position.set(-hU * 1.5, hU * 1.4, hU * 4.15)
  headGroup.add(eyebrowL)
  const eyebrowR = box(hU * 1.8, hU * 0.4, hU * 0.3, eyebrowColor, 'eyebrowR')
  eyebrowR.position.set(hU * 1.5, hU * 1.4, hU * 4.15)
  headGroup.add(eyebrowR)

  // Nose
  const noseColor = new THREE.Color(features.skinTone ?? '#F5D6B8').multiplyScalar(0.92)
  const nose = box(hU * 0.8, hU * 0.8, hU * 0.3, noseColor, 'nose')
  nose.position.set(0, -hU * 0.5, hU * 4.15)
  headGroup.add(nose)

  // Mouth
  const mouthColor = new THREE.Color(features.skinTone ?? '#F5D6B8').multiplyScalar(0.82)
  const mouth = box(hU * 2, hU * 0.5, hU * 0.3, mouthColor, 'mouth')
  mouth.position.set(0, -hU * 1.8, hU * 4.2)
  headGroup.add(mouth)

  // Hair — built from the hair module, child of headGroup (headY = 0 in local space)
  const hairMat = new THREE.MeshPhongMaterial({
    color: hairColor,
    specular: 0x332211,
    shininess: 12,
    flatShading: true,
  })
  const hairGroup = buildHair(features.hairStyle, features.hairLength, hairMat, 0, hU)
  headGroup.add(hairGroup)

  // --- TORSO ---
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(torsoW, torsoH, torsoD),
    createTexturedMaterials(shirtColor, 0x222222, 8),
  )
  torso.name = 'torso'
  torso.position.y = torsoCenter
  character.add(torso)

  // COLLAR — thin darker band at top of tunic
  const collarColor = lerpColor(outfit.shirtColor, 0x000000, 0.25)
  const collar = box(torsoW + 0.02 * s, 0.08 * s, torsoD + 0.02 * s, collarColor, 'tunicCollar')
  collar.position.y = torsoCenter + torsoH / 2 - 0.04 * s
  character.add(collar)

  // GOLD TRIM BAND — horizontal stripe across chest front face
  const trimBand = box(torsoW + 0.02 * s, 0.06 * s, 0.02 * s, outfit.trimColor, 'trimBand')
  trimBand.position.set(0, torsoCenter, torsoD / 2 + 0.01 * s)
  character.add(trimBand)

  // CLOTH BELT — base outfit, NOT the Armor Belt of Truth
  const clothBelt = box(torsoW + 0.04 * s, 0.1 * s, torsoD + 0.04 * s, outfit.beltColor, 'clothBelt')
  clothBelt.position.y = torsoCenter - torsoH / 2 + 0.05 * s
  character.add(clothBelt)

  // Belt buckle
  const buckle = box(0.08 * s, 0.08 * s, 0.02 * s, outfit.trimColor, 'clothBuckle')
  buckle.position.set(0, clothBelt.position.y, torsoD / 2 + 0.03 * s)
  character.add(buckle)

  // TUNIC SKIRT — extends below torso, overlaps top of legs
  const skirtColor = lerpColor(outfit.shirtColor, 0x000000, 0.2)
  const skirt = texturedBox(torsoW + 0.06 * s, 0.25 * s, torsoD + 0.03 * s, skirtColor, 'tunicSkirt')
  skirt.position.y = torsoCenter - torsoH / 2 - 0.12 * s
  character.add(skirt)

  // SHOULDER PADS — base outfit detail
  const shoulderL = box(0.18 * s, 0.1 * s, armW + 0.04 * s, shirtColor, 'shoulderL')
  shoulderL.position.set(-(torsoW / 2 + 0.05 * s), torsoTop - 0.05 * s, 0)
  character.add(shoulderL)

  const shoulderR = box(0.18 * s, 0.1 * s, armW + 0.04 * s, shirtColor, 'shoulderR')
  shoulderR.position.set(torsoW / 2 + 0.05 * s, torsoTop - 0.05 * s, 0)
  character.add(shoulderR)

  // --- ARMS (Group: sleeve + forearm + wrist wrap) ---
  // Pivot at shoulder (Group origin). Geometry translated down from pivot.
  const shoulderY = torsoTop - 0.03 * s
  const cpUsed = customProportions
    ? { ...CHARACTER_PROPORTIONS, ...customProportions }
    : CHARACTER_PROPORTIONS
  const sleeveH = armH * cpUsed.sleeveRatio   // 70% of arm
  const forearmH = armH * (1 - cpUsed.sleeveRatio) // 30% of arm
  const forearmW = armW - 0.01 * s // slightly thinner than sleeve

  // Left arm
  const armL = new THREE.Group()
  armL.name = 'armL'
  armL.position.set(-(torsoW / 2 + armW / 2), shoulderY, 0)
  character.add(armL)

  const sleeveGeoL = new THREE.BoxGeometry(armW, sleeveH, armW)
  sleeveGeoL.translate(0, -sleeveH / 2, 0)
  const sleeveL = new THREE.Mesh(sleeveGeoL, createTexturedMaterials(shirtColor, 0x111111, 5))
  sleeveL.name = 'sleeveL'
  armL.add(sleeveL)

  const forearmGeoL = new THREE.BoxGeometry(forearmW, forearmH, forearmW)
  forearmGeoL.translate(0, -(sleeveH + forearmH / 2), 0)
  const forearmL = new THREE.Mesh(forearmGeoL, createTexturedMaterials(skinColor))
  forearmL.name = 'forearmL'
  armL.add(forearmL)

  const wristWrapGeoL = new THREE.BoxGeometry(armW + 0.02 * s, 0.05 * s, armW + 0.02 * s)
  wristWrapGeoL.translate(0, -sleeveH, 0)
  const wristWrapL = new THREE.Mesh(wristWrapGeoL, new THREE.MeshPhongMaterial({
    color: outfit.wrapColor,
    specular: 0x222211,
    shininess: 10,
    flatShading: true,
  }))
  wristWrapL.name = 'wristWrapL'
  armL.add(wristWrapL)

  // Right arm
  const armR = new THREE.Group()
  armR.name = 'armR'
  armR.position.set(torsoW / 2 + armW / 2, shoulderY, 0)
  character.add(armR)

  const sleeveGeoR = new THREE.BoxGeometry(armW, sleeveH, armW)
  sleeveGeoR.translate(0, -sleeveH / 2, 0)
  const sleeveR = new THREE.Mesh(sleeveGeoR, createTexturedMaterials(shirtColor, 0x111111, 5))
  sleeveR.name = 'sleeveR'
  armR.add(sleeveR)

  const forearmGeoR = new THREE.BoxGeometry(forearmW, forearmH, forearmW)
  forearmGeoR.translate(0, -(sleeveH + forearmH / 2), 0)
  const forearmR = new THREE.Mesh(forearmGeoR, createTexturedMaterials(skinColor))
  forearmR.name = 'forearmR'
  armR.add(forearmR)

  const wristWrapGeoR = new THREE.BoxGeometry(armW + 0.02 * s, 0.05 * s, armW + 0.02 * s)
  wristWrapGeoR.translate(0, -sleeveH, 0)
  const wristWrapR = new THREE.Mesh(wristWrapGeoR, new THREE.MeshPhongMaterial({
    color: outfit.wrapColor,
    specular: 0x222211,
    shininess: 10,
    flatShading: true,
  }))
  wristWrapR.name = 'wristWrapR'
  armR.add(wristWrapR)

  // --- LEGS (pants upper + boot lower) ---
  const legCenter = legH / 2
  const legXOffset = legW / 2 + 0.01 * s

  // Full leg in pants color
  const legL = texturedBox(legW, legH, legD, pantsColor, 'legL')
  legL.position.set(-legXOffset, legCenter, 0)
  character.add(legL)

  const legR = texturedBox(legW, legH, legD, pantsColor, 'legR')
  legR.position.set(legXOffset, legCenter, 0)
  character.add(legR)

  // BOOTS — cover lower 30% of each leg (slightly wider, leather material)
  const bootH = legH * cpUsed.bootRatio
  const bootY = bootH / 2

  const bootL = new THREE.Mesh(
    new THREE.BoxGeometry(legW + 0.02 * s, bootH, legD + 0.02 * s),
    createTexturedMaterials(outfit.bootColor, 0x222222, 15),
  )
  bootL.name = 'bootL'
  bootL.position.set(-legXOffset, bootY, 0)
  character.add(bootL)

  const bootR = new THREE.Mesh(
    new THREE.BoxGeometry(legW + 0.02 * s, bootH, legD + 0.02 * s),
    createTexturedMaterials(outfit.bootColor, 0x222222, 15),
  )
  bootR.name = 'bootR'
  bootR.position.set(legXOffset, bootY, 0)
  character.add(bootR)

  // Boot top band — accent strip at top of each boot
  const bootBandL = box(legW + 0.04 * s, 0.06 * s, legD + 0.04 * s, outfit.beltColor, 'bootBandL')
  bootBandL.position.set(-legXOffset, bootH, 0)
  character.add(bootBandL)

  const bootBandR = box(legW + 0.04 * s, 0.06 * s, legD + 0.04 * s, outfit.beltColor, 'bootBandR')
  bootBandR.position.set(legXOffset, bootH, 0)
  character.add(bootBandR)

  // Character feet sit at Y=0
  return character
}

/** Helper: recolor a mesh (handles both single material and material array) */
function recolorMesh(mesh: THREE.Mesh, color: THREE.Color): void {
  if (Array.isArray(mesh.material)) {
    for (let i = 0; i < mesh.material.length; i++) {
      const variation = 0.95 + Math.random() * 0.1
      mesh.material[i] = new THREE.MeshPhongMaterial({
        color: color.clone().multiplyScalar(variation),
        specular: 0x111111,
        shininess: 5,
        flatShading: true,
      })
    }
  } else {
    mesh.material = new THREE.MeshPhongMaterial({
      color,
      specular: 0x111111,
      shininess: 5,
      flatShading: true,
    })
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
      // Recolor torso, sleeves, tunic details, and shoulders
      const torso = character.getObjectByName('torso')
      if (torso instanceof THREE.Mesh) recolorMesh(torso, color)
      character.traverse((child) => {
        if (child instanceof THREE.Mesh && (
          child.name?.startsWith('sleeve') ||
          child.name === 'shoulderL' ||
          child.name === 'shoulderR'
        )) {
          recolorMesh(child, color)
        }
      })
      // Recolor tunic skirt (slightly darker than shirt)
      const skirt = character.getObjectByName('tunicSkirt')
      if (skirt instanceof THREE.Mesh) {
        const darkerColor = color.clone().multiplyScalar(0.85)
        recolorMesh(skirt, darkerColor)
      }
      // Recolor collar (even darker)
      const collar = character.getObjectByName('tunicCollar')
      if (collar instanceof THREE.Mesh) {
        const darkerColor = color.clone().multiplyScalar(0.75)
        recolorMesh(collar, darkerColor)
      }
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
      for (const name of ['bootL', 'bootR']) {
        const boot = character.getObjectByName(name)
        if (boot instanceof THREE.Mesh) recolorMesh(boot, color)
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

  // Skin parts: head + forearms (arms are Groups now, forearms are the skin meshes)
  const skinParts = ['head', 'forearmL', 'forearmR']
  for (const name of skinParts) {
    const mesh = character.getObjectByName(name) as THREE.Mesh | undefined
    if (mesh) {
      if (Array.isArray(mesh.material)) {
        for (let i = 0; i < mesh.material.length; i++) {
          const variation = 0.95 + Math.random() * 0.1
          const faceColor = skinColor.clone().multiplyScalar(variation)
          mesh.material[i] = new THREE.MeshPhongMaterial({
            color: faceColor,
            specular: 0x222222,
            shininess: 8,
            flatShading: true,
          })
        }
      } else {
        mesh.material = new THREE.MeshPhongMaterial({
          color: skinColor,
          specular: 0x222222,
          shininess: 8,
          flatShading: true,
        })
      }
    }
  }

  // Remove old hair from headGroup, add new
  const headGroup = character.getObjectByName('headGroup') as THREE.Group | undefined
  const headMesh = character.getObjectByName('head') as THREE.Mesh | undefined

  if (headGroup && headMesh) {
    const oldHair = headGroup.getObjectByName('hairGroup')
    if (oldHair) headGroup.remove(oldHair)

    const hairMat = new THREE.MeshPhongMaterial({
      color: features.hairColor,
      specular: 0x332211,
      shininess: 12,
      flatShading: true,
    })
    const headGeo = headMesh.geometry as THREE.BoxGeometry
    const hU = headGeo.parameters.width / 8
    const hairGroup = buildHair(features.hairStyle, features.hairLength, hairMat, 0, hU)
    headGroup.add(hairGroup)
  }

  // Update eye color
  if (features.eyeColor) {
    const eyeMat = new THREE.MeshPhongMaterial({
      color: features.eyeColor,
      specular: 0x222222,
      shininess: 8,
      flatShading: true,
    })
    for (const name of ['pupilL', 'pupilR']) {
      const mesh = character.getObjectByName(name) as THREE.Mesh | undefined
      if (mesh) mesh.material = eyeMat
    }
  }
}
