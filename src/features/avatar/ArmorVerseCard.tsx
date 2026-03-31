import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'

import type { ArmorPieceMeta } from './voxel/buildArmorPiece'

// ── TTS for verse card ─────────────────────────────────────────────

export function speakVerse(pieceName: string, verseText: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()

  const text = `${pieceName}. ${verseText}`
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.85
  utterance.pitch = 1.0
  utterance.volume = 1.0

  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find((v) =>
    v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Moira'),
  ) || voices.find((v) => v.lang.startsWith('en-US')) || voices[0]
  if (preferred) utterance.voice = preferred

  window.speechSynthesis.speak(utterance)
}

// ── Types ──────────────────────────────────────────────────────────

interface ArmorVerseCardProps {
  piece: ArmorPieceMeta
  isUnlocked: boolean
  isEquipped: boolean
  isLincoln: boolean
  accentColor: string
  textColor: string
  onEquip: () => void
  onClose: () => void
}

// ── Component ──────────────────────────────────────────────────────

export default function ArmorVerseCard({
  piece,
  isUnlocked,
  isLincoln,
  accentColor,
  textColor,
  onEquip,
  onClose,
}: ArmorVerseCardProps) {
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  return (
    <Box
      sx={{
        mt: 2,
        mx: 1,
        p: '24px',
        background: isLincoln
          ? 'linear-gradient(135deg, rgba(16,18,32,0.98) 0%, rgba(22,32,52,0.98) 100%)'
          : 'linear-gradient(135deg, rgba(255,254,249,0.98) 0%, rgba(250,245,240,0.98) 100%)',
        border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.15)' : 'rgba(232,160,191,0.2)'}`,
        borderRadius: isLincoln ? '8px' : '20px',
        position: 'relative',
        animation: 'verseSlideUp 0.3s ease-out',
        '@keyframes verseSlideUp': {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        boxShadow: isLincoln
          ? `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${accentColor}08`
          : '0 8px 32px rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}
    >
      {/* Top bar: speaker + close */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Box
          component="button"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation()
            speakVerse(piece.name, piece.verseText)
          }}
          sx={{
            background: isLincoln ? 'rgba(126,252,32,0.1)' : 'rgba(232,160,191,0.1)',
            border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.2)' : 'rgba(232,160,191,0.2)'}`,
            borderRadius: isLincoln ? '4px' : '10px',
            width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', p: 0, color: accentColor,
            transition: 'all 0.2s ease',
            '&:hover': { background: isLincoln ? 'rgba(126,252,32,0.18)' : 'rgba(232,160,191,0.18)' },
          }}
          aria-label="Read verse aloud"
        >
          <VolumeUpIcon sx={{ fontSize: 18 }} />
        </Box>

        <Box
          component="button"
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onClose() }}
          sx={{
            background: 'none', border: 'none',
            color: isLincoln ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)',
            fontSize: 20, cursor: 'pointer', p: '4px',
            '&:hover': { color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' },
          }}
        >
          ✕
        </Box>
      </Box>

      {/* Piece name */}
      <Typography sx={{
        fontFamily: titleFont,
        fontSize: isLincoln ? '14px' : '18px',
        fontWeight: 600,
        color: accentColor,
        mb: 0.25,
      }}>
        {piece.name}
      </Typography>

      {/* Verse reference */}
      <Typography sx={{
        fontFamily: 'monospace',
        fontSize: isLincoln ? '12px' : '13px',
        color: isLincoln ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
        mb: 1.5,
      }}>
        {piece.verse}
      </Typography>

      {/* Verse text with left accent bar */}
      <Box
        sx={{
          borderLeft: `3px solid ${accentColor}55`,
          pl: 2,
          py: 1,
          my: 0.5,
          borderRadius: '0 8px 8px 0',
          background: isLincoln
            ? 'rgba(126,252,32,0.03)'
            : 'rgba(232,160,191,0.04)',
        }}
      >
        <Typography sx={{
          fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
          fontSize: isLincoln ? '12px' : '16px',
          color: textColor,
          lineHeight: 1.8,
          fontStyle: 'italic',
        }}>
          &ldquo;{piece.verseText}&rdquo;
        </Typography>
      </Box>

      {/* Equip button — only for unlocked pieces */}
      {isUnlocked && (
        <Button
          variant="contained"
          fullWidth
          onClick={() => {
            onEquip()
            onClose()
          }}
          sx={{
            mt: 2,
            bgcolor: accentColor,
            color: isLincoln ? '#000' : '#fff',
            fontFamily: titleFont,
            fontSize: isLincoln ? '12px' : '16px',
            fontWeight: 700,
            py: 1.5,
            minHeight: '48px',
            borderRadius: isLincoln ? '4px' : '12px',
            textTransform: 'none',
            boxShadow: `0 2px 10px ${accentColor}33`,
            '&:hover': { bgcolor: accentColor, opacity: 0.9 },
          }}
        >
          Put it on!
        </Button>
      )}
    </Box>
  )
}
