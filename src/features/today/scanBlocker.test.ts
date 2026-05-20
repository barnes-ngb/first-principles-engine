import { describe, it, expect } from 'vitest'
import type { WorksheetScanResult } from '../../core/types'
import { detectBlockersFromScan } from './scanBlocker'

function mkScan(overrides: Partial<WorksheetScanResult> = {}): WorksheetScanResult {
  return {
    pageType: 'worksheet',
    subject: 'Reading',
    specificTopic: 'Short vowel discrimination',
    skillsTargeted: [],
    estimatedDifficulty: 'appropriate',
    recommendation: 'do',
    recommendationReason: '',
    estimatedMinutes: 15,
    teacherNotes: '',
    ...overrides,
  }
}

describe('detectBlockersFromScan — no blocker cases', () => {
  it('recommendation "do" does not create a blocker', () => {
    const blocks = detectBlockersFromScan(
      mkScan({ recommendation: 'do', estimatedDifficulty: 'appropriate' }),
    )
    expect(blocks).toHaveLength(0)
  })

  it('recommendation "quick-review" does not create a blocker', () => {
    const blocks = detectBlockersFromScan(
      mkScan({ recommendation: 'quick-review', estimatedDifficulty: 'easy' }),
    )
    expect(blocks).toHaveLength(0)
  })

  it('appropriate difficulty + no behind skills → no blocker', () => {
    const blocks = detectBlockersFromScan(mkScan({ estimatedDifficulty: 'appropriate' }))
    expect(blocks).toHaveLength(0)
  })
})

describe('detectBlockersFromScan — blocker cases', () => {
  it('too-hard estimatedDifficulty creates a topic blocker', () => {
    const blocks = detectBlockersFromScan(
      mkScan({
        estimatedDifficulty: 'too-hard',
        specificTopic: 'Digraph /oo/',
        curriculumDetected: {
          provider: 'gatb',
          name: 'GATB LA',
          lessonNumber: 27,
          pageNumber: null,
          levelDesignation: null,
        },
      }),
      { scanId: 'scan-abc' },
    )
    expect(blocks).toHaveLength(1)
    // Topic-level blocker ID is slugified from subject + specificTopic.
    expect(blocks[0].id).toBe('reading-digraph-oo')
    expect(blocks[0].source).toBe('scan')
    expect(blocks[0].status).toBe('ADDRESS_NOW')
    expect(blocks[0].evidence).toContain('GATB LA')
    expect(blocks[0].evidence).toContain('Lesson 27')
    expect(blocks[0].evaluationSessionId).toBe('scan-abc')
  })

  it('recommendation "skip" creates a topic blocker even if difficulty is appropriate', () => {
    const blocks = detectBlockersFromScan(
      mkScan({ recommendation: 'skip', specificTopic: 'Complex multiplication' }),
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0].status).toBe('ADDRESS_NOW')
  })

  it('behind-aligned skills produce one blocker each', () => {
    const blocks = detectBlockersFromScan(
      mkScan({
        estimatedDifficulty: 'challenging',
        recommendation: 'modify',
        skillsTargeted: [
          { skill: 'phonics.short-i', level: 'practice', alignsWithSnapshot: 'behind' },
          { skill: 'phonics.short-e', level: 'practice', alignsWithSnapshot: 'behind' },
          { skill: 'phonics.short-a', level: 'practice', alignsWithSnapshot: 'at-level' },
        ],
      }),
    )
    expect(blocks).toHaveLength(2)
    expect(blocks.map((b) => b.id).sort()).toEqual(['phonics-short-e', 'phonics-short-i'])
    for (const b of blocks) {
      expect(b.source).toBe('scan')
      expect(b.status).toBe('ADDRESS_NOW')
    }
  })

  it('behind-aligned skills override the topic fallback', () => {
    const blocks = detectBlockersFromScan(
      mkScan({
        estimatedDifficulty: 'too-hard',
        specificTopic: 'Vowels',
        skillsTargeted: [
          { skill: 'phonics.short-i', level: 'practice', alignsWithSnapshot: 'behind' },
        ],
      }),
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0].id).toBe('phonics-short-i')
  })

  it('challenging difficulty + no skills creates topic blocker', () => {
    const blocks = detectBlockersFromScan(
      mkScan({ estimatedDifficulty: 'challenging', recommendation: 'modify' }),
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0].status).toBe('ADDRESS_NOW')
  })
})
