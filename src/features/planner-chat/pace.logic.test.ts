import { describe, expect, it } from 'vitest'
import type { WorkbookConfig } from '../../core/types'
import { PaceStatus, SubjectBucket } from '../../core/types/enums'
import {
  buildPaceSuggestion,
  calculateAllPaces,
  calculatePace,
} from './pace.logic'

const baseConfig: WorkbookConfig = {
  childId: 'c1',
  name: 'Math Grade 2',
  subjectBucket: SubjectBucket.Math,
  totalUnits: 100,
  currentPosition: 40,
  unitLabel: 'lesson',
  targetFinishDate: '2026-05-30',
  schoolDaysPerWeek: 4,
}

describe('calculatePace', () => {
  it('shows current when partially through workbook', () => {
    const result = calculatePace(baseConfig)
    expect(result.workbookName).toBe('Math Grade 2')
    expect(result.status).toBe(PaceStatus.Current)
    expect(result.coverageText).toBe('Lesson 40 of 100 covered')
  })

  it('shows explored when workbook is complete', () => {
    const completed: WorkbookConfig = { ...baseConfig, currentPosition: 100 }
    const result = calculatePace(completed)
    expect(result.status).toBe(PaceStatus.Explored)
    expect(result.coverageText).toBe('Complete!')
  })

  it('shows not started when position is 0', () => {
    const notStarted: WorkbookConfig = { ...baseConfig, currentPosition: 0 }
    const result = calculatePace(notStarted)
    expect(result.status).toBe(PaceStatus.NotStarted)
    expect(result.coverageText).toBe('Not started')
  })

  it('shows current with position text when totalUnits is 0', () => {
    const noTotal: WorkbookConfig = { ...baseConfig, totalUnits: 0, currentPosition: 15 }
    const result = calculatePace(noTotal)
    expect(result.status).toBe(PaceStatus.Current)
    expect(result.coverageText).toBe('Lesson 15 reached')
  })

  it('shows not started when both totalUnits and position are 0', () => {
    const empty: WorkbookConfig = { ...baseConfig, totalUnits: 0, currentPosition: 0 }
    const result = calculatePace(empty)
    expect(result.status).toBe(PaceStatus.NotStarted)
  })

  it('returns correct currentPosition and totalUnits', () => {
    const result = calculatePace(baseConfig)
    expect(result.currentPosition).toBe(40)
    expect(result.totalUnits).toBe(100)
    expect(result.unitLabel).toBe('lesson')
  })
})

describe('buildPaceSuggestion', () => {
  it('returns appropriate text for each status', () => {
    expect(buildPaceSuggestion(PaceStatus.Explored, 0, 0, 'lesson')).toContain('covered')
    expect(buildPaceSuggestion(PaceStatus.Current, 0, 0, 'lesson')).toContain('comfortable pace')
    expect(buildPaceSuggestion(PaceStatus.Upcoming, 0, 0, 'lesson')).toContain('No rush')
    expect(buildPaceSuggestion(PaceStatus.NotStarted, 0, 0, 'page')).toContain('Jump in')
  })
})

describe('calculateAllPaces', () => {
  it('calculates coverage for multiple workbooks', () => {
    const configs: WorkbookConfig[] = [
      baseConfig,
      { ...baseConfig, name: 'Reading ELA', subjectBucket: SubjectBucket.Reading, totalUnits: 50, currentPosition: 20 },
    ]
    const results = calculateAllPaces(configs)
    expect(results).toHaveLength(2)
    expect(results[0].workbookName).toBe('Math Grade 2')
    expect(results[1].workbookName).toBe('Reading ELA')
    expect(results[1].coverageText).toBe('Lesson 20 of 50 covered')
  })
})
