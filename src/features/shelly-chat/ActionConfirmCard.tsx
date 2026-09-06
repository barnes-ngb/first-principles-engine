import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined'
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import OndemandVideoOutlinedIcon from '@mui/icons-material/OndemandVideoOutlined'
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined'
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
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
  duplicateActivityNotice,
  isCurriculumAction,
  resolveCurriculumAction,
  resolveCurriculumActionForDisplay,
} from './curriculumActions'
import type { ResolvedDadLabAction } from './dadLabActions'
import {
  dadLabActionFootnote,
  describeDadLabAction,
  isDadLabAction,
  resolveDadLabAction,
  resolveDadLabActionForDisplay,
} from './dadLabActions'
import type { ChatWeekDay, ResolvedDayItemAction } from './dayItemActions'
import {
  dayItemActionFootnote,
  describeDayItemAction,
  isDayItemAction,
  resolveDayItemAction,
} from './dayItemActions'
import {
  describeDraftNextWeek,
  DRAFT_FOOTNOTE,
  formatNextWeekLabel,
  isDraftNextWeekAction,
  nextWeekDayKeys,
  type DraftNextWeekAction,
} from './nextWeekActions'
import type { ChatWatchVideo, ResolvedWatchAction } from './watchActions'
import {
  describeVetInShape,
  describeWatchAction,
  isWatchAction,
  resolveWatchAction,
  resolveWatchActionForDisplay,
  watchActionFootnote,
} from './watchActions'
import type { ActivityMinutesAction, ChatActivityConfig, PendingAction } from './useShellyChatActions'
import { resolveActivityConfig } from './useShellyChatActions'
import type { ConceptArc } from '../../core/types'

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
   * The acting child's Watch Library — needed to render a `planVideoOnDay` card
   * by the video's TITLE, and to keep a card off screen once the entry it names
   * is gone (FEAT-149).
   */
  watchVideos?: ChatWatchVideo[]
  /**
   * The weekdays a video may be planned onto — this week's and next week's, with
   * the labels a card says out loud ("Tuesday" / "next Tuesday"). Supplied by
   * the page so the component holds no clock (FEAT-149).
   */
  plannableDays?: { dateKey: string; label: string }[]
  /**
   * The family's ACTIVE concept arcs — needed to render a linked `planLab`
   * card by the arc's TITLE and step number, never a doc id (FEAT-157).
   */
  conceptArcs?: ConceptArc[]
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

/**
 * Preview for a `draftNextWeek` proposal (FEAT-150) — the first of two taps.
 *
 * Two things this card must get across, because the parent's mental model of
 * "Confirm" everywhere else in this chat is "and it's done":
 *
 *   1. **It writes nothing.** It spends one plan generation and shows her a
 *      week. The footnote says so in those words.
 *   2. **What it was asked for.** The instructions are quoted back verbatim,
 *      because the generation is about to be shaped by the model's reading of
 *      what she said, and this is her one chance to notice it read her wrong
 *      before the tokens are spent.
 *
 * The week is named in words ("Aug 24–28"), recomputed from the clock here
 * rather than carried on the action — a card that sat through a rollover would
 * otherwise name a week that is no longer the one the tap targets.
 */
function DraftNextWeekPreview({
  action,
  childName,
}: {
  action: DraftNextWeekAction
  childName: string
}) {
  const weekLabel = formatNextWeekLabel(nextWeekDayKeys())
  return (
    <>
      <Typography variant="body2">
        {describeDraftNextWeek(action, childName, weekLabel)}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
        {DRAFT_FOOTNOTE}
      </Typography>
    </>
  )
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
  const { action, duplicates } = resolved
  const isAdd = action.kind === 'addActivity'
  const shared = isAdd && action.shared === true
  // UX-205 — only ever populated on the OFFER path, so an applied card does not
  // report the config its own confirmation just created as a duplicate.
  const duplicateLine = isAdd && duplicates?.length ? duplicateActivityNotice(duplicates) : ''
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
          {duplicateLine && (
            <Typography
              variant="caption"
              sx={{ display: 'block', fontWeight: 700, color: 'warning.main' }}
            >
              {duplicateLine}
            </Typography>
          )}
        </>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {curriculumActionFootnote(action)}
      </Typography>
    </Stack>
  )
}

