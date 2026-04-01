import type {
  AccessoryId,
  ArmorColors,
  ArmorPieceProgress,
  ArmorTier,
  AvatarBackground,
  AvatarProfile,
  CharacterFeatures,
  CharacterProportions,
  HelmetCrest,
  OutfitCustomization,
  ShieldEmblem,
} from '../../core/types'
import { ACCESSORY_XP_THRESHOLDS, AvatarBackground as AvatarBackgroundValues, ShieldEmblem as ShieldEmblemValues, HelmetCrest as HelmetCrestValues } from '../../core/types'

/**
 * Normalize raw Firestore data into a safe AvatarProfile.
 * Every array field is guaranteed to be an array, every nullable field has a default.
 * Run this on EVERY profile read from Firestore.
 */
export function normalizeAvatarProfile(raw: unknown): AvatarProfile {
  if (!raw || typeof raw !== 'object') return createDefaultProfile()

  const r = raw as Record<string, unknown>

  return {
    childId: (r.childId as string) || '',
    themeStyle: (r.themeStyle as 'minecraft' | 'platformer') || 'minecraft',
    ageGroup: (r.ageGroup as 'older' | 'younger') || 'older',
    characterFeatures: normalizeFeatures(r.characterFeatures),
    totalXp: typeof r.totalXp === 'number' ? r.totalXp : 0,
    currentTier: (r.currentTier as ArmorTier) || 'stone',
    equippedPieces: Array.isArray(r.equippedPieces) ? r.equippedPieces : [],
    pieces: Array.isArray(r.pieces) ? r.pieces.map(normalizePiece) : [],
    unlockedPieces: Array.isArray(r.unlockedPieces) ? r.unlockedPieces : [],
    customization: normalizeCustomization(r.customization),
    photoUrl: (r.photoUrl as string) || undefined,
    skinTextureUrl: (r.skinTextureUrl as string) || undefined,
    skinTextureGeneratedAt: (r.skinTextureGeneratedAt as string) || undefined,
    faceGrid: Array.isArray(r.faceGrid) && r.faceGrid.length === 64
      ? (r.faceGrid as string[])
      : undefined,
    lastArmorEquipDate: (r.lastArmorEquipDate as string) || undefined,
    lastEquipAnimation: (r.lastEquipAnimation as string) || undefined,
    lastFullArmorDate: (r.lastFullArmorDate as string) || undefined,
    armorStreak: typeof r.armorStreak === 'number' ? r.armorStreak : 0,
    updatedAt: (r.updatedAt as string) || new Date().toISOString(),
    // Preserve legacy fields if present
    ...(r.baseCharacterUrl ? { baseCharacterUrl: r.baseCharacterUrl as string } : {}),
    ...(r.photoTransformUrl ? { photoTransformUrl: r.photoTransformUrl as string } : {}),
    ...(r.armorSheetUrls ? { armorSheetUrls: r.armorSheetUrls as Record<string, string> } : {}),
    ...(r.pendingTierUpgrade ? { pendingTierUpgrade: r.pendingTierUpgrade } : {}),
  } as AvatarProfile
}

function normalizeFeatures(raw: unknown): CharacterFeatures {
  if (!raw || typeof raw !== 'object') {
    return {
      skinTone: '#F5D6B8',
      hairColor: '#6B4C32',
      hairStyle: 'medium',
      hairLength: 'ear_length',
      eyeColor: '#4A6B7A',
    }
  }
  const f = raw as Record<string, unknown>
  return {
    skinTone: (f.skinTone as string) || '#F5D6B8',
    hairColor: (f.hairColor as string) || '#6B4C32',
    hairStyle: (f.hairStyle as CharacterFeatures['hairStyle']) || 'medium',
    hairLength: (f.hairLength as CharacterFeatures['hairLength']) || 'ear_length',
    eyeColor: (f.eyeColor as string) || '#4A6B7A',
    ...(f.distinguishingFeatures ? { distinguishingFeatures: f.distinguishingFeatures as string } : {}),
  }
}

function normalizePiece(raw: unknown): ArmorPieceProgress {
  if (!raw || typeof raw !== 'object') {
    return { pieceId: 'unknown' as ArmorPieceProgress['pieceId'], unlockedTiers: [], generatedImageUrls: {} }
  }
  const p = raw as Record<string, unknown>
  return {
    pieceId: (p.pieceId as ArmorPieceProgress['pieceId']) || ('unknown' as ArmorPieceProgress['pieceId']),
    unlockedTiers: Array.isArray(p.unlockedTiers) ? p.unlockedTiers : [],
    ...(p.unlockedTiersPlatformer != null
      ? { unlockedTiersPlatformer: Array.isArray(p.unlockedTiersPlatformer) ? p.unlockedTiersPlatformer : [] }
      : {}),
    generatedImageUrls: (p.generatedImageUrls as Record<string, string>) || {},
  }
}

