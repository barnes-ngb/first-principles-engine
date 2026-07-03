import type { ArcStep } from '../../core/types'
import { ArcStepStatus } from '../../core/types/enums'

/**
 * Pure step-status transitions for a ConceptArc's `steps` array. These never
 * mutate the input — they return a new array — so they are trivially testable
 * and safe to feed straight into a Firestore write.
 *
 * Invariant enforced everywhere: **at most one `active` step per arc.**
 */

/** Metadata stamped onto a step when it is marked done. */
export interface StepDoneMeta {
  completedReportId?: string
  completedDateKey?: string
}

/**
 * Mark the step at `index` as done. If, afterward, no step is `active`,
 * auto-advance: promote the next `upcoming` step (the first one after `index`,
 * else the earliest `upcoming` overall) to `active`. Out-of-range indices are
 * a no-op.
 */
export function markStepDone(
  steps: ArcStep[],
  index: number,
  meta?: StepDoneMeta,
): ArcStep[] {
  if (index < 0 || index >= steps.length) return steps

  const next = steps.map((step, i) =>
    i === index
      ? {
          ...step,
          status: ArcStepStatus.Done,
          ...(meta?.completedReportId ? { completedReportId: meta.completedReportId } : {}),
          ...(meta?.completedDateKey ? { completedDateKey: meta.completedDateKey } : {}),
        }
      : step,
  )

  // Auto-advance the active pointer if the arc no longer has an active step.
  if (!next.some((s) => s.status === ArcStepStatus.Active)) {
    let promote = next.findIndex((s, i) => i > index && s.status === ArcStepStatus.Upcoming)
    if (promote === -1) promote = next.findIndex((s) => s.status === ArcStepStatus.Upcoming)
    if (promote !== -1) {
      next[promote] = { ...next[promote], status: ArcStepStatus.Active }
    }
  }

  return next
}

/**
 * Make the step at `index` the single active step: any other `active` step is
 * demoted back to `upcoming`; `done` steps are left untouched. Out-of-range
 * indices are a no-op.
 */
export function setActiveStep(steps: ArcStep[], index: number): ArcStep[] {
  if (index < 0 || index >= steps.length) return steps
  return steps.map((step, i) => {
    if (i === index) return { ...step, status: ArcStepStatus.Active }
    if (step.status === ArcStepStatus.Active) return { ...step, status: ArcStepStatus.Upcoming }
    return step
  })
}
