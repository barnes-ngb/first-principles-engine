/**
 * Pure helpers for the parent Records Build Studio hours card.
 *
 * They live apart from `BuildStudioHoursCard.tsx` so that file exports only its
 * component (the `react-refresh/only-export-components` rule). Behavior is
 * unchanged from when they sat beside the component.
 */

import type { HoursEntry } from '../../core/types'
import {
  BUILD_STUDIO_CREDIT_HOURS_SOURCE,
  type BuildStudioCreditProvenance,
  type BuildStudioVersion,
} from '../../core/types/buildStudio'
import { creditHoursId } from '../build-studio/buildStudioCreditProof'
import { BUILD_STUDIO_PROJECT_ID } from '../build-studio/buildStudioStarter'

// ── Gate ────────────────────────────────────────────────────────────────────

export interface RecordsReadScope {
  familyId: string
  startDate: string
  endDate: string
}

/**
 * May the Build Studio section read or show anything? Every term must be
 * AFFIRMATIVE, so a missing answer (an unsettled family, an older mock, a child
 * profile) is "no". Pure, so the page and the tests share one answer.
 */
export function buildStudioCardAllowed(args: {
  canEdit: boolean
  isChildProfile: boolean
  /** From `useActiveChild`: true only when identity was proven, not fallen back to. */
  profileChildResolved: boolean | undefined
  familyId: string | null | undefined
  /** The family whose read produced the children list in hand. */
  childrenFamilyId: string | null | undefined
  childrenLoading: boolean
  activeChildId: string | null | undefined
  /** The `children` document for `activeChildId` was found in that list. */
  activeChildFound: boolean
  recordsLoading: boolean
  /** The scope the page's hours array was actually read under. */
  readScope: RecordsReadScope | null
  startDate: string
  endDate: string
}): boolean {
  return (
    args.canEdit === true &&
    !args.isChildProfile &&
    args.profileChildResolved === true &&
    !!args.familyId &&
    args.childrenFamilyId === args.familyId &&
    !args.childrenLoading &&
    !!args.activeChildId &&
    args.activeChildFound &&
    !args.recordsLoading &&
    args.readScope !== null &&
    args.readScope.familyId === args.familyId &&
    args.readScope.startDate === args.startDate &&
    args.readScope.endDate === args.endDate
  )
}

// ── Pure helpers ────────────────────────────────────────────────────────────

export interface CreditedRow {
  entry: HoursEntry
  /** `null` when the row's provenance is not exactly this child's credit. */
  provenance: BuildStudioCreditProvenance | null
}

/** This child's credited rows, oldest first. Anything off about a row only hides its link. */
export function creditedRowsFor(entries: HoursEntry[], childId: string): CreditedRow[] {
  return entries
    .filter((e) => e.source === BUILD_STUDIO_CREDIT_HOURS_SOURCE && e.childId === childId)
    .map((entry) => {
      const p = entry.buildStudioCredit
      const ok =
        !!p &&
        p.schema === 1 &&
        typeof p.projectId === 'string' &&
        typeof p.versionId === 'string' &&
        entry.id === creditHoursId(childId, p.projectId, p.versionId)
      return { entry, provenance: ok ? (p as BuildStudioCreditProvenance) : null }
    })
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date))
}

const DAY_MS = 86_400_000

/** How many candidate saves are listed at first; "Show more" grows it by this much. */
export const MAX_LISTED = 8

/**
 * New saves worth previewing: this child's Apple Dash versions with a SERVER
 * acceptance time that falls in the Records range (a day of slack either side for
 * the family time zone) and no credit row already showing. Older saves carry no
 * `acceptedAt` and are never offered. Newest first.
 */
export function candidateVersions(
  versions: BuildStudioVersion[],
  childId: string,
  credited: ReadonlySet<string>,
  startDate: string,
  endDate: string,
): BuildStudioVersion[] {
  const from = Date.parse(`${startDate}T00:00:00Z`) - DAY_MS
  const to = Date.parse(`${endDate}T00:00:00Z`) + 2 * DAY_MS
  if (!Number.isFinite(from) || !Number.isFinite(to)) return []
  return versions
    .filter((v) => {
      if (v.childId !== childId || v.projectId !== BUILD_STUDIO_PROJECT_ID) return false
      if (credited.has(v.versionId)) return false
      const ms = typeof v.acceptedAt?.toMillis === 'function' ? v.acceptedAt.toMillis() : NaN
      return Number.isFinite(ms) && ms >= from && ms <= to
    })
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}
