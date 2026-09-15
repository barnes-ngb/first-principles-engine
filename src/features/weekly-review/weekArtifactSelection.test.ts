import { describe, expect, it } from 'vitest'

import type { Artifact } from '../../core/types'
import { selectWeekArtifacts } from './weekArtifactSelection'

const START = '2026-09-06'
const END = '2026-09-12'
const artifact = (over: Partial<Artifact> = {}): Artifact & { id: string } => ({
  id: 'a', childId: 'c1', title: 'Reading note', type: 'Note',
  createdAt: '2026-09-15T17:00:00.000Z',
  tags: { engineStage: 'Build', domain: '', subjectBucket: 'Reading', location: 'Home' },
  ...over,
})

describe('explicit activity-day precedence', () => {
  it('admits both week endpoints even when uploaded outside the week', () => {
    const candidates = [artifact({ dayLogId: START }), artifact({ id: 'b', dayLogId: END })]
    expect(selectWeekArtifacts(candidates, START, END)).toEqual(candidates)
    expect(selectWeekArtifacts(candidates, '2026-09-13', '2026-09-19')).toEqual([])
  })

  it.each([undefined, '', '2026-09-08_c1', '2026-9-08', '2026-02-30', 'arbitrary-id'])(
    'preserves upload-week behavior for unsupported day link %s', (dayLogId) => {
      const candidate = artifact({ dayLogId })
      expect(selectWeekArtifacts([candidate], START, END)).toEqual([])
      expect(selectWeekArtifacts([candidate], '2026-09-13', '2026-09-19')).toEqual([candidate])
    },
  )

  it('rejects malformed links returned by the day range when uploaded elsewhere', () => {
    expect(selectWeekArtifacts([artifact({ dayLogId: '2026-09-08_c1' })], START, END)).toEqual([])
  })

  it('deduplicates candidates without mutating their saved dates', () => {
    const candidate = Object.freeze(artifact({ dayLogId: '2026-09-08' }))
    expect(selectWeekArtifacts([candidate, candidate], START, END)).toEqual([candidate])
    expect(candidate.createdAt).toBe('2026-09-15T17:00:00.000Z')
  })
})
