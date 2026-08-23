// ── The Planned-lab creation lane, as a module (FEAT-157) ────────────────────
//
// Extracted from `DadLabPage.handleSuggestionSelect` so a second caller — the
// Shelly-chat portal's confirmed `planLab` action — creates a backlog entry
// through the SAME builder and the SAME write as the Dad Lab page's suggestion
// flow, rather than reimplementing the report shape (the `watchDayItem.ts`
// pattern: one definition of the row, however many doors lead to it).
//
// Two invariants live here and are pinned by tests:
//   1. **The report lands `Planned`, always.** The builder hardcodes the
//      status, so no caller can create an `Active` or `Complete` lab through
//      this lane — and therefore no caller can reach `syncComplianceHours` or
//      the XP award, both of which fire only on completion (`useDadLabReports`).
//   2. **Subject tags are stamped at creation** from the type → subject mapping
//      (FEAT-55), so a planned lab never lands with empty tags — the silent
//      zero-hours path when it is eventually completed.

import { addDoc } from 'firebase/firestore'

import { dadLabReportsCollection } from '../../core/firebase/firestore'
import type { DadLabReport } from '../../core/types'
import type { DadLabType } from '../../core/types/enums'
import { DadLabStatus } from '../../core/types/enums'
import { weekKeyFromDate } from '../../core/utils/dateKey'
import { formatDateYmd } from '../../core/utils/format'

import { subjectsForLabType } from './labTypeSubjects'

/** What a caller supplies for a new backlog entry. Everything else is defaulted. */
export interface PlannedLabInput {
  title?: string
  question?: string
  labType?: DadLabType
  description?: string
  materials?: string[]
  /** Per-child role text keyed by childId (ARCH-40). */
  childRoles?: Record<string, string>
  duration?: number
  /** Link to a ConceptArc — validated by the caller against the live arcs. */
  arcId?: string
  /** 0-based index into the arc's steps — validated by the caller. */
  arcStepIndex?: number
}

/** The next Saturday (or today, on a Saturday) — Dad Lab's default date. */
export function getNextSaturday(now: Date = new Date()): Date {
  const d = new Date(now)
  const day = d.getDay()
  const diff = (6 - day + 7) % 7 || 7
  d.setDate(d.getDate() + (day === 6 ? 0 : diff))
  return d
}

/**
 * Build a `Planned` backlog entry — the exact shape `handleSuggestionSelect`
 * built inline before extraction. Pure, so the shape is testable without
 * Firestore and both callers provably write the same thing.
 */
export function buildPlannedLabReport(
  input: PlannedLabInput,
  now: Date = new Date(),
): DadLabReport {
  const nextSat = getNextSaturday(now)
  const labType = input.labType ?? 'science'
  return {
    date: formatDateYmd(nextSat),
    weekKey: weekKeyFromDate(nextSat),
    title: input.title?.trim() || 'Untitled Lab',
    labType,
    question: input.question ?? '',
    description: input.description ?? '',
    status: DadLabStatus.Planned,
    materials: input.materials,
    childRoles: input.childRoles ?? {},
    childReports: {},
    // Type → subject routing (FEAT-55): stamp the mapping's defaults at
    // creation so a planned lab never lands with empty tags (the silent
    // zero-hours path). Stays editable on LabReportForm.
    subjectTags: subjectsForLabType(labType),
    totalMinutes: input.duration ?? 60,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...(input.arcId ? { arcId: input.arcId } : {}),
    ...(input.arcId && input.arcStepIndex != null
      ? { arcStepIndex: input.arcStepIndex }
      : {}),
  }
}

/**
 * Create a `Planned` backlog entry. Writes ONE report document and nothing
 * else — no hours (labs feed compliance only on completion), no XP, no status
 * transition. Starting the lab stays a Dad Lab page act.
 */
export async function createPlannedLab(
  familyId: string,
  input: PlannedLabInput,
): Promise<string> {
  const ref = await addDoc(dadLabReportsCollection(familyId), buildPlannedLabReport(input))
  return ref.id
}
