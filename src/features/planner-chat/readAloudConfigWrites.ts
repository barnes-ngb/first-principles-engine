// ── The ONE write lane for a read-aloud's Curriculum row (FEAT-243 / UX-470) ──
//
// Create-only, under a deterministic id, inside a `runTransaction` — the
// `ensureDefaultActivityConfigs` / `seedProfileChildren` precedent (UX-231 /
// UX-394). A second Apply, a second tab or the other parent's phone addresses
// the same `readaloud-<chapterBookId>` document instead of appending a twin,
// and **an existing row is never overwritten**: a parent who renamed it,
// changed its minutes or moved its subject keeps her edit, and a row she marked
// finished stays finished.
//
// Called beside `applyDraftWeek` by the planner (an enrichment, like the chapter
// pool — not part of the day writes), and by the planner's one-tap *Add to
// Curriculum*. Nothing else writes these rows. It reads nothing from
// `chapterBooks` or `bookProgress` and writes neither.

import { doc, runTransaction } from 'firebase/firestore'

import { activityConfigsCollection, db } from '../../core/firebase/firestore'
import type { ChapterBook } from '../../core/types'
import { buildReadAloudConfig, readAloudConfigDocId } from './readAloudCurriculum'

export interface EnsureReadAloudConfigInput {
  familyId: string
  book: Pick<ChapterBook, 'id' | 'title' | 'author'>
  /** Parent-only at the write, on capability — never on a name or a route. */
  canEdit: boolean
}

export type EnsureReadAloudConfigResult =
  | { status: 'created'; id: string }
  | { status: 'exists'; id: string }
  | { status: 'not-permitted' }

export async function ensureReadAloudConfig(
  input: EnsureReadAloudConfigInput,
): Promise<EnsureReadAloudConfigResult> {
  const { familyId, book, canEdit } = input
  if (!canEdit) return { status: 'not-permitted' }
  if (!familyId || !book.id) throw new Error('A read-aloud row needs a family and a book.')

  const id = readAloudConfigDocId(book.id)
  const ref = doc(activityConfigsCollection(familyId), id)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists()) return { status: 'exists' as const, id }
    tx.set(ref, buildReadAloudConfig(book, new Date().toISOString()))
    return { status: 'created' as const, id }
  })
}
