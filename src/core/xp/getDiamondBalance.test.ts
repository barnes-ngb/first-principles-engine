import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mock Firestore ─────────────────────────────────────────────
const mockGetDocs = vi.fn()
const mockQuery = vi.fn((..._args: unknown[]) => 'mock-query')
const mockWhere = vi.fn((..._args: unknown[]) => 'mock-where')
const mockDoc = vi.fn((..._args: unknown[]) => 'mock-doc')
const mockGetDoc = vi.fn()
const mockSetDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}))

vi.mock('../firebase/firestore', () => ({
  xpLedgerCollection: (_familyId: string) => 'mock-collection',
  xpLedgerDocId: (childId: string, dedupKey: string) => `${childId}_${dedupKey}`,
  avatarProfilesCollection: (_familyId: string) => 'mock-avatar-collection',
  stripUndefined: (obj: unknown) => obj,
}))

vi.mock('../../features/avatar/voxel/tierMaterials', () => ({
  calculateTier: (xp: number) => {
    if (xp >= 5000) return 'NETHERITE'
    if (xp >= 2000) return 'DIAMOND'
    if (xp >= 1000) return 'GOLD'
    if (xp >= 500) return 'IRON'
    if (xp >= 200) return 'STONE'
    return 'WOOD'
  },
}))

vi.mock('./checkAndUnlockArmor', () => ({
  checkAndUnlockArmor: vi.fn().mockResolvedValue({
    newlyUnlockedPieces: [],
    newlyUnlockedVoxelPieces: [],
  }),
}))

import { getDiamondBalance, spendDiamonds } from './getDiamondBalance'

function mockSnapshotDocs(docs: Array<{ amount: number }>) {
  const fakeDocs = docs.map((d, i) => ({
    id: `doc-${i}`,
    data: () => d,
  }))
  return {
    forEach: (cb: (doc: { id: string; data: () => { amount: number } }) => void) =>
      fakeDocs.forEach(cb),
    docs: fakeDocs,
    size: fakeDocs.length,
  }
}

describe('getDiamondBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 0 for empty familyId or childId', async () => {
    expect(await getDiamondBalance('', 'child-1')).toBe(0)
    expect(await getDiamondBalance('fam-1', '')).toBe(0)
  })

  it('returns 0 when no diamond entries exist', async () => {
    mockGetDocs.mockResolvedValue(mockSnapshotDocs([]))
    expect(await getDiamondBalance('fam-1', 'child-1')).toBe(0)
  })

  it('sums positive diamond entries (earning)', async () => {
    mockGetDocs.mockResolvedValue(
      mockSnapshotDocs([{ amount: 5 }, { amount: 3 }, { amount: 10 }]),
    )
    expect(await getDiamondBalance('fam-1', 'child-1')).toBe(18)
  })

  it('handles negative entries (spending)', async () => {
    mockGetDocs.mockResolvedValue(
      mockSnapshotDocs([{ amount: 10 }, { amount: -5 }, { amount: 3 }]),
    )
    expect(await getDiamondBalance('fam-1', 'child-1')).toBe(8)
  })

  it('balance can go to zero with equal earn and spend', async () => {
    mockGetDocs.mockResolvedValue(
      mockSnapshotDocs([{ amount: 10 }, { amount: -10 }]),
    )
    expect(await getDiamondBalance('fam-1', 'child-1')).toBe(0)
  })
})

describe('spendDiamonds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false for zero or negative amount', async () => {
    expect(await spendDiamonds('fam-1', 'child-1', 0, 'dedup-1', 'forge')).toBe(false)
    expect(await spendDiamonds('fam-1', 'child-1', -5, 'dedup-1', 'forge')).toBe(false)
  })

  it('returns false when balance is insufficient', async () => {
    // Balance = 5, trying to spend 10
    mockGetDocs.mockResolvedValue(mockSnapshotDocs([{ amount: 5 }]))
    expect(await spendDiamonds('fam-1', 'child-1', 10, 'dedup-1', 'forge')).toBe(false)
  })

  it('returns true and writes event when balance is sufficient', async () => {
    // Balance = 20
    mockGetDocs.mockResolvedValue(mockSnapshotDocs([{ amount: 20 }]))
    // addXpEvent dedup check — doc doesn't exist yet
    mockGetDoc.mockResolvedValue({ exists: () => false })
    mockSetDoc.mockResolvedValue(undefined)

    const result = await spendDiamonds('fam-1', 'child-1', 8, 'forge-belt-wood', 'forge', 'belt')
    expect(result).toBe(true)
    // Verify setDoc was called (the event doc write)
    expect(mockSetDoc).toHaveBeenCalled()
  })
})
