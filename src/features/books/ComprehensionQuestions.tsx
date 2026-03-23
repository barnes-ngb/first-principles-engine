import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Collapse from '@mui/material/Collapse'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import QuizIcon from '@mui/icons-material/Quiz'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'

import type { ComprehensionQuestion } from './useComprehensionQuestions'

interface Props {
  questions: ComprehensionQuestion[]
  loading: boolean
  error: string | null
  onGenerate: () => void
  isLincoln: boolean
}

const TYPE_LABELS: Record<ComprehensionQuestion['type'], string> = {
  recall: 'What happened?',
  inference: 'Think about it',
  opinion: 'Your thoughts',
}

const TYPE_COLORS: Record<ComprehensionQuestion['type'], string> = {
  recall: '#2196f3',
  inference: '#ff9800',
  opinion: '#9c27b0',
}

export default function ComprehensionQuestions({
  questions,
  loading,
  error,
  onGenerate,
  isLincoln,
}: Props) {
  const [revealedAnswers, setRevealedAnswers] = useState<Set<number>>(new Set())
  const [answeredCount, setAnsweredCount] = useState(0)

  const toggleAnswer = (index: number) => {
    setRevealedAnswers((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
        if (!prev.has(index)) {
          setAnsweredCount((c) => c + 1)
        }
      }
      return next
    })
  }

  if (questions.length === 0 && !loading) {
    return (
      <Button
        variant="outlined"
        size="small"
        startIcon={loading ? <CircularProgress size={16} /> : <QuizIcon />}
        onClick={onGenerate}
        disabled={loading}
        sx={{ minHeight: 40, textTransform: 'none' }}
      >
        Comprehension Check
      </Button>
    )
  }

  if (loading) {
    return (
      <Stack alignItems="center" spacing={1} sx={{ py: 2 }}>
        <CircularProgress size={24} />
        <Typography variant="body2" color="text.secondary">
          Thinking of questions...
        </Typography>
      </Stack>
    )
  }

  if (error) {
    return (
      <Stack spacing={1} sx={{ py: 1 }}>
        <Typography variant="body2" color="error">
          {error}
        </Typography>
        <Button variant="outlined" size="small" onClick={onGenerate}>
          Try again
        </Button>
      </Stack>
    )
  }

  const allAnswered = answeredCount >= questions.length

  return (
    <Stack spacing={2} sx={{ py: 1, width: '100%', maxWidth: 500 }}>
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 700,
          fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
          fontSize: isLincoln ? '0.6rem' : undefined,
        }}
      >
        {isLincoln ? 'Quiz Time!' : 'Let\'s check!'}
      </Typography>

      {questions.map((q, i) => (
        <Box
          key={i}
          sx={{
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: revealedAnswers.has(i) ? TYPE_COLORS[q.type] : 'divider',
            bgcolor: revealedAnswers.has(i)
              ? `${TYPE_COLORS[q.type]}10`
              : isLincoln
                ? 'rgba(255,255,255,0.03)'
                : 'grey.50',
            transition: 'all 0.2s',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <Chip
              label={TYPE_LABELS[q.type]}
              size="small"
              sx={{
                height: 22,
                fontSize: '0.65rem',
                fontWeight: 600,
                bgcolor: `${TYPE_COLORS[q.type]}20`,
                color: TYPE_COLORS[q.type],
              }}
            />
          </Stack>

          <Typography
            variant="body1"
            sx={{
              fontWeight: 600,
              fontSize: '1rem',
              lineHeight: 1.5,
              color: isLincoln ? '#e0e0e0' : 'text.primary',
            }}
          >
            {q.question}
          </Typography>

          <Box sx={{ mt: 1 }}>
            <Button
              size="small"
              onClick={() => toggleAnswer(i)}
              sx={{ textTransform: 'none', minHeight: 32, fontSize: '0.8rem' }}
            >
              {revealedAnswers.has(i) ? 'Hide answer' : 'Show answer'}
            </Button>
            <Collapse in={revealedAnswers.has(i)}>
              <Typography
                variant="body2"
                sx={{
                  mt: 1,
                  p: 1,
                  borderRadius: 1,
                  bgcolor: isLincoln ? 'rgba(255,255,255,0.05)' : 'grey.100',
                  color: isLincoln ? '#b0b0b0' : 'text.secondary',
                  fontStyle: 'italic',
                }}
              >
                {q.answer}
              </Typography>
            </Collapse>
          </Box>
        </Box>
      ))}

      {allAnswered && (
        <Stack direction="row" alignItems="center" spacing={1} justifyContent="center">
          <CheckCircleIcon sx={{ color: 'success.main' }} />
          <Typography variant="body2" color="success.main" fontWeight={600}>
            {isLincoln ? 'Quest complete!' : 'Great job!'}
          </Typography>
        </Stack>
      )}
    </Stack>
  )
}
