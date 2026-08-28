// ── The drafted week, in the chat, in full (FEAT-150) ────────────────────────
//
// The second half of the two-tap flow: the parent has spent a generation, and
// this is where she reads the whole week before deciding. "In full" is the
// requirement and it is not decorative — she is being asked to approve a write
// across five days, and a summary ("6 items, 2h/day") is not something anyone
// can check a week against.
//
// The days themselves render through `PlanDayCards`, the planner's own draft
// renderer, in its read-only configuration: `applied` is passed true and every
// edit handler is omitted, which is exactly how the planner renders an
// already-applied week. That reuse is the point — a week previewed here and the
// same week previewed in Plan My Week are the same component showing the same
// draft, so they cannot drift into disagreeing about what was planned.
//
// Editing is deliberately absent. The way to change this draft is to say what to
// change, which re-runs generation and produces a new card — one draft at a
// time, and every draft the product of a generator rather than of tapping.

import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import PlanDayCards from '../planner-chat/PlanDayCards'
import {
  APPLY_RETAIN_RULES,
  describeApplyNextWeek,
  describeDraftWeekHeading,
} from './nextWeekActions'
import type { NextWeekDraftView } from './useNextWeekDraft'

interface NextWeekDraftCardProps {
  view: NextWeekDraftView
  /**
   * The child this week belongs to. **Optional on purpose** (UX-34): the caller
   * used to substitute a placeholder when no child resolved, and the
   * placeholder it reached for was `'this week'` — a week noun standing in for
   * a child, on the apply button for the largest write in the app. An
   * unresolved name now reaches this card as `undefined` and every sentence
   * that would have named the child drops the possessive instead.
   */
  childName?: string
  /** Minutes/day budget, for the planner renderer's header. */
  hoursPerDay: number
  onApply: () => void
  onDismiss: () => void
}

/** Total planned minutes across the draft — the one number worth totalling. */
function totalMinutes(view: NextWeekDraftView): number {
  return (view.draft?.days ?? []).reduce(
    (sum, day) =>
      sum + day.items.filter((i) => i.accepted).reduce((s, i) => s + i.estimatedMinutes, 0),
    0,
  )
}

/**
 * How many items the parent has actually accepted — the number that decides
 * whether there is anything to apply (UX-46). Deliberately NOT the minute total:
 * an accepted item with no estimate is still a real row that would be written,
 * and gating Apply on minutes would refuse to write it.
 */
function acceptedItemCount(view: NextWeekDraftView): number {
  return (view.draft?.days ?? []).reduce(
    (sum, day) => sum + day.items.filter((i) => i.accepted).length,
    0,
  )
}

