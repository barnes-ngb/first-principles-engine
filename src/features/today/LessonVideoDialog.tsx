import { useCallback, useEffect, useState } from 'react'
import { addDoc } from 'firebase/firestore'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import RefreshIcon from '@mui/icons-material/Refresh'
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { ErrorState, LoadingState } from '../../components/states'
import { TaskType, useAI } from '../../core/ai/useAI'
import { hoursAdjustmentsCollection } from '../../core/firebase/firestore'
import type { SubjectBucket } from '../../core/types/enums'
import { assertAttributed } from '../records/records.logic'

/** Quick watch-time durations offered in the in-dialog logger. */
const WATCH_DURATIONS = [15, 30, 45] as const

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
  /** Checklist date (YYYY-MM-DD) — watch time is logged against this day. */
  date: string
  /** Lesson topic (best of scan topic / title / cleaned label). */
  topic: string
  /** Lesson objective — "what to cover today" (item.contentGuide). */
  lessonObjective?: string
  /** Subject bucket for scoping + the bucket watch time counts toward. */
  subjectBucket?: string
}

/**
 * In-context Lesson Video dialog (FEAT-20, Slice 1; FEAT-22, Slice 2). Runs a
 * scoped `lessonVideo` search for one lesson and shows a structured best pick
 * (title, why, length, theme tie-in) with an "Open / cast" link and a "Find
 * another" button that excludes the current url and re-searches. Below the
 * result, a "Log watch time" section writes a duration-chip pick to hours under
 * the lesson's subject (counts toward core for a core subject; source
 * 'video-watch'), so finding and logging live in one popup. Parent-only; keeps
 * Shelly on Today instead of navigating to the chat.
 */
export default function LessonVideoDialog({
  open,
  onClose,
  familyId,
  childId,
  childName,
  date,
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
  // Watch-time logger state (FEAT-22): in-flight write + last-logged confirmation.
  const [logging, setLogging] = useState(false)
  const [loggedMinutes, setLoggedMinutes] = useState<number | null>(null)
  const [logError, setLogError] = useState<string | null>(null)

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
      setLoggedMinutes(null)
      setLogError(null)
      return
    }
    setPick(null)
    setExcluded([])
    setLoggedMinutes(null)
    setLogError(null)
    void search([])
    // search identity is stable for a given lesson; run on open only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleFindAnother = () => {
    void search(excluded)
  }

  // Log watch time to hours under the lesson's subject (FEAT-22). DATA-05:
  // guard on familyId/childId and route through assertAttributed so a watch
  // entry can never land unattributed.
  const handleLogWatchTime = useCallback(
    async (minutes: number) => {
      if (!familyId || !childId) return
      setLogging(true)
      setLogError(null)
      try {
        await addDoc(
          hoursAdjustmentsCollection(familyId),
          assertAttributed({
            childId,
            date,
            subjectBucket: subjectBucket as SubjectBucket | undefined,
            minutes,
            reason: `Watched video: ${topic}`,
            source: 'video-watch',
            createdAt: new Date().toISOString(),
          }),
        )
        setLoggedMinutes(minutes)
      } catch (err) {
        console.error('Watch-time log failed:', err)
        setLogError('Couldn’t log watch time. Try again.')
      } finally {
        setLogging(false)
      }
    },
    [familyId, childId, date, subjectBucket, topic],
  )

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

            {/* FEAT-22: in-dialog watch-time logger — counts toward the
                lesson's subject (core if core), source 'video-watch'. */}
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="subtitle2">Log watch time</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {WATCH_DURATIONS.map((minutes) => (
                <Chip
                  key={minutes}
                  label={`${minutes} min`}
                  onClick={() => void handleLogWatchTime(minutes)}
                  disabled={logging}
                  color={loggedMinutes === minutes ? 'success' : 'default'}
                  variant={loggedMinutes === minutes ? 'filled' : 'outlined'}
                />
              ))}
            </Stack>
            {loggedMinutes != null && (
              <Typography
                variant="body2"
                color="success.main"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                <CheckCircleIcon fontSize="small" />
                Logged {loggedMinutes}m for {childName}
                {subjectBucket ? ` under ${subjectBucket}` : ''}.
              </Typography>
            )}
            {logError && (
              <Typography variant="body2" color="error.main">
                {logError}
              </Typography>
            )}
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
