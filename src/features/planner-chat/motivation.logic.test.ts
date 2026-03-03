import { describe, expect, it } from 'vitest'
import type { SkillSnapshot } from '../../core/types/domain'
import { SkillLevel } from '../../core/types/enums'
import {
  buildAllScripts,
  DEFAULT_START_ANYWAY_SCRIPTS,
  findStartAnywayScript,
  getDifficultyTrend,
} from './motivation.logic'
import type { DailyDifficultyRating } from './motivation.logic'

const baseSnapshot: SkillSnapshot = {
  childId: 'c1',
  prioritySkills: [
    { tag: 'reading.cvcBlend', label: 'CVC', level: SkillLevel.Emerging },
  ],
  supports: [],
  stopRules: [
    {
      label: 'Custom refusal rule',
      trigger: 'Refuses to start reading',
      action: 'Switch to letter tiles for 3 minutes',
    },
  ],
  evidenceDefinitions: [],
}

describe('DEFAULT_START_ANYWAY_SCRIPTS', () => {
  it('has at least 4 default scripts', () => {
    expect(DEFAULT_START_ANYWAY_SCRIPTS.length).toBeGreaterThanOrEqual(4)
  })

  it('all scripts have required fields', () => {
    for (const script of DEFAULT_START_ANYWAY_SCRIPTS) {
      expect(script.trigger).toBeTruthy()
      expect(script.choices).toHaveLength(2)
      expect(script.timerMinutes).toBeGreaterThan(0)
      expect(typeof script.firstRepTogether).toBe('boolean')
      expect(script.winReward).toBeTruthy()
      expect(script.skillTags.length).toBeGreaterThan(0)
    }
  })
})

describe('findStartAnywayScript', () => {
  it('matches custom stop rules first', () => {
    const result = findStartAnywayScript('He refuses to start reading today', baseSnapshot)
    expect(result).not.toBeNull()
    expect(result!.trigger).toContain('Refuses to start reading')
  })

  it('matches default scripts by keyword', () => {
    const result = findStartAnywayScript('refusal and complaining for over 60 seconds', null)
    expect(result).not.toBeNull()
    expect(result!.choices).toHaveLength(2)
  })

  it('returns a fallback script when no match', () => {
    const result = findStartAnywayScript('completely unique trigger xyz', null)
    expect(result).not.toBeNull()
    expect(result!.timerMinutes).toBe(5)
    expect(result!.firstRepTogether).toBe(true)
  })
})

describe('buildAllScripts', () => {
  it('includes both defaults and custom stop rules', () => {
    const scripts = buildAllScripts(baseSnapshot)
    expect(scripts.length).toBeGreaterThan(DEFAULT_START_ANYWAY_SCRIPTS.length)
    // Custom stop rule should be added
    const customScript = scripts.find((s) => s.trigger.includes('Refuses to start reading'))
    expect(customScript).toBeDefined()
  })

  it('returns defaults when no snapshot', () => {
    const scripts = buildAllScripts(null)
    expect(scripts).toHaveLength(DEFAULT_START_ANYWAY_SCRIPTS.length)
  })

  it('does not duplicate overlapping triggers', () => {
    const snapshotWithOverlap: SkillSnapshot = {
      ...baseSnapshot,
      stopRules: [
        { label: 'Refusal', trigger: 'Refusal/complaining', action: 'Use choice card' },
      ],
    }
    const scripts = buildAllScripts(snapshotWithOverlap)
    // Should not add duplicate since "Refusal/complaining" overlaps default
    const refusalScripts = scripts.filter((s) =>
      s.trigger.toLowerCase().includes('refusal'),
    )
    expect(refusalScripts.length).toBeLessThanOrEqual(2)
  })
})

describe('getDifficultyTrend', () => {
  it('returns stable with fewer than 3 ratings', () => {
    const ratings: DailyDifficultyRating[] = [
      { date: '2026-02-14', childId: 'c1', rating: 3 },
      { date: '2026-02-15', childId: 'c1', rating: 4 },
    ]
    expect(getDifficultyTrend(ratings)).toBe('stable')
  })

  it('returns improving when recent ratings are lower', () => {
    const ratings: DailyDifficultyRating[] = [
      { date: '2026-02-10', childId: 'c1', rating: 4 },
      { date: '2026-02-11', childId: 'c1', rating: 5 },
      { date: '2026-02-12', childId: 'c1', rating: 4 },
      { date: '2026-02-13', childId: 'c1', rating: 3 },
      { date: '2026-02-14', childId: 'c1', rating: 2 },
      { date: '2026-02-15', childId: 'c1', rating: 3 },
    ]
    expect(getDifficultyTrend(ratings)).toBe('improving')
  })

  it('returns declining when recent ratings are higher', () => {
    const ratings: DailyDifficultyRating[] = [
      { date: '2026-02-10', childId: 'c1', rating: 2 },
      { date: '2026-02-11', childId: 'c1', rating: 1 },
      { date: '2026-02-12', childId: 'c1', rating: 2 },
      { date: '2026-02-13', childId: 'c1', rating: 4 },
      { date: '2026-02-14', childId: 'c1', rating: 5 },
      { date: '2026-02-15', childId: 'c1', rating: 4 },
    ]
    expect(getDifficultyTrend(ratings)).toBe('declining')
  })

  it('returns stable when ratings are consistent', () => {
    const ratings: DailyDifficultyRating[] = [
      { date: '2026-02-10', childId: 'c1', rating: 3 },
      { date: '2026-02-11', childId: 'c1', rating: 3 },
      { date: '2026-02-12', childId: 'c1', rating: 3 },
      { date: '2026-02-13', childId: 'c1', rating: 3 },
      { date: '2026-02-14', childId: 'c1', rating: 3 },
      { date: '2026-02-15', childId: 'c1', rating: 3 },
    ]
    expect(getDifficultyTrend(ratings)).toBe('stable')
  })
})
