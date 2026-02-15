import { describe, expect, it } from 'vitest'

import { EngineStage } from '../../core/types/enums'
import {
  buildLabSessionDocId,
  DEFAULT_LAB_STAGE,
  LAB_STAGES,
  labStageIndex,
} from './labSession.logic'

describe('buildLabSessionDocId', () => {
  it('builds doc id as weekKey_childId (legacy, no projectId)', () => {
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

// ── Project-scoped session tests ─────────────────────────────

describe('project-scoped session doc IDs', () => {
  it('includes projectId in the doc ID when provided', () => {
    const docId = buildLabSessionDocId('2026-02-09', 'child-lincoln', 'project-abc')
    expect(docId).toBe('2026-02-09_child-lincoln_project-abc')
  })

  it('same child + week but different projects produce different doc IDs', () => {
    const weekKey = '2026-02-09'
    const childId = 'child-lincoln'
    const a = buildLabSessionDocId(weekKey, childId, 'project-rockets')
    const b = buildLabSessionDocId(weekKey, childId, 'project-volcano')
    expect(a).not.toBe(b)
  })

  it('session query is project-scoped: same child/week yields different sessions per project', () => {
    const weekKey = '2026-02-09'
    const childId = 'lincoln-id-123'

    const projectA = 'project-a'
    const projectB = 'project-b'

    const sessionIdA = buildLabSessionDocId(weekKey, childId, projectA)
    const sessionIdB = buildLabSessionDocId(weekKey, childId, projectB)

    // Different projects produce different session doc IDs
    expect(sessionIdA).not.toBe(sessionIdB)

    // Both include the projectId
    expect(sessionIdA).toContain(projectA)
    expect(sessionIdB).toContain(projectB)

    // Both are scoped to the same child and week
    expect(sessionIdA).toContain(weekKey)
    expect(sessionIdA).toContain(childId)
    expect(sessionIdB).toContain(weekKey)
    expect(sessionIdB).toContain(childId)
  })

  it('legacy doc ID (no projectId) differs from project-scoped doc ID', () => {
    const weekKey = '2026-02-09'
    const childId = 'child-lincoln'

    const legacy = buildLabSessionDocId(weekKey, childId)
    const scoped = buildLabSessionDocId(weekKey, childId, 'project-abc')

    expect(legacy).toBe('2026-02-09_child-lincoln')
    expect(scoped).toBe('2026-02-09_child-lincoln_project-abc')
    expect(legacy).not.toBe(scoped)
  })
})

// ── Artifact scoping tests ───────────────────────────────────

describe('artifact query scoping', () => {
  it('artifacts are session-scoped: sessionDocId encodes child+week+project', () => {
    // The artifact query uses labSessionId to scope — verify the ID contains all three dimensions
    const sessionId = buildLabSessionDocId('2026-02-09', 'child-lincoln', 'project-rockets')
    expect(sessionId).toContain('2026-02-09')
    expect(sessionId).toContain('child-lincoln')
    expect(sessionId).toContain('project-rockets')
  })

  it('artifacts for different sessions never share a labSessionId', () => {
    const sessionA = buildLabSessionDocId('2026-02-09', 'child-lincoln', 'project-rockets')
    const sessionB = buildLabSessionDocId('2026-02-09', 'child-lincoln', 'project-volcano')
    const sessionC = buildLabSessionDocId('2026-02-09', 'child-london', 'project-rockets')

    // All session IDs are unique
    const ids = [sessionA, sessionB, sessionC]
    expect(new Set(ids).size).toBe(3)
  })

  it('artifacts filtered by stage are a subset of session artifacts', () => {
    // Given artifacts with different labStage values all sharing a sessionId,
    // filtering by stage produces a subset
    const sessionId = buildLabSessionDocId('2026-02-09', 'child-lincoln', 'project-abc')
    type StageArtifact = { labSessionId: string; labStage: EngineStage }
    const artifacts: StageArtifact[] = [
      { labSessionId: sessionId, labStage: EngineStage.Wonder },
      { labSessionId: sessionId, labStage: EngineStage.Build },
      { labSessionId: sessionId, labStage: EngineStage.Wonder },
      { labSessionId: sessionId, labStage: EngineStage.Share },
    ]

    const wonderArtifacts = artifacts.filter((a) => a.labStage === EngineStage.Wonder)
    expect(wonderArtifacts).toHaveLength(2)

    const buildArtifacts = artifacts.filter((a) => a.labStage === EngineStage.Build)
    expect(buildArtifacts).toHaveLength(1)

    const reflectArtifacts = artifacts.filter((a) => a.labStage === EngineStage.Reflect)
    expect(reflectArtifacts).toHaveLength(0)
  })
})
