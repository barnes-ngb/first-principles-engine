import {
  doc,
  getDocs,
  getDoc,
  limit,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'

import { nameKey } from '../utils/nameKey'

import type { ActivityConfig, WorkbookConfig } from '../types'
import type { ActivityType } from '../types/enums'
import { activityConfigsCollection, db, skillSnapshotsCollection, workbookConfigsCollection } from './firestore'

// ── One seed list, one writer, and a guard that cannot double (UX-231) ───────
//
// This file used to hold **two** seeders — `migrateToActivityConfigs` with its
// own inline `defaults` array, and `ensureDefaultActivityConfigs` with
// `DEFAULT_ROUTINE_CONFIGS` — and `useActivityConfigs` ran them in sequence from
// an effect on every mount. That hook is mounted on three surfaces at once
// (`PlannerChatPage`, `CurriculumTab`, `TodayPage`), and `TodayPage` called the
// second seeder a fourth time directly. Both guarded with the same
// check-then-act: query `activityConfigs` for this child, `limit(1)`, and write
// the whole list if the read came back empty.
//
// Check-then-act from a hook mounted in five places is a race with five runners.
// On a family's first load the reads all returned empty and more than one write
// landed — which is the origin of every duplicate the owner spent a week
// deleting. The two lists were **not identical** (Handwriting 15m/daily against
// 20m/3x; Booster cards daily against 3x), so the pairs carried different
// minutes and frequencies and read as deliberate entries rather than as copies.
//
// Three things replace that, in order of how much they are load-bearing:
//
//  1. **A deterministic document id per seeded entry** — `seedConfigDocId`
//     below. This is the actual rail: a second concurrent writer addresses the
//     same document and OVERWRITES rather than appends, so doubling is
//     impossible rather than unlikely, and it holds across tabs and devices
//     where an in-process guard cannot reach.
//  2. **A module-level in-flight promise** — concurrent callers await the same
//     seed instead of each running their own. This is a saver, not the rail: it
//     collapses four reads and four batch writes on first load into one.
//  3. **One entry point.** There is a single exported seeder now, so no call
//     site can run two lists in sequence again.
//
// **The id rail is deliberately only half a rail, and that is stated rather
// than fixed.** Existing configs were written with random ids and keep them —
// this run performs no migration, no dedupe pass and no rename, so a family who
// already carries duplicates still carries them and deletes them by hand. The
// deterministic id governs seeds written from here on. Making it retroactive
// would mean rewriting the owner's curriculum documents, which is a
// propose-and-confirm decision and not this run's.
//
// The empty-slate guard stays exactly as it was: if ANY config exists for the
// child, nothing is seeded, so a deliberately deleted default stays deleted. A
// child with no configs at all still gets the full set — breaking that would
// leave a new child with an empty curriculum and no way to notice.

/**
 * The one default activity-config seed list.
 *
 * Reconciled from the two lists this file used to carry (UX-231). Where they
 * disagreed the values here are `DEFAULT_ROUTINE_CONFIGS`', because that was the
 * only one carrying the block-scheduling fields the app actually reads —
 * `aspirational` (`TodayChecklist`, `rollover`, `budgetEnforcement`),
 * `pairedWith` (`chatPlanner.logic`'s paired-minute fold), `block` /
 * `choiceGroup` / `droppableOnLightDay` — and `functions/src/ai/tasks/plan.ts`
 * names Prayer's `block: "formation", aspirational: true` in the prompt itself.
 * The retired list predated those fields, so adopting its minutes would have
 * meant dropping them.
 *
 * The two evaluation entries at the end came from the retired list and are kept:
 * a new child seeded today can receive them, and the reconciliation is a union
 * so that nothing a child could have been given is quietly lost.
 *
 * `childId` is resolved per entry by {@link seedConfigOwner} — Prayer and
 * Handwriting are shared ('both'), everything else belongs to the child.
 */
export const DEFAULT_ACTIVITY_CONFIG_SEED: Omit<
  ActivityConfig,
  'id' | 'childId' | 'createdAt' | 'updatedAt'
>[] = [
  {
    name: 'Prayer and Scripture',
    type: 'formation' as ActivityType,
    subjectBucket: 'Other',
    defaultMinutes: 10,
    frequency: 'daily',
    sortOrder: 1,
    completed: false,
    scannable: false,
    block: 'formation',
    aspirational: true,
  },
  {
    name: 'Good and the Beautiful Reading',
    type: 'workbook' as ActivityType,
    subjectBucket: 'Reading',
    defaultMinutes: 30,
    frequency: 'daily',
    sortOrder: 20,
    completed: false,
    scannable: true,
    curriculum: 'GATB Reading',
    block: 'core-reading',
  },
  {
    name: 'Good and the Beautiful Math',
    type: 'workbook' as ActivityType,
    subjectBucket: 'Math',
    defaultMinutes: 30,
    frequency: 'daily',
    sortOrder: 30,
    completed: false,
    scannable: true,
    curriculum: 'GATB Math',
    block: 'core-math',
  },
  {
    name: 'Handwriting (while read-aloud)',
    type: 'routine' as ActivityType,
    subjectBucket: 'LanguageArts',
    defaultMinutes: 15,
    frequency: 'daily',
    sortOrder: 10,
    completed: false,
    scannable: false,
    block: 'readaloud',
    pairedWith: 'narnia',
  },
  {
    name: 'Booster cards',
    type: 'routine' as ActivityType,
    subjectBucket: 'Reading',
    defaultMinutes: 15,
    frequency: 'daily',
    sortOrder: 15,
    completed: false,
    scannable: false,
    block: 'choice',
    choiceGroup: 'lincoln-choice-1',
  },
  {
    name: 'Sight word games',
    type: 'activity' as ActivityType,
    subjectBucket: 'Reading',
    defaultMinutes: 15,
    frequency: '2x',
    sortOrder: 40,
    completed: false,
    scannable: false,
    block: 'flex',
    droppableOnLightDay: true,
  },
  {
    name: 'Memory card',
    type: 'activity' as ActivityType,
    subjectBucket: 'Reading',
    defaultMinutes: 10,
    frequency: '2x',
    sortOrder: 41,
    completed: false,
    scannable: false,
    block: 'flex',
    droppableOnLightDay: true,
  },
  {
    name: 'Language arts workbook',
    type: 'workbook' as ActivityType,
    subjectBucket: 'LanguageArts',
    defaultMinutes: 20,
    frequency: '3x',
    sortOrder: 16,
    completed: false,
    scannable: true,
    block: 'choice',
    choiceGroup: 'lincoln-choice-1',
  },
  {
    name: 'Knowledge Mine',
    type: 'evaluation' as ActivityType,
    subjectBucket: 'Reading',
    defaultMinutes: 15,
    frequency: '2x',
    sortOrder: 81,
    completed: false,
    scannable: false,
  },
  {
    name: 'Fluency Practice',
    type: 'evaluation' as ActivityType,
    subjectBucket: 'Reading',
    defaultMinutes: 10,
    frequency: '2x',
    sortOrder: 82,
    completed: false,
    scannable: false,
  },
]

/** Seeded entries that belong to the family rather than to one child. */
const SHARED_SEED_NAMES = ['Prayer and Scripture', 'Handwriting (while read-aloud)']

/**
 * Which child a seeded default belongs to. Prayer and the read-aloud handwriting
 * are shared; everything else is the child's own.
 */
export function seedConfigOwner(name: string, childId: string): string {
  return SHARED_SEED_NAMES.some((shared) => nameKey(shared) === nameKey(name))
    ? 'both'
    : childId
}

/**
 * The document id for a seeded default — the UX-231 rail.
 *
 * Derived from the entry's name and its owner, so two concurrent seeders
 * address the *same* document and the second `set` overwrites the first instead
 * of appending a near-identical row. The name is keyed through the shared
 * `nameKey` (letters and digits, lowercased) — the one comparison rule for a
 * human-typed name in this app (UX-205) — so the id can't drift on punctuation.
 *
 * The `seed-` prefix is load-bearing in the same way `artQuota`'s `wk-` segment
 * is: it keeps these ids in a namespace of their own, so a seeded document can
 * never be confused with one Firestore auto-generated for a parent's own entry.
 */
export function seedConfigDocId(name: string, ownerId: string): string {
  return `seed-${nameKey(name)}-${nameKey(ownerId)}`
}

/**
 * The document id for a config converted from a legacy `workbookConfigs` doc.
 *
 * Keyed on the source document's id, which is already unique and stable, so the
 * conversion is idempotent for the same reason the seed is.
 */
export function migratedWorkbookDocId(workbookConfigId: string): string {
  return `wb-${workbookConfigId}`
}

/**
 * In-flight seeds, keyed by family + child.
 *
 * `useActivityConfigs` is mounted on three surfaces and `TodayPage` seeds a
 * fourth time directly, so on first load four callers arrive within a frame of
 * each other. Without this each would perform its own read and its own batch
 * write; with it they await one run. It is the saver, not the rail — a second
 * tab has its own module instance and is caught by {@link seedConfigDocId}.
 */
const inFlightSeeds = new Map<string, Promise<number>>()

/** Visible for tests: forget any in-flight seed so each case starts clean. */
export function __resetActivityConfigSeedState(): void {
  inFlightSeeds.clear()
}

/**
 * Ensure a child has their default activity configs.
 *
 * Seeds only on a truly empty slate: if ANY config exists for this child — even
 * if some defaults were deleted since — nothing is written, because a
 * deliberately deleted default should stay deleted. On an empty slate the child
 * gets {@link DEFAULT_ACTIVITY_CONFIG_SEED} plus one config per legacy
 * `workbookConfigs` document, all under deterministic ids, in a single batch.
 *
 * Returns the number of documents written (0 when the child already had configs).
 *
 * Concurrent calls for the same child share one run. The read, the write and
 * every id are the same for all of them, so even a caller that slips past the
 * in-flight map cannot produce a second copy of a row.
 */
export function ensureDefaultActivityConfigs(
  familyId: string,
  childId: string,
): Promise<number> {
  if (!familyId || !childId) return Promise.resolve(0)

  const key = `${familyId}:${childId}`
  const existing = inFlightSeeds.get(key)
  if (existing) return existing

  const run = seedActivityConfigs(familyId, childId).finally(() => {
    inFlightSeeds.delete(key)
  })
  inFlightSeeds.set(key, run)
  return run
}

async function seedActivityConfigs(familyId: string, childId: string): Promise<number> {
  // The empty-slate guard. Unchanged in meaning from both retired seeders: any
  // existing config at all means the family has set things up.
  const existingSnap = await getDocs(
    query(
      activityConfigsCollection(familyId),
      where('childId', 'in', [childId, 'both']),
      limit(1),
    ),
  )
  if (!existingSnap.empty) return 0

  console.log('[ActivityConfigs] No configs found — seeding defaults')

  const now = new Date().toISOString()
  const batch = writeBatch(db)
  let written = 0

  for (const config of DEFAULT_ACTIVITY_CONFIG_SEED) {
    const owner = seedConfigOwner(config.name, childId)
    const id = seedConfigDocId(config.name, owner)
    batch.set(doc(activityConfigsCollection(familyId), id), {
      ...config,
      id,
      childId: owner,
      createdAt: now,
      updatedAt: now,
    })
    written++
  }

  for (const converted of await loadLegacyWorkbookConfigs(familyId, childId, now)) {
    batch.set(doc(activityConfigsCollection(familyId), converted.id), converted)
    written++
  }

  await batch.commit()
  console.log(`[ActivityConfigs] Seeded ${written} activity configs for child ${childId}`)
  return written
}

/**
 * Convert this child's legacy `workbookConfigs` documents into activity configs.
 *
 * The `WorkbookConfig` → `ActivityConfig` migration is still half-done (both
 * collections exist), so a family arriving with workbooks and no activity
 * configs must not lose them. Behaviour is carried over verbatim from the
 * retired `migrateToActivityConfigs`; only the document id is new.
 */
async function loadLegacyWorkbookConfigs(
  familyId: string,
  childId: string,
  now: string,
): Promise<ActivityConfig[]> {
  const snapshotDoc = await getDoc(doc(skillSnapshotsCollection(familyId), childId))
  const completedPrograms: string[] = snapshotDoc.exists()
    ? ((snapshotDoc.data().completedPrograms as string[]) ?? [])
    : []

  const workbooksSnap = await getDocs(
    query(workbookConfigsCollection(familyId), where('childId', '==', childId)),
  )

  return workbooksSnap.docs.map((d) => {
    const wb = { ...(d.data() as WorkbookConfig), id: d.id }
    const wbNameLower = (wb.name ?? '').toLowerCase()
    const isCompleted =
      wb.completed === true ||
      completedPrograms.some((p) => {
        const pLower = p.toLowerCase()
        return wbNameLower.includes(pLower) || pLower.includes(wbNameLower)
      })

    const isApp =
      wbNameLower.includes('app') ||
      wbNameLower.includes('egg') ||
      wbNameLower.includes('typing')

    const id = migratedWorkbookDocId(d.id)

    return {
      id,
      name: wb.name || 'Unknown workbook',
      type: (isApp ? 'app' : 'workbook') as ActivityType,
      subjectBucket: wb.subjectBucket || 'Other',
      defaultMinutes: wb.defaultMinutes ?? 30,
      frequency: 'daily',
      // DATA-08: workbooks are per-child — never inherit a 'both' tag.
      childId: wb.childId && wb.childId !== 'both' ? wb.childId : childId,
      sortOrder: isApp ? 71 : 11,
      curriculum: wb.curriculum?.provider ?? wb.name,
      totalUnits: wb.totalUnits,
      currentPosition: wb.currentPosition,
      unitLabel: wb.unitLabel || 'lesson',
      completed: isCompleted,
      completedDate: isCompleted ? now : undefined,
      scannable: !isApp,
      notes: undefined,
      createdAt: now,
      updatedAt: now,
    } as ActivityConfig
  })
}
