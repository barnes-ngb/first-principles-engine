import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { sanitizeStimulus } from './questHelpers'
import type { QuestQuestion, QuestState } from './questTypes'
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

interface QuestQuestionScreenProps {
  question: QuestQuestion
  questState: QuestState
  consecutiveWrong: number
  onAnswer: (answer: string) => void
  onSkip: () => void
}

export default function QuestQuestionScreen({
  question,
  questState,
  consecutiveWrong,
  onAnswer,
  onSkip,
}: QuestQuestionScreenProps) {
  const progress = (questState.totalQuestions / MAX_QUESTIONS) * 100

  const [timerElapsed, setTimerElapsed] = useState(false)
  const [revealingAnswer, setRevealingAnswer] = useState(false)
  const [prevQuestionId, setPrevQuestionId] = useState(question.id)

  // Reset state when question changes (React-recommended pattern for derived state)
  if (prevQuestionId !== question.id) {
    setPrevQuestionId(question.id)
    setTimerElapsed(false)
    setRevealingAnswer(false)
  }

  // Show skip button after 8 seconds on current question
  useEffect(() => {
    const timer = setTimeout(() => setTimerElapsed(true), 8000)
    return () => clearTimeout(timer)
  }, [question.id])

  // Show skip if timer elapsed or 2+ consecutive wrong
  const showSkip = timerElapsed || consecutiveWrong >= 2

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
          ⛏️ Reading Quest — Level {questState.currentLevel}
        </Typography>
        <Typography
          sx={{
            fontFamily: MC.font,
            fontSize: '0.45rem',
            color: MC.stone,
          }}
        >
          {questState.totalQuestions + 1}/{MAX_QUESTIONS}
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

      {/* Diamond counter */}
      <Typography
        sx={{
          fontFamily: MC.font,
          fontSize: '0.5rem',
          color: MC.diamond,
          textAlign: 'right',
          mb: 2,
        }}
      >
        💎 {questState.totalCorrect}
      </Typography>

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

      {/* Prompt */}
      <Typography
        sx={{
          fontFamily: MC.font,
          fontSize: '0.7rem',
          color: MC.white,
          textAlign: 'center',
          mb: 2,
          lineHeight: 1.8,
        }}
      >
        🧱 {question.prompt}
      </Typography>

      {/* Stimulus word — large, centered, Minecraft-style */}
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
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '1.4rem',
              color: MC.diamond,
              letterSpacing: 6,
              textTransform: 'lowercase',
            }}
          >
            {displayStimulus}
          </Typography>
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
              <Typography
                sx={{
                  fontFamily: MC.font,
                  fontSize: '0.7rem',
                  color: revealCorrect ? MC.green : MC.white,
                  textAlign: 'center',
                }}
              >
                {revealCorrect ? `✅ ${option}` : option}
              </Typography>
            </Box>
          )
        })}
      </Stack>

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
