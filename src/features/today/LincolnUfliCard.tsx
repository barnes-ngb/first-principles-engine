import { useCallback, useEffect, useState } from 'react'
import { addDoc, doc, getDoc, onSnapshot } from 'firebase/firestore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import {
  hoursAdjustmentsCollection,
  ufliLessonsCollection,
  ufliProgressDoc,
} from '../../core/firebase/firestore'
import type { UFLILesson, UFLIProgress } from '../../core/types'
import { DEFAULT_UFLI_PROGRESS } from '../../core/ufli/getUfliProgress'

interface LincolnUfliCardProps {
  familyId: string
  childId: string
  childName: string
  today: string
}

export default function LincolnUfliCard({
  familyId,
  childId,
  childName,
  today,
}: LincolnUfliCardProps) {
  const [progress, setProgress] = useState<UFLIProgress | null>(null)
  const [lesson, setLesson] = useState<UFLILesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [completedToday, setCompletedToday] = useState(false)

  // Listen to UFLI progress
  useEffect(() => {
    if (!familyId || !childId) return
    setLoading(true)
    const unsub = onSnapshot(
      ufliProgressDoc(familyId, childId),
      (snap) => {
        setProgress(snap.exists() ? snap.data() : { ...DEFAULT_UFLI_PROGRESS })
        setLoading(false)
      },
      () => {
        setProgress({ ...DEFAULT_UFLI_PROGRESS })
        setLoading(false)
      },
    )
    return unsub
  }, [familyId, childId])

  // Load current lesson details
  useEffect(() => {
    if (!familyId || !progress) {
      setLesson(null)
      return
    }
    const lessonRef = doc(
      ufliLessonsCollection(familyId),
      String(progress.currentLesson),
    )
    getDoc(lessonRef)
      .then((snap) => setLesson(snap.exists() ? snap.data() : null))
      .catch(() => setLesson(null))
  }, [familyId, progress?.currentLesson, progress])

  const handleMarkComplete = useCallback(async () => {
    if (!progress || completedToday) return
    setCompleting(true)
    try {
      // Log hours to Language Arts
      await addDoc(hoursAdjustmentsCollection(familyId), {
        childId,
        date: today,
        subjectBucket: 'LanguageArts',
        minutes: 30,
        reason: `UFLI Lesson ${progress.currentLesson}: ${lesson?.concept ?? 'Phonics'}`,
        createdAt: new Date().toISOString(),
      })
      setCompletedToday(true)
    } catch (err) {
      console.error('[LincolnUfliCard] Failed to log session:', err)
    } finally {
      setCompleting(false)
    }
  }, [familyId, childId, today, progress, lesson, completedToday])

  if (loading) {
    return (
      <SectionCard title={`${childName}'s Phonics`}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={20} />
          <Typography color="text.secondary">Loading UFLI progress...</Typography>
        </Box>
      </SectionCard>
    )
  }

  if (!progress) return null

  const lessonNum = progress.currentLesson
  const concept = lesson?.concept ?? 'Loading...'
  const graphemes = lesson?.targetGraphemes ?? []
  const heartWords = lesson?.heartWords ?? []
  const slideUrl = lesson?.toolboxSlideUrl

  return (
    <SectionCard
      title={`${childName}'s Phonics — Lesson ${lessonNum}: ${concept}`}
    >
      <Stack spacing={1.5}>
        {/* Target graphemes */}
        {graphemes.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Graphemes:
            </Typography>
            {graphemes.map((g) => (
              <Chip
                key={g}
                label={g}
                size="small"
                color="primary"
                variant="outlined"
              />
            ))}
          </Stack>
        )}

        {/* Heart words */}
        {heartWords.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Heart Words:
            </Typography>
            {heartWords.map((w) => (
              <Chip
                key={w}
                label={w}
                size="small"
                color="secondary"
                variant="outlined"
              />
            ))}
          </Stack>
        )}

        {heartWords.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No heart words for this lesson.
          </Typography>
        )}

        {/* Toolbox slides link */}
        {slideUrl ? (
          <Button
            variant="outlined"
            size="small"
            endIcon={<OpenInNewIcon />}
            href={slideUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open UFLI Toolbox slides
          </Button>
        ) : (
          <Alert severity="info" variant="outlined">
            Slide link not set — add via Settings &gt; UFLI Progress
          </Alert>
        )}

        {/* Mark complete */}
        {completedToday ? (
          <Alert severity="success">
            Lesson {lessonNum} logged for today.
          </Alert>
        ) : (
          <Button
            variant="contained"
            size="small"
            onClick={handleMarkComplete}
            disabled={completing}
          >
            {completing ? 'Logging...' : 'Lesson done for today'}
          </Button>
        )}
      </Stack>
    </SectionCard>
  )
}
