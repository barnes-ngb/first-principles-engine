import { getFunctions, httpsCallable } from 'firebase/functions'

import { app } from '../../core/firebase/firebase'
import type { AvatarProfile } from '../../core/types'
import { renderColorArrayToCanvas, buildPaintedFace } from './voxel/pixelFace'

// ── Types ──────────────────────────────────────────────────────────

interface MinecraftFaceRequest {
  familyId: string
  childId: string
  photoBase64: string
  photoMimeType: string
}

interface MinecraftFaceResponse {
  faceGrid: string[]
}

// ── AI face generation (calls Cloud Function) ──────────────────────

const functions = getFunctions(app)
const generateMinecraftFaceFn = httpsCallable<MinecraftFaceRequest, MinecraftFaceResponse>(
  functions,
  'generateMinecraftFace',
  { timeout: 60_000 },
)

/**
 * Generate an AI pixel face from a child's photo via Cloud Function.
 * Returns a 64×64 upscaled canvas with crisp NearestFilter-ready pixels,
 * or null if generation fails.
 */
export async function generateAIFace(
  photoBase64: string,
  photoMimeType: string,
  familyId: string,
  childId: string,
): Promise<{ canvas: HTMLCanvasElement; faceGrid: string[] } | null> {
  try {
    const result = await generateMinecraftFaceFn({
      familyId,
      childId,
      photoBase64,
      photoMimeType,
    })

    const colors = result.data.faceGrid
    if (!Array.isArray(colors) || colors.length !== 64) {
      console.warn('AI face: expected 64 colors, got', colors?.length)
      return null
    }

    const canvas = renderColorArrayToCanvas(colors)
    return { canvas, faceGrid: colors }
  } catch (err) {
    console.warn('AI face generation failed:', err)
    return null
  }
}

// ── Face resolution with caching ───────────────────────────────────

/**
 * Resolve the best available face canvas for a profile.
 * Priority: cached faceGrid → painted face from features → null.
 *
 * AI generation is NOT triggered here (too expensive for thumbnails).
 * Call `generateAIFace` explicitly from the avatar admin page when a photo is uploaded.
 */
export function resolveFaceCanvas(
  profile: AvatarProfile,
): HTMLCanvasElement | null {
  // Strategy 1: cached AI face grid
  if (
    profile.faceGrid &&
    Array.isArray(profile.faceGrid) &&
    profile.faceGrid.length === 64
  ) {
    try {
      return renderColorArrayToCanvas(profile.faceGrid)
    } catch {
      // Fall through to painted face
    }
  }

  // Strategy 2: painted face from character features
  if (profile.characterFeatures) {
    try {
      return buildPaintedFace(profile.characterFeatures)
    } catch {
      return null
    }
  }

  return null
}
