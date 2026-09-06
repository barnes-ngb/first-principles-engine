import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import { doc, onSnapshot, runTransaction } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import HelpStrip from '../../components/HelpStrip'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import SectionErrorBoundary from '../../components/SectionErrorBoundary'
import { LoadingState } from '../../components/states'
import { useFamilyId } from '../../core/auth/useAuth'
import { db, weeklyReviewsCollection, weeklyReviewDocId } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { PaceAdjustment, WeeklyReview } from '../../core/types'
import { AdjustmentDecision, ReviewStatus } from '../../core/types/enums'
import { lastCompletedSchoolWeekKey } from '../../core/utils/time'
import { formatWeekShort } from '../../core/utils/dateKey'
import { formatPlanningWeekLabel } from '../planner-chat/chatPlanner.logic'
import {
  applyDecisionDraft,
  countAccepted,
  setDecision,
} from './adjustmentDecisions'
import type { DecisionDraft } from './adjustmentDecisions'
import WeekInEvidence from './WeekInEvidence'
import WeekPaceSection from './WeekPaceSection'
import WeekReflectionCard from './WeekReflectionCard'
import { useWeeklyReviewHistory } from './useWeeklyReviewHistory'

/**
 * The week is a **log**, not a report (UX-219).
 *
 * Owner, 2026-09-06, looking at this page on his phone: *"I'm not sure what
 * review is doing. Basically useless, the month is better."* He is right, and
 * the reason generalises: a five-day AI narrative mostly restates the checklist,
 * and on a thin week the generator writes nothing — so the page rendered blank
 * cards under bold headings (*This Week's Celebration*, *Wins*, *Growth Areas*)
 * and told a parent the app had nothing to say about her week. **A report
 * surface that is usually empty is worse than no surface.** Narrative needs
 * enough signal to be true; a week rarely has it and a month does, so the
 * narrative lives on the monthly review book now.
 *
 * What is left is the honest layer FEAT-203 built underneath, and it can never
 * be empty:
 *
 *   1. **Hours** — stated, never against a target (UX-211).
 *   2. **The evidence counts** — books, reading sessions, teach-backs (UX-219).
 *   3. **The observed rate** — parent-only, observed, never required (UX-213).
 *   4. **Pace adjustments** — the one weekly AI output with a real job, because
 *      it feeds next week's plan. Rendered **only when there are any**.
 *   5. **The week's question** — answered by a person (UX-214).
 *
 * There is **no empty state**, because there is nothing left that can be empty:
 * a week with nothing logged reads *"No hours logged this week."*, *"No books or
 * teach-backs logged this week."*, the rate line's own honest wording, and the
 * question. That is a log of a quiet week, not a broken report.
 *
 * ── The narrative is still WRITTEN; it is no longer READ here ───────────────
 *
 * Checked before deciding, as the run required. Two server consumers read the
 * weekly narrative fields:
 *
 *   • `functions/src/ai/tasks/monthlyReviewData.ts` reads `celebration`,
 *     `summary`, `wins`, `growthAreas`, `recommendations` and `energyPattern`
 *     off each week's document, and `tasks/monthlyReview.ts` folds them into the
 *     monthly prompt.
 *   • `functions/src/ai/tasks/shellyChat.ts` builds its RECENT WEEKLY REVIEWS
 *     context strip from `summary` / `celebration` / `growthAreas`.
 *
 * So the weekly generation **is** the month's raw material, and stopping it
 * would quietly degrade the surface the owner says is the good one. The cron is
 * untouched; only the rendering is gone. The schema does not shrink either — no
 * migration, no backfill, nothing stored is deleted.
 *
 * ── Parent-only, at the page ────────────────────────────────────────────────
 *
 * The route already sits inside `RequireParent`, and UX-213/214 gated the two
 * sections that must never leak. Removing the narrative left `WeekInEvidence`
 * and the adjustments un-gated, so the gate moved up here: one capability check
 * above the Firestore subscription, so a child profile renders nothing and costs
 * zero reads. Capability, never a name.
 */
