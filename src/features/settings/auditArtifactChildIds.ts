import { getDocs } from 'firebase/firestore'

import { artifactsCollection } from '../../core/firebase/firestore'
import type { Child } from '../../core/types'

/**
 * FEAT-183 (B14) — a READ-ONLY census of artifacts whose `childId` is not a
 * child doc id.
 *
 * Kid Dad-Lab captures used to be written with `childId: child.name.toLowerCase()`
 * (`KidLabView.tsx`), so every artifact a kid captured in a lab carried
 * `'lincoln'` / `'london'` instead of the Firestore doc id. Readers query
 * `where('childId','==', child.id)`, so those artifacts are invisible
 * everywhere but the lab page that wrote them. The write is fixed going
 * forward; this counts what the fix leaves behind.
 *
 * It NEVER writes. A backfill touches artifacts under a child's record, so it
 * is a separate propose → confirm decision — the count is the evidence for it.
 */

/** One stray `childId` value and what carries it. */
export interface StrayChildIdGroup {
  /** The `childId` value stored on the artifacts (not a child doc id). */
  childId: string
  /** How many artifacts carry it. */
  count: number
  /**
   * The child this value most likely meant, matched case-insensitively
   * against `child.name`. `undefined` when nothing matches — those need a
   * human to decide before any backfill.
   */
  likelyChild?: { id: string; name: string }
  /** A few artifact ids + titles, so the report is checkable by eye. */
  samples: Array<{ id: string; title: string; createdAt?: string }>
}

export interface ArtifactChildIdAudit {
  /** Total artifacts read. */
  total: number
  /** Artifacts whose `childId` is a real child doc id. */
  matched: number
  /** Artifacts with no `childId` at all — not this bug; reported separately. */
  missing: number
  /** Artifacts whose `childId` is some other string, grouped by that string. */
  stray: StrayChildIdGroup[]
}

/** How many example artifacts to keep per stray value. */
const MAX_SAMPLES = 5

/** The shape this audit reads off an artifact doc — nothing else is touched. */
export interface AuditArtifactRow {
  id: string
  childId?: unknown
  title?: unknown
  createdAt?: unknown
}

/**
 * Pure classifier: given the family's artifacts and children, report which
 * `childId` values are not child doc ids. Sorted by count, descending, so the
 * biggest group reads first; ties break on the id so the output is stable.
 */
export function auditArtifactChildIds(
  artifacts: AuditArtifactRow[],
  children: Pick<Child, 'id' | 'name'>[],
): ArtifactChildIdAudit {
  const childIds = new Set(children.map((c) => c.id))
  const byName = new Map(
    children.map((c) => [c.name.trim().toLowerCase(), c]),
  )

  let matched = 0
  let missing = 0
  const groups = new Map<string, StrayChildIdGroup>()

  for (const a of artifacts) {
    const raw = typeof a.childId === 'string' ? a.childId : ''
    if (!raw) {
      missing += 1
      continue
    }
    if (childIds.has(raw)) {
      matched += 1
      continue
    }
    let group = groups.get(raw)
    if (!group) {
      const match = byName.get(raw.trim().toLowerCase())
      group = {
        childId: raw,
        count: 0,
        ...(match ? { likelyChild: { id: match.id, name: match.name } } : {}),
        samples: [],
      }
      groups.set(raw, group)
    }
    group.count += 1
    if (group.samples.length < MAX_SAMPLES) {
      group.samples.push({
        id: a.id,
        title: typeof a.title === 'string' ? a.title : '(untitled)',
        ...(typeof a.createdAt === 'string' ? { createdAt: a.createdAt } : {}),
      })
    }
  }

  const stray = [...groups.values()].sort(
    (x, y) => y.count - x.count || x.childId.localeCompare(y.childId),
  )

  return { total: artifacts.length, matched, missing, stray }
}

/** Read every artifact in the family and run the audit. Read-only. */
export async function fetchArtifactChildIdAudit(
  familyId: string,
  children: Pick<Child, 'id' | 'name'>[],
): Promise<ArtifactChildIdAudit> {
  const snap = await getDocs(artifactsCollection(familyId))
  const rows: AuditArtifactRow[] = snap.docs.map((d) => {
    const data = d.data() as unknown as Record<string, unknown>
    return {
      id: d.id,
      childId: data.childId,
      title: data.title,
      createdAt: data.createdAt,
    }
  })
  return auditArtifactChildIds(rows, children)
}
