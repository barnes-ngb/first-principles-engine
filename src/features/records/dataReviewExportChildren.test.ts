import { beforeEach, describe, expect, it, vi } from 'vitest'
const getDocs = vi.fn()
const childrenCollection = vi.fn((familyId: string) => ({ familyId }))
const seed = vi.fn()
vi.mock('firebase/firestore', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  getDocs: (...args: unknown[]) => getDocs(...args),
}))
vi.mock('../../core/firebase/firestore', () => ({ childrenCollection: (familyId: string) => childrenCollection(familyId) }))
vi.mock('../../core/firebase/seedProfileChildren', () => ({ seedProfileChildren: (...args: unknown[]) => seed(...args) }))
import { loadReviewExportChildren } from './dataReviewExportChildren'

describe('read-only review child list', () => {
  beforeEach(() => { getDocs.mockReset(); seed.mockClear() })
  it('reads the requested family, applies the existing oldest-child rule and exports only identity fields', async () => {
    const rows = [
      { id: 'a', name: 'Example', createdAt: '2024-01-01', grade: '1', secret: 'not identity' },
      { id: 'b', name: 'example', createdAt: '2025-01-01', grade: '2' },
      { id: 'c', name: 'Second', birthdate: '2019-01-01' },
    ]
    getDocs.mockResolvedValue({ docs: rows.map(row => ({ id: row.id, data: () => row })) })
    const result = await loadReviewExportChildren('family-current')
    expect(getDocs).toHaveBeenCalledWith({ familyId: 'family-current' })
    expect(result).toEqual([
      { id: 'a', name: 'Example', grade: '1', birthdate: undefined },
      { id: 'c', name: 'Second', grade: undefined, birthdate: '2019-01-01' },
    ])
    expect(seed).not.toHaveBeenCalled()
  })
  it('keeps an empty family empty and propagates failed reads for the UI gate', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] }).mockRejectedValueOnce(new Error('offline'))
    expect(await loadReviewExportChildren('empty')).toEqual([])
    await expect(loadReviewExportChildren('unavailable')).rejects.toThrow('offline')
    expect(seed).not.toHaveBeenCalled()
  })
})
