import { describe, expect, it } from 'vitest'
import { canAssemble, checkAnswer, extractPattern, extractTargetWord, generateFallbackQuestion, sanitizeStimulus, shouldFlagAsError, validateQuestion } from './questHelpers'
import type { BuildWordQuestion, MultipleChoiceQuestion, SessionQuestion } from './questTypes'

function makeQuestion(overrides: Partial<MultipleChoiceQuestion> = {}): MultipleChoiceQuestion {
  return {
    id: 'q_test',
    type: 'multiple-choice',
    level: 2,
    skill: 'phonics.cvc.short-o',
    prompt: 'What word is this?',
    stimulus: 'dog',
    options: ['dig', 'dog', 'dug'],
    correctAnswer: 'dog',
    ...overrides,
  }
}

// ── checkAnswer ────────────────────────────────────────────────

describe('checkAnswer', () => {
  it('direct match (case insensitive)', () => {
    expect(checkAnswer('dog', makeQuestion())).toBe(true)
    expect(checkAnswer('Dog', makeQuestion())).toBe(true)
    expect(checkAnswer('cat', makeQuestion())).toBe(false)
  })

  it('fill-in-blank: selected fragment matches via reconstruction', () => {
    const q = makeQuestion({
      prompt: 'Complete the word: _en',
      stimulus: '_en',
      options: ['sh', 'th', 'ch'],
      correctAnswer: 'then',
    })
    expect(checkAnswer('th', q)).toBe(true)
    expect(checkAnswer('sh', q)).toBe(false)
    expect(checkAnswer('ch', q)).toBe(false)
  })

  it('fill-in-blank: correctAnswer already matches option directly', () => {
    const q = makeQuestion({
      prompt: 'Complete the word: _en',
      stimulus: '_en',
      options: ['sh', 'th', 'ch'],
      correctAnswer: 'th',
    })
    expect(checkAnswer('th', q)).toBe(true)
    expect(checkAnswer('sh', q)).toBe(false)
  })

  it('last resort: correctAnswer starts/ends with selected option', () => {
    const q = makeQuestion({
      prompt: 'Complete the word:',
      options: ['sh', 'th', 'ch'],
      correctAnswer: 'then',
      stimulus: undefined,
    })
    expect(checkAnswer('th', q)).toBe(true)
  })

  it('does not false-positive for unrelated words', () => {
    const q = makeQuestion({
      options: ['cat', 'bat', 'rat'],
      correctAnswer: 'cat',
    })
    expect(checkAnswer('bat', q)).toBe(false)
    expect(checkAnswer('rat', q)).toBe(false)
  })

  it('handles whitespace and case in options', () => {
    const q = makeQuestion({
      options: [' Dog ', 'cat', 'rat'],
      correctAnswer: 'dog',
    })
    expect(checkAnswer(' Dog ', q)).toBe(true)
  })
})

// ── sanitizeStimulus ───────────────────────────────────────────

describe('sanitizeStimulus', () => {
  it('returns stimulus unchanged for non-fill-in-blank', () => {
    const q = makeQuestion({ stimulus: 'dog', prompt: 'What word is this?' })
    expect(sanitizeStimulus(q)).toBe('dog')
  })

  it('returns null when no stimulus', () => {
    const q = makeQuestion({ stimulus: undefined })
    expect(sanitizeStimulus(q)).toBeNull()
  })

  it('strips leaked answer from fill-in-blank stimulus', () => {
    const q = makeQuestion({
      prompt: 'Complete the word:',
      stimulus: 'th_en',
      correctAnswer: 'th',
    })
    const result = sanitizeStimulus(q)
    expect(result).not.toContain('th')
    expect(result).toContain('_')
  })

  it('preserves stimulus when answer not leaked', () => {
    const q = makeQuestion({
      prompt: 'Complete the word:',
      stimulus: '_en',
      correctAnswer: 'th',
    })
    expect(sanitizeStimulus(q)).toBe('_en')
  })
})

// ── shouldFlagAsError ──────────────────────────────────────────

describe('shouldFlagAsError', () => {
  it('flags when stimulus contains correctAnswer with underscore', () => {
    const q = makeQuestion({
      stimulus: 'th_en',
      correctAnswer: 'th',
    })
    expect(shouldFlagAsError(q)).toBe(true)
  })

  it('flags when correctAnswer does not match any option', () => {
    const q = makeQuestion({
      options: ['sh', 'th', 'ch'],
      correctAnswer: 'then',
      stimulus: undefined,
    })
    expect(shouldFlagAsError(q)).toBe(true)
  })

  it('does not flag fill-in-blank where reconstruction works', () => {
    const q = makeQuestion({
      stimulus: '_en',
      options: ['sh', 'th', 'ch'],
      correctAnswer: 'then',
    })
    // correctAnswer "then" doesn't directly match options, but
    // reconstruction: "_en".replace("_", "th") = "then" matches
    expect(shouldFlagAsError(q)).toBe(false)
  })

  it('flags duplicate options', () => {
    const q = makeQuestion({
      options: ['dog', 'dog', 'cat'],
      correctAnswer: 'dog',
    })
    expect(shouldFlagAsError(q)).toBe(true)
  })

  it('flags missing stimulus for "what word" prompts', () => {
    const q = makeQuestion({
      prompt: 'What word is this?',
      stimulus: undefined,
    })
    expect(shouldFlagAsError(q)).toBe(true)
  })

  it('flags missing stimulus for "complete" prompts', () => {
    const q = makeQuestion({
      prompt: 'Complete the word: _op',
      stimulus: undefined,
    })
    expect(shouldFlagAsError(q)).toBe(true)
  })

  it('does not flag a normal valid question', () => {
    const q = makeQuestion()
    expect(shouldFlagAsError(q)).toBe(false)
  })
})

