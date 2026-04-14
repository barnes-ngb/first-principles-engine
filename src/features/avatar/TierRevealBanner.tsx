import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

interface TierRevealBannerProps {
  tierName: string
  isLincoln: boolean
}

/**
 * Banner shown at the top of the armor gallery when a new tier has just been unlocked.
 * Visible until the kid forges at least one piece in the new tier (caller controls visibility).
 */
export default function TierRevealBanner({ tierName, isLincoln }: TierRevealBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  const capTier = tierName.charAt(0).toUpperCase() + tierName.slice(1)

  return (
    <Box
      onClick={() => setDismissed(true)}
      sx={{
        mx: 2,
        mb: 1.5,
        px: 2,
        py: 1.5,
        borderRadius: isLincoln ? '6px' : '14px',
        background: isLincoln
          ? 'linear-gradient(135deg, rgba(255,215,0,0.12) 0%, rgba(126,252,32,0.06) 100%)'
          : 'linear-gradient(135deg, rgba(156,39,176,0.1) 0%, rgba(232,160,191,0.05) 100%)',
        border: `1.5px solid ${isLincoln ? 'rgba(255,215,0,0.25)' : 'rgba(156,39,176,0.2)'}`,
        cursor: 'pointer',
        animation: 'revealSlideIn 0.5s ease-out',
        '@keyframes revealSlideIn': {
          from: { transform: 'translateY(-8px)', opacity: 0 },
          to: { transform: 'translateY(0)', opacity: 1 },
        },
      }}
    >
      <Typography
        sx={{
          fontFamily: titleFont,
          fontSize: isLincoln ? '12px' : '15px',
          fontWeight: 700,
          color: isLincoln ? '#FFD700' : '#7B1FA2',
          lineHeight: 1.4,
          mb: 0.5,
        }}
      >
        {'\u2728'} {capTier} Tier Unlocked
      </Typography>
      <Typography
        sx={{
          fontFamily: titleFont,
          fontSize: isLincoln ? '9px' : '12px',
          color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)',
          lineHeight: 1.4,
        }}
      >
        Stronger armor awaits. Each {capTier} piece replaces its {getPriorTierLabel(tierName)} counterpart.
      </Typography>
    </Box>
  )
}

function getPriorTierLabel(tier: string): string {
  const order = ['wood', 'stone', 'iron', 'gold', 'diamond', 'netherite']
  const idx = order.indexOf(tier)
  if (idx <= 0) return 'previous'
  const prior = order[idx - 1]
  return prior.charAt(0).toUpperCase() + prior.slice(1)
}