export default function NextWeekDraftCard({
  view,
  childName,
  hoursPerDay,
  onApply,
  onDismiss,
}: NextWeekDraftCardProps) {
  if (view.phase === 'idle') return null

  // Generation in flight. Named as a spend and as a wait, because it is both —
  // and because the confirm card the parent just tapped has already vanished.
  if (view.phase === 'generating') {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, mx: 1, mb: 1, borderRadius: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Drafting {describeDraftWeekHeading(childName, view.weekLabel)}… nothing is written
            yet.
          </Typography>
        </Stack>
      </Paper>
    )
  }

  // A failure with no draft behind it: say so plainly and offer no card. The
  // rule this holds is that the app never renders something that looks like a
  // reviewable week when no week was produced.
  if (view.phase === 'error' && !view.draft) {
    return (
      <Alert
        severity="warning"
        icon={<WarningAmberOutlinedIcon fontSize="small" />}
        sx={{ mx: 1, mb: 1 }}
        onClose={onDismiss}
      >
        {view.error}
      </Alert>
    )
  }

  if (!view.draft) return null

  const applied = view.phase === 'applied'
  const busy = view.phase === 'applying'
  // A partial apply lands here: the draft is still on screen (so the parent can
  // see what was meant to happen) but Apply is gone, because re-applying over a
  // half-written week is how a day ends up planned twice.
  const halfWritten = view.phase === 'error' && view.draft !== null
  const minutes = totalMinutes(view)
  const acceptedCount = acceptedItemCount(view)

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mx: 1, mb: 1, borderRadius: 2 }}>
      <Stack spacing={1.25}>
        {/* Header — whose week, which week, how big */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <CalendarMonthOutlinedIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {describeDraftWeekHeading(childName, view.weekLabel)}
          </Typography>
          {/* UX-46: a draft with nothing accepted rendered "0h planned" beside a
              live Apply that would write five empty days. A zero here means
              nothing was accepted, so it says that instead of a quantity. */}
          <Chip
            size="small"
            variant="outlined"
            label={
              acceptedCount === 0
                ? 'Nothing planned yet'
                : `${Math.round(minutes / 6) / 10}h planned`
            }
          />
        </Stack>

        {/* What was asked for — so the parent can check the week against it */}
        <Typography variant="caption" color="text.secondary">
          Drafted around: “{view.instructions}”
        </Typography>

        {view.usedLocalPlanner && (
          <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />} sx={{ py: 0 }}>
            The AI planner wasn't available, so this came from the built-in planner. It follows the
            routine but won't have picked up everything you asked for — worth a read.
          </Alert>
        )}

        {/* The week itself, every day, every item — the planner's own renderer
            in its read-only configuration (no edit handlers passed). */}
        <Box sx={{ maxHeight: '52vh', overflowY: 'auto' }}>
          <PlanDayCards
            draft={view.draft}
            hoursPerDay={hoursPerDay}
            masteryReviewLine=""
            readAloudBook=""
            weekStart={view.weekStart}
            generatingItemId={null}
            applied
          />
        </Box>

        {view.error && (
          <Alert severity={halfWritten ? 'warning' : 'info'} sx={{ py: 0 }}>
            {view.error}
          </Alert>
        )}

        {applied ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CheckCircleIcon fontSize="small" color="success" />
            <Typography variant="body2" color="success.main">
              Applied to {view.daysWritten.length} day{view.daysWritten.length === 1 ? '' : 's'} —
              it's on Plan My Week and Today now.
            </Typography>
          </Stack>
        ) : halfWritten ? null : (
          <>
            {/* The retain rules, in the parent's terms. This is the sentence set
                that makes the tap checkable: she is approving a write over days
                that may already hold her boys' finished work. */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                If you apply this:
              </Typography>
              <Box component="ul" sx={{ m: 0, mt: 0.25, pl: 2.5 }}>
                {APPLY_RETAIN_RULES.map((rule) => (
                  <Typography component="li" variant="caption" color="text.secondary" key={rule}>
                    {rule}
                  </Typography>
                ))}
              </Box>
            </Box>

            {/* UX-35: the re-draft sentence sits ABOVE the buttons now. Read in
                the old order, "Not this" landed right beside "I'll draft it
                again" and read as the way to ask for another one — it is the
                way to throw this one away, and a draft costs a generation. */}
            <Typography variant="caption" color="text.secondary">
              Want it different? Just say what to change and I'll draft it again. Or open Plan My
              Week to build it there.
            </Typography>
            <Stack direction="row" spacing={1}>
              {/* UX-46: nothing accepted ⇒ nothing to apply. Applying an empty
                  draft is not a no-op — it clears unfinished leftovers off five
                  days (rule 3 above) and writes nothing back, so the button is
                  disabled and says why rather than reporting "Plan applied!"
                  over five empty days. */}
              <Button
                size="small"
                variant="contained"
                onClick={onApply}
                disabled={busy || acceptedCount === 0}
                startIcon={busy ? <CircularProgress size={14} /> : undefined}
              >
                {busy
                  ? 'Applying…'
                  : acceptedCount === 0
                    ? 'Nothing to apply yet'
                    : describeApplyNextWeek(childName, view.weekLabel)}
              </Button>
              <Button size="small" variant="text" onClick={onDismiss} disabled={busy}>
                Discard this draft
              </Button>
            </Stack>
          </>
        )}

        {(applied || halfWritten) && (
          <Button size="small" variant="text" onClick={onDismiss} sx={{ alignSelf: 'flex-start' }}>
            Dismiss
          </Button>
        )}
      </Stack>
    </Paper>
  )
}
