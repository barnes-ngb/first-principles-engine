import { describe, expect, it } from 'vitest'

import {
  confirmFailureNotice,
  lateReplyNotice,
  PendingDropReason,
  pendingDropNotice,
  supersededNotice,
} from './pendingLifecycle'

describe('supersededNotice (UX-33a)', () => {
  it('says nothing when nothing was pending', () => {
    expect(supersededNotice(0)).toBeNull()
    expect(supersededNotice(-1)).toBeNull()
  })

  it('accounts for the cards a new reply replaced', () => {
    const notice = supersededNotice(2)
    expect(notice).toContain('2 suggestions')
    expect(notice).toContain('Nothing was changed')
    expect(notice).toContain('Ask again')
  })

  it('reads singular for one card', () => {
    const notice = supersededNotice(1)
    expect(notice).toContain('1 suggestion ')
    expect(notice).not.toContain('suggestions')
    expect(notice).toContain('is gone')
  })
})

describe('pendingDropNotice (UX-33b)', () => {
  it('says nothing when nothing was pending', () => {
    expect(pendingDropNotice(PendingDropReason.ContextSwitch, 0, 'Lincoln')).toBeNull()
    expect(pendingDropNotice(PendingDropReason.ThreadSwitch, 0)).toBeNull()
  })

  it('names the child the cards were for on a tab switch', () => {
    const notice = pendingDropNotice(PendingDropReason.ContextSwitch, 1, 'Lincoln')
    expect(notice).toContain('for Lincoln')
    expect(notice).toContain('switching tabs')
    expect(notice).toContain('Nothing was changed')
  })

  it('drops the possessive rather than inventing a name (UX-34 rule)', () => {
    const notice = pendingDropNotice(PendingDropReason.ContextSwitch, 1)
    expect(notice).toContain('for the tab you were on')
    expect(notice).not.toMatch(/this child|someone/i)
  })

  it('names the conversation, not a child, on a thread switch', () => {
    const notice = pendingDropNotice(PendingDropReason.ThreadSwitch, 3, 'Lincoln')
    expect(notice).toContain('3 suggestions')
    expect(notice).toContain('conversation')
    expect(notice).not.toContain('Lincoln')
  })

  it('says WHY, not just that it happened — the card can only be confirmed where it was proposed', () => {
    for (const reason of [PendingDropReason.ContextSwitch, PendingDropReason.ThreadSwitch]) {
      expect(pendingDropNotice(reason, 1, 'Lincoln')).toMatch(/can only be confirmed/)
    }
  })
})

describe('confirmFailureNotice (UX-33c)', () => {
  it('is the UX-83 shape: what failed, nothing changed, what to do', () => {
    const notice = confirmFailureNotice()
    expect(notice).toMatch(/didn't save/)
    expect(notice).toContain('nothing was changed')
    expect(notice).toMatch(/try again/)
  })
})

describe('lateReplyNotice (Codex P1, PR #1706)', () => {
  it('says the reply outlived its conversation, that nothing changed, and what to do', () => {
    const notice = lateReplyNotice()
    expect(notice).toMatch(/already left/)
    expect(notice).toContain('Nothing was changed')
    expect(notice).toContain('Ask again')
  })

  it('withholds the SUGGESTIONS, never claiming the reply itself was lost', () => {
    expect(lateReplyNotice()).toContain('suggestions')
  })
})
