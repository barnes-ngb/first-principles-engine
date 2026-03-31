import * as THREE from 'three'
import type { CharacterFeatures, OutfitCustomization } from '../../../core/types'
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

// ── Build character (Minecraft Legends hero proportions) ──────────
//
// Legends heroic proportions (older, U=0.125):
//   Head:  10×10×10 px → 1.25×1.25×1.25 units
//   Torso: 6×9×3 px    → 0.75×1.125×0.375 units
//   Arms:  2×10.5×2 px → 0.25×1.3125×0.25 units
//   Legs:  2.5×17×2.5  → 0.3125×2.125×0.3125 units
//   Total height = 2.125 + 1.125 + 1.25 = 4.5 units
//
// 1 pixel = U = 0.125 units at scale 1.0

// ── Body proportions per age group (Minecraft Legends heroic style) ──
// All values in Minecraft pixels. U = 0.125 * scale converts to world units.
// Legends heroes: bigger head, narrower torso, thin arms, LONG legs.

export const BODY_PROPORTIONS = {
  older: {
    headPx: 10,       // Bigger head — personality + readability on small screens
    torsoPxH: 9,      // Shorter torso — less boxy, armor changes silhouette
    torsoPxW: 6,      // NARROW torso — heroic V-shape, not a fridge
    torsoPxD: 3,      // Thinner — side profile not a block
    armPxH: 10.5,     // Slightly shorter than torso+head gap
    armPxW: 2,        // THIN arms — no more planks, sleeves add bulk
    armPxD: 2,        // THIN arms
    legPxH: 17,       // LONG legs — heroic stance, ~1.9× torso height
    legPxW: 2.5,      // Thinner — proportional to narrow body
    legPxD: 2.5,      // Thinner
  },
  younger: {
    headPx: 10,       // Same head = bigger head-to-body ratio (reads younger)
    torsoPxH: 6.75,   // 75% of older
    torsoPxW: 5.4,    // 90% of older
    torsoPxD: 2.7,    // 90% of older
    armPxH: 7.875,    // 75% of older
    armPxW: 2,        // Same thin arms
    armPxD: 2,
    legPxH: 11.9,     // 70% of older
    legPxW: 2.5,      // Same thin legs
    legPxD: 2.5,
  },
} as const

