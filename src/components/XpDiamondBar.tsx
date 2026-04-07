import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import { useXpLedger } from '../core/xp/useXpLedger'
import { useDiamondBalance } from '../core/xp/useDiamondBalance'
import { TIERS } from '../features/avatar/voxel/tierMaterials'

interface XpDiamondBarProps {
  familyId: string
  childId: string
  compact?: boolean
  diamondBalanceOverride?: number | null
}

/** Compute next tier label and XP needed */
function getNextTier(totalXp: number): { label: string; xpNeeded: number; progress: number } | null {
  const tierEntries = Object.values(TIERS).sort((a, b) => a.minXp - b.minXp)
  for (let i = 0; i < tierEntries.length; i++) {
    if (totalXp < tierEntries[i].minXp) {
      const prev = i > 0 ? tierEntries[i - 1] : { minXp: 0, label: 'Start' }
      const range = tierEntries[i].minXp - prev.minXp
      const earned = totalXp - prev.minXp
      return {
        label: tierEntries[i].label,
        xpNeeded: tierEntries[i].minXp - totalXp,
        progress: range > 0 ? Math.min(earned / range, 1) : 1,
      }
    }
  }
  return null // Max tier reached
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
            XP {totalXp}
          </Typography>
          {nextTier && (
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
