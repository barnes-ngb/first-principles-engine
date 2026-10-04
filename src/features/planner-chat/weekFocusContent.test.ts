import { describe, expect, it } from 'vitest'

import type { WeekPlan } from '../../core/types'
import { weekFocusPanelHasContent } from './weekFocusContent'

const base: WeekPlan = {
  startDate: '2026-09-07',
  theme: '',
  virtue: '',
  scriptureRef: '',
  heartQuestion: '',
  tracks: [],
  flywheelPlan: '',
  buildLab: { title: '', description: '' },
}

describe('weekFocusPanelHasContent', () => {
  it('returns false when neither theme nor conundrum is set', () => {
    expect(weekFocusPanelHasContent(base)).toBe(false)
  })

  it('returns true when theme is set', () => {
    expect(weekFocusPanelHasContent({ ...base, theme: 'Courage' })).toBe(true)
  })

  it('returns true when conundrum is set', () => {
    expect(
      weekFocusPanelHasContent({
        ...base,
        conundrum: { question: 'What would you do?', context: 'A dilemma' },
      }),
    ).toBe(true)
  })

  it('returns true when both are set', () => {
    expect(
      weekFocusPanelHasContent({
        ...base,
        theme: 'Perseverance',
        conundrum: { question: 'Is it fair?', context: 'Sharing' },
      }),
    ).toBe(true)
  })

  it('returns false when theme is only whitespace', () => {
    expect(weekFocusPanelHasContent({ ...base, theme: '   ' })).toBe(false)
  })

  it('returns false when theme is empty string', () => {
    expect(weekFocusPanelHasContent({ ...base, theme: '' })).toBe(false)
  })
})
