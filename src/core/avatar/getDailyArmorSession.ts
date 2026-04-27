import { doc, getDoc, writeBatch } from 'firebase/firestore'

import {
  avatarProfilesCollection,
  dailyArmorSessionsCollection,
  dailyArmorSessionDocId,
  db,
} from '../firebase/firestore'
import type { DailyArmorSession } from '../types'

/** Get today's date as YYYY-MM-DD using local time. */
export function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Morning suit-up messages — rotated daily.
 * Each morning the armor unequips and the child re-puts-on each piece as a
 * devotional ritual (Ephesians 6:11). These messages reinforce that tone.
 */
export const SUIT_UP_MORNING_MESSAGES = [
  'A new day. Suit up your armor — the village needs its hero.',
  'Good morning, hero. Put on each piece and hear its truth.',
  'Your armor rests beside you. Time to put it on again.',
  'Each piece is a prayer. Suit up and begin your day.',
  'The armor is waiting. Today\'s battles begin with preparation.',
] as const

/** Pick a morning message based on day-of-week. */
export function getMorningSuitUpMessage(): string {
  return SUIT_UP_MORNING_MESSAGES[new Date().getDay() % SUIT_UP_MORNING_MESSAGES.length]
}

/**
 * Get or create today's DailyArmorSession for a child.
 *
 * If no session exists for today, creates a fresh one with empty appliedPieces
 * and **atomically clears equippedPieces** on the avatar profile so the 3D
 * character appears bare. The kid re-equips each piece as part of the morning
 * devotional ritual.
 *
 * Only `equippedPieces` resets — forgedPieces, diamondBalance, totalXp,
 * accessories, customization, and all other progression are preserved.
 *
 * Calendar-date based — midnight resets the session.
 *
 * @returns The session and whether it was newly created (for morning reset UI).
 */
export async function getDailyArmorSession(
  familyId: string,
  childId: string,
): Promise<{ session: DailyArmorSession; isNewDay: boolean }> {
  const today = getTodayDateString()
  const docId = dailyArmorSessionDocId(childId, today)
  const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
  const snap = await getDoc(sessionRef)

  if (snap.exists()) {
    return { session: snap.data(), isNewDay: false }
  }

  // ── New day: create session AND clear equipped pieces atomically ──
  const newSession: DailyArmorSession = {
    familyId,
    childId,
    date: today,
    appliedPieces: [],
  }

  const profileRef = doc(avatarProfilesCollection(familyId), childId)
  const batch = writeBatch(db)
  batch.set(sessionRef, newSession)
  batch.update(profileRef, {
    equippedPieces: [],
    lastArmorEquipDate: today,
  })
  await batch.commit()

  return { session: newSession, isNewDay: true }
}
