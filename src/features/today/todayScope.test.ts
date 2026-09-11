import { describe, expect, it } from 'vitest'

import {
  TODAY_DECISION_WORDS,
  TodayDecision,
  childIdFromScopeKey,
  todayScopeKey,
  todayScopeResetNotice,
} from './todayScope'

/**
 * UX-343 — what Today says when the child or the day changes underneath an open
 * decision.
 *
 * The census verdict for this page is RESET, and RESET has two halves: re-seed
 * from the new identity, and **make the loss visible**. A dialog that closes
 * silently is the same defect with the evidence removed, which is what these
 * tests are here to stop a later run quietly reintroducing.
 *
 * POSITIVE CONTROL: make `todayScopeResetNotice` return `null` unconditionally
 * and every test below except the "nothing was open" one fails.
 */

describe('the scope key', () => {
  it('is one child and one day, because both halves can go wrong', () => {
    expect(todayScopeKey('lincoln', '2026-09-11')).toBe('lincoln|2026-09-11')
    expect(childIdFromScopeKey('lincoln|2026-09-11')).toBe('lincoln')
  })

  it('answers an empty child rather than undefined', () => {
    expect(childIdFromScopeKey('')).toBe('')
  })
})

describe('the sentence Today says when it closes what was open', () => {
  it('says nothing at all when nothing was open', () => {
    expect(todayScopeResetNotice([], 'Lincoln')).toBeNull()
  })

  it('names the one decision, names who it was for, and says nothing was saved', () => {
    const notice = todayScopeResetNotice([TodayDecision.StrandSession], 'Lincoln')
    expect(notice).not.toBeNull()
    expect(notice!.text).toContain('the session you were recording')
    expect(notice!.text).toContain('Lincoln')
    expect(notice!.text).toContain('Nothing was saved')
    // A warning, not an error: nothing went wrong and nothing saved was lost.
    expect(notice!.severity).toBe('warning')
  })

  it('lists several in a fixed order, so two runs cannot phrase it differently', () => {
    const a = todayScopeResetNotice(
      [TodayDecision.SwapVideo, TodayDecision.StrandSession, TodayDecision.GradeNote],
      'London',
    )
    const b = todayScopeResetNotice(
      [TodayDecision.GradeNote, TodayDecision.SwapVideo, TodayDecision.StrandSession],
      'London',
    )
    expect(a!.text).toBe(b!.text)
    expect(a!.text).toContain('the session you were recording, the review note and the video change')
    expect(a!.text).toContain('them')
  })

  it('de-duplicates a decision reported twice', () => {
    const notice = todayScopeResetNotice(
      [TodayDecision.MoveItem, TodayDecision.MoveItem],
      'Lincoln',
    )
    expect(notice!.text.match(/the move to another day/g)).toHaveLength(1)
  })

  it('does not guess a name it does not have', () => {
    const notice = todayScopeResetNotice([TodayDecision.AddPhotos], null)
    expect(notice!.text).toContain('the day on screen changed')
    expect(notice!.text).toContain('Nothing was saved')
    // A wrong name here would be a claim about whose record almost moved.
    expect(notice!.text).not.toContain('undefined')
    expect(notice!.text).not.toContain('null')
  })

  it('treats a blank name as no name', () => {
    expect(todayScopeResetNotice([TodayDecision.AddVideo], '   ')!.text).toContain(
      'the day on screen changed',
    )
  })

  it('never tells her to try again — she may have meant to switch', () => {
    for (const decision of Object.values(TodayDecision)) {
      const notice = todayScopeResetNotice([decision], 'Lincoln')!
      expect(notice.text.toLowerCase()).not.toContain('try again')
    }
  })
})

describe('every decision has a word a parent would recognise', () => {
  it('covers the whole partition, with nothing blank and nothing duplicated', () => {
    const values = Object.values(TodayDecision)
    const words = values.map((d) => TODAY_DECISION_WORDS[d])
    expect(words).toHaveLength(values.length)
    for (const word of words) expect(word.trim()).not.toBe('')
    expect(new Set(words).size).toBe(words.length)
  })

  it('lists every decision in the ordering, so none can be silently dropped', () => {
    // The order table is private, so this asserts it through the only door it
    // has: every member must be able to appear in a notice.
    for (const decision of Object.values(TodayDecision)) {
      const notice = todayScopeResetNotice([decision], 'Lincoln')
      expect(notice, `${decision} produced no notice`).not.toBeNull()
      expect(notice!.text).toContain(TODAY_DECISION_WORDS[decision])
    }
  })
})
