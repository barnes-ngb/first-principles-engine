import { describe, expect, it } from 'vitest'
import {
  createDefaultDayLog,
  dayLogDocId,
  legacyDayLogDocId,
  parseDateFromDocId,
} from './daylog.model'

describe('dayLogDocId', () => {
  it('produces {date}_{childId} format', () => {
    expect(dayLogDocId('2026-02-09', 'abc123')).toBe('2026-02-09_abc123')
  })
})

describe('legacyDayLogDocId', () => {
  it('produces {childId}_{date} format', () => {
    expect(legacyDayLogDocId('abc123', '2026-02-09')).toBe('abc123_2026-02-09')
  })
})

describe('parseDateFromDocId', () => {
  it('extracts date from new format {date}_{childId}', () => {
    expect(parseDateFromDocId('2026-02-09_abc123')).toBe('2026-02-09')
  })

  it('extracts date from legacy format {childId}_{date}', () => {
    expect(parseDateFromDocId('abc123_2026-02-09')).toBe('2026-02-09')
  })

  it('handles bare date doc ID', () => {
    expect(parseDateFromDocId('2026-02-09')).toBe('2026-02-09')
  })

  it('handles long child IDs with underscores', () => {
    expect(parseDateFromDocId('2026-02-09_long_child_id')).toBe('2026-02-09')
  })

  it('returns full ID as fallback for unrecognized format', () => {
    expect(parseDateFromDocId('some-random-id')).toBe('some-random-id')
  })
})

describe('createDefaultDayLog', () => {
  it('includes createdAt timestamp', () => {
    const log = createDefaultDayLog('child-1', '2026-02-09')
    expect(log.createdAt).toBeDefined()
    expect(log.childId).toBe('child-1')
    expect(log.date).toBe('2026-02-09')
  })

  it('includes childId and date fields', () => {
    const log = createDefaultDayLog('child-1', '2026-02-09')
    expect(log.childId).toBe('child-1')
    expect(log.date).toBe('2026-02-09')
  })
})
