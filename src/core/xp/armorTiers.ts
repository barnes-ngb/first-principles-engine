/**
 * Armor tier progression — derived from the voxel tier system (single source of truth).
 *
 * Thresholds match `src/features/avatar/voxel/tierMaterials.ts` TIERS exactly.
 * Legacy tier names (Leather, Chain) are removed; we now use the 6-tier
 * voxel system: Wood, Stone, Iron, Gold, Diamond, Netherite.
 */

import { TIERS } from '../../features/avatar/voxel/tierMaterials'

export const ArmorTier = {
  Wood: 'wood',
  Stone: 'stone',
  Iron: 'iron',
  Gold: 'gold',
  Diamond: 'diamond',
  Netherite: 'netherite',
} as const
export type ArmorTier = (typeof ArmorTier)[keyof typeof ArmorTier]

export interface ArmorTierInfo {
  tier: ArmorTier
  label: string
  /** Minecraft-themed player title */
  title: string
  /** Minimum cumulative XP to reach this tier */
  minXp: number
  /** Primary color of the armor */
  color: string
  /** Secondary/accent color */
  accent: string
  /** Number of armor pieces shown (0-4) */
  pieces: number
}

/**
 * Armor tiers in ascending order, derived from the voxel TIERS definition.
 */
export const ARMOR_TIERS: ArmorTierInfo[] = [
  {
    tier: ArmorTier.Wood,
    label: TIERS.WOOD.label + ' Armor',
    title: 'New Player',
    minXp: TIERS.WOOD.minXp,         // 0
    color: '#8B7332',                 // Warm golden-brown (wood)
    accent: '#6B5522',
    pieces: 0,
  },
  {
    tier: ArmorTier.Stone,
    label: TIERS.STONE.label + ' Armor',
    title: 'Survivor',
    minXp: TIERS.STONE.minXp,        // 100
    color: '#808080',                 // Stone gray
    accent: '#666666',
    pieces: 1,
  },
  {
    tier: ArmorTier.Iron,
    label: TIERS.IRON.label + ' Armor',
    title: 'Warrior',
    minXp: TIERS.IRON.minXp,         // 750
    color: '#C8C8C8',                 // Iron silver
    accent: '#A0A0A0',
    pieces: 2,
  },
  {
    tier: ArmorTier.Gold,
    label: TIERS.GOLD.label + ' Armor',
    title: 'Champion',
    minXp: TIERS.GOLD.minXp,         // 1500
    color: '#FCDB5B',                 // Gold yellow
    accent: '#DBA520',
    pieces: 3,
  },
  {
    tier: ArmorTier.Diamond,
    label: TIERS.DIAMOND.label + ' Armor',
    title: 'Diamond Scholar',
    minXp: TIERS.DIAMOND.minXp,      // 2500
    color: '#5DECF5',                 // Diamond cyan
    accent: '#2CB9C4',
    pieces: 4,
  },
  {
    tier: ArmorTier.Netherite,
    label: TIERS.NETHERITE.label + ' Armor',
    title: 'Netherite Legend',
    minXp: TIERS.NETHERITE.minXp,    // 5000
    color: '#44393B',                 // Netherite dark
    accent: '#6B575A',
    pieces: 4,
  },
]

/** Get the armor tier info for a given XP total. */
export function getArmorTier(xp: number): ArmorTierInfo {
  let result = ARMOR_TIERS[0]
  for (const tier of ARMOR_TIERS) {
    if (xp >= tier.minXp) {
      result = tier
    } else {
      break
    }
  }
  return result
}

/** Get XP progress toward the next tier (0-1 ratio). Returns 1 if at max tier. */
export function getNextTierProgress(xp: number): {
  current: ArmorTierInfo
  next: ArmorTierInfo | null
  progress: number
  xpToNext: number
} {
  const current = getArmorTier(xp)
  const currentIndex = ARMOR_TIERS.indexOf(current)
  const next = currentIndex < ARMOR_TIERS.length - 1
    ? ARMOR_TIERS[currentIndex + 1]
    : null

  if (!next) {
    return { current, next: null, progress: 1, xpToNext: 0 }
  }

  const range = next.minXp - current.minXp
  const earned = xp - current.minXp
  return {
    current,
    next,
    progress: Math.min(earned / range, 1),
    xpToNext: next.minXp - xp,
  }
}

/**
 * Skin-export hint: maps armor pieces to Minecraft skin regions.
 */
export const SKIN_REGIONS = {
  helmet:     { x: 0,  y: 0,  w: 32, h: 16 },
  chestplate: { x: 16, y: 20, w: 24, h: 12 },
  leggings:   { x: 0,  y: 20, w: 16, h: 12 },
  boots:      { x: 0,  y: 52, w: 16, h: 12 },
} as const
