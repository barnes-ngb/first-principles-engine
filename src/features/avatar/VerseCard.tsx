import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'

import type { ArmorPiece, AvatarProfile } from '../../core/types'
import { ARMOR_PIECES } from '../../core/types'

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
  const entry = profile.pieces.find((p) => p.pieceId === pieceId)
  if (!entry) return undefined
  const tier = profile.currentTier
  return (entry.generatedImageUrls as Record<string, string | undefined>)[tier]
}

// ── TTS helper ─────────────────────────────────────────────────────

function startReading(
  verseText: string,
  startWordIdx: number,
  onWordIndex: (idx: number) => void,
  onEnd: () => void,
): SpeechSynthesisUtterance {
  const words = verseText.split(/\s+/)
  const substring = words.slice(startWordIdx).join(' ')

  const utterance = new SpeechSynthesisUtterance(substring)
  utterance.rate = 0.75
  utterance.pitch = 1.0

  // Select a warm voice if available
  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find((v) =>
    v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Moira'),
  )
  if (preferred) utterance.voice = preferred

  let boundaryFired = false

  utterance.addEventListener('boundary', (event) => {
    if (event.name !== 'word') return
    boundaryFired = true
    // Map charIndex in substring to word index in full verse
    let charCount = 0
    for (let i = 0; i < words.length - startWordIdx; i++) {
      if (charCount + words[startWordIdx + i].length > event.charIndex) {
        onWordIndex(startWordIdx + i)
        return
      }
      charCount += words[startWordIdx + i].length + 1
    }
  })

  utterance.addEventListener('start', () => {
    // Fallback timer if boundary events never fire
    let idx = startWordIdx
    const interval = setInterval(() => {
      if (boundaryFired) {
        clearInterval(interval)
        return
      }
      onWordIndex(idx)
      idx++
      if (idx >= words.length) clearInterval(interval)
    }, (verseText.length / Math.max(words.length, 1)) * (1000 / 0.75) / words.length)

    utterance.addEventListener('end', () => clearInterval(interval), { once: true })
  })

  utterance.addEventListener('end', () => {
    onEnd()
  })

  window.speechSynthesis.speak(utterance)
  return utterance
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
  const [isReading, setIsReading] = useState(false)
  const [hasRead, setHasRead] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const autoStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pieceDef = pieceId ? ARMOR_PIECES.find((p) => p.id === pieceId) : null
  const isLincoln = profile?.themeStyle === 'minecraft'
  const legacyImageUrl = pieceId && profile ? getPieceImageUrl(profile, pieceId) : undefined
  const imageUrl = croppedImageUrl ?? legacyImageUrl

  const bgColor = isLincoln ? '#0d1117' : '#fffef9'
  const textColor = isLincoln ? '#e0e0e0' : '#3d3d3d'
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  const words = pieceDef ? pieceDef.verseText.split(/\s+/) : []

  // ── Stop reading ────────────────────────────────────────────────
  const stopReading = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current)
    utteranceRef.current = null
    setIsReading(false)
    setCurrentWordIndex(-1)
  }, [])

  // ── Start reading from word index ───────────────────────────────
  const beginReading = useCallback(
    (fromWord = 0) => {
      if (!pieceDef || !('speechSynthesis' in window)) return
      window.speechSynthesis.cancel()

      setIsReading(true)
      setCurrentWordIndex(fromWord)

      const utterance = startReading(
        pieceDef.verseText,
        fromWord,
        (idx) => setCurrentWordIndex(idx),
        () => {
          setIsReading(false)
          setCurrentWordIndex(-1)
          setHasRead(true)
        },
      )
      utteranceRef.current = utterance
    },
    [pieceDef],
  )

  // ── Auto-start on open ──────────────────────────────────────────
  useEffect(() => {
    if (!pieceId || !pieceDef) return
    setCurrentWordIndex(-1)
    setIsReading(false)
    setHasRead(false)

    // Delay to let card-open animation complete
    autoStartTimerRef.current = setTimeout(() => {
      // Trigger voices load then begin
      if ('speechSynthesis' in window) {
        // Ensure voices are loaded (async on some browsers)
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
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      setIsReading(false)
      setCurrentWordIndex(-1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId])

  // ── Tap a word → restart from that word ────────────────────────
  const handleWordTap = useCallback(
    (wordIdx: number) => {
      if (!('speechSynthesis' in window)) return
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
              fontSize: isLincoln ? '0.75rem' : '26px',
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
                  fontSize: isLincoln ? '0.6rem' : '22px',
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
                  fontSize: isLincoln ? '0.38rem' : '14px',
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
                  fontSize: isLincoln ? '0.38rem' : '14px',
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
                  fontSize: isLincoln ? '0.38rem' : '14px',
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
              fontSize: isLincoln ? '0.45rem' : '15px',
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
                fontSize: isLincoln ? '0.6rem' : '20px',
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
                fontSize: isLincoln ? '0.5rem' : '16px',
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
