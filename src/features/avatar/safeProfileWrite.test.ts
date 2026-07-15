import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUpdateDoc = vi.fn()
const mockSetDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}))

import { safeUpdateProfile, safeSetProfile } from './safeProfileWrite'

describe('safeUpdateProfile', () => {
  const mockRef = { path: 'avatarProfiles/child-1' } as never

  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateDoc.mockResolvedValue(undefined)
  })

  it('strips undefined values from the data', async () => {
    await safeUpdateProfile(mockRef, {
      childId: 'child-1',
      currentTier: 'wood',
      someField: undefined,
    } as never)

    const writtenData = mockUpdateDoc.mock.calls[0][1]
    expect(writtenData).not.toHaveProperty('someField')
    expect(writtenData.childId).toBe('child-1')
  })

  it('adds updatedAt timestamp', async () => {
    await safeUpdateProfile(mockRef, { childId: 'child-1' } as never)

    const writtenData = mockUpdateDoc.mock.calls[0][1]
    expect(writtenData.updatedAt).toBeDefined()
    expect(typeof writtenData.updatedAt).toBe('string')
  })

  it('normalizes null equippedPieces to empty array', async () => {
    await safeUpdateProfile(mockRef, { equippedPieces: null } as never)

    const writtenData = mockUpdateDoc.mock.calls[0][1]
    expect(writtenData.equippedPieces).toEqual([])
  })

  it('normalizes null pieces to empty array', async () => {
    await safeUpdateProfile(mockRef, { pieces: null } as never)

    const writtenData = mockUpdateDoc.mock.calls[0][1]
    expect(writtenData.pieces).toEqual([])
  })

  it('normalizes null unlockedPieces to empty array', async () => {
    await safeUpdateProfile(mockRef, { unlockedPieces: null } as never)

    const writtenData = mockUpdateDoc.mock.calls[0][1]
    expect(writtenData.unlockedPieces).toEqual([])
  })

  it('preserves valid array fields', async () => {
    const pieces = [{ id: 'helmet', tier: 'wood' }]
    await safeUpdateProfile(mockRef, { equippedPieces: pieces } as never)

    const writtenData = mockUpdateDoc.mock.calls[0][1]
    expect(writtenData.equippedPieces).toEqual(pieces)
  })

  it('rethrows Firestore errors', async () => {
    mockUpdateDoc.mockRejectedValue(new Error('Firestore write failed'))

    await expect(
      safeUpdateProfile(mockRef, { childId: 'child-1' } as never),
    ).rejects.toThrow('Firestore write failed')
  })

  it('does not normalize array fields that are not present in data', async () => {
    await safeUpdateProfile(mockRef, { currentTier: 'stone' } as never)

    const writtenData = mockUpdateDoc.mock.calls[0][1]
    expect(writtenData).not.toHaveProperty('equippedPieces')
    expect(writtenData).not.toHaveProperty('pieces')
    expect(writtenData).not.toHaveProperty('unlockedPieces')
  })
})

describe('safeSetProfile', () => {
  const mockRef = { path: 'avatarProfiles/child-1' } as never

  beforeEach(() => {
    vi.clearAllMocks()
    mockSetDoc.mockResolvedValue(undefined)
  })

  it('strips undefined values', async () => {
    await safeSetProfile(mockRef, {
      childId: 'child-1',
      badField: undefined,
    } as never)

    const writtenData = mockSetDoc.mock.calls[0][1]
    expect(writtenData).not.toHaveProperty('badField')
  })

  it('adds updatedAt timestamp', async () => {
    await safeSetProfile(mockRef, { childId: 'child-1' } as never)

    const writtenData = mockSetDoc.mock.calls[0][1]
    expect(writtenData.updatedAt).toBeDefined()
  })

  it('defaults equippedPieces and pieces to empty arrays when missing', async () => {
    await safeSetProfile(mockRef, { childId: 'child-1' } as never)

    const writtenData = mockSetDoc.mock.calls[0][1]
    expect(writtenData.equippedPieces).toEqual([])
    expect(writtenData.pieces).toEqual([])
  })

  it('normalizes null equippedPieces to empty array', async () => {
    await safeSetProfile(mockRef, {
      childId: 'child-1',
      equippedPieces: null,
      pieces: null,
    } as never)

    const writtenData = mockSetDoc.mock.calls[0][1]
    expect(writtenData.equippedPieces).toEqual([])
    expect(writtenData.pieces).toEqual([])
  })

  it('preserves valid array data', async () => {
    const equipped = [{ id: 'chestplate', tier: 'iron' }]
    const pieces = [{ id: 'helmet', tier: 'stone' }]
    await safeSetProfile(mockRef, {
      childId: 'child-1',
      equippedPieces: equipped,
      pieces: pieces,
    } as never)

    const writtenData = mockSetDoc.mock.calls[0][1]
    expect(writtenData.equippedPieces).toEqual(equipped)
    expect(writtenData.pieces).toEqual(pieces)
  })

  it('rethrows Firestore errors', async () => {
    mockSetDoc.mockRejectedValue(new Error('Permission denied'))

    await expect(
      safeSetProfile(mockRef, { childId: 'child-1' } as never),
    ).rejects.toThrow('Permission denied')
  })
})
