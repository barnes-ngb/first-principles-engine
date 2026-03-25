// ── XP Ledger (cumulative XP tracking) ────────────────────────

export interface XpLedgerSources {
  routines: number
  quests: number
  books: number
}

export interface XpLedger {
  childId: string
  totalXp: number
  sources: XpLedgerSources
  lastUpdatedAt: string
  /** Present on per-event docs (doc ID: {childId}_{dedupKey}). Absent on cumulative docs. */
  dedupKey?: string
  /** XP event type (per-event docs only). */
  type?: string
  /** XP amount for this single event (per-event docs only). */
  amount?: number
  /** Optional metadata (per-event docs only). */
  meta?: Record<string, string>
  /** ISO timestamp of when XP was awarded (per-event docs only). */
  awardedAt?: string
}

// ── Avatar + Armor of God ─────────────────────────────────────────

export type ArmorPiece =
  | 'belt_of_truth'
  | 'breastplate_of_righteousness'
  | 'shoes_of_peace'
  | 'shield_of_faith'
  | 'helmet_of_salvation'
  | 'sword_of_the_spirit'

/** Simplified armor piece ID used by the 3D voxel system */
export type VoxelArmorPieceId = 'belt' | 'breastplate' | 'shoes' | 'shield' | 'helmet' | 'sword'

export type ArmorTier = 'stone' | 'diamond' | 'netherite'       // Lincoln
export type PlatformerTier = 'basic' | 'powerup' | 'champion'  // London

/** Character features extracted from a photo by AI vision */
export interface CharacterFeatures {
  skinTone: string       // Hex color extracted from photo
  hairColor: string      // Hex color extracted from photo
  hairStyle: 'short' | 'medium' | 'long' | 'curly'
  hairLength: 'above_ear' | 'ear_length' | 'shoulder' | 'below_shoulder'
  eyeColor?: string
  distinguishingFeatures?: string
}

export const DEFAULT_CHARACTER_FEATURES: CharacterFeatures = {
  skinTone: '#F0D0B0',
  hairColor: '#7B5B3A',
  hairStyle: 'medium',
  hairLength: 'ear_length',
  eyeColor: '#5B7B8A',
}

/** Lincoln-specific features (fair skin, medium brown hair past ears) */
export const LINCOLN_FEATURES: CharacterFeatures = {
  skinTone: '#F5D6B8',    // Fair/peachy — light warm beige
  hairColor: '#6B4C32',   // Medium warm brown
  hairStyle: 'medium',
  hairLength: 'ear_length',
  eyeColor: '#4A6B7A',    // Blue-gray
}

/** London-specific features */
export const LONDON_FEATURES: CharacterFeatures = {
  skinTone: '#F0D0B0',
  hairColor: '#8B6914',
  hairStyle: 'short',
  hairLength: 'above_ear',
  eyeColor: '#5B7B8A',
}

/** Maps full ArmorPiece IDs to simplified voxel piece IDs */
export const ARMOR_PIECE_TO_VOXEL: Record<ArmorPiece, VoxelArmorPieceId> = {
  belt_of_truth: 'belt',
  breastplate_of_righteousness: 'breastplate',
  shoes_of_peace: 'shoes',
  shield_of_faith: 'shield',
  helmet_of_salvation: 'helmet',
  sword_of_the_spirit: 'sword',
}

/** Maps simplified voxel piece IDs back to full ArmorPiece IDs */
export const VOXEL_TO_ARMOR_PIECE: Record<VoxelArmorPieceId, ArmorPiece> = {
  belt: 'belt_of_truth',
  breastplate: 'breastplate_of_righteousness',
  shoes: 'shoes_of_peace',
  shield: 'shield_of_faith',
  helmet: 'helmet_of_salvation',
  sword: 'sword_of_the_spirit',
}

