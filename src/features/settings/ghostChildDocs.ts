/**
 * **Find the duplicate `children` documents, and let a parent delete the ones
 * nothing points at** — `UX-394` (owner decision, 2026-09-11).
 *
 * The `UX-383` restore survey loops `childrenCollection` and prints one row per
 * document. It printed about twenty, named Lincoln and London, against two real
 * boys. `useChildren` already knew why — *"concurrent mounts in earlier sessions
 * could race auto-create and produce duplicate Lincoln/London docs"* — and had
 * been hiding them on read with `dedupeChildrenByName` ever since. The write
 * that made them is fixed separately (`core/firebase/seedProfileChildren.ts`,
 * the `UX-231` rail); this module is about the ones already written.
 *
 * **It does not delete anything on its own.** A data delete stops for a
 * decision, and this one is a decision about documents that carry a child's
 * name. So the shape is the app's own propose → confirm → write rule: a
 * **read-only survey** a parent runs from the Dev tab, a list she can read, and
 * a delete she taps behind a confirm.
 *
 * ## What counts as a ghost
 *
 * Exactly the documents `useChildren` hides: for each distinct lowercased name,
 * {@link dedupeChildrenByName} keeps the **oldest** document — that is the
 * canonical child, the one whose id `skillSnapshots`, `learnerModels`,
 * `xpLedger` and every `childId` field in the family already key on — and every
 * other document with that name is a ghost. A document whose name matches no
 * canonical child is **not** a ghost and is never listed: it is a child someone
 * added by hand, and this survey has no opinion about him.
 *
 * ## Why a referenced ghost is a worse finding, not a harder delete
 *
 * A ghost is supposed to be inert: created by a race, never selected, never
 * written to. If one turns out to carry records, then something in the family's
 * history *was* written under an id no screen has shown since — which is a
 * different and worse finding than a stray document, and correcting history is
 * its own proposal (`DOC-25` stops exactly there). So a referenced ghost is
 * **listed and not offered for deletion**, with the collections that matched
 * named on the row, and it is filed as `UX-395` if it appears.
 *
 * ## The check has to be complete, and completeness has to be checkable
 *
 * Codex round 1 (P1) found the first version of this probing only eight
 * collections, and by document id where it mattered most: `addXpEvent` writes
 * per-event records as **`xpLedger/{childId}_{dedupKey}`**, a diamond award
 * never writes the cumulative `xpLedger/{childId}` document at all, and an XP
 * award can fail between the two — so a ghost holding an irreversible currency
 * record read as unreferenced and was offered for deletion. A hand-picked list
 * of collections is the `[ledger-shape]` failure in a new place: a guard that
 * reports "nothing references this" while asking a fraction of the question.
 *
 * So the probe set is **every collection under `families/{familyId}`**
 * ({@link PROBED_COLLECTIONS}), and `ghostChildDocs.completeness.test.ts` fails
 * when `CLAUDE.md`'s own Firestore Collections table names one this list does
 * not — the completeness claim is derived from the repo's register rather than
 * asserted. Each collection is asked **two** questions, because a child id
 * reaches a document in two ways and neither implies the other:
 *
 *  - **by document id**, as a `>= id` / `< id + '\uf8ff'` range, which matches
 *    the id exactly (`skillSnapshots/{childId}`) *and* every composite key
 *    built on it (`xpLedger/{childId}_{dedupKey}`,
 *    `sightWordProgress/{childId}_{word}`,
 *    `dailyArmorSessions/{childId}-{date}`, `artQuota/{childId}-wk-{week}`).
 *    One range subsumes the exact read and over-matches only in the safe
 *    direction — a match withholds a document from deletion.
 *  - **by `childId` field**, which is how `days`, `hours`, `artifacts`,
 *    `activityConfigs` and the `xpLedger` **event** documents name their child.
 *    `SightWordProgress` carries no such field and is caught by the range;
 *    `xpLedger` needs both, which is exactly what round 1 found.
 *
 * `children` itself is deliberately not probed: the ghost *is* a document in
 * it, so it would match itself and nothing would ever be deletable.
 *
 * ## Fail closed, and revalidate at the write
 *
 * A probe that throws does not read as "no reference". It marks the document
 * **unreadable**, which withholds it from deletion exactly as a reference does.
 *
 * And the survey is a **snapshot**, so it cannot be the gate — Codex round 1's
 * second P1. Another tab can write a reference, or change a name so the
 * document is no longer a duplicate, between the survey and the tap.
 * {@link deleteGhostChildDocs} therefore takes **ids**, not blessed rows: it
 * re-reads `children`, re-classifies, and re-runs every probe immediately
 * before each `deleteDoc`. There is no path by which a caller can hand it a
 * document that the data, as it stands at the write, does not agree is a
 * deletable ghost.
 */

import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore'

import { childrenCollection, db } from '../../core/firebase/firestore'
import { dedupeChildrenByName } from '../../core/hooks/useChildren'

