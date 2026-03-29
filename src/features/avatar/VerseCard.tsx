import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'

import type { ArmorPiece, AvatarProfile } from '../../core/types'
import { ARMOR_PIECES } from '../../core/types'
import { useTTS } from '../../core/hooks/useTTS'

interface VerseCardProps {
  pieceId: ArmorPiece | null
  profile: AvatarProfile | null
  alreadyApplied: boolean
  croppedImageUrl?: string
  onApply: (pieceId: ArmorPiece) => void
  onClose: () => void
}

function getPieceImageUrl(
  profile: AvatarProfile,
  pieceId: ArmorPiece,
): string | undefined {
  const entry = (profile.pieces ?? []).find((p) => p.pieceId === pieceId)
  if (!entry) return undefined
  const tier = profile.currentTier
  return (entry.generatedImageUrls as Record<string, string | undefined>)[tier]
}

/**
 * Map a charIndex from a substring (starting at startWordIdx) back to
 * the corresponding word index in the full word array.
 */
function charIndexToWordIndex(
  words: string[],
  startWordIdx: number,
  charIndex: number,
): number {
  let charCount = 0
  for (let i = 0; i < words.length - startWordIdx; i++) {
    if (charCount + words[startWordIdx + i].length > charIndex) {
      return startWordIdx + i
    }
    charCount += words[startWordIdx + i].length + 1
  }
  return startWordIdx
}

// ── Component ─────────────────────────────────────────────────────

