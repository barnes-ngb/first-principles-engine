/**
 * Minecraft armor progression system for Lincoln.
 *
 * XP earned from daily routines maps to armor tiers. As Lincoln accumulates
 * lifetime XP, his avatar upgrades from Steve (no armor) all the way to
 * Netherite. Each tier also unlocks a Minecraft-themed title.
 *
 * The color values match actual Minecraft armor colors so that — in theory —
 * a skin builder could replicate the look in-game.
 */

export const ArmorTier = {
  None: 'none',
  Leather: 'leather',
  Chain: 'chain',
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
  /** Primary color of the armor (helmet/chestplate/leggings/boots) */
  color: string
  /** Secondary/accent color */
  accent: string
  /** Number of armor pieces shown (0-4: boots, leggings, chestplate, helmet) */
  pieces: number
}

/**
 * Armor tiers in ascending order. XP thresholds are designed so Lincoln
 * sees progress every few weeks of consistent work (~8-15 XP/day).
 */
export const ARMOR_TIERS: ArmorTierInfo[] = [
  {
    tier: ArmorTier.None,
    label: 'No Armor',
    title: 'New Player',
    minXp: 0,
    color: '#4A7A3A',      // Steve's shirt green
    accent: '#3B2A1A',     // Steve's hair brown
    pieces: 0,
  },
  {
    tier: ArmorTier.Leather,
    label: 'Leather Armor',
    title: 'Survivor',
    minXp: 50,
    color: '#A06540',      // Leather brown
    accent: '#8B5630',
    pieces: 1,             // boots only
  },
  {
    tier: ArmorTier.Chain,
    label: 'Chainmail Armor',
    title: 'Explorer',
    minXp: 150,
    color: '#8C8C8C',      // Chain gray
    accent: '#6B6B6B',
    pieces: 2,             // boots + leggings
  },
  {
    tier: ArmorTier.Iron,
    label: 'Iron Armor',
    title: 'Warrior',
    minXp: 350,
    color: '#C8C8C8',      // Iron silver
    accent: '#A0A0A0',
    pieces: 3,             // boots + leggings + chestplate
  },
  {
    tier: ArmorTier.Gold,
    label: 'Gold Armor',
    title: 'Champion',
    minXp: 600,
    color: '#FCDB5B',      // Gold yellow
    accent: '#DBA520',
    pieces: 4,             // full set
  },
  {
    tier: ArmorTier.Diamond,
    label: 'Diamond Armor',
    title: 'Diamond Scholar',
    minXp: 1000,
    color: '#5DECF5',      // Diamond cyan
    accent: '#2CB9C4',
    pieces: 4,
  },
  {
    tier: ArmorTier.Netherite,
    label: 'Netherite Armor',
    title: 'Netherite Legend',
    minXp: 1800,
    color: '#44393B',      // Netherite dark
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
 *
 * A Minecraft skin is a 64×64 PNG. These are the pixel regions for each
 * armor slot, useful if we ever want to generate an actual downloadable skin.
 */
export const SKIN_REGIONS = {
  helmet:     { x: 0,  y: 0,  w: 32, h: 16 }, // head overlay
  chestplate: { x: 16, y: 20, w: 24, h: 12 }, // body
  leggings:   { x: 0,  y: 20, w: 16, h: 12 }, // legs
  boots:      { x: 0,  y: 52, w: 16, h: 12 }, // feet
} as const
