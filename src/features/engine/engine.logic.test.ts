import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { EngineStage } from '../../core/types/enums'
import {
  computeLoopStatus,
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
