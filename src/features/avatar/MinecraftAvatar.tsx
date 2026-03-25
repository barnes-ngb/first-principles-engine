import Box from '@mui/material/Box'
import type { ArmorTierInfo } from '../../core/xp/armorTiers'
import { ArmorTier, getArmorTier } from '../../core/xp/armorTiers'

/**
 * A CSS pixel-art Minecraft character (Steve) that displays armor
 * based on Lincoln's cumulative XP.
 *
 * The avatar is built entirely with CSS box-shadow pixel art so it
 * scales cleanly and needs no image assets. Each "pixel" is one
 * `px` unit scaled by the `scale` prop.
 *
 * Armor pieces appear in progression order:
 *   0 pieces → bare Steve
 *   1 piece  → boots
 *   2 pieces → boots + leggings
 *   3 pieces → boots + leggings + chestplate
 *   4 pieces → full set (+ helmet)
 */

interface MinecraftAvatarProps {
  /** Cumulative XP — determines armor tier */
  xp?: number
  /** Or pass tier info directly */
  tier?: ArmorTierInfo
  /** Pixel scale factor (default 3 = each "pixel" is 3×3 CSS px) */
  scale?: number
  /** Show title label below avatar */
  showTitle?: boolean
  /** Show armor tier label */
  showTier?: boolean
}

// Steve's skin colors
const SKIN = '#C69C6D'
const HAIR = '#3B2A1A'
const SHIRT = '#4A7A3A'
const PANTS = '#2B2B5E'
const SHOE = '#4A3728'
const WHITE = '#FFFFFF'
const PUPIL = '#2D5FAA'

/**
 * Generate the box-shadow pixel art string for a Minecraft character.
 * The character is 8px wide × 16px tall (like a Minecraft skin front view).
 */
function buildPixelArt(tierInfo: ArmorTierInfo): string {
  const { color: armor, accent: armorAccent, pieces } = tierInfo
  const hasBoots = pieces >= 1
  const hasLeggings = pieces >= 2
  const hasChestplate = pieces >= 3
  const hasHelmet = pieces >= 4

  // Each entry: [x, y, color]
  const pixels: [number, number, string][] = []

  // Helper
  const px = (x: number, y: number, c: string) => pixels.push([x, y, c])

  // ── Head (rows 0-3) ──
  // Row 0: hair top
  const helmetColor = hasHelmet ? armor : HAIR
  const helmetAccent = hasHelmet ? armorAccent : HAIR
  px(2, 0, helmetColor); px(3, 0, helmetColor); px(4, 0, helmetColor); px(5, 0, helmetColor)

  // Row 1: hair + face top
  px(1, 1, helmetColor); px(2, 1, helmetAccent); px(3, 1, SKIN); px(4, 1, SKIN)
  px(5, 1, helmetAccent); px(6, 1, helmetColor)

  // Row 2: face with eyes
  px(1, 2, hasHelmet ? armorAccent : HAIR)
  px(2, 2, SKIN); px(3, 2, WHITE); px(4, 2, WHITE); px(5, 2, SKIN)
  px(6, 2, hasHelmet ? armorAccent : SKIN)

  // Row 3: face bottom (mouth)
  px(1, 3, hasHelmet ? armorAccent : SKIN)
  px(2, 3, SKIN); px(3, 3, PUPIL); px(4, 3, PUPIL); px(5, 3, SKIN)
  px(6, 3, hasHelmet ? armorAccent : SKIN)

  // Row 4: chin
  px(2, 4, SKIN); px(3, 4, SKIN); px(4, 4, SKIN); px(5, 4, SKIN)

  // ── Body (rows 5-9) ──
  const bodyColor = hasChestplate ? armor : SHIRT
  const bodyAccent = hasChestplate ? armorAccent : SHIRT

  // Row 5: shoulders
  px(1, 5, bodyAccent); px(2, 5, bodyColor); px(3, 5, bodyColor)
  px(4, 5, bodyColor); px(5, 5, bodyColor); px(6, 5, bodyAccent)

  // Rows 6-8: torso + arms
  for (let y = 6; y <= 8; y++) {
    px(0, y, SKIN) // left arm (skin visible)
    px(1, y, bodyAccent)
    px(2, y, bodyColor); px(3, y, bodyColor); px(4, y, bodyColor); px(5, y, bodyColor)
    px(6, y, bodyAccent)
    px(7, y, SKIN) // right arm
  }

  // Row 9: waist
  px(2, 9, bodyAccent); px(3, 9, bodyColor); px(4, 9, bodyColor); px(5, 9, bodyAccent)

  // ── Legs (rows 10-13) ──
  const legColor = hasLeggings ? armor : PANTS
  const legAccent = hasLeggings ? armorAccent : PANTS

  for (let y = 10; y <= 13; y++) {
    px(2, y, legAccent); px(3, y, legColor); px(4, y, legColor); px(5, y, legAccent)
  }

  // ── Boots (rows 14-15) ──
  const bootColor = hasBoots ? armor : SHOE
  const bootAccent = hasBoots ? armorAccent : SHOE

  px(1, 14, bootAccent); px(2, 14, bootColor); px(3, 14, bootColor)
  px(4, 14, bootColor); px(5, 14, bootColor); px(6, 14, bootAccent)

  px(1, 15, bootAccent); px(2, 15, bootColor); px(3, 15, bootColor)
  px(4, 15, bootColor); px(5, 15, bootColor); px(6, 15, bootAccent)

  // Convert to box-shadow string
  return pixels
    .map(([x, y, c]) => `${x}px ${y}px 0 ${c}`)
    .join(',')
}

/** Enchantment shimmer for Diamond/Netherite tiers */
function hasEnchantGlow(tier: ArmorTier): boolean {
  return tier === ArmorTier.Diamond || tier === ArmorTier.Netherite
}

export default function MinecraftAvatar({
  xp = 0,
  tier,
  scale = 3,
  showTitle = false,
  showTier = false,
}: MinecraftAvatarProps) {
  const tierInfo = tier ?? getArmorTier(xp)
  const shadow = buildPixelArt(tierInfo)
  const enchanted = hasEnchantGlow(tierInfo.tier)

  // The pixel art is 8×16 "pixels"; rendered size = 8×scale by 16×scale
  const width = 8 * scale
  const height = 16 * scale

  return (
    <Box
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: `${width}px`,
          height: `${height}px`,
          // Enchantment glow for high tiers
          ...(enchanted
            ? {
                filter: 'drop-shadow(0 0 4px rgba(93,236,245,0.6))',
                animation: 'enchant-pulse 2s ease-in-out infinite',
                '@keyframes enchant-pulse': {
                  '0%, 100%': {
                    filter: 'drop-shadow(0 0 4px rgba(93,236,245,0.4))',
                  },
                  '50%': {
                    filter: 'drop-shadow(0 0 8px rgba(93,236,245,0.8))',
                  },
                },
              }
            : {}),
        }}
      >
        {/* The single 1×1 px element that casts all the pixel shadows */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '1px',
            height: '1px',
            boxShadow: shadow,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            imageRendering: 'pixelated',
          }}
        />
      </Box>

      {showTitle && (
        <Box
          sx={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '0.45rem',
            color: tierInfo.color,
            textShadow: '1px 1px 0 rgba(0,0,0,0.3)',
            textAlign: 'center',
            mt: 0.5,
          }}
        >
          {tierInfo.title}
        </Box>
      )}

      {showTier && (
        <Box
          sx={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '0.35rem',
            color: 'text.secondary',
            textAlign: 'center',
          }}
        >
          {tierInfo.label}
        </Box>
      )}
    </Box>
  )
}
