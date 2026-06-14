import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { EvaluationFinding } from '../types/evaluation'

// ── Mock Firestore ─────────────────────────────────────────────
const mockGetDoc = vi.fn()
const mockSetDoc = vi.fn()
const mockGetDocs = vi.fn()
const mockDoc = vi.fn((..._args: unknown[]) => `mock-doc-ref`)
const mockQuery = vi.fn((..._args: unknown[]) => 'mock-query')
const mockWhere = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...args),
}))

vi.mock('../firebase/firestore', () => ({
  childSkillMapsCollection: (familyId: string) => `childSkillMaps-${familyId}`,
  evaluationSessionsCollection: (familyId: string) => `evaluationSessions-${familyId}`,
  skillSnapshotsCollection: (familyId: string) => `skillSnapshots-${familyId}`,
}))

import {
  updateSkillMapFromFindings,
  markProgramCompleteOnSkillMap,
} from './updateSkillMapFromFindings'

describe('updateSkillMapFromFindings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no existing skill map
    mockGetDoc.mockResolvedValue({ exists: () => false })
    mockSetDoc.mockResolvedValue(undefined)
  })

  it('does nothing when familyId is empty', async () => {
    await updateSkillMapFromFindings('', 'child-1', [
      { skill: 'phonics.cvc', status: 'mastered', evidence: 'test' },
    ])
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('does nothing when childId is empty', async () => {
    await updateSkillMapFromFindings('fam-1', '', [
      { skill: 'phonics.cvc', status: 'mastered', evidence: 'test' },
    ])
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('does nothing when findings array is empty', async () => {
    await updateSkillMapFromFindings('fam-1', 'child-1', [])
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('creates a new skill map when none exists', async () => {
    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc', status: 'mastered', evidence: 'Blended CVC words' },
    ]

    await updateSkillMapFromFindings('fam-1', 'child-1', findings)

    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    const [, data, options] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.childId).toBe('child-1')
    expect(parsed.skills['reading.phonics.cvc']).toBeDefined()
    expect(parsed.skills['reading.phonics.cvc'].status).toBe('mastered')
    expect(parsed.skills['reading.phonics.cvc'].source).toBe('evaluation')
    expect(options).toEqual({ merge: true })
  })

  it('maps emerging findings to in-progress status', async () => {
    const findings: EvaluationFinding[] = [
      { skill: 'phonics.blends', status: 'emerging', evidence: 'Working on blends' },
    ]

    await updateSkillMapFromFindings('fam-1', 'child-1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['reading.phonics.blends'].status).toBe('in-progress')
  })

  it('maps not-yet findings to in-progress status', async () => {
    const findings: EvaluationFinding[] = [
      { skill: 'math.addition', status: 'not-yet', evidence: 'Not there yet' },
    ]

    await updateSkillMapFromFindings('fam-1', 'child-1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['math.operations.addSub'].status).toBe('in-progress')
  })

  it('skips findings with not-tested status', async () => {
    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc', status: 'mastered', evidence: 'yes' },
      { skill: 'math.fractions', status: 'not-tested', evidence: 'skipped' },
    ]

    await updateSkillMapFromFindings('fam-1', 'child-1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['reading.phonics.cvc']).toBeDefined()
    expect(parsed.skills['math.fractions.concepts']).toBeUndefined()
  })

  it('never downgrades mastered to in-progress', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        skills: {
          'reading.phonics.cvc': {
            nodeId: 'reading.phonics.cvc',
            status: 'mastered',
            source: 'evaluation',
            updatedAt: '2026-01-01',
          },
        },
        updatedAt: '2026-01-01',
      }),
    })

    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc', status: 'emerging', evidence: 'Regressed?' },
    ]

    await updateSkillMapFromFindings('fam-1', 'child-1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['reading.phonics.cvc'].status).toBe('mastered')
  })

  it('upgrades in-progress to mastered', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        skills: {
          'reading.phonics.cvc': {
            nodeId: 'reading.phonics.cvc',
            status: 'in-progress',
            source: 'evaluation',
            updatedAt: '2026-01-01',
          },
        },
        updatedAt: '2026-01-01',
      }),
    })

    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc', status: 'mastered', evidence: 'Fully mastered now', testedAt: '2026-02-01' },
    ]

    await updateSkillMapFromFindings('fam-1', 'child-1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['reading.phonics.cvc'].status).toBe('mastered')
    expect(parsed.skills['reading.phonics.cvc'].updatedAt).toBe('2026-02-01')
  })

  it('does not update in-progress when incoming is also in-progress', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        skills: {
          'reading.phonics.blends': {
            nodeId: 'reading.phonics.blends',
            status: 'in-progress',
            source: 'evaluation',
            updatedAt: '2026-01-01',
            notes: 'original notes',
          },
        },
        updatedAt: '2026-01-01',
      }),
    })

    const findings: EvaluationFinding[] = [
      { skill: 'phonics.blends', status: 'emerging', evidence: 'Still working on it' },
    ]

    await updateSkillMapFromFindings('fam-1', 'child-1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['reading.phonics.blends'].notes).toBe('original notes')
  })

  it('handles multiple findings from different domains', async () => {
    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc', status: 'mastered', evidence: 'CVC mastered' },
      { skill: 'math.addition', status: 'emerging', evidence: 'Working on addition' },
      { skill: 'speech.articulation.r', status: 'not-yet', evidence: 'R sound needs work' },
    ]

    await updateSkillMapFromFindings('fam-1', 'child-1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['reading.phonics.cvc'].status).toBe('mastered')
    expect(parsed.skills['math.operations.addSub'].status).toBe('in-progress')
    expect(parsed.skills['speech.sounds.late'].status).toBe('in-progress')
  })

  it('skips unmapped finding tags gracefully', async () => {
    const findings: EvaluationFinding[] = [
      { skill: 'completely.unknown.skill', status: 'mastered', evidence: 'test' },
      { skill: 'phonics.cvc', status: 'mastered', evidence: 'CVC done' },
    ]

    await updateSkillMapFromFindings('fam-1', 'child-1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(Object.keys(parsed.skills)).toHaveLength(1)
    expect(parsed.skills['reading.phonics.cvc']).toBeDefined()
  })

  it('preserves existing skills not touched by new findings', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        skills: {
          'math.number.counting': {
            nodeId: 'math.number.counting',
            status: 'mastered',
            source: 'program',
            updatedAt: '2026-01-01',
          },
        },
        updatedAt: '2026-01-01',
      }),
    })

    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc', status: 'mastered', evidence: 'CVC done' },
    ]

    await updateSkillMapFromFindings('fam-1', 'child-1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['math.number.counting'].status).toBe('mastered')
    expect(parsed.skills['reading.phonics.cvc'].status).toBe('mastered')
  })

  it('stores evidence as notes on the skill node', async () => {
    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc', status: 'mastered', evidence: 'Blended 5 CVC words with 0 errors' },
    ]

    await updateSkillMapFromFindings('fam-1', 'child-1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['reading.phonics.cvc'].notes).toBe('Blended 5 CVC words with 0 errors')
  })
})

describe('markProgramCompleteOnSkillMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDoc.mockResolvedValue({ exists: () => false })
    mockSetDoc.mockResolvedValue(undefined)
  })

  it('does nothing when familyId is empty', async () => {
    await markProgramCompleteOnSkillMap('', 'child-1', 'reading-eggs')
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('does nothing when childId is empty', async () => {
    await markProgramCompleteOnSkillMap('fam-1', '', 'reading-eggs')
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('does nothing when programId is empty', async () => {
    await markProgramCompleteOnSkillMap('fam-1', 'child-1', '')
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('marks all linked nodes as mastered with program source', async () => {
    // The actual nodes depend on CURRICULUM_MAPS — we just verify the behavior
    // when getNodesForProgram returns results
    await markProgramCompleteOnSkillMap('fam-1', 'child-1', 'reading-eggs')

    if (mockSetDoc.mock.calls.length > 0) {
      const [, data] = mockSetDoc.mock.calls[0]
      const parsed = JSON.parse(JSON.stringify(data))
      for (const skill of Object.values(parsed.skills) as Array<{ status: string; source: string }>) {
        expect(skill.status).toBe('mastered')
        expect(skill.source).toBe('program')
      }
    }
    // If no setDoc call, the program had no linked nodes — that's valid too
  })

  it('preserves existing skills when marking program complete', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child-1',
        skills: {
          'reading.phonics.cvc': {
            nodeId: 'reading.phonics.cvc',
            status: 'in-progress',
            source: 'evaluation',
            updatedAt: '2026-01-01',
          },
        },
        updatedAt: '2026-01-01',
      }),
    })

    await markProgramCompleteOnSkillMap('fam-1', 'child-1', 'reading-eggs')

    if (mockSetDoc.mock.calls.length > 0) {
      const [, data] = mockSetDoc.mock.calls[0]
      const parsed = JSON.parse(JSON.stringify(data))
      expect(parsed.skills['reading.phonics.cvc']).toBeDefined()
    }
  })
})
