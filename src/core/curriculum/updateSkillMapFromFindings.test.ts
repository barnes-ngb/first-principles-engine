import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { EvaluationFinding } from '../types/evaluation'

// ── Mock Firestore ─────────────────────────────────────────────
const mockGetDoc = vi.fn()
const mockSetDoc = vi.fn()
const mockGetDocs = vi.fn()
const mockDoc = vi.fn((..._args: unknown[]) => `mock-ref`)
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

import { updateSkillMapFromFindings, markProgramCompleteOnSkillMap } from './updateSkillMapFromFindings'

describe('updateSkillMapFromFindings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetDoc.mockResolvedValue(undefined)
  })

  it('does nothing when findings array is empty', async () => {
    await updateSkillMapFromFindings('fam1', 'child1', [])
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('does nothing when familyId is empty', async () => {
    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc.short-a', status: 'emerging', evidence: 'test' },
    ]
    await updateSkillMapFromFindings('', 'child1', findings)
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('does nothing when childId is empty', async () => {
    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc.short-a', status: 'emerging', evidence: 'test' },
    ]
    await updateSkillMapFromFindings('fam1', '', findings)
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('creates skill map from findings on a new child (no existing doc)', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => null })

    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc.short-a', status: 'emerging', evidence: 'Working on CVC' },
      { skill: 'math.addition.within-20', status: 'emerging', evidence: 'Adding within 10' },
    ]

    await updateSkillMapFromFindings('fam1', 'child1', findings)

    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))

    expect(parsed.childId).toBe('child1')
    expect(parsed.skills['reading.phonics.cvc']).toBeDefined()
    expect(parsed.skills['reading.phonics.cvc'].status).toBe('in-progress')
    expect(parsed.skills['math.operations.addSub']).toBeDefined()
    expect(parsed.skills['math.operations.addSub'].status).toBe('in-progress')
  })

  it('maps "mastered" finding status to "mastered" skill status', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => null })

    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc.short-a', status: 'mastered', evidence: 'Solid' },
    ]

    await updateSkillMapFromFindings('fam1', 'child1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['reading.phonics.cvc'].status).toBe('mastered')
  })

  it('never downgrades: mastered stays mastered even if new finding is emerging', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child1',
        skills: {
          'reading.phonics.cvc': {
            nodeId: 'reading.phonics.cvc',
            status: 'mastered',
            source: 'evaluation',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    })

    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc.short-o', status: 'emerging', evidence: 'Struggles' },
    ]

    await updateSkillMapFromFindings('fam1', 'child1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['reading.phonics.cvc'].status).toBe('mastered')
  })

  it('never downgrades: in-progress stays in-progress for another in-progress finding', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child1',
        skills: {
          'reading.phonics.cvc': {
            nodeId: 'reading.phonics.cvc',
            status: 'in-progress',
            source: 'evaluation',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    })

    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc.short-a', status: 'emerging', evidence: 'Still working' },
    ]

    await updateSkillMapFromFindings('fam1', 'child1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['reading.phonics.cvc'].status).toBe('in-progress')
    // updatedAt should NOT change since the status didn't upgrade
    expect(parsed.skills['reading.phonics.cvc'].updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('upgrades in-progress to mastered', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child1',
        skills: {
          'reading.phonics.cvc': {
            nodeId: 'reading.phonics.cvc',
            status: 'in-progress',
            source: 'evaluation',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    })

    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc.short-a', status: 'mastered', evidence: 'Nailed it', testedAt: '2026-02-15T10:00:00.000Z' },
    ]

    await updateSkillMapFromFindings('fam1', 'child1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['reading.phonics.cvc'].status).toBe('mastered')
    expect(parsed.skills['reading.phonics.cvc'].updatedAt).toBe('2026-02-15T10:00:00.000Z')
  })

  it('skips findings that cannot be mapped to a curriculum node', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => null })

    const findings: EvaluationFinding[] = [
      { skill: 'unmappable.skill.tag', status: 'mastered', evidence: 'test' },
      { skill: 'phonics.cvc.short-a', status: 'emerging', evidence: 'test' },
    ]

    await updateSkillMapFromFindings('fam1', 'child1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    // Only the mappable finding should appear
    expect(Object.keys(parsed.skills)).toHaveLength(1)
    expect(parsed.skills['reading.phonics.cvc']).toBeDefined()
  })

  it('preserves existing skills not touched by new findings', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        childId: 'child1',
        skills: {
          'math.operations.addSub': {
            nodeId: 'math.operations.addSub',
            status: 'mastered',
            source: 'evaluation',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    })

    const findings: EvaluationFinding[] = [
      { skill: 'phonics.cvc.short-a', status: 'emerging', evidence: 'test' },
    ]

    await updateSkillMapFromFindings('fam1', 'child1', findings)

    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.skills['math.operations.addSub'].status).toBe('mastered')
    expect(parsed.skills['reading.phonics.cvc']).toBeDefined()
  })
})

describe('markProgramCompleteOnSkillMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetDoc.mockResolvedValue(undefined)
  })

  it('does nothing when familyId is empty', async () => {
    await markProgramCompleteOnSkillMap('', 'child1', 'reading-eggs')
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('does nothing when childId is empty', async () => {
    await markProgramCompleteOnSkillMap('fam1', '', 'reading-eggs')
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('does nothing when programId is empty', async () => {
    await markProgramCompleteOnSkillMap('fam1', 'child1', '')
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('marks linked nodes as mastered for a known program', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => null })

    await markProgramCompleteOnSkillMap('fam1', 'child1', 'reading-eggs')

    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    const [, data] = mockSetDoc.mock.calls[0]
    const parsed = JSON.parse(JSON.stringify(data))

    // reading-eggs should map to several nodes
    const skills = Object.values(parsed.skills) as Array<{ status: string; source: string }>
    expect(skills.length).toBeGreaterThan(0)
    expect(skills.every((s) => s.status === 'mastered')).toBe(true)
    expect(skills.every((s) => s.source === 'program')).toBe(true)
  })

  it('does nothing for an unknown program', async () => {
    await markProgramCompleteOnSkillMap('fam1', 'child1', 'unknown-program-xyz')
    expect(mockSetDoc).not.toHaveBeenCalled()
  })
})
