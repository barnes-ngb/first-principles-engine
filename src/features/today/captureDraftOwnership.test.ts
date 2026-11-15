import { describe, it, expect } from 'vitest'

import type { CaptureDraftClaim, CaptureDraftState } from './captureDraftOwnership'
import {
  classifyDraftClaim,
  captureSuccessText,
  captureUnsavedText,
  captureErrorText,
} from './captureDraftOwnership'

const claim: CaptureDraftClaim = {
  visit: 1,
  revision: 3,
  childName: 'Lincoln',
  day: '2026-09-15',
}

describe('classifyDraftClaim', () => {
  it('returns owned when visit and revision both match', () => {
    const current: CaptureDraftState = { visit: 1, revision: 3 }
    expect(classifyDraftClaim(claim, current)).toBe('owned')
  })

  it('returns draft-changed when same visit but different revision', () => {
    const current: CaptureDraftState = { visit: 1, revision: 5 }
    expect(classifyDraftClaim(claim, current)).toBe('draft-changed')
  })

  it('returns scope-changed when visit differs', () => {
    const current: CaptureDraftState = { visit: 2, revision: 3 }
    expect(classifyDraftClaim(claim, current)).toBe('scope-changed')
  })

  it('returns scope-changed when BOTH visit and revision differ (scope wins)', () => {
    const current: CaptureDraftState = { visit: 4, revision: 9 }
    expect(classifyDraftClaim(claim, current)).toBe('scope-changed')
  })
})

describe('captureSuccessText', () => {
  const base = 'Captured + 19 min logged'

  it('returns base unchanged for owned verdict', () => {
    expect(captureSuccessText(base, 'owned', claim)).toBe(base)
  })

  it('appends "that earlier capture saved" for draft-changed', () => {
    const text = captureSuccessText(base, 'draft-changed', claim)
    expect(text).toContain(base)
    expect(text).toContain('that earlier capture saved')
    expect(text).toContain('not saved yet')
  })

  it('names the child and day for scope-changed', () => {
    const text = captureSuccessText(base, 'scope-changed', claim)
    expect(text).toContain(base)
    expect(text).toContain('Lincoln')
    expect(text).toContain('2026-09-15')
    expect(text).toContain('untouched')
  })
})

describe('captureUnsavedText', () => {
  const base = 'Hours could not be saved'

  it('returns base unchanged for owned verdict', () => {
    expect(captureUnsavedText(base, 'owned', claim)).toBe(base)
  })

  it('says "that was the capture you submitted earlier" for draft-changed', () => {
    const text = captureUnsavedText(base, 'draft-changed', claim)
    expect(text).toContain(base)
    expect(text).toContain('capture you submitted earlier')
    expect(text).toContain('newer edits are still here')
  })

  it('names the child and day for scope-changed', () => {
    const text = captureUnsavedText(base, 'scope-changed', claim)
    expect(text).toContain(base)
    expect(text).toContain("Lincoln's capture")
    expect(text).toContain('2026-09-15')
    expect(text).toContain('untouched')
  })
})

describe('captureErrorText', () => {
  const base = 'Photo upload failed.'

  it('returns base unchanged for owned verdict', () => {
    expect(captureErrorText(base, 'owned', claim)).toBe(base)
  })

  it('says "that was the capture you submitted earlier" for draft-changed', () => {
    const text = captureErrorText(base, 'draft-changed', claim)
    expect(text).toContain(base)
    expect(text).toContain('capture you submitted earlier')
    expect(text).toContain('newer edits are still here')
  })

  it('names the child and day for scope-changed', () => {
    const text = captureErrorText(base, 'scope-changed', claim)
    expect(text).toContain(base)
    expect(text).toContain("Lincoln's capture")
    expect(text).toContain('2026-09-15')
    expect(text).toContain('untouched')
  })

  it('error suffix is a separate sentence (base ends with period)', () => {
    const text = captureErrorText(base, 'draft-changed', claim)
    // base ends with ".", suffix starts with a capital letter after a space
    expect(text.startsWith('Photo upload failed. That')).toBe(true)
  })
})
