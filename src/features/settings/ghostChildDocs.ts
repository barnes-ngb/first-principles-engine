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
 * **listed and not offered for deletion**, with the probes that matched named
 * on the row, and it is filed as `UX-395` if it appears.
 *
 * ## Fail closed
 *
 * A probe that throws does not read as "no reference". It marks the document
 * **unreadable**, which withholds it from deletion exactly as a reference does.
 * A guard that passes on an error it could not run is worse than no guard
 * (`[ledger-shape]`), and here the cost of being wrong is a deleted record.
 *
 * ## What is probed, and what that leaves
 *
 * {@link CHILD_REFERENCE_PROBES} is a declared table, so adding a collection is
 * data rather than a new branch. It covers the four collections keyed **by** a
 * child's id (`skillSnapshots`, `learnerModels`, `xpLedger`, `avatarProfiles` —
 * the last two being the rails where a lost reference is irreversible) and the
 * four keyed by a `childId` **field** (`activityConfigs`, `days`, `hours`,
 * `artifacts` — the compliance and evidence rails). It is deliberately **not**
 * every child-keyed collection in the app; the ones it omits are minor or
 * derived, and the survey says so on screen rather than implying completeness.
 * The safety that does not depend on the list being complete is the one above:
 * a canonical child is never a ghost, so the two real boys can never be offered
 * for deletion however the probes answer.
 */

import { deleteDoc, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import type { CollectionReference } from 'firebase/firestore'

import {
  activityConfigsCollection,
  artifactsCollection,
  avatarProfilesCollection,
  childrenCollection,
  daysCollection,
  hoursCollection,
  learnerModelsCollection,
  skillSnapshotsCollection,
  xpLedgerCollection,
} from '../../core/firebase/firestore'
import { dedupeChildrenByName } from '../../core/hooks/useChildren'

/** How a collection names the child it belongs to. */
export const ProbeKind = {
  /** The document id **is** the child id. */
  DocId: 'doc-id',
  /** Documents carry a `childId` field. */
  ChildField: 'child-field',
} as const
export type ProbeKind = (typeof ProbeKind)[keyof typeof ProbeKind]

export interface ChildReferenceProbe {
  /** What the parent reads on the row. */
  label: string
  kind: ProbeKind
  /** Reads at most one document. Throws on a failed read — never answers `false` for one. */
  find: (familyId: string, childId: string) => Promise<boolean>
}

/** A collection whose document id **is** the child id. */
function byDocId<T>(
  collectionFor: (familyId: string) => CollectionReference<T>,
): ChildReferenceProbe['find'] {
  return async (familyId, childId) =>
    (await getDoc(doc(collectionFor(familyId), childId))).exists()
}

/** A collection whose documents carry a `childId` field. */
function byChildField<T>(
  collectionFor: (familyId: string) => CollectionReference<T>,
): ChildReferenceProbe['find'] {
  return async (familyId, childId) =>
    !(
      await getDocs(
        query(collectionFor(familyId), where('childId', '==', childId), limit(1)),
      )
    ).empty
}

/**
 * The collections asked *does anything here belong to this document?*
 *
 * Declared as data so a new probe is a row, not a branch. See the module
 * docblock for what this covers and what it deliberately does not.
 */
export const CHILD_REFERENCE_PROBES: readonly ChildReferenceProbe[] = [
  { label: 'skillSnapshots', kind: ProbeKind.DocId, find: byDocId(skillSnapshotsCollection) },
  { label: 'learnerModels', kind: ProbeKind.DocId, find: byDocId(learnerModelsCollection) },
  { label: 'xpLedger', kind: ProbeKind.DocId, find: byDocId(xpLedgerCollection) },
  { label: 'avatarProfiles', kind: ProbeKind.DocId, find: byDocId(avatarProfilesCollection) },
  {
    label: 'activityConfigs',
    kind: ProbeKind.ChildField,
    find: byChildField(activityConfigsCollection),
  },
  { label: 'days', kind: ProbeKind.ChildField, find: byChildField(daysCollection) },
  { label: 'hours', kind: ProbeKind.ChildField, find: byChildField(hoursCollection) },
  { label: 'artifacts', kind: ProbeKind.ChildField, find: byChildField(artifactsCollection) },
]

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
  /** Probe labels that found something pointing at this id. */
  referencedBy: string[]
  /** Probe labels that could not be read at all — fail closed. */
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

/**
 * Survey the family's `children` collection. **Reads only** — it writes
 * nothing, so running it is free and repeatable.
 */
export async function findGhostChildDocs(familyId: string): Promise<GhostChildSurvey> {
  const snap = await getDocs(childrenCollection(familyId))
  const docs: ChildDocRow[] = snap.docs.map((d) => {
    const data = d.data() as { name?: string; createdAt?: string }
    return { id: d.id, name: data.name ?? '', createdAt: data.createdAt }
  })

  const { canonical, ghosts } = classifyChildDocs(docs)

  const probed: GhostChildDoc[] = []
  for (const ghost of ghosts) {
    const referencedBy: string[] = []
    const unreadable: string[] = []
    for (const probe of CHILD_REFERENCE_PROBES) {
      try {
        if (await probe.find(familyId, ghost.id)) referencedBy.push(probe.label)
      } catch {
        unreadable.push(probe.label)
      }
    }
    probed.push({ ...ghost, referencedBy, unreadable })
  }

  return summarizeGhostSurvey(canonical, probed)
}

export interface GhostDeleteResult {
  deleted: string[]
  failed: { id: string; error: string }[]
}

/**
 * Delete the ghosts a parent confirmed.
 *
 * The deletable check is re-applied **here**, against the rows the survey
 * produced, so a caller cannot hand this function a referenced document by
 * mistake — the gate is at the write as well as in the UI, which is this
 * repo's standing rule for anything a kid profile must not reach and, more to
 * the point here, for anything irreversible.
 */
export async function deleteGhostChildDocs(
  familyId: string,
  ghosts: readonly GhostChildDoc[],
): Promise<GhostDeleteResult> {
  const result: GhostDeleteResult = { deleted: [], failed: [] }
  for (const ghost of ghosts) {
    if (!isDeletableGhost(ghost)) {
      result.failed.push({
        id: ghost.id,
        error: 'Not deleted — something still references this document.',
      })
      continue
    }
    try {
      await deleteDoc(doc(childrenCollection(familyId), ghost.id))
      result.deleted.push(ghost.id)
    } catch (err) {
      result.failed.push({ id: ghost.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}
