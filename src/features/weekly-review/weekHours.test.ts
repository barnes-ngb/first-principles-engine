import { describe, expect, it } from 'vitest'

import { HOURS_SOURCE_CAPTION, hoursLoggedLine } from './weekHours'

describe('hoursLoggedLine (UX-211)', () => {
  it('states hours with one decimal, dropping a trailing zero', () => {
    expect(hoursLoggedLine(288)).toBe('4.8 hours logged this week.')
    expect(hoursLoggedLine(300)).toBe('5 hours logged this week.')
  })

  it('stays in minutes under an hour', () => {
    expect(hoursLoggedLine(20)).toBe('20 minutes logged this week.')
    expect(hoursLoggedLine(1)).toBe('1 minute logged this week.')
  })

  it('reports an empty week plainly', () => {
    expect(hoursLoggedLine(0)).toBe('No hours logged this week.')
  })

  it('does not report a negative duration when adjustments outweigh the week', () => {
    // Adjustments subtract, and a correction must subtract everywhere.
    expect(hoursLoggedLine(-30)).toBe('No hours logged this week.')
    expect(hoursLoggedLine(Number.NaN)).toBe('No hours logged this week.')
  })

  it('never states a target, a ratio, a percentage or a goal', () => {
    const lines = [0, 20, 288, 300, 900].map(hoursLoggedLine)
    for (const line of lines) {
      expect(line).not.toMatch(/\//)
      expect(line).not.toMatch(/%/)
      expect(line).not.toMatch(/goal|target|of \d|remaining|left|behind|short/i)
    }
  })

  it('names which count this is, so it reconciles with the Records page', () => {
    expect(HOURS_SOURCE_CAPTION).toContain('Records page')
    expect(HOURS_SOURCE_CAPTION).toContain('compliance pack')
  })
})
