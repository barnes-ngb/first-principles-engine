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
import { EmptyState } from '../../components/states'
import type {
  BookProgress,
  ChapterBook,
  ChapterQuestionPoolItem,
  DayLog,
} from '../../core/types'
import { isChapterToGo } from './chapterPool.logic'
import {
  ChapterSaveAudience,
  ChapterSaveRefusal,
  chapterSaveFailureNotice,
  type ChapterSaveOutcome,
} from './chapterSaveOutcome'

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
  /**
   * UX-356(a) — the progress read FAILED, as distinct from "no pool yet".
   * Optional and defaulting to `false`, so every existing caller and test
   * renders exactly as it did.
   */
  bookProgressFailed?: boolean
  /**
   * UX-355, Codex round 1 (P1) — this ANSWERS instead of throwing, so every
   * caller below must read the outcome before discarding what the parent typed.
   * `useBookProgress.updateChapter` used to reject and the `catch` blocks here
   * were what kept the note; converting the rejection into an outcome without
   * teaching the callers about it would have deleted her note on exactly the
   * failure the reporting was added for.
   */
  onChapterAnswered: (
    chapter: number,
    update: Partial<ChapterQuestionPoolItem>,
  ) => Promise<ChapterSaveOutcome>
  dayLog?: DayLog | null
  persistDayLogImmediate?: (updated: DayLog) => void
  onRetryGeneration?: () => void
}

