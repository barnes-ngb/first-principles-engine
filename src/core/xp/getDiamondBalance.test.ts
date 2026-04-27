import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mock Firestore ─────────────────────────────────────────────
const mockGetDocs = vi.fn()
const mockQuery = vi.fn((...args: unknown[]) => { void args; return 'mock-query' })
const mockWhere = vi.fn((...args: unknown[]) => { void args; return 'mock-where' })
const mockDoc = vi.fn((...args: unknown[]) => { void args; return 'mock-doc' })
const mockGetDoc = vi.fn()
const mockSetDoc = vi.fn()

// Transaction mock that executes the callback with mock transaction methods
const mockRunTransaction = vi.fn()

vi.mock('firebase/firestore', () => ({
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
}))

vi.mock('../firebase/firestore', () => ({
  db: 'mock-db',
  xpLedgerCollection: () => 'mock-collection',
  xpLedgerDocId: (childId: string, dedupKey: string) => `${childId}_${dedupKey}`,
  avatarProfilesCollection: () => 'mock-avatar-collection',
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
    // Transaction runs the callback; profile has diamondBalance=5, trying to spend 10
    mockRunTransaction.mockImplementation(async (_db: unknown, cb: (tx: unknown) => Promise<void>) => {
      const mockTx = {
        get: vi.fn()
          .mockResolvedValueOnce({ exists: () => true, data: () => ({ diamondBalance: 5 }) })
          .mockResolvedValueOnce({ exists: () => false }),
        update: vi.fn(),
        set: vi.fn(),
      }
      await cb(mockTx)
    })
    expect(await spendDiamonds('fam-1', 'child-1', 10, 'dedup-1', 'forge')).toBe(false)
  })

  it('returns true and writes event when balance is sufficient', async () => {
    // Transaction succeeds — profile has diamondBalance=20, spending 8
    mockRunTransaction.mockImplementation(async (_db: unknown, cb: (tx: unknown) => Promise<void>) => {
      const mockTx = {
        get: vi.fn()
          .mockResolvedValueOnce({ exists: () => true, data: () => ({ diamondBalance: 20 }) })
          .mockResolvedValueOnce({ exists: () => false }), // dedup doc doesn't exist
        update: vi.fn(),
        set: vi.fn(),
      }
      await cb(mockTx)
    })

    const result = await spendDiamonds('fam-1', 'child-1', 8, 'forge-belt-wood', 'forge', 'belt')
    expect(result).toBe(true)
    expect(mockRunTransaction).toHaveBeenCalled()
  })

  it('returns false when profile not found', async () => {
    mockRunTransaction.mockImplementation(async (_db: unknown, cb: (tx: unknown) => Promise<void>) => {
      const mockTx = {
        get: vi.fn().mockResolvedValueOnce({ exists: () => false }),
        update: vi.fn(),
        set: vi.fn(),
      }
      await cb(mockTx)
    })
    expect(await spendDiamonds('fam-1', 'child-1', 5, 'dedup-1', 'forge')).toBe(false)
  })

  it('falls back to computed balance when diamondBalance is not cached', async () => {
    // Profile exists but has no diamondBalance field — falls back to getDiamondBalance()
    mockRunTransaction.mockImplementation(async (_db: unknown, cb: (tx: unknown) => Promise<void>) => {
      const mockTx = {
        get: vi.fn()
          .mockResolvedValueOnce({ exists: () => true, data: () => ({}) }) // no diamondBalance
          .mockResolvedValueOnce({ exists: () => false }),
        update: vi.fn(),
        set: vi.fn(),
      }
      await cb(mockTx)
    })
    // getDiamondBalance returns 15
    mockGetDocs.mockResolvedValue(mockSnapshotDocs([{ amount: 15 }]))

    const result = await spendDiamonds('fam-1', 'child-1', 8, 'dedup-1', 'forge')
    expect(result).toBe(true)
  })
})
