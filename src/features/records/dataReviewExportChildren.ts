import { getDocs } from 'firebase/firestore'
import { childrenCollection } from '../../core/firebase/firestore'
import { dedupeChildrenByName } from '../../core/hooks/useChildren'
import type { DataReviewChild } from './dataReviewExport.logic'

/** Fresh family-specific identity read; never auto-create a child for an export. */
export async function loadReviewExportChildren(familyId: string): Promise<DataReviewChild[]> {
  const snapshot = await getDocs(childrenCollection(familyId))
  return dedupeChildrenByName(snapshot.docs.map(document => ({ ...document.data(), id: document.id })))
    .map(({ id, name, grade, birthdate }) => ({ id, name, grade, birthdate }))
}
