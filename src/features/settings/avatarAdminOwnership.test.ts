import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ADMIN_DIAMOND_AMOUNT,
  DEFAULT_ADMIN_XP_AMOUNT,
  avatarAdminDraftIsEmpty,
  avatarAdminSwitchNotice,
  clearedAvatarAdminDraft,
} from './avatarAdminOwnership'

describe('avatarAdminDraftIsEmpty (UX-341)', () => {
  it('is empty on an untouched tab', () => {
    expect(avatarAdminDraftIsEmpty(clearedAvatarAdminDraft())).toBe(true)
  })

  it('counts a typed reason', () => {
    expect(avatarAdminDraftIsEmpty({ ...clearedAvatarAdminDraft(), diamondReason: 'tidied up' }))
      .toBe(false)
  })

  it('counts a changed XP amount, and a changed diamond amount', () => {
    // The UX-336 trap, one surface over: a field with a real default that the
    // emptiness check does not read is work the reset destroys without a word.
    expect(avatarAdminDraftIsEmpty({ ...clearedAvatarAdminDraft(), xpAmount: 50 })).toBe(false)
    expect(avatarAdminDraftIsEmpty({ ...clearedAvatarAdminDraft(), diamondAmount: 25 })).toBe(false)
  })

  it('ignores whitespace in the reason', () => {
    expect(avatarAdminDraftIsEmpty({ ...clearedAvatarAdminDraft(), diamondReason: '  ' })).toBe(true)
  })
})

describe('clearedAvatarAdminDraft (UX-341)', () => {
  it('restores both steppers to the values the tab opens on', () => {
    expect(clearedAvatarAdminDraft()).toEqual({
      xpAmount: DEFAULT_ADMIN_XP_AMOUNT,
      diamondAmount: DEFAULT_ADMIN_DIAMOND_AMOUNT,
      diamondReason: '',
    })
  })

  it('returns a new object — the caller’s draft is never mutated', () => {
    expect(clearedAvatarAdminDraft()).not.toBe(clearedAvatarAdminDraft())
  })
})

describe('avatarAdminSwitchNotice (UX-341)', () => {
  it('says nothing when the forms were untouched', () => {
    expect(avatarAdminSwitchNotice(false, 'Lincoln', 'London')).toBeNull()
  })

  it('names both boys and says nothing was granted, XP or diamonds', () => {
    const note = avatarAdminSwitchNotice(true, 'Lincoln', 'London')
    expect(note).toContain('Lincoln')
    expect(note).toContain('London')
    // The one fact the screen cannot show: the recent-events list beside the
    // form belongs to the child now selected, so an absent row there proves
    // nothing about the boy who just left.
    expect(note).toContain('nothing was granted')
    expect(note).toMatch(/XP or diamonds/i)
  })

  it('reads without a name rather than printing undefined', () => {
    const note = avatarAdminSwitchNotice(true)
    expect(note).toContain('cleared')
    expect(note).not.toContain('undefined')
  })
})
