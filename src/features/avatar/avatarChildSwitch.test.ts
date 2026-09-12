import { describe, expect, it } from 'vitest'

import {
  heroHubDraftIsEmpty,
  heroHubSwitchNotice,
  stagedPhotoSwitchNotice,
} from './avatarChildSwitch'

/**
 * UX-331 / UX-332 — the two avatar-surface RESET rules, tested at the rule.
 *
 * The component halves are pinned separately (`AvatarPhotoUpload.childSwitch`
 * and `MyAvatarPage.childSwitch`); this file is about the sentences and the
 * "was there anything to lose" question they turn on, which is where UX-336's
 * own `DEFAULT_AWARD_TYPE` trap lived.
 */

describe('stagedPhotoSwitchNotice (UX-331)', () => {
  it('says nothing when no photo was staged', () => {
    expect(stagedPhotoSwitchNotice(false, 'Lincoln', 'London')).toBeNull()
  })

  it('names whose photo went and who the form is on now', () => {
    const note = stagedPhotoSwitchNotice(true, 'Lincoln', 'London')
    expect(note).toContain('Lincoln')
    expect(note).toContain('London')
  })

  it('says the art budget was not spent — the one fact the screen cannot show', () => {
    // A parent can see the preview is gone. What they cannot see is whether
    // that cost them one of the week's paid generations. It did not.
    expect(stagedPhotoSwitchNotice(true, 'Lincoln', 'London')).toContain('nothing was spent')
  })

  it('still says the photo was cleared when no names are known', () => {
    const note = stagedPhotoSwitchNotice(true)
    expect(note).toContain('cleared')
    expect(note).not.toContain('undefined')
  })
})

describe('heroHubDraftIsEmpty (UX-332)', () => {
  it('is empty on an untouched page — so a switch raises no notice', () => {
    expect(heroHubDraftIsEmpty({ hasScreenshot: false, tunerOpen: false })).toBe(true)
  })

  it('is not empty with a captured screenshot', () => {
    expect(heroHubDraftIsEmpty({ hasScreenshot: true, tunerOpen: false })).toBe(false)
  })

  it('is not empty with the tuner open', () => {
    expect(heroHubDraftIsEmpty({ hasScreenshot: false, tunerOpen: true })).toBe(false)
  })
})

describe('heroHubSwitchNotice (UX-332)', () => {
  it('says nothing when there was nothing to lose', () => {
    expect(heroHubSwitchNotice({ hasScreenshot: false, tunerOpen: false }, 'Lincoln', 'London'))
      .toBeNull()
  })

  it('names the picture when that is what went', () => {
    const note = heroHubSwitchNotice({ hasScreenshot: true, tunerOpen: false }, 'Lincoln', 'London')
    expect(note).toContain('picture')
    expect(note).not.toContain('sliders')
  })

  it('names the sliders when that is what went', () => {
    const note = heroHubSwitchNotice({ hasScreenshot: false, tunerOpen: true }, 'Lincoln', 'London')
    expect(note).toContain('sliders')
    expect(note).not.toContain('picture')
  })

  it('names both when both went, and whose they were', () => {
    const note = heroHubSwitchNotice({ hasScreenshot: true, tunerOpen: true }, 'Lincoln', 'London')
    expect(note).toContain('picture')
    expect(note).toContain('sliders')
    expect(note).toContain("Lincoln's")
    expect(note).toContain('London')
  })

  it('reads without a name rather than printing undefined', () => {
    const note = heroHubSwitchNotice({ hasScreenshot: true, tunerOpen: false })
    expect(note).not.toContain('undefined')
    expect(note).toContain('nothing was saved')
  })
})
