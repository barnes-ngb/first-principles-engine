import type { DadLabReport } from '../../core/types'

/**
 * Every artifact id a Dad Lab report OWNS — the single answer to "what's on
 * this report" (UX-85).
 *
 * A lab's evidence is stored on the report in **two** places depending on which
 * capture flow wrote it:
 *
 * - `childReports[*].artifacts[]` — the legacy per-child capture (and the kid
 *   view's own "Capture My Work" writes);
 * - `beats[*].items[].artifactId` — the FEAT-56 three-beat capture, which is
 *   today's DEFAULT and where FEAT-156 routes uploads. Most lab photos land
 *   here from here on.
 *
 * Reading only the child-report side makes a modern lab look empty on the
 * overview card while its detail view is full of photos — Nathan's Aug 22 lab.
 * The two sets legitimately overlap (the same artifact can be referenced from
 * both), so ids are de-duplicated and counted once.
 *
 * Ordering is stable and preserves the pre-existing convention: child-report
 * artifacts first (in `Object.values` order), then beat items in beat order.
 * Pure — no Firestore read, no resolution of whether the artifact doc exists.
 */
export function reportArtifactIds(report: DadLabReport): string[] {
  const ids = new Set<string>()
  for (const childReport of Object.values(report.childReports ?? {})) {
    for (const id of childReport?.artifacts ?? []) if (id) ids.add(id)
  }
  for (const beat of Object.values(report.beats ?? {})) {
    for (const item of beat?.items ?? []) if (item?.artifactId) ids.add(item.artifactId)
  }
  return Array.from(ids)
}
