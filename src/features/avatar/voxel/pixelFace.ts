import * as THREE from 'three'
import type { CharacterFeatures } from '../../../core/types'

// ── Face mesh names (3D features on the head) ────────────────────────

const FACE_MESH_NAMES = [
  'eyeWhiteL', 'eyeWhiteR', 'pupilL', 'pupilR',
  'mouth', 'nose', 'eyebrowL', 'eyebrowR',
  'cheekL', 'cheekR',
]

// ── Build a clean 8x8 Minecraft-style face from features ────────────

/**
 * Build a clean Minecraft-style 8x8 pixel face from extracted character features.
 * No photo pixelation — hand-painted grid using skin/hair/eye colors.
 * Returns a 64x64 canvas with nearest-neighbor upscaling (crisp pixels).
 */
export function buildPaintedFace(features: Partial<CharacterFeatures>): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  const ctx = canvas.getContext('2d')!

  const skin = features.skinTone || '#F5D6B8'
  const hair = features.hairColor || '#6B4C32'
  const eyeColor = features.eyeColor || '#3D5A6B'

  // Cheek color: skin blended with rosy pink
  const skinC = new THREE.Color(skin)
  const cheek = '#' + skinC.clone().lerp(new THREE.Color('#FFAAAA'), 0.15).getHexString()

  // Mouth: skin darkened 15%
  const mouth = '#' + skinC.clone().multiplyScalar(0.85).getHexString()

  // Nose shadow: very subtle darkening
  const noseShadow = '#' + skinC.clone().lerp(new THREE.Color('#000000'), 0.08).getHexString()

  // Mouth corners: hint of smile shape
  const mouthCorner = '#' + skinC.clone().lerp(new THREE.Color('#000000'), 0.05).getHexString()

  // Chin shadow: slight shadow under chin
  const chinShadow = '#' + skinC.clone().lerp(new THREE.Color('#000000'), 0.06).getHexString()

  // Build the face pixel by pixel — clean Minecraft style with more expression
  const grid = [
    // Row 0: hair
    [hair, hair, hair, hair, hair, hair, hair, hair],
    // Row 1: hair with slight skin showing (part)
    [hair, hair, hair, hair, hair, hair, hair, hair],
    // Row 2: forehead
    [hair, skin, skin, skin, skin, skin, skin, hair],
    // Row 3: eyes — bigger whites, colored pupils, slight gap between
    [skin, '#FFFFFF', eyeColor, skin, skin, '#FFFFFF', eyeColor, skin],
    // Row 4: nose + rosy cheeks
    [skin, cheek, skin, noseShadow, noseShadow, skin, cheek, skin],
    // Row 5: mouth — wider, slight smile shape
    [skin, skin, mouthCorner, mouth, mouth, mouthCorner, skin, skin],
    // Row 6: chin
    [skin, skin, skin, skin, skin, skin, skin, skin],
    // Row 7: chin bottom with subtle shadow
    [skin, skin, skin, chinShadow, chinShadow, skin, skin, skin],
  ]

  grid.forEach((row, y) => {
    row.forEach((color, x) => {
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
    })
  })

  // Upscale to 64x64 crisp
  const upscaled = document.createElement('canvas')
  upscaled.width = 64
  upscaled.height = 64
  const uctx = upscaled.getContext('2d')!
  uctx.imageSmoothingEnabled = false
  uctx.drawImage(canvas, 0, 0, 64, 64)

  return upscaled
}

// ── AI-generated face from color array ──────────────────────────────

/**
 * Render a 64-color hex array (8x8 grid) into a 64x64 canvas.
 */
export function renderColorArrayToCanvas(colors: string[]): HTMLCanvasElement {
  if (colors.length !== 64) {
    throw new Error(`Expected 64 colors, got ${colors.length}`)
  }

  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  const ctx = canvas.getContext('2d')!

  colors.forEach((hex, i) => {
    const x = i % 8
    const y = Math.floor(i / 8)
    ctx.fillStyle = hex
    ctx.fillRect(x, y, 1, 1)
  })

  // Upscale to 64x64 with nearest-neighbor
  const upscaled = document.createElement('canvas')
  upscaled.width = 64
  upscaled.height = 64
  const uctx = upscaled.getContext('2d')!
  uctx.imageSmoothingEnabled = false
  uctx.drawImage(canvas, 0, 0, 64, 64)

  return upscaled
}

