import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { AvatarProfile } from '../../core/types'
import { calculateTier, getTierBadgeColor, getTierTextColor, TIERS } from './voxel/tierMaterials'
import { tierHasGlow } from './voxel/enchantmentGlow'
import { tierHasCape } from './voxel/buildCape'

interface AvatarHeroBannerProps {
  profile: AvatarProfile
  displayXp: number
  isLincoln: boolean
  isChildProfile: boolean
  childName: string | undefined
  childCount: number
  accentColor: string
}

export default function AvatarHeroBanner({
  profile,
  displayXp,
  isLincoln,
  isChildProfile,
  childName,
  childCount,
  accentColor,
}: AvatarHeroBannerProps) {
  const currentTierName = calculateTier(profile.totalXp)
  const tierEntries = Object.entries(TIERS)
  const currentTierIdx = tierEntries.findIndex(([k]) => k === currentTierName)
  const tierMinXp = TIERS[currentTierName]?.minXp ?? 0
  const nextTierEntry = currentTierIdx < tierEntries.length - 1 ? tierEntries[currentTierIdx + 1] : null
  const tierMaxXp = nextTierEntry ? nextTierEntry[1].minXp : tierMinXp + 1000
  const tierRange = tierMaxXp - tierMinXp
  const xpInTier = profile.totalXp - tierMinXp
  const tierProgress = tierRange > 0 ? Math.min((xpInTier / tierRange) * 100, 100) : 100

  return (
    <Box
      sx={{
        mx: 1,
        px: 2,
        py: 2,
        borderRadius: isLincoln ? '8px' : '18px',
        background: isLincoln
          ? 'linear-gradient(135deg, rgba(20,22,36,0.95) 0%, rgba(26,36,56,0.95) 100%)'
          : 'linear-gradient(135deg, rgba(255,240,245,0.95) 0%, rgba(248,232,242,0.95) 100%)',
        border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.18)'}`,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        boxShadow: isLincoln
          ? '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)'
          : '0 4px 20px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.5)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle background shimmer */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '40%',
          height: '100%',
          background: isLincoln
            ? 'radial-gradient(ellipse at 80% 50%, rgba(126,252,32,0.04) 0%, transparent 70%)'
            : 'radial-gradient(ellipse at 80% 50%, rgba(232,160,191,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Tier badge — prominent */}
      <Box
        sx={{
          borderRadius: isLincoln ? '6px' : '12px',
          background: getTierBadgeColor(currentTierName),
          color: getTierTextColor(currentTierName),
          fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
          fontSize: isLincoln ? '12px' : '14px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          whiteSpace: 'nowrap',
          px: 2,
          py: 1,
          textShadow: isLincoln ? '0 1px 3px rgba(0,0,0,0.4)' : 'none',
          boxShadow: isLincoln
            ? '0 2px 8px rgba(0,0,0,0.3)'
            : '0 2px 8px rgba(0,0,0,0.08)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {currentTierName}
      </Box>

      {/* XP info + progress bar */}
      <Box sx={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
          {(isChildProfile || childCount <= 1) && (
            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '12px' : '16px',
                fontWeight: 700,
                color: isLincoln ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
              }}
            >
              {childName}
            </Typography>
          )}
          <Typography
            sx={{
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
              fontSize: isLincoln ? '14px' : '18px',
              fontWeight: 700,
              color: accentColor,
              ml: 'auto',
              textShadow: isLincoln ? `0 0 10px ${accentColor}44` : 'none',
            }}
          >
            {displayXp} XP
          </Typography>
        </Box>

        {/* Mini tier progress bar */}
        <Box
          sx={{
            height: 8,
            borderRadius: isLincoln ? '2px' : '4px',
            bgcolor: isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            overflow: 'hidden',
            border: `1px solid ${isLincoln ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}`,
          }}
        >
          <Box
            sx={{
              height: '100%',
              width: `${tierProgress}%`,
              borderRadius: 'inherit',
              background: isLincoln
                ? `linear-gradient(90deg, ${accentColor}66, ${accentColor})`
                : `linear-gradient(90deg, ${accentColor}66, ${accentColor})`,
              transition: 'width 0.6s ease-out',
              boxShadow: `2px 0 8px ${accentColor}66, 0 0 8px ${accentColor}33`,
            }}
          />
        </Box>

        {/* Next tier hint */}
        {nextTierEntry && (
          <Typography
            sx={{
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
              fontSize: isLincoln ? '12px' : '14px',
              color: isLincoln ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
              mt: 0.5,
              textAlign: 'right',
            }}
          >
            {tierMaxXp - (profile.totalXp)} XP to {nextTierEntry[0]}
          </Typography>
        )}

        {/* Enchantment glow / cape unlock hints */}
        {!tierHasGlow(currentTierName) && (
          <Typography
            sx={{
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
              fontSize: isLincoln ? '12px' : '13px',
              color: isLincoln ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
              mt: 0.5,
              textAlign: 'center',
            }}
          >
            Enchantment glow unlocks at Iron tier
          </Typography>
        )}
        {!tierHasCape(currentTierName) && (
          <Typography
            sx={{
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
              fontSize: isLincoln ? '12px' : '13px',
              color: isLincoln ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
              mt: 0.25,
              textAlign: 'center',
            }}
          >
            {tierHasGlow(currentTierName)
              ? 'Cape unlocks at Gold tier (enchantment glow active!)'
              : 'Cape unlocks at Gold tier'}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