// ── extractTargetWord ──────────────────────────────────────────

describe('extractTargetWord', () => {
  function makeSessionQ(overrides: Partial<SessionQuestion & { stimulus?: string }> = {}): SessionQuestion & { stimulus?: string } {
    return {
      id: 'q_test',
      type: 'multiple-choice',
      level: 2,
      skill: 'phonics.cvc.short-o',
      prompt: 'What word is this?',
      options: ['dig', 'dog', 'dug'],
      correctAnswer: 'dog',
      childAnswer: 'dog',
      correct: true,
      responseTimeMs: 3000,
      timestamp: new Date().toISOString(),
      ...overrides,
    }
  }

  it('returns stimulus for word-reading questions', () => {
    expect(extractTargetWord(makeSessionQ({ stimulus: 'stop' }))).toBe('stop')
  })

  it('reconstructs word from fill-in-blank', () => {
    expect(extractTargetWord(makeSessionQ({ stimulus: '_en', correctAnswer: 'th' }))).toBe('then')
  })

  it('falls back to correctAnswer', () => {
    expect(extractTargetWord(makeSessionQ({ stimulus: undefined, correctAnswer: 'dog' }))).toBe('dog')
  })

  it('returns null for long correctAnswer', () => {
    expect(extractTargetWord(makeSessionQ({
      stimulus: undefined,
      correctAnswer: 'this is a very long answer string',
    }))).toBeNull()
  })
})

// ── extractPattern ─────────────────────────────────────────────

describe('extractPattern', () => {
  function makeSessionQ(skill: string): SessionQuestion {
    return {
      id: 'q_test',
      type: 'multiple-choice',
      level: 2,
      skill,
      prompt: 'test',
      options: [],
      correctAnswer: '',
      childAnswer: '',
      correct: true,
      responseTimeMs: 0,
      timestamp: '',
    }
  }

  it('extracts last two parts from skill tag', () => {
    expect(extractPattern(makeSessionQ('phonics.digraphs.th'))).toBe('digraphs-th')
  })

  it('extracts single-part skill', () => {
    expect(extractPattern(makeSessionQ('phonics'))).toBe('phonics')
  })

  it('falls back to question type', () => {
    expect(extractPattern(makeSessionQ(''))).toBe('multiple-choice')
  })
})

// ── generateFallbackQuestion ──────────────────────────────────

describe('generateFallbackQuestion', () => {
  it('generates a valid math question', () => {
    const q = generateFallbackQuestion(2, 'math')
    expect(q.skill).toBe('math.addition')
    expect(q.options.length).toBe(3)
    expect(q.options).toContain(q.correctAnswer)
    expect(validateQuestion(q)).not.toBeNull()
  })

  it('generates a valid reading question', () => {
    const q = generateFallbackQuestion(3, 'reading')
    expect(q.skill).toBe('phonics.word-reading')
    expect(q.stimulus).toBeTruthy()
    expect(q.options.length).toBe(3)
    expect(q.options).toContain(q.correctAnswer)
    expect(validateQuestion(q)).not.toBeNull()
  })

  it('always passes validateQuestion', () => {
    for (let i = 0; i < 20; i++) {
      const level = Math.floor(Math.random() * 6) + 1
      const domain = Math.random() > 0.5 ? 'math' : 'reading'
      const q = generateFallbackQuestion(level, domain)
      expect(validateQuestion(q)).not.toBeNull()
    }
  })
})

// ── validateQuestion ──────────────────────────────────────────

