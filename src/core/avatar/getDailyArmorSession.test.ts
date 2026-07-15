import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetDoc = vi.fn()
const mockDoc = vi.fn((..._args: unknown[]) => `mock-doc-${_args.join('-')}`)
const mockWriteBatch = vi.fn()
const mockBatchSet = vi.fn()
const mockBatchUpdate = vi.fn()
const mockBatchCommit = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  writeBatch: () => mockWriteBatch(),
}))

vi.mock('../firebase/firestore', () => ({
  avatarProfilesCollection: (familyId: string) => `avatarProfiles-${familyId}`,
  dailyArmorSessionsCollection: (familyId: string) => `dailyArmorSessions-${familyId}`,
  dailyArmorSessionDocId: (childId: string, date: string) => `${childId}_${date}`,
  db: 'mock-db',
}))

import {
  getTodayDateString,
  getMorningSuitUpMessage,
  SUIT_UP_MORNING_MESSAGES,
  getDailyArmorSession,
} from './getDailyArmorSession'

describe('getTodayDateString', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = getTodayDateString()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('pads single-digit months and days', () => {
    const result = getTodayDateString()
    const [year, month, day] = result.split('-')
    expect(year).toHaveLength(4)
    expect(month).toHaveLength(2)
    expect(day).toHaveLength(2)
  })
})

describe('SUIT_UP_MORNING_MESSAGES', () => {
  it('has 5 messages', () => {
    expect(SUIT_UP_MORNING_MESSAGES).toHaveLength(5)
  })

  it('all messages are non-empty strings', () => {
    for (const msg of SUIT_UP_MORNING_MESSAGES) {
      expect(typeof msg).toBe('string')
      expect(msg.length).toBeGreaterThan(0)
    }
  })
})

describe('getMorningSuitUpMessage', () => {
  it('returns one of the suit-up messages', () => {
    const msg = getMorningSuitUpMessage()
    expect(SUIT_UP_MORNING_MESSAGES).toContain(msg)
  })
})

describe('getDailyArmorSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteBatch.mockReturnValue({
      set: mockBatchSet,
      update: mockBatchUpdate,
      commit: mockBatchCommit.mockResolvedValue(undefined),
    })
  })

  it('returns existing session with isNewDay=false when doc exists', async () => {
    const existingSession = {
      familyId: 'fam-1',
      childId: 'child-1',
      date: '2026-07-12',
      appliedPieces: ['helmet', 'chestplate'],
    }
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => existingSession,
    })

    const result = await getDailyArmorSession('fam-1', 'child-1')

    expect(result.isNewDay).toBe(false)
    expect(result.session).toEqual(existingSession)
    expect(mockBatchSet).not.toHaveBeenCalled()
    expect(mockBatchUpdate).not.toHaveBeenCalled()
  })

  it('creates new session with isNewDay=true when no doc exists', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false })

    const result = await getDailyArmorSession('fam-1', 'child-1')

    expect(result.isNewDay).toBe(true)
    expect(result.session.familyId).toBe('fam-1')
    expect(result.session.childId).toBe('child-1')
    expect(result.session.appliedPieces).toEqual([])
    expect(result.session.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('clears equippedPieces on avatar profile when creating new day session', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false })

    await getDailyArmorSession('fam-1', 'child-1')

    expect(mockBatchSet).toHaveBeenCalledTimes(1)
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1)

    const updateData = mockBatchUpdate.mock.calls[0][1]
    expect(updateData.equippedPieces).toEqual([])
    expect(updateData.lastArmorEquipDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('commits the batch when creating a new session', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false })

    await getDailyArmorSession('fam-1', 'child-1')

    expect(mockBatchCommit).toHaveBeenCalledTimes(1)
  })

  it('uses correct doc references', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false })

    await getDailyArmorSession('fam-1', 'child-1')

    expect(mockDoc).toHaveBeenCalledWith('dailyArmorSessions-fam-1', expect.stringContaining('child-1_'))
    expect(mockDoc).toHaveBeenCalledWith('avatarProfiles-fam-1', 'child-1')
  })
})
