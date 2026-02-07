import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import {
  computeLoopStatus,
  countMilestonesAchievedInRange,
  countUniqueRungsInRange,
  getWeekRange,
  suggestNextStage,
} from './engine.logic'

describe('getWeekRange', () => {
  it('returns the Monday-Sunday range for a fixed date', () => {
    const range = getWeekRange(new Date(2026, 1, 4))

    assert.deepEqual(range, {
      start: '2026-02-02',
      end: '2026-02-08',
    })
  })
})

describe('computeLoopStatus', () => {
  it('returns complete when every stage has evidence', () => {
    const status = computeLoopStatus({
      [EngineStage.Wonder]: 1,
      [EngineStage.Build]: 1,
      [EngineStage.Explain]: 1,
      [EngineStage.Reflect]: 1,
      [EngineStage.Share]: 1,
    })

    assert.equal(status, 'complete')
  })

  it('returns incomplete when minimum loop is missing', () => {
    const status = computeLoopStatus({
      [EngineStage.Build]: 2,
      [EngineStage.Explain]: 1,
    })

    assert.equal(status, 'incomplete')
  })
})

describe('suggestNextStage', () => {
  it('suggests Wonder when nothing is captured yet', () => {
    const suggestion = suggestNextStage({})

    assert.equal(suggestion, EngineStage.Wonder)
  })

  it('suggests Build once the minimum loop is complete', () => {
    const suggestion = suggestNextStage({
      [EngineStage.Wonder]: 1,
      [EngineStage.Explain]: 1,
      [EngineStage.Reflect]: 1,
    })

    assert.equal(suggestion, EngineStage.Build)
  })

  it('returns null when all stages are already covered', () => {
    const suggestion = suggestNextStage({
      [EngineStage.Wonder]: 1,
      [EngineStage.Build]: 1,
      [EngineStage.Explain]: 1,
      [EngineStage.Reflect]: 1,
      [EngineStage.Share]: 1,
    })

    assert.equal(suggestion, null)
  })
})

describe('countUniqueRungsInRange', () => {
  const range = { start: '2026-02-02', end: '2026-02-08' }
  const baseTags = {
    engineStage: EngineStage.Wonder,
    domain: 'Science',
    subjectBucket: SubjectBucket.Science,
    location: 'Home',
  }

  it('counts unique rung ids within the week range', () => {
    const artifacts = [
      {
        childId: 'child-a',
        title: 'Note 1',
        type: EvidenceType.Note,
        createdAt: '2026-02-02T08:00:00',
        tags: { ...baseTags, ladderRef: { ladderId: 'ladder-1', rungId: 'rung-1' } },
      },
      {
        childId: 'child-a',
        title: 'Note 2',
        type: EvidenceType.Note,
        createdAt: '2026-02-08T23:59:59',
        tags: { ...baseTags, ladderRef: { ladderId: 'ladder-1', rungId: 'rung-2' } },
      },
      {
        childId: 'child-a',
        title: 'Duplicate rung',
        type: EvidenceType.Note,
        createdAt: '2026-02-03T12:00:00',
        tags: { ...baseTags, ladderRef: { ladderId: 'ladder-1', rungId: 'rung-1' } },
      },
      {
        childId: 'child-a',
        title: 'Outside week',
        type: EvidenceType.Note,
        createdAt: '2026-02-09T10:00:00',
        tags: { ...baseTags, ladderRef: { ladderId: 'ladder-1', rungId: 'rung-3' } },
      },
      {
        childId: 'child-a',
        title: 'Missing rung',
        type: EvidenceType.Note,
        createdAt: '2026-02-04T10:00:00',
        tags: baseTags,
      },
      {
        childId: 'child-b',
        title: 'Other child',
        type: EvidenceType.Note,
        createdAt: '2026-02-04T10:00:00',
        tags: { ...baseTags, ladderRef: { ladderId: 'ladder-1', rungId: 'rung-4' } },
      },
    ]

    const count = countUniqueRungsInRange(artifacts, 'child-a', range)

    assert.equal(count, 2)
  })
})

describe('countMilestonesAchievedInRange', () => {
  const range = { start: '2026-02-02', end: '2026-02-08' }

  it('counts milestone achievements within the week range', () => {
    const milestones = [
      {
        childId: 'child-a',
        ladderId: 'ladder-1',
        rungId: 'rung-1',
        label: 'Milestone 1',
        achieved: true,
        status: 'achieved',
        achievedAt: '2026-02-02T09:00:00',
      },
      {
        childId: 'child-a',
        ladderId: 'ladder-1',
        rungId: 'rung-2',
        label: 'Milestone 2',
        achieved: true,
        status: 'achieved',
        achievedAt: '2026-02-08T18:00:00',
      },
      {
        childId: 'child-a',
        ladderId: 'ladder-1',
        rungId: 'rung-3',
        label: 'Outside week',
        achieved: true,
        status: 'achieved',
        achievedAt: '2026-02-09T10:00:00',
      },
      {
        childId: 'child-a',
        ladderId: 'ladder-1',
        rungId: 'rung-4',
        label: 'Missing date',
        achieved: true,
        status: 'achieved',
      },
      {
        childId: 'child-b',
        ladderId: 'ladder-1',
        rungId: 'rung-5',
        label: 'Other child',
        achieved: true,
        status: 'achieved',
        achievedAt: '2026-02-04T12:00:00',
      },
    ]

    const count = countMilestonesAchievedInRange(milestones, 'child-a', range)

    assert.equal(count, 2)
  })
})
