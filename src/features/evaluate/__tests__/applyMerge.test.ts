import { describe, it, expect } from 'vitest'
import type { ConceptualBlock } from '../../../core/types/evaluation'
import { mergeBlock } from '../../../core/utils/blockerLifecycle'

// Simulates EvaluateChatPage.handleSaveAndApply block merge logic to prove
// pattern-analysis results are merged into the existing snapshot array
// rather than overwriting it.

function applyEvalMergeFix(
  existingBlocks: ConceptualBlock[],
  incomingFromPatternAnalysis: Partial<ConceptualBlock>[],
): ConceptualBlock[] {
  let merged: ConceptualBlock[] = existingBlocks
  for (const b of incomingFromPatternAnalysis) {
    if (!b.id) continue
    merged = mergeBlock(merged, b as Parameters<typeof mergeBlock>[1])
  }
  return merged
}

describe('EvaluateChatPage Apply — blocks merge instead of overwrite', () => {
  const questBlock: ConceptualBlock = {
    id: 'phonics-short-i-vs-e',
    name: 'Short vowel i vs e',
    affectedSkills: ['phonics.short-i-vs-e'],
    recommendation: 'ADDRESS_NOW',
    status: 'ADDRESS_NOW',
    rationale: 'Detected by quest session',
    detectedAt: '2026-04-10T10:00:00Z',
    firstDetectedAt: '2026-04-10T10:00:00Z',
    lastReinforcedAt: '2026-04-10T10:00:00Z',
    sessionCount: 2,
    source: 'quest',
    lastSource: 'quest',
    evaluationSessionId: 'quest-session-1',
  }

  const scanBlock: ConceptualBlock = {
    id: 'reading-digraph-oo',
    name: 'Digraph /oo/',
    affectedSkills: ['phonics.digraph-oo'],
    recommendation: 'ADDRESS_NOW',
    status: 'ADDRESS_NOW',
    rationale: 'Too-hard scan of GATB Lesson 27',
    detectedAt: '2026-04-14T09:00:00Z',
    firstDetectedAt: '2026-04-14T09:00:00Z',
    lastReinforcedAt: '2026-04-14T09:00:00Z',
    sessionCount: 1,
    source: 'scan',
    lastSource: 'scan',
    evaluationSessionId: 'scan-42',
  }

  it('preserves existing non-overlapping blocks from other writers', () => {
    const existing = [questBlock, scanBlock]

    // Pattern analysis surfaces a different, evaluation-derived block.
    const patternAnalysisBlocks: Partial<ConceptualBlock>[] = [
      {
        id: 'phonological-awareness',
        name: 'Phonological awareness',
        affectedSkills: ['phonics.phonemic'],
        status: 'ADDRESS_NOW',
        recommendation: 'ADDRESS_NOW',
        rationale: 'Multiple sessions show sound-manipulation struggles',
        strategies: ['Daily phoneme segmentation'],
        source: 'evaluation',
      },
    ]

    const result = applyEvalMergeFix(existing, patternAnalysisBlocks)

    // All three blocks present.
    expect(result).toHaveLength(3)
    expect(result.find((b) => b.id === 'phonics-short-i-vs-e')).toBeTruthy()
    expect(result.find((b) => b.id === 'reading-digraph-oo')).toBeTruthy()
    expect(result.find((b) => b.id === 'phonological-awareness')).toBeTruthy()
  })

  it('reinforces an existing block when pattern analysis surfaces the same id', () => {
    const existing = [questBlock]
    const patternAnalysisBlocks: Partial<ConceptualBlock>[] = [
      {
        id: 'phonics-short-i-vs-e',
        name: 'Short vowel i vs e',
        affectedSkills: ['phonics.short-i-vs-e'],
        status: 'ADDRESS_NOW',
        rationale: 'Evaluation confirms the pattern',
        source: 'evaluation',
      },
    ]
    const result = applyEvalMergeFix(existing, patternAnalysisBlocks)
    expect(result).toHaveLength(1)
    // sessionCount bumped, source preserved, lastSource refreshed.
    expect(result[0].sessionCount).toBe(3)
    expect(result[0].source).toBe('quest')
    expect(result[0].lastSource).toBe('evaluation')
  })

  it('never removes blocks when pattern analysis returns an empty list', () => {
    const existing = [questBlock, scanBlock]
    const result = applyEvalMergeFix(existing, [])
    expect(result).toHaveLength(2)
    expect(result).toEqual(existing)
  })
})
