import { describe, it, expect } from 'vitest'

import {
  MIN_QUESTIONS_FOR_MASTERY,
  XP_PER_DIAMOND,
  answeredOnly,
  correctAnswerIndices,
  hasSufficientCompletion,
  perAnswerDiamondKey,
  perAnswerXpKey,
} from './questBanking'
import { MAX_QUESTIONS, MIN_QUESTIONS } from './questTypes'
import type { SessionQuestion } from './questTypes'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function q(
  partial: Partial<SessionQuestion> & Pick<SessionQuestion, 'correct'>,
): SessionQuestion {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    type: 'multiple-choice',
    level: 1,
    skill: 'cvc',
    prompt: 'p',
    options: [],
    correctAnswer: 'a',
    childAnswer: partial.correct ? 'a' : 'b',
    responseTimeMs: 100,
    timestamp: '2026-06-02T00:00:00.000Z',
    ...partial,
  }
}

/** A session of `total` questions, the first `correct` of which are right. */
function session(total: number, correct: number): SessionQuestion[] {
  return Array.from({ length: total }, (_, i) => q({ correct: i < correct }))
}

// ── Sufficient-completion gate (protect the mastery loop) ───────────────────────

describe('hasSufficientCompletion — the conservative mastery gate', () => {
  it('mirrors MIN_QUESTIONS as its threshold', () => {
    expect(MIN_QUESTIONS_FOR_MASTERY).toBe(MIN_QUESTIONS)
  })

  it('is false below the threshold — a short bail must not move his level', () => {
    expect(hasSufficientCompletion(session(2, 1))).toBe(false)
    expect(hasSufficientCompletion(session(MIN_QUESTIONS - 1, 0))).toBe(false)
    expect(hasSufficientCompletion([])).toBe(false)
  })

  it('is true at/above the threshold of answered questions', () => {
    expect(hasSufficientCompletion(session(MIN_QUESTIONS, 0))).toBe(true)
    expect(hasSufficientCompletion(session(10, 6))).toBe(true)
  })

  it('a complete short run (all MAX_QUESTIONS answered) always reaches the bar', () => {
    // The whole point of the short-run alignment: MAX_QUESTIONS == MIN_QUESTIONS, so
    // *finishing a run always counts*. A run can never end "just short" of the bar.
    expect(MAX_QUESTIONS).toBe(MIN_QUESTIONS)
    expect(hasSufficientCompletion(session(MAX_QUESTIONS, 3))).toBe(true)
  })

  it('does not count skipped or flagged questions toward sufficiency', () => {
    // MIN_QUESTIONS rows, but all skipped/flagged → no real signal.
    const skipped = Array.from({ length: MIN_QUESTIONS }, () =>
      q({ correct: false, skipped: true }),
    )
    expect(answeredOnly(skipped)).toHaveLength(0)
    expect(hasSufficientCompletion(skipped)).toBe(false)

    // 4 real answers + 2 flagged = 4 answered → still below threshold of 5.
    const mixed = [
      ...session(4, 2),
      q({ correct: false, flaggedAsError: true }),
      q({ correct: false, flaggedAsError: true }),
    ]
    expect(hasSufficientCompletion(mixed)).toBe(false)
  })
})

// ── Per-answer dedup keys (stable + distinct) ───────────────────────────────────

describe('per-answer dedup keys', () => {
  it('are stable for a given session id + index', () => {
    expect(perAnswerDiamondKey('s1', 0)).toBe('quest_s1_q0-diamond')
    expect(perAnswerDiamondKey('s1', 0)).toBe(perAnswerDiamondKey('s1', 0))
    expect(perAnswerXpKey('s1', 3)).toBe('quest_s1_q3-xp')
  })

  it('are distinct across index, session, and currency', () => {
    expect(perAnswerDiamondKey('s1', 0)).not.toBe(perAnswerDiamondKey('s1', 1))
    expect(perAnswerDiamondKey('s1', 0)).not.toBe(perAnswerDiamondKey('s2', 0))
    expect(perAnswerDiamondKey('s1', 0)).not.toBe(perAnswerXpKey('s1', 0))
  })
})

// ── correctAnswerIndices — full-array indices of correct answers ────────────────

describe('correctAnswerIndices', () => {
  it('returns the full-array positions of correct answers', () => {
    const qs = [
      q({ correct: true }), // 0
      q({ correct: false }), // 1
      q({ correct: true }), // 2
      q({ correct: false, skipped: true }), // 3
      q({ correct: true }), // 4
    ]
    expect(correctAnswerIndices(qs)).toEqual([0, 2, 4])
  })

  it('equals diamondsMined (totalCorrect) — one diamond per correct answer', () => {
    const qs = session(10, 6)
    expect(correctAnswerIndices(qs)).toHaveLength(6)
  })
})

// ── Dedup: live banking + end-of-session backfill bank ONCE ─────────────────────
//
// Simulates the xpLedger dedup guard (addXpEvent returns 0 / no-ops if the
// per-event doc already exists). The live submitAnswer path banks each correct
// answer by its full-array index; endSession then re-banks every correct answer
// by the SAME keys. Because the keys match, the backfill is a pure no-op — the
// child is awarded exactly one diamond per correct answer, never two.

describe('no double-award across the live + backfill paths', () => {
  function makeLedger() {
    const banked = new Set<string>()
    let diamonds = 0
    let xp = 0
    return {
      /** Mirrors addDiamondEvent/addXpEvent dedup: award only if key is new. */
      bankDiamond(key: string) {
        if (banked.has(key)) return 0
        banked.add(key)
        diamonds += 1
        return 1
      },
      bankXp(key: string, amount: number) {
        if (banked.has(key)) return 0
        banked.add(key)
        xp += amount
        return amount
      },
      get diamonds() {
        return diamonds
      },
      get xp() {
        return xp
      },
    }
  }

  it('banks one diamond per correct answer even when both paths run', () => {
    const sessionId = 'interactive_child_123'
    const qs = session(10, 7) // 7 correct
    const ledger = makeLedger()

    // Live path: bank as each correct answer is submitted.
    qs.forEach((question, index) => {
      if (question.correct) {
        ledger.bankDiamond(perAnswerDiamondKey(sessionId, index))
        ledger.bankXp(perAnswerXpKey(sessionId, index), XP_PER_DIAMOND)
      }
    })

    // End-of-session backfill: re-bank every correct answer (idempotent).
    for (const idx of correctAnswerIndices(qs)) {
      ledger.bankDiamond(perAnswerDiamondKey(sessionId, idx))
      ledger.bankXp(perAnswerXpKey(sessionId, idx), XP_PER_DIAMOND)
    }

    expect(ledger.diamonds).toBe(7) // one per correct answer, not 14
    expect(ledger.xp).toBe(7 * XP_PER_DIAMOND)
  })

  it('backfill alone still banks every correct answer (partial whose live write was dropped)', () => {
    const sessionId = 'interactive_child_456'
    const qs = session(3, 2) // a short partial: 2 correct of 3
    const ledger = makeLedger()

    // No live writes landed — only the backfill runs.
    for (const idx of correctAnswerIndices(qs)) {
      ledger.bankDiamond(perAnswerDiamondKey(sessionId, idx))
    }

    expect(ledger.diamonds).toBe(2) // the partial still banks its diamonds
    // …and this 3-question session is below the mastery gate, so it never moves levels.
    expect(hasSufficientCompletion(qs)).toBe(false)
  })
})
