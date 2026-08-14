import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined'
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { ChatAction, Child } from '../../core/types'
import { describeActivityAudience } from './activityMinutesView'
import type { ResolvedCurriculumAction } from './curriculumActions'
import {
  curriculumActionFootnote,
  describeAddActivityShape,
  describeCurriculumAction,
  isCurriculumAction,
  resolveCurriculumAction,
} from './curriculumActions'
import type { ChatWeekDay, ResolvedDayItemAction } from './dayItemActions'
import {
  dayItemActionFootnote,
  describeDayItemAction,
  isDayItemAction,
  resolveDayItemAction,
} from './dayItemActions'
import type { ActivityMinutesAction, ChatActivityConfig, PendingAction } from './useShellyChatActions'
import { resolveActivityConfig } from './useShellyChatActions'

interface ActionConfirmCardProps {
  pending: PendingAction[]
  familyChildren: Child[]
  /**
   * The family's live activity configs for the active child — needed to render
   * a `setActivityMinutes` card by NAME with a real old → new diff (FEAT-135).
   */
  activityConfigs?: ChatActivityConfig[]
  /**
   * The current week's weekdays for the active child — needed to render a
   * live-day card in words: the row's title and the weekday name, never an
   * `itemKey` or a raw date (FEAT-142).
   */
  weekDays?: ChatWeekDay[]
  /**
   * Plain-language reasons a proposal was dropped before it became a card.
   * Rendered in the card's place so a reply that says "confirm with a tap"
   * never leaves the parent (or a kid who reached /chat directly) waiting on a
   * card that will never appear.
   */
  suppressed?: string[]
  onConfirm: (action: ChatAction) => void
  onDismiss: (action: ChatAction) => void
  onConfirmAll: () => void
}

const FIELD_LABEL: Record<'motivators' | 'interests' | 'strengths', string> = {
  motivators: 'motivators',
  interests: 'interests',
  strengths: 'strengths',
}

/** Plain-language preview for a proposed sight-word action. */
function describeSightWord(
  action: Extract<ChatAction, { kind: 'addSightWord' | 'removeSightWord' }>,
  childName: string,
): string {
  const verb = action.kind === 'addSightWord' ? 'Add' : 'Remove'
  return `${verb} sight word "${action.word.toLowerCase()}" for ${childName}`
}

/** The Tier-C Option-2 additive snapshot kinds (6b). */
type SnapshotAction = Extract<
  ChatAction,
  { kind: 'addPrioritySkill' | 'addSupport' | 'addStopRule' | 'markSkillProgress' }
>

const isSnapshotAction = (action: ChatAction): action is SnapshotAction =>
  action.kind === 'addPrioritySkill' ||
  action.kind === 'addSupport' ||
  action.kind === 'addStopRule' ||
  action.kind === 'markSkillProgress'

/** Plain-language preview for a proposed additive snapshot edit (6b). */
function describeSnapshot(action: SnapshotAction, childName: string): string {
  switch (action.kind) {
    case 'addPrioritySkill':
      return `Add to ${childName}'s priority skills: "${action.skill}"`
    case 'addSupport':
      return `Add to ${childName}'s supports: "${action.support}"`
    case 'addStopRule':
      return `Add to ${childName}'s stop rules: "${action.rule}"`
    case 'markSkillProgress':
      return action.mastered
        ? `Mark "${action.skill}" as mastered for ${childName}`
        : `Mark "${action.skill}" as progressing for ${childName}`
  }
}

/**
 * Preview for an additive Skill-Snapshot edit. These write the authoritative
 * "what to teach next" record, so the card is framed as visibly weightier than
 * a sight-word card: a "Updates {child}'s skill snapshot" label sits above the
 * action line so Shelly registers what she's confirming before she taps.
 */
function SnapshotEditPreview({
  action,
  childName,
}: {
  action: SnapshotAction
  childName: string
}) {
  return (
    <Stack spacing={0.25}>
      <Typography
        variant="caption"
        sx={{ display: 'block', fontWeight: 700, color: 'warning.main', letterSpacing: 0.2 }}
      >
        Updates {childName}'s skill snapshot
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {describeSnapshot(action, childName)}
      </Typography>
    </Stack>
  )
}

/** The plan-adjustment HANDOFF kind (chunk 2A/2) — not a write. */
type PlanAdjustmentAction = Extract<ChatAction, { kind: 'proposePlanAdjustment' }>

/**
 * Preview for a `proposePlanAdjustment` HANDOFF. This is NOT a write — it hands
 * a brief to Plan My Week, so the card is framed distinctly from the snapshot /
 * sight-word / profile write cards: an "info" accent + a "Hand off to Plan My
 * Week" label make clear that confirming opens the planner (where Shelly
 * reviews and locks in), rather than committing a change to a child's record.
 */
