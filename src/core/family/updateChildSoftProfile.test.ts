import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateDoc = vi.fn()
const doc = vi.fn((...args: unknown[]) => ({ __doc: args.length }))
vi.mock('firebase/firestore', () => ({
  updateDoc: (...args: unknown[]) => updateDoc(...args),
  doc: (...args: unknown[]) => doc(...args),
}))

vi.mock('../firebase/firestore', () => ({
  childrenCollection: (familyId: string) => ({ __children: familyId }),
}))

import {
  updateChildSoftProfile,
  isAllowedSoftProfilePatch,
} from './updateChildSoftProfile'

beforeEach(() => {
  vi.clearAllMocks()
  updateDoc.mockResolvedValue(undefined)
})

describe('updateChildSoftProfile', () => {
  it('writes an allowed single-field patch', async () => {
    await updateChildSoftProfile('fam1', 'lincoln1', { motivators: 'Lego' })
    expect(updateDoc).toHaveBeenCalledTimes(1)
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      motivators: 'Lego',
    })
  })

  it('writes all three allowed fields', async () => {
    const patch = { motivators: 'a', interests: 'b', strengths: 'c' }
    await updateChildSoftProfile('fam1', 'london1', patch)
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), patch)
  })

  it('throws and never writes when the patch carries a disallowed key', async () => {
    // Bypass the typed union to simulate a defense-in-depth breach.
    const bad = { supports: 'extra time' } as unknown as {
      motivators?: string
    }
    await expect(
      updateChildSoftProfile('fam1', 'lincoln1', bad),
    ).rejects.toThrow(/disallowed field/i)
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('isAllowedSoftProfilePatch gates the three fields only', () => {
    expect(isAllowedSoftProfilePatch({ motivators: 'x' })).toBe(true)
    expect(isAllowedSoftProfilePatch({ interests: 'x', strengths: 'y' })).toBe(true)
    expect(
      isAllowedSoftProfilePatch({ grade: '4' } as unknown as { motivators?: string }),
    ).toBe(false)
  })
})
