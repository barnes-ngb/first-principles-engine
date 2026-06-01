import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import BackspaceIcon from '@mui/icons-material/Backspace'
import { useTTS } from '../../core/hooks/useTTS'
import type { AnswerInputMethod, BuildWordQuestion, QuestState, SpellWordQuestion } from './questTypes'
import { MAX_QUESTIONS } from './questTypes'

// ── Minecraft color palette (matches ReadingQuest) ──────────────

const MC = {
  bg: 'rgba(0,0,0,0.92)',
  gold: '#FCDB5B',
  green: '#7EFC20',
  diamond: '#5BFCEE',
  stone: '#8B8B8B',
  red: '#FC5B5B',
  white: '#FFFFFF',
  darkStone: '#3C3C3C',
  font: '"Press Start 2P", monospace',
} as const

interface BuildWordQuestionScreenProps {
  // FEAT-11: spell-the-word reuses this exact tile UI. Both shapes carry
  // `tiles` / `targetWord` / `audioCue`, so the screen renders either with no
  // branching — tap-only, target spoken not shown, no text input for either.
  question: BuildWordQuestion | SpellWordQuestion
  questState: QuestState
  consecutiveWrong: number
  onAnswer: (answer: string) => void
  /** Answer with input method tracking — build-word always reports 'tile'. */
  onAnswerWithMethod?: (answer: string, method: AnswerInputMethod) => void
  onSkip: () => void
  /** Domain label for the header (defaults to "Reading Quest"). */
  domainLabel?: string
}

/**
 * "Build the word" (FEAT-04) — ordered tile assembly, the encoding complement
 * to the multiple-choice decoding questions. The target word is read aloud via
 * TTS (never shown as text); the child taps sound/letter tiles into the build
 * row in order, and may tap a placed tile to remove it. There is deliberately
 * NO text-input element anywhere — Lincoln builds the word from sound-blocks,
 * tap-only. Copy is disposition-framed: "craft the word," "you built it!", and
 * never "wrong" or "misspelled".
 */
