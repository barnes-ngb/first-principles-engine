import { useRef, useState } from 'react'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useActiveChild } from '../../core/hooks/useActiveChild'
import { ErrorSource, reportError } from '../../core/observability'
import type { WeeklyReview } from '../../core/types'
import { retryWeeklyReview } from './retryWeeklyReview'
import { WEEK_RETRY_FAILED_LINE, weekRetryOffer } from './weekHours'

export interface WeekRetryControlProps {
  familyId: string
  childId: string
  weekKey: string
  review: WeeklyReview | null
}

/**
 * *Try again* for a week whose summary did not land — **parent-only** (UX-420).
 *
 * Owner, 2026-09-27: *"Both — the hole and the re-run door."* `UX-219` removed
 * the general *Regenerate* button correctly, and this is not it: it renders only
 * where the document records a failure and no narrative stands
 * (`weekRetryOffer`), and it says what the tap will and will not do before it is
 * made.
 *
 * **Gated on capability, never a name, and here as well as above.**
 * `WeekPaceSection` already returns nothing for a child profile; this control
 * checks again because it spends a paid model call, and the callable's own
 * `uid !== familyId` check cannot tell a kid profile on the family account from
 * a parent.
 *
 * **One call at a time, and its outcome belongs to the week it was made for.**
 * The in-flight guard is a ref, so a double tap inside one render fires once.
 * The pending/failed state is keyed by `child|week`: the header's switcher can
 * change `childId` mid-call, and the call itself carries the child and week it
 * was made for, so a switch neither retargets it nor shows its outcome on the
 * other boy's week (the census's SAFE verdict, stated with the line that makes
 * it true — `stateKey` below).
 */
export default function WeekRetryControl(props: WeekRetryControlProps) {
  const { isChildProfile } = useActiveChild()
  if (isChildProfile) return null
  return <WeekRetryBody {...props} />
}

type Phase = 'pending' | 'failed'

function WeekRetryBody({ familyId, childId, weekKey, review }: WeekRetryControlProps) {
  const stateKey = `${childId}|${weekKey}`
  const [attempt, setAttempt] = useState<{ key: string; phase: Phase } | null>(null)
  // Keyed, like the phase (Codex round 1, P2): a boolean held for week A left
  // week B's button enabled and dead after a switch until A finished.
  const inFlight = useRef<Set<string>>(new Set())

  const offer = weekRetryOffer(review)
  const phase = attempt?.key === stateKey ? attempt.phase : null
  if (!offer) return null

  const onTap = async () => {
    const key = stateKey
    if (inFlight.current.has(key)) return
    inFlight.current.add(key)
    setAttempt({ key, phase: 'pending' })
    try {
      await retryWeeklyReview({ familyId, childId, weekKey })
      // Success says nothing of its own: the listener delivers the narrative
      // and `weekRetryOffer` then returns null, which removes this control.
      setAttempt((current) => (current?.key === key ? null : current))
    } catch (err) {
      // A handled failure still reaches the sink (UX-276) — as its SHAPE only.
      // The callable's code is ours; its message is not rendered or logged,
      // because a server message is not guaranteed free of model text (UX-449).
      const code =
        err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'unknown'
      void reportError({
        name: 'WeeklyReviewRetryFailed',
        message: `weekly-review retry failed (code=${code})`,
        stack: null,
        route: typeof window !== 'undefined' ? window.location.pathname : null,
        section: 'weekly-review-retry',
        source: ErrorSource.Handled,
      })
      setAttempt((current) => (current?.key === key ? { key, phase: 'failed' } : current))
    } finally {
      inFlight.current.delete(key)
    }
  }

  return (
    <Stack spacing={0.5} alignItems="flex-start">
      <Typography variant="caption" color="text.secondary">
        {offer.note}
      </Typography>
      <Button
        size="small"
        variant="outlined"
        onClick={onTap}
        disabled={phase === 'pending'}
      >
        {phase === 'pending' ? 'Asking…' : offer.label}
      </Button>
      {phase === 'failed' && (
        <Typography variant="body2" color="text.secondary" role="status">
          {WEEK_RETRY_FAILED_LINE}
        </Typography>
      )}
    </Stack>
  )
}