/**
 * Every collection under `families/{familyId}` a child id can reach, by name.
 *
 * Derived from `CLAUDE.md`'s Firestore Collections table and **kept honest by
 * `ghostChildDocs.completeness.test.ts`**, which fails when that table names
 * one this list does not. Named rather than typed through the `firestore.ts`
 * helpers because the question here is *"is there a document anywhere with this
 * child's fingerprint on it"*, which is about paths, not types — and because a
 * helper-by-helper list is the hand-picked set round 1 rejected.
 */
export const PROBED_COLLECTIONS: readonly string[] = [
  'activityConfigs',
  'aiUsage',
  'artQuota',
  'artifacts',
  'avatarProfiles',
  'bookProgress',
  'books',
  'businessGoals',
  'businessLog',
  'catalogProducts',
  'chapterResponses',
  'childSkillMaps',
  'conceptArcs',
  'dadLabReports',
  'dailyArmorSessions',
  'dailyPlans',
  'days',
  'errorLog',
  'evaluationSessions',
  'evaluations',
  'featureRequests',
  'helpCards',
  'hours',
  'hoursAdjustments',
  'kitRosters',
  'ladderProgress',
  'learnerModels',
  'learnerReviewSessions',
  'lessonCards',
  'monthlyReviews',
  'orders',
  'plannerConversations',
  'scans',
  'shellyChatThreads',
  'sightWordProgress',
  'skillSnapshots',
  'stickerLibrary',
  'stonebridgeProgress',
  'storyGames',
  'watchLibrary',
  'weeklyReviews',
  'weeks',
  'workbookConfigs',
  'xpLedger',
]

/** Collections `CLAUDE.md` names that this survey deliberately does not probe. */
export const UNPROBED_COLLECTIONS: Readonly<Record<string, string>> = {
  children: 'the ghost IS a document in it — probing it would match itself',
  chapterBooks: 'global, not under families/ — no family document lives there',
}

/** How a collection can name the child a document belongs to. */
export const ProbeKind = {
  /** The document id is the child id, or is built on it as a prefix. */
  DocId: 'doc-id',
  /** The document carries a `childId` field. */
  ChildField: 'child-field',
} as const
export type ProbeKind = (typeof ProbeKind)[keyof typeof ProbeKind]

/**
 * The end of a document-id prefix range. `\uf8ff` is the last code point in the
 * Basic Multilingual Plane's private-use area and sorts above every character a
 * Firestore document id can contain, so `[id, id + HIGH_SENTINEL)` is exactly
 * "every id that begins with `id`". Written as an escape so it is legible.
 */
const HIGH_SENTINEL = '\uf8ff'

// ── The pure half ────────────────────────────────────────────────

/** A `children` document as the survey reads it. */
export interface ChildDocRow {
  id: string
  name: string
  createdAt?: string
}

export interface GhostClassification {
  /** The document `useChildren` shows for each distinct name. */
  canonical: ChildDocRow[]
  /** Every other document whose name matches a canonical one. */
  ghosts: ChildDocRow[]
}

/**
 * Split the collection into the children the app shows and the documents it
 * hides — by the **same rule** `useChildren` applies on every load, imported
 * rather than restated, so the survey can never disagree with the app about
 * which document is the child.
 */
export function classifyChildDocs(docs: readonly ChildDocRow[]): GhostClassification {
  const canonical = dedupeChildrenByName(docs)
  const canonicalIds = new Set(canonical.map((c) => c.id))
  const canonicalNames = new Set(canonical.map((c) => c.name.trim().toLowerCase()))
  const ghosts = docs.filter(
    (d) => !canonicalIds.has(d.id) && canonicalNames.has(d.name.trim().toLowerCase()),
  )
  return { canonical, ghosts }
}

/** A ghost document, with what the probes found. */
export interface GhostChildDoc extends ChildDocRow {
  /** Collections holding something that points at this id, as `name (kind)`. */
  referencedBy: string[]
  /** Probes that could not be read at all — fail closed. */
  unreadable: string[]
}

/**
 * May this document be offered for deletion?
 *
 * Only when every probe ran and every one of them came back empty. A reference
 * means the record is real (`UX-395`); an unreadable probe means we do not
 * know, and "we do not know" is not a reason to delete a child's record.
 */
export function isDeletableGhost(ghost: GhostChildDoc): boolean {
  return ghost.referencedBy.length === 0 && ghost.unreadable.length === 0
}

export interface GhostChildSurvey {
  canonical: ChildDocRow[]
  /** Every ghost found, in the order the collection returned them. */
  ghosts: GhostChildDoc[]
  /** The subset with no reference and no failed probe. */
  deletable: GhostChildDoc[]
  /** The subset something points at — a `UX-395` finding if non-empty. */
  referenced: GhostChildDoc[]
}

/** Fold the probed ghosts into the survey a parent reads. */
export function summarizeGhostSurvey(
  canonical: ChildDocRow[],
  ghosts: GhostChildDoc[],
): GhostChildSurvey {
  return {
    canonical,
    ghosts,
    deletable: ghosts.filter(isDeletableGhost),
    referenced: ghosts.filter((g) => g.referencedBy.length > 0),
  }
}

// ── Firestore orchestration ──────────────────────────────────────