function normalizeArmorColors(raw: unknown): ArmorColors | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const a = raw as Record<string, unknown>
  const result: ArmorColors = {}
  for (const key of ['belt', 'breastplate', 'shoes', 'shield', 'helmet', 'sword'] as const) {
    if (typeof a[key] === 'string') result[key] = a[key] as string
  }
  return Object.keys(result).length > 0 ? result : undefined
}

const VALID_EMBLEMS = new Set<string>(Object.values(ShieldEmblemValues))
const VALID_CRESTS = new Set<string>(Object.values(HelmetCrestValues))
const VALID_BACKGROUNDS = new Set<string>(Object.values(AvatarBackgroundValues))

function normalizeCustomization(raw: unknown): OutfitCustomization | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const c = raw as Record<string, unknown>
  const armorColors = normalizeArmorColors(c.armorColors)
  const shieldEmblem = typeof c.shieldEmblem === 'string' && VALID_EMBLEMS.has(c.shieldEmblem)
    ? (c.shieldEmblem as ShieldEmblem)
    : undefined
  const helmetCrest = typeof c.helmetCrest === 'string' && VALID_CRESTS.has(c.helmetCrest)
    ? (c.helmetCrest as HelmetCrest)
    : undefined
  const background = typeof c.background === 'string' && VALID_BACKGROUNDS.has(c.background)
    ? (c.background as AvatarBackground)
    : undefined
  const accessories = normalizeAccessories(c.accessories)
  const proportions = normalizeProportions(c.proportions)
  return {
    ...(c.shirtColor ? { shirtColor: c.shirtColor as string } : {}),
    ...(c.pantsColor ? { pantsColor: c.pantsColor as string } : {}),
    ...(c.shoeColor ? { shoeColor: c.shoeColor as string } : {}),
    ...(typeof c.capeColor === 'string' ? { capeColor: c.capeColor } : {}),
    ...(armorColors ? { armorColors } : {}),
    ...(shieldEmblem ? { shieldEmblem } : {}),
    ...(helmetCrest ? { helmetCrest } : {}),
    ...(background ? { background } : {}),
    ...(accessories.length > 0 ? { accessories } : {}),
    ...(proportions ? { proportions } : {}),
  }
}

const PROPORTION_KEYS: (keyof CharacterProportions)[] = [
  'headSize', 'torsoW', 'torsoH', 'torsoD', 'armW', 'armH', 'legW', 'legH', 'sleeveRatio', 'bootRatio', 'cape',
]

function normalizeProportions(raw: unknown): CharacterProportions | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const p = raw as Record<string, unknown>
  // Validate that at least one numeric proportion key exists
  const hasAny = PROPORTION_KEYS.some((k) => k in p)
  if (!hasAny) return undefined
  const result: Record<string, unknown> = {}
  for (const key of PROPORTION_KEYS) {
    if (key === 'cape') {
      result[key] = typeof p[key] === 'boolean' ? p[key] : true
    } else if (typeof p[key] === 'number' && isFinite(p[key] as number)) {
      result[key] = p[key]
    }
  }
  return Object.keys(result).length > 0 ? (result as unknown as CharacterProportions) : undefined
}

const VALID_ACCESSORY_IDS = new Set<string>(Object.keys(ACCESSORY_XP_THRESHOLDS))

function normalizeAccessories(raw: unknown): AccessoryId[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((id): id is AccessoryId => typeof id === 'string' && VALID_ACCESSORY_IDS.has(id))
}

function createDefaultProfile(): AvatarProfile {
  return {
    childId: '',
    themeStyle: 'minecraft',
    ageGroup: 'older',
    characterFeatures: {
      skinTone: '#F5D6B8',
      hairColor: '#6B4C32',
      hairStyle: 'medium',
      hairLength: 'ear_length',
      eyeColor: '#4A6B7A',
    },
    totalXp: 0,
    currentTier: 'stone',
    equippedPieces: [],
    pieces: [],
    unlockedPieces: [],
    updatedAt: new Date().toISOString(),
  }
}
