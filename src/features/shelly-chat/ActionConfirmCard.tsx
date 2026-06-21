import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined'
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { ChatAction, Child } from '../../core/types'
import type { PendingAction } from './useShellyChatActions'

interface ActionConfirmCardProps {
  pending: PendingAction[]
  familyChildren: Child[]
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
 * than writing a child's record. A batch "Confirm all" appears when 2+ are
 * still pending. Nothing here writes — taps call back into
 * `useShellyChatActions`. Mobile-first: large tap targets.
 */
export default function ActionConfirmCard({
  pending,
  familyChildren,
  onConfirm,
  onDismiss,
  onConfirmAll,
}: ActionConfirmCardProps) {
  if (pending.length === 0) return null

  const childFor = (childId: string): Child | undefined =>
    familyChildren.find((c) => c.id === childId)
  const childName = (childId: string): string =>
    childFor(childId)?.name ?? 'this child'

  const stillPending = pending.filter((p) => p.status === 'pending')

  return (
    <Box sx={{ px: 1, pb: 1 }}>
      <Stack spacing={1}>
        {pending.map((item) => {
          const { action } = item
          const isProfileEdit = action.kind === 'editProfileField'
          const isSnapshotEdit = isSnapshotAction(action)
          const isPlanAdjustment = action.kind === 'proposePlanAdjustment'
          const icon =
            action.kind === 'addSightWord' ? (
              <AddCircleOutlineIcon fontSize="small" color="action" />
            ) : action.kind === 'removeSightWord' ? (
              <RemoveCircleOutlineIcon fontSize="small" color="action" />
            ) : isSnapshotEdit ? (
              <SchoolOutlinedIcon fontSize="small" color="warning" />
            ) : isPlanAdjustment ? (
              <EventNoteOutlinedIcon fontSize="small" color="info" />
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
                  isProfileEdit || isSnapshotEdit || isPlanAdjustment ? 'flex-start' : 'center',
                gap: 1,
                opacity: item.status === 'dismissed' ? 0.5 : 1,
                // Higher-stakes framing for snapshot edits: a left accent + a
                // slightly stronger border so they read weightier than a
                // sight-word card. The plan-adjustment handoff gets its own
                // (info) accent so it reads as "opens the planner", not a write.
                ...(isSnapshotEdit
                  ? { borderColor: 'warning.main', borderLeftWidth: 3 }
                  : isPlanAdjustment
                    ? { borderColor: 'info.main', borderLeftWidth: 3 }
                    : {}),
              }}
            >
              {icon}
              <Box sx={{ flex: 1 }}>
                {isSnapshotEdit ? (
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
                ) : (
                  <Typography variant="body2">
                    {describeSightWord(action, childName(action.childId))}
                  </Typography>
                )}
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