export default function VerseCard({
  pieceId,
  profile,
  alreadyApplied,
  croppedImageUrl,
  onApply,
  onClose,
}: VerseCardProps) {
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(-1)
  const [hasRead, setHasRead] = useState(false)
  const autoStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startWordRef = useRef(0)

  const pieceDef = pieceId ? ARMOR_PIECES.find((p) => p.id === pieceId) : null
  const isLincoln = profile?.themeStyle === 'minecraft'
  const legacyImageUrl = pieceId && profile ? getPieceImageUrl(profile, pieceId) : undefined
  const imageUrl = croppedImageUrl ?? legacyImageUrl

  const bgColor = isLincoln ? '#0d1117' : '#fffef9'
  const textColor = isLincoln ? '#e0e0e0' : '#3d3d3d'
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  const words = pieceDef ? pieceDef.verseText.split(/\s+/) : []

  const tts = useTTS({
    rate: 0.75,
    pitch: 1.0,
    onWordBoundary: useCallback(
      (charIndex: number) => {
        if (words.length === 0) return
        const wordIdx = charIndexToWordIndex(words, startWordRef.current, charIndex)
        setCurrentWordIndex(wordIdx)
      },
      // words changes on each render, but only its content matters
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [pieceDef?.verseText],
    ),
  })

  const isReading = tts.isSpeaking

  // ── Stop reading ────────────────────────────────────────────────
  const stopReading = useCallback(() => {
    tts.cancel()
    if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current)
    setCurrentWordIndex(-1)
  }, [tts])

  // ── Start reading from word index ───────────────────────────────
  const beginReading = useCallback(
    (fromWord = 0) => {
      if (!pieceDef) return
      startWordRef.current = fromWord
      setCurrentWordIndex(fromWord)
      const substring = pieceDef.verseText.split(/\s+/).slice(fromWord).join(' ')
      tts.speak(substring)
    },
    [pieceDef, tts],
  )

  // Track when reading finishes to show "Read again"
  const prevIsSpeaking = useRef(false)
  useEffect(() => {
    if (prevIsSpeaking.current && !tts.isSpeaking) {
      setCurrentWordIndex(-1)
      setHasRead(true)
    }
    prevIsSpeaking.current = tts.isSpeaking
  }, [tts.isSpeaking])

  // ── Auto-start on open ──────────────────────────────────────────
  useEffect(() => {
    if (!pieceId || !pieceDef) return
    setCurrentWordIndex(-1)
    setHasRead(false)

    // Delay to let card-open animation complete
    autoStartTimerRef.current = setTimeout(() => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices()
        if (voices.length === 0) {
          window.speechSynthesis.onvoiceschanged = () => beginReading(0)
        } else {
          beginReading(0)
        }
      }
    }, 400)

    return () => {
      if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current)
      tts.cancel()
      setCurrentWordIndex(-1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId])

  // ── Tap a word → restart from that word ────────────────────────
  const handleWordTap = useCallback(
    (wordIdx: number) => {
      beginReading(wordIdx)
    },
    [beginReading],
  )

  const handleApply = () => {
    if (!pieceId) return
    stopReading()
    onApply(pieceId)
  }

  const handleClose = () => {
    stopReading()
    onClose()
  }

  if (!pieceDef || !profile) return null

  return (
    <Dialog
      open={Boolean(pieceId)}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: bgColor,
          color: textColor,
          borderRadius: isLincoln ? 0 : 4,
          border: `2px solid ${accentColor}`,
          m: 2,
        },
      }}
    >
      <DialogContent sx={{ p: 3, position: 'relative' }}>
        {/* Speaker button */}
        <IconButton
          onClick={(e) => { e.stopPropagation(); beginReading(0) }}
          sx={{
            position: 'absolute',
            top: 8,
            left: 12,
            color: accentColor,
            bgcolor: isLincoln ? 'rgba(126,252,32,0.15)' : 'rgba(232,160,191,0.15)',
            border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.3)' : 'rgba(232,160,191,0.3)'}`,
            width: 32,
            height: 32,
            zIndex: 1,
            '&:hover': { bgcolor: isLincoln ? 'rgba(126,252,32,0.25)' : 'rgba(232,160,191,0.25)' },
          }}
          size="small"
          aria-label="Read verse aloud"
        >
          <VolumeUpIcon sx={{ fontSize: 18 }} />
        </IconButton>

        {/* Close button */}
        <IconButton
          onClick={handleClose}
          sx={{ position: 'absolute', top: 8, right: 8, color: textColor, zIndex: 1 }}
          size="small"
          aria-label="close"
        >
          <CloseIcon />
        </IconButton>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          {/* Piece name */}
          <Typography
            variant="h6"
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '16px' : '26px',
              fontWeight: 500,
              color: accentColor,
              textAlign: 'center',
              pr: 4,
            }}
          >
            {pieceDef.name}
          </Typography>

          {/* Piece image */}
          {imageUrl ? (
            <Box
              component="img"
              src={imageUrl}
              alt={pieceDef.name}
              sx={{
                width: 180,
                height: 180,
                objectFit: 'contain',
                borderRadius: isLincoln ? 0 : 3,
                imageRendering: isLincoln ? 'pixelated' : 'auto',
                border: `2px solid ${accentColor}`,
              }}
            />
          ) : (
            <Box
              sx={{
                width: 180,
                height: 180,
                border: `2px solid ${accentColor}`,
                borderRadius: isLincoln ? 0 : 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '4rem',
              }}
            >
              ✨
            </Box>
          )}

          {/* Verse text — tappable word spans with highlight */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0,
              justifyContent: 'center',
              p: 1.5,
              bgcolor: isLincoln ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              borderRadius: 2,
              borderLeft: `3px solid ${accentColor}`,
              width: '100%',
            }}
          >
            {words.map((word, idx) => (
              <Box
                key={idx}
                component="span"
                onClick={() => handleWordTap(idx)}
                sx={{
                  display: 'inline-block',
                  px: '8px',
                  py: '6px',
                  m: '2px',
                  borderRadius: 1,
                  cursor: 'pointer',
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '14px' : '22px',
                  fontStyle: 'italic',
                  lineHeight: 1.7,
                  transition: 'background-color 200ms ease, color 200ms ease, transform 150ms ease',
                  backgroundColor: currentWordIndex === idx
                    ? (isLincoln ? 'rgba(126,252,32,0.25)' : 'rgba(255,200,50,0.3)')
                    : 'transparent',
                  color: currentWordIndex === idx ? (isLincoln ? '#7EFC20' : '#b8860b') : textColor,
                  transform: currentWordIndex === idx ? 'scale(1.1)' : 'scale(1)',
                  fontWeight: currentWordIndex === idx ? 600 : 400,
                  '&:hover': {
                    bgcolor: isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.2)',
                  },
                }}
              >
                {word}
              </Box>
            ))}
          </Box>

          {/* TTS controls */}
          <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
            {isReading ? (
              <Button
                variant="outlined"
                size="small"
                onClick={stopReading}
                sx={{
                  flex: 1,
                  borderColor: accentColor,
                  color: accentColor,
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '12px' : '14px',
                  borderRadius: isLincoln ? 0 : 2,
                }}
              >
                ■ Stop
              </Button>
            ) : hasRead ? (
              <Button
                variant="outlined"
                size="small"
                onClick={() => beginReading(0)}
                sx={{
                  flex: 1,
                  borderColor: accentColor,
                  color: accentColor,
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '12px' : '14px',
                  borderRadius: isLincoln ? 0 : 2,
                }}
              >
                ↩ Read again
              </Button>
            ) : (
              <Button
                variant="outlined"
                size="small"
                onClick={() => beginReading(0)}
                sx={{
                  flex: 1,
                  borderColor: accentColor,
                  color: accentColor,
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '12px' : '14px',
                  borderRadius: isLincoln ? 0 : 2,
                }}
              >
                ▶ Read it
              </Button>
            )}
          </Box>

          {/* Scripture reference */}
          <Typography
            variant="caption"
            sx={{
              color: isLincoln ? '#888' : '#999',
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
              fontSize: isLincoln ? '12px' : '16px',
            }}
          >
            {pieceDef.scripture}
          </Typography>

          {/* Put it on / already wearing */}
          {!alreadyApplied ? (
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={handleApply}
              sx={{
                bgcolor: accentColor,
                color: isLincoln ? '#000' : '#fff',
                fontFamily: titleFont,
                fontSize: isLincoln ? '14px' : '20px',
                fontWeight: 700,
                py: 2,
                minHeight: 60,
                borderRadius: isLincoln ? 0 : 3,
                '&:hover': { bgcolor: isLincoln ? '#5FC420' : '#d486a8' },
              }}
            >
              {isLincoln ? '⚔️ Put it on!' : '✨ Put it on!'}
            </Button>
          ) : (
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '13px' : '16px',
                color: isLincoln ? '#7EFC20' : '#9C27B0',
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              ✅ Already wearing it today!
            </Typography>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  )
}
