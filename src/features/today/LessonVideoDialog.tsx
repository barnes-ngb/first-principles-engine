import { useCallback, useEffect, useState } from 'react'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import RefreshIcon from '@mui/icons-material/Refresh'
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { ErrorState, LoadingState } from '../../components/states'
import { TaskType, useAI } from '../../core/ai/useAI'

/** Structured best-pick returned by the `lessonVideo` task. */
interface LessonVideoPick {
  title: string
  url: string
  source?: string
  why?: string
  lengthNote?: string
  themeTieIn?: string
}

interface LessonVideoDialogProps {
  open: boolean
  onClose: () => void
  familyId: string
  childId: string
  childName: string
  /** Lesson topic (best of scan topic / title / cleaned label). */
  topic: string
  /** Lesson objective — "what to cover today" (item.contentGuide). */
  lessonObjective?: string
  /** Subject bucket for scoping. */
  subjectBucket?: string
}

/**
 * In-context Lesson Video dialog (FEAT-20, Slice 1). Runs a scoped `lessonVideo`
 * search for one lesson and shows a structured best pick (title, why, length,
 * theme tie-in) with an "Open / cast" link and a "Find another" button that
 * excludes the current url and re-searches. Parent-only; keeps Shelly on Today
 * instead of navigating to the chat. Slice 2 will add a watch-time logger here.
 */
export default function LessonVideoDialog({
  open,
  onClose,
  familyId,
  childId,
  childName,
  topic,
  lessonObjective,
  subjectBucket,
}: LessonVideoDialogProps) {
  const { chat } = useAI()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [pick, setPick] = useState<LessonVideoPick | null>(null)
  // URLs already shown — "Find another" appends and re-searches to get a fresh one.
  const [excluded, setExcluded] = useState<string[]>([])

  const search = useCallback(
    async (exclude: string[]) => {
      if (!familyId || !childId) return
      setLoading(true)
      setError(null)
      try {
        const res = await chat({
          familyId,
          childId,
          taskType: TaskType.LessonVideo,
          messages: [
            {
              role: 'user',
              content: JSON.stringify({
                lessonTopic: topic,
                lessonObjective: lessonObjective || undefined,
                subjectBucket: subjectBucket || undefined,
                exclude,
              }),
            },
          ],
        })
        if (!res) {
          setError(new Error('Couldn’t find a video for this lesson.'))
          return
        }
        const parsed = JSON.parse(res.message) as LessonVideoPick
        if (!parsed?.title || !parsed?.url) {
          throw new Error('Incomplete video result')
        }
        setPick(parsed)
        setExcluded((prev) => [...prev, parsed.url])
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        setLoading(false)
      }
    },
    [chat, familyId, childId, topic, lessonObjective, subjectBucket],
  )

  // Kick off the first search when the dialog opens; reset state on close.
  useEffect(() => {
    if (!open) {
      setPick(null)
      setError(null)
      setExcluded([])
      return
    }
    setPick(null)
    setExcluded([])
    void search([])
    // search identity is stable for a given lesson; run on open only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleFindAnother = () => {
    void search(excluded)
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <OndemandVideoIcon color="primary" fontSize="small" />
        Video for this lesson
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {topic}
          {lessonObjective ? ` — ${lessonObjective}` : ''}
        </Typography>

        {loading && <LoadingState fullHeight label={`Finding a video for ${childName}…`} />}

        {!loading && error && (
          <ErrorState
            message="Couldn’t find a video for this lesson."
            error={error}
            onRetry={() => void search(excluded.slice(0, -1))}
          />
        )}

        {!loading && !error && pick && (
          <Stack spacing={1.5}>
            <Typography variant="h6">{pick.title}</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {pick.source && <Chip size="small" label={pick.source} />}
              {pick.lengthNote && <Chip size="small" variant="outlined" label={pick.lengthNote} />}
            </Stack>
            {pick.why && <Typography variant="body2">{pick.why}</Typography>}
            {pick.themeTieIn && (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {pick.themeTieIn}
              </Typography>
            )}
            <Button
              variant="contained"
              startIcon={<OpenInNewIcon />}
              href={pick.url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ alignSelf: 'flex-start' }}
            >
              Open / cast
            </Button>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          onClick={handleFindAnother}
          startIcon={<RefreshIcon />}
          disabled={loading || !pick}
        >
          Find another
        </Button>
      </DialogActions>
    </Dialog>
  )
}