export default function WeeklyReviewPage() {
  const { isChildProfile } = useActiveChild()
  if (isChildProfile) return null
  return <WeeklyReviewBody />
}

function WeeklyReviewBody() {
  const familyId = useFamilyId()
  const {
    children,
    activeChildId,
    activeChild,
    setActiveChildId,
    isLoading: childrenLoading,
    addChild,
  } = useActiveChild()

  // The most recent school week whose Mon–Fri has ended (UX-218). On Saturday
  // and Sunday that is the week just finished; Monday–Friday it is the previous
  // one. It used to be the last whole Sun–Sat week, which on a Saturday named a
  // week two back — the owner read "Week of Aug 23–29" on Sat Sep 5 while Aug
  // 31–Sep 4 had finished the day before.
  const weekKey = useMemo(() => lastCompletedSchoolWeekKey(new Date()), [])
  // Named the FEAT-196 way — "Week of Aug 31–Sep 4", the school days themselves —
  // from the planner's own formatter rather than a second copy of it. The
  // Sun–Sat fallback covers an unparseable key, which that formatter reports as
  // an empty string.
  const weekRangeLabel = useMemo(
    () => formatPlanningWeekLabel(weekKey) || `Week of ${formatWeekShort(weekKey)}`,
    [weekKey],
  )

  const [review, setReview] = useState<WeeklyReview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [snack, setSnack] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  // One read, two consumers (UX-213 / UX-214): the observed-rate line needs the
  // most recent earlier position snapshot, and the week's question needs the
  // earlier answers so a run of the same answer is visible.
  const {
    reviews: history,
    loading: historyLoading,
    failed: historyFailed,
  } = useWeeklyReviewHistory(familyId, activeChildId, weekKey)

  // Load weekly review for active child (real-time). A missing document is a
  // normal state now, not an empty state: on Saturday the Sunday cron has not
  // fired for the week the page names, and everything except the adjustments
  // still renders.
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

  // Accept/reject ticks live in their own draft, not inside `review` (UX-214).
  // `review` is replaced wholesale every time the listener fires, so recording a
  // choice there meant any write to the document — the parent saving their
  // answer to the week's question included — silently threw the ticks away.
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft>({})

  // Reset loading when child switches
  const [loadedChildId, setLoadedChildId] = useState(activeChildId)
  if (loadedChildId !== activeChildId) {
    setLoadedChildId(activeChildId)
    setReview(null)
    setDecisionDraft({})
    setIsLoading(true)
  }

  const handleAdjustmentDecision = useCallback(
    (adjustmentId: string, decision: AdjustmentDecision) => {
      setDecisionDraft((prev) => setDecision(prev, adjustmentId, decision))
    },
    [],
  )

  // What the parent is looking at: the document's adjustments with their own
  // un-applied ticks on top.
  const adjustments = useMemo(
    () => applyDecisionDraft(review?.paceAdjustments ?? [], decisionDraft),
    [review?.paceAdjustments, decisionDraft],
  )

  const handleApplyAdjustments = useCallback(async () => {
    if (!review || !activeChildId) return
    setIsSaving(true)

    if (countAccepted(adjustments) === 0) {
      setSnack({ text: 'No adjustments accepted to apply.', severity: 'error' })
      setIsSaving(false)
      return
    }

    const docId = weeklyReviewDocId(weekKey, activeChildId)
    const ref = doc(weeklyReviewsCollection(familyId), docId)

    // Transactional, and merging only this button's own fields (UX-214). Two
    // things it must not do: delete an answer saved since the last snapshot
    // (so: merge, never a whole-document replacement), and resurrect
    // suggestions from a review that was regenerated in another tab (so: the
    // ticks are resolved against the document's CURRENT adjustments, inside the
    // transaction, and a tick whose suggestion no longer exists is dropped).
    try {
      const applied = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists()) throw new Error('review-missing')
        const current = snap.data() as WeeklyReview
        const next = applyDecisionDraft(
          current.paceAdjustments ?? [],
          decisionDraft,
        )
        const accepted = countAccepted(next)
        if (accepted === 0) return 0
        const updated: Partial<WeeklyReview> = {
          status: ReviewStatus.Applied,
          paceAdjustments: next,
          reviewedAt: current.reviewedAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        tx.set(ref, updated, { merge: true })
        return accepted
      })

      if (applied === 0) {
        setSnack({
          text: 'Those suggestions are no longer on this review — it was regenerated.',
          severity: 'error',
        })
      } else {
        setDecisionDraft({})
        setSnack({
          text: `Applied ${applied} adjustment${applied > 1 ? 's' : ''}. Changes visible in next planner session.`,
          severity: 'success',
        })
      }
    } catch (err) {
      console.error('Failed to apply adjustments', err)
      setSnack({ text: 'Failed to apply. Try again.', severity: 'error' })
    }
    setIsSaving(false)
  }, [review, activeChildId, weekKey, familyId, adjustments, decisionDraft])

  const acceptedCount = countAccepted(adjustments)
  const alreadyApplied = review?.status === ReviewStatus.Applied

  return (
    <Page>
      <Typography variant="h4" component="h1">
        Weekly Review
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {weekRangeLabel}
      </Typography>
      <HelpStrip
        pageKey="weekly-review"
        text="A record of the week that just ended — the hours it held, what got made, how fast the workbooks are moving, and your own read on it. Nothing here is written by AI, and none of it is scored against a target."
        maxShowCount={3}
      />

      <ChildSelector
        children={children}
        selectedChildId={activeChildId}
        onSelect={setActiveChildId}
        onChildAdded={addChild}
        isLoading={childrenLoading}
      />

      {!childrenLoading && !isLoading && activeChildId && (
        <>
          {/* Hours, evidence counts and the observed coverage rate (UX-211 /
              UX-213 / UX-219). Renders with or without a review document — the
              hours are folded live and never came from it. */}
          <SectionErrorBoundary section="week-pace">
            <WeekPaceSection
              familyId={familyId}
              childId={activeChildId}
              weekKey={weekKey}
              review={review}
              history={history}
              historyLoading={historyLoading}
              historyFailed={historyFailed}
            />
          </SectionErrorBoundary>

          {/* Week in Evidence — the same counts in full, with titles and audio.
              Absent until the cron has assembled them; it renders nothing when
              there is nothing in it, which is why it is not a blank card. */}
          {review?.evidence && (
            <SectionErrorBoundary section="week-in-evidence">
              <WeekInEvidence
                childName={activeChild?.name ?? 'this child'}
                evidence={review.evidence}
              />
            </SectionErrorBoundary>
          )}

          {/* Pace Adjustments — the one weekly AI output that still has a job,
              because accepting one reaches next week's plan. Rendered only when
              the list is non-empty: an empty section under a bold heading is
              exactly the defect this run retired. */}
          {adjustments.length > 0 && (
            <SectionCard title="Pace Adjustments">
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Review each suggested adjustment. Accept the ones you'd like applied to
                next week's plan.
              </Typography>
              <Stack spacing={2}>
                {adjustments.map((adj) => (
                  <PaceAdjustmentCard
                    key={adj.id}
                    adjustment={adj}
                    onDecision={handleAdjustmentDecision}
                  />
                ))}
              </Stack>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
                {!alreadyApplied && (
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
                {alreadyApplied && (
                  <Alert severity="success" sx={{ flex: 1 }}>
                    Accepted adjustments have been applied. Changes will be visible in your
                    next planner session.
                  </Alert>
                )}
              </Stack>
            </SectionCard>
          )}

          {/* The week's one question — answered by a person (UX-214). Writable
              before the cron has written anything: the merge creates the
              document and the CF carries the answer forward. */}
          <SectionErrorBoundary section="week-reflection">
            <WeekReflectionCard
              familyId={familyId}
              childId={activeChildId}
              weekKey={weekKey}
              review={review}
              history={history}
              onSaved={setSnack}
            />
          </SectionErrorBoundary>
        </>
      )}

      {(childrenLoading || isLoading) && activeChildId && (
        <SectionCard title="Loading">
          <LoadingState label="Loading this week…" />
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
