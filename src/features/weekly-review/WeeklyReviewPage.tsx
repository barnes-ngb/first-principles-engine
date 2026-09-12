import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
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
import { useActiveChild, type UseActiveChildResult } from '../../core/hooks/useActiveChild'
import type { PaceAdjustment, WeeklyReview } from '../../core/types'
import { AdjustmentDecision, ReviewStatus } from '../../core/types/enums'
import { formatWeekShort } from '../../core/utils/dateKey'
import { formatPlanningWeekLabel } from '../planner-chat/chatPlanner.logic'
import {
  applyDecisionDraft,
  countAccepted,
  setDecision,
} from './adjustmentDecisions'
import type { DecisionDraft } from './adjustmentDecisions'
import ReviewWeekSelector from './ReviewWeekSelector'
import { resolveReviewWeek } from './reviewWeekSelection'
import type { ReviewWeekChoice } from './reviewWeekSelection'
import WeekBySubject from './WeekBySubject'
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
 *   1. **The week by subject and topic** — the rollup, ABOVE the log (UX-388).
 *      Owner, 2026-09-11: *"the current week summary by topic"*, as the first
 *      thing you see. Subject sections, strands sub-grouped by their topic, no
 *      target anywhere, and every minute from the shared counting path the
 *      hours line below it folds. It ADDED a section; nothing was removed.
 *   2. **Hours** — stated, never against a target (UX-211).
 *   3. **The evidence counts** — books, reading sessions, teach-backs (UX-219).
 *   4. **The observed rate** — parent-only, observed, never required (UX-213).
 *   5. **Pace adjustments** — the one weekly AI output with a real job, because
 *      it feeds next week's plan. Rendered **only when there are any**.
 *   6. **The week's question** — answered by a person (UX-214).
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
export default function WeeklyReviewPage({ embedded = false }: { embedded?: boolean }) {
  const childContext = useActiveChild()
  return <WeeklyReviewContent childContext={childContext} embedded={embedded} />
}

/** Use the Review selector's loaded children, including newly added children. */
export function WeeklyReviewContent({ childContext, embedded = false }: {
  childContext: UseActiveChildResult
  embedded?: boolean
}) {
  if (childContext.isChildProfile) return null
  return <WeeklyReviewBody childContext={childContext} embedded={embedded} />
}

