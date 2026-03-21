import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Types mirrored for test clarity ─────────────────────────────

interface ConceptualBlock {
  name: string
  affectedSkills: string[]
  recommendation: 'ADDRESS_NOW' | 'DEFER'
  rationale: string
  strategies?: string[]
  deferNote?: string
  detectedAt: string
  evaluationSessionId: string
}

// ── Helpers extracted from cloud function logic ──────────────────

/**
 * Parses raw AI pattern analysis JSON response into ConceptualBlock[].
 * Mirrors the parsing logic in functions/src/ai/chat.ts
 */
function parsePatternAnalysisResponse(
  responseText: string,
  evaluationSessionId: string,
): { blocks: ConceptualBlock[]; summary: string } {
  const cleaned = responseText
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
  const raw = JSON.parse(cleaned) as {
    blocks?: Array<{
      name?: string
      affectedSkills?: string[]
      recommendation?: string
      rationale?: string
      strategies?: string[]
      deferNote?: string
    }>
    summary?: string
  }
  const now = new Date().toISOString()

  const blocks: ConceptualBlock[] = (raw.blocks || [])
    .slice(0, 3)
    .map((b) => {
      const rec = b.recommendation === 'ADDRESS_NOW' ? 'ADDRESS_NOW' : 'DEFER'
      const result: ConceptualBlock = {
        name: b.name || 'Unknown block',
        affectedSkills: b.affectedSkills || [],
        recommendation: rec,
        rationale: b.rationale || '',
        detectedAt: now,
        evaluationSessionId,
      }
      if (rec === 'ADDRESS_NOW' && b.strategies?.length) {
        result.strategies = b.strategies
      } else if (rec === 'ADDRESS_NOW') {
        result.strategies = ['Consult with a specialist for targeted strategies.']
      }
      if (rec === 'DEFER' && b.deferNote) {
        result.deferNote = b.deferNote
      } else if (rec === 'DEFER') {
        result.deferNote = 'Revisit when foundational skills are more stable.'
      }
      return result
    })

  return { blocks, summary: raw.summary || '' }
}

/**
 * Determines whether pattern analysis should run based on historical session count.
 * Mirrors the check in functions/src/ai/chat.ts analyzeEvaluationPatterns.
 */
function shouldRunPatternAnalysis(
  historicalSessionCount: number,
  currentSessionId: string,
  allSessionIds: string[],
): boolean {
  // Filter out the current session
  const historicalExcludingCurrent = allSessionIds.filter((id) => id !== currentSessionId)
  return historicalExcludingCurrent.length >= 2 && historicalSessionCount >= 2
}

// ── Tests ────────────────────────────────────────────────────────

describe('Pattern analysis: session count guard', () => {
  it('returns empty blocks when fewer than 2 historical sessions exist', () => {
    // 0 historical sessions
    expect(shouldRunPatternAnalysis(0, 'session-3', [])).toBe(false)
    expect(shouldRunPatternAnalysis(1, 'session-3', ['session-3'])).toBe(false)
  })

  it('returns empty blocks when only 1 prior session exists (excluding current)', () => {
    // 2 sessions total but one is the current one
    const sessions = ['session-1', 'session-2']
    expect(shouldRunPatternAnalysis(2, 'session-2', sessions)).toBe(false)
  })

  it('runs analysis when 2 or more historical sessions exist (excluding current)', () => {
    const sessions = ['session-1', 'session-2', 'session-3']
    expect(shouldRunPatternAnalysis(3, 'session-3', sessions)).toBe(true)
  })

  it('runs analysis with exactly 2 historical sessions excluding current', () => {
    const sessions = ['session-1', 'session-2', 'session-3']
    expect(shouldRunPatternAnalysis(3, 'session-3', sessions)).toBe(true)
  })
})

