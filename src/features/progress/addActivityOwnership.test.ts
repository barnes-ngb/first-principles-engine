import { describe, expect, it } from 'vitest'

import {
  EMPTY_ADD_ACTIVITY_DRAFT,
  addActivityDraftIsEmpty,
  addActivitySwitchNotice,
  type AddActivityDraft,
} from './addActivityOwnership'

/** A draft with one field changed from the opening state. */
function withField<K extends keyof AddActivityDraft>(
  key: K,
  value: AddActivityDraft[K],
): AddActivityDraft {
  return { ...EMPTY_ADD_ACTIVITY_DRAFT, [key]: value }
}

describe('addActivityDraftIsEmpty (UX-335)', () => {
  it('is empty on an untouched dialog', () => {
    expect(addActivityDraftIsEmpty(EMPTY_ADD_ACTIVITY_DRAFT)).toBe(true)
  })

  it('sees every field a person can touch', () => {
    // The trap this exists for is the tenth field: UX-336 shipped with
    // `awardType` unread because it has a real default, and an unread field is
    // work the reset destroys without a word. Each of these must count.
    const touched: AddActivityDraft[] = [
      withField('name', 'The Good and the Beautiful Math K'),
      withField('type', 'strand'),
      withField('subject', 'Math'),
      withField('minutes', 30),
      withField('frequency', '3x'),
      withField('scannable', false),
      withField('totalUnits', '120'),
      withField('currentPosition', '14'),
      withField('quickLog', true),
    ]
    for (const draft of touched) {
      expect(addActivityDraftIsEmpty(draft)).toBe(false)
    }
    // …and that list is every field on the draft, so a new one fails here.
    expect(touched).toHaveLength(Object.keys(EMPTY_ADD_ACTIVITY_DRAFT).length)
  })

  it('treats whitespace in the free-text fields as untouched', () => {
    expect(addActivityDraftIsEmpty(withField('name', '   '))).toBe(true)
    expect(addActivityDraftIsEmpty(withField('totalUnits', '  '))).toBe(true)
  })
})

describe('addActivitySwitchNotice (UX-335)', () => {
  it('says nothing when the dialog was untouched', () => {
    expect(addActivitySwitchNotice(false, 'Lincoln', 'London')).toBeNull()
  })

  it('names whose activity went, and whose curriculum the form now adds to', () => {
    const note = addActivitySwitchNotice(true, 'Lincoln', 'London')
    expect(note).toContain('Lincoln')
    expect(note).toContain('London')
    expect(note).toContain('never added')
  })

  it('reads without a name rather than printing undefined', () => {
    const note = addActivitySwitchNotice(true)
    expect(note).toContain('cleared')
    expect(note).not.toContain('undefined')
  })
})

describe('EMPTY_ADD_ACTIVITY_DRAFT (UX-335)', () => {
  it('opens scannable, because it opens on workbook — the two move together', () => {
    expect(EMPTY_ADD_ACTIVITY_DRAFT.type).toBe('workbook')
    expect(EMPTY_ADD_ACTIVITY_DRAFT.scannable).toBe(true)
  })

  it('opens with the quick-log flag off (FEAT-199)', () => {
    expect(EMPTY_ADD_ACTIVITY_DRAFT.quickLog).toBe(false)
  })
})
