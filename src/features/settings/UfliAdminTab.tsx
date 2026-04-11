import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import {
  ufliLessonsCollection,
  ufliProgressDoc,
} from '../../core/firebase/firestore'
import type { UFLILesson, UFLIProgress } from '../../core/types'
import { DEFAULT_UFLI_PROGRESS } from '../../core/ufli/getUfliProgress'
import { setStartingLesson } from '../../core/ufli/setLincolnStartingLesson'

export default function UfliAdminTab() {
  const familyId = useFamilyId()
  const { children, activeChildId, setActiveChildId } = useActiveChild()

  const [progress, setProgress] = useState<UFLIProgress | null>(null)
  const [currentLesson, setCurrentLesson] = useState<UFLILesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{
    severity: 'success' | 'error'
    message: string
  } | null>(null)

  // Listen to UFLI progress for active child
  useEffect(() => {
    if (!familyId || !activeChildId) return
    setLoading(true)
    const unsub = onSnapshot(
      ufliProgressDoc(familyId, activeChildId),
      (snap) => {
        const data = snap.exists() ? snap.data() : null
        setProgress(data ?? { ...DEFAULT_UFLI_PROGRESS })
        setLoading(false)
      },
      (err) => {
        console.error('[UfliAdminTab] Progress listen failed:', err)
        setProgress({ ...DEFAULT_UFLI_PROGRESS })
        setLoading(false)
      },
    )
    return unsub
  }, [familyId, activeChildId])

  // Load current lesson details when progress changes
  useEffect(() => {
    if (!familyId || !progress) {
      setCurrentLesson(null)
      return
    }
    const lessonNum = progress.currentLesson
    const lessonRef = doc(ufliLessonsCollection(familyId), String(lessonNum))
    getDoc(lessonRef)
      .then((snap) => {
        setCurrentLesson(snap.exists() ? (snap.data() as UFLILesson) : null)
      })
      .catch(() => setCurrentLesson(null))
  }, [familyId, progress?.currentLesson, progress])

  const handleSetToLesson62 = useCallback(async () => {
    if (!activeChildId) return
    setSaving(true)
    try {
      await setStartingLesson(familyId, activeChildId, 62)
      setFeedback({ severity: 'success', message: 'Set to Lesson 62.' })
    } catch (err) {
      console.error('[UfliAdminTab] Set lesson 62 failed:', err)
      setFeedback({ severity: 'error', message: 'Failed to set lesson.' })
    } finally {
      setSaving(false)
    }
  }, [familyId, activeChildId])

  const handleAdvance = useCallback(async () => {
    if (!activeChildId || !progress) return
    const next = Math.min(progress.currentLesson + 1, 128)
    setSaving(true)
    try {
      await setStartingLesson(familyId, activeChildId, next)
      setFeedback({ severity: 'success', message: `Advanced to Lesson ${next}.` })
    } catch (err) {
      console.error('[UfliAdminTab] Advance failed:', err)
      setFeedback({ severity: 'error', message: 'Failed to advance.' })
    } finally {
      setSaving(false)
    }
  }, [familyId, activeChildId, progress])

  const handleGoBack = useCallback(async () => {
    if (!activeChildId || !progress) return
    const prev = Math.max(progress.currentLesson - 1, 1)
    setSaving(true)
    try {
      await setStartingLesson(familyId, activeChildId, prev)
      setFeedback({ severity: 'success', message: `Moved back to Lesson ${prev}.` })
    } catch (err) {
      console.error('[UfliAdminTab] Go back failed:', err)
      setFeedback({ severity: 'error', message: 'Failed to go back.' })
    } finally {
      setSaving(false)
    }
  }, [familyId, activeChildId, progress])

  const activeChild = children.find((c) => c.id === activeChildId)

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  return (
    <Stack spacing={3}>
      <Alert severity="info" variant="outlined">
        These controls are for Nathan during setup. Normal lesson advancement
        happens automatically after the weekly encoding check.
      </Alert>

      {/* Child selector chips */}
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {children.map((child) => (
          <Chip
            key={child.id}
            label={child.name}
            color={child.id === activeChildId ? 'primary' : 'default'}
            variant={child.id === activeChildId ? 'filled' : 'outlined'}
            onClick={() => setActiveChildId(child.id ?? '')}
          />
        ))}
      </Stack>

      {activeChild && progress && (
        <Stack spacing={2}>
          <Typography variant="h6">
            {activeChild.name} — UFLI Progress
          </Typography>

          <Stack spacing={1}>
            <Typography variant="body1">
              <strong>Current Lesson:</strong> {progress.currentLesson}
              {currentLesson ? ` — ${currentLesson.concept}` : ''}
            </Typography>

            {currentLesson && currentLesson.targetGraphemes.length > 0 && (
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                <Typography variant="body2" color="text.secondary">
                  Graphemes:
                </Typography>
                {currentLesson.targetGraphemes.map((g) => (
                  <Chip key={g} label={g} size="small" variant="outlined" />
                ))}
              </Stack>
            )}

            <Typography variant="body2" color="text.secondary">
              <strong>Mastered Lessons:</strong>{' '}
              {progress.masteredLessons.length} of 128
            </Typography>

            <Typography variant="body2" color="text.secondary">
              <strong>Last Encoding Score:</strong>{' '}
              {progress.lastEncodingScore != null
                ? `${progress.lastEncodingScore}% (${progress.lastEncodingDate})`
                : 'Not yet assessed'}
            </Typography>
          </Stack>

          <Divider />

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              variant="contained"
              size="small"
              onClick={handleSetToLesson62}
              disabled={saving}
            >
              Set to Lesson 62
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={handleAdvance}
              disabled={saving || progress.currentLesson >= 128}
            >
              Advance Lesson (+1)
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={handleGoBack}
              disabled={saving || progress.currentLesson <= 1}
            >
              Back a Lesson (-1)
            </Button>
          </Stack>

          {feedback && (
            <Alert
              severity={feedback.severity}
              onClose={() => setFeedback(null)}
            >
              {feedback.message}
            </Alert>
          )}
        </Stack>
      )}
    </Stack>
  )
}
