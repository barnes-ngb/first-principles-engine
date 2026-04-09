import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import { useSpeechRecognition } from '../../core/hooks/useSpeechRecognition'
import { useTTS } from '../../core/hooks/useTTS'
import { sanitizeStimulus } from './questHelpers'
import TappableText from './TappableText'
import type { AnswerInputMethod, QuestQuestion, QuestState } from './questTypes'
import { MAX_QUESTIONS } from './questTypes'

// ── Minecraft color palette ────────────────────────────────────

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

// ── QuestLoading ──────────────────────────────────────────────

export function QuestLoading() {
  return (
    <Box
      sx={{
        bgcolor: MC.bg,
        border: `2px solid ${MC.gold}`,
        borderRadius: 2,
        p: 4,
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontSize: '2rem', mb: 2 }}>
        ⛏️
      </Typography>
      <Typography
        sx={{
          fontFamily: MC.font,
          fontSize: '0.65rem',
          color: MC.gold,
          mb: 3,
          lineHeight: 1.8,
        }}
      >
        Mining for questions...
      </Typography>
      <CircularProgress
        sx={{ color: MC.gold }}
        size={32}
      />
    </Box>
  )
}

// ── QuestFeedback ─────────────────────────────────────────────

interface QuestFeedbackProps {
  correct: boolean
  correctAnswer: string
  encouragement?: string
  childAnswer: string
  totalCorrect: number
}

export function QuestFeedback({
  correct,
  correctAnswer,
  encouragement,
  childAnswer,
  totalCorrect,
}: QuestFeedbackProps) {
  return (
    <Box
      sx={{
        bgcolor: MC.bg,
        border: `2px solid ${correct ? MC.diamond : MC.gold}`,
        borderRadius: 2,
        p: 4,
        textAlign: 'center',
      }}
    >
      {correct ? (
        <>
          <Typography sx={{ fontSize: '2.5rem', mb: 1 }}>💎</Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.7rem',
              color: MC.diamond,
              mb: 1,
            }}
          >
            +1 Diamond!
          </Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.55rem',
              color: MC.white,
              lineHeight: 1.8,
            }}
          >
            {childAnswer} — You got it!
          </Typography>
        </>
      ) : (
        <>
          <Typography sx={{ fontSize: '2.5rem', mb: 1 }}>🧱</Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.7rem',
              color: MC.gold,
              mb: 1,
            }}
          >
            Almost!
          </Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.55rem',
              color: MC.white,
              lineHeight: 1.8,
              mb: 1,
            }}
          >
            The answer was {correctAnswer}
          </Typography>
          {encouragement && (
            <Typography
              sx={{
                fontFamily: MC.font,
                fontSize: '0.45rem',
                color: MC.stone,
                lineHeight: 1.8,
              }}
            >
              {encouragement}
            </Typography>
          )}
        </>
      )}

      <Typography
        sx={{
          fontFamily: MC.font,
          fontSize: '0.45rem',
          color: MC.diamond,
          mt: 2,
        }}
      >
        {totalCorrect} diamond{totalCorrect !== 1 ? 's' : ''} mined so far
      </Typography>
    </Box>
  )
}

// ── QuestQuestionScreen ───────────────────────────────────────

// ── Voice/Type answer input ────────────────────────────────────

interface OpenResponseInputProps {
  onSubmit: (answer: string, method: AnswerInputMethod) => void
  disabled: boolean
  questionId: string
}

