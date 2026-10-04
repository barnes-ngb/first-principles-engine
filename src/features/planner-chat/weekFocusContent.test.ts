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
  buildLab: { title: '', materials: [], steps: [] },
  childGoals: [],
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
        conundrum: { title: 'A dilemma', scenario: 'Choosing to help', question: 'What would you do?', lincolnPrompt: 'Explain your choice', londonPrompt: 'Tell your choice', virtueConnection: 'Kindness' },
      }),
    ).toBe(true)
  })

  it('returns true when both are set', () => {
    expect(
      weekFocusPanelHasContent({
        ...base,
        theme: 'Perseverance',
        conundrum: { title: 'Sharing', scenario: 'Sharing supplies', question: 'Is it fair?', lincolnPrompt: 'Explain your choice', londonPrompt: 'Tell your choice', virtueConnection: 'Fairness' },
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
