import { DadLabType, SubjectBucket } from '../../core/types/enums'

/**
 * The single source of truth for Dad Lab type → subject routing (FEAT-55).
 *
 * The lab-type chip is the one tagging system: picking a type stamps a default
 * set of `subjectTags` onto the report, which is what actually credits
 * compliance hours (see `useDadLabReports.syncComplianceHours`). The
 * subject-tag checkboxes on `LabReportForm` remain the single *editable* truth —
 * a manual edit always wins over the derived default.
 *
 * OWNER-TUNABLE DATA: these are the owner-approved defaults (2026-07-04). They
 * are deliberately data, not logic — edit this table to re-point routing; every
 * creation path reads from it. A future DATA audit run (see FEAT-55) may retune
 * these once real per-type distributions are visible in-app.
 */
export const LAB_TYPE_SUBJECTS: Record<DadLabType, SubjectBucket[]> = {
  [DadLabType.Science]: [SubjectBucket.Science],
  [DadLabType.Engineering]: [SubjectBucket.Science, SubjectBucket.PracticalArts],
  [DadLabType.Adventure]: [SubjectBucket.Science, SubjectBucket.PE],
  [DadLabType.Heart]: [SubjectBucket.Other],
}

/**
 * The default subject tags for a lab type. Returns a fresh array each call so
 * callers can freely mutate/spread without touching the shared table. Falls back
 * to `[Science]` for any unknown type (mirrors the existing `parseLabType`
 * science default).
 */
export function subjectsForLabType(type: DadLabType): SubjectBucket[] {
  return [...(LAB_TYPE_SUBJECTS[type] ?? LAB_TYPE_SUBJECTS[DadLabType.Science])]
}