export default function ChapterQuestionPool({
  book,
  bookProgress,
  bookProgressLoading,
  bookProgressFailed = false,
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
  // UX-355 — what this card says when a chapter write did not land. Inline,
  // beside the control, rather than a toast at the top of a long page.
  const [saveError, setSaveError] = useState<string | null>(null)

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
          .filter(isChapterToGo)
          .map((item) => item.chapter),
      )
      const valid = persisted.filter((ch) => unansweredSet.has(ch))
      if (valid.length > 0) {
        setSelectedChapters(new Set(valid))
      }
    }
  }

  // Track how long the loading state has been visible (fallback retry if hook hangs)
  const [showRetry, setShowRetry] = useState(false)
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLoading = Boolean(book) && bookProgressLoading

  useEffect(() => {
    if (!isLoading) return
    loadingTimerRef.current = setTimeout(() => setShowRetry(true), 60_000)
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current)
      setShowRetry(false)
    }
  }, [isLoading])

  // 1. No book selected — render nothing
  if (!book) return null

  // 2. Hook is still fetching the pool doc — show spinner
  if (bookProgressLoading) {
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

  // 3a. UX-356(a) — the READ failed. Not the same thing as "no progress doc",
  // and this is where the difference bites: the state below offers to generate a
  // question pool, which for a book that already has one would replace a real
  // record with a fresh one on the strength of a dropped subscription. A failed
  // read is not an affirmative empty result — the weekly review's "Couldn't read
  // this week's hours" rule, on the page that writes nine collections.
  if (bookProgressFailed) {
    return (
      <SectionCard title={`\u{1F4D6} ${book.title}`}>
        <EmptyState title="Couldn't read this book's chapter questions. They haven't been lost — reload to try again." />
      </SectionCard>
    )
  }

  // 3. Fetch resolved but no progress doc exists — pool never generated
  if (!bookProgress) {
    return (
      <SectionCard title={`\u{1F4D6} ${book.title}`}>
        <EmptyState
          title="Chapter questions haven't been generated yet."
          action={
            onRetryGeneration ? (
              <Button variant="contained" size="small" onClick={() => onRetryGeneration()}>
                Generate chapter questions
              </Button>
            ) : undefined
          }
        />
      </SectionCard>
    )
  }

  const pool = bookProgress.questionPool
  // "To go" = neither answered nor parent-skipped. Skip no longer implies
  // answered (FUNC-07), so it gets its own bucket independent of `answered`.
  const unanswered = pool.filter(isChapterToGo)
  const answered = pool.filter((item) => item.answered && !item.skipped)
  const skipped = pool.filter((item) => item.skipped)
  const doneCount = answered.length + skipped.length

  // All chapters answered — celebration state
  if (unanswered.length === 0) {
    return (
      <SectionCard title={`\u{1F4D6} ${book.title}`}>
        <Stack spacing={2} alignItems="center" sx={{ py: 2 }}>
          {/* UX-11: a book skipped end to end used to get the same \uD83C\uDF89 heading
              over "0 answered \u00B7 17 skipped". Nothing was discussed, so nothing
              is celebrated \u2014 the book is wrapped up, which is true and is
              said plainly. No shame either way: skipping is a real choice. */}
          <Typography variant="h6">
            {answered.length > 0
              ? `\u{1F389} You finished ${book.title}!`
              : `You wrapped up ${book.title}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {answered.length > 0 ? `${answered.length} answered` : null}
            {answered.length > 0 && skipped.length > 0 ? ' \u00B7 ' : null}
            {skipped.length > 0 ? `${skipped.length} skipped` : null}
            {answered.length > 0 || skipped.length > 0 ? ' \u00B7 ' : null}
            {pool.length} chapter{pool.length === 1 ? '' : 's'} total
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
    .filter((item) => isChapterToGo(item) && effectiveSelected.has(item.chapter))
    .sort((a, b) => a.chapter - b.chapter)

  const handleSaveNote = async (item: ChapterQuestionPoolItem) => {
    setSavingChapter(item.chapter)
    setSaveError(null)
    try {
      const note = chapterNotes[item.chapter]
      // Persist note only — do NOT mark answered (kid records audio to complete)
      const outcome = await onChapterAnswered(item.chapter, {
        responseNote: note || undefined,
      })
      if (!outcome.ok) {
        // Her note is still in the box and still hers. Nothing below runs.
        setSaveError(chapterSaveFailureNotice(outcome.reason, ChapterSaveAudience.Parent).text)
        setSavingChapter(null)
        return
      }
      // Clear local note state
      setChapterNotes((prev) => {
        const next = { ...prev }
        delete next[item.chapter]
        return next
      })
    } catch (err) {
      console.error('Chapter note save failed:', err)
      setSaveError(
        chapterSaveFailureNotice(ChapterSaveRefusal.Rejected, ChapterSaveAudience.Parent).text,
      )
    }
    setSavingChapter(null)
  }

  const handleSkipConfirm = async () => {
    if (skipConfirmChapter == null) return
    const chapter = skipConfirmChapter
    setSkipConfirmChapter(null)
    setSkippingChapter(chapter)
    setSaveError(null)
    try {
      // Skip is a parent-only action and must NOT mark the chapter answered
      // (FUNC-07). Skipped chapters are "done for completion" but distinct from
      // answered, so the kid section stays visible until everything is answered
      // or parent-skipped.
      const outcome = await onChapterAnswered(chapter, {
        skipped: true,
      })
      if (!outcome.ok) {
        // The chapter was NOT skipped, so it must stay selected — dropping it
        // from the selection would hide a chapter nothing has recorded.
        setSaveError(chapterSaveFailureNotice(outcome.reason, ChapterSaveAudience.Parent).text)
        setSkippingChapter(null)
        return
      }
      setSelectedChapters((prev) => {
        const next = new Set(prev)
        next.delete(chapter)
        persistSelectedChapters(next)
        return next
      })
    } catch (err) {
      console.error('Chapter skip failed:', err)
      setSaveError(
        chapterSaveFailureNotice(ChapterSaveRefusal.Rejected, ChapterSaveAudience.Parent).text,
      )
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
        {/* UX-355 — a chapter write that did not land, said where she is
            looking. Never a claim that anything was rolled back: this card
            renders off the stored document, which never moved. */}
        {saveError && (
          <Typography variant="body2" color="error.main">
            {saveError}
          </Typography>
        )}

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
