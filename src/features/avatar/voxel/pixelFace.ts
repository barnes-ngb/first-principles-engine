import * as THREE from 'three'

// ── Client-side pixel face from photo ────────────────────────────────

/**
 * Crop and pixelate a photo to an 8x8 Minecraft-style face texture.
 * Returns a 64x64 canvas with nearest-neighbor upscaling (crisp pixels).
 */
export async function generatePixelFace(photoUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onerror = () => reject(new Error('Failed to load photo'))
    img.onload = () => {
      // Crop to face region — center-top area of photo
      const srcW = img.width
      const srcH = img.height
      const faceSize = Math.min(srcW, srcH) * 0.5
      const cropX = (srcW - faceSize) / 2
      const cropY = srcH * 0.08

      // Pixelate to 8x8 — Minecraft face resolution
      const pixelCanvas = document.createElement('canvas')
      pixelCanvas.width = 8
      pixelCanvas.height = 8
      const pCtx = pixelCanvas.getContext('2d')!
      pCtx.imageSmoothingEnabled = false
      pCtx.drawImage(img, cropX, cropY, faceSize, faceSize, 0, 0, 8, 8)

      // Color quantize — reduce to Minecraft palette feel
      const imageData = pCtx.getImageData(0, 0, 8, 8)
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = Math.round(imageData.data[i] / 20) * 20
        imageData.data[i + 1] = Math.round(imageData.data[i + 1] / 20) * 20
        imageData.data[i + 2] = Math.round(imageData.data[i + 2] / 20) * 20
      }
      pCtx.putImageData(imageData, 0, 0)

      // Upscale to 64x64 with nearest-neighbor (crisp pixels)
      const finalCanvas = document.createElement('canvas')
      finalCanvas.width = 64
      finalCanvas.height = 64
      const fCtx = finalCanvas.getContext('2d')!
      fCtx.imageSmoothingEnabled = false
      fCtx.drawImage(pixelCanvas, 0, 0, 64, 64)

      resolve(finalCanvas)
    }
    img.src = photoUrl
  })
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

// ── Three-tier face generation strategy ─────────────────────────────

/**
 * Try to generate and apply a pixel face to the head mesh.
 * Strategy: client-side pixelation from photo URL (fast, no API cost).
 * AI generation would be called separately via Cloud Function.
 */
export async function applyPixelFaceFromPhoto(
  headMesh: THREE.Mesh,
  photoUrl: string,
  skinColor: number,
): Promise<boolean> {
  try {
    const pixelCanvas = await generatePixelFace(photoUrl)
    applyCanvasToHead(headMesh, pixelCanvas, skinColor)
    return true
  } catch (err) {
    console.warn('Pixelation failed, using solid color:', err)
    return false
  }
}
