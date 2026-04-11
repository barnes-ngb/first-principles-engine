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
  const [progressExists, setProgressExists] = useState(false)
  const [lesson, setLesson] = useState<UFLILesson | null>(null)
  const [lessonLoaded, setLessonLoaded] = useState(false)
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
        setProgressExists(snap.exists())
        setProgress(snap.exists() ? snap.data() : null)
        setLoading(false)
      },
      () => {
        setProgressExists(false)
        setProgress(null)
        setLoading(false)
      },
    )
    return unsub
  }, [familyId, childId])

  // Load current lesson details
  useEffect(() => {
    if (!familyId || !progress) {
      setLesson(null)
      setLessonLoaded(false)
      return
    }
    setLessonLoaded(false)
    const lessonRef = doc(
      ufliLessonsCollection(familyId),
      String(progress.currentLesson),
    )
    getDoc(lessonRef)
      .then((snap) => {
        setLesson(snap.exists() ? snap.data() : null)
        setLessonLoaded(true)
      })
      .catch(() => {
        setLesson(null)
        setLessonLoaded(true)
      })
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

  // ── Loading state ────────────────────────────────────────────
  if (loading) {
    return (
      <SectionCard title={`${childName}'s Phonics`}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Loading UFLI progress...
          </Typography>
        </Box>
      </SectionCard>
    )
  }

  // ── Progress not initialized ─────────────────────────────────
  if (!progressExists || !progress) {
    return (
      <SectionCard title={`${childName}'s Phonics`}>
        <Alert severity="info">
          UFLI progress not initialized. Run the seed script or use
          Progress &gt; Curriculum to set starting lesson.
        </Alert>
      </SectionCard>
    )
  }

  const lessonNum = progress.currentLesson

  // ── Lesson data missing ──────────────────────────────────────
  if (lessonLoaded && !lesson) {
    return (
      <SectionCard title={`${childName}'s Phonics \u2014 Lesson ${lessonNum}`}>
        <Alert severity="warning">
          Lesson data missing \u2014 run{' '}
          <Typography component="code" variant="body2" sx={{ fontFamily: 'monospace' }}>
            npm run seed:ufli
          </Typography>
        </Alert>
      </SectionCard>
    )
  }

  // ── Normal render ────────────────────────────────────────────
  const concept = lesson?.concept
  const graphemes = lesson?.targetGraphemes ?? []
  const heartWords = lesson?.heartWords ?? []
  const slideUrl = lesson?.toolboxSlideUrl

  return (
    <SectionCard
      title={`${childName}'s Phonics \u2014 Lesson ${lessonNum}${concept ? `: ${concept}` : ''}`}
    >
      <Stack spacing={1.5}>
        {/* Lesson details still loading */}
        {!lessonLoaded && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">
              Loading lesson details...
            </Typography>
          </Box>
        )}

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

        {heartWords.length === 0 && lessonLoaded && (
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
        ) : lessonLoaded ? (
          <Alert severity="info" variant="outlined">
            Slide link not set \u2014 add via Progress &gt; Curriculum
          </Alert>
        ) : null}

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
