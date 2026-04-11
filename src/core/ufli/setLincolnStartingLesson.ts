import { setDoc } from 'firebase/firestore'

import type { UFLIProgress } from '../types'
import { ufliProgressDoc } from '../firebase/firestore'
import { DEFAULT_UFLI_PROGRESS } from './getUfliProgress'

/** Set a child's UFLI starting lesson (one-off setup utility). */
export async function setStartingLesson(
  familyId: string,
  childId: string,
  lessonNumber: number,
): Promise<void> {
  const progress: UFLIProgress = {
    ...DEFAULT_UFLI_PROGRESS,
    currentLesson: lessonNumber,
    // Mark all lessons before the starting lesson as mastered
    masteredLessons: Array.from({ length: lessonNumber - 1 }, (_, i) => i + 1),
  }
  await setDoc(ufliProgressDoc(familyId, childId), progress)
}

/** Convenience: set Lincoln to Lesson 62 (his assessed starting point). */
export async function setLincolnStartingLesson(
  familyId: string,
  lincolnChildId: string,
): Promise<void> {
  await setStartingLesson(familyId, lincolnChildId, 62)
}
