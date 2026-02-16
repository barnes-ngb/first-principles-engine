import { describe, expect, it } from 'vitest'
import type { WorkbookConfig } from '../../core/types/domain'
import { PaceStatus, SubjectBucket } from '../../core/types/enums'
import {
  buildPaceSuggestion,
  calculateAllPaces,
  calculatePace,
  weeksRemaining,
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

describe('weeksRemaining', () => {
  it('returns positive weeks when target is in the future', () => {
    const result = weeksRemaining('2026-02-16', '2026-05-30')
    expect(result).toBeGreaterThan(14)
    expect(result).toBeLessThan(16)
  })

  it('returns 0 when target is in the past', () => {
    const result = weeksRemaining('2026-06-01', '2026-05-30')
    expect(result).toBe(0)
  })

  it('returns 0 when target is today', () => {
    const result = weeksRemaining('2026-05-30', '2026-05-30')
    expect(result).toBe(0)
  })
})

describe('calculatePace', () => {
  const today = '2026-02-16'

  it('shows on track when planned matches required', () => {
    const result = calculatePace(baseConfig, today)
    expect(result.workbookName).toBe('Math Grade 2')
    expect(result.requiredPerWeek).toBeGreaterThan(0)
    // Without planned override, planned = required
    expect(result.status).toBe(PaceStatus.OnTrack)
  })

  it('shows ahead when planned exceeds required', () => {
    const result = calculatePace(baseConfig, today, 10)
    expect(result.status).toBe(PaceStatus.Ahead)
    expect(result.delta).toBeGreaterThan(0)
    expect(result.bufferDays).toBeGreaterThan(0)
  })

  it('shows behind when planned is too low', () => {
    // requiredPerWeek is ~4, so 3 is behind but not critical (within 30%)
    const result = calculatePace(baseConfig, today, 3)
    expect(result.status).toBe(PaceStatus.Behind)
    expect(result.delta).toBeLessThan(0)
  })

  it('shows critical when significantly behind', () => {
    const result = calculatePace(baseConfig, today, 0.5)
    expect(result.status).toBe(PaceStatus.Critical)
  })

  it('handles completed workbook', () => {
    const completed: WorkbookConfig = { ...baseConfig, currentPosition: 100 }
    const result = calculatePace(completed, today)
    expect(result.requiredPerWeek).toBe(0)
  })

  it('handles past target date with remaining units', () => {
    const result = calculatePace(baseConfig, '2026-06-15')
    expect(result.status).toBe(PaceStatus.Critical)
  })

  it('returns projected finish date', () => {
    const result = calculatePace(baseConfig, today, 5)
    expect(result.projectedFinishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('buildPaceSuggestion', () => {
  it('returns appropriate text for each status', () => {
    expect(buildPaceSuggestion(PaceStatus.Ahead, 4, 6, 'lesson')).toContain('buffer')
    expect(buildPaceSuggestion(PaceStatus.OnTrack, 4, 4, 'lesson')).toContain('Keep steady')
    expect(buildPaceSuggestion(PaceStatus.Behind, 4, 3, 'lesson')).toContain('Sprint')
    expect(buildPaceSuggestion(PaceStatus.Critical, 8, 2, 'page')).toContain('Significantly behind')
  })
})

describe('calculateAllPaces', () => {
  it('calculates pace for multiple workbooks', () => {
    const configs: WorkbookConfig[] = [
      baseConfig,
      { ...baseConfig, name: 'Reading ELA', subjectBucket: SubjectBucket.Reading, totalUnits: 50, currentPosition: 20 },
    ]
    const results = calculateAllPaces(configs, '2026-02-16')
    expect(results).toHaveLength(2)
    expect(results[0].workbookName).toBe('Math Grade 2')
    expect(results[1].workbookName).toBe('Reading ELA')
  })

  it('uses per-workbook planned pace when provided', () => {
    const configs = [baseConfig]
    const planned = new Map([['Math Grade 2', 10]])
    const results = calculateAllPaces(configs, '2026-02-16', planned)
    expect(results[0].plannedPerWeek).toBe(10)
  })
})