function OpenResponseInput({ onSubmit, disabled, questionId }: OpenResponseInputProps) {
  const speech = useSpeechRecognition()
  const [typedValue, setTypedValue] = useState('')
  const [prevQuestionId, setPrevQuestionId] = useState(questionId)
  const submittedRef = useRef(false)

  // Reset on question change
  if (prevQuestionId !== questionId) {
    setPrevQuestionId(questionId)
    setTypedValue('')
    if (speech.isListening) speech.stop()
    speech.reset()
  }

  // Reset submitted flag when question changes (must be in effect, not during render)
  useEffect(() => {
    submittedRef.current = false
  }, [questionId])

  // Auto-submit when voice produces a final word
  useEffect(() => {
    if (speech.transcript && !submittedRef.current && !disabled) {
      // Take the first word from the transcript (Lincoln says one word)
      const word = speech.transcript.trim().split(/\s+/)[0]
      if (word) {
        submittedRef.current = true
        speech.stop()
        onSubmit(word, 'voice')
      }
    }
  }, [speech.transcript, disabled, onSubmit, speech])

  const handleTypedSubmit = useCallback(() => {
    const word = typedValue.trim()
    if (word && !disabled && !submittedRef.current) {
      submittedRef.current = true
      onSubmit(word, 'typed')
    }
  }, [typedValue, disabled, onSubmit])

  const toggleListening = useCallback(() => {
    if (speech.isListening) {
      speech.stop()
    } else {
      speech.reset()
      setTypedValue('')
      speech.start()
    }
  }, [speech])

  return (
    <Box sx={{ mt: 2 }}>
      <Typography
        sx={{
          fontFamily: MC.font,
          fontSize: '0.4rem',
          color: MC.stone,
          textAlign: 'center',
          mb: 1,
        }}
      >
        Or say / type the word:
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        {/* Mic button */}
        {speech.isSupported && (
          <Box
            role="button"
            tabIndex={0}
            onClick={toggleListening}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleListening()
              }
            }}
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: speech.isListening ? MC.red : MC.darkStone,
              border: `2px solid ${speech.isListening ? MC.red : MC.stone}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: disabled ? 'default' : 'pointer',
              flexShrink: 0,
              ...(speech.isListening && {
                animation: 'mic-pulse 1.2s ease-in-out infinite',
                '@keyframes mic-pulse': {
                  '0%, 100%': { boxShadow: `0 0 4px ${MC.red}40` },
                  '50%': { boxShadow: `0 0 12px ${MC.red}80` },
                },
              }),
            }}
          >
            <Typography sx={{ fontSize: '1.2rem' }}>
              {speech.isListening ? '🔴' : '🎤'}
            </Typography>
          </Box>
        )}

        {/* Text input */}
        <Box
          component="input"
          type="text"
          value={speech.isListening ? (speech.interimTranscript || '') : typedValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            if (!speech.isListening) setTypedValue(e.target.value)
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleTypedSubmit()
            }
          }}
          placeholder={speech.isListening ? 'Listening...' : 'Type the word'}
          readOnly={speech.isListening}
          disabled={disabled}
          sx={{
            flex: 1,
            fontFamily: MC.font,
            fontSize: '0.7rem',
            color: MC.white,
            bgcolor: MC.darkStone,
            border: `2px solid ${speech.isListening ? MC.gold : MC.stone}`,
            borderRadius: 2,
            p: 1.5,
            outline: 'none',
            '&:focus': { borderColor: MC.diamond },
            '&::placeholder': { color: MC.stone, opacity: 0.7 },
          }}
        />

        {/* Submit button (for typed input) */}
        {!speech.isListening && typedValue.trim() && (
          <Box
            role="button"
            tabIndex={0}
            onClick={handleTypedSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleTypedSubmit()
              }
            }}
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: MC.green,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: disabled ? 'default' : 'pointer',
              flexShrink: 0,
            }}
          >
            <Typography sx={{ fontSize: '1.2rem' }}>✓</Typography>
          </Box>
        )}
      </Stack>

      {/* Listening feedback */}
      {speech.isListening && (
        <Typography
          sx={{
            fontFamily: MC.font,
            fontSize: '0.35rem',
            color: MC.gold,
            textAlign: 'center',
            mt: 0.5,
          }}
        >
          Say the word...
        </Typography>
      )}

      {speech.error && (
        <Typography
          sx={{
            fontFamily: MC.font,
            fontSize: '0.35rem',
            color: MC.red,
            textAlign: 'center',
            mt: 0.5,
          }}
        >
          {speech.error} — try typing instead
        </Typography>
      )}
    </Box>
  )
}

// ── Blend pronunciation guide for TTS ─────────────────────────
// Short letter combos like "ch" or "th" get spelled out by Web Speech API.
// Append a guide word so the TTS says the sound, not individual letters.

const BLEND_GUIDES: Record<string, string> = {
  ch: 'ch, as in cheese',
  sh: 'sh, as in shoe',
  th: 'th, as in this',
  wh: 'wh, as in when',
  fl: 'fl, as in flat',
  bl: 'bl, as in blue',
  cr: 'cr, as in crab',
  tr: 'tr, as in tree',
  st: 'st, as in stop',
  sn: 'sn, as in snake',
  gr: 'gr, as in green',
  br: 'br, as in bring',
  cl: 'cl, as in clap',
  dr: 'dr, as in drum',
  fr: 'fr, as in frog',
  gl: 'gl, as in glad',
  pl: 'pl, as in play',
  pr: 'pr, as in prize',
  sk: 'sk, as in skip',
  sl: 'sl, as in slide',
  sm: 'sm, as in smile',
  sp: 'sp, as in spin',
  sw: 'sw, as in swim',
  tw: 'tw, as in twin',
  nd: 'nd, as in and',
  nk: 'nk, as in think',
}

/** Get a TTS-friendly pronunciation for short blend/digraph options. */
function blendForTTS(text: string): string {
  // Only apply to short options (1-3 chars) that are blends, not full words
  if (text.length <= 3) {
    const guide = BLEND_GUIDES[text.toLowerCase()]
    if (guide) return guide
  }
  return text
}

// ── QuestQuestionScreen ───────────────────────────────────────

interface QuestQuestionScreenProps {
  question: QuestQuestion
  questState: QuestState
  consecutiveWrong: number
  onAnswer: (answer: string) => void
  /** Answer with input method tracking */
  onAnswerWithMethod?: (answer: string, method: AnswerInputMethod) => void
  onSkip: () => void
  /** Domain label for the header (defaults to "Reading Quest") */
  domainLabel?: string
  /** Quest domain — enables TTS for math questions */
  domain?: string
}

export default function QuestQuestionScreen({
  question,
  questState,
  consecutiveWrong,
  onAnswer,
  onAnswerWithMethod,
  onSkip,
  domainLabel = 'Reading Quest',
  domain = 'reading',
}: QuestQuestionScreenProps) {
  const progress = (questState.totalQuestions / MAX_QUESTIONS) * 100
  const isMathQuest = domain === 'math'
  const tts = useTTS({ rate: 0.9 })
  const [muted, setMuted] = useState(false)

  const [timerElapsed, setTimerElapsed] = useState(false)
  const [revealingAnswer, setRevealingAnswer] = useState(false)
  const [prevQuestionId, setPrevQuestionId] = useState(question.id)

  // Reset state when question changes (React-recommended pattern for derived state)
  if (prevQuestionId !== question.id) {
    setPrevQuestionId(question.id)
    setTimerElapsed(false)
    setRevealingAnswer(false)
  }

  // Auto-read math questions when they appear
  useEffect(() => {
    if (!muted && isMathQuest && question) {
      const timer = setTimeout(() => tts.speak(question.prompt), 500)
      return () => clearTimeout(timer)
    }
  }, [question.id, isMathQuest, muted]) // eslint-disable-line react-hooks/exhaustive-deps

  // Speak a word via TTS (cancels any in-progress speech first)
  const speakWord = useCallback(
    (word: string) => {
      if (!muted) tts.speak(blendForTTS(word))
    },
    [muted, tts],
  )

  // Detect passage-based comprehension questions (passage separated by double newline)
  const passageParts = useMemo(() => {
    const prompt = question.prompt
    // Comprehension questions have format: "Read this...\n\nPassage text\n\nQuestion?"
    const parts = prompt.split(/\n\n+/)
    if (parts.length >= 3) {
      // First part is instruction, middle part(s) are passage, last is question
      return {
        instruction: parts[0],
        passage: parts.slice(1, -1).join('\n\n'),
        question: parts[parts.length - 1],
      }
    }
    return null
  }, [question.prompt])

  // Show skip button after 8 seconds on current question
  useEffect(() => {
    const timer = setTimeout(() => setTimerElapsed(true), 8000)
    return () => clearTimeout(timer)
  }, [question.id])

  // Show skip if timer elapsed or 2+ consecutive wrong
  const showSkip = timerElapsed || consecutiveWrong >= 2

  // Show voice/type input for word-reading questions (stimulus-based) or if question opts in
  const showOpenResponse = question.allowOpenResponse
    || (question.stimulus && !question.stimulus.includes('_') && /what word/i.test(question.prompt))

  const handleSkip = () => {
    setRevealingAnswer(true)

    // Show correct answer for 2 seconds, then notify parent
    setTimeout(() => {
      setRevealingAnswer(false)
      setTimerElapsed(false)
      onSkip()
    }, 2000)
  }

  // Sanitize stimulus (strips leaked answers in fill-in-blank)
  // Defensive fallback: if prompt asks "What word is this?" but AI omitted stimulus,
  // use the correct answer as the display word so Lincoln isn't guessing blind
  const displayStimulus = sanitizeStimulus(question)
    || (/what word/i.test(question.prompt) ? question.correctAnswer : undefined)

  const correctLower = question.correctAnswer.trim().toLowerCase()

  return (
    <Box sx={{ bgcolor: MC.bg, borderRadius: 2, p: 3 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography
          sx={{
            fontFamily: MC.font,
            fontSize: '0.5rem',
            color: MC.gold,
          }}
        >
          ⛏️ {domainLabel} — Level {questState.currentLevel}
        </Typography>
        <Typography
          sx={{
            fontFamily: MC.font,
            fontSize: '0.45rem',
            color: MC.stone,
          }}
        >
          {question.isBonusRound ? 'BONUS' : `${questState.totalQuestions + 1}/${MAX_QUESTIONS}`}
        </Typography>
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
          '& .MuiLinearProgress-bar': {
            bgcolor: MC.green,
            borderRadius: 4,
          },
        }}
      />

      {/* Diamond counter + mute toggle */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <IconButton
          onClick={() => {
            setMuted((m) => !m)
            tts.cancel()
          }}
          size="small"
          sx={{ color: muted ? MC.stone : MC.diamond, p: 0.5 }}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
        </IconButton>
        <Typography
          sx={{
            fontFamily: MC.font,
            fontSize: '0.5rem',
            color: MC.diamond,
          }}
        >
          💎 {questState.totalCorrect}
        </Typography>
      </Stack>

      {/* Bonus round banner */}
      {question.isBonusRound && (
        <Box
          sx={{
            bgcolor: MC.gold,
            borderRadius: 2,
            p: 1.5,
            textAlign: 'center',
            mb: 2,
            animation: 'bonus-pulse 1.2s ease-in-out infinite',
            '@keyframes bonus-pulse': {
              '0%, 100%': { transform: 'scale(1)' },
              '50%': { transform: 'scale(1.03)' },
            },
          }}
        >
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.6rem',
              color: '#000',
              letterSpacing: 2,
            }}
          >
            BONUS ROUND!
          </Typography>
        </Box>
      )}

      {/* Prompt — every word is tappable for TTS */}
      {passageParts ? (
        /* Comprehension question: instruction + passage + question, with read-aloud button */
        <Box sx={{ mb: 2 }}>
          {/* Instruction line */}
          <Box sx={{ textAlign: 'center', mb: 1 }}>
            <Typography
              component="span"
              sx={{ fontFamily: MC.font, fontSize: '0.6rem', color: MC.stone, lineHeight: 1.8 }}
            >
              {'🧱 '}
            </Typography>
            <TappableText
              text={passageParts.instruction}
              onTapWord={speakWord}
              fontFamily={MC.font}
              fontSize="0.6rem"
              color={MC.stone}
            />
          </Box>

          {/* Read passage aloud button */}
          {!muted && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<VolumeUpIcon />}
              onClick={() => tts.speak(passageParts.passage)}
              sx={{
                mb: 1.5,
                color: MC.diamond,
                borderColor: MC.diamond,
                fontFamily: MC.font,
                fontSize: '0.45rem',
                textTransform: 'none',
                '&:hover': { borderColor: MC.gold, color: MC.gold },
              }}
            >
              Read passage aloud
            </Button>
          )}

          {/* Passage text — tappable words */}
          <Box
            sx={{
              bgcolor: MC.darkStone,
              border: `1px solid ${MC.stone}`,
              borderRadius: 2,
              p: 2,
              mb: 2,
            }}
          >
            <TappableText
              text={passageParts.passage}
              onTapWord={speakWord}
              fontFamily="Georgia, serif"
              fontSize="0.85rem"
              color={MC.white}
              lineHeight={2}
            />
          </Box>

          {/* Question text — tappable words */}
          <Box sx={{ textAlign: 'center' }}>
            <TappableText
              text={passageParts.question}
              onTapWord={speakWord}
              fontFamily={MC.font}
              fontSize="0.7rem"
              color={MC.white}
            />
          </Box>
        </Box>
      ) : (
        /* Non-passage question: single prompt line, all words tappable */
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography
            component="span"
            sx={{ fontFamily: MC.font, fontSize: '0.7rem', color: MC.white, lineHeight: 1.8 }}
          >
            {'🧱 '}
          </Typography>
          <TappableText
            text={question.prompt}
            onTapWord={speakWord}
            fontFamily={MC.font}
            fontSize="0.7rem"
            color={MC.white}
          />
        </Box>
      )}

      {/* Stimulus word — large, centered, Minecraft-style, tappable for TTS */}
      {displayStimulus && (
        <Box
          sx={{
            bgcolor: MC.darkStone,
            border: `2px solid ${MC.diamond}`,
            borderRadius: 2,
            p: 2.5,
            textAlign: 'center',
            mb: 3,
          }}
        >
          <TappableText
            text={displayStimulus}
            onTapWord={speakWord}
            fontFamily={MC.font}
            fontSize="1.4rem"
            color={MC.diamond}
            sx={{ letterSpacing: 6, textTransform: 'lowercase' }}
          />
        </Box>
      )}

      {/* Phoneme display (Levels 1-3 only) */}
      {question.phonemeDisplay && (
        <Typography
          sx={{
            fontFamily: MC.font,
            fontSize: '1rem',
            color: MC.gold,
            textAlign: 'center',
            mb: 3,
            letterSpacing: 4,
          }}
        >
          {question.phonemeDisplay}
        </Typography>
      )}

      {/* Answer cards */}
      <Stack spacing={1.5}>
        {question.options.map((option, i) => {
          const isCorrectOption = option.trim().toLowerCase() === correctLower
          const revealCorrect = revealingAnswer && isCorrectOption
          const revealFade = revealingAnswer && !isCorrectOption

          return (
            <Box
              key={i}
              role="button"
              tabIndex={revealingAnswer ? -1 : 0}
              onClick={() => {
                if (!revealingAnswer) onAnswer(option)
              }}
              onKeyDown={(e) => {
                if (!revealingAnswer && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onAnswer(option)
                }
              }}
              sx={{
                bgcolor: revealCorrect ? 'rgba(126, 252, 32, 0.15)' : MC.darkStone,
                border: `2px solid ${revealCorrect ? MC.green : 'transparent'}`,
                borderRadius: 2,
                p: 2,
                minHeight: 56,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: revealingAnswer ? 'default' : 'pointer',
                opacity: revealFade ? 0.3 : 1,
                transition: 'border-color 0.15s, opacity 0.3s, background-color 0.3s',
                '&:hover': revealingAnswer ? {} : {
                  borderColor: MC.gold,
                },
                '&:focus-visible': revealingAnswer ? {} : {
                  borderColor: MC.gold,
                  outline: 'none',
                },
              }}
            >
              <Box sx={{ textAlign: 'center' }}>
                {revealCorrect && (
                  <Typography
                    component="span"
                    sx={{ fontFamily: MC.font, fontSize: '0.7rem', color: MC.green }}
                  >
                    {'✅ '}
                  </Typography>
                )}
                <TappableText
                  text={option}
                  onTapWord={speakWord}
                  fontFamily={MC.font}
                  fontSize="0.7rem"
                  color={revealCorrect ? MC.green : MC.white}
                />
              </Box>
            </Box>
          )
        })}
      </Stack>

      {/* Voice / Type input — shown for word-reading questions */}
      {showOpenResponse && !revealingAnswer && (
        <OpenResponseInput
          questionId={question.id}
          disabled={revealingAnswer}
          onSubmit={(answer, method) => {
            if (onAnswerWithMethod) {
              onAnswerWithMethod(answer, method)
            } else {
              onAnswer(answer)
            }
          }}
        />
      )}

      {/* Skip button */}
      {showSkip && !revealingAnswer && (
        <Box
          role="button"
          tabIndex={0}
          onClick={handleSkip}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleSkip()
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
            transition: 'border-color 0.15s',
            '&:hover': {
              borderColor: MC.white,
            },
            '&:focus-visible': {
              borderColor: MC.white,
              outline: 'none',
            },
          }}
        >
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.6rem',
              color: MC.stone,
              textAlign: 'center',
            }}
          >
            Skip ⛏️
          </Typography>
        </Box>
      )}

      {/* Answer reveal label */}
      {revealingAnswer && (
        <Typography
          sx={{
            fontFamily: MC.font,
            fontSize: '0.5rem',
            color: MC.green,
            textAlign: 'center',
            mt: 2,
            lineHeight: 1.8,
          }}
        >
          The answer was: {question.correctAnswer}
        </Typography>
      )}
    </Box>
  )
}