export const ARMOR_PIECES: {
  id: ArmorPiece
  name: string
  scripture: string
  verseText: string
  xpToUnlockStone: number
  xpToUnlockDiamond: number   // 0 = unlocked by tier upgrade, not XP
  xpToUnlockNetherite: number // 0 = unlocked by tier upgrade, not XP
  lincolnStonePrompt: string
  lincolnDiamondPrompt: string
  lincolnNetheritePrompt: string
  londonBasicPrompt: string
  londonPowerupPrompt: string
  londonChampionPrompt: string
}[] = [
  {
    id: 'belt_of_truth',
    name: 'Belt of Truth',
    scripture: 'Ephesians 6:14',
    verseText: 'Stand firm then, with the belt of truth buckled around your waist.',
    xpToUnlockStone: 0,
    xpToUnlockDiamond: 0,
    xpToUnlockNetherite: 0,
    lincolnStonePrompt: 'a simple stone-textured belt with a plain iron buckle, pixel art style, no background, transparent PNG, item only',
    lincolnDiamondPrompt: 'a glowing diamond-encrusted belt with a golden cross buckle, pixel art style, no background, transparent PNG, item only',
    lincolnNetheritePrompt: 'a dark obsidian belt with glowing purple runes and dark-metal buckle, pixel art style, no background, transparent PNG, item only',
    londonBasicPrompt: 'a simple colorful ribbon belt with a small bow, cute cartoon style, no background, transparent PNG, item only',
    londonPowerupPrompt: 'a bright glowing sash belt with sparkles, cute cartoon platformer style, no background, transparent PNG, item only',
    londonChampionPrompt: 'a shimmering rainbow belt with a star buckle and golden trim, cute cartoon style, no background, transparent PNG, item only',
  },
  {
    id: 'breastplate_of_righteousness',
    name: 'Breastplate of Righteousness',
    scripture: 'Ephesians 6:14',
    verseText: 'With the breastplate of righteousness in place.',
    xpToUnlockStone: 150,
    xpToUnlockDiamond: 0,
    xpToUnlockNetherite: 0,
    lincolnStonePrompt: 'a simple stone chest plate with a carved cross, pixel art style, no background, transparent PNG, item only',
    lincolnDiamondPrompt: 'a shining diamond chest plate with a glowing cross emblem, pixel art style, no background, transparent PNG, item only',
    lincolnNetheritePrompt: 'a dark obsidian chest plate with glowing purple cross and dark-metal trim, pixel art style, no background, transparent PNG, item only',
    londonBasicPrompt: 'a simple colorful heart-shaped chest piece, cute cartoon style, no background, transparent PNG, item only',
    londonPowerupPrompt: 'a bright shining chest piece with a heart and sparkles, cute cartoon platformer style, no background, transparent PNG, item only',
    londonChampionPrompt: 'a golden champion chest plate with rainbow heart and star accents, cute cartoon style, no background, transparent PNG, item only',
  },
  {
    id: 'shoes_of_peace',
    name: 'Shoes of Peace',
    scripture: 'Ephesians 6:15',
    verseText: 'And with your feet fitted with the readiness that comes from the gospel of peace.',
    xpToUnlockStone: 300,
    xpToUnlockDiamond: 0,
    xpToUnlockNetherite: 0,
    lincolnStonePrompt: 'simple stone boots with iron soles, pixel art style, no background, transparent PNG, item only',
    lincolnDiamondPrompt: 'diamond-tipped boots with a soft glowing trail beneath them, pixel art style, no background, transparent PNG, item only',
    lincolnNetheritePrompt: 'dark obsidian boots with glowing purple soles and dark metal spikes, pixel art style, no background, transparent PNG, item only',
    londonBasicPrompt: 'simple colorful sneakers with a small bow, cute cartoon style, no background, transparent PNG, item only',
    londonPowerupPrompt: 'winged sneakers with a sparkle trail, cute cartoon platformer style, no background, transparent PNG, item only',
    londonChampionPrompt: 'golden winged boots with rainbow sparkle trail and star laces, cute cartoon style, no background, transparent PNG, item only',
  },
  {
    id: 'shield_of_faith',
    name: 'Shield of Faith',
    scripture: 'Ephesians 6:16',
    verseText: 'Take up the shield of faith, with which you can extinguish all the flaming arrows of the evil one.',
    xpToUnlockStone: 500,
    xpToUnlockDiamond: 0,
    xpToUnlockNetherite: 0,
    lincolnStonePrompt: 'a simple stone shield with a carved cross, pixel art style, no background, transparent PNG, item only',
    lincolnDiamondPrompt: 'a large diamond shield with a glowing cross and rays of light, pixel art style, no background, transparent PNG, item only',
    lincolnNetheritePrompt: 'a dark obsidian shield with glowing purple cross and dark-metal border, pixel art style, no background, transparent PNG, item only',
    londonBasicPrompt: 'a small round colorful shield with a heart, cute cartoon style, no background, transparent PNG, item only',
    londonPowerupPrompt: 'a bright rainbow round shield with a shining cross, cute cartoon platformer style, no background, transparent PNG, item only',
    londonChampionPrompt: 'a golden champion shield with rainbow cross and star accents, cute cartoon style, no background, transparent PNG, item only',
  },
  {
    id: 'helmet_of_salvation',
    name: 'Helmet of Salvation',
    scripture: 'Ephesians 6:17',
    verseText: 'Take the helmet of salvation.',
    xpToUnlockStone: 750,
    xpToUnlockDiamond: 0,
    xpToUnlockNetherite: 0,
    lincolnStonePrompt: 'a simple stone helmet with iron visor, pixel art style, no background, transparent PNG, item only',
    lincolnDiamondPrompt: 'a gleaming diamond helmet with glowing visor, pixel art style, no background, transparent PNG, item only',
    lincolnNetheritePrompt: 'a dark obsidian helmet with glowing purple visor and dark-metal crown, pixel art style, no background, transparent PNG, item only',
    londonBasicPrompt: 'a simple colorful round helmet with a small star on top, cute cartoon style, no background, transparent PNG, item only',
    londonPowerupPrompt: 'a bright crown-helmet with sparkles and a glowing star, cute cartoon platformer style, no background, transparent PNG, item only',
    londonChampionPrompt: 'a golden champion crown-helmet with rainbow star and gem accents, cute cartoon style, no background, transparent PNG, item only',
  },
  {
    id: 'sword_of_the_spirit',
    name: 'Sword of the Spirit',
    scripture: 'Ephesians 6:17',
    verseText: 'And the sword of the Spirit, which is the word of God.',
    xpToUnlockStone: 1000,
    xpToUnlockDiamond: 0,
    xpToUnlockNetherite: 0,
    lincolnStonePrompt: 'a simple stone sword with a plain iron hilt, pixel art style, no background, transparent PNG, item only',
    lincolnDiamondPrompt: 'a glowing diamond sword with scripture etched on the blade, pixel art style, no background, transparent PNG, item only',
    lincolnNetheritePrompt: 'a dark obsidian sword glowing purple with scripture runes on the blade, pixel art style, no background, transparent PNG, item only',
    londonBasicPrompt: 'a small colorful magic wand with a star tip, cute cartoon style, no background, transparent PNG, item only',
    londonPowerupPrompt: 'a glowing magic wand-sword with sparkles and a rainbow trail, cute cartoon platformer style, no background, transparent PNG, item only',
    londonChampionPrompt: 'a golden champion wand-sword with rainbow sparkles and gem-studded hilt, cute cartoon style, no background, transparent PNG, item only',
  },
]