function PlanAdjustmentPreview({
  action,
  childName,
}: {
  action: PlanAdjustmentAction
  childName: string
}) {
  return (
    <Stack spacing={0.25}>
      <Typography
        variant="caption"
        sx={{ display: 'block', fontWeight: 700, color: 'info.main', letterSpacing: 0.2 }}
      >
        Hand off to Plan My Week — for {childName}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {action.summary}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Why: {action.rationale}
      </Typography>
    </Stack>
  )
}

/**
 * Preview for a `setActivityMinutes` write (FEAT-135).
 *
 * Shows, before the tap: the activity's NAME (never its id), the real old → new
 * minutes read off the live config, who it affects (loudly, for a shared
 * `'both'` config), and that it applies to FUTURE plans only — not this week,
 * not anything already recorded. This card is the parent's whole view of the
 * write, so everything the write does has to be legible here.
 */
function ActivityMinutesPreview({
  action,
  config,
  allChildNames,
  actingChildName,
}: {
  action: ActivityMinutesAction
  config: ChatActivityConfig
  allChildNames: string[]
  actingChildName: string
}) {
  const shared = config.childId === 'both'
  return (
    <Stack spacing={0.25}>
      <Typography
        variant="caption"
        sx={{ display: 'block', fontWeight: 700, color: 'warning.main', letterSpacing: 0.2 }}
      >
        Changes the default time for future plans
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {config.name}: {config.defaultMinutes}m → {action.minutes}m
      </Typography>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          fontWeight: shared ? 700 : 400,
          color: shared ? 'warning.main' : 'text.secondary',
        }}
      >
        {describeActivityAudience(config.childId, allChildNames, actingChildName)}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Applies to future plans — this week and anything already recorded stay as they are.
      </Typography>
    </Stack>
  )
}

/**
 * Preview for a live-day edit (FEAT-142) — remove / move / add on a day of this
 * week.
 *
 * Framed like the other write cards that change something already in play: a
 * warning accent and a label naming what is about to change. The body names the
 * child, the weekday **in words**, and the row by its title — never an
 * `itemKey`, a document id, or a bare date, because an id on a confirm card is
 * not something a parent can check the proposal against. The footnote states the
 * one thing she most needs to know before changing a live week: finished work
 * and recorded hours are not in play.
 */
function DayItemPreview({
  resolved,
  childName,
}: {
  resolved: ResolvedDayItemAction
  childName: string
}) {
  const isAdd = resolved.action.kind === 'addItemToDay'
  return (
    <Stack spacing={0.25}>
      <Typography
        variant="caption"
        sx={{ display: 'block', fontWeight: 700, color: 'warning.main', letterSpacing: 0.2 }}
      >
        {isAdd ? `Adds to ${childName}'s week` : `Changes ${childName}'s week`}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {describeDayItemAction(resolved, childName)}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {dayItemActionFootnote(resolved.action)}
      </Typography>
    </Stack>
  )
}

/**
 * Preview for a curriculum edit (FEAT-143) — add / finish / reposition.
 *
 * Framed like the other cards that change what future plans read: a warning
 * accent and a label naming what is about to change. The body names the child
 * and the activity **by name** — never a doc id — and shows old → new for a
 * position bump so the parent can check the proposal against the number she
 * already knows.
 *
 * An add is the one action that creates something from nothing, so its card
 * shows the whole shape (subject · minutes · frequency, and the position when
 * one was given) plus who it is for — loudly, when the activity is shared,
 * because a shared add lands on every child's list.
 *
 * The footnote carries the consequence. For a completion that is the important
 * one: the program stops appearing in future plans, everything already logged
 * stays, and there is no undo anywhere in the app.
 */
function CurriculumPreview({
  resolved,
  childName,
  allChildNames,
}: {
  resolved: ResolvedCurriculumAction
  childName: string
  allChildNames: string[]
}) {
  const { action } = resolved
  const isAdd = action.kind === 'addActivity'
  const shared = isAdd && action.shared === true
  return (
    <Stack spacing={0.25}>
      <Typography
        variant="caption"
        sx={{ display: 'block', fontWeight: 700, color: 'warning.main', letterSpacing: 0.2 }}
      >
        {action.kind === 'addActivity'
          ? `Adds to ${childName}'s curriculum`
          : action.kind === 'markActivityComplete'
            ? `Finishes a program for ${childName}`
            : `Changes where ${childName} picks up`}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {describeCurriculumAction(resolved, childName)}
      </Typography>
      {isAdd && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {describeAddActivityShape(action)}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              fontWeight: shared ? 700 : 400,
              color: shared ? 'warning.main' : 'text.secondary',
            }}
          >
            {describeActivityAudience(
              shared ? 'both' : action.childId,
              allChildNames,
              childName,
            )}
          </Typography>
        </>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {curriculumActionFootnote(action)}
      </Typography>
    </Stack>
  )
}