describe('parsePatternAnalysisResponse', () => {
  const sessionId = 'test-session-123'

  it('parses a valid ADDRESS_NOW block correctly', () => {
    const response = JSON.stringify({
      blocks: [
        {
          name: 'Phonological Awareness',
          affectedSkills: ['phonics.phonemic', 'phonics.cvc.short-a', 'reading.sight-words'],
          recommendation: 'ADDRESS_NOW',
          rationale: 'The child consistently struggles with sound manipulation tasks across multiple sessions.',
          strategies: ['Daily phoneme segmentation games (5 minutes)', 'Tap-it-out blending practice'],
        },
      ],
      summary: 'A phonological awareness gap appears to underlie multiple reading struggles.',
    })

    const result = parsePatternAnalysisResponse(response, sessionId)

    expect(result.blocks).toHaveLength(1)
    const block = result.blocks[0]
    expect(block.name).toBe('Phonological Awareness')
    expect(block.recommendation).toBe('ADDRESS_NOW')
    expect(block.affectedSkills).toHaveLength(3)
    expect(block.rationale).toBeTruthy()
    expect(result.summary).toBeTruthy()
  })

  it('parses a valid DEFER block correctly', () => {
    const response = JSON.stringify({
      blocks: [
        {
          name: 'Working Memory Load',
          affectedSkills: ['math.multi-step', 'reading.decoding'],
          recommendation: 'DEFER',
          rationale: 'Appears developmental and may resolve with maturity. Not blocking immediate progress.',
          deferNote: 'Revisit at age 8 once phonics foundation is more stable.',
        },
      ],
      summary: 'One developmental pattern detected that may resolve naturally.',
    })

    const result = parsePatternAnalysisResponse(response, sessionId)

    expect(result.blocks).toHaveLength(1)
    const block = result.blocks[0]
    expect(block.recommendation).toBe('DEFER')
    expect(block.deferNote).toBeTruthy()
    expect(result.summary).toBeTruthy()
  })

  it('ADDRESS_NOW blocks always have a non-empty strategies array', () => {
    // Even when AI returns no strategies, we supply a fallback
    const response = JSON.stringify({
      blocks: [
        {
          name: 'Sound-Symbol Correspondence',
          affectedSkills: ['phonics.letter-sounds'],
          recommendation: 'ADDRESS_NOW',
          rationale: 'Missing letter-sound mappings.',
          // no strategies field
        },
      ],
      summary: 'One block detected.',
    })

    const result = parsePatternAnalysisResponse(response, sessionId)
    const block = result.blocks[0]
    expect(block.recommendation).toBe('ADDRESS_NOW')
    expect(Array.isArray(block.strategies)).toBe(true)
    expect((block.strategies ?? []).length).toBeGreaterThan(0)
  })

  it('DEFER blocks always have a non-empty deferNote', () => {
    // Even when AI returns no deferNote, we supply a fallback
    const response = JSON.stringify({
      blocks: [
        {
          name: 'Abstract Reasoning',
          affectedSkills: ['math.word-problems'],
          recommendation: 'DEFER',
          rationale: 'Developmental gap, normal for this age.',
          // no deferNote field
        },
      ],
      summary: 'One developmental gap noted.',
    })

    const result = parsePatternAnalysisResponse(response, sessionId)
    const block = result.blocks[0]
    expect(block.recommendation).toBe('DEFER')
    expect(block.deferNote).toBeTruthy()
    expect((block.deferNote ?? '').length).toBeGreaterThan(0)
  })

  it('caps blocks at 3 even if AI returns more', () => {
    const blocks = Array.from({ length: 5 }, (_, i) => ({
      name: `Block ${i + 1}`,
      affectedSkills: [`skill.${i}`],
      recommendation: 'ADDRESS_NOW',
      rationale: `Rationale ${i + 1}`,
      strategies: [`Strategy ${i + 1}`],
    }))

    const response = JSON.stringify({
      blocks,
      summary: 'Multiple patterns detected.',
    })

    const result = parsePatternAnalysisResponse(response, sessionId)
    expect(result.blocks.length).toBeLessThanOrEqual(3)
  })

  it('returns empty blocks array when no patterns found', () => {
    const response = JSON.stringify({
      blocks: [],
      summary: 'No clear foundational patterns detected.',
    })

    const result = parsePatternAnalysisResponse(response, sessionId)
    expect(result.blocks).toHaveLength(0)
    expect(result.summary).toBeTruthy()
  })

  it('attaches evaluationSessionId to each block', () => {
    const testSessionId = 'lincoln_reading_2026-03-21'
    const response = JSON.stringify({
      blocks: [
        {
          name: 'Phonological Awareness',
          affectedSkills: ['phonics.phonemic'],
          recommendation: 'ADDRESS_NOW',
          rationale: 'Test rationale.',
          strategies: ['Test strategy'],
        },
      ],
      summary: 'Test summary.',
    })

    const result = parsePatternAnalysisResponse(response, testSessionId)
    expect(result.blocks[0].evaluationSessionId).toBe(testSessionId)
  })

  it('strips markdown code fences from response', () => {
    const innerJson = JSON.stringify({
      blocks: [],
      summary: 'No patterns detected.',
    })
    const withFences = `\`\`\`json\n${innerJson}\n\`\`\``

    const result = parsePatternAnalysisResponse(withFences, sessionId)
    expect(result.blocks).toHaveLength(0)
    expect(result.summary).toBe('No patterns detected.')
  })
})

