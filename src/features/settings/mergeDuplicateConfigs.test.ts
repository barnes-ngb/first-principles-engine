import { describe, it, expect } from 'vitest'
import type { ActivityConfig } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'
import { computeMergedUpdates, detectDuplicateGroups } from './mergeDuplicateConfigs'

const baseConfig = (overrides: Partial<ActivityConfig> = {}): ActivityConfig => ({
  id: 'cfg',
  childId: 'lincoln',
  name: 'Untitled',
  type: 'workbook',
  subjectBucket: SubjectBucket.Math,
  defaultMinutes: 30,
  frequency: 'daily',
  sortOrder: 12,
  completed: false,
  scannable: true,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  ...overrides,
})

describe('detectDuplicateGroups', () => {
  it('detects "Mathseeds" and "Mathseeds Mental Minute" as a duplicate pair', () => {
    const configs = [
      baseConfig({
        id: 'a',
        name: 'Mathseeds Mental Minute',
        createdAt: '2026-03-10T00:00:00Z',
      }),
      baseConfig({
        id: 'b',
        name: 'Mathseeds',
        createdAt: '2026-05-20T00:00:00Z',
      }),
    ]

    const groups = detectDuplicateGroups(configs)

    expect(groups).toHaveLength(1)
    expect(groups[0].source.id).toBe('a') // older
    expect(groups[0].duplicates.map((d) => d.id)).toEqual(['b'])
  })

  it('returns no groups when nothing is duplicated', () => {
    const configs = [
      baseConfig({ id: 'a', name: 'Mathseeds' }),
      baseConfig({ id: 'b', name: 'Reading Eggs', subjectBucket: SubjectBucket.Reading }),
    ]
    expect(detectDuplicateGroups(configs)).toEqual([])
  })

  it('skips completed configs', () => {
    const configs = [
      baseConfig({ id: 'a', name: 'Mathseeds', completed: true }),
      baseConfig({ id: 'b', name: 'Mathseeds Mental Minute', completed: false }),
    ]
    expect(detectDuplicateGroups(configs)).toEqual([])
  })

  it('skips non-workbook configs', () => {
    const configs = [
      baseConfig({ id: 'a', name: 'Mathseeds', type: 'routine' }),
      baseConfig({ id: 'b', name: 'Mathseeds Mental Minute' }),
    ]
    expect(detectDuplicateGroups(configs)).toEqual([])
  })
})

describe('computeMergedUpdates', () => {
  it('takes the higher currentPosition', () => {
    const source = baseConfig({
      id: 'a',
      name: 'Mathseeds Mental Minute',
      currentPosition: 1,
      updatedAt: '2026-04-14T00:00:00Z',
    })
    const duplicate = baseConfig({
      id: 'b',
      name: 'Mathseeds',
      currentPosition: 122,
      updatedAt: '2026-05-20T00:00:00Z',
    })

    const updates = computeMergedUpdates({ source, duplicates: [duplicate] })

    expect(updates.currentPosition).toBe(122)
    expect(updates.updatedAt).toBe('2026-05-20T00:00:00Z')
  })

  it('does not lower the position when source is already ahead', () => {
    const source = baseConfig({ id: 'a', currentPosition: 100, name: 'X' })
    const duplicate = baseConfig({ id: 'b', currentPosition: 50, name: 'X' })

    const updates = computeMergedUpdates({ source, duplicates: [duplicate] })

    expect(updates.currentPosition).toBeUndefined()
  })

  it('unions mastered skills across source + duplicates', () => {
    const source = baseConfig({
      id: 'a',
      name: 'X',
      curriculumMeta: {
        provider: 'other',
        masteredSkills: ['add', 'subtract'],
      },
    })
    const duplicate = baseConfig({
      id: 'b',
      name: 'X',
      curriculumMeta: {
        provider: 'other',
        masteredSkills: ['subtract', 'multiply'],
      },
    })

    const updates = computeMergedUpdates({ source, duplicates: [duplicate] })

    expect(updates.masteredSkills?.sort()).toEqual(['add', 'multiply', 'subtract'])
  })
})
