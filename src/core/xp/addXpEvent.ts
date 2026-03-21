import { doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}

import {
  avatarProfilesCollection,
  xpLedgerCollection,
  xpLedgerDocId,
} from '../firebase/firestore'
import type { XP_EVENTS } from '../types'
import { checkAndUnlockArmor } from './checkAndUnlockArmor'

/** Map XP event types to XpLedger source buckets. */
function mapTypeToSource(type: keyof typeof XP_EVENTS): 'routines' | 'quests' | 'books' {
  if (type === 'QUEST_DIAMOND') return 'quests'
  if (type === 'BOOK_READ') return 'books'
  return 'routines'  // CHECKLIST_DAY_COMPLETE, EVALUATION_COMPLETE, ARMOR_DAILY_COMPLETE → routines
}

/**
 * Award XP to a child, with dedup guard.
 *
 * Dedup and event tracking are handled via per-event docs in xpLedger
 * (doc ID: {childId}_{dedupKey}). The cumulative doc (doc ID: {childId})
 * is also updated atomically.
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

  // ── Dedup check (per-event doc in xpLedger) ────────────────
  const eventDocId = xpLedgerDocId(childId, dedupKey)
  const eventRef = doc(xpLedgerCollection(familyId), eventDocId)
  const eventSnap = await getDoc(eventRef)
  if (eventSnap.exists()) return // already awarded

  // ── Write per-event entry to xpLedger ──────────────────────
  const sourceKey = mapTypeToSource(type)
  await setDoc(eventRef, {
    childId,
    totalXp: amount,
    sources: {
      routines: sourceKey === 'routines' ? amount : 0,
      quests: sourceKey === 'quests' ? amount : 0,
      books: sourceKey === 'books' ? amount : 0,
    },
    dedupKey,
    type,
    amount,
    meta: meta ?? {},
    awardedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  })

  // ── Update cumulative XP ledger doc ────────────────────────
  const ledgerRef = doc(xpLedgerCollection(familyId), childId)
  const ledgerSnap = await getDoc(ledgerRef)
  const existing = ledgerSnap.exists()
    ? ledgerSnap.data()
    : { totalXp: 0, sources: { routines: 0, quests: 0, books: 0 } }

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

  // ── Compute real total from per-event xpLedger docs ────────
  const eventDocsSnap = await getDocs(
    query(xpLedgerCollection(familyId), where('childId', '==', childId), where('dedupKey', '!=', null)),
  )
  const realTotal = eventDocsSnap.docs
    .filter((d) => !(d.data() as unknown as Record<string, unknown>)._deleted)
    .reduce((sum, d) => sum + ((d.data().amount as number) ?? 0), 0)

  // ── Update cached totalXp on avatarProfile ─────────────────
  const profileRef = doc(avatarProfilesCollection(familyId), childId)
  const profileSnap = await getDoc(profileRef)
  if (profileSnap.exists()) {
    const profile = profileSnap.data()
    await setDoc(profileRef, stripUndefined({ ...profile, totalXp: realTotal, updatedAt: new Date().toISOString() }))
  }

  // ── Check for armor unlocks ────────────────────────────────
  await checkAndUnlockArmor(familyId, childId, realTotal)
}
