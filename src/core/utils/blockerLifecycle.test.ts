import { describe, it, expect } from 'vitest'
import type { ConceptualBlock } from '../types/evaluation'
import { generateBlockId, mergeBlock, effectiveStatus } from './blockerLifecycle'

describe('generateBlockId', () => {
  it('slugifies a multi-word skill name', () => {
    expect(generateBlockId('Short vowel i vs e discrimination')).toBe(
      'short-vowel-i-vs-e-discrimination',
    )
  })

  it('is stable (same input → same id)', () => {
    const a = generateBlockId('CVC blending')
    const b = generateBlockId('CVC blending')
    expect(a).toBe(b)
    expect(a).toBe('cvc-blending')
  })

  it('collapses whitespace, punctuation, and casing', () => {
    expect(generateBlockId('  Short-I / E!  ')).toBe('short-i-e')
  })

  it('returns a non-empty id for empty input', () => {
    expect(generateBlockId('')).toBe('unknown-block')
    expect(generateBlockId('    ')).toBe('unknown-block')
    expect(generateBlockId('!!!')).toBe('unknown-block')
  })

  it('truncates overly long inputs', () => {
    const long = 'a'.repeat(500)
    expect(generateBlockId(long).length).toBeLessThanOrEqual(80)
  })
})

describe('mergeBlock — new block insertion', () => {
  it('appends a new block when no matching ID exists', () => {
    const existing: ConceptualBlock[] = []
    const result = mergeBlock(existing, {
      id: 'short-i-vs-e',
      name: 'Short vowel i vs e',
      source: 'quest',
      rationale: 'Got bed vs bid wrong twice',
      evidence: '2 wrong at short-i vs short-e',
      specificWords: ['bed', 'bid'],
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('short-i-vs-e')
    expect(result[0].sessionCount).toBe(1)
    expect(result[0].source).toBe('quest')
    expect(result[0].lastSource).toBe('quest')
    expect(result[0].firstDetectedAt).toBeDefined()
    expect(result[0].lastReinforcedAt).toBeDefined()
    expect(result[0].status).toBe('ADDRESS_NOW')
    expect(result[0].recommendation).toBe('ADDRESS_NOW')
  })

  it('does not mutate the input array', () => {
    const existing: ConceptualBlock[] = []
    mergeBlock(existing, { id: 'x', name: 'X' })
    expect(existing).toHaveLength(0)
  })

  it('defaults DEFER status correctly', () => {
    const result = mergeBlock([], {
      id: 'working-memory',
      name: 'Working Memory',
      status: 'DEFER',
      deferNote: 'Revisit at age 8',
    })
    expect(result[0].status).toBe('DEFER')
    expect(result[0].recommendation).toBe('DEFER')
    expect(result[0].deferNote).toBe('Revisit at age 8')
  })
})

describe('mergeBlock — reinforcement', () => {
  const baseBlock: ConceptualBlock = {
    id: 'short-i-vs-e',
    name: 'Short vowel i vs e',
    affectedSkills: ['phonics.short-vowels'],
    recommendation: 'ADDRESS_NOW',
    status: 'ADDRESS_NOW',
    rationale: 'Initial detection',
    detectedAt: '2026-04-01T12:00:00Z',
    firstDetectedAt: '2026-04-01T12:00:00Z',
    lastReinforcedAt: '2026-04-01T12:00:00Z',
    sessionCount: 1,
    source: 'evaluation',
    lastSource: 'evaluation',
    evaluationSessionId: 'session-1',
    evidence: 'Initial evidence',
    specificWords: ['bed', 'bid'],
  }

  it('increments sessionCount when an existing block is reinforced', () => {
    const result = mergeBlock([baseBlock], {
      id: 'short-i-vs-e',
      source: 'quest',
      evidence: 'Quest session reinforcement',
      specificWords: ['ten', 'tin'],
    })
    expect(result).toHaveLength(1)
    expect(result[0].sessionCount).toBe(2)
  })

  it('refreshes lastReinforcedAt and lastSource', () => {
    const result = mergeBlock([baseBlock], {
      id: 'short-i-vs-e',
      source: 'quest',
      lastReinforcedAt: '2026-04-15T09:00:00Z',
    })
    expect(result[0].lastReinforcedAt).toBe('2026-04-15T09:00:00Z')
    expect(result[0].lastSource).toBe('quest')
    // source (original) is preserved
    expect(result[0].source).toBe('evaluation')
    // firstDetectedAt is preserved
    expect(result[0].firstDetectedAt).toBe('2026-04-01T12:00:00Z')
  })

  it('merges specificWords without duplicates', () => {
    const result = mergeBlock([baseBlock], {
      id: 'short-i-vs-e',
      source: 'quest',
      specificWords: ['ten', 'tin', 'bed'], // bed already present
    })
    expect(result[0].specificWords).toEqual(['bed', 'bid', 'ten', 'tin'])
  })

  it('appends evidence without duplicating identical strings', () => {
    const result = mergeBlock([baseBlock], {
      id: 'short-i-vs-e',
      source: 'quest',
      evidence: 'Quest: got 2 wrong',
    })
    expect(result[0].evidence).toContain('Initial evidence')
    expect(result[0].evidence).toContain('Quest: got 2 wrong')

    // Re-adding identical evidence is a no-op
    const result2 = mergeBlock(result, {
      id: 'short-i-vs-e',
      evidence: 'Quest: got 2 wrong',
    })
    expect((result2[0].evidence?.match(/Quest: got 2 wrong/g) ?? []).length).toBe(1)
  })

  it('regresses RESOLVING to ADDRESS_NOW on new wrong-answer signal', () => {
    const resolving: ConceptualBlock = { ...baseBlock, status: 'RESOLVING' }
    const result = mergeBlock([resolving], {
      id: 'short-i-vs-e',
      status: 'ADDRESS_NOW',
      source: 'quest',
    })
    expect(result[0].status).toBe('ADDRESS_NOW')
  })

  it('does not change RESOLVED blocks on reinforcement', () => {
    const resolved: ConceptualBlock = {
      ...baseBlock,
      status: 'RESOLVED',
      resolvedAt: '2026-04-10T10:00:00Z',
    }
    const result = mergeBlock([resolved], {
      id: 'short-i-vs-e',
      status: 'RESOLVING',
      source: 'quest',
    })
    // RESOLVED stays RESOLVED
    expect(result[0].status).toBe('RESOLVED')
  })

  it('never removes blocks', () => {
    const two: ConceptualBlock[] = [
      baseBlock,
      { ...baseBlock, id: 'cvc-blending', name: 'CVC blending' },
    ]
    const result = mergeBlock(two, {
      id: 'short-i-vs-e',
      status: 'RESOLVED',
    })
    expect(result).toHaveLength(2)
  })

  it('preserves other blocks in the array', () => {
    const other: ConceptualBlock = {
      ...baseBlock,
      id: 'digraph-oo',
      name: 'Digraph /oo/',
    }
    const result = mergeBlock([baseBlock, other], {
      id: 'short-i-vs-e',
      source: 'quest',
    })
    expect(result.find((b) => b.id === 'digraph-oo')).toBeTruthy()
  })
})

describe('effectiveStatus', () => {
  it('prefers new status over legacy recommendation', () => {
    const block: ConceptualBlock = {
      name: 'x',
      affectedSkills: [],
      recommendation: 'ADDRESS_NOW',
      status: 'RESOLVING',
      rationale: '',
      detectedAt: '',
      evaluationSessionId: '',
    }
    expect(effectiveStatus(block)).toBe('RESOLVING')
  })

  it('falls back to recommendation when status is absent', () => {
    const block: ConceptualBlock = {
      name: 'x',
      affectedSkills: [],
      recommendation: 'DEFER',
      rationale: '',
      detectedAt: '',
      evaluationSessionId: '',
    }
    expect(effectiveStatus(block)).toBe('DEFER')
  })
})
