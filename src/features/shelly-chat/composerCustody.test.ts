import { afterEach, describe, expect, it } from 'vitest'

import {
  clearComposerCustody,
  composerDraftIsEmpty,
  COMPOSER_CUSTODY_TTL_MS,
  saveComposerCustody,
  takeComposerCustody,
  type ComposerCustodyOwner,
  type ComposerDraft,
} from './composerCustody'

/**
 * The custody slot's rules, as data — the journeys that use it are in
 * `plannerAskHandoff.route.test.tsx`. What is pinned here is the part a journey
 * cannot show: that a stranger's take leaves the slot alone, and that an empty
 * save clears rather than stores.
 */

const OWNER: ComposerCustodyOwner = {
  familyId: 'fam-1',
  profile: 'parents',
  chatContext: 'lincoln',
  contextChildId: 'child-lincoln',
}

const DRAFT: ComposerDraft = {
  text: 'preserve me',
  attachments: [{ url: 'https://example.com/a.jpg', previewUrl: 'blob:a' }],
  referenceImage: null,
}

afterEach(() => clearComposerCustody())

describe('the composer custody slot', () => {
  it('hands the same draft back in the same place, once', () => {
    saveComposerCustody(OWNER, null, DRAFT)
    expect(takeComposerCustody(OWNER, null)).toEqual({ kind: 'same-thread', draft: DRAFT })
    expect(takeComposerCustody(OWNER, null)).toEqual({ kind: 'none' })
  })

  it('carries the attachments, not only the text', () => {
    saveComposerCustody(OWNER, null, {
      text: '',
      attachments: DRAFT.attachments,
      referenceImage: { url: 'https://example.com/ref.jpg', previewUrl: 'blob:ref' },
    })
    const taken = takeComposerCustody(OWNER, null)
    expect(taken.kind).toBe('same-thread')
    expect(taken.kind === 'same-thread' && taken.draft.attachments).toHaveLength(1)
    expect(taken.kind === 'same-thread' && taken.draft.referenceImage?.url).toContain('ref.jpg')
  })

  it('reports a draft from another conversation as such, instead of placing it', () => {
    saveComposerCustody(OWNER, 'thread-7', DRAFT)
    expect(takeComposerCustody(OWNER, null)).toEqual({ kind: 'other-thread', draft: DRAFT })
  })

  it('tells a stranger nothing, and does not throw her draft away either', () => {
    saveComposerCustody(OWNER, null, DRAFT)
    for (const stranger of [
      { ...OWNER, familyId: 'fam-2' },
      { ...OWNER, profile: 'lincoln' },
      { ...OWNER, profile: null },
      { ...OWNER, chatContext: 'london' },
      { ...OWNER, contextChildId: 'child-london' },
    ]) {
      expect(takeComposerCustody(stranger, null)).toEqual({ kind: 'none' })
    }
    // Still hers, still there.
    expect(takeComposerCustody(OWNER, null)).toEqual({ kind: 'same-thread', draft: DRAFT })
  })

  it('clears rather than stores when there is nothing unsent', () => {
    saveComposerCustody(OWNER, null, DRAFT)
    saveComposerCustody(OWNER, null, { text: '   ', attachments: [], referenceImage: null })
    expect(takeComposerCustody(OWNER, null)).toEqual({ kind: 'none' })
  })

  it('does not hand back a draft from a different visit', () => {
    saveComposerCustody(OWNER, null, DRAFT, Date.now() - COMPOSER_CUSTODY_TTL_MS - 1)
    expect(takeComposerCustody(OWNER, null)).toEqual({ kind: 'none' })
  })

  it('knows what empty means — whitespace is empty, an attachment is not', () => {
    expect(composerDraftIsEmpty({ text: '  \n ', attachments: [], referenceImage: null })).toBe(true)
    expect(composerDraftIsEmpty({ text: '', attachments: DRAFT.attachments, referenceImage: null })).toBe(false)
    expect(
      composerDraftIsEmpty({ text: '', attachments: [], referenceImage: { url: 'u', previewUrl: 'p' } }),
    ).toBe(false)
  })
})
