import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

interface TierUpCeremonyProps {
  active: boolean
  newTierName: string | null
  onComplete: () => void
}

// ── Sound: 3-note ascending Minecraft-style jingle ─────────────────

function playTierUpSound() {
  try {
    const ctx = new AudioContext()
    const notes = [
      { freq: 440, duration: 0.15, delay: 0 },      // A4
      { freq: 554, duration: 0.15, delay: 0.17 },    // C#5
      { freq: 659, duration: 0.3, delay: 0.34 },     // E5
    ]

    notes.forEach(({ freq, duration, delay }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)

      const t = ctx.currentTime + delay
      gain.gain.setValueAtTime(0.18, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
      osc.start(t)
      osc.stop(t + duration)
    })
  } catch {
    // Web Audio not available
  }
}

// ── Component ──────────────────────────────────────────────────────

export default function TierUpCeremony({ active, newTierName, onComplete }: TierUpCeremonyProps) {
  const soundPlayedRef = useRef(false)

  useEffect(() => {
    if (!active) {
      soundPlayedRef.current = false
      return
    }

    // Play sound at banner appearance (~300ms)
    const soundTimer = setTimeout(() => {
      if (!soundPlayedRef.current) {
        playTierUpSound()
        soundPlayedRef.current = true
      }
    }, 300)

    // Complete after ~4s (flash 600ms + banner hold 2.5s + fade 500ms + buffer)
    const completeTimer = setTimeout(() => {
      onComplete()
    }, 4000)

    return () => {
      clearTimeout(soundTimer)
      clearTimeout(completeTimer)
    }
  }, [active, onComplete])

  if (!active || !newTierName) return null

  const tierLabel = newTierName.toUpperCase()

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    >
      {/* Step 1: Screen Flash — gold/white radial gradient */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,215,0,0.8) 40%, rgba(255,165,0,0.4) 70%, transparent 100%)',
          animation: 'tierFlash 600ms ease-out forwards',
          '@keyframes tierFlash': {
            '0%': { opacity: 0 },
            '30%': { opacity: 0.8 },
            '100%': { opacity: 0 },
          },
        }}
      />

      {/* Step 2: Banner */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'tierBannerSequence 3.5s ease-out 300ms forwards',
          opacity: 0,
          '@keyframes tierBannerSequence': {
            '0%': { opacity: 0, transform: 'scale(0.5)' },
            '15%': { opacity: 1, transform: 'scale(1.0)' },
            '75%': { opacity: 1, transform: 'scale(1.0)' },
            '100%': { opacity: 0, transform: 'scale(1.0)' },
          },
        }}
      >
        {/* Dark panel behind text */}
        <Box
          sx={{
            bgcolor: 'rgba(0, 0, 0, 0.85)',
            borderRadius: 1,
            px: 4,
            py: 3,
            border: '2px solid rgba(255, 215, 0, 0.6)',
            boxShadow: '0 0 40px rgba(255, 215, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography
            sx={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: { xs: '0.7rem', sm: '1rem' },
              color: '#FFD700',
              textShadow: '0 0 20px rgba(255, 215, 0, 0.6), 0 2px 4px rgba(0,0,0,0.8)',
              textAlign: 'center',
              letterSpacing: 2,
            }}
          >
            {'\u2694\uFE0F'} {tierLabel} TIER UNLOCKED {'\u2694\uFE0F'}
          </Typography>

          <Typography
            sx={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: { xs: '0.4rem', sm: '0.6rem' },
              color: 'rgba(255, 255, 255, 0.8)',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              textAlign: 'center',
              mt: 0.5,
            }}
          >
            Your armor has been reforged!
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
