import { useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import type { AvatarProfile } from '../../core/types'
import { TIER_COMPLETION_BONUSES } from '../../core/xp/forgeCosts'

export interface TierUpgrade {
  from: string
  to: string
}

interface TierUpgradeCelebrationProps {
  upgrade: TierUpgrade | null
  profile: AvatarProfile | null
  onDismiss: () => void
}

// Pre-computed particle positions (deterministic, no runtime randomness)
const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  top:  (i * 53 + 7)  % 100,
  dx:   ((i * 73 + 31) % 300) - 150,
  dy:   ((i * 61 + 17) % 300) - 150,
  colorIdx: i % 4,
  delay: (i * 80) % 800,
}))

const TIER_LABELS: Record<string, string> = {
  wood: 'WOOD',
  stone: 'STONE',
  iron: 'IRON',
  gold: 'GOLD',
  diamond: 'DIAMOND',
  netherite: 'NETHERITE',
}

export default function TierUpgradeCelebration({
  upgrade,
  profile,
  onDismiss,
}: TierUpgradeCelebrationProps) {
  useEffect(() => {
    if (!upgrade) return
    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [upgrade, onDismiss])

  if (!upgrade || !profile) return null

  const { from: fromTier, to: toTier } = upgrade
  const isLincoln = profile.themeStyle === 'minecraft'
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  const fromLabel = TIER_LABELS[fromTier] ?? fromTier.toUpperCase()
  const toLabel   = TIER_LABELS[toTier]   ?? toTier.toUpperCase()
  const bonus = TIER_COMPLETION_BONUSES[fromTier] ?? 0

  const particleColors = isLincoln
    ? ['#7EFC20', '#FFD700', '#00BFFF', '#FF6B35']
    : ['#FF69B4', '#FFD700', '#9C27B0', '#00BCD4']

  return (
    <Box
      onClick={() => setTimeout(onDismiss, 300)}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: isLincoln ? 'rgba(0,0,0,0.96)' : 'rgba(255,240,254,0.96)',
        cursor: 'pointer',
        animation: 'tierFadeIn 0.5s ease-out',
        '@keyframes tierFadeIn': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
      }}
    >
      {/* Particle burst */}
      <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {PARTICLES.map((p, i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              width: isLincoln ? 10 : 14,
              height: isLincoln ? 10 : 14,
              bgcolor: particleColors[p.colorIdx],
              borderRadius: isLincoln ? 0 : '50%',
              left: `${p.left}%`,
              top: `${p.top}%`,
              animation: `tierParticle 1.8s ease-out ${p.delay}ms forwards`,
              '@keyframes tierParticle': {
                from: { transform: 'scale(0) rotate(0deg)', opacity: 1 },
                to: {
                  transform: `translate(${p.dx}px, ${p.dy}px) scale(2) rotate(${p.dx}deg)`,
                  opacity: 0,
                },
              },
            }}
          />
        ))}
      </Box>

      {/* Content */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, px: 3, zIndex: 1 }}>
        {/* Sword emoji for dramatic effect */}
        <Typography
          sx={{
            fontSize: '48px',
            animation: 'swordSpin 1s ease-out',
            '@keyframes swordSpin': {
              '0%': { transform: 'scale(0) rotate(-180deg)', opacity: 0 },
              '60%': { transform: 'scale(1.2) rotate(10deg)', opacity: 1 },
              '100%': { transform: 'scale(1) rotate(0deg)', opacity: 1 },
            },
          }}
        >
          {'\u2694\uFE0F'}
        </Typography>

        {/* Tier name */}
        <Typography
          sx={{
            fontFamily: titleFont,
            fontSize: isLincoln ? '14px' : '1.2rem',
            fontWeight: 700,
            color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
            textAlign: 'center',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          {fromLabel} ARMOR
        </Typography>

        {/* COMPLETE! */}
        <Typography
          sx={{
            fontFamily: titleFont,
            fontSize: isLincoln ? '20px' : '1.6rem',
            fontWeight: 700,
            color: accentColor,
            textAlign: 'center',
            textShadow: `0 0 30px ${accentColor}80`,
            animation: 'tierPulse 1.5s ease-in-out infinite',
            '@keyframes tierPulse': {
              '0%, 100%': { transform: 'scale(1)' },
              '50%': { transform: 'scale(1.06)' },
            },
          }}
        >
          COMPLETE!
        </Typography>

        {/* Piece count */}
        <Typography
          sx={{
            fontFamily: titleFont,
            fontSize: isLincoln ? '11px' : '0.9rem',
            color: isLincoln ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
            textAlign: 'center',
          }}
        >
          You forged all 6 pieces.
        </Typography>

        {/* Milestone bonus */}
        {bonus > 0 && (
          <Box
            sx={{
              mt: 0.5,
              px: 3,
              py: 1.5,
              borderRadius: isLincoln ? '6px' : '16px',
              background: isLincoln
                ? 'linear-gradient(135deg, rgba(0,188,212,0.15) 0%, rgba(0,188,212,0.05) 100%)'
                : 'linear-gradient(135deg, rgba(156,39,176,0.12) 0%, rgba(156,39,176,0.04) 100%)',
              border: `1.5px solid ${isLincoln ? 'rgba(0,188,212,0.3)' : 'rgba(156,39,176,0.25)'}`,
              animation: 'bonusAppear 0.6s ease-out 0.8s both',
              '@keyframes bonusAppear': {
                from: { transform: 'scale(0.8)', opacity: 0 },
                to: { transform: 'scale(1)', opacity: 1 },
              },
            }}
          >
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '14px' : '1.1rem',
                fontWeight: 700,
                color: isLincoln ? '#00BCD4' : '#9C27B0',
                textAlign: 'center',
              }}
            >
              +{bonus} {'\u25C6'} Milestone Bonus
            </Typography>
          </Box>
        )}

        {/* Next tier teaser */}
        <Typography
          sx={{
            mt: 1,
            fontFamily: titleFont,
            fontSize: isLincoln ? '13px' : '1rem',
            fontWeight: 700,
            color: isLincoln ? '#FFD700' : '#E65100',
            textAlign: 'center',
            animation: 'nextTierSlide 0.5s ease-out 1.2s both',
            '@keyframes nextTierSlide': {
              from: { transform: 'translateY(10px)', opacity: 0 },
              to: { transform: 'translateY(0)', opacity: 1 },
            },
          }}
        >
          {toLabel} tier now available.
        </Typography>

        {/* Continue button */}
        <Box
          sx={{
            mt: 1.5,
            px: 4,
            py: 1.5,
            borderRadius: isLincoln ? '6px' : '22px',
            border: `2px solid ${accentColor}44`,
            background: isLincoln
              ? 'rgba(126,252,32,0.08)'
              : 'rgba(232,160,191,0.08)',
            animation: 'continueAppear 0.4s ease-out 1.6s both',
            '@keyframes continueAppear': {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          }}
        >
          <Typography
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '11px' : '0.85rem',
              color: isLincoln ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
              textAlign: 'center',
            }}
          >
            Continue {'\u2192'}
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
