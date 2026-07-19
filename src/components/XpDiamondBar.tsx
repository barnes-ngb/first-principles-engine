import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import { useXpLedger } from '../core/xp/useXpLedger'
import { useDiamondBalance } from '../core/xp/useDiamondBalance'
import { getCurrentTierLabel, getNextTier } from './xpTier'

interface XpDiamondBarProps {
  familyId: string
  childId: string
  compact?: boolean
  diamondBalanceOverride?: number | null
  /**
   * "Earning" presentation (opt-in, default off): show the current tier NAME
   * as identity instead of `XP {n}`, and hide the `→ {nextTier}` goal label.
   * The momentum fill and diamond count are unchanged. Default-off keeps every
   * existing caller (e.g. MyAvatarPage HUD) byte-identical.
   */
  earningMode?: boolean
}

/**
 * Compact XP progress bar + diamond balance HUD.
 * Minecraft-style aesthetic: green XP bar, cyan diamond icon.
 */
export default function XpDiamondBar({
  familyId,
  childId,
  compact,
  diamondBalanceOverride = null,
  earningMode = false,
}: XpDiamondBarProps) {
  const { totalXp, loading: xpLoading } = useXpLedger(familyId, childId)
  const { balance: diamondBalance, loading: diamondsLoading } = useDiamondBalance(familyId, childId)
  const displayedDiamondBalance = diamondBalanceOverride ?? diamondBalance

  const nextTier = getNextTier(totalXp)

  if (xpLoading || diamondsLoading) return null

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 1.5 : 2,
        px: compact ? 1 : 2,
        py: compact ? 0.5 : 1,
        borderRadius: '6px',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* XP Progress Bar */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
          <Typography
            sx={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: compact ? '9px' : '10px',
              color: '#4CAF50',
              lineHeight: 1,
            }}
          >
            {earningMode ? getCurrentTierLabel(totalXp) : `XP ${totalXp}`}
          </Typography>
          {!earningMode && nextTier && (
            <Typography
              sx={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: compact ? '8px' : '9px',
                color: 'rgba(255,255,255,0.4)',
                lineHeight: 1,
              }}
            >
              {'\u2192'} {nextTier.label}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            height: compact ? 6 : 8,
            borderRadius: '3px',
            bgcolor: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
            border: '1px solid rgba(76,175,80,0.2)',
          }}
        >
          <Box
            sx={{
              height: '100%',
              width: `${nextTier ? nextTier.progress * 100 : 100}%`,
              borderRadius: 'inherit',
              background: 'linear-gradient(90deg, #2E7D32 0%, #4CAF50 50%, #66BB6A 100%)',
              transition: 'width 0.5s ease',
              // Minecraft-style segmented look
              backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(0,0,0,0.15) 4px, rgba(0,0,0,0.15) 5px)',
            }}
          />
        </Box>
      </Box>

      {/* Diamond Count */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <Typography
          sx={{
            fontSize: compact ? '14px' : '16px',
            color: '#00BCD4',
            lineHeight: 1,
            filter: 'drop-shadow(0 0 4px rgba(0,188,212,0.4))',
          }}
        >
          {'\u25C6'}
        </Typography>
        <Typography
          key={displayedDiamondBalance}
          sx={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: compact ? '10px' : '12px',
            lineHeight: 1,
            fontWeight: 700,
            color: '#00BCD4',
            animation: 'diamondPulse 0.45s ease',
            '@keyframes diamondPulse': {
              '0%': { color: '#00BCD4', transform: 'scale(1)' },
              '50%': { color: '#4DD0E1', transform: 'scale(1.15)' },
              '100%': { color: '#00BCD4', transform: 'scale(1)' },
            },
          }}
        >
          {displayedDiamondBalance}
        </Typography>
      </Box>
    </Box>
  )
}
