import { getDoc } from 'firebase/firestore'

import type { UFLIProgress } from '../types'
import { ufliProgressDoc } from '../firebase/firestore'

/** Default UFLI progress for a child who hasn't started yet. */
export const DEFAULT_UFLI_PROGRESS: UFLIProgress = {
  currentLesson: 1,
  masteredLessons: [],
  lastEncodingScore: null,
  lastEncodingDate: null,
  nonsenseWordFluency: [],
}

/** Read UFLI progress for a child, returning defaults if the doc doesn't exist. */
export async function getUfliProgress(
  familyId: string,
  childId: string,
): Promise<UFLIProgress> {
  const snap = await getDoc(ufliProgressDoc(familyId, childId))
  if (!snap.exists()) return { ...DEFAULT_UFLI_PROGRESS }
  return snap.data()
}
