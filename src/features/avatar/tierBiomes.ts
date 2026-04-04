/**
 * Biome names and descriptions for each armor tier.
 * Each tier maps to a Minecraft-like world/biome.
 */
export const TIER_BIOMES: Record<string, { name: string; description: string; bgTint: string }> = {
  wood:      { name: 'Stonebridge Village', description: 'Home base \u2014 where every journey begins', bgTint: 'rgba(139,115,50,0.08)' },
  stone:     { name: 'The Caves',           description: 'Deep underground \u2014 mine the stone, forge your armor', bgTint: 'rgba(128,128,128,0.08)' },
  iron:      { name: 'The Mountains',       description: 'Towering peaks \u2014 a fortress in the clouds', bgTint: 'rgba(200,200,200,0.08)' },
  gold:      { name: 'The Desert Temple',   description: 'Ancient mysteries \u2014 treasure beneath the sand', bgTint: 'rgba(252,219,91,0.06)' },
  diamond:   { name: 'The End',             description: 'Beyond the world \u2014 floating islands in the void', bgTint: 'rgba(93,236,245,0.06)' },
  netherite: { name: 'The Nether',          description: 'Fire and lava \u2014 the ultimate forge', bgTint: 'rgba(60,42,74,0.1)' },
}

/** Get the biome name for a tier, falling back to the tier label. */
export function getBiomeName(tier: string): string {
  return TIER_BIOMES[tier]?.name ?? tier
}

/** Get the ordered list of tier keys. */
export const TIER_ORDER = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite'] as const

/** Get the next tier after the given one, or null if at max. */
export function getNextTierKey(currentTier: string): string | null {
  const idx = TIER_ORDER.indexOf(currentTier as typeof TIER_ORDER[number])
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null
  return TIER_ORDER[idx + 1]
}