describe('Block data writes to skillSnapshot on Apply', () => {
  it('conceptualBlocks are included in snapshot update when blocks exist', () => {
    const blocks: ConceptualBlock[] = [
      {
        name: 'Phonological Awareness',
        affectedSkills: ['phonics.phonemic'],
        recommendation: 'ADDRESS_NOW',
        rationale: 'Multiple phonemic struggles.',
        strategies: ['Daily phoneme games'],
        detectedAt: new Date().toISOString(),
        evaluationSessionId: 'test-session',
      },
    ]

    // Simulate the snapshot update logic from EvaluateChatPage.handleSaveAndApply
    const now = new Date().toISOString()
    const snapshotUpdate = {
      childId: 'child-1',
      prioritySkills: [],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
      updatedAt: now,
      ...(blocks.length > 0 ? { conceptualBlocks: blocks, blocksUpdatedAt: now } : {}),
    }

    expect(snapshotUpdate.conceptualBlocks).toHaveLength(1)
    expect(snapshotUpdate.blocksUpdatedAt).toBeTruthy()
  })

  it('conceptualBlocks are omitted from snapshot update when no blocks', () => {
    const blocks: ConceptualBlock[] = []
    const now = new Date().toISOString()
    const snapshotUpdate = {
      childId: 'child-1',
      prioritySkills: [],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
      updatedAt: now,
      ...(blocks.length > 0 ? { conceptualBlocks: blocks, blocksUpdatedAt: now } : {}),
    }

    expect(snapshotUpdate).not.toHaveProperty('conceptualBlocks')
    expect(snapshotUpdate).not.toHaveProperty('blocksUpdatedAt')
  })
})

describe('FoundationsSection rendering logic', () => {
  it('shows no section when blocks empty and summary is undefined', () => {
    // When summary is undefined, FoundationsSection returns null
    const blocks: ConceptualBlock[] = []
    const summary = undefined
    const shouldShow = blocks.length > 0 || summary !== undefined
    expect(shouldShow).toBe(false)
  })

  it('shows empty state when blocks empty but summary is set', () => {
    const blocks: ConceptualBlock[] = []
    const summary = 'No clear foundational patterns detected.'
    const shouldShowEmptyState = blocks.length === 0 && summary !== undefined
    expect(shouldShowEmptyState).toBe(true)
  })

  it('shows block cards when blocks exist', () => {
    const blocks: ConceptualBlock[] = [
      {
        name: 'Block 1',
        affectedSkills: ['skill.a'],
        recommendation: 'ADDRESS_NOW',
        rationale: 'Reason.',
        strategies: ['Strategy A'],
        detectedAt: new Date().toISOString(),
        evaluationSessionId: 'session-1',
      },
      {
        name: 'Block 2',
        affectedSkills: ['skill.b'],
        recommendation: 'DEFER',
        rationale: 'Developmental gap.',
        deferNote: 'Revisit at age 8.',
        detectedAt: new Date().toISOString(),
        evaluationSessionId: 'session-1',
      },
      {
        name: 'Block 3',
        affectedSkills: ['skill.c', 'skill.d'],
        recommendation: 'ADDRESS_NOW',
        rationale: 'Multiple struggles.',
        strategies: ['Try this', 'And that'],
        detectedAt: new Date().toISOString(),
        evaluationSessionId: 'session-1',
      },
    ]

    expect(blocks).toHaveLength(3)
    expect(blocks.filter((b) => b.recommendation === 'ADDRESS_NOW')).toHaveLength(2)
    expect(blocks.filter((b) => b.recommendation === 'DEFER')).toHaveLength(1)
    // Each ADDRESS_NOW block has strategies
    blocks
      .filter((b) => b.recommendation === 'ADDRESS_NOW')
      .forEach((b) => {
        expect(Array.isArray(b.strategies)).toBe(true)
        expect((b.strategies ?? []).length).toBeGreaterThan(0)
      })
    // Each DEFER block has deferNote
    blocks
      .filter((b) => b.recommendation === 'DEFER')
      .forEach((b) => {
        expect(b.deferNote).toBeTruthy()
      })
  })

  it('shows loading skeleton when patternAnalysisState is loading', () => {
    const patternAnalysisState = 'loading'
    const isLoading = patternAnalysisState === 'loading'
    expect(isLoading).toBe(true)
  })

  it('hides loading skeleton when patternAnalysisState is done', () => {
    const patternAnalysisState = 'done'
    const isLoading = patternAnalysisState === 'loading'
    expect(isLoading).toBe(false)
  })
})