/** Compute key layout coordinates from proportions (shared with armor/cape/accessories) */
export function getBodyLayout(ageGroup: 'older' | 'younger') {
  const scale = ageGroup === 'younger' ? 0.88 : 1.0
  const U = 0.125 * scale
  const p = BODY_PROPORTIONS[ageGroup]

  const headSize = p.headPx * U
  const torsoH = p.torsoPxH * U
  const torsoW = p.torsoPxW * U
  const torsoD = p.torsoPxD * U
  const armH = p.armPxH * U
  const armW = p.armPxW * U
  const armD = p.armPxD * U
  const legH = p.legPxH * U
  const legW = p.legPxW * U
  const legD = p.legPxD * U

  const legTop = legH
  const torsoCenter = legTop + torsoH / 2
  const torsoTop = legTop + torsoH
  const headCenter = torsoTop + headSize / 2

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
): THREE.Group {
  const character = new THREE.Group()
  character.name = 'character'

  const layout = getBodyLayout(ageGroup)
  const { U, p, scale: s } = layout
  const outfit = LEGENDS_OUTFIT[ageGroup]

  // Dimensions from layout
  const { headSize, torsoW, torsoH, torsoD, armW, armH, armD, legW, legH, legD } = layout
  const { torsoTop, headCenter } = layout

  // Colors from features (with fallbacks) — skin & hair from photo, clothes are Legends outfit
  const skinColor = new THREE.Color(features.skinTone ?? '#F5D6B8')
  const hairColor = new THREE.Color(features.hairColor ?? '#6B4C32')
  const shirtColor = new THREE.Color(outfit.shirtColor)
  const pantsColor = new THREE.Color(outfit.pantsColor)

  // --- HEAD GROUP (contains head mesh + face features + hair) ---
  // Everything attached to the head is a child of headGroup so it all
  // moves together during poses (nod, look-up, dab tilt, etc.).
  const headGroup = new THREE.Group()
  headGroup.name = 'headGroup'
  headGroup.position.y = headCenter
  character.add(headGroup)

  const headMesh = texturedBox(headSize, headSize, headSize, skinColor, 'head')
  // headMesh at (0,0,0) within headGroup
  headGroup.add(headMesh)

  // Face details — positions RELATIVE to headGroup center (0,0,0)
  // hU scales proportionally with head: when head was 8px, hU=U; now 9px, hU=1.125*U
  const hU = (U * p.headPx) / 8
  // Eyes — white sclera with dark pupils
  const eyeWhiteL = box(hU * 2, hU * 1, hU * 0.5, 0xffffff, 'eyeWhiteL')
  eyeWhiteL.position.set(-hU * 1.5, hU * 0.5, hU * 4.1)
  headGroup.add(eyeWhiteL)
  const eyeColor = features.eyeColor ? new THREE.Color(features.eyeColor) : new THREE.Color(0x4a6b7a)
  const pupilL = box(hU * 1, hU * 1, hU * 0.3, eyeColor, 'pupilL')
  pupilL.position.set(-hU * 1.2, hU * 0.5, hU * 4.3) // Slightly offset for personality
  headGroup.add(pupilL)

  const eyeWhiteR = box(hU * 2, hU * 1, hU * 0.5, 0xffffff, 'eyeWhiteR')
  eyeWhiteR.position.set(hU * 1.5, hU * 0.5, hU * 4.1)
  headGroup.add(eyeWhiteR)
  const pupilR = box(hU * 1, hU * 1, hU * 0.3, eyeColor, 'pupilR')
  pupilR.position.set(hU * 1.8, hU * 0.5, hU * 4.3) // Slightly offset for personality
  headGroup.add(pupilR)

  // Eyebrows — gives expression
  const eyebrowColor = ageGroup === 'younger' ? 0x9B7B3A : 0x5A3E28 // Lighter brows for blonde
  const eyebrowL = box(hU * 1.8, hU * 0.4, hU * 0.3, eyebrowColor, 'eyebrowL')
  eyebrowL.position.set(-hU * 1.5, hU * 1.4, hU * 4.15)
  headGroup.add(eyebrowL)
  const eyebrowR = box(hU * 1.8, hU * 0.4, hU * 0.3, eyebrowColor, 'eyebrowR')
  eyebrowR.position.set(hU * 1.5, hU * 1.4, hU * 4.15)
  headGroup.add(eyebrowR)

  // Nose — tiny bump
  const noseColor = new THREE.Color(features.skinTone ?? '#F5D6B8').multiplyScalar(0.92)
  const nose = box(hU * 0.8, hU * 0.8, hU * 0.3, noseColor, 'nose')
  nose.position.set(0, -hU * 0.5, hU * 4.15)
  headGroup.add(nose)

  // Mouth — subtle, slightly darker skin tone (not black)
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

  // --- TORSO (Legends Tunic) ---
  const torsoCenter = layout.torsoCenter
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(torsoW, torsoH, torsoD),
    createTexturedMaterials(shirtColor, 0x222222, 8),
  )
  torso.name = 'torso'
  torso.position.y = torsoCenter
  character.add(torso)

  // COLLAR/NECKLINE — thin darker band at top of tunic
  const collarColor = lerpColor(outfit.shirtColor, 0x000000, 0.25)
  const collar = box(torsoW + 0.02, 0.12 * s, torsoD + 0.02, collarColor, 'tunicCollar')
  collar.position.y = torsoCenter + torsoH / 2 - 0.06 * s
  character.add(collar)

  // TRIM BAND — decorative gold stripe across the chest (like Legends heroes)
  const trimBand = box(torsoW + 0.03, 0.1 * s, 0.03, outfit.trimColor, 'trimBand')
  trimBand.position.set(0, torsoCenter, torsoD / 2 + 0.015)
  character.add(trimBand)

  // TUNIC SKIRT — extends below torso, slightly wider, covers top of legs
  const skirtColor = lerpColor(outfit.shirtColor, 0x000000, 0.15)
  const skirt = texturedBox(torsoW + 0.1, 0.4 * s, torsoD + 0.05, skirtColor, 'tunicSkirt')
  skirt.position.y = torsoCenter - torsoH / 2 - 0.2 * s
  character.add(skirt)

  // CLOTH BELT — every Legends character has one (base outfit, separate from Armor Belt of Truth)
  const clothBelt = box(torsoW + 0.06, 0.15 * s, torsoD + 0.06, outfit.beltColor, 'clothBelt')
  clothBelt.position.y = torsoCenter - torsoH / 2 + 0.1 * s
  character.add(clothBelt)

  // Belt buckle
  const buckle = box(0.12 * s, 0.12 * s, 0.03, outfit.trimColor, 'clothBuckle')
  buckle.position.set(0, clothBelt.position.y, torsoD / 2 + 0.04)
  character.add(buckle)

  // SHOULDER PADS — slightly wider shoulders (Legends style)
  const shoulderL = box(0.3 * s, 0.15 * s, armD + 0.04, shirtColor, 'shoulderL')
  shoulderL.position.set(-(torsoW / 2 + 0.05), torsoCenter + torsoH / 2 - 0.08 * s, 0)
  character.add(shoulderL)

  const shoulderR = box(0.3 * s, 0.15 * s, armD + 0.04, shirtColor, 'shoulderR')
  shoulderR.position.set(torsoW / 2 + 0.05, torsoCenter + torsoH / 2 - 0.08 * s, 0)
  character.add(shoulderR)

  // --- ARMS (split: sleeve upper + skin forearm + wrist wrap) ---
  // Geometry is shifted so pivot point is at the SHOULDER (top of arm),
  // enabling natural rotation from the shoulder joint.
  const armGap = U * 0.6 // Small gap between arm and torso edge
  const shoulderY = torsoTop
  const armHalfW = (p.armPxW / 2) * U
  const torsoHalfW = (p.torsoPxW / 2) * U

  // Arms are skin-colored (forearms exposed, Legends hero style)
  const armGeoL = new THREE.BoxGeometry(armW, armH, armD)
  armGeoL.translate(0, -armH / 2, 0) // Shift so top of arm (shoulder) is at local Y=0
  const armL = new THREE.Mesh(armGeoL, createTexturedMaterials(skinColor))
  armL.name = 'armL'
  armL.position.set(-torsoHalfW - armHalfW - armGap, shoulderY, 0)
  character.add(armL)

  const armGeoR = new THREE.BoxGeometry(armW, armH, armD)
  armGeoR.translate(0, -armH / 2, 0)
  const armR = new THREE.Mesh(armGeoR, createTexturedMaterials(skinColor))
  armR.name = 'armR'
  armR.position.set(torsoHalfW + armHalfW + armGap, shoulderY, 0)
  character.add(armR)

  // Shirt sleeves — upper 50% of arm (tunic sleeves, Legends style)
  const sleevePxLen = p.armPxH * 0.5
  const sleeveH = sleevePxLen * U
  const sleeveGeoL = new THREE.BoxGeometry(armW + U * 0.2, sleeveH, armD + U * 0.2)
  sleeveGeoL.translate(0, -sleeveH / 2, 0) // Upper portion of arm relative to shoulder pivot
  const sleeveL = new THREE.Mesh(sleeveGeoL, createTexturedMaterials(shirtColor, 0x111111, 5))
  sleeveL.name = 'sleeveL'
  armL.add(sleeveL) // Child of arm — rotates with it

  const sleeveGeoR = new THREE.BoxGeometry(armW + U * 0.2, sleeveH, armD + U * 0.2)
  sleeveGeoR.translate(0, -sleeveH / 2, 0)
  const sleeveR = new THREE.Mesh(sleeveGeoR, createTexturedMaterials(shirtColor, 0x111111, 5))
  sleeveR.name = 'sleeveR'
  armR.add(sleeveR) // Child of arm — rotates with it

  // Wrist wraps — small band at the sleeve/forearm transition
  const wristWrapGeoL = new THREE.BoxGeometry(armW + 0.03, 0.08 * s, armD + 0.03)
  wristWrapGeoL.translate(0, -sleeveH, 0) // At bottom edge of sleeve
  const wristWrapL = new THREE.Mesh(wristWrapGeoL, new THREE.MeshPhongMaterial({
    color: outfit.wrapColor,
    specular: 0x222211,
    shininess: 10,
    flatShading: true,
  }))
  wristWrapL.name = 'wristWrapL'
  armL.add(wristWrapL)

  const wristWrapGeoR = new THREE.BoxGeometry(armW + 0.03, 0.08 * s, armD + 0.03)
  wristWrapGeoR.translate(0, -sleeveH, 0)
  const wristWrapR = new THREE.Mesh(wristWrapGeoR, new THREE.MeshPhongMaterial({
    color: outfit.wrapColor,
    specular: 0x222211,
    shininess: 10,
    flatShading: true,
  }))
  wristWrapR.name = 'wristWrapR'
  armR.add(wristWrapR)

  // --- LEGS (upper pants + lower boots) ---
  const legCenter = legH / 2
  const legXOffset = (p.legPxW / 2 + 0.15) * U // Slight gap between legs

  // Full leg mesh in pants color
  const legL = texturedBox(legW, legH, legD, pantsColor, 'legL')
  legL.position.set(-legXOffset, legCenter, 0)
  character.add(legL)

  const legR = texturedBox(legW, legH, legD, pantsColor, 'legR')
  legR.position.set(legXOffset, legCenter, 0)
  character.add(legR)

  // BOOTS — cover lower 35% of each leg (darker, extends outward slightly)
  const bootH = legH * 0.35
  const bootY = bootH / 2 // Centered on lower leg

  const bootL = texturedBox(legW + 0.04, bootH, legD + 0.04, outfit.bootColor, 'bootL')
  bootL.position.set(-legXOffset, bootY, 0)
  character.add(bootL)

  const bootR = texturedBox(legW + 0.04, bootH, legD + 0.04, outfit.bootColor, 'bootR')
  bootR.position.set(legXOffset, bootY, 0)
  character.add(bootR)

  // Boot top band — accent strip at top of each boot
  const bootBandL = box(legW + 0.06, 0.06 * s, legD + 0.06, outfit.beltColor, 'bootBandL')
  bootBandL.position.set(-legXOffset, bootH, 0)
  character.add(bootBandL)

  const bootBandR = box(legW + 0.06, 0.06 * s, legD + 0.06, outfit.beltColor, 'bootBandR')
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

  const skinParts = ['head', 'armL', 'armR']
  for (const name of skinParts) {
    const mesh = character.getObjectByName(name) as THREE.Mesh | undefined
    if (mesh) {
      // Handle both single material and material array (texturedBox creates arrays)
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
    const U = headGeo.parameters.width / 8
    // headY = 0 because hair is a child of headGroup (local space)
    const hairGroup = buildHair(features.hairStyle, features.hairLength, hairMat, 0, U)
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
