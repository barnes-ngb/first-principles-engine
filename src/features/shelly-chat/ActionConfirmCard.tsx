import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
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

/** Plain-language preview for a proposed action, e.g. Add sight word "because". */
function describeAction(action: ChatAction, childName: string): string {
  const verb = action.kind === 'addSightWord' ? 'Add' : 'Remove'
  return `${verb} sight word "${action.word.toLowerCase()}" for ${childName}`
}

/**
 * Inline confirm cards for proposed `<action>` writes (Build Step 3b). Each
 * pending action gets a human-readable preview with Confirm / Dismiss; a batch
 * "Confirm all" appears when 2+ are still pending. Nothing here writes — taps
 * call back into `useShellyChatActions`. Mobile-first: large tap targets.
 */
export default function ActionConfirmCard({
  pending,
  familyChildren,
  onConfirm,
  onDismiss,
  onConfirmAll,
}: ActionConfirmCardProps) {
  if (pending.length === 0) return null

  const childName = (childId: string): string =>
    familyChildren.find((c) => c.id === childId)?.name ?? 'this child'

  const stillPending = pending.filter((p) => p.status === 'pending')

  return (
    <Box sx={{ px: 1, pb: 1 }}>
      <Stack spacing={1}>
        {pending.map((item) => {
          const isAdd = item.action.kind === 'addSightWord'
          return (
            <Paper
              key={item.id}
              variant="outlined"
              sx={{
                p: 1.25,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                opacity: item.status === 'dismissed' ? 0.5 : 1,
              }}
            >
              {isAdd ? (
                <AddCircleOutlineIcon fontSize="small" color="action" />
              ) : (
                <RemoveCircleOutlineIcon fontSize="small" color="action" />
              )}
              <Typography variant="body2" sx={{ flex: 1 }}>
                {describeAction(item.action, childName(item.action.childId))}
              </Typography>

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
