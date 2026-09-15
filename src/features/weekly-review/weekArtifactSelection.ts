import type { Artifact } from '../../core/types'
import { parseDateYmd } from '../../core/utils/format'

/** The caller stamps Firestore's document ID after the data, before deduping. */
type SavedArtifact = Artifact & { id: string }

/**
 * A capture's explicit activity day wins over its upload timestamp (UX-413a).
 * Only a valid bare YYYY-MM-DD is supported: composite IDs and malformed links
 * keep the old createdAt membership, as do current book/sketch artifacts with
 * no day link. No timestamp or stored record is changed.
 *
 * Candidates must include BOTH the dayLogId range and the existing createdAt
 * range. Filtering only the latter cannot recover a later-uploaded capture.
 */
export function selectWeekArtifacts(
  candidates: readonly SavedArtifact[],
  start: string,
  end: string,
): Artifact[] {
  const unique = new Map(candidates.map((artifact) => [artifact.id, artifact]))
  return [...unique.values()].filter((artifact) => {
    const day = artifact.dayLogId
    if (typeof day === 'string' && parseDateYmd(day)) {
      return day >= start && day <= end
    }
    // Preserve the existing upload-date bounds for evidence without a usable day.
    return artifact.createdAt >= start && artifact.createdAt <= `${end}T23:59:59`
  })
}
