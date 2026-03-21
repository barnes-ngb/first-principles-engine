import { useEffect } from 'react'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'

import type { AvatarProfile } from '../../core/types'
import { ARMOR_PIECES } from '../../core/types'

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
  stone: 'STONE',
  diamond: 'DIAMOND',
  netherite: 'OBSIDIAN DARK',
  basic: 'BASIC',
  powerup: 'POWER-UP',
  champion: 'CHAMPION',
}

export default function TierUpgradeCelebration({
  upgrade,
  profile,
  onDismiss,
}: TierUpgradeCelebrationProps) {
  useEffect(() => {
    if (!upgrade) return
    const timer = setTimeout(onDismiss, 6000)
    return () => clearTimeout(timer)
  }, [upgrade, onDismiss])

  if (!upgrade || !profile) return null

  const { from: fromTier, to: toTier } = upgrade
  const isLincoln = profile.themeStyle === 'minecraft'
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  const readyCount = ARMOR_PIECES.filter((pieceDef) => {
    const entry = profile.pieces.find((p) => p.pieceId === pieceDef.id)
    return entry && (entry.generatedImageUrls as Record<string, string | undefined>)[toTier]
  }).length

  const fromLabel = TIER_LABELS[fromTier] ?? fromTier.toUpperCase()
  const toLabel   = TIER_LABELS[toTier]   ?? toTier.toUpperCase()

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
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2.5, px: 3, zIndex: 1 }}>
        <Typography
          sx={{
            fontFamily: titleFont,
            fontSize: isLincoln ? '0.65rem' : '1.4rem',
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
          {fromLabel} COMPLETE!
        </Typography>

        <Typography
          sx={{
            fontFamily: titleFont,
            fontSize: isLincoln ? '0.55rem' : '1.1rem',
            color: isLincoln ? '#FFD700' : '#9C27B0',
            textAlign: 'center',
          }}
        >
          → {toLabel} ARMOR UNLOCKED!
        </Typography>

        {/* All 6 piece images grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
          {ARMOR_PIECES.map((pieceDef, idx) => {
            const entry = profile.pieces.find((p) => p.pieceId === pieceDef.id)
            const url = entry
              ? (entry.generatedImageUrls as Record<string, string | undefined>)[toTier]
              : undefined

            return (
              <Box
                key={pieceDef.id}
                sx={{
                  width: 70,
                  height: 70,
                  border: `2px solid ${accentColor}`,
                  borderRadius: isLincoln ? 0 : 2,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: isLincoln ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)',
                  animation: `pieceAppear 0.4s ease-out ${idx * 120}ms both`,
                  '@keyframes pieceAppear': {
                    from: { transform: 'scale(0)', opacity: 0 },
                    to: { transform: 'scale(1)', opacity: 1 },
                  },
                }}
              >
                {url ? (
                  <Box
                    component="img"
                    src={url}
                    alt={pieceDef.name}
                    sx={{ width: '90%', height: '90%', objectFit: 'contain', imageRendering: isLincoln ? 'pixelated' : 'auto' }}
                  />
                ) : (
                  <Typography sx={{ fontSize: '1.5rem' }}>⏳</Typography>
                )}
              </Box>
            )
          })}
        </Box>

        {readyCount < ARMOR_PIECES.length && (
          <Box sx={{ width: '100%', maxWidth: 280 }}>
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '0.35rem' : '0.7rem',
                color: isLincoln ? '#aaa' : '#888',
                textAlign: 'center',
                mb: 0.5,
              }}
            >
              Forging {toLabel.toLowerCase()} armor... ({readyCount}/{ARMOR_PIECES.length})
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(readyCount / ARMOR_PIECES.length) * 100}
              sx={{
                height: 8,
                borderRadius: isLincoln ? 0 : 4,
                bgcolor: isLincoln ? '#333' : '#eee',
                '& .MuiLinearProgress-bar': {
                  bgcolor: accentColor,
                  borderRadius: isLincoln ? 0 : 4,
                },
              }}
            />
          </Box>
        )}

        <Typography
          sx={{
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
            fontSize: isLincoln ? '0.35rem' : '0.7rem',
            color: isLincoln ? '#555' : '#aaa',
          }}
        >
          tap to continue
        </Typography>
      </Box>
    </Box>
  )
}