/**
 * Before → after preview for an `editProfileField` action. These are
 * replace-writes on freeform text, so Shelly must see exactly what changes
 * before she taps: the current value and the proposed new value.
 */
function ProfileEditPreview({
  action,
  childName,
  before,
}: {
  action: Extract<ChatAction, { kind: 'editProfileField' }>
  childName: string
  before: string
}) {
  const after = action.value.trim()
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2">
        Update {childName}'s {FIELD_LABEL[action.field]}:
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Before: {before || '(empty)'}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
        After: {after || '(empty)'}
      </Typography>
    </Stack>
  )
}

/**
 * Inline confirm cards for proposed `<action>` writes (Build Step 3b + 4 + 6b).
 * Each pending action gets a human-readable preview with Confirm / Dismiss —
 * sight words as a one-liner, `editProfileField` as a before → after diff since
 * those are replace-writes on freeform text, and the Tier-C Option-2 additive
 * snapshot edits (priority skill / support / stop rule / mark progress) framed
 * as visibly weightier cards (accent border + "Updates {child}'s skill
 * snapshot" label) since they write the authoritative learning record, and the
 * `proposePlanAdjustment` HANDOFF (chunk 2A/2) framed distinctly (info accent +
 * a "Review in Plan My Week" CTA) since confirming it opens the planner rather
 * than writing a child's record, and `setActivityMinutes` (FEAT-135) as a named
 * old → new time diff carrying who it affects (loudly, when the activity is
 * shared) and the fact that it applies to future plans only, and the live-day
 * edits (FEAT-142) as a sentence naming the child, the weekday in words and the
 * row by its title — never an id — with a footnote that finished work stays
 * put, and the curriculum edits (FEAT-143) naming the activity by name with the
 * full shape for an add (subject · minutes · frequency, plus who it lands on)
 * and a real old → new for a position bump, footnoted with what the write does
 * NOT touch — and, for a completion, that the app has no undo for it. A batch
 * "Confirm all" appears when 2+ are
 * still pending. Nothing here writes — taps call back into
 * `useShellyChatActions`. Mobile-first: large tap targets.
 */