/**
 * Preview for a watch action (FEAT-149) — vet a found video in, or plan a
 * vetted one onto a day.
 *
 * A vet-in card carries something no other card in the portal does: **a tappable
 * link to the source**. That is the whole division of labour of this feature —
 * the model is a scout, the parent is the curator — so she has to be able to
 * WATCH the thing before she lets it into a library the boys can play from. The
 * card therefore shows the title she'll see, its length and subject, who it's
 * for, the one-line "why", and the link; the footnote says that adding it plans
 * nothing.
 *
 * A plan card names the video by title and the weekday **in words**, including
 * "next Tuesday" for the next-week half of the window — never an id, never a raw
 * date.
 */
function WatchPreview({
  resolved,
  childName,
}: {
  resolved: ResolvedWatchAction
  childName: string
}) {
  const { action } = resolved
  const isVetIn = action.kind === 'vetInVideo'
  return (
    <Stack spacing={0.25}>
      <Typography
        variant="caption"
        sx={{ display: 'block', fontWeight: 700, color: 'warning.main', letterSpacing: 0.2 }}
      >
        {isVetIn ? `Adds a video to ${childName}'s library` : `Adds a video to ${childName}'s week`}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {describeWatchAction(resolved, childName)}
      </Typography>
      {action.kind === 'vetInVideo' && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {describeVetInShape(action)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Why: {action.why}
          </Typography>
          <Link
            href={action.suggestedFromUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            sx={{ display: 'block', wordBreak: 'break-all' }}
          >
            Watch it first ↗
          </Link>
        </>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {watchActionFootnote(action)}
      </Typography>
    </Stack>
  )
}

/**
 * Preview for a Dad Lab action (FEAT-157) — create a concept arc, or plan a
 * backlog lab.
 *
 * The arc card's load-bearing rule: **the steps ARE the write, so every step
 * renders in order** — title and concept beat, numbered — and no card may
 * summarize them away. A parent confirming an arc is confirming a sequence of
 * Saturdays, and the sequence is the thing she has to be able to check.
 *
 * A lab card names the lab, its type, the arc step it realizes (by the arc's
 * TITLE and a 1-based step number — never an id), the driving question and the
 * materials when given, and — in the footnote — the sentence the design pinned:
 * it lands in the Dad Lab backlog and is started from the Dad Lab page, with
 * no hours until completion.
 */
function DadLabPreview({ resolved }: { resolved: ResolvedDadLabAction }) {
  const { action } = resolved
  return (
    <Stack spacing={0.25}>
      <Typography
        variant="caption"
        sx={{ display: 'block', fontWeight: 700, color: 'warning.main', letterSpacing: 0.2 }}
      >
        {action.kind === 'createConceptArc'
          ? 'Creates a Dad Lab concept arc'
          : 'Adds a lab to the Dad Lab backlog'}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {describeDadLabAction(resolved)}
      </Typography>
      {action.kind === 'createConceptArc' && (
        <Stack spacing={0} sx={{ pl: 0.5 }}>
          {action.domainLabel && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Domain: {action.domainLabel}
            </Typography>
          )}
          {action.steps.map((step, i) => (
            <Typography
              key={`${step.title}-${i}`}
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block' }}
            >
              {i + 1}. {step.title}
              {step.conceptBeat ? ` — ${step.conceptBeat}` : ''}
            </Typography>
          ))}
        </Stack>
      )}
      {action.kind === 'planLab' && (
        <>
          {action.question && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Question: {action.question}
            </Typography>
          )}
          {action.materials && action.materials.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Materials: {action.materials.join(', ')}
            </Typography>
          )}
        </>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {dadLabActionFootnote(action)}
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
 * The verb on a card's Confirm button, and the word its applied state settles
 * on (UX-32 / UX-41). Pure string selection — every tap still runs the same
 * `onConfirm(item.action)`.
 *
 * Three things this fixes, all of them the same fault (the verb not matching
 * the write):
 *  - `proposePlanAdjustment` said **"Review in Plan My Week"**, which reads
 *    read-only. It is a write: `stagePlanAdjustment` `setDoc`s a brief that,
 *    per its own docblock, overwrites any un-consumed prior one, then navigates
 *    away. "Send" is what happened, and "Sent" is what to say afterwards —
 *    "Done" belongs to a write that finished on a child's record.
 *  - one neutral **"Confirm"** fronted everything from a single sight word to
 *    `markActivityComplete`, whose own footnote says the app has no undo for it
 *    anywhere. That one gets its own verb.
 *  - an `editProfileField` that clears the field announced itself only through
 *    a caption-sized "(empty)" in the after-line. If the tap erases a field,
 *    the button says so.
 */
function confirmVerb(action: ChatAction): string {
  switch (action.kind) {
    case 'proposePlanAdjustment':
      return 'Send to Plan My Week'
    case 'draftNextWeek':
      return 'Draft it'
    case 'markActivityComplete':
      return 'Mark finished'
    case 'editProfileField':
      return action.value.trim() ? 'Confirm' : 'Clear this field'
    default:
      return 'Confirm'
  }
}

/** The in-flight word, matched to the verb above. */
function applyingVerb(action: ChatAction): string {
  switch (action.kind) {
    case 'proposePlanAdjustment':
      return 'Handing off…'
    case 'draftNextWeek':
      return 'Drafting…'
    default:
      return 'Saving…'
  }
}

/** The settled word. A handoff is "Sent"; a draft points at what it produced. */
function appliedVerb(action: ChatAction): string {
  switch (action.kind) {
    case 'proposePlanAdjustment':
      return 'Sent'
    case 'draftNextWeek':
      return 'Drafted below'
    default:
      return 'Done'
  }
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
 * a "Send to Plan My Week" CTA) since confirming it stages a brief and opens the
 * planner rather than writing a child's record, and `setActivityMinutes` (FEAT-135) as a named
 * old → new time diff carrying who it affects (loudly, when the activity is
 * shared) and the fact that it applies to future plans only, and the live-day
 * edits (FEAT-142) as a sentence naming the child, the weekday in words and the
 * row by its title — never an id — with a footnote that finished work stays
 * put, and the curriculum edits (FEAT-143) naming the activity by name with the
 * full shape for an add (subject · minutes · frequency, plus who it lands on)
 * and a real old → new for a position bump, footnoted with what the write does
 * NOT touch — and, for a completion, that the app has no undo for it, and the
 * watch actions (FEAT-149) naming the video by title and the weekday in words
 * ("next Tuesday"), with a vet-in additionally carrying its length, subject, the
 * one-line why, and a **tappable link to the source** so the parent can watch it
 * before she lets it into the library. A batch
 * "Confirm all" appears when 2+ are
 * still pending. Nothing here writes — taps call back into
 * `useShellyChatActions`. Mobile-first: large tap targets.
 */
export default function ActionConfirmCard({
  pending,
  familyChildren,
  activityConfigs = [],
  weekDays = [],
  watchVideos = [],
  plannableDays = [],
  conceptArcs = [],
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
          const isDraftNextWeek = isDraftNextWeekAction(action)
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
          // Gated on the LIVE configs only while the card is still PENDING —
          // that is when the gate means something (an activity finished in
          // another tab must stop offering a card here). Once she has tapped,
          // the question "may this be proposed?" is settled, and the card
          // renders leniently so a confirmed write keeps its "Done ✓". Without
          // that split, `markActivityComplete` succeeds and its own card
          // disappears, which is the one action where the confirmation matters
          // most — it cannot be undone (Codex P2, PR #1669).
          // FEAT-149 — resolve against the live library + the plannable window
          // so the card can name the video and the weekday in words.
          // Unresolvable proposals are already filtered out at stage time (with
          // a reason shown in the card's place); if one somehow reaches here we
          // render no card rather than one that names nothing. `canEdit` is true
          // at this point by construction — a non-parent's proposal never
          // becomes a `pending` entry — and the write layer checks it again.
          //
          // Gated on the LIVE library only while the card is still PENDING, the
          // same split FEAT-144 made for the curriculum cards: once she has
          // tapped, "may this be proposed?" is settled, and a vet-in's own write
          // makes it a duplicate of itself — so a strict gate here would delete
          // the "Done ✓" that is her only confirmation the video landed.
          const isWatch = isWatchAction(action)
          const isPending = item.status === 'pending'
          const watchGate =
            isWatch && isPending
              ? resolveWatchAction(action, watchVideos, plannableDays, true)
              : null
          if (isWatch && isPending && !watchGate?.ok) return null
          const watchResolved: ResolvedWatchAction | null = !isWatch
            ? null
            : watchGate?.ok
              ? watchGate.resolved
              : resolveWatchActionForDisplay(action, watchVideos, plannableDays)
          if (isWatch && !watchResolved) return null
          // FEAT-157 — resolve against the live arcs + real children so a
          // linked lab card names the arc by title and a step by number. Same
          // pending/applied split as the curriculum and watch cards: strict on
          // the live state only while the card is still PENDING (an arc
          // archived in another tab must stop offering a card here); lenient
          // once she has tapped, so a confirmed create keeps its "Done ✓".
          const isDadLab = isDadLabAction(action)
          const familyForDadLab = familyChildren.map((c) => ({ id: c.id, name: c.name }))
          const dadLabGate =
            isDadLab && item.status === 'pending'
              ? resolveDadLabAction(action, conceptArcs, familyForDadLab, true)
              : null
          if (isDadLab && item.status === 'pending' && !dadLabGate?.ok) return null
          const dadLabResolved: ResolvedDadLabAction | null = !isDadLab
            ? null
            : dadLabGate?.ok
              ? dadLabGate.resolved
              : resolveDadLabActionForDisplay(action, conceptArcs, familyForDadLab)
          const isCurriculum = isCurriculumAction(action)
          const curriculumGate =
            isCurriculum && isPending
              ? resolveCurriculumAction(action, activityConfigs, true)
              : null
          if (isCurriculum && isPending && !curriculumGate?.ok) return null
          const curriculumResolved = !isCurriculum
            ? null
            : curriculumGate?.ok
              ? curriculumGate.resolved
              : resolveCurriculumActionForDisplay(action, activityConfigs)
          if (isCurriculum && !curriculumResolved) return null
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
            ) : isDadLab ? (
              <ScienceOutlinedIcon fontSize="small" color="warning" />
            ) : isWatch ? (
              <OndemandVideoOutlinedIcon fontSize="small" color="warning" />
            ) : isDraftNextWeek ? (
              <CalendarMonthOutlinedIcon fontSize="small" color="info" />
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
                  isCurriculum ||
                  isDadLab ||
                  isWatch ||
                  isDraftNextWeek
                    ? 'flex-start'
                    : 'center',
                gap: 1,
                opacity: item.status === 'dismissed' ? 0.5 : 1,
                // Higher-stakes framing for snapshot edits: a left accent + a
                // slightly stronger border so they read weightier than a
                // sight-word card. The plan-adjustment handoff gets its own
                // (info) accent so it reads as "opens the planner", not a write.
                ...(isSnapshotEdit || isActivityMinutes || isDayItem || isCurriculum || isDadLab || isWatch
                  ? { borderColor: 'warning.main', borderLeftWidth: 3 }
                  : isPlanAdjustment || isDraftNextWeek
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
                ) : watchResolved ? (
                  <WatchPreview
                    resolved={watchResolved}
                    childName={childName(action.childId)}
                  />
                ) : curriculumResolved ? (
                  <CurriculumPreview
                    resolved={curriculumResolved}
                    childName={childName(action.childId)}
                    allChildNames={allChildNames}
                  />
                ) : dadLabResolved ? (
                  <DadLabPreview resolved={dadLabResolved} />
                ) : isSnapshotEdit ? (
                  <SnapshotEditPreview action={action} childName={childName(action.childId)} />
                ) : isDraftNextWeek ? (
                  <DraftNextWeekPreview action={action} childName={childName(action.childId)} />
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
                    color={isPlanAdjustment || isDraftNextWeek ? 'info' : 'primary'}
                    onClick={() => onConfirm(item.action)}
                    sx={{ textTransform: 'none', minWidth: 0, py: 0.5 }}
                  >
                    {confirmVerb(action)}
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
              {item.status === 'applying' && (
                <Typography variant="caption" color="text.secondary">
                  {applyingVerb(action)}
                </Typography>
              )}
              {item.status === 'applied' && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    color: isDraftNextWeek ? 'info.main' : 'success.main',
                  }}
                >
                  <CheckCircleIcon fontSize="small" />
                  {/* "Done" would be a lie on a draft card: the tap produced a
                      week to READ, and nothing has been written. The word points
                      at the draft below, which is where the actual decision is.
                      A handoff is the same shape — it staged a brief and opened
                      the planner, so it settles on "Sent" (UX-32). */}
                  <Typography variant="caption">
                    {appliedVerb(action)}
                  </Typography>
                </Box>
              )}
              {item.status === 'dismissed' && (
                <Typography variant="caption" color="text.secondary">
                  Dismissed
                </Typography>
              )}
              {/* UX-33(c) — a confirmed write that REJECTED. The card already
                  reverted to "Confirm" so a retry was possible; what was
                  missing was any account of why the button came back. Said in
                  the card's own voice, under the buttons it belongs to, so a
                  multi-card turn names the one that failed. */}
              {item.error && (
                <Typography
                  variant="caption"
                  color="error.main"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  {item.error}
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
