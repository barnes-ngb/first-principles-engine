import { describe, expect, it, vi } from 'vitest'

const mockUpdateDoc = vi.fn<(...args: unknown[]) => Promise<undefined>>(
  async () => undefined,
)
const mockDoc = vi.fn((_col: unknown, id: string) => ({ id }))

vi.mock('firebase/firestore', () => ({
  doc: (col: unknown, id: string) => mockDoc(col, id),
  updateDoc: (ref: unknown, data: unknown) => mockUpdateDoc(ref, data),
}))

vi.mock('../firebase/firestore', () => ({
  childrenCollection: (familyId: string) => ({ familyId }),
}))

import {
  isAllowedIdentityPatch,
  updateChildIdentity,
  IDENTITY_FIELDS,
} from './updateChildIdentity'

describe('updateChildIdentity', () => {
  it('exposes exactly the identity allowlist', () => {
    expect([...IDENTITY_FIELDS]).toEqual(['birthdate', 'grade'])
  })

  it('allows birthdate/grade patches', () => {
    expect(isAllowedIdentityPatch({ birthdate: '2015-09-30' })).toBe(true)
    expect(isAllowedIdentityPatch({ grade: '4th grade' })).toBe(true)
    expect(isAllowedIdentityPatch({ birthdate: '2015-09-30', grade: '4th grade' })).toBe(true)
  })

  it('rejects a patch with a disallowed key', () => {
    // @ts-expect-error — exercising the runtime guard with a stray key
    expect(isAllowedIdentityPatch({ motivators: 'Minecraft' })).toBe(false)
  })

  it('writes an allowed patch to the child doc', async () => {
    await updateChildIdentity('fam-1', 'c-1', { birthdate: '2020-02-20', grade: '1st grade' })
    expect(mockDoc).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'fam-1' }),
      'c-1',
    )
    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), {
      birthdate: '2020-02-20',
      grade: '1st grade',
    })
  })

  it('throws (and never writes) on a disallowed patch', async () => {
    mockUpdateDoc.mockClear()
    await expect(
      // @ts-expect-error — bypassing the typed union to hit the runtime guard
      updateChildIdentity('fam-1', 'c-1', { name: 'Hacked' }),
    ).rejects.toThrow(/disallowed field/)
    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })
})
