import { doc, getDoc, setDoc } from 'firebase/firestore'

import {
  dailyArmorSessionsCollection,
  dailyArmorSessionDocId,
} from '../firebase/firestore'
import type { DailyArmorSession } from '../types/domain'

/** Get today's date as YYYY-MM-DD using local time. */
export function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get or create today's DailyArmorSession for a child.
 *
 * If no session exists for today, creates a fresh one with empty appliedPieces.
 * Calendar-date based — midnight resets the session.
 */
export async function getDailyArmorSession(
  familyId: string,
  childId: string,
): Promise<DailyArmorSession> {
  const today = getTodayDateString()
  const docId = dailyArmorSessionDocId(childId, today)
  const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
  const snap = await getDoc(sessionRef)

  if (snap.exists()) {
    return snap.data()
  }

  const newSession: DailyArmorSession = {
    familyId,
    childId,
    date: today,
    appliedPieces: [],
  }
  await setDoc(sessionRef, newSession)
  return newSession
}
