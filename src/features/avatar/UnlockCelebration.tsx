import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ArmorPiece, AvatarProfile } from '../../core/types/domain'
import { ARMOR_PIECES } from '../../core/types/domain'

interface UnlockCelebrationProps {
  newPiece: ArmorPiece | null
  profile: AvatarProfile | null
  onDismiss: () => void
}

/** Get stone/basic tier image URL for the newly unlocked piece. */
function getNewPieceImageUrl(profile: AvatarProfile, pieceId: ArmorPiece): string | undefined {
  const entry = profile.pieces.find((p) => p.pieceId === pieceId)
  if (!entry) return undefined
  // Show stone/basic tier image since that's what just unlocked
  const stoneTier = profile.themeStyle === 'minecraft' ? 'stone' : 'basic'
  return (entry.generatedImageUrls as Record<string, string | undefined>)[stoneTier]
}

export default function UnlockCelebration({ newPiece, profile, onDismiss }: UnlockCelebrationProps) {
  const [visible, setVisible] = useState(false)

  // Pre-compute random positions once per unlock so render stays pure.
  // Must be called unconditionally (before any early return).
  const pixelParticles = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        left: Math.floor(Math.random() * 100),
        top: Math.floor(Math.random() * 100),
        dx: Math.floor((Math.random() - 0.5) * 200),
        dy: Math.floor((Math.random() - 0.5) * 200),
        colorIdx: i % 3,
      })),
    // Recompute when a new piece unlocks
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [newPiece],
  )

  useEffect(() => {
    if (!newPiece) return
    setVisible(true)
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 400)
    }, 4000)
    return () => clearTimeout(timer)
  }, [newPiece, onDismiss])

  if (!newPiece || !visible) return null

  const pieceDef = ARMOR_PIECES.find((p) => p.id === newPiece)
  const isLincoln = profile?.themeStyle === 'minecraft'
  const imageUrl = profile ? getNewPieceImageUrl(profile, newPiece) : undefined

  return (
    <Box
      onClick={() => { setVisible(false); setTimeout(onDismiss, 400) }}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: isLincoln ? 'rgba(0,0,0,0.92)' : 'rgba(255,240,250,0.95)',
        animation: 'celebrationFadeIn 0.4s ease-out',
        cursor: 'pointer',
        '@keyframes celebrationFadeIn': {
          from: { opacity: 0, transform: 'scale(0.9)' },
          to: { opacity: 1, transform: 'scale(1)' },
        },
      }}
    >
      {/* Particle burst (CSS only) */}
      {isLincoln ? (
        // Pixel explosion: green squares
        <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {pixelParticles.map((p, i) => (
            <Box
              key={i}
              sx={{
                position: 'absolute',
                width: 12,
                height: 12,
                bgcolor: p.colorIdx === 0 ? '#7EFC20' : p.colorIdx === 1 ? '#FFD700' : '#00BFFF',
                left: `${p.left}%`,
                top: `${p.top}%`,
                animation: `pixelExplode${i % 4} 1.2s ease-out forwards`,
                [`@keyframes pixelExplode${i % 4}`]: {
                  from: { transform: 'scale(0)', opacity: 1 },
                  to: {
                    transform: `translate(${p.dx}px, ${p.dy}px) scale(1.5)`,
                    opacity: 0,
                  },
                },
              }}
            />
          ))}
        </Box>
      ) : (
        // Sparkle burst: stars
        <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {['⭐', '✨', '🌟', '💫', '⭐', '✨', '🌟', '💫', '⭐', '✨'].map((star, i) => (
            <Box
              key={i}
              sx={{
                position: 'absolute',
                fontSize: '1.5rem',
                left: `${10 + i * 9}%`,
                top: `${20 + (i % 3) * 20}%`,
                animation: `starBurst 1.5s ease-out ${i * 0.1}s forwards`,
                '@keyframes starBurst': {
                  from: { transform: 'scale(0) rotate(0deg)', opacity: 1 },
                  to: {
                    transform: `scale(1.5) rotate(${i % 2 === 0 ? 360 : -360}deg) translateY(-80px)`,
                    opacity: 0,
                  },
                },
              }}
            >
              {star}
            </Box>
          ))}
        </Box>
      )}

      {/* Content */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, px: 3 }}>
        {imageUrl && (
          <Box
            component="img"
            src={imageUrl}
            alt={pieceDef?.name}
            sx={{
              width: 180,
              height: 180,
              objectFit: 'contain',
              borderRadius: isLincoln ? 0 : 4,
              border: `4px solid ${isLincoln ? '#7EFC20' : '#E8A0BF'}`,
              imageRendering: isLincoln ? 'pixelated' : 'auto',
              animation: 'bounceIn 0.6s ease-out',
              '@keyframes bounceIn': {
                '0%': { transform: 'scale(0)' },
                '60%': { transform: 'scale(1.2)' },
                '100%': { transform: 'scale(1)' },
              },
            }}
          />
        )}

        <Typography
          sx={{
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
            fontSize: isLincoln ? '0.8rem' : '1.6rem',
            fontWeight: 700,
            color: isLincoln ? '#7EFC20' : '#9C27B0',
            textAlign: 'center',
            textShadow: isLincoln ? '0 0 20px rgba(126,252,32,0.8)' : '0 0 20px rgba(156,39,176,0.4)',
          }}
        >
          NEW PIECE UNLOCKED!
        </Typography>

        <Typography
          sx={{
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
            fontSize: isLincoln ? '0.55rem' : '1.1rem',
            fontWeight: 700,
            color: isLincoln ? '#FFD700' : '#E91E63',
            textAlign: 'center',
          }}
        >
          {pieceDef?.name}
        </Typography>

        <Typography
          sx={{
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
            fontSize: isLincoln ? '0.45rem' : '1rem',
            color: isLincoln ? '#aaa' : '#666',
            textAlign: 'center',
          }}
        >
          {pieceDef?.scripture}
        </Typography>

        <Typography
          sx={{
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
            fontSize: isLincoln ? '0.4rem' : '0.8rem',
            color: isLincoln ? '#555' : '#999',
            textAlign: 'center',
            mt: 2,
          }}
        >
          tap to continue
        </Typography>
      </Box>
    </Box>
  )
}
