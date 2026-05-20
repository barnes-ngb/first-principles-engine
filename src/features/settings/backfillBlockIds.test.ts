import { describe, it, expect } from 'vitest'
import type { ConceptualBlock } from '../../core/types/evaluation'
import { backfillBlocks } from './backfillBlockIds'

const legacyBlock = (overrides: Partial<ConceptualBlock> = {}): ConceptualBlock => ({
  name: 'Short vowel i vs e',
  affectedSkills: ['phonics.short-vowels'],
  recommendation: 'ADDRESS_NOW',
  rationale: 'From guided eval pattern detection',
  detectedAt: '2026-03-15T10:00:00Z',
  evaluationSessionId: 'session-abc',
  ...overrides,
})

describe('backfillBlocks', () => {
  it('adds id and lifecycle defaults to legacy blocks missing an id', () => {
    const blocks = [legacyBlock()]
    const { blocks: next, updatedCount } = backfillBlocks(blocks)

    expect(updatedCount).toBe(1)
    expect(next[0].id).toBe('short-vowel-i-vs-e')
    expect(next[0].firstDetectedAt).toBe('2026-03-15T10:00:00Z')
    expect(next[0].sessionCount).toBe(1)
    expect(next[0].source).toBe('evaluation')
    // Preserved fields
    expect(next[0].name).toBe('Short vowel i vs e')
    expect(next[0].recommendation).toBe('ADDRESS_NOW')
    expect(next[0].detectedAt).toBe('2026-03-15T10:00:00Z')
  })

  it('is idempotent — blocks that already have an id are untouched', () => {
    const alreadyIded = legacyBlock({
      id: 'short-vowel-i-vs-e',
      firstDetectedAt: '2026-03-15T10:00:00Z',
      sessionCount: 3,
      source: 'quest',
    })
    const { blocks: next, updatedCount } = backfillBlocks([alreadyIded])

    expect(updatedCount).toBe(0)
    expect(next[0]).toBe(alreadyIded) // same reference
    expect(next[0].sessionCount).toBe(3)
    expect(next[0].source).toBe('quest')
  })

  it('handles a mix of legacy and already-backfilled blocks', () => {
    const legacy = legacyBlock({ name: 'CVC blending', detectedAt: '2026-02-01T12:00:00Z' })
    const ided = legacyBlock({
      id: 'digraph-oo',
      name: 'Digraph oo',
      source: 'scan',
      sessionCount: 2,
    })
    const { blocks: next, updatedCount } = backfillBlocks([legacy, ided])

    expect(updatedCount).toBe(1)
    expect(next).toHaveLength(2)
    expect(next[0].id).toBe('cvc-blending')
    expect(next[0].source).toBe('evaluation')
    expect(next[1].id).toBe('digraph-oo')
    expect(next[1].source).toBe('scan')
    expect(next[1].sessionCount).toBe(2)
  })

  it('returns updatedCount 0 and unchanged array when blocks is empty', () => {
    const { blocks: next, updatedCount } = backfillBlocks([])
    expect(updatedCount).toBe(0)
    expect(next).toEqual([])
  })
})
