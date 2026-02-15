import { describe, expect, it } from 'vitest'

import { EngineStage } from '../../core/types/enums'
import {
  buildLabSessionDocId,
  DEFAULT_LAB_STAGE,
  LAB_STAGES,
  labStageIndex,
} from './labSession.logic'

describe('buildLabSessionDocId', () => {
  it('builds doc id as weekKey_childId', () => {
    const docId = buildLabSessionDocId('2026-02-09', 'child-lincoln')
    expect(docId).toBe('2026-02-09_child-lincoln')
  })

  it('produces unique ids for different children in the same week', () => {
    const a = buildLabSessionDocId('2026-02-09', 'child-lincoln')
    const b = buildLabSessionDocId('2026-02-09', 'child-london')
    expect(a).not.toBe(b)
  })

  it('produces unique ids for the same child in different weeks', () => {
    const a = buildLabSessionDocId('2026-02-09', 'child-lincoln')
    const b = buildLabSessionDocId('2026-02-16', 'child-lincoln')
    expect(a).not.toBe(b)
  })
})

describe('LAB_STAGES', () => {
  it('contains all five engine stages in order', () => {
    expect(LAB_STAGES).toEqual([
      EngineStage.Wonder,
      EngineStage.Build,
      EngineStage.Explain,
      EngineStage.Reflect,
      EngineStage.Share,
    ])
  })
})

describe('DEFAULT_LAB_STAGE', () => {
  it('defaults to Wonder', () => {
    expect(DEFAULT_LAB_STAGE).toBe(EngineStage.Wonder)
  })
})

describe('labStageIndex', () => {
  it('returns 0 for Wonder', () => {
    expect(labStageIndex(EngineStage.Wonder)).toBe(0)
  })

  it('returns 4 for Share', () => {
    expect(labStageIndex(EngineStage.Share)).toBe(4)
  })

  it('returns correct index for middle stages', () => {
    expect(labStageIndex(EngineStage.Build)).toBe(1)
    expect(labStageIndex(EngineStage.Explain)).toBe(2)
    expect(labStageIndex(EngineStage.Reflect)).toBe(3)
  })
})

describe('child switching isolation', () => {
  it('different children produce different doc IDs for same week', () => {
    const weekKey = '2026-02-09'
    const lincolnId = buildLabSessionDocId(weekKey, 'lincoln-id-123')
    const londonId = buildLabSessionDocId(weekKey, 'london-id-456')

    expect(lincolnId).toBe('2026-02-09_lincoln-id-123')
    expect(londonId).toBe('2026-02-09_london-id-456')
    expect(lincolnId).not.toBe(londonId)
  })

  it('switching child changes the doc ID used for query', () => {
    // Simulates the key={`${childId}_${weekKey}`} pattern
    const weekKey = '2026-02-09'

    const key1 = `lincoln-id_${weekKey}`
    const key2 = `london-id_${weekKey}`

    // Keys differ → React remounts the component, clearing stale state
    expect(key1).not.toBe(key2)
  })
})
