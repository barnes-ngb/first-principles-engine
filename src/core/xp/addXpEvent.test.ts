import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mock Firestore ─────────────────────────────────────────────
const mockGetDoc = vi.fn()
const mockSetDoc = vi.fn()
const mockDoc = vi.fn((..._args: unknown[]) => `mock-doc-${_args.join('-')}`)

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}))

vi.mock('../firebase/firestore', () => ({
  xpLedgerCollection: (familyId: string) => `xpLedger-${familyId}`,
  xpLedgerDocId: (childId: string, dedupKey: string) => `${childId}_${dedupKey}`,
  avatarProfilesCollection: (familyId: string) => `avatarProfiles-${familyId}`,
  stripUndefined: (obj: Record<string, unknown>) => obj,
}))

const mockCheckAndUnlockArmor = vi.fn().mockResolvedValue({
  newlyUnlockedPieces: [],
  newlyUnlockedVoxelPieces: [],
})
vi.mock('./checkAndUnlockArmor', () => ({
  checkAndUnlockArmor: (...args: unknown[]) => mockCheckAndUnlockArmor(...args),
}))

import { addXpEvent } from './addXpEvent'

describe('addXpEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: event doc doesn't exist yet (first award)
    mockGetDoc.mockResolvedValue({ exists: () => false })
    mockSetDoc.mockResolvedValue(undefined)
  })

  it('defaults currencyType to xp when no options provided', async () => {
    const result = await addXpEvent('fam-1', 'child-1', 'CHECKLIST_DAY_COMPLETE', 10, 'checklist-day')
    expect(result).toBe(10)
    // First setDoc call is the event doc — check it includes currencyType: 'xp'
    const eventDocData = mockSetDoc.mock.calls[0][1]
    expect(eventDocData.currencyType).toBe('xp')
  })

  it('stores currencyType diamond on event doc for diamond entries', async () => {
    const result = await addXpEvent(
      'fam-1', 'child-1', 'QUEST_COMPLETE', 5, 'quest-diamond-1',
      undefined,
      { currencyType: 'diamond', category: 'earn' },
    )
    expect(result).toBe(5)
    const eventDocData = mockSetDoc.mock.calls[0][1]
    expect(eventDocData.currencyType).toBe('diamond')
    expect(eventDocData.category).toBe('earn')
  })

  it('does NOT update cumulative ledger or avatar for diamond entries', async () => {
    await addXpEvent(
      'fam-1', 'child-1', 'QUEST_COMPLETE', 3, 'quest-diamond-2',
      undefined,
      { currencyType: 'diamond' },
    )
    // Only 1 setDoc call (the event doc), NOT cumulative or avatar
    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    // checkAndUnlockArmor should NOT have been called
    expect(mockCheckAndUnlockArmor).not.toHaveBeenCalled()
  })

  it('DOES update cumulative ledger and avatar for xp entries', async () => {
    // Need getDoc to return different values for different calls
    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // Dedup check — event doesn't exist
        return Promise.resolve({ exists: () => false })
      }
      if (callCount === 2) {
        // Cumulative ledger doc
        return Promise.resolve({
          exists: () => true,
          data: () => ({ totalXp: 50, sources: { routines: 50, quests: 0, books: 0 } }),
        })
      }
      // Avatar profile
      return Promise.resolve({
        exists: () => true,
        data: () => ({
          childId: 'child-1',
          themeStyle: 'minecraft',
          pieces: [],
          currentTier: 'stone',
          totalXp: 50,
          updatedAt: '2026-01-01',
        }),
      })
    })

    await addXpEvent('fam-1', 'child-1', 'CHECKLIST_DAY_COMPLETE', 10, 'checklist-day-xp')

    // Should have 3 setDoc calls: event, cumulative, avatar
    expect(mockSetDoc).toHaveBeenCalledTimes(3)
    // checkAndUnlockArmor SHOULD have been called
    expect(mockCheckAndUnlockArmor).toHaveBeenCalled()
  })

  it('includes itemId in event doc when provided', async () => {
    await addXpEvent(
      'fam-1', 'child-1', 'MANUAL_AWARD', -8, 'forge-belt-wood',
      undefined,
      { currencyType: 'diamond', category: 'forge', itemId: 'belt' },
    )
    const eventDocData = mockSetDoc.mock.calls[0][1]
    expect(eventDocData.itemId).toBe('belt')
    expect(eventDocData.category).toBe('forge')
  })

  it('existing entries without currencyType are treated as xp (backward compat)', async () => {
    // This tests the conceptual rule: entries without currencyType field
    // are XP. Since the cumulative ledger doc has no currencyType, it
    // already reflects XP-only totals (diamond events skip cumulative update).
    // This test verifies the cumulative doc is only updated for xp entries.
    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ exists: () => false })
      if (callCount === 2) {
        // Cumulative doc with pre-existing XP (no currencyType field — legacy)
        return Promise.resolve({
          exists: () => true,
          data: () => ({ totalXp: 100, sources: { routines: 80, quests: 20, books: 0 } }),
        })
      }
      return Promise.resolve({
        exists: () => true,
        data: () => ({
          childId: 'child-1',
          themeStyle: 'minecraft',
          pieces: [],
          currentTier: 'stone',
          totalXp: 100,
          updatedAt: '2026-01-01',
        }),
      })
    })

    await addXpEvent('fam-1', 'child-1', 'BOOK_READ', 15, 'book-1')

    // Cumulative doc should show 115 total (100 + 15)
    const cumulativeData = mockSetDoc.mock.calls[1][1]
    expect(cumulativeData.totalXp).toBe(115)
    expect(cumulativeData.sources.books).toBe(15) // 0 + 15
  })
})
