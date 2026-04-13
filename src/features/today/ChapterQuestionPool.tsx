import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import type {
  BookProgress,
  ChapterBook,
  ChapterQuestionPoolItem,
  DayLog,
} from '../../core/types'
import { todayKey } from '../../core/utils/dateKey'

const questionTypeEmoji: Record<string, string> = {
  comprehension: '\u{1F50D}',
  application: '\u{1F30E}',
  connection: '\u{1F517}',
  opinion: '\u{1F4AD}',
  prediction: '\u{1F52E}',
}

interface ChapterQuestionPoolProps {
  book: ChapterBook | null
  bookProgress: BookProgress | null
  bookProgressLoading: boolean
  onChapterAnswered: (
    chapter: number,
    update: Partial<ChapterQuestionPoolItem>,
  ) => Promise<void>
  dayLog?: DayLog | null
  persistDayLogImmediate?: (updated: DayLog) => void
  onRetryGeneration?: () => void
}

export default function ChapterQuestionPool({
  book,
  bookProgress,
  bookProgressLoading,
  onChapterAnswered,
  dayLog,
  persistDayLogImmediate,
  onRetryGeneration,
}: ChapterQuestionPoolProps) {
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(
    new Set(),
  )
  const [chapterNotes, setChapterNotes] = useState<Record<number, string>>({})
  const [savingChapter, setSavingChapter] = useState<number | null>(null)
  const [skipConfirmChapter, setSkipConfirmChapter] = useState<number | null>(
    null,
  )
  const [skippingChapter, setSkippingChapter] = useState<number | null>(null)

  // Restore persisted selections from dayLog when bookProgress first arrives
  const [prevBookProgress, setPrevBookProgress] = useState<BookProgress | null>(
    null,
  )
  if (bookProgress && !prevBookProgress) {
    setPrevBookProgress(bookProgress)
    const persisted = dayLog?.todaysSelectedChapters
    if (persisted && persisted.length > 0) {
      const unansweredSet = new Set(
        bookProgress.questionPool
          .filter((item) => !item.answered)
          .map((item) => item.chapter),
      )
      const valid = persisted.filter((ch) => unansweredSet.has(ch))
      if (valid.length > 0) {
        setSelectedChapters(new Set(valid))
      }
    }
  }

  // Track how long the loading state has been visible
  const [showRetry, setShowRetry] = useState(false)
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLoading = book && (bookProgressLoading || !bookProgress)

  useEffect(() => {
    if (!isLoading) return
    loadingTimerRef.current = setTimeout(() => setShowRetry(true), 60_000)
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current)
      setShowRetry(false)
    }
  }, [isLoading])

  // No book selected — render nothing
  if (!book) return null

  // Book selected but no progress doc yet (pool generation in flight)
  if (bookProgressLoading || !bookProgress) {
    return (
      <SectionCard title={`\u{1F4D6} ${book.title}`}>
        <Stack spacing={1} alignItems="center" sx={{ py: 2 }}>
          <CircularProgress size={24} />
          <Typography variant="body2" color="text.secondary">
            Preparing chapter questions...
          </Typography>
          {showRetry && onRetryGeneration && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => { setShowRetry(false); onRetryGeneration() }}
            >
              Retry generation
            </Button>
          )}
        </Stack>
      </SectionCard>
    )
  }

  const pool = bookProgress.questionPool
  const unanswered = pool.filter((item) => !item.answered)
  const answered = pool.filter((item) => item.answered && !item.skipped)
  const skipped = pool.filter((item) => item.answered && item.skipped)
  const doneCount = answered.length + skipped.length

  // All chapters answered — celebration state
  if (unanswered.length === 0) {
    return (
      <SectionCard title={`\u{1F4D6} ${book.title}`}>
        <Stack spacing={2} alignItems="center" sx={{ py: 2 }}>
          <Typography variant="h6">{'\u{1F389}'} You finished {book.title}!</Typography>
          <Typography variant="body2" color="text.secondary">
            {answered.length} answered{skipped.length > 0 ? ` \u00B7 ${skipped.length} skipped` : ''} \u00B7 {pool.length} chapters total
          </Typography>
          <Button
            variant="outlined"
            size="small"
            href="/planner"
          >
            Pick another book
          </Button>
        </Stack>
      </SectionCard>
    )
  }

  // Auto-select lowest unanswered if nothing selected
  const effectiveSelected =
    selectedChapters.size > 0
      ? selectedChapters
      : new Set([unanswered[0].chapter])

  const persistSelectedChapters = (chapters: Set<number>) => {
    if (!dayLog || !persistDayLogImmediate) return
    persistDayLogImmediate({
      ...dayLog,
      todaysSelectedChapters: [...chapters].sort((a, b) => a - b),
    })
  }

  const toggleChapter = (chapter: number) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev)
      // If nothing was explicitly selected yet, start from the auto-default
      if (prev.size === 0) {
        // Add the auto-selected one plus this toggle
        next.add(unanswered[0].chapter)
      }
      if (next.has(chapter)) {
        next.delete(chapter)
      } else {
        next.add(chapter)
      }
      persistSelectedChapters(next)
      return next
    })
  }

  const selectedItems = pool
    .filter((item) => !item.answered && effectiveSelected.has(item.chapter))
    .sort((a, b) => a.chapter - b.chapter)

  const handleSaveNote = async (item: ChapterQuestionPoolItem) => {
    setSavingChapter(item.chapter)
    try {
      const note = chapterNotes[item.chapter]
      // Persist note only — do NOT mark answered (kid records audio to complete)
      await onChapterAnswered(item.chapter, {
        responseNote: note || undefined,
      })
      // Clear local note state
      setChapterNotes((prev) => {
        const next = { ...prev }
        delete next[item.chapter]
        return next
      })
    } catch (err) {
      console.error('Chapter note save failed:', err)
    }
    setSavingChapter(null)
  }

  const handleSkipConfirm = async () => {
    if (skipConfirmChapter == null) return
    const chapter = skipConfirmChapter
    setSkipConfirmChapter(null)
    setSkippingChapter(chapter)
    try {
      await onChapterAnswered(chapter, {
        answered: true,
        answeredDate: todayKey(),
        skipped: true,
      })
      setSelectedChapters((prev) => {
        const next = new Set(prev)
        next.delete(chapter)
        persistSelectedChapters(next)
        return next
      })
    } catch (err) {
      console.error('Chapter skip failed:', err)
    }
    setSkippingChapter(null)
  }

  // Build progress label
  const progressParts: string[] = []
  if (answered.length > 0) progressParts.push(`${answered.length} answered`)
  if (skipped.length > 0) progressParts.push(`${skipped.length} skipped`)
  if (unanswered.length > 0) progressParts.push(`${unanswered.length} to go`)
  const progressLabel = `${doneCount}/${pool.length} chapters`

  return (
    <SectionCard title={`\u{1F4D6} ${book.title}`}>
      <Stack spacing={2}>
        {/* Progress chip */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Chip
            label={progressLabel}
            size="small"
            color={doneCount > 0 ? 'primary' : 'default'}
            variant="outlined"
          />
          {progressParts.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {progressParts.join(' \u00B7 ')}
            </Typography>
          )}
        </Stack>

        {/* Chapter picker — horizontal scrollable chips */}
        <Stack
          direction="row"
          spacing={0.75}
          sx={{
            overflowX: 'auto',
            flexWrap: 'nowrap',
            pb: 0.5,
            '&::-webkit-scrollbar': { height: 4 },
          }}
        >
          {unanswered.map((item) => (
            <Chip
              key={item.chapter}
              label={
                item.chapterTitle
                  ? `Ch ${item.chapter}: ${item.chapterTitle}`
                  : `Ch ${item.chapter}`
              }
              size="small"
              color={effectiveSelected.has(item.chapter) ? 'primary' : 'default'}
              variant={
                effectiveSelected.has(item.chapter) ? 'filled' : 'outlined'
              }
              onClick={() => toggleChapter(item.chapter)}
              sx={{ flexShrink: 0 }}
            />
          ))}
        </Stack>

        {/* Stacked question cards for selected chapters */}
        {selectedItems.map((item) => {
          const emoji = questionTypeEmoji[item.questionType] ?? '\u2753'
          const isSavingThis = savingChapter === item.chapter
          const isSkippingThis = skippingChapter === item.chapter
          const noteValue = chapterNotes[item.chapter] ?? item.responseNote ?? ''

          return (
            <Box
              key={item.chapter}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Stack spacing={1.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  Ch {item.chapter}
                  {item.chapterTitle ? `: ${item.chapterTitle}` : ''} {emoji}
                </Typography>

                <Typography
                  variant="body1"
                  sx={{ fontStyle: 'italic', fontSize: '1.05rem' }}
                >
                  {item.question}
                </Typography>

                {/* Shelly's note */}
                <TextField
                  label="Shelly's note (optional)"
                  placeholder="What did you notice about the response?"
                  size="small"
                  multiline
                  rows={2}
                  value={noteValue}
                  onChange={(e) =>
                    setChapterNotes((prev) => ({
                      ...prev,
                      [item.chapter]: e.target.value,
                    }))
                  }
                  disabled={isSavingThis}
                />

                <Stack direction="row" spacing={1}>
                  {/* Save note button */}
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => handleSaveNote(item)}
                    disabled={isSavingThis || !noteValue.trim()}
                  >
                    {isSavingThis ? 'Saving...' : 'Save Note'}
                  </Button>

                  {/* Skip button */}
                  <Button
                    variant="text"
                    size="small"
                    color="inherit"
                    onClick={() => setSkipConfirmChapter(item.chapter)}
                    disabled={isSavingThis || isSkippingThis}
                    sx={{ color: 'text.secondary' }}
                  >
                    {isSkippingThis ? 'Skipping...' : 'Skip this chapter'}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )
        })}

        {/* Skip confirmation dialog */}
        <Dialog
          open={skipConfirmChapter != null}
          onClose={() => setSkipConfirmChapter(null)}
        >
          <DialogTitle>Skip Chapter {skipConfirmChapter}?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This chapter won&apos;t be asked again. You can still see it in Records.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSkipConfirmChapter(null)}>Cancel</Button>
            <Button onClick={handleSkipConfirm} color="warning">
              Skip
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </SectionCard>
  )
}
