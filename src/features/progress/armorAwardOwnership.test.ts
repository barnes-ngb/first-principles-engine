import { describe, expect, it } from 'vitest'

import {
  armorAwardDraftIsEmpty,
  armorAwardSwitchNotice,
  clearedArmorAwardDraft,
  DEFAULT_AWARD_TYPE,
} from './armorAwardOwnership'

/**
 * UX-336 — the rule behind the reset, on its own. The tab test beside this one
 * proves the form is cleared and the write follows the child on screen; this
 * proves the rule they depend on fires when — and only when — a real draft was
 * dropped.
 */
const EMPTY = { amount: '', reason: '', awardType: DEFAULT_AWARD_TYPE }

describe('armorAwardDraftIsEmpty', () => {
  it('is empty on an untouched form', () => {
    expect(armorAwardDraftIsEmpty(EMPTY)).toBe(true)
  })

  it.each(['amount', 'reason'] as const)('counts a typed %s', (field) => {
    expect(armorAwardDraftIsEmpty({ ...EMPTY, [field]: '20' })).toBe(false)
  })

  it('counts a CHANGED award type, because Correction makes the amount negative', () => {
    // The `estimateDaysPerWeek` shape (UX-329 Codex round 1), one surface over:
    // a field with a real default that still decides what gets written.
    expect(armorAwardDraftIsEmpty({ ...EMPTY, awardType: 'Correction' })).toBe(false)
  })

  it('does not count the default award type — every form would be "typed"', () => {
    expect(armorAwardDraftIsEmpty({ ...EMPTY, awardType: DEFAULT_AWARD_TYPE })).toBe(true)
  })
})

describe('clearedArmorAwardDraft', () => {
  it('restores the default type as well as the two typed fields', () => {
    expect(clearedArmorAwardDraft()).toEqual({
      amount: '',
      reason: '',
      awardType: DEFAULT_AWARD_TYPE,
    })
  })
})

describe('armorAwardSwitchNotice', () => {
  it('says nothing when nothing was dropped', () => {
    expect(armorAwardSwitchNotice(false, 'Lincoln', 'London')).toBeNull()
  })

  it('names both boys and says XP is only granted on the tap', () => {
    const note = armorAwardSwitchNotice(true, 'Lincoln', 'London')
    expect(note).toContain('Lincoln')
    expect(note).toContain('London')
    expect(note).toMatch(/wasn't awarded/i)
  })
})