export const XP_EVENTS = {
  QUEST_DIAMOND: 2,             // already wired in quest system
  CHECKLIST_DAY_COMPLETE: 10,   // all must-do items checked off
  BOOK_READ: 15,                // reading session logged on book close
  EVALUATION_COMPLETE: 25,      // full evaluation chat completed
  ARMOR_DAILY_COMPLETE: 5,      // all earned pieces applied today
  MANUAL_AWARD: 0,              // parent-awarded XP (amount varies)
} as const

export interface ArmorPieceProgress {
  pieceId: ArmorPiece
  /** Lincoln/Minecraft tiers unlocked */
  unlockedTiers: ArmorTier[]
  /** London/Platformer tiers unlocked */
  unlockedTiersPlatformer?: PlatformerTier[]
  generatedImageUrls: {
    stone?: string
    diamond?: string
    netherite?: string
    basic?: string
    powerup?: string
    champion?: string
  }
}

export interface AvatarProfile {
  childId: string
  themeStyle: 'minecraft' | 'platformer'
  /** One entry per piece, grows as pieces are unlocked */
  pieces: ArmorPieceProgress[]
  currentTier: ArmorTier | PlatformerTier

  // ── 3D Voxel system fields ────────────────────────────────────
  /** Character features extracted from photo by AI vision */
  characterFeatures?: CharacterFeatures
  /** Body proportions template: older (Lincoln, 10) or younger (London, 6) */
  ageGroup?: 'older' | 'younger'
  /** Original uploaded photo URL (kept for re-extraction) */
  photoUrl?: string
  /** Which armor pieces are currently shown on the 3D character */
  equippedPieces?: string[]
  /** Last piece animated (to not re-animate on page load) */
  lastEquipAnimation?: string
  /** AI-generated Minecraft skin face URL (cached to avoid regenerating) */
  skinTextureUrl?: string
  /** Timestamp when skin texture was last generated */
  skinTextureGeneratedAt?: string

