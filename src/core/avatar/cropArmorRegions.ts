import type { ArmorPiece } from '../types'

// ── Body region crop definitions ─────────────────────────────────
// Tuned for a centered full-body character on 1024×1024.
// Character occupies roughly x: 25–75%, y: 5–95% of the image.

export interface ArmorRegion {
  pieceId: ArmorPiece
  /** Crop coordinates as percentage of image dimensions */
  topPct: number
  leftPct: number
  widthPct: number
  heightPct: number
}

export const ARMOR_REGIONS: ArmorRegion[] = [
  {
    pieceId: 'helmet_of_salvation',
    topPct: 0,
    leftPct: 10,
    widthPct: 80,
    heightPct: 28,
  },
  {
    pieceId: 'breastplate_of_righteousness',
    topPct: 22,
    leftPct: 5,
    widthPct: 90,
    heightPct: 28,
  },
  {
    pieceId: 'belt_of_truth',
    topPct: 42,
    leftPct: 10,
    widthPct: 80,
    heightPct: 14,
  },
  {
    pieceId: 'shoes_of_peace',
    topPct: 72,
    leftPct: 5,
    widthPct: 90,
    heightPct: 28,
  },
  {
    pieceId: 'shield_of_faith',
    topPct: 18,
    leftPct: 0,
    widthPct: 45,
    heightPct: 40,
  },
  {
    pieceId: 'sword_of_the_spirit',
    topPct: 10,
    leftPct: 55,
    widthPct: 45,
    heightPct: 50,
  },
]

/**
 * Crops a body region from the full armor reference image.
 * Returns a canvas data URL.
 * The result is BOTH the piece card thumbnail AND the overlay image.
 */
export async function cropArmorRegion(
  armorReferenceUrl: string,
  region: ArmorRegion,
  outputSize: number = 256,
): Promise<string> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = rej
    img.src = armorReferenceUrl
  })

  const srcX = (region.leftPct / 100) * img.naturalWidth
  const srcY = (region.topPct / 100) * img.naturalHeight
  const srcW = (region.widthPct / 100) * img.naturalWidth
  const srcH = (region.heightPct / 100) * img.naturalHeight

  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outputSize, outputSize)

  return canvas.toDataURL('image/png')
}

/**
 * Crops all 6 regions and returns a map of pieceId → data URL.
 */
export async function cropAllArmorRegions(
  armorReferenceUrl: string,
): Promise<Partial<Record<ArmorPiece, string>>> {
  const results: Partial<Record<ArmorPiece, string>> = {}
  await Promise.all(
    ARMOR_REGIONS.map(async (region) => {
      results[region.pieceId] = await cropArmorRegion(armorReferenceUrl, region)
    }),
  )
  return results
}