export default function ActionConfirmCard({
  pending,
  familyChildren,
  activityConfigs = [],
  weekDays = [],
  suppressed = [],
  onConfirm,
  onDismiss,
  onConfirmAll,
}: ActionConfirmCardProps) {
  if (pending.length === 0 && suppressed.length === 0) return null

  const childFor = (childId: string): Child | undefined =>
    familyChildren.find((c) => c.id === childId)
  const childName = (childId: string): string =>
    childFor(childId)?.name ?? 'this child'
  const allChildNames = familyChildren.map((c) => c.name)

  const stillPending = pending.filter((p) => p.status === 'pending')

  return (
    <Box sx={{ px: 1, pb: 1 }}>
      <Stack spacing={1}>
        {suppressed.map((note) => (
          <Paper
            key={note}
            variant="outlined"
            sx={{ p: 1.25, borderRadius: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}
          >
            <InfoOutlinedIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {note}
            </Typography>
          </Paper>
        ))}
        {pending.map((item) => {
          const { action } = item
          const isProfileEdit = action.kind === 'editProfileField'
          const isSnapshotEdit = isSnapshotAction(action)
          const isPlanAdjustment = action.kind === 'proposePlanAdjustment'
          // FEAT-135 — resolve the proposal to a live config so the card can
          // show a NAME and a real old → new diff. An unresolvable id is
          // already filtered out at stage time; if one somehow reaches here we
          // render no card rather than a card with no diff.
          const activityConfig =
            action.kind === 'setActivityMinutes'
              ? resolveActivityConfig(activityConfigs, action)
              : null
          const isActivityMinutes = action.kind === 'setActivityMinutes'
          if (isActivityMinutes && !activityConfig) return null
          // FEAT-142 — resolve the proposal against the live week so the card
          // can name the row and the weekday. Unresolvable proposals are
          // already filtered out at stage time (with a reason shown in the
          // card's place); if one somehow reaches here we render no card rather
          // than a card that names nothing. `canEdit` is true at this point by
          // construction — a non-parent's proposal never becomes a `pending`
          // entry — and the write layer checks it again regardless.
          const dayResolution = isDayItemAction(action)
            ? resolveDayItemAction(action, weekDays, true, childName(action.childId))
            : null
          const isDayItem = isDayItemAction(action)
          if (isDayItem && !dayResolution?.ok) return null
          // FEAT-143 — resolve against the live configs so the card can name the
          // activity and show a real old → new position. Unresolvable proposals
          // are already filtered out at stage time (with a reason shown in the
          // card's place); if one somehow reaches here we render no card rather
          // than one that names nothing. `canEdit` is true at this point by
          // construction — a non-parent's proposal never becomes a `pending`
          // entry — and the write layer checks it again regardless.
          const curriculumResolution = isCurriculumAction(action)
            ? resolveCurriculumAction(action, activityConfigs, true)
            : null
          const isCurriculum = isCurriculumAction(action)
          if (isCurriculum && !curriculumResolution?.ok) return null
          const icon =
            action.kind === 'addSightWord' ? (
              <AddCircleOutlineIcon fontSize="small" color="action" />
            ) : action.kind === 'removeSightWord' ? (
              <RemoveCircleOutlineIcon fontSize="small" color="action" />
            ) : isSnapshotEdit ? (
              <SchoolOutlinedIcon fontSize="small" color="warning" />
            ) : isPlanAdjustment ? (
              <EventNoteOutlinedIcon fontSize="small" color="info" />
            ) : isActivityMinutes ? (
              <TimerOutlinedIcon fontSize="small" color="warning" />
            ) : isDayItem ? (
              <EventNoteOutlinedIcon fontSize="small" color="warning" />
            ) : isCurriculum ? (
              <MenuBookOutlinedIcon fontSize="small" color="warning" />
            ) : (
              <EditOutlinedIcon fontSize="small" color="action" />
            )
          return (
            <Paper
              key={item.id}
              variant="outlined"
              sx={{
                p: 1.25,
                borderRadius: 2,
                display: 'flex',
                alignItems:
                  isProfileEdit ||
                  isSnapshotEdit ||
                  isPlanAdjustment ||
                  isActivityMinutes ||
                  isDayItem ||
                  isCurriculum
                    ? 'flex-start'
                    : 'center',
                gap: 1,
                opacity: item.status === 'dismissed' ? 0.5 : 1,
                // Higher-stakes framing for snapshot edits: a left accent + a
                // slightly stronger border so they read weightier than a
                // sight-word card. The plan-adjustment handoff gets its own
                // (info) accent so it reads as "opens the planner", not a write.
                ...(isSnapshotEdit || isActivityMinutes || isDayItem || isCurriculum
                  ? { borderColor: 'warning.main', borderLeftWidth: 3 }
                  : isPlanAdjustment
                    ? { borderColor: 'info.main', borderLeftWidth: 3 }
                    : {}),
              }}
            >
              {icon}
              <Box sx={{ flex: 1 }}>
                {action.kind === 'setActivityMinutes' && activityConfig ? (
                  <ActivityMinutesPreview
                    action={action}
                    config={activityConfig}
                    allChildNames={allChildNames}
                    actingChildName={childName(action.childId)}
                  />
                ) : dayResolution?.ok ? (
                  <DayItemPreview
                    resolved={dayResolution.resolved}
                    childName={childName(action.childId)}
                  />
                ) : curriculumResolution?.ok ? (
                  <CurriculumPreview
                    resolved={curriculumResolution.resolved}
                    childName={childName(action.childId)}
                    allChildNames={allChildNames}
                  />
                ) : isSnapshotEdit ? (
                  <SnapshotEditPreview action={action} childName={childName(action.childId)} />
                ) : isPlanAdjustment ? (
                  <PlanAdjustmentPreview action={action} childName={childName(action.childId)} />
                ) : isProfileEdit ? (
                  <ProfileEditPreview
                    action={action}
                    childName={childName(action.childId)}
                    before={
                      (childFor(action.childId)?.[action.field] ?? '').trim()
                    }
                  />
                ) : action.kind === 'addSightWord' || action.kind === 'removeSightWord' ? (
                  <Typography variant="body2">
                    {describeSightWord(action, childName(action.childId))}
                  </Typography>
                ) : null}
              </Box>

              {item.status === 'pending' && (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Button
                    size="small"
                    variant="contained"
                    color={isPlanAdjustment ? 'info' : 'primary'}
                    onClick={() => onConfirm(item.action)}
                    sx={{ textTransform: 'none', minWidth: 0, py: 0.5 }}
                  >
                    {isPlanAdjustment ? 'Review in Plan My Week' : 'Confirm'}
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    onClick={() => onDismiss(item.action)}
                    sx={{ textTransform: 'none', minWidth: 0, py: 0.5 }}
                  >
                    Dismiss
                  </Button>
                </Box>
              )}
              {item.status === 'applied' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main' }}>
                  <CheckCircleIcon fontSize="small" />
                  <Typography variant="caption">Done</Typography>
                </Box>
              )}
              {item.status === 'dismissed' && (
                <Typography variant="caption" color="text.secondary">
                  Dismissed
                </Typography>
              )}
            </Paper>
          )
        })}

        {stillPending.length >= 2 && (
          <Button
            size="small"
            variant="outlined"
            onClick={onConfirmAll}
            sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
          >
            Confirm all ({stillPending.length})
          </Button>
        )}
      </Stack>
    </Box>
  )
}
