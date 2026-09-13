import { describe, expect, it } from 'vitest'

import {
  draftTurnText,
  LOCAL_PLANNER_FALLBACK_NOTICE,
  LOCAL_PLANNER_FALLBACK_SNACK,
} from './plannerDraftNotice'

describe('draftTurnText — draft turn message composition (UX-233)', () => {
  it('marks an AI-powered draft', () => {
    const text = draftTurnText({ usedAI: true, fellBackToLocal: false })
    expect(text).toContain('(AI-powered)')
    expect(text).not.toContain(LOCAL_PLANNER_FALLBACK_NOTICE)
  })

  it('omits the AI tag when the local planner produced the week', () => {
    const text = draftTurnText({ usedAI: false, fellBackToLocal: false })
    expect(text).not.toContain('(AI-powered)')
  })

  it('includes the fallback notice when the AI path failed', () => {
    const text = draftTurnText({ usedAI: false, fellBackToLocal: true })
    expect(text).toContain(LOCAL_PLANNER_FALLBACK_NOTICE)
    expect(text).not.toContain('(AI-powered)')
  })

  it('includes the shaped-by line only when AI was used', () => {
    const shapedByLine = 'Shaped by: "less math, more reading"'
    const ai = draftTurnText({ usedAI: true, fellBackToLocal: false, shapedByLine })
    expect(ai).toContain(shapedByLine)

    const local = draftTurnText({ usedAI: false, fellBackToLocal: true, shapedByLine })
    expect(local).not.toContain(shapedByLine)
  })

  it('omits the shaped-by line when it is null or empty', () => {
    const text = draftTurnText({ usedAI: true, fellBackToLocal: false, shapedByLine: null })
    expect(text).toBe("Here's your draft plan (AI-powered).")
  })

  it('separates sections with double newlines', () => {
    const text = draftTurnText({
      usedAI: true,
      fellBackToLocal: false,
      shapedByLine: 'Shaped by: request',
    })
    expect(text).toBe("Here's your draft plan (AI-powered).\n\nShaped by: request")
  })

  it('composes all three parts when AI is used with a shaped-by line', () => {
    const text = draftTurnText({
      usedAI: true,
      fellBackToLocal: false,
      shapedByLine: 'Shaped by: notes',
    })
    const parts = text.split('\n\n')
    expect(parts).toHaveLength(2)
    expect(parts[0]).toContain('(AI-powered)')
    expect(parts[1]).toBe('Shaped by: notes')
  })
})

describe('LOCAL_PLANNER_FALLBACK constants', () => {
  it('fallback notice mentions the built-in planner', () => {
    expect(LOCAL_PLANNER_FALLBACK_NOTICE).toContain('built-in planner')
  })

  it('fallback snack is a short sentence', () => {
    expect(LOCAL_PLANNER_FALLBACK_SNACK.length).toBeLessThan(60)
    expect(LOCAL_PLANNER_FALLBACK_SNACK).toContain('local planner')
  })
})