  // ── Legacy 2D fields (kept for migration, may be undefined) ───
  /** @deprecated Use characterFeatures + 3D voxel renderer instead */
  baseCharacterUrl?: string
  /** @deprecated Use characterFeatures + 3D voxel renderer instead */
  photoTransformUrl?: string
  /** @deprecated No longer used — armor is 3D geometry */
  armorSheetUrls?: Partial<Record<string, string>>
  /** @deprecated No longer used — armor is 3D geometry */
  armorReferenceUrls?: Partial<Record<string, string>>
  /** @deprecated No longer used — armor is 3D geometry */
  croppedRegionUrls?: Partial<Record<ArmorPiece, string>>

  /** Armor pieces unlocked by XP (voxel piece IDs) */
  unlockedPieces?: string[]

  totalXp: number   // cached from xpLedger for quick reads
  updatedAt: string
}

/**
 * Maps each armor piece to its 0-indexed position in the 3×2 sheet image.
 * Order (left-to-right, top-to-bottom): belt, breastplate, shoes, shield, helmet, sword.
 */
export const ARMOR_PIECE_SHEET_INDEX: Record<ArmorPiece, number> = {
  belt_of_truth: 0,
  breastplate_of_righteousness: 1,
  shoes_of_peace: 2,
  shield_of_faith: 3,
  helmet_of_salvation: 4,
  sword_of_the_spirit: 5,
}

export interface DailyArmorSession {
  familyId: string
  childId: string
  date: string          // YYYY-MM-DD
  appliedPieces: ArmorPiece[]
  manuallyUnequipped?: string[]  // Voxel piece IDs the user intentionally removed today
  completedAt?: string  // ISO string — set when all earned pieces applied
}

/** Pixel-percentage positions for overlaying each piece on the base character image. */
export const PIECE_POSITIONS: Record<
  ArmorPiece,
  { topPct: number; leftPct: number; widthPct: number; heightPct: number }
> = {
  helmet_of_salvation:           { topPct: 2,  leftPct: 28, widthPct: 44, heightPct: 22 },
  breastplate_of_righteousness:  { topPct: 24, leftPct: 18, widthPct: 64, heightPct: 28 },
  belt_of_truth:                 { topPct: 50, leftPct: 22, widthPct: 56, heightPct: 12 },
  shoes_of_peace:                { topPct: 78, leftPct: 8,  widthPct: 84, heightPct: 20 },
  shield_of_faith:               { topPct: 28, leftPct: 2,  widthPct: 34, heightPct: 38 },
  sword_of_the_spirit:           { topPct: 28, leftPct: 64, widthPct: 34, heightPct: 42 },
}

/**
 * @deprecated Use XpLedger with dedupKey instead. Kept for migration compatibility.
 * Append-only log for XP dedup. Doc ID: {childId}_{dedupKey}
 */
export interface XpEventLogEntry {
  childId: string
  type: string
  amount: number
  dedupKey: string
  meta?: Record<string, string>
  awardedAt: string
}
