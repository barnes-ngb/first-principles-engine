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
} from './nextWeekActions'
import type { NextWeekDraftView } from './useNextWeekDraft'

interface NextWeekDraftCardProps {
  view: NextWeekDraftView
  childName: string
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
            Drafting {childName}'s week of {view.weekLabel}… nothing is written yet.
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

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mx: 1, mb: 1, borderRadius: 2 }}>
      <Stack spacing={1.25}>
        {/* Header — whose week, which week, how big */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <CalendarMonthOutlinedIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {childName}'s week of {view.weekLabel}
          </Typography>
          <Chip size="small" variant="outlined" label={`${Math.round(minutes / 6) / 10}h planned`} />
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

            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="contained"
                onClick={onApply}
                disabled={busy}
                startIcon={busy ? <CircularProgress size={14} /> : undefined}
              >
                {busy ? 'Applying…' : describeApplyNextWeek(childName, view.weekLabel)}
              </Button>
              <Button size="small" variant="text" onClick={onDismiss} disabled={busy}>
                Not this
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Want it different? Just say what to change and I'll draft it again. Or open Plan My
              Week to build it there.
            </Typography>
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