function WeeklyReviewBody({ childContext, embedded }: { childContext: UseActiveChildResult; embedded: boolean }) {
  const familyId = useFamilyId()
  const {
    children,
    activeChildId,
    activeChild,
    setActiveChildId,
    isLoading: childrenLoading,
    addChild,
  } = childContext

  // ── Which week (UX-218 default, UX-406 selector) ─────────────────────────
  //
  // The DEFAULT is still the most recent school week whose Mon–Fri has ended
  // (UX-218): on Saturday and Sunday the week just finished, Monday–Friday the
  // previous one. `reviewWeekSelection.ts` reads that helper rather than
  // restating its weekday rule, so the two cannot drift.
  //
  // The CHOICE is new. Owner, Friday 2026-09-11: *"the days here isn't
  // updated — I added time in artefacts and it didn't change it for packing and
  // independent play."* The time was logged and counted; the page was showing
  // the week before the one he had logged it in, and there was no control to
  // move. That is FEAT-196's lesson one surface over — a default is a guess, and
  // the answer to a guess being wrong for somebody is a selector beside it, not
  // one more weekday in the rule.
  //
  // `now` is resolved once, at mount, and threaded into the selector, the
  // default and the positions sentence so all three answer from ONE clock. An
  // earlier PR recomputed the week every render, reasoning that a phone tab is
  // rarely closed and one opened on Friday should roll on Saturday; Codex round
  // 2 (P1) showed that does not work and was right — recomputing during render
  // does not cause React to render, so the DOM and the subscription stay on
  // Friday's answer regardless, while the dynamic key made a mid-session week
  // change possible on any unrelated re-render and left `review`, `isLoading`
  // and `decisionDraft` keyed to the old week.
  //
  // The residual is unchanged and still stated: a tab left open across the
  // Friday→Saturday boundary names the older week until it is reloaded. What
  // UX-406 changes is that there is now a tap that fixes it — and every piece of
  // week-scoped state below is reset when the week moves, which is the half the
  // earlier attempt was missing.
  const now = useMemo(() => new Date(), [])
  const [weekChoice, setWeekChoice] = useState<ReviewWeekChoice | null>(null)
  const { choice: resolvedWeekChoice, weekKey, options: weekOptions } = useMemo(
    () => resolveReviewWeek(weekChoice, now),
    [weekChoice, now],
  )
  // Named the FEAT-196 way — "Week of Aug 31–Sep 4", the school days themselves —
  // from the planner's own formatter rather than a second copy of it. The
  // Sun–Sat fallback covers an unparseable key, which that formatter reports as
  // an empty string.
  const weekRangeLabel = useMemo(
    () => formatPlanningWeekLabel(weekKey) || `Week of ${formatWeekShort(weekKey)}`,
    [weekKey],
  )

  const [review, setReview] = useState<WeeklyReview | null>(null)
  // A dropped or permission-denied listener leaves `review` null with loading
  // finished, which is indistinguishable from "the cron has not run yet" unless
  // we record which it was (Codex round 3, P2). This page's one rule, third
  // instance: a failed read is never rendered as a result.
  const [reviewFailed, setReviewFailed] = useState(false)
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
  // normal state now, not an empty state: on Saturday, until the cron fires
  // overnight (00:15 Sunday CT — UX-263), no document exists for the week the
  // page names, and everything except the adjustments still renders.
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
        setReviewFailed(false)
        setIsLoading(false)
      },
      (err) => {
        console.error('Failed to load weekly review', err)
        setReviewFailed(true)
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

  // Reset every piece of week-scoped state when the CHILD **or the WEEK** moves.
  //
  // The child half shipped with the page. The week half is UX-406's: making the
  // week changeable mid-session is exactly the thing Codex rounds 2 and 3 said
  // must not happen while `review`, `isLoading` and `decisionDraft` stay keyed
  // to the old one — a stale review rendered under a new week's heading, and a
  // tick accepted on one week applied to another. Keyed on the pair rather than
  // on two separate guards, so neither can be forgotten when the other changes.
  const loadKey = `${activeChildId}|${weekKey}`
  const [loadedKey, setLoadedKey] = useState(loadKey)
  if (loadedKey !== loadKey) {
    setLoadedKey(loadKey)
    setReview(null)
    setReviewFailed(false)
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

  const Frame = embedded ? EmbeddedWeek : Page

  return (
    <Frame>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        {embedded ? (
          <Typography variant="body2" color="text.secondary">{weekRangeLabel}</Typography>
        ) : (
          <Typography variant="h5" component="h1">Weekly Review</Typography>
        )}
        <HelpStrip
          pageKey="weekly-review"
          text="A record of the week that just ended — the hours it held, what got made, how fast the workbooks are moving, and your own read on it. None of it is scored against a target. The one AI-written part is Pace Adjustments, which appears only when the weekly review has suggestions for next week's plan."
        />
      </Stack>
      {!embedded && (
        <>
          <Typography variant="body2" color="text.secondary">
            {weekRangeLabel}
          </Typography>

          <ChildSelector
            children={children}
            selectedChildId={activeChildId}
            onSelect={setActiveChildId}
            onChildAdded={addChild}
            isLoading={childrenLoading}
          />
        </>
      )}

      {/* Which week (UX-406). Rendered in BOTH frames — the embedded Review
          shell supplies the page title and the child selector, and this is
          neither of those: it is the one control the owner's report asked for,
          and hiding it on the surface he actually opens would leave the report
          unanswered where it was made. */}
      <ReviewWeekSelector
        options={weekOptions}
        value={resolvedWeekChoice}
        onChange={setWeekChoice}
      />

      {!childrenLoading && !isLoading && activeChildId && (
        <>
          {/* The week by subject and topic — FIRST, above the log (UX-388).
              Owner, 2026-09-11: *"the current week summary by topic"*, as the
              first thing you see. A log answers "what happened on Tuesday"; the
              question on a Sunday morning is "what did we do this week, by
              subject". Nothing below it moved. */}
          <SectionErrorBoundary section="week-by-subject">
            <WeekBySubject
              familyId={familyId}
              childId={activeChildId}
              weekKey={weekKey}
            />
          </SectionErrorBoundary>

          {/* Hours, evidence counts and the observed coverage rate (UX-211 /
              UX-213 / UX-219). Renders with or without a review document — the
              hours are folded live and never came from it. */}
          <SectionErrorBoundary section="week-pace">
            <WeekPaceSection
              familyId={familyId}
              childId={activeChildId}
              weekKey={weekKey}
              review={review}
              reviewFailed={reviewFailed}
              history={history}
              historyLoading={historyLoading}
              historyFailed={historyFailed}
              now={now}
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
                Written by the weekly review AI from what was logged — the one
                AI-written thing on this page. Accept the ones you'd like applied to
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
    </Frame>
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

/** The Review shell supplies the page container and child selector. */
function EmbeddedWeek({ children }: { children: ReactNode }) {
  return <Stack spacing={2}>{children}</Stack>
}