describe('validateQuestion', () => {
  function makeQ(overrides: Partial<MultipleChoiceQuestion>) {
    return {
      id: 'q1',
      type: 'multiple-choice' as const,
      level: 3,
      skill: 'phonics.blends.st',
      prompt: 'Complete the word:',
      stimulus: 's__op',
      options: ['tr', 'cr', 'st'],
      correctAnswer: 'st',
      ...overrides,
    }
  }

  it('passes valid fill-in-blank question', () => {
    const q = makeQ({})
    expect(validateQuestion(q)).not.toBeNull()
  })

  it('rejects when blank count does not match answer length', () => {
    // 3 blanks but answer is 2 chars
    const q = makeQ({ stimulus: 's___op', correctAnswer: 'st' })
    expect(validateQuestion(q)).toBeNull()
  })

  it('rejects when correct answer is not in options', () => {
    const q = makeQ({ correctAnswer: 'xx' })
    expect(validateQuestion(q)).toBeNull()
  })

  it('rejects when options have wrong length for blanks', () => {
    // 2 blanks but one option is 1 char
    const q = makeQ({ options: ['t', 'cr', 'st'] })
    expect(validateQuestion(q)).toBeNull()
  })

  it('passes non-fill-in-blank question without stimulus underscores', () => {
    const q = makeQ({
      prompt: 'What word is this?',
      stimulus: 'stop',
      options: ['stop', 'step', 'shop'],
      correctAnswer: 'stop',
    })
    expect(validateQuestion(q)).not.toBeNull()
  })

  it('rejects question with empty options', () => {
    const q = makeQ({ options: [] })
    expect(validateQuestion(q)).toBeNull()
  })
})

// ── FEAT-04: build-the-word (encoding) ─────────────────────────

function makeBuildWord(overrides: Partial<BuildWordQuestion> = {}): BuildWordQuestion {
  return {
    id: 'bw_test',
    type: 'build-word',
    level: 3,
    skill: 'phonics.digraphs.sh',
    prompt: 'Build the word you hear!',
    targetWord: 'ship',
    correctAnswer: 'ship',
    tiles: ['sh', 'i', 'p', 'ch', 'a'],
    ...overrides,
  }
}

describe('canAssemble', () => {
  it('builds a CVC word from single-letter tiles', () => {
    expect(canAssemble('stop', ['s', 't', 'o', 'p'])).toBe(true)
  })

  it('builds a word using multi-letter grapheme tiles', () => {
    expect(canAssemble('ship', ['sh', 'i', 'p'])).toBe(true)
    expect(canAssemble('rain', ['r', 'ai', 'n'])).toBe(true)
  })

  it('ignores distractor tiles', () => {
    expect(canAssemble('ship', ['sh', 'i', 'p', 'ch', 'a'])).toBe(true)
  })

  it('returns false when the target cannot be spelled from tiles', () => {
    expect(canAssemble('ship', ['sh', 'i', 'x'])).toBe(false)
    expect(canAssemble('stop', ['s', 't', 'o'])).toBe(false) // missing p
  })

  it('respects single-use tiles (no reusing one tile twice)', () => {
    expect(canAssemble('pop', ['p', 'o'])).toBe(false) // needs two p's
    expect(canAssemble('pop', ['p', 'o', 'p'])).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(canAssemble('Ship', ['SH', 'I', 'P'])).toBe(true)
  })
})

describe('checkAnswer — build-word', () => {
  it('accepts the exact assembled word (case-insensitive)', () => {
    const q = makeBuildWord()
    expect(checkAnswer('ship', q)).toBe(true)
    expect(checkAnswer('SHIP', q)).toBe(true)
  })

  it('rejects a mis-built word (no fuzzy/partial credit — encoding is precise)', () => {
    const q = makeBuildWord()
    expect(checkAnswer('shi', q)).toBe(false)
    expect(checkAnswer('chip', q)).toBe(false)
    expect(checkAnswer('', q)).toBe(false)
  })
})

describe('validateQuestion — build-word', () => {
  it('passes when tiles can spell the target', () => {
    expect(validateQuestion(makeBuildWord())).not.toBeNull()
  })

  it('rejects when tiles cannot spell the target', () => {
    expect(validateQuestion(makeBuildWord({ tiles: ['sh', 'i', 'x'] }))).toBeNull()
  })

  it('rejects when targetWord or tiles are missing', () => {
    expect(validateQuestion(makeBuildWord({ targetWord: '' }))).toBeNull()
    expect(validateQuestion(makeBuildWord({ tiles: [] }))).toBeNull()
  })
})

describe('shouldFlagAsError — build-word', () => {
  it('does not flag a solvable build-word question', () => {
    expect(shouldFlagAsError(makeBuildWord())).toBe(false)
  })

  it('flags an unsolvable build-word question', () => {
    expect(shouldFlagAsError(makeBuildWord({ tiles: ['sh', 'i', 'x'] }))).toBe(true)
  })
})

describe('mixed pipeline — build-word rotates in alongside MC', () => {
  it('validates both question types independently without interfering', () => {
    const mc = makeQuestion()
    const bw = makeBuildWord()
    // Both pass their respective validation, and answer-checking stays type-correct.
    expect(validateQuestion(mc)).not.toBeNull()
    expect(validateQuestion(bw)).not.toBeNull()
    expect(checkAnswer('dog', mc)).toBe(true)
    expect(checkAnswer('ship', bw)).toBe(true)
    // An MC answer string does not accidentally satisfy the build-word target.
    expect(checkAnswer('dog', bw)).toBe(false)
  })
})
