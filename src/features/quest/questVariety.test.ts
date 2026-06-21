import { describe, expect, it } from 'vitest'

import {
  ASKED_TARGETS_LIMIT,
  askedTargetSet,
  collectAskedTargets,
  recentQuestionFormats,
} from './questVariety'
import type { SessionQuestion } from './questTypes'

function q(partial: Partial<SessionQuestion>): SessionQuestion {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    type: partial.type ?? 'multiple-choice',
    level: partial.level ?? 2,
    skill: partial.skill ?? 'phonics.cvc.short-o',
    prompt: partial.prompt ?? 'What word is this?',
    stimulus: partial.stimulus,
    options: partial.options ?? [],
    correctAnswer: partial.correctAnswer ?? 'dog',
    childAnswer: partial.childAnswer ?? 'dog',
    correct: partial.correct ?? true,
    responseTimeMs: partial.responseTimeMs ?? 1000,
    timestamp: partial.timestamp ?? new Date().toISOString(),
  }
}

describe('collectAskedTargets', () => {
  it('collects distinct normalized target words from correctAnswer + stimulus', () => {
    const asked = collectAskedTargets([
      q({ correctAnswer: 'Dog', stimulus: 'dog' }),
      q({ correctAnswer: 'cat', stimulus: 'CAT' }),
      q({ correctAnswer: 'ship', stimulus: undefined }),
    ])
    expect(asked).toEqual(['dog', 'cat', 'ship'])
  })

  it('de-dupes repeated targets across questions', () => {
    const asked = collectAskedTargets([
      q({ correctAnswer: 'dog' }),
      q({ correctAnswer: 'dog' }),
      q({ correctAnswer: 'cat' }),
    ])
    expect(asked).toEqual(['dog', 'cat'])
  })

  it('ignores empty / whitespace targets', () => {
    const asked = collectAskedTargets([
      q({ correctAnswer: '   ', stimulus: '' }),
      q({ correctAnswer: 'sun' }),
    ])
    expect(asked).toEqual(['sun'])
  })

  it('caps to the most-recent `limit` targets', () => {
    const many = Array.from({ length: ASKED_TARGETS_LIMIT + 5 }, (_, i) =>
      q({ correctAnswer: `word${i}` }),
    )
    const asked = collectAskedTargets(many)
    expect(asked.length).toBe(ASKED_TARGETS_LIMIT)
    // The oldest were dropped; the newest survives.
    expect(asked).toContain(`word${ASKED_TARGETS_LIMIT + 4}`)
    expect(asked).not.toContain('word0')
  })
})

describe('askedTargetSet', () => {
  it('returns a Set of every asked target (uncapped) for membership checks', () => {
    const set = askedTargetSet([
      q({ correctAnswer: 'Ship', stimulus: 'boat' }),
      q({ correctAnswer: 'rain' }),
    ])
    expect(set.has('ship')).toBe(true)
    expect(set.has('boat')).toBe(true)
    expect(set.has('rain')).toBe(true)
    expect(set.has('unseen')).toBe(false)
  })
})

describe('recentQuestionFormats', () => {
  it('returns the last 3 formats with type + prompt snippet, oldest-first', () => {
    const formats = recentQuestionFormats([
      q({ type: 'multiple-choice', prompt: 'What word is this?' }),
      q({ type: 'build-word', prompt: 'Build the word you hear!' }),
      q({ type: 'spell-word', prompt: 'Listen, then spell the word' }),
      q({ type: 'multiple-choice', prompt: 'Which word rhymes with cat?' }),
    ])
    expect(formats).toHaveLength(3)
    expect(formats[0]).toContain('build-word')
    expect(formats[2]).toContain('multiple-choice')
    expect(formats[2]).toContain('Which word rhymes with cat?')
  })
})
