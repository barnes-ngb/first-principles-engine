import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mock Firestore ─────────────────────────────────────────────
const mockGetDoc = vi.fn()
const mockSetDoc = vi.fn()
const mockUpdateDoc = vi.fn()
const mockDoc = vi.fn((..._args: unknown[]) => `mock-doc-${_args.join('-')}`)

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  increment: (n: number) => ({ __increment: n }),
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
    mockUpdateDoc.mockResolvedValue(undefined)
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

  // ── Dedup guard ──────────────────────────────────────────────

  it('returns 0 and skips writes when dedupKey already exists', async () => {
    // Event doc already exists
    mockGetDoc.mockResolvedValueOnce({ exists: () => true })

    const result = await addXpEvent('fam-1', 'child-1', 'CHECKLIST_ITEM', 3, 'dup-key')

    expect(result).toBe(0)
    expect(mockSetDoc).not.toHaveBeenCalled()
    expect(mockCheckAndUnlockArmor).not.toHaveBeenCalled()
  })

  // ── Zero/empty guards ────────────────────────────────────────

  it('returns 0 for zero amount without any writes', async () => {
    const result = await addXpEvent('fam-1', 'child-1', 'MANUAL_AWARD', 0, 'zero-key')

    expect(result).toBe(0)
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('returns 0 for empty familyId without any writes', async () => {
    const result = await addXpEvent('', 'child-1', 'CHECKLIST_ITEM', 3, 'key-1')

    expect(result).toBe(0)
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('returns 0 for empty childId without any writes', async () => {
    const result = await addXpEvent('fam-1', '', 'CHECKLIST_ITEM', 3, 'key-1')

    expect(result).toBe(0)
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  // ── Source bucketing ─────────────────────────────────────────

  it('maps QUEST_DIAMOND to quests source', async () => {
    const result = await addXpEvent('fam-1', 'child-1', 'QUEST_DIAMOND', 2, 'quest-diamond-src')

    expect(result).toBe(2)
    const eventDocData = mockSetDoc.mock.calls[0][1]
    expect(eventDocData.sources.quests).toBe(2)
    expect(eventDocData.sources.routines).toBe(0)
    expect(eventDocData.sources.books).toBe(0)
  })

  it('maps QUEST_COMPLETE to quests source', async () => {
    const result = await addXpEvent('fam-1', 'child-1', 'QUEST_COMPLETE', 15, 'quest-complete-src')

    expect(result).toBe(15)
    const eventDocData = mockSetDoc.mock.calls[0][1]
    expect(eventDocData.sources.quests).toBe(15)
    expect(eventDocData.sources.routines).toBe(0)
  })

  it('maps BOOK_COMPLETE to books source', async () => {
    const result = await addXpEvent('fam-1', 'child-1', 'BOOK_COMPLETE', 25, 'book-complete-src')

    expect(result).toBe(25)
    const eventDocData = mockSetDoc.mock.calls[0][1]
    expect(eventDocData.sources.books).toBe(25)
    expect(eventDocData.sources.routines).toBe(0)
    expect(eventDocData.sources.quests).toBe(0)
  })

  it('maps BOOK_PAGE_READ to books source', async () => {
    const result = await addXpEvent('fam-1', 'child-1', 'BOOK_PAGE_READ', 1, 'page-read-src')

    expect(result).toBe(1)
    const eventDocData = mockSetDoc.mock.calls[0][1]
    expect(eventDocData.sources.books).toBe(1)
  })

  it('maps CHECKLIST_ITEM to routines source', async () => {
    const result = await addXpEvent('fam-1', 'child-1', 'CHECKLIST_ITEM', 3, 'checklist-src')

    expect(result).toBe(3)
    const eventDocData = mockSetDoc.mock.calls[0][1]
    expect(eventDocData.sources.routines).toBe(3)
    expect(eventDocData.sources.quests).toBe(0)
    expect(eventDocData.sources.books).toBe(0)
  })

  it('maps DAD_LAB_COMPLETE to routines source', async () => {
    const result = await addXpEvent('fam-1', 'child-1', 'DAD_LAB_COMPLETE', 20, 'dadlab-src')

    expect(result).toBe(20)
    const eventDocData = mockSetDoc.mock.calls[0][1]
    expect(eventDocData.sources.routines).toBe(20)
  })

  // ── Cumulative XP management ─────────────────────────────────

  it('creates default cumulative doc when none exists', async () => {
    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ exists: () => false }) // dedup
      if (callCount === 2) return Promise.resolve({ exists: () => false }) // no cumulative doc
      // Avatar profile doesn't exist either
      return Promise.resolve({ exists: () => false })
    })

    await addXpEvent('fam-1', 'child-1', 'CHECKLIST_ITEM', 3, 'new-child-first-xp')

    // Cumulative doc (2nd setDoc call) should start from 0 + 3 = 3
    const cumulativeData = mockSetDoc.mock.calls[1][1]
    expect(cumulativeData.totalXp).toBe(3)
    expect(cumulativeData.sources.routines).toBe(3)
    expect(cumulativeData.sources.quests).toBe(0)
    expect(cumulativeData.sources.books).toBe(0)
  })

  it('creates default avatar profile when none exists', async () => {
    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ exists: () => false })
      if (callCount === 2) return Promise.resolve({ exists: () => false })
      // No avatar profile
      return Promise.resolve({ exists: () => false })
    })

    await addXpEvent('fam-1', 'child-1', 'CHECKLIST_ITEM', 5, 'first-xp-avatar')

    // Avatar doc (3rd setDoc call) should use default profile with updated totalXp
    const avatarData = mockSetDoc.mock.calls[2][1]
    expect(avatarData.childId).toBe('child-1')
    expect(avatarData.totalXp).toBe(5)
    expect(avatarData.currentTier).toBe('wood')
  })

  it('floors cumulative totalXp at 0 (never negative)', async () => {
    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ exists: () => false })
      if (callCount === 2) {
        return Promise.resolve({
          exists: () => true,
          data: () => ({ totalXp: 3, sources: { routines: 3, quests: 0, books: 0 } }),
        })
      }
      return Promise.resolve({
        exists: () => true,
        data: () => ({
          childId: 'child-1',
          themeStyle: 'minecraft',
          pieces: [],
          currentTier: 'wood',
          totalXp: 3,
          updatedAt: '2026-01-01',
        }),
      })
    })

    // Deduct more than current total
    await addXpEvent('fam-1', 'child-1', 'MANUAL_DEDUCT', -10, 'deduct-below-zero')

    const cumulativeData = mockSetDoc.mock.calls[1][1]
    // Math.max(0, 3 + (-10)) = 0
    expect(cumulativeData.totalXp).toBe(0)
  })

  it('accumulates source-specific XP correctly', async () => {
    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ exists: () => false })
      if (callCount === 2) {
        return Promise.resolve({
          exists: () => true,
          data: () => ({ totalXp: 50, sources: { routines: 30, quests: 20, books: 0 } }),
        })
      }
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

    await addXpEvent('fam-1', 'child-1', 'QUEST_COMPLETE', 15, 'quest-accum')

    const cumulativeData = mockSetDoc.mock.calls[1][1]
    expect(cumulativeData.totalXp).toBe(65) // 50 + 15
    expect(cumulativeData.sources.routines).toBe(30) // unchanged
    expect(cumulativeData.sources.quests).toBe(35) // 20 + 15
    expect(cumulativeData.sources.books).toBe(0) // unchanged
  })

  // ── Diamond balance update ───────────────────────────────────

  it('updates avatarProfile.diamondBalance for diamond entries when profile exists', async () => {
    mockUpdateDoc.mockResolvedValue(undefined)

    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ exists: () => false }) // dedup
      // Avatar profile exists
      return Promise.resolve({ exists: () => true })
    })

    await addXpEvent(
      'fam-1', 'child-1', 'QUEST_DIAMOND', 5, 'diamond-balance-test',
      undefined,
      { currencyType: 'diamond', category: 'earn' },
    )

    // Should write event doc via setDoc
    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    // Should update diamond balance via updateDoc
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1)
  })

  // ── Armor unlock check ───────────────────────────────────────

  it('calls checkAndUnlockArmor with correct XP total after award', async () => {
    let callCount = 0
    mockGetDoc.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ exists: () => false })
      if (callCount === 2) {
        return Promise.resolve({
          exists: () => true,
          data: () => ({ totalXp: 90, sources: { routines: 90, quests: 0, books: 0 } }),
        })
      }
      return Promise.resolve({
        exists: () => true,
        data: () => ({
          childId: 'child-1',
          themeStyle: 'minecraft',
          pieces: [],
          currentTier: 'wood',
          totalXp: 90,
          updatedAt: '2026-01-01',
        }),
      })
    })

    await addXpEvent('fam-1', 'child-1', 'CHECKLIST_DAY_COMPLETE', 10, 'armor-check')

    expect(mockCheckAndUnlockArmor).toHaveBeenCalledWith('fam-1', 'child-1', 100)
  })

  // ── Meta forwarding ──────────────────────────────────────────

  it('stores meta data in event doc', async () => {
    await addXpEvent('fam-1', 'child-1', 'CHECKLIST_ITEM', 3, 'meta-key', {
      source: 'today-page',
      itemLabel: 'Math worksheet',
    })

    const eventDocData = mockSetDoc.mock.calls[0][1]
    expect(eventDocData.meta).toEqual({
      source: 'today-page',
      itemLabel: 'Math worksheet',
    })
  })

  it('defaults meta to empty object when not provided', async () => {
    await addXpEvent('fam-1', 'child-1', 'CHECKLIST_ITEM', 3, 'no-meta-key')

    const eventDocData = mockSetDoc.mock.calls[0][1]
    expect(eventDocData.meta).toEqual({})
  })
})
