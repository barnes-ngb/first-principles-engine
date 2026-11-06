/**
 * What a saved hero LOOKS like, as validated data — no drawing, no React.
 *
 * ── What this is for ─────────────────────────────────────────────────────────
 *
 * The town page shows the child's own saved character standing in their village.
 * The hub's renderer cannot be reused for that: `VoxelCharacter`,
 * `AvatarThumbnail`, `buildCharacter` and `tierMaterials` are all Three.js /
 * WebGL, and the town page is deliberately held to "no 3D renderer on this
 * route" (`stonebridgeDestinations.test.tsx` asserts the import list). So the
 * appearance is re-derived here from the SAME saved fields the hub reads, as
 * plain validated values, and `StonebridgeHero` draws them as flat SVG.
 *
 * ── Fidelity, stated rather than implied ─────────────────────────────────────
 *
 * This is a **simplified 2D paper-doll of the saved record**, not a reproduction
 * of the 3D character. What it honours: skin / hair / eye colours, `hairStyle`
 * AND `hairLength`, the saved outfit colours, the equipped pieces **each at its
 * own forged tier** (`getPieceForgedTier`, the hub's own pure helper), per-piece
 * armor dyes, a saved cape colour, the shield emblem and the helmet crest.
 * What it does NOT honour, and does not claim to: `CharacterProportions` (the
 * figure is one fixed build), accessories (`ACCESSORIES` — glasses, wings,
 * parrot and the rest are absent), the voxel materials' shine / emissive /
 * texture work, the optional AI face texture and the uploaded photo. A
 * `faceGrid` IS used when a valid one is saved, as 64 flat cells.
 *
 * Nothing here fetches anything. `photoUrl`, `skinTextureUrl` and
 * `generatedImageUrls` are never read, so no live photo or texture can reach the
 * village, and no image is generated. Every colour that IS read is validated to
 * a plain hex literal first, so a stored `url(...)`, a `var(...)` or any other
 * CSS function can neither be painted nor fetched.
 */
import { ALL_ARMOR_VOXEL_PIECES, getPieceForgedTier } from '../armorTierProgress'
import type {
  ArmorTier,
  AvatarProfile,
  CharacterFeatures,
  HelmetCrest,
  ShieldEmblem,
  VoxelArmorPieceId,
} from '../../../core/types'

/** Hex colours only — `#rgb` or `#rrggbb`. Everything else is refused. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * A stored colour, or `null` if it is not one.
 *
 * Deliberately a whitelist of two literal shapes rather than a blacklist of
 * dangerous ones: a stored value reaches an SVG `fill`, and `url(#x)`,
 * `url(https://…)`, `var(--x)` and `image-set(…)` are all things a browser would
 * try to RESOLVE from a paint server or the network. A hex literal cannot
 * resolve to anything, so refusing everything else is the whole guard. Named
 * CSS colours are refused too — they are safe, but they are not what the
 * customizer writes, and the narrower rule is the one that cannot be wrong.
 */
export function safeHexColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  return HEX.test(value) ? value : null
}

/** The documented shared defaults — used for a REAL owned document's gaps. */
export const HERO_VISUAL_DEFAULTS = {
  skin: '#F0D0B0',
  hair: '#7B5B3A',
  eyes: '#5B7B8A',
  shirt: '#4E7FBF',
  pants: '#3B4C63',
  shoes: '#5A4632',
} as const

/** The 2D palette, scoped to this feature. No material or renderer is imported. */
export const HERO_TIER_PAINT: Record<ArmorTier, { base: string; edge: string }> = {
  wood: { base: '#9b6b3f', edge: '#6b4526' },
  stone: { base: '#a9a9a9', edge: '#757575' },
  iron: { base: '#d9dde4', edge: '#949cab' },
  gold: { base: '#e9c155', edge: '#ad8620' },
  diamond: { base: '#7fe3df', edge: '#3a9f9d' },
  netherite: { base: '#4b4453', edge: '#272229' },
}

const TIERS = Object.keys(HERO_TIER_PAINT) as ArmorTier[]

export function isArmorTier(value: unknown): value is ArmorTier {
  return typeof value === 'string' && (TIERS as string[]).includes(value)
}

/** How many cells a saved pixel face has. Anything else is not a face. */
export const HERO_FACE_CELLS = 64

/**
 * A saved 8 × 8 face, row-major — or `null`.
 *
 * Validated whole: the length must be exactly {@link HERO_FACE_CELLS} and every
 * cell must be a safe colour, because a grid that is right in 63 places and
 * carries a `url(...)` in the 64th is not a usable face. There is no partial
 * acceptance and no per-cell substitution, so what is drawn is either the
 * child's saved face or the drawn one.
 */
export function readHeroFaceGrid(raw: unknown): readonly string[] | null {
  if (!Array.isArray(raw) || raw.length !== HERO_FACE_CELLS) return null
  const cells: string[] = []
  for (const cell of raw) {
    const colour = safeHexColor(cell)
    if (!colour) return null
    cells.push(colour)
  }
  return cells
}

/** One equipped piece, at the tier it was really forged at. */
export interface HeroPiecePaint {
  pieceId: VoxelArmorPieceId
  /** From `getPieceForgedTier` — the piece's OWN tier, never the suit's. */
  tier: ArmorTier
  base: string
  edge: string
  /** The child dyed this piece, so `base` is their colour and not the tier's. */
  dyed: boolean
}

