import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { TIER_BIOMES, getBiomeName } from './tierBiomes'

interface PortalTransitionProps {
  fromTier: string  // Used for future biome-exit animation
  toTier: string
  onComplete: () => void
}

/**
 * Full-screen portal transition moment between tiers.
 * Purple/obsidian Nether portal aesthetic with screen warp effect.
 */
export default function PortalTransition({ toTier, onComplete }: PortalTransitionProps) {
  const [phase, setPhase] = useState<'intro' | 'portal' | 'reveal'>('intro')

  const biome = TIER_BIOMES[toTier]
  const biomeName = getBiomeName(toTier)
  const biomeDesc = biome?.description ?? ''

  const handleEnterPortal = useCallback(() => {
    setPhase('portal')
    // After portal animation, reveal new tier
    setTimeout(() => setPhase('reveal'), 2000)
  }, [])

  // Auto-dismiss after reveal
  useEffect(() => {
    if (phase === 'reveal') {
      const timer = setTimeout(onComplete, 5000)
      return () => clearTimeout(timer)
    }
  }, [phase, onComplete])

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: phase === 'portal'
          ? 'radial-gradient(ellipse at center, #1a0033 0%, #0d001a 40%, #000 70%)'
          : phase === 'reveal'
            ? `radial-gradient(ellipse at center, ${biome?.bgTint ?? 'rgba(0,0,0,0.9)'} 0%, rgba(13,17,23,0.98) 100%)`
            : 'rgba(0,0,0,0.92)',
        transition: 'background 1.5s ease',
        animation: phase === 'portal' ? 'portalWarp 2s ease-in-out' : undefined,
        '@keyframes portalWarp': {
          '0%': { filter: 'blur(0px) brightness(1)' },
          '30%': { filter: 'blur(3px) brightness(1.3)' },
          '60%': { filter: 'blur(6px) brightness(0.5)' },
          '100%': { filter: 'blur(0px) brightness(1)' },
        },
      }}
    >
      {/* Intro phase: "A portal opens..." */}
      {phase === 'intro' && (
        <Box
          sx={{
            textAlign: 'center',
            animation: 'fadeSlideUp 0.8s ease-out',
            '@keyframes fadeSlideUp': {
              '0%': { opacity: 0, transform: 'translateY(20px)' },
              '100%': { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          {/* Portal glow effect */}
          <Box
            sx={{
              width: 120,
              height: 180,
              mx: 'auto',
              mb: 3,
              borderRadius: '60px',
              background: 'linear-gradient(180deg, #6B2FA0 0%, #4A1B6B 30%, #2A0A4A 60%, #1A0033 100%)',
              border: '3px solid #9B59B6',
              boxShadow: '0 0 40px rgba(155,89,182,0.5), 0 0 80px rgba(155,89,182,0.2), inset 0 0 30px rgba(155,89,182,0.3)',
              animation: 'portalPulse 2s ease-in-out infinite',
              '@keyframes portalPulse': {
                '0%, 100%': { boxShadow: '0 0 40px rgba(155,89,182,0.5), 0 0 80px rgba(155,89,182,0.2)' },
                '50%': { boxShadow: '0 0 60px rgba(155,89,182,0.7), 0 0 120px rgba(155,89,182,0.3)' },
              },
              // Swirling particle effect
              backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(155,89,182,0.4) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(100,50,150,0.3) 0%, transparent 40%)',
            }}
          />

          <Typography
            sx={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '14px',
              color: '#BB86FC',
              mb: 1,
              textShadow: '0 0 10px rgba(187,134,252,0.5)',
            }}
          >
            A portal opens...
          </Typography>

          <Typography
            sx={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '11px',
              color: 'rgba(255,255,255,0.5)',
              mb: 3,
            }}
          >
            Step through to {biomeName}?
          </Typography>

          <Button
            variant="contained"
            onClick={handleEnterPortal}
            sx={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '12px',
              bgcolor: '#7B1FA2',
              color: '#fff',
              px: 4,
              py: 1.5,
              borderRadius: '4px',
              textTransform: 'none',
              boxShadow: '0 0 20px rgba(123,31,162,0.5)',
              '&:hover': { bgcolor: '#9C27B0' },
            }}
          >
            Enter the portal
          </Button>
        </Box>
      )}

      {/* Portal phase: warp animation (mostly CSS) */}
      {phase === 'portal' && (
        <Box
          sx={{
            width: 200,
            height: 300,
            borderRadius: '100px',
            background: 'radial-gradient(ellipse, #9B59B6 0%, #6B2FA0 30%, #2A0A4A 60%, transparent 100%)',
            boxShadow: '0 0 100px rgba(155,89,182,0.6)',
            animation: 'portalExpand 2s ease-in-out',
            '@keyframes portalExpand': {
              '0%': { transform: 'scale(0.5)', opacity: 1 },
              '50%': { transform: 'scale(2)', opacity: 0.8 },
              '100%': { transform: 'scale(5)', opacity: 0 },
            },
          }}
        />
      )}

      {/* Reveal phase: new biome */}
      {phase === 'reveal' && (
        <Box
          sx={{
            textAlign: 'center',
            animation: 'revealFade 1.5s ease-out',
            '@keyframes revealFade': {
              '0%': { opacity: 0, transform: 'scale(0.9)' },
              '100%': { opacity: 1, transform: 'scale(1)' },
            },
          }}
        >
          <Typography
            sx={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '18px',
              color: '#fff',
              mb: 1,
              textShadow: '0 0 15px rgba(255,255,255,0.3)',
            }}
          >
            {biomeName}
          </Typography>

          <Typography
            sx={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '10px',
              color: 'rgba(255,255,255,0.5)',
              mb: 1,
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            {toTier} Tier
          </Typography>

          <Typography
            sx={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '11px',
              color: 'rgba(255,255,255,0.6)',
              mb: 3,
              maxWidth: 300,
              lineHeight: 1.8,
            }}
          >
            {biomeDesc}
          </Typography>

          <Typography
            sx={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '10px',
              color: '#FFA726',
              lineHeight: 1.8,
            }}
          >
            Your armor awaits. Forge it from the {toTier} of this new world.
          </Typography>

          <Button
            variant="text"
            onClick={onComplete}
            sx={{
              mt: 3,
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '10px',
              color: 'rgba(255,255,255,0.4)',
              textTransform: 'none',
            }}
          >
            Continue
          </Button>
        </Box>
      )}
    </Box>
  )
}
