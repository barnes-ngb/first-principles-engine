import { describe, expect, it } from 'vitest'

import {
  clearedHoursAdjustmentDraft,
  hoursAdjustmentDraftIsEmpty,
  hoursAdjustmentSwitchNotice,
} from './hoursAdjustmentOwnership'

/**
 * UX-340 — the rule behind the reset, on its own. The page test beside this one
 * proves the form is cleared and the write follows the child on screen; this
 * proves the rule they depend on fires when — and only when — a real draft was
 * dropped.
 */
const EMPTY = { minutes: '', reason: '', subject: '', date: '2026-09-10' }

describe('hoursAdjustmentDraftIsEmpty', () => {
  it('is empty on an untouched form', () => {
    expect(hoursAdjustmentDraftIsEmpty(EMPTY)).toBe(true)
  })

  it.each(['minutes', 'reason', 'subject'] as const)('counts a typed %s', (field) => {
    expect(hoursAdjustmentDraftIsEmpty({ ...EMPTY, [field]: 'x' })).toBe(false)
  })

  it('ignores whitespace-only text — a space is not an adjustment', () => {
    expect(hoursAdjustmentDraftIsEmpty({ ...EMPTY, reason: '   ' })).toBe(true)
  })

  it('does NOT count the date alone', () => {
    // The UX-329 round-4 regression, avoided by construction: `handleAddAdjustment`
    // clears minutes/reason/subject on success and leaves the date standing, so
    // counting the date would announce already-recorded hours as unsaved on the
    // next child change — a false warning on the compliance rail that invites
    // entering them twice. A lone date can never produce a row: the handler
    // returns early without minutes and a reason.
    expect(hoursAdjustmentDraftIsEmpty({ ...EMPTY, date: '2026-05-03' })).toBe(true)
  })
})

describe('clearedHoursAdjustmentDraft', () => {
  it('restores every field, the date included', () => {
    expect(clearedHoursAdjustmentDraft('2026-09-10')).toEqual({
      minutes: '',
      reason: '',
      subject: '',
      date: '2026-09-10',
    })
  })
})

describe('hoursAdjustmentSwitchNotice', () => {
  it('says nothing when nothing was dropped', () => {
    expect(hoursAdjustmentSwitchNotice(false, 'Lincoln', 'London')).toBeNull()
  })

  it('names both children and says hours are only recorded on the tap', () => {
    const note = hoursAdjustmentSwitchNotice(true, 'Lincoln', 'London')
    expect(note).toContain('Lincoln')
    expect(note).toContain('London')
    expect(note).toMatch(/wasn't saved/i)
  })

  it('still says the draft was dropped when a name is unknown', () => {
    expect(hoursAdjustmentSwitchNotice(true)).toMatch(/wasn't saved/i)
  })
})