function familyCollection(familyId: string, name: string) {
  return collection(db, `families/${familyId}/${name}`)
}

/**
 * Does any document in this collection carry the child id in its **document
 * id** — exactly, or as the prefix of a composite key? Reads at most one
 * document. Throws on a failed read; the caller records that as unreadable
 * rather than as an answer.
 */
async function anyByDocId(familyId: string, name: string, childId: string): Promise<boolean> {
  const snap = await getDocs(
    query(
      familyCollection(familyId, name),
      where(documentId(), '>=', childId),
      where(documentId(), '<', childId + HIGH_SENTINEL),
      limit(1),
    ),
  )
  return !snap.empty
}

/** Does any document in this collection carry this child in a `childId` field? */
async function anyByChildField(
  familyId: string,
  name: string,
  childId: string,
): Promise<boolean> {
  const snap = await getDocs(
    query(familyCollection(familyId, name), where('childId', '==', childId), limit(1)),
  )
  return !snap.empty
}

/**
 * Ask every collection both questions about one document id.
 *
 * One definition, used by the survey **and** by the delete — the gate and the
 * display cannot drift apart, which is half of why the survey's snapshot was
 * never a safe gate.
 */
export async function probeChildReferences(
  familyId: string,
  childId: string,
): Promise<{ referencedBy: string[]; unreadable: string[] }> {
  const referencedBy: string[] = []
  const unreadable: string[] = []

  const checks = PROBED_COLLECTIONS.flatMap((name) => [
    { label: `${name} (${ProbeKind.DocId})`, run: () => anyByDocId(familyId, name, childId) },
    {
      label: `${name} (${ProbeKind.ChildField})`,
      run: () => anyByChildField(familyId, name, childId),
    },
  ])

  const outcomes = await Promise.all(
    checks.map(async (check) => {
      try {
        return { label: check.label, found: await check.run() }
      } catch {
        return { label: check.label, failed: true as const }
      }
    }),
  )

  for (const outcome of outcomes) {
    if ('failed' in outcome) unreadable.push(outcome.label)
    else if (outcome.found) referencedBy.push(outcome.label)
  }
  return { referencedBy, unreadable }
}

/** Read the family's `children` documents as plain rows. */
async function loadChildRows(familyId: string): Promise<ChildDocRow[]> {
  const snap = await getDocs(childrenCollection(familyId))
  return snap.docs.map((d) => {
    const data = d.data() as { name?: string; createdAt?: string }
    return { id: d.id, name: data.name ?? '', createdAt: data.createdAt }
  })
}

/**
 * Survey the family's `children` collection. **Reads only** — it writes
 * nothing, so running it is free and repeatable.
 */
export async function findGhostChildDocs(familyId: string): Promise<GhostChildSurvey> {
  const { canonical, ghosts } = classifyChildDocs(await loadChildRows(familyId))

  const probed: GhostChildDoc[] = []
  for (const ghost of ghosts) {
    probed.push({ ...ghost, ...(await probeChildReferences(familyId, ghost.id)) })
  }

  return summarizeGhostSurvey(canonical, probed)
}

export interface GhostDeleteResult {
  deleted: string[]
  failed: { id: string; error: string }[]
}

/**
 * Delete the documents a parent confirmed — **revalidated against the data as
 * it stands now**, not against the survey that offered them.
 *
 * It takes **ids**, deliberately: a caller cannot hand this function a row it
 * has already blessed. The `children` collection is re-read, the
 * ghost/canonical split re-derived, and every probe re-run for each id before
 * its `deleteDoc`. So a reference written in another tab during the confirm, or
 * a rename that has made the document the canonical child of a name of its own,
 * stops the delete rather than being invisible to it (Codex round 1, P1).
 */
export async function deleteGhostChildDocs(
  familyId: string,
  ids: readonly string[],
): Promise<GhostDeleteResult> {
  const result: GhostDeleteResult = { deleted: [], failed: [] }
  if (ids.length === 0) return result

  let ghostIds: Set<string>
  try {
    const { ghosts } = classifyChildDocs(await loadChildRows(familyId))
    ghostIds = new Set(ghosts.map((g) => g.id))
  } catch (err) {
    // Could not re-read the children at all — delete nothing. The survey's
    // snapshot is not a substitute for knowing.
    for (const id of ids) {
      result.failed.push({
        id,
        error: `Not deleted — could not re-read the children: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
    return result
  }

  for (const id of ids) {
    if (!ghostIds.has(id)) {
      result.failed.push({
        id,
        error: 'Not deleted — this is no longer a duplicate of another child.',
      })
      continue
    }
    try {
      const fresh = await probeChildReferences(familyId, id)
      if (!isDeletableGhost({ id, name: '', ...fresh })) {
        result.failed.push({
          id,
          error:
            fresh.referencedBy.length > 0
              ? `Not deleted — now referenced by ${fresh.referencedBy.join(', ')}.`
              : `Not deleted — could not check ${fresh.unreadable.join(', ')}.`,
        })
        continue
      }
      await deleteDoc(doc(childrenCollection(familyId), id))
      result.deleted.push(id)
    } catch (err) {
      result.failed.push({ id, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}
