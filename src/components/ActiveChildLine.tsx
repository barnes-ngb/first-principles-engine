import Typography from '@mui/material/Typography'

import { useActiveChild } from '../core/hooks/useActiveChild'
import {
  ACTIVE_CHILD_LINE_LOADING,
  ACTIVE_CHILD_SWITCH_HINT,
  activeChildLine,
} from './activeChildLine'

/**
 * *"For Lincoln."* — see `activeChildLine.ts` for why this exists.
 *
 * It reads `useActiveChild` rather than taking a name, for the same reason
 * `ChildSwitcherChip` does: one source of truth, so the line and the chip can
 * never name different boys. Presentational — no Firestore, no state, no
 * control. It renders nothing when the family has no children at all, where the
 * chip is offering *Add a child* and there is no name to state.
 */
export default function ActiveChildLine({
  hint = false,
}: {
  /** Append the one sentence saying where the child is changed. */
  hint?: boolean
}) {
  const { activeChild, isLoading, children } = useActiveChild()
  if (!activeChild) {
    if (isLoading && children.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          {ACTIVE_CHILD_LINE_LOADING}
        </Typography>
      )
    }
    return null
  }
  return (
    <Typography variant="body2" color="text.secondary">
      {activeChildLine(activeChild.name)}
      {hint ? ` ${ACTIVE_CHILD_SWITCH_HINT}` : ''}
    </Typography>
  )
}
