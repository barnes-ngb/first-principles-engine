import { describe, expect, it } from 'vitest'

import { weekEnergyLabel, WEEK_ENERGY_QUESTION } from './weekEnergyLabels'

describe('weekEnergyLabel', () => {
  it('returns Normal for full', () => {
    expect(weekEnergyLabel('full')).toBe('Normal')
  })

  it('returns Lighter for lighter', () => {
    expect(weekEnergyLabel('lighter')).toBe('Lighter')
  })

  it('returns a label containing Minimum Viable Day for mvd', () => {
    const label = weekEnergyLabel('mvd')
    expect(label).toContain('Minimum Viable Day')
  })

  it('does not use the MVD acronym alone', () => {
    const label = weekEnergyLabel('mvd')
    expect(label).not.toBe('MVD')
  })

  it('no label contains hours or time figures', () => {
    for (const value of ['full', 'lighter', 'mvd'] as const) {
      const label = weekEnergyLabel(value)
      expect(label).not.toMatch(/\d+\.?\d*h/)
      expect(label).not.toMatch(/\d+m/)
    }
  })

  it('each value produces a distinct label', () => {
    const labels = (['full', 'lighter', 'mvd'] as const).map(weekEnergyLabel)
    expect(new Set(labels).size).toBe(3)
  })
})

describe('WEEK_ENERGY_QUESTION', () => {
  it('is a question', () => {
    expect(WEEK_ENERGY_QUESTION).toContain('?')
  })

  it('mentions the week', () => {
    expect(WEEK_ENERGY_QUESTION.toLowerCase()).toContain('week')
  })
})
