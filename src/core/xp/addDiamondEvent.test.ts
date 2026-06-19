import { describe, expect, it, vi, beforeEach } from 'vitest'

import { DIAMOND_EVENTS } from '../types/xp'

// ── Mock Firestore ─────────────────────────────────────────────
const mockGetDoc = vi.fn()
const mockDoc = vi.fn((..._args: unknown[]) => `mock-doc-${_args.join('-')}`)

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}))

vi.mock('../firebase/firestore', () => ({
  avatarProfilesCollection: (familyId: string) => `avatarProfiles-${familyId}`,
}))

const mockAddXpEvent = vi.fn()

vi.mock('./addXpEvent', () => ({
  addXpEvent: (...args: unknown[]) => mockAddXpEvent(...args),
}))

import { addDiamondEvent } from './addDiamondEvent'

describe('addDiamondEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddXpEvent.mockResolvedValue(5)
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ diamondBalance: 42 }),
    })
  })

  it('returns current balance without writing when amount is 0', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ diamondBalance: 25 }),
    })

    const result = await addDiamondEvent({
      familyId: 'fam-1',
      childId: 'child-1',
      amount: 0,
      type: DIAMOND_EVENTS.QUEST_COMPLETE,
      reason: 'test',
      dedupKey: 'zero-test',
    })

    expect(result.success).toBe(true)
    expect(result.newBalance).toBe(25)
    expect(mockAddXpEvent).not.toHaveBeenCalled()
  })

  it('returns 0 balance when profile does not exist and amount is 0', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false })

    const result = await addDiamondEvent({
      familyId: 'fam-1',
      childId: 'child-1',
      amount: 0,
      type: DIAMOND_EVENTS.QUEST_COMPLETE,
      reason: 'test',
      dedupKey: 'no-profile',
    })

    expect(result.success).toBe(true)
    expect(result.newBalance).toBe(0)
  })

  it('calls addXpEvent with MANUAL_AWARD for positive amounts', async () => {
    const result = await addDiamondEvent({
      familyId: 'fam-1',
      childId: 'child-1',
      amount: 5,
      type: DIAMOND_EVENTS.QUEST_COMPLETE,
      reason: 'quest complete',
      dedupKey: 'quest-1',
    })

    expect(result.success).toBe(true)
    expect(result.newBalance).toBe(42)

    expect(mockAddXpEvent).toHaveBeenCalledWith(
      'fam-1',
      'child-1',
      'MANUAL_AWARD',
      5,
      'quest-1',
      { reason: 'quest complete', awardedBy: 'auto', diamondType: DIAMOND_EVENTS.QUEST_COMPLETE },
      { currencyType: 'diamond', category: 'earn' },
    )
  })

  it('calls addXpEvent with MANUAL_DEDUCT for negative amounts', async () => {
    const result = await addDiamondEvent({
      familyId: 'fam-1',
      childId: 'child-1',
      amount: -10,
      type: DIAMOND_EVENTS.FORGE_PIECE,
      reason: 'forge belt',
      dedupKey: 'forge-belt',
      category: 'forge',
      itemId: 'belt',
    })

    expect(result.success).toBe(true)

    expect(mockAddXpEvent).toHaveBeenCalledWith(
      'fam-1',
      'child-1',
      'MANUAL_DEDUCT',
      -10,
      'forge-belt',
      { reason: 'forge belt', awardedBy: 'auto', diamondType: DIAMOND_EVENTS.FORGE_PIECE },
      { currencyType: 'diamond', category: 'forge', itemId: 'belt' },
    )
  })

  it('passes awardedBy through to metadata', async () => {
    await addDiamondEvent({
      familyId: 'fam-1',
      childId: 'child-1',
      amount: 3,
      type: DIAMOND_EVENTS.MANUAL_AWARD,
      reason: 'bonus for great work',
      dedupKey: 'parent-1',
      awardedBy: 'parent',
    })

    const meta = mockAddXpEvent.mock.calls[0][5]
    expect(meta.awardedBy).toBe('parent')
  })

  it('returns failure when addXpEvent returns 0 (dedup)', async () => {
    mockAddXpEvent.mockResolvedValue(0)

    const result = await addDiamondEvent({
      familyId: 'fam-1',
      childId: 'child-1',
      amount: 5,
      type: DIAMOND_EVENTS.QUEST_COMPLETE,
      reason: 'quest complete',
      dedupKey: 'already-awarded',
    })

    expect(result.success).toBe(false)
    expect(result.newBalance).toBe(0)
  })

  it('returns error message when addXpEvent throws', async () => {
    mockAddXpEvent.mockRejectedValue(new Error('Firestore unavailable'))

    const result = await addDiamondEvent({
      familyId: 'fam-1',
      childId: 'child-1',
      amount: 5,
      type: DIAMOND_EVENTS.QUEST_COMPLETE,
      reason: 'quest',
      dedupKey: 'fail-test',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Firestore unavailable')
    expect(result.newBalance).toBe(0)
  })

  it('returns error string when thrown value is not an Error', async () => {
    mockAddXpEvent.mockRejectedValue('raw string error')

    const result = await addDiamondEvent({
      familyId: 'fam-1',
      childId: 'child-1',
      amount: 5,
      type: DIAMOND_EVENTS.QUEST_COMPLETE,
      reason: 'quest',
      dedupKey: 'string-error',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('raw string error')
  })

  it('defaults category to earn when not specified', async () => {
    await addDiamondEvent({
      familyId: 'fam-1',
      childId: 'child-1',
      amount: 3,
      type: DIAMOND_EVENTS.QUEST_COMPLETE,
      reason: 'quest',
      dedupKey: 'default-cat',
    })

    const options = mockAddXpEvent.mock.calls[0][6]
    expect(options.category).toBe('earn')
  })

  it('omits itemId from options when not provided', async () => {
    await addDiamondEvent({
      familyId: 'fam-1',
      childId: 'child-1',
      amount: 3,
      type: DIAMOND_EVENTS.QUEST_COMPLETE,
      reason: 'quest',
      dedupKey: 'no-item',
    })

    const options = mockAddXpEvent.mock.calls[0][6]
    expect(options).not.toHaveProperty('itemId')
  })

  it('reads fresh balance from profile after successful award', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ diamondBalance: 99 }),
    })

    const result = await addDiamondEvent({
      familyId: 'fam-1',
      childId: 'child-1',
      amount: 5,
      type: DIAMOND_EVENTS.QUEST_COMPLETE,
      reason: 'quest',
      dedupKey: 'fresh-balance',
    })

    expect(result.newBalance).toBe(99)
  })
})
