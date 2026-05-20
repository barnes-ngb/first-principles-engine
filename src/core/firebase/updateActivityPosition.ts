import { getDocs, query, updateDoc, where } from 'firebase/firestore'

import type { ActivityConfig } from '../types'
import { activityConfigsCollection } from './firestore'

/**
 * After a scan completes and detects a curriculum + lesson number,
 * update the matching activity config's currentPosition.
 *
 * This closes the scan → position → plan loop:
 * Shelly scans page → position updates → tomorrow's plan knows where to start.
 */
export async function updateActivityConfigPosition(
  familyId: string,
  childId: string,
  curriculumName: string,
  lessonNumber: number,
): Promise<boolean> {
  const configsQuery = query(
    activityConfigsCollection(familyId),
    where('childId', 'in', [childId, 'both']),
    where('scannable', '==', true),
  )
  const configsSnap = await getDocs(configsQuery)

  const needle = curriculumName.toLowerCase()

  for (const configDoc of configsSnap.docs) {
    const config = configDoc.data() as ActivityConfig
    const configName = (config.name ?? '').toLowerCase()
    const configCurriculum = (config.curriculum ?? '').toLowerCase()

    if (
      configName.includes(needle) ||
      needle.includes(configName) ||
      (configCurriculum && (configCurriculum.includes(needle) || needle.includes(configCurriculum)))
    ) {
      await updateDoc(configDoc.ref, {
        currentPosition: lessonNumber,
        updatedAt: new Date().toISOString(),
      })
      console.log(`[Scan] Updated ${config.name} position to lesson ${lessonNumber}`)
      return true
    }
  }

  return false
}
