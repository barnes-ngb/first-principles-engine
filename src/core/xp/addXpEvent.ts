import { doc, getDoc, setDoc } from 'firebase/firestore'

import {
  avatarProfilesCollection,
  xpEventLogCollection,
  xpEventLogDocId,
  xpLedgerCollection,
} from '../firebase/firestore'
import type { XP_EVENTS } from '../types/domain'
import { checkAndUnlockArmor } from './checkAndUnlockArmor'

/** Map XP event types to XpLedger source buckets. */
function mapTypeToSource(type: keyof typeof XP_EVENTS): 'routines' | 'quests' | 'books' {
  if (type === 'QUEST_DIAMOND') return 'quests'
  if (type === 'BOOK_READ') return 'books'
  return 'routines'
}

/**
 * Award XP to a child, with dedup guard.
 *
 * Writes to xpEventLog (dedup key), then increments xpLedger,
 * then checks for new armor unlocks.
 *
 * @param dedupKey - Unique key for this event (e.g., `checklist_2026-03-20`,
 *   `book_${bookId}_2026-03-20`, `eval_${sessionId}`)
 */
export async function addXpEvent(
  familyId: string,
  childId: string,
  type: keyof typeof XP_EVENTS,
  amount: number,
  dedupKey: string,
  meta?: Record<string, string>,
): Promise<void> {
  if (!familyId || !childId || amount <= 0) return

  // ── Dedup check ──────────────────────────────────────────────
  const logDocId = xpEventLogDocId(childId, dedupKey)
  const logRef = doc(xpEventLogCollection(familyId), logDocId)
  const logSnap = await getDoc(logRef)
  if (logSnap.exists()) return // already awarded

  // ── Write dedup entry ────────────────────────────────────────
  await setDoc(logRef, {
    childId,
    type,
    amount,
    dedupKey,
    ...(meta ? { meta } : {}),
    awardedAt: new Date().toISOString(),
  })

  // ── Increment XP ledger ──────────────────────────────────────
  const ledgerRef = doc(xpLedgerCollection(familyId), childId)
  const ledgerSnap = await getDoc(ledgerRef)
  const existing = ledgerSnap.exists()
    ? ledgerSnap.data()
    : { totalXp: 0, sources: { routines: 0, quests: 0, books: 0 } }

  const sourceKey = mapTypeToSource(type)
  const newTotal = (existing.totalXp ?? 0) + amount

  await setDoc(ledgerRef, {
    childId,
    totalXp: newTotal,
    sources: {
      routines: existing.sources?.routines ?? 0,
      quests: existing.sources?.quests ?? 0,
      books: existing.sources?.books ?? 0,
      [sourceKey]: ((existing.sources?.[sourceKey] ?? 0) + amount),
    },
    lastUpdatedAt: new Date().toISOString(),
  })

  // ── Update cached totalXp on avatarProfile ───────────────────
  const profileRef = doc(avatarProfilesCollection(familyId), childId)
  const profileSnap = await getDoc(profileRef)
  if (profileSnap.exists()) {
    const profile = profileSnap.data()
    await setDoc(profileRef, { ...profile, totalXp: newTotal, updatedAt: new Date().toISOString() })
  }

  // ── Check for armor unlocks ──────────────────────────────────
  await checkAndUnlockArmor(familyId, childId, newTotal)
}
