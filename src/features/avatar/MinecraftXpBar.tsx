import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getNextTierProgress } from '../../core/xp/armorTiers'

/**
 * Minecraft-style experience bar.
 *
 * Looks like the in-game XP bar: a green progress strip inside a dark
 * container, with the XP level number displayed above in the classic
 * green glow style.
 */

interface MinecraftXpBarProps {
  /** Total cumulative XP */
  totalXp: number
  /** Today's XP (shown as "+N today") */
  todayXp?: number
  /** Compact mode (smaller text, no labels) */
  compact?: boolean
}

export default function MinecraftXpBar({
  totalXp,
  todayXp,
  compact = false,
}: MinecraftXpBarProps) {
  const { current, next, progress, xpToNext } = getNextTierProgress(totalXp)
  const isMaxTier = !next

  return (
    <Stack spacing={compact ? 0.5 : 1} sx={{ width: '100%' }}>
      {/* Tier label + XP count */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="baseline"
      >
        <Typography
          sx={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: compact ? '12px' : '13px',
            color: current.color,
            textShadow: '1px 1px 0 rgba(0,0,0,0.3)',
          }}
        >
          {current.title}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="baseline">
          {todayXp !== undefined && todayXp > 0 && (
            <Typography
              sx={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '12px',
                color: '#7EFC20',
              }}
            >
              +{todayXp} today
            </Typography>
          )}
          <Typography
            sx={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: compact ? '12px' : '13px',
              color: 'text.secondary',
            }}
          >
            {totalXp} XP
          </Typography>
        </Stack>
      </Stack>

      {/* The XP bar itself */}
      <Box
        sx={{
          position: 'relative',
          height: compact ? 10 : 14,
          backgroundColor: '#1A1A1A',
          border: '2px solid #3A3A3A',
          borderRadius: 0,
          overflow: 'hidden',
          // Notch marks every 10%
          backgroundImage: `repeating-linear-gradient(
            90deg,
            transparent,
            transparent calc(10% - 1px),
            rgba(255,255,255,0.05) calc(10% - 1px),
            rgba(255,255,255,0.05) 10%
          )`,
        }}
      >
        {/* Fill */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${progress * 100}%`,
            background: isMaxTier
              ? 'linear-gradient(180deg, #B388FF 0%, #7C4DFF 50%, #651FFF 100%)'
              : `linear-gradient(180deg, #7EFC20 0%, #5BC010 50%, #3A8008 100%)`,
            transition: 'width 0.5s ease-out',
            // Pixel-art shimmer for max tier
            ...(isMaxTier
              ? {
                  animation: 'xp-shimmer 3s linear infinite',
                  backgroundSize: '200% 100%',
                  '@keyframes xp-shimmer': {
                    '0%': { backgroundPosition: '200% 0' },
                    '100%': { backgroundPosition: '-200% 0' },
                  },
                }
              : {}),
          }}
        />

        {/* XP level number overlay (centered) */}
        <Typography
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontFamily: '"Press Start 2P", monospace',
            fontSize: compact ? '12px' : '12px',
            color: '#7EFC20',
            textShadow: '0 0 4px rgba(0,0,0,0.8), 1px 1px 0 #000',
            lineHeight: 1,
          }}
        >
          LVL {ARMOR_TIERS_INDEX(current.tier)}
        </Typography>
      </Box>

      {/* Next tier hint */}
      {!compact && next && (
        <Typography
          sx={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '12px',
            color: 'text.secondary',
            textAlign: 'right',
          }}
        >
          {xpToNext} XP to {next.label}
        </Typography>
      )}
    </Stack>
  )
}

/** Simple index lookup for display level number */
function ARMOR_TIERS_INDEX(tier: string): number {
  const order = ['none', 'leather', 'chain', 'iron', 'gold', 'diamond', 'netherite']
  const idx = order.indexOf(tier)
  return idx >= 0 ? idx : 0
}
