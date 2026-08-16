import { describe, it, expect } from 'vitest'

import { orderAskMe, fallbackQuestions } from './askMePanel.logic'
import type { ComprehensionQuestion } from './useComprehensionQuestions'

function q(type: ComprehensionQuestion['type'], question = `${type} question`): ComprehensionQuestion {
  return { question, answer: 'answer', type }
}

describe('orderAskMe', () => {
  it('orders opinion → inference → recall', () => {
    const input = [q('recall'), q('inference'), q('opinion')]
    const result = orderAskMe(input)
    expect(result.map((r) => r.type)).toEqual(['opinion', 'inference', 'recall'])
  })

  it('preserves relative order within the same type', () => {
    const input = [
      q('recall', 'recall-1'),
      q('recall', 'recall-2'),
      q('opinion', 'opinion-1'),
    ]
    const result = orderAskMe(input)
    expect(result.map((r) => r.question)).toEqual(['opinion-1', 'recall-1', 'recall-2'])
  })

  it('handles a single question', () => {
    const input = [q('inference')]
    expect(orderAskMe(input)).toHaveLength(1)
    expect(orderAskMe(input)[0].type).toBe('inference')
  })

  it('handles an empty array', () => {
    expect(orderAskMe([])).toEqual([])
  })

  it('does not mutate the original array', () => {
    const input = [q('recall'), q('opinion')]
    const original = [...input]
    orderAskMe(input)
    expect(input).toEqual(original)
  })
})

describe('fallbackQuestions', () => {
  it('returns 3 prompts with the child name', () => {
    const result = fallbackQuestions('Lincoln')
    expect(result).toHaveLength(3)
    result.forEach((prompt) => expect(prompt).toContain('Lincoln'))
  })

  it('uses "them" for an empty name', () => {
    const result = fallbackQuestions('')
    expect(result).toHaveLength(3)
    result.forEach((prompt) => expect(prompt).toContain('them'))
  })

  it('uses "them" for a whitespace-only name', () => {
    const result = fallbackQuestions('   ')
    result.forEach((prompt) => expect(prompt).toContain('them'))
  })

  it('asks about favorite page, what happens next, and hardest word', () => {
    const result = fallbackQuestions('London')
    expect(result[0]).toMatch(/favorite page/)
    expect(result[1]).toMatch(/what happens next/)
    expect(result[2]).toMatch(/hardest word/)
  })
})
