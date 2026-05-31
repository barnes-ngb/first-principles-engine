import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
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
 * Inline confirm cards for proposed `<action>` writes (Build Step 3b + 4). Each
 * pending action gets a human-readable preview with Confirm / Dismiss — sight
 * words as a one-liner, `editProfileField` as a before → after diff since those
 * are replace-writes on freeform text. A batch "Confirm all" appears when 2+
 * are still pending. Nothing here writes — taps call back into
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
          const icon =
            action.kind === 'addSightWord' ? (
              <AddCircleOutlineIcon fontSize="small" color="action" />
            ) : action.kind === 'removeSightWord' ? (
              <RemoveCircleOutlineIcon fontSize="small" color="action" />
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
                alignItems: isProfileEdit ? 'flex-start' : 'center',
                gap: 1,
                opacity: item.status === 'dismissed' ? 0.5 : 1,
              }}
            >
              {icon}
              <Box sx={{ flex: 1 }}>
                {isProfileEdit ? (
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
                    onClick={() => onConfirm(item.action)}
                    sx={{ textTransform: 'none', minWidth: 0, py: 0.5 }}
                  >
                    Confirm
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
