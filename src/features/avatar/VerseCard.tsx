import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'

import type { ArmorPiece, AvatarProfile } from '../../core/types/domain'
import { ARMOR_PIECES } from '../../core/types/domain'

interface VerseCardProps {
  pieceId: ArmorPiece | null
  profile: AvatarProfile | null
  alreadyApplied: boolean
  onApply: (pieceId: ArmorPiece) => void
  onClose: () => void
}

/** Get the image URL for the current tier of a piece. */
function getPieceImageUrl(
  profile: AvatarProfile,
  pieceId: ArmorPiece,
): string | undefined {
  const entry = profile.pieces.find((p) => p.pieceId === pieceId)
  if (!entry) return undefined
  const tier = profile.currentTier
  return (entry.generatedImageUrls as Record<string, string | undefined>)[tier]
}

export default function VerseCard({
  pieceId,
  profile,
  alreadyApplied,
  onApply,
  onClose,
}: VerseCardProps) {
  const [speakingWordIdx, setSpeakingWordIdx] = useState<number | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const boundaryHandledRef = useRef(false)

  const pieceDef = pieceId ? ARMOR_PIECES.find((p) => p.id === pieceId) : null
  const isLincoln = profile?.themeStyle === 'minecraft'
  const imageUrl = pieceId && profile ? getPieceImageUrl(profile, pieceId) : undefined

  const bgColor = isLincoln ? '#0d1117' : '#fffef9'
  const textColor = isLincoln ? '#e0e0e0' : '#3d3d3d'
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  // ── Auto-read verse on open ──────────────────────────────────────
  useEffect(() => {
    if (!pieceId || !pieceDef) return
    if (!('speechSynthesis' in window)) return

    // Cancel any existing speech
    window.speechSynthesis.cancel()
    setSpeakingWordIdx(null)
    boundaryHandledRef.current = false

    const utterance = new SpeechSynthesisUtterance(pieceDef.verseText)
    utterance.rate = 0.75
    utterance.pitch = 1.0

    const words = pieceDef.verseText.split(/\s+/)
    utterance.addEventListener('boundary', (event) => {
      if (event.name === 'word') {
        // Estimate which word we're on based on charIndex
        let charCount = 0
        for (let i = 0; i < words.length; i++) {
          if (charCount + words[i].length >= event.charIndex) {
            setSpeakingWordIdx(i)
            break
          }
          charCount += words[i].length + 1 // +1 for space
        }
      }
    })

    utterance.addEventListener('end', () => {
      setSpeakingWordIdx(null)
    })

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)

    return () => {
      window.speechSynthesis.cancel()
      setSpeakingWordIdx(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId])

  // ── Tap a single word to speak it ───────────────────────────────
  const handleWordTap = useCallback((word: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(word)
    u.rate = 0.7
    u.pitch = 1.0
    window.speechSynthesis.speak(u)
  }, [])

  const handleApply = () => {
    if (!pieceId) return
    window.speechSynthesis.cancel()
    onApply(pieceId)
  }

  const handleClose = () => {
    window.speechSynthesis.cancel()
    onClose()
  }

  if (!pieceDef || !profile) return null

  const words = pieceDef.verseText.split(/\s+/)

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
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            color: textColor,
            zIndex: 1,
          }}
          size="small"
          aria-label="close"
        >
          <CloseIcon />
        </IconButton>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          {/* Piece name header */}
          <Typography
            variant="h6"
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '0.6rem' : '1.3rem',
              fontWeight: 700,
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

          {/* Verse text — tappable word chips */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.5,
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
                onClick={() => handleWordTap(word)}
                sx={{
                  cursor: 'pointer',
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '0.5rem' : '1.1rem',
                  fontStyle: 'italic',
                  bgcolor: speakingWordIdx === idx
                    ? (isLincoln ? 'rgba(126,252,32,0.3)' : 'rgba(232,160,191,0.4)')
                    : 'transparent',
                  color: speakingWordIdx === idx ? accentColor : textColor,
                  transition: 'background-color 0.15s, color 0.15s',
                  '&:hover': {
                    bgcolor: isLincoln ? 'rgba(126,252,32,0.15)' : 'rgba(232,160,191,0.2)',
                  },
                }}
              >
                {word}
              </Box>
            ))}
          </Box>

          {/* Scripture reference */}
          <Typography
            variant="caption"
            sx={{
              color: isLincoln ? '#888' : '#999',
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
              fontSize: isLincoln ? '0.38rem' : '0.75rem',
            }}
          >
            {pieceDef.scripture}
          </Typography>

          {/* Put it on button */}
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
                fontSize: isLincoln ? '0.5rem' : '1.1rem',
                fontWeight: 700,
                py: 1.5,
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
                fontSize: isLincoln ? '0.45rem' : '0.9rem',
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