export default function BuildWordQuestionScreen({
  question,
  questState,
  consecutiveWrong,
  onAnswer,
  onAnswerWithMethod,
  onSkip,
  domainLabel = 'Reading Quest',
}: BuildWordQuestionScreenProps) {
  const progress = (questState.totalQuestions / MAX_QUESTIONS) * 100
  const tts = useTTS({ rate: 0.8 })
  const [muted, setMuted] = useState(false)

  // Indices into `question.tiles` that have been placed, in order. Using
  // indices (not values) keeps duplicate tiles (e.g. two "p"s) independent.
  const [placed, setPlaced] = useState<number[]>([])
  const [timerElapsed, setTimerElapsed] = useState(false)
  const [prevQuestionId, setPrevQuestionId] = useState(question.id)

  // Reset build state when the question changes (React derived-state pattern).
  if (prevQuestionId !== question.id) {
    setPrevQuestionId(question.id)
    setPlaced([])
    setTimerElapsed(false)
  }

  const cue = question.audioCue?.trim() || question.targetWord

  // Auto-read the target word aloud shortly after it appears.
  useEffect(() => {
    if (muted) return
    const timer = setTimeout(() => tts.speak(cue), 500)
    return () => clearTimeout(timer)
  }, [question.id, muted]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reveal the skip option after 8s, or once the child has missed twice.
  useEffect(() => {
    const timer = setTimeout(() => setTimerElapsed(true), 8000)
    return () => clearTimeout(timer)
  }, [question.id])
  const showSkip = timerElapsed || consecutiveWrong >= 2

  const replayWord = useCallback(() => {
    if (!muted) tts.speak(cue)
  }, [muted, tts, cue])

  // Tap a tile to place it — also play its sound for phonics reinforcement.
  const placeTile = useCallback(
    (index: number) => {
      setPlaced((prev) => (prev.includes(index) ? prev : [...prev, index]))
      if (!muted) tts.speak(question.tiles[index])
    },
    [muted, tts, question.tiles],
  )

  // Tap a placed tile to pull it back out of the build row.
  const removeAt = useCallback((slotPos: number) => {
    setPlaced((prev) => prev.filter((_, i) => i !== slotPos))
  }, [])

  const clearLast = useCallback(() => {
    setPlaced((prev) => prev.slice(0, -1))
  }, [])

  const builtWord = placed.map((i) => question.tiles[i]).join('')

  const handleSubmit = useCallback(() => {
    if (placed.length === 0) return
    if (onAnswerWithMethod) onAnswerWithMethod(builtWord, 'tile')
    else onAnswer(builtWord)
  }, [placed.length, builtWord, onAnswer, onAnswerWithMethod])

  return (
    <Box sx={{ bgcolor: MC.bg, borderRadius: 2, p: 3 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography sx={{ fontFamily: MC.font, fontSize: '0.5rem', color: MC.gold }}>
          ⛏️ {domainLabel} — Level {questState.currentLevel}
        </Typography>
        {question.isBonusRound && (
          <Typography sx={{ fontFamily: MC.font, fontSize: '0.45rem', color: MC.gold }}>
            BONUS
          </Typography>
        )}
      </Stack>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: MC.darkStone,
          mb: 2,
          '& .MuiLinearProgress-bar': { bgcolor: MC.green, borderRadius: 4 },
        }}
      />

      {/* Listen control */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton
            onClick={replayWord}
            disabled={muted}
            sx={{
              color: muted ? MC.stone : MC.diamond,
              p: 1,
              minWidth: 40,
              minHeight: 40,
              ...(tts.isSpeaking && !muted && {
                animation: 'speaker-pulse 1s ease-in-out infinite',
                '@keyframes speaker-pulse': {
                  '0%, 100%': { transform: 'scale(1)', boxShadow: `0 0 0px ${MC.diamond}00` },
                  '50%': { transform: 'scale(1.15)', boxShadow: `0 0 12px ${MC.diamond}60` },
                },
              }),
            }}
            aria-label="Hear the word again"
          >
            <VolumeUpIcon sx={{ fontSize: 28 }} />
          </IconButton>
          <Typography
            component="span"
            onClick={replayWord}
            sx={{
              fontFamily: MC.font,
              fontSize: '0.35rem',
              color: muted ? MC.stone : MC.diamond,
              cursor: muted ? 'default' : 'pointer',
              userSelect: 'none',
              '&:hover': muted ? {} : { color: MC.gold },
            }}
          >
            Tap to hear the word
          </Typography>
        </Stack>
        <IconButton
          onClick={() => {
            setMuted((m) => !m)
            tts.cancel()
          }}
          size="small"
          sx={{ color: muted ? MC.red : MC.stone, p: 0.5 }}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeOffIcon sx={{ fontSize: 16 }} /> : <VolumeUpIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Stack>

      {/* Prompt */}
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        <Typography sx={{ fontFamily: MC.font, fontSize: '0.7rem', color: MC.white, lineHeight: 1.8 }}>
          🧱 {question.prompt || 'Craft the word from your sound-blocks!'}
        </Typography>
      </Box>

      {/* Build row — placed tiles assemble left-to-right; tap one to remove it */}
      <Box
        sx={{
          minHeight: 72,
          bgcolor: MC.darkStone,
          border: `2px dashed ${MC.diamond}`,
          borderRadius: 2,
          p: 1.5,
          mb: 2,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {placed.length === 0 ? (
          <Typography sx={{ fontFamily: MC.font, fontSize: '0.45rem', color: MC.stone }}>
            Tap the sound-blocks below
          </Typography>
        ) : (
          placed.map((tileIndex, slotPos) => (
            <Box
              key={`${tileIndex}-${slotPos}`}
              role="button"
              aria-label={`Remove ${question.tiles[tileIndex]}`}
              tabIndex={0}
              onClick={() => removeAt(slotPos)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  removeAt(slotPos)
                }
              }}
              sx={{
                minWidth: 48,
                minHeight: 48,
                px: 1.5,
                bgcolor: MC.green,
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 3px 0 rgba(0,0,0,0.4)',
              }}
            >
              <Typography sx={{ fontFamily: MC.font, fontSize: '0.85rem', color: '#000' }}>
                {question.tiles[tileIndex]}
              </Typography>
            </Box>
          ))
        )}
      </Box>

      {/* Tile tray — tap to place; placed tiles dim out */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          justifyContent: 'center',
          mb: 2,
        }}
      >
        {question.tiles.map((tile, i) => {
          const used = placed.includes(i)
          return (
            <Box
              key={`tile-${i}`}
              role="button"
              aria-label={`Sound block ${tile}`}
              tabIndex={used ? -1 : 0}
              onClick={() => {
                if (!used) placeTile(i)
              }}
              onKeyDown={(e) => {
                if (!used && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  placeTile(i)
                }
              }}
              sx={{
                minWidth: 56,
                minHeight: 56,
                px: 1.5,
                bgcolor: used ? 'transparent' : MC.darkStone,
                border: `2px solid ${used ? MC.darkStone : MC.gold}`,
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: used ? 'default' : 'pointer',
                opacity: used ? 0.25 : 1,
                transition: 'opacity 0.2s, border-color 0.15s',
                boxShadow: used ? 'none' : '0 3px 0 rgba(0,0,0,0.4)',
                '&:hover': used ? {} : { borderColor: MC.diamond },
                '&:focus-visible': used ? {} : { borderColor: MC.diamond, outline: 'none' },
              }}
            >
              <Typography sx={{ fontFamily: MC.font, fontSize: '0.95rem', color: used ? MC.stone : MC.white }}>
                {tile}
              </Typography>
            </Box>
          )
        })}
      </Box>

      {/* Controls: backspace + build */}
      <Stack direction="row" spacing={1.5} alignItems="stretch">
        <IconButton
          onClick={clearLast}
          disabled={placed.length === 0}
          aria-label="Take back the last block"
          sx={{
            bgcolor: MC.darkStone,
            border: `2px solid ${MC.stone}`,
            borderRadius: 2,
            color: placed.length === 0 ? MC.darkStone : MC.white,
            width: 56,
          }}
        >
          <BackspaceIcon />
        </IconButton>
        <Box
          role="button"
          aria-label="Build the word"
          tabIndex={placed.length === 0 ? -1 : 0}
          onClick={handleSubmit}
          onKeyDown={(e) => {
            if (placed.length > 0 && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          sx={{
            flex: 1,
            minHeight: 56,
            bgcolor: placed.length === 0 ? MC.darkStone : MC.green,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: placed.length === 0 ? 'default' : 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.65rem',
              color: placed.length === 0 ? MC.stone : '#000',
            }}
          >
            Build it! 🔨
          </Typography>
        </Box>
      </Stack>

      {/* Skip */}
      {showSkip && (
        <Box
          role="button"
          tabIndex={0}
          onClick={onSkip}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSkip()
            }
          }}
          sx={{
            mt: 2,
            bgcolor: MC.darkStone,
            border: `2px solid ${MC.stone}`,
            borderRadius: 2,
            p: 2,
            minHeight: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            '&:hover': { borderColor: MC.white },
            '&:focus-visible': { borderColor: MC.white, outline: 'none' },
          }}
        >
          <Typography sx={{ fontFamily: MC.font, fontSize: '0.6rem', color: MC.stone }}>
            Try another ⛏️
          </Typography>
        </Box>
      )}
    </Box>
  )
}