// ── Apply canvas texture to head mesh ───────────────────────────────

/**
 * Apply a canvas as a texture on the front face of the head cube.
 * BoxGeometry face order: [+X, -X, +Y, -Y, +Z, -Z]
 * +Z is the front face (facing camera when character faces forward).
 */
export function applyCanvasToHead(
  headMesh: THREE.Mesh,
  canvas: HTMLCanvasElement,
  skinColor: number,
) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter // CRITICAL — keeps pixels crisp
  texture.minFilter = THREE.NearestFilter
  texture.needsUpdate = true

  const skinMat = new THREE.MeshLambertMaterial({ color: skinColor })
  const faceMat = new THREE.MeshLambertMaterial({ map: texture })

  // [+X right, -X left, +Y top, -Y bottom, +Z front, -Z back]
  headMesh.material = [
    skinMat, // right side
    skinMat, // left side
    skinMat, // top (hair covers)
    skinMat, // bottom (chin)
    faceMat, // front — THE PIXEL FACE
    skinMat, // back
  ]
}

// ── Hide 3D face meshes when texture is applied ─────────────────────

/**
 * Hide 3D face feature meshes (eyes, mouth, nose, eyebrows) to prevent
 * Z-fighting with the applied face texture.
 */
export function hideFaceMeshes(character: THREE.Group) {
  FACE_MESH_NAMES.forEach(name => {
    const mesh = character.getObjectByName(name)
    if (mesh) mesh.visible = false
  })
}

/**
 * Show 3D face feature meshes (for when no texture is applied).
 */
export function showFaceMeshes(character: THREE.Group) {
  FACE_MESH_NAMES.forEach(name => {
    const mesh = character.getObjectByName(name)
    if (mesh) mesh.visible = true
  })
}

// ── Apply AI-generated skin texture from URL ────────────────────────

/**
 * Load an AI-generated skin texture from a URL and apply it to the head mesh.
 * Uses NearestFilter for crisp Minecraft-style pixels.
 */
export async function applyAISkinToHead(
  headMesh: THREE.Mesh,
  skinImageUrl: string,
  skinColor: number,
): Promise<boolean> {
  try {
    const loader = new THREE.TextureLoader()
    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(skinImageUrl, resolve, undefined, reject)
    })

    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter

    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor })
    const faceMat = new THREE.MeshLambertMaterial({ map: texture })

    // [+X right, -X left, +Y top, -Y bottom, +Z front, -Z back]
    headMesh.material = [
      skinMat, // right
      skinMat, // left
      skinMat, // top (hair covers)
      skinMat, // bottom
      faceMat, // front — THE FACE
      skinMat, // back
    ]
    return true
  } catch {
    return false
  }
}

// ── Face generation strategy ────────────────────────────────────────

/**
 * Generate and apply a pixel face to the head mesh.
 * Strategy: painted face from extracted character features (clean, no API cost).
 * Falls back to default features if none provided.
 */
export function applyPaintedFace(
  headMesh: THREE.Mesh,
  character: THREE.Group,
  features: Partial<CharacterFeatures>,
  skinColor: number,
): void {
  const faceCanvas = buildPaintedFace(features)
  applyCanvasToHead(headMesh, faceCanvas, skinColor)
  hideFaceMeshes(character)
}

/**
 * Apply face texture to head mesh, trying AI skin first, then painted fallback.
 * Hides 3D face meshes when any texture is applied to prevent Z-fighting.
 */
export async function applyFaceWithAIFallback(
  headMesh: THREE.Mesh,
  character: THREE.Group,
  features: Partial<CharacterFeatures>,
  skinColor: number,
  skinTextureUrl?: string,
): Promise<void> {
  // Try AI skin texture first
  if (skinTextureUrl) {
    const applied = await applyAISkinToHead(headMesh, skinTextureUrl, skinColor)
    if (applied) {
      hideFaceMeshes(character)
      return
    }
  }

  // Fallback: painted face from features
  applyPaintedFace(headMesh, character, features, skinColor)
}
