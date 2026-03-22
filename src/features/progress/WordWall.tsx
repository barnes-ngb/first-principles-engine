import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Fab from '@mui/material/Fab'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import WordBlock from './WordBlock'
import WordDetail from './WordDetail'
import PatternSummary from './PatternSummary'
import { useWordWall } from './useWordWall'
import type { WordFilter } from './useWordWall'
import type { WordProgress } from '../../core/types'

const MC = {
  bg: 'rgba(0,0,0,0.92)',
  gold: '#FCDB5B',
  green: '#7EFC20',
  diamond: '#5BFCEE',
  stone: '#8B8B8B',
  darkStone: '#3C3C3C',
  font: '"Press Start 2P", monospace',
} as const

const FILTER_OPTIONS: Array<{ value: WordFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'struggling', label: 'Struggling \uD83D\uDD34' },
  { value: 'emerging', label: 'Emerging \uD83D\uDFE1' },
  { value: 'known', label: 'Known \uD83D\uDFE2' },
  { value: 'not-yet', label: 'Not Yet \u2B1C' },
]

export default function WordWall() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childId = activeChild?.id ?? ''
  const childName = activeChild?.name ?? 'Child'

  const {
    words,
    patterns,
    stats,
    loading,
    filter,
    setFilter,
    strugglingWords,
    markAsKnown,
  } = useWordWall(familyId, childId)

  const [detailWord, setDetailWord] = useState<WordProgress | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedWords, setSelectedWords] = useState<string[]>([])

  const handleToggleSelect = useCallback((word: string) => {
    setSelectedWords((prev) =>
      prev.includes(word) ? prev.filter((w) => w !== word) : [...prev, word],
    )
  }, [])

  const handleGenerateStory = useCallback(
    (wordList?: string[]) => {
      const targetWords = wordList ?? strugglingWords
      if (targetWords.length === 0) return
      navigate('/books/create-story', {
        state: {
          prefillWords: targetWords,
          source: 'word-wall',
          childId,
        },
      })
    },
    [navigate, strugglingWords, childId],
  )

  const handleMarkAsKnown = useCallback(
    async (word: string) => {
      await markAsKnown(word)
      setDetailWord(null)
    },
    [markAsKnown],
  )

  const handleAddToStory = useCallback(
    (word: string) => {
      setDetailWord(null)
      navigate('/books/create-story', {
        state: {
          prefillWords: [word],
          source: 'word-wall',
          childId,
        },
      })
    },
    [navigate, childId],
  )

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    )
  }

  if (stats.total === 0) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ bgcolor: MC.bg, borderRadius: 2, p: 3, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '2rem', mb: 1 }}>&#x26CF;&#xFE0F;</Typography>
          <Typography
            sx={{ fontFamily: MC.font, fontSize: '0.6rem', color: MC.gold, mb: 1 }}
          >
            No words discovered yet
          </Typography>
          <Typography
            sx={{ fontFamily: MC.font, fontSize: '0.4rem', color: MC.stone, lineHeight: 1.8 }}
          >
            Complete a Knowledge Mine quest to start tracking words!
          </Typography>
        </Box>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Box sx={{ bgcolor: MC.bg, borderRadius: 2, p: { xs: 2, md: 3 } }}>
        {/* Header */}
        <Box sx={{ mb: 2 }}>
          <Typography
            sx={{ fontFamily: MC.font, fontSize: '0.7rem', color: MC.gold, mb: 0.5 }}
          >
            &#x26CF;&#xFE0F; {childName}&apos;s Word Wall
          </Typography>
          <Typography
            sx={{ fontFamily: MC.font, fontSize: '0.4rem', color: MC.stone }}
          >
            {stats.total} words discovered &middot; {stats.known} mastered
          </Typography>
        </Box>

        {/* Filter chips */}
        <Stack
          direction="row"
          spacing={0.5}
          flexWrap="wrap"
          useFlexGap
          sx={{ mb: 2 }}
        >
          {FILTER_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              onClick={() => setFilter(opt.value)}
              variant={filter === opt.value ? 'filled' : 'outlined'}
              size="small"
              sx={{
                fontFamily: MC.font,
                fontSize: '0.35rem',
                color: filter === opt.value ? '#000' : MC.stone,
                borderColor: MC.stone,
                ...(filter === opt.value && { bgcolor: MC.gold }),
                minHeight: 32,
              }}
            />
          ))}
        </Stack>

        {/* Select mode toggle */}
        <Box sx={{ mb: 2 }}>
          <Button
            size="small"
            onClick={() => {
              setSelectMode(!selectMode)
              setSelectedWords([])
            }}
            sx={{
              fontFamily: MC.font,
              fontSize: '0.4rem',
              color: selectMode ? MC.gold : MC.stone,
            }}
          >
            {selectMode ? 'Cancel Selection' : 'Select Words'}
          </Button>
        </Box>

        {/* Word grid */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            mb: 3,
          }}
        >
          {words.map((w) => {
            const totalAttempts = w.correctCount + w.wrongCount + w.skippedCount
            return (
              <WordBlock
                key={w.word}
                word={w.word}
                masteryLevel={w.masteryLevel}
                correctCount={w.correctCount}
                totalAttempts={totalAttempts}
                selectMode={selectMode}
                selected={selectedWords.includes(w.word)}
                onToggleSelect={handleToggleSelect}
                onClick={() => setDetailWord(w)}
              />
            )
          })}
        </Box>

        {/* Pattern summary */}
        <PatternSummary patterns={patterns} />

        {/* Action buttons */}
        <Stack spacing={1.5} sx={{ mt: 3 }}>
          {strugglingWords.length > 0 && (
            <Button
              variant="contained"
              fullWidth
              onClick={() => handleGenerateStory()}
              sx={{
                fontFamily: MC.font,
                fontSize: '0.5rem',
                bgcolor: MC.diamond,
                color: '#000',
                minHeight: 48,
                '&:hover': { bgcolor: '#4adccc' },
              }}
            >
              Generate Practice Story ({strugglingWords.length} words)
            </Button>
          )}
        </Stack>
      </Box>

      {/* Floating action button for selected words */}
      {selectMode && selectedWords.length > 0 && (
        <Fab
          variant="extended"
          onClick={() => handleGenerateStory(selectedWords)}
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 16,
            bgcolor: MC.diamond,
            color: '#000',
            fontFamily: MC.font,
            fontSize: '0.4rem',
            '&:hover': { bgcolor: '#4adccc' },
          }}
        >
          Create Story ({selectedWords.length} words)
        </Fab>
      )}

      {/* Word detail dialog */}
      <WordDetail
        word={detailWord}
        open={detailWord !== null}
        onClose={() => setDetailWord(null)}
        onMarkAsKnown={(w) => { void handleMarkAsKnown(w) }}
        onAddToStory={handleAddToStory}
      />
    </Container>
  )
}
