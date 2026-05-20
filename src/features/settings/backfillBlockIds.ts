/**
 * One-time backfill for conceptualBlocks to add stable `id` fields and
 * lifecycle defaults. Legacy blocks from guided eval pattern detection
 * were written before Phase 1 (IDs + merge), so without IDs the merge
 * system can't match them to new evidence from quest/scan/parent writers.
 *
 * Idempotent — blocks that already have an `id` are left untouched.
 */

import { doc, getDoc, getDocs, updateDoc } from 'firebase/firestore'

import type { ConceptualBlock, SkillSnapshot } from '../../core/types/evaluation'
import {
  childrenCollection,
  skillSnapshotsCollection,
} from '../../core/firebase/firestore'
import { generateBlockId } from '../../core/utils/blockerLifecycle'

// ── Types ────────────────────────────────────────────────────────

export interface BackfillBlockIdsResult {
  childId: string
  childName: string
  blocksTotal: number
  blocksUpdated: number
  hadSnapshot: boolean
}

// ── Pure logic (exported for testing) ────────────────────────────

/**
 * For each block missing an `id`, generate one from its name and fill in
 * sensible lifecycle defaults. Blocks that already have an `id` are
 * returned unchanged. Returns the new array and the number of blocks
 * that were updated.
 *
 * Does NOT touch Firestore — safe for unit tests.
 */
export function backfillBlocks(
  blocks: ConceptualBlock[],
): { blocks: ConceptualBlock[]; updatedCount: number } {
  let updatedCount = 0
  const next = blocks.map((block) => {
    if (block.id) return block
    updatedCount += 1
    return {
      ...block,
      id: generateBlockId(block.name),
      firstDetectedAt: block.firstDetectedAt ?? block.detectedAt,
      sessionCount: block.sessionCount ?? 1,
      source: block.source ?? 'evaluation',
    }
  })
  return { blocks: next, updatedCount }
}

// ── Firestore orchestration ──────────────────────────────────────

export async function backfillBlockIds(
  familyId: string,
): Promise<BackfillBlockIdsResult[]> {
  const childrenSnap = await getDocs(childrenCollection(familyId))
  const children = childrenSnap.docs.map((d) => ({
    id: d.id,
    name: (d.data() as { name?: string }).name ?? d.id,
  }))

  const results: BackfillBlockIdsResult[] = []

  for (const child of children) {
    const snapshotRef = doc(skillSnapshotsCollection(familyId), child.id)
    const snapshotSnap = await getDoc(snapshotRef)

    if (!snapshotSnap.exists()) {
      results.push({
        childId: child.id,
        childName: child.name,
        blocksTotal: 0,
        blocksUpdated: 0,
        hadSnapshot: false,
      })
      continue
    }

    const snapshot = snapshotSnap.data() as Partial<SkillSnapshot>
    const existingBlocks = snapshot.conceptualBlocks ?? []

    const { blocks: updatedBlocks, updatedCount } = backfillBlocks(existingBlocks)

    if (updatedCount > 0) {
      await updateDoc(snapshotRef, {
        conceptualBlocks: JSON.parse(JSON.stringify(updatedBlocks)),
        blocksUpdatedAt: new Date().toISOString(),
      })
    }

    results.push({
      childId: child.id,
      childName: child.name,
      blocksTotal: existingBlocks.length,
      blocksUpdated: updatedCount,
      hadSnapshot: true,
    })
  }

  return results
}
