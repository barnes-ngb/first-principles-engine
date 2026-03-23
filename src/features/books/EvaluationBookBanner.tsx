import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'

import type { BookSuggestion } from './useEvaluationBookSuggestions'

interface Props {
  suggestions: BookSuggestion[]
  childName: string
}

/**
 * Banner shown on BookshelfPage when evaluation data suggests
 * generating targeted reading books.
 */
export default function EvaluationBookBanner({ suggestions, childName }: Props) {
  const navigate = useNavigate()

  const handleCreate = useCallback(
    (suggestion: BookSuggestion) => {
      if (suggestion.words.length > 0) {
        navigate('/books/create-story', {
          state: {
            prefillWords: suggestion.words,
            source: 'evaluation',
            theme: suggestion.theme,
          },
        })
      } else {
        navigate('/books/create-story')
      }
    },
    [navigate],
  )

  if (suggestions.length === 0) return null

  // Show the most actionable suggestion (one with words takes priority)
  const primary = suggestions.find((s) => s.words.length > 0) ?? suggestions[0]

  return (
    <Alert
      severity="info"
      icon={<AutoFixHighIcon />}
      sx={{
        '& .MuiAlert-message': { width: '100%' },
      }}
    >
      <Stack spacing={1}>
        <Typography variant="body2" fontWeight={600}>
          Suggested for {childName}
        </Typography>
        <Typography variant="body2">
          {primary.reason}
        </Typography>
        {primary.words.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            Target words: {primary.words.slice(0, 8).join(', ')}
            {primary.words.length > 8 ? ` + ${primary.words.length - 8} more` : ''}
          </Typography>
        )}
        <Button
          variant="outlined"
          size="small"
          startIcon={<AutoFixHighIcon />}
          onClick={() => handleCreate(primary)}
          sx={{ alignSelf: 'flex-start', textTransform: 'none', minHeight: 36 }}
        >
          Create Targeted Story
        </Button>
      </Stack>
    </Alert>
  )
}
