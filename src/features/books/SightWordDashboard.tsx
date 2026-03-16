import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'

import Page from '../../components/Page'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { SightWordProgress } from '../../core/types/domain'
import { useSightWordProgress } from './useSightWordProgress'
import { summarizeMastery } from './sightWordMastery'

const LEVEL_COLORS: Record<SightWordProgress['masteryLevel'], string> = {
  mastered: '#4caf50',
  familiar: '#2196f3',
  practicing: '#ffc107',
  new: '#e0e0e0',
}

const LEVEL_LABELS: Record<SightWordProgress['masteryLevel'], string> = {
  mastered: 'Mastered',
  familiar: 'Familiar',
  practicing: 'Practicing',
  new: 'New',
}

export default function SightWordDashboard() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childName = activeChild?.name ?? ''
  const childId = activeChild?.id ?? ''

  const { allProgress, loading, confirmMastery, getWeakWords } = useSightWordProgress(familyId, childId)
  const [selectedWord, setSelectedWord] = useState<SightWordProgress | null>(null)

  const summary = useMemo(() => summarizeMastery(allProgress), [allProgress])

  const masteredPct = summary.total > 0 ? Math.round((summary.mastered / summary.total) * 100) : 0

  const sortedProgress = useMemo(() => {
    const order: Record<SightWordProgress['masteryLevel'], number> = {
      new: 0, practicing: 1, familiar: 2, mastered: 3,
    }
    return [...allProgress].sort((a, b) => order[a.masteryLevel] - order[b.masteryLevel])
  }, [allProgress])

  const handleGenerateFromWeak = useCallback(() => {
    const weakWords = getWeakWords()
    const params = new URLSearchParams()
    if (weakWords.length > 0) {
      params.set('words', weakWords.join(','))
    }
    navigate(`/books/create-story?${params.toString()}`)
  }, [getWeakWords, navigate])

  const handleConfirmMastered = useCallback(async () => {
    if (!selectedWord) return
    await confirmMastery(selectedWord.word, true)
    setSelectedWord(null)
  }, [selectedWord, confirmMastery])

  const handleMarkNeedsWork = useCallback(async () => {
    if (!selectedWord) return
    await confirmMastery(selectedWord.word, false)
    setSelectedWord(null)
  }, [selectedWord, confirmMastery])

  if (loading) {
    return (
      <Page>
        <Stack alignItems="center" py={4}>
          <CircularProgress />
        </Stack>
      </Page>
    )
  }

  return (
    <Page>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/books')}
          sx={{ minHeight: 44 }}
        >
          Back
        </Button>
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>
          {childName}&apos;s Sight Words
        </Typography>
      </Stack>

      {allProgress.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No sight words tracked yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create a sight word story to start tracking progress!
          </Typography>
          <Button
            variant="contained"
            startIcon={<AutoFixHighIcon />}
            onClick={() => navigate('/books/create-story')}
            sx={{ minHeight: 48 }}
          >
            Create Sight Word Story
          </Button>
        </Box>
      ) : (
        <>
          {/* Summary bar */}
          <Box>
            <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
              <Typography variant="body2">
                <strong>{summary.mastered}</strong> Mastered
              </Typography>
              <Typography variant="body2">
                <strong>{summary.familiar}</strong> Familiar
              </Typography>
              <Typography variant="body2">
                <strong>{summary.practicing}</strong> Practicing
              </Typography>
              <Typography variant="body2">
                <strong>{summary.newCount}</strong> New
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={masteredPct}
              sx={{
                height: 10,
                borderRadius: 5,
                bgcolor: 'grey.200',
                '& .MuiLinearProgress-bar': { bgcolor: '#4caf50' },
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {masteredPct}% mastered ({summary.total} words tracked)
            </Typography>
          </Box>

          {/* Generate from weak words */}
          <Button
            variant="outlined"
            startIcon={<AutoFixHighIcon />}
            onClick={handleGenerateFromWeak}
            sx={{ minHeight: 48, alignSelf: 'flex-start' }}
          >
            Generate Story from Weak Words
          </Button>

          {/* Word grid */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            {sortedProgress.map((p) => (
              <Chip
                key={p.word}
                label={p.word}
                onClick={() => setSelectedWord(p)}
                sx={{
                  bgcolor: LEVEL_COLORS[p.masteryLevel],
                  color: p.masteryLevel === 'new' ? 'text.primary' : '#fff',
                  fontWeight: 600,
                  minHeight: 36,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  '&:hover': { filter: 'brightness(0.9)' },
                }}
              />
            ))}
          </Box>

          {/* Color key */}
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            {(Object.entries(LEVEL_COLORS) as [SightWordProgress['masteryLevel'], string][]).map(([level, color]) => (
              <Stack key={level} direction="row" spacing={0.5} alignItems="center">
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color }} />
                <Typography variant="caption">{LEVEL_LABELS[level]}</Typography>
              </Stack>
            ))}
          </Stack>
        </>
      )}

      {/* Word detail dialog */}
      <Dialog
        open={!!selectedWord}
        onClose={() => setSelectedWord(null)}
        maxWidth="xs"
        fullWidth
      >
        {selectedWord && (
          <>
            <DialogTitle>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h5" fontWeight={700}>
                  {selectedWord.word}
                </Typography>
                <Chip
                  label={LEVEL_LABELS[selectedWord.masteryLevel]}
                  size="small"
                  sx={{
                    bgcolor: LEVEL_COLORS[selectedWord.masteryLevel],
                    color: selectedWord.masteryLevel === 'new' ? 'text.primary' : '#fff',
                    fontWeight: 600,
                  }}
                />
              </Stack>
            </DialogTitle>
            <DialogContent>
              <Stack spacing={1}>
                <Typography variant="body2">
                  Encounters: <strong>{selectedWord.encounters}</strong> times
                </Typography>
                <Typography variant="body2">
                  Self-reported known: <strong>{selectedWord.selfReportedKnown}</strong> times
                </Typography>
                <Typography variant="body2">
                  Help requested: <strong>{selectedWord.helpRequested}</strong> times
                </Typography>
                <Typography variant="body2">
                  First seen: {new Date(selectedWord.firstSeen).toLocaleDateString()}
                </Typography>
                <Typography variant="body2">
                  Last seen: {new Date(selectedWord.lastSeen).toLocaleDateString()}
                </Typography>
                {selectedWord.shellyConfirmed && (
                  <Typography variant="body2" color="success.main" fontWeight={600}>
                    Parent confirmed mastered
                  </Typography>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedWord(null)}>Close</Button>
              <Button
                color="warning"
                onClick={() => { void handleMarkNeedsWork() }}
              >
                Needs Work
              </Button>
              <Button
                variant="contained"
                color="success"
                onClick={() => { void handleConfirmMastered() }}
              >
                Mark as Mastered
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Page>
  )
}