export interface HeroAppearance {
  skin: string
  hair: string
  hairStyle: CharacterFeatures['hairStyle']
  hairLength: CharacterFeatures['hairLength']
  eyes: string
  shirt: string
  pants: string
  shoes: string
  /** Only when a cape colour was saved — a cape is never invented. */
  cape: string | null
  /** A validated saved face, or `null` for the drawn one. */
  faceGrid: readonly string[] | null
  /** EQUIPPED pieces only, in a stable order. Forged-but-unequipped is absent. */
  pieces: readonly HeroPiecePaint[]
  /** Shown on the shield, and only when the shield is equipped. */
  shieldEmblem: ShieldEmblem | null
  /** Shown on the helmet, and only when the helmet is equipped. */
  helmetCrest: HelmetCrest | null
  /**
   * Fields this appearance had to fall back on, by name.
   *
   * Honesty rather than decoration: a real owned document that saved no
   * `characterFeatures` (a legacy profile) is still that child's hero, and it is
   * drawn with {@link HERO_VISUAL_DEFAULTS} — but the surface should be able to
   * say so rather than implying the colours are theirs. `'features'` means the
   * whole feature block was absent.
   */
  defaulted: readonly string[]
}

export interface HeroAppearanceInput {
  /** A profile from a document proven owned by its PATH. */
  profile: AvatarProfile
  /**
   * Did the stored document carry its own `characterFeatures`?
   *
   * The normalizer fills defaults for a missing block, which is the right
   * behaviour and loses the one fact this needs: the read reports it separately
   * so a legacy document can be drawn with shared defaults *and say so*.
   */
  hasSavedFeatures: boolean
}

/**
 * The feature colours, whose absence is already reported as `'features'`.
 *
 * A legacy document with no feature block would otherwise report four
 * fallbacks for one fact.
 */
const FEATURE_FIELDS = new Set(['skinTone', 'hairColor', 'eyeColor'])

/**
 * The saved record, as validated appearance.
 *
 * Pure: same input, same output, no clock, no storage, no network. Every colour
 * goes through {@link safeHexColor} and falls back to the documented shared
 * default when it does not pass — so an unsafe stored value is neither rendered
 * nor fetched, and the figure still has a silhouette.
 */
export function buildHeroAppearance({
  profile,
  hasSavedFeatures,
}: HeroAppearanceInput): HeroAppearance {
  const defaulted: string[] = []
  const features = profile.characterFeatures
  if (!hasSavedFeatures) defaulted.push('features')

  const pick = (raw: unknown, fallback: string, name: string): string => {
    const colour = safeHexColor(raw)
    if (colour) return colour
    if (hasSavedFeatures || !FEATURE_FIELDS.has(name)) defaulted.push(name)
    return fallback
  }

  const custom = profile.customization
  const equipped = new Set(profile.equippedPieces ?? [])
  const dyes = custom?.armorColors
  const pieces: HeroPiecePaint[] = []
  // Canonical order, not the stored array's: the drawing layers from the body
  // outwards, and a stored order is not a fact about the child.
  for (const pieceId of ALL_ARMOR_VOXEL_PIECES) {
    if (!equipped.has(pieceId)) continue
    // The piece's own forged tier. The fallback is the helper's own `'wood'`
    // and NOT `profile.currentTier`, deliberately: painting every piece at the
    // suit's current tier is the exact thing this feature must not do, and a
    // legacy profile's equipped pieces really are the wood ones (that is what
    // `normalizeProfile`'s migration records).
    const forged = getPieceForgedTier(profile.forgedPieces, pieceId)
    const tier = isArmorTier(forged) ? forged : 'wood'
    const paint = HERO_TIER_PAINT[tier]
    const dye = safeHexColor(dyes?.[pieceId])
    pieces.push({
      pieceId,
      tier,
      base: dye ?? paint.base,
      edge: paint.edge,
      dyed: Boolean(dye),
    })
  }

  const wears = (pieceId: VoxelArmorPieceId) => pieces.some((p) => p.pieceId === pieceId)

  return {
    skin: pick(features?.skinTone, HERO_VISUAL_DEFAULTS.skin, 'skinTone'),
    hair: pick(features?.hairColor, HERO_VISUAL_DEFAULTS.hair, 'hairColor'),
    hairStyle: features?.hairStyle ?? 'medium',
    hairLength: features?.hairLength ?? 'ear_length',
    eyes: pick(features?.eyeColor, HERO_VISUAL_DEFAULTS.eyes, 'eyeColor'),
    shirt: pick(custom?.shirtColor, HERO_VISUAL_DEFAULTS.shirt, 'shirtColor'),
    pants: pick(custom?.pantsColor, HERO_VISUAL_DEFAULTS.pants, 'pantsColor'),
    shoes: pick(custom?.shoeColor, HERO_VISUAL_DEFAULTS.shoes, 'shoeColor'),
    cape: safeHexColor(custom?.capeColor),
    faceGrid: readHeroFaceGrid(profile.faceGrid),
    pieces,
    // An emblem or a crest is a property of a piece the child is WEARING. Drawn
    // for a piece that is not on the figure, it would be a decoration floating
    // where the armor is not.
    shieldEmblem: wears('shield') ? custom?.shieldEmblem ?? null : null,
    helmetCrest: wears('helmet') ? custom?.helmetCrest ?? null : null,
    defaulted,
  }
}
