import { useCallback, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'

import type { ArmorPieceMeta } from './voxel/buildArmorPiece'
import type { ArmorPieceState } from './armorPieceState'
import { speakVerse } from './speakVerse'

// ── Types ──────────────────────────────────────────────────────────

interface ArmorVerseCardProps {
  piece: ArmorPieceMeta
  pieceState: ArmorPieceState
  forgeCost: number
  isLincoln: boolean
  accentColor: string
  textColor: string
  onEquip: () => void
  onForge: (verseResponse?: string, verseResponseAudio?: string) => Promise<boolean>
  onClose: () => void
}

const VERSE_RESPONSE_CHIPS = [
  'It protects me',
  'It gives me strength',
  'God made it for me',
  'To fight evil',
  'To be brave',
]

// ── Component ──────────────────────────────────────────────────────

export default function ArmorVerseCard({
  piece,
  pieceState,
  forgeCost,
  isLincoln,
  accentColor,
  textColor,
  onEquip,
  onForge,
  onClose,
}: ArmorVerseCardProps) {
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  // Forge response state
  const [chipResponse, setChipResponse] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [forging, setForging] = useState(false)
  const [forgeError, setForgeError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start()
      recorderRef.current = recorder
      setIsRecording(true)
    } catch (err) {
      console.error('Mic access failed:', err)
    }
  }, [])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
    setIsRecording(false)
  }, [])

  const handleForge = useCallback(async () => {
    setForging(true)
    setForgeError(null)
    try {
      const response = chipResponse ?? (audioBlob ? '(audio response)' : undefined)
      const success = await onForge(response, audioUrl ?? undefined)
      if (!success) {
        setForgeError('Cannot forge yet. Earn more XP or diamonds first!')
      }
    } catch (err) {
      console.error('[Forge] Error:', err)
      setForgeError('Something went wrong. Try again.')
    } finally {
      setForging(false)
    }
  }, [chipResponse, audioBlob, audioUrl, onForge])

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
          {'\u2715'}
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

      {/* Forge flow — only when piece is forgeable */}
      {pieceState === 'forgeable' && (
        <Box sx={{ mt: 2 }}>
          {/* Verse response prompt */}
          <Typography sx={{
            fontFamily: titleFont,
            fontSize: isLincoln ? '12px' : '14px',
            color: isLincoln ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
            mb: 1.5,
            textAlign: 'center',
          }}>
            Why does a warrior need the {piece.shortName.toLowerCase()}?
          </Typography>

          {/* Response chips */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', mb: 1.5 }}>
            {VERSE_RESPONSE_CHIPS.map((chip) => (
              <Chip
                key={chip}
                label={chip}
                onClick={() => setChipResponse(chipResponse === chip ? null : chip)}
                color={chipResponse === chip ? 'primary' : 'default'}
                variant={chipResponse === chip ? 'filled' : 'outlined'}
                sx={{
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '10px' : '12px',
                }}
              />
            ))}
          </Box>

          {/* Voice record button */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={isRecording ? stopRecording : startRecording}
              color={isRecording ? 'error' : 'primary'}
              startIcon={isRecording ? <StopIcon /> : <MicIcon />}
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '10px' : '12px',
                textTransform: 'none',
              }}
            >
              {isRecording ? 'Stop' : 'Record answer'}
            </Button>
          </Box>

          {audioUrl && (
            <Box sx={{ mb: 1.5 }}>
              <audio src={audioUrl} controls style={{ width: '100%', height: 36 }} />
            </Box>
          )}

          {/* Forge button */}
          <Button
            variant="contained"
            fullWidth
            onClick={handleForge}
            disabled={forging}
            sx={{
              bgcolor: '#00BCD4',
              color: '#fff',
              fontFamily: titleFont,
              fontSize: isLincoln ? '12px' : '16px',
              fontWeight: 700,
              py: 1.5,
              minHeight: '48px',
              borderRadius: isLincoln ? '4px' : '12px',
              textTransform: 'none',
              boxShadow: '0 2px 10px rgba(0,188,212,0.3)',
              '&:hover': { bgcolor: '#00ACC1' },
              '&:disabled': { opacity: 0.7 },
            }}
          >
            {forging ? 'Forging...' : `\u25C6 ${forgeCost} Forge it!`}
          </Button>

          {forgeError && (
            <Typography
              sx={{
                color: '#FF5252',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '10px' : '13px',
                textAlign: 'center',
                mt: 1,
              }}
            >
              {forgeError}
            </Typography>
          )}
        </Box>
      )}

      {/* Equip button — only for forged pieces not yet equipped today */}
      {pieceState === 'forged_not_equipped_today' && (
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

      {pieceState === 'locked_by_xp' && (
        <Typography
          sx={{
            mt: 2,
            color: isLincoln ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)',
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
            fontSize: isLincoln ? '10px' : '14px',
            textAlign: 'center',
          }}
        >
          Locked — earn more XP to forge this piece.
        </Typography>
      )}

      {pieceState === 'equipped_today' && (
        <Typography
          sx={{
            mt: 2,
            color: '#4caf50',
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
            fontSize: isLincoln ? '10px' : '14px',
            textAlign: 'center',
            fontWeight: 700,
          }}
        >
          Equipped today ✓
        </Typography>
      )}
    </Box>
  )
}
