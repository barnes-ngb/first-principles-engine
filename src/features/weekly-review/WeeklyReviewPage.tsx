import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import EventNoteIcon from '@mui/icons-material/EventNote'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

import ChildSelector from '../../components/ChildSelector'
import HelpStrip from '../../components/HelpStrip'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { app } from '../../core/firebase/firebase'
import { weeklyReviewsCollection, weeklyReviewDocId } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { PaceAdjustment, WeeklyReview } from '../../core/types'
import { AdjustmentDecision, ReviewStatus } from '../../core/types/enums'
import { lastCompletedWeekKey } from '../../core/utils/time'
import { formatWeekShort } from '../../core/utils/dateKey'

const functions = getFunctions(app)
const generateReviewFn = httpsCallable<
  { familyId: string; childId: string; weekKey: string },
  { success: boolean }
>(functions, 'generateWeeklyReviewNow')

export default function WeeklyReviewPage() {
  const familyId = useFamilyId()
  const {
    children,
    activeChildId,
    activeChild,
    setActiveChildId,
    isLoading: childrenLoading,
    addChild,
  } = useActiveChild()

  // Review the most recently completed Sun–Sat week. Matches the
  // scheduled Sunday 7pm CT Cloud Function's docId so the page finds
  // the review regardless of which day of the following week it loads.
  const weekKey = useMemo(() => lastCompletedWeekKey(new Date()), [])
  const weekRangeLabel = useMemo(() => formatWeekShort(weekKey), [weekKey])

  const [review, setReview] = useState<WeeklyReview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [snack, setSnack] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  // Load weekly review for active child (real-time)
  useEffect(() => {
    if (!activeChildId) return

    const docId = weeklyReviewDocId(weekKey, activeChildId)
    const ref = doc(weeklyReviewsCollection(familyId), docId)

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setReview({ ...(snap.data() as WeeklyReview), id: snap.id })
        } else {
          setReview(null)
        }
        setIsLoading(false)
      },
      (err) => {
        console.error('Failed to load weekly review', err)
        setIsLoading(false)
      },
    )
    return unsubscribe
  }, [familyId, activeChildId, weekKey])

  // Reset loading when child switches
  const [loadedChildId, setLoadedChildId] = useState(activeChildId)
  if (loadedChildId !== activeChildId) {
    setLoadedChildId(activeChildId)
    setReview(null)
    setIsLoading(true)
  }

  const handleAdjustmentDecision = useCallback(
    (adjustmentId: string, decision: AdjustmentDecision) => {
      setReview((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          paceAdjustments: prev.paceAdjustments.map((adj) =>
            adj.id === adjustmentId ? { ...adj, decision } : adj,
          ),
        }
      })
    },
    [],
  )

  const handleMarkReviewed = useCallback(async () => {
    if (!review || !activeChildId) return
    setIsSaving(true)

    const docId = weeklyReviewDocId(weekKey, activeChildId)
    const updated: WeeklyReview = {
      ...review,
      status: ReviewStatus.Reviewed,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    delete updated.id

    try {
      await setDoc(doc(weeklyReviewsCollection(familyId), docId), updated)
      setSnack({ text: 'Marked as reviewed!', severity: 'success' })
    } catch (err) {
      console.error('Failed to save review', err)
      setSnack({ text: 'Failed to save. Try again.', severity: 'error' })
    }
    setIsSaving(false)
  }, [review, activeChildId, weekKey, familyId])

  const handleApplyAdjustments = useCallback(async () => {
    if (!review || !activeChildId) return
    setIsSaving(true)

    const acceptedAdjustments = review.paceAdjustments.filter(
      (adj) => adj.decision === AdjustmentDecision.Accepted,
    )

    if (acceptedAdjustments.length === 0) {
      setSnack({ text: 'No adjustments accepted to apply.', severity: 'error' })
      setIsSaving(false)
      return
    }

    const docId = weeklyReviewDocId(weekKey, activeChildId)
    const updated: WeeklyReview = {
      ...review,
      status: ReviewStatus.Applied,
      reviewedAt: review.reviewedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    delete updated.id

    try {
      await setDoc(doc(weeklyReviewsCollection(familyId), docId), updated)
      setSnack({
        text: `Applied ${acceptedAdjustments.length} adjustment${acceptedAdjustments.length > 1 ? 's' : ''}. Changes visible in next planner session.`,
        severity: 'success',
      })
    } catch (err) {
      console.error('Failed to apply adjustments', err)
      setSnack({ text: 'Failed to apply. Try again.', severity: 'error' })
    }
    setIsSaving(false)
  }, [review, activeChildId, weekKey, familyId])

  const handleRegenerateReview = useCallback(async () => {
    if (!activeChildId) return
    const confirmed = window.confirm(
      'This will regenerate the weekly review from scratch. Any current review data will be replaced. Continue?',
    )
    if (!confirmed) return

    setGenerating(true)
    try {
      await generateReviewFn({ familyId, childId: activeChildId, weekKey })
      setSnack({ text: 'Review regenerated!', severity: 'success' })
    } catch (err) {
      console.error('Failed to regenerate review', err)
      setSnack({ text: 'Failed to regenerate. Try again.', severity: 'error' })
    }
    setGenerating(false)
  }, [activeChildId, familyId, weekKey])

  const acceptedCount = review?.paceAdjustments.filter(
    (a) => a.decision === AdjustmentDecision.Accepted,
  ).length ?? 0

  return (
    <Page>
      <Typography variant="h4" component="h1">
        Weekly Review
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Week of {weekRangeLabel}
      </Typography>
      <HelpStrip
        pageKey="weekly-review"
        text="The weekly review analyzes everything logged on the Today page — completed items, engagement feedback, and grade notes. The more you capture during the week, the better the review."
        maxShowCount={3}
      />

      <ChildSelector
        children={children}
        selectedChildId={activeChildId}
        onSelect={setActiveChildId}
        onChildAdded={addChild}
        isLoading={childrenLoading}
      />

      {!childrenLoading && !isLoading && activeChildId && !review && (
        <EmptyReviewState
          childName={activeChild?.name ?? 'this child'}
          familyId={familyId}
          childId={activeChildId}
          weekKey={weekKey}
          onSnack={setSnack}
        />
      )}

      {!childrenLoading && !isLoading && review && (
        <>
          {/* Status chip */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              icon={review.status === ReviewStatus.Reviewed ? <CheckCircleIcon /> : undefined}
              label={review.status === ReviewStatus.Reviewed ? 'Reviewed' : 'Pending Review'}
              color={review.status === ReviewStatus.Reviewed ? 'success' : 'warning'}
              variant="outlined"
            />
            {review.status === ReviewStatus.Applied && (
              <Chip label="Adjustments Applied" color="info" variant="outlined" />
            )}
          </Stack>

          {/* Celebration — prominent, warm, affirming */}
          <Card
            elevation={3}
            sx={{
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette.success.light}22, ${theme.palette.warning.light}22)`,
              border: '2px solid',
              borderColor: 'success.light',
            }}
          >
            <CardContent>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <EmojiEventsIcon sx={{ color: 'warning.main', fontSize: 32 }} />
                  <Typography variant="h6" color="success.dark" fontWeight={700}>
                    This Week's Celebration
                  </Typography>
                </Stack>
                <Typography variant="body1" sx={{ fontSize: '1.1rem', lineHeight: 1.6 }}>
                  {review.celebration}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {/* Summary */}
          <SectionCard title="Week Summary">
            <Typography variant="body1" sx={{ lineHeight: 1.7 }}>
              {review.summary}
            </Typography>
          </SectionCard>

          {/* Wins */}
          {review.wins.length > 0 && (
            <SectionCard title="Wins">
              <Stack spacing={1}>
                {review.wins.map((win, idx) => (
                  <Stack key={idx} direction="row" spacing={1} alignItems="flex-start">
                    <CheckCircleOutlineIcon
                      sx={{ color: 'success.main', fontSize: 20, mt: 0.3 }}
                    />
                    <Typography variant="body2">{win}</Typography>
                  </Stack>
                ))}
              </Stack>
            </SectionCard>
          )}

          {/* Growth Areas */}
          {review.growthAreas.length > 0 && (
            <SectionCard title="Growth Areas">
              <Stack spacing={1}>
                {review.growthAreas.map((area, idx) => (
                  <Typography key={idx} variant="body2" sx={{ pl: 1 }}>
                    {area}
                  </Typography>
                ))}
              </Stack>
            </SectionCard>
          )}

          {/* Pace Adjustments — accept/reject per item */}
          {review.paceAdjustments.length > 0 && (
            <SectionCard title="Pace Adjustments">
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Review each suggested adjustment. Accept the ones you'd like applied to
                next week's plan.
              </Typography>
              <Stack spacing={2}>
                {review.paceAdjustments.map((adj) => (
                  <PaceAdjustmentCard
                    key={adj.id}
                    adjustment={adj}
                    onDecision={handleAdjustmentDecision}
                  />
                ))}
              </Stack>
            </SectionCard>
          )}

          {/* Recommendations */}
          {review.recommendations.length > 0 && (
            <SectionCard title="Recommendations for Next Week">
              <Stack spacing={1}>
                {review.recommendations.map((rec, idx) => (
                  <Typography key={idx} variant="body2" sx={{ pl: 1 }}>
                    {rec}
                  </Typography>
                ))}
              </Stack>
            </SectionCard>
          )}

          {/* Actions */}
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            {review.status !== ReviewStatus.Reviewed && (
              <Button
                variant="outlined"
                onClick={handleMarkReviewed}
                disabled={isSaving}
                startIcon={<CheckCircleOutlineIcon />}
              >
                {isSaving ? 'Saving...' : 'Mark as Reviewed'}
              </Button>
            )}
            {review.paceAdjustments.length > 0 && review.status !== ReviewStatus.Applied && (
              <Button
                variant="contained"
                onClick={handleApplyAdjustments}
                disabled={isSaving || acceptedCount === 0}
                startIcon={<ThumbUpIcon />}
              >
                {isSaving
                  ? 'Applying...'
                  : `Apply ${acceptedCount} Adjustment${acceptedCount !== 1 ? 's' : ''}`}
              </Button>
            )}
            <Button
              variant="outlined"
              color="warning"
              onClick={handleRegenerateReview}
              disabled={generating || isSaving}
              startIcon={generating ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
            >
              {generating ? 'Regenerating…' : 'Regenerate Review'}
            </Button>
            {review.status === ReviewStatus.Applied && (
              <Alert severity="success" sx={{ flex: 1 }}>
                Accepted adjustments have been applied. Changes will be visible in your next
                planner session.
              </Alert>
            )}
          </Stack>
        </>
      )}

      {(childrenLoading || isLoading) && activeChildId && (
        <SectionCard title="Loading">
          <Typography color="text.secondary">Loading review...</Typography>
        </SectionCard>
      )}

      <Snackbar
        open={snack !== null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack(null)}
          severity={snack?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snack?.text}
        </Alert>
      </Snackbar>
    </Page>
  )
}

// ── Empty Review State ──────────────────────────────────────────

interface EmptyReviewStateProps {
  childName: string
  familyId: string
  childId: string
  weekKey: string
  onSnack: (snack: { text: string; severity: 'success' | 'error' }) => void
}

function EmptyReviewState({ childName, familyId, childId, weekKey, onSnack }: EmptyReviewStateProps) {
  const [generating, setGenerating] = useState(false)

  const handleGenerateNow = async () => {
    setGenerating(true)
    try {
      await generateReviewFn({ familyId, childId, weekKey })
      onSnack({ text: `Review generated for ${childName}!`, severity: 'success' })
    } catch (err) {
      console.error('Failed to generate review on demand', err)
      onSnack({ text: 'Failed to generate review. Try again.', severity: 'error' })
    }
    setGenerating(false)
  }

  return (
    <SectionCard title="No Review Yet">
      <Stack spacing={2} alignItems="center" sx={{ py: 2, textAlign: 'center' }}>
        <EventNoteIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
        <Typography color="text.secondary">
          Your weekly review for {childName} will be generated Sunday evening at 7 PM and covers the week that just ended (Sun–Sat).
        </Typography>
        <Typography variant="body2" color="text.secondary">
          For the best review, log your daily activities on the Today page throughout the week.
        </Typography>
        <Button
          variant="outlined"
          startIcon={generating ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
          onClick={handleGenerateNow}
          disabled={generating}
        >
          {generating ? 'Generating\u2026' : 'Generate Now'}
        </Button>
      </Stack>
    </SectionCard>
  )
}

// ── Pace Adjustment Card ────────────────────────────────────────

interface PaceAdjustmentCardProps {
  adjustment: PaceAdjustment
  onDecision: (id: string, decision: AdjustmentDecision) => void
}

function PaceAdjustmentCard({ adjustment, onDecision }: PaceAdjustmentCardProps) {
  const { id, area, currentPace, suggestedPace, rationale, decision } = adjustment

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor:
          decision === AdjustmentDecision.Accepted
            ? 'success.main'
            : decision === AdjustmentDecision.Rejected
              ? 'error.light'
              : 'divider',
        borderWidth: decision !== AdjustmentDecision.Pending ? 2 : 1,
      }}
    >
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2" fontWeight={600}>
              {area}
            </Typography>
            {decision !== AdjustmentDecision.Pending && (
              <Chip
                size="small"
                label={decision === AdjustmentDecision.Accepted ? 'Accepted' : 'Rejected'}
                color={decision === AdjustmentDecision.Accepted ? 'success' : 'error'}
                variant="outlined"
              />
            )}
          </Stack>

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Current
              </Typography>
              <Typography variant="body2">{currentPace}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
              →
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Suggested
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {suggestedPace}
              </Typography>
            </Box>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            {rationale}
          </Typography>

          <Divider />

          <Stack direction="row" spacing={1}>
            <IconButton
              size="small"
              color={decision === AdjustmentDecision.Accepted ? 'success' : 'default'}
              onClick={() =>
                onDecision(
                  id,
                  decision === AdjustmentDecision.Accepted
                    ? AdjustmentDecision.Pending
                    : AdjustmentDecision.Accepted,
                )
              }
              aria-label="Accept adjustment"
            >
              <ThumbUpIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color={decision === AdjustmentDecision.Rejected ? 'error' : 'default'}
              onClick={() =>
                onDecision(
                  id,
                  decision === AdjustmentDecision.Rejected
                    ? AdjustmentDecision.Pending
                    : AdjustmentDecision.Rejected,
                )
              }
              aria-label="Reject adjustment"
            >
              <ThumbDownIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
