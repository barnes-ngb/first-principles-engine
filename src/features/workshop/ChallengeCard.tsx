import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import Typography from '@mui/material/Typography'
import MicIcon from '@mui/icons-material/Mic'
import type { ChallengeCard as ChallengeCardType, VoiceRecordingMap } from '../../core/types'
import { useTTS } from '../../core/hooks/useTTS'

const TYPE_EMOJI: Record<string, string> = {
  reading: '\uD83D\uDCDA',
  math: '\uD83E\uDDEE',
  story: '\uD83D\uDCAC',
  action: '\uD83C\uDFC3',
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '',
  medium: '',
  stretch: "Boss Challenge! ",
}

interface ChallengeCardProps {
  card: ChallengeCardType | null
  open: boolean
  onClose: () => void
  /** DALL-E generated card art keyed by card type */
  cardArt?: { reading?: string; math?: string; story?: string; action?: string }
  /** Voice recordings map — if card ID has a recording, play it instead of TTS */
  voiceRecordings?: VoiceRecordingMap
  /** Called when card flip animation starts (for sound sync) */
  onFlipStart?: () => void
  /** Called when boss challenge is revealed (for sound sync) */
  onBossReveal?: () => void
  /** Whether game sounds are muted */
  muted?: boolean
}

export default function ChallengeCard({ card, open, onClose, cardArt, voiceRecordings, onFlipStart, onBossReveal, muted }: ChallengeCardProps) {
  const tts = useTTS()
  const [flipped, setFlipped] = useState(false)
  const [contentVisible, setContentVisible] = useState(false)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  /** Play voice recording for a card, returns true if recording exists */
  const playVoiceRecording = useCallback(
    (cardId: string): boolean => {
      const rec = voiceRecordings?.[cardId]
      if (!rec?.url || muted) return false

      // Stop any previous audio
      if (audioElRef.current) {
        audioElRef.current.pause()
        audioElRef.current = null
      }

      const audio = new Audio(rec.url)
      audioElRef.current = audio
      audio.onended = () => { audioElRef.current = null }
      audio.onerror = () => {
        // Fall back to TTS silently
        audioElRef.current = null
        if (card) {
          const prefix = DIFFICULTY_LABEL[card.difficulty] || ''
          tts.speak(prefix + card.readAloudText)
        }
      }
      audio.play().catch(() => {
        // Fall back to TTS
        audioElRef.current = null
        if (card) {
          const prefix = DIFFICULTY_LABEL[card.difficulty] || ''
          tts.speak(prefix + card.readAloudText)
        }
      })
      return true
    },
    [voiceRecordings, muted, tts, card],
  )

  /** Stop any playing voice recording */
  const stopVoiceRecording = useCallback(() => {
    if (audioElRef.current) {
      audioElRef.current.pause()
      audioElRef.current = null
    }
  }, [])

  // Animate card flip when it opens
  useEffect(() => {
    if (open && card) {
      setFlipped(false)
      setContentVisible(false)
      onFlipStart?.()

      const isStretch = card.difficulty === 'stretch'
      const flipDelay = isStretch ? 600 : 300

      // Start flip
      const flipTimer = setTimeout(() => {
        setFlipped(true)
        if (isStretch) {
          onBossReveal?.()
        }
      }, 100)

      // Show content after flip completes
      const contentTimer = setTimeout(() => {
        setContentVisible(true)
      }, flipDelay + 200)

      // Read aloud after visual settles — use voice recording if available
      const ttsTimer = setTimeout(() => {
        const hasVoice = playVoiceRecording(card.id)
        if (!hasVoice) {
          const prefix = DIFFICULTY_LABEL[card.difficulty] || ''
          tts.speak(prefix + card.readAloudText)
        }
      }, flipDelay + 500)

      return () => {
        clearTimeout(flipTimer)
        clearTimeout(contentTimer)
        clearTimeout(ttsTimer)
        tts.cancel()
        stopVoiceRecording()
      }
    } else {
      setFlipped(false)
      setContentVisible(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card?.id])

  if (!card) return null

  const emoji = TYPE_EMOJI[card.type] || '?'
  const isStretch = card.difficulty === 'stretch'
  const artUrl = cardArt?.[card.type as keyof typeof cardArt]

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            overflow: 'visible',
            bgcolor: 'transparent',
            boxShadow: 'none',
          },
        },
      }}
    >
      <Box
        sx={{
          perspective: '1000px',
          '@media (prefers-reduced-motion: reduce)': {
            '& *': { animation: 'none !important', transition: 'none !important' },
          },
        }}
      >
        <DialogContent
          sx={{
            p: 3,
            textAlign: 'center',
            bgcolor: isStretch ? '#fff8e1' : 'background.paper',
            border: isStretch ? '3px solid #ff9800' : undefined,
            borderRadius: 2,
            transform: flipped ? 'rotateY(0deg)' : 'rotateY(90deg)',
            transition: isStretch
              ? 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)'
              : 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
            transformStyle: 'preserve-3d',
            ...(isStretch && flipped
              ? {
                  animation: 'bossGlow 1.5s ease-in-out infinite alternate',
                  '@keyframes bossGlow': {
                    '0%': { boxShadow: '0 0 10px rgba(255,152,0,0.3)' },
                    '100%': { boxShadow: '0 0 25px rgba(255,152,0,0.6)' },
                  },
                }
              : {}),
          }}
        >
          {/* Generated card art header */}
          {artUrl ? (
            <Box
              component="img"
              src={artUrl}
              alt={`${card.type} challenge`}
              sx={{
                width: '100%',
                maxHeight: 200,
                objectFit: 'contain',
                borderRadius: 2,
                mb: 1.5,
                opacity: contentVisible ? 1 : 0,
                transition: 'opacity 0.4s ease-in',
              }}
            />
          ) : (
            <Typography
              sx={{
                fontSize: '3rem',
                mb: 1,
                opacity: contentVisible ? 1 : 0,
                transition: 'opacity 0.3s ease-in',
              }}
            >
              {emoji}
            </Typography>
          )}

          {isStretch && (
            <Typography
              variant="caption"
              sx={{
                color: '#e65100',
                fontWeight: 700,
                display: 'block',
                mb: 1,
                opacity: contentVisible ? 1 : 0,
                transform: contentVisible ? 'scale(1)' : 'scale(0.5)',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                fontSize: '0.85rem',
              }}
            >
              BOSS CHALLENGE!
            </Typography>
          )}

          <Typography
            variant="h6"
            gutterBottom
            sx={{
              opacity: contentVisible ? 1 : 0,
              transform: contentVisible ? 'translateY(0)' : 'translateY(10px)',
              transition: 'all 0.4s ease-out 0.1s',
            }}
          >
            {card.content}
          </Typography>

          {card.options && card.options.length > 0 && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                my: 2,
                opacity: contentVisible ? 1 : 0,
                transition: 'opacity 0.4s ease-in 0.2s',
              }}
            >
              {card.options.map((option, i) => (
                <Button key={i} variant="outlined" fullWidth>
                  {option}
                </Button>
              ))}
            </Box>
          )}

          {/* Voice recording attribution */}
          {voiceRecordings?.[card.id] && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5,
                mt: 1,
                opacity: contentVisible ? 1 : 0,
                transition: 'opacity 0.3s ease-in 0.2s',
              }}
            >
              <MicIcon sx={{ fontSize: 14 }} />
              Recorded by London
            </Typography>
          )}

          <Box
            sx={{
              display: 'flex',
              gap: 1,
              mt: 3,
              justifyContent: 'center',
              opacity: contentVisible ? 1 : 0,
              transition: 'opacity 0.3s ease-in 0.3s',
            }}
          >
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                const hasVoice = playVoiceRecording(card.id)
                if (!hasVoice) {
                  const prefix = DIFFICULTY_LABEL[card.difficulty] || ''
                  tts.speak(prefix + card.readAloudText)
                }
              }}
            >
              Read Again
            </Button>
            <Button variant="contained" onClick={onClose}>
              Done!
            </Button>
          </Box>
        </DialogContent>
      </Box>
    </Dialog>
  )
}
