import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import { speakStatus } from '../speakVerse'
import { playBannerRaiseFanfare } from './bannerRaiseSound'
import StonebridgeLocationArt from './StonebridgeLocationArt'
import { getMission } from './missions'

interface BannerRaiseCelebrationProps {
  /** Mission that was just completed, or null when idle. */
  missionId: string | null
  isLincoln: boolean
  /** Whether to read the thank-you aloud (TTS). */
  speak?: boolean
  onDismiss: () => void
}

/**
 * Full-screen celebration when a Stonebridge location is repaired: heals the
 * art, raises the banner, plays a fanfare, and shows the canon character's
 * thank-you plus an optional brief formation beat. Tap to continue.
 */
export default function BannerRaiseCelebration({
  missionId,
  isLincoln,
  speak = false,
  onDismiss,
}: BannerRaiseCelebrationProps) {
  const [visible, setVisible] = useState(false)
  const mission = missionId ? getMission(missionId) : undefined

  const sparkles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: 8 + i * 6.5,
        top: 15 + (i % 4) * 18,
        delay: (i % 7) * 0.12,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [missionId],
  )

  useEffect(() => {
    if (!mission) return
    setVisible(true)
    playBannerRaiseFanfare()
    if (speak) {
      // Slight delay so the fanfare lands first.
      const t = setTimeout(() => speakStatus(mission.thankYou.line), 700)
      return () => clearTimeout(t)
    }
  }, [mission, speak])

  if (!mission || !visible) return null

  const accent = mission.art.accent
  const dismiss = () => {
    setVisible(false)
    setTimeout(onDismiss, 350)
  }

  return (
    <Box
      onClick={dismiss}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        px: 3,
        cursor: 'pointer',
        bgcolor: isLincoln ? 'rgba(4,8,14,0.94)' : 'rgba(255,244,250,0.96)',
        animation: 'sbFadeIn 0.4s ease-out',
        '@keyframes sbFadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
      }}
    >
      {/* Sparkle burst */}
      <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {sparkles.map((s, i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              left: `${s.left}%`,
              top: `${s.top}%`,
              fontSize: '1.4rem',
              animation: `sbSparkle 1.4s ease-out ${s.delay}s forwards`,
              '@keyframes sbSparkle': {
                from: { transform: 'scale(0)', opacity: 1 },
                to: { transform: 'scale(1.4) translateY(-60px)', opacity: 0 },
              },
            }}
          >
            ✨
          </Box>
        ))}
      </Box>

      <Typography
        sx={{
          fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
          fontSize: isLincoln ? '14px' : '1.5rem',
          fontWeight: 700,
          color: accent,
          textAlign: 'center',
          textShadow: `0 0 18px ${accent}88`,
        }}
      >
        🎉 BANNER RAISED!
      </Typography>

      <Box sx={{ width: 'min(360px, 86vw)' }}>
        <StonebridgeLocationArt art={mission.art} state="repaired" isLincoln={isLincoln} animateBanner height={150} />
      </Box>

      <Typography
        sx={{
          fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
          fontSize: isLincoln ? '11px' : '1.05rem',
          fontWeight: 700,
          color: isLincoln ? '#F7D774' : '#7a3f67',
          textAlign: 'center',
        }}
      >
        {mission.locationName} repaired!
      </Typography>

      {/* Canon character thank-you */}
      <Box
        sx={{
          maxWidth: 'min(420px, 88vw)',
          p: 1.5,
          borderRadius: isLincoln ? '8px' : '16px',
          border: `1px solid ${accent}66`,
          background: isLincoln ? 'rgba(12,20,30,0.9)' : 'rgba(255,255,255,0.85)',
        }}
      >
        <Typography
          sx={{
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
            fontSize: isLincoln ? '9px' : '0.85rem',
            color: accent,
            mb: 0.5,
          }}
        >
          {mission.thankYou.name}
        </Typography>
        <Typography
          sx={{
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
            fontSize: isLincoln ? '11px' : '1rem',
            lineHeight: 1.55,
            color: isLincoln ? 'rgba(255,255,255,0.92)' : 'rgba(32,16,24,0.85)',
          }}
        >
          “{mission.thankYou.line}”
        </Typography>
      </Box>

      {/* Brief, skippable formation beat */}
      {mission.formationBeat && (
        <Typography
          sx={{
            maxWidth: 'min(420px, 88vw)',
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
            fontSize: isLincoln ? '9px' : '0.9rem',
            lineHeight: 1.5,
            color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(60,40,55,0.7)',
            textAlign: 'center',
            fontStyle: 'italic',
          }}
        >
          {mission.formationBeat.name}: {mission.formationBeat.line}
        </Typography>
      )}

      <Typography
        sx={{
          fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
          fontSize: isLincoln ? '10px' : '0.85rem',
          color: isLincoln ? '#666' : '#999',
          mt: 1,
        }}
      >
        tap to continue
      </Typography>
    </Box>
  )
}
