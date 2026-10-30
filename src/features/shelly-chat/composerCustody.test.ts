import { afterEach, describe, expect, it } from 'vitest'

import {
  clearComposerCustody,
  composerDraftIsEmpty,
  COMPOSER_CUSTODY_TTL_MS,
  EMPTY_COMPOSER_DRAFT,
  peekComposerCustody,
  saveComposerCustody,
  takeComposerCustody,
  type ComposerCustodyOwner,
  type ComposerDraft,
} from './composerCustody'

/**
 * The slot's rules. The journeys are in `plannerAskHandoff.route.test.tsx`;
 * what is pinned here is what a journey cannot show — that a stranger's save or
 * take never destroys someone else's work, which is the StrictMode wipe the
 * second browser run found.
 */

const OWNER: ComposerCustodyOwner = {
  familyId: 'fam-1',
  profile: 'parents',
  chatContext: 'lincoln',
  contextChildId: 'child-lincoln',
}

const FULL: ComposerDraft = {
  text: 'preserve me',
  attachments: [{ url: 'https://example.com/a.jpg', previewUrl: 'blob:a' }],
  referenceImage: { url: 'https://example.com/ref.jpg', previewUrl: 'blob:ref' },
  uploadFiles: [new File(['x'], 'page.png', { type: 'image/png' })],
  uploadPreviews: ['blob:preview'],
  uploadDialogOpen: true,
  imageFlowOpen: true,
  imageFlowStep: 'questions',
  imageIdea: 'a reading corner poster',
  imageQuestions: [{ question: 'What style?', options: ['Cartoon'] }],
  imageAnswers: { 0: 'Cartoon' },
}

afterEach(() => clearComposerCustody())

describe('the composer custody slot', () => {
  it('carries every kind of unsent work, not just the text', () => {
    saveComposerCustody(OWNER, null, FULL)
    const taken = takeComposerCustody(OWNER, null)
    expect(taken.kind).toBe('same-thread')
    if (taken.kind !== 'same-thread') return
    expect(taken.draft).toEqual(FULL)
    // Read once.
    expect(takeComposerCustody(OWNER, null)).toEqual({ kind: 'none' })
  })

  it('knows what empty means across every field', () => {
    expect(composerDraftIsEmpty(EMPTY_COMPOSER_DRAFT)).toBe(true)
    expect(composerDraftIsEmpty({ ...EMPTY_COMPOSER_DRAFT, text: ' \n ' })).toBe(true)
    for (const over of [
      { text: 'x' },
      { attachments: FULL.attachments },
      { referenceImage: FULL.referenceImage },
      { uploadFiles: FULL.uploadFiles },
      { uploadPreviews: FULL.uploadPreviews },
      { uploadDialogOpen: true },
      { imageFlowOpen: true },
      { imageIdea: 'idea' },
      { imageQuestions: FULL.imageQuestions },
      { imageAnswers: FULL.imageAnswers },
    ]) {
      expect(composerDraftIsEmpty({ ...EMPTY_COMPOSER_DRAFT, ...over }), JSON.stringify(Object.keys(over))).toBe(false)
    }
  })

  it('never destroys another owner’s work — the StrictMode wipe', () => {
    saveComposerCustody(OWNER, null, FULL)
    // A pass that runs before the tab has settled saves an empty general draft.
    saveComposerCustody({ ...OWNER, chatContext: 'general', contextChildId: '' }, null, EMPTY_COMPOSER_DRAFT)
    expect(takeComposerCustody(OWNER, null).kind).toBe('same-thread')
  })

  it('clears its own entry when she empties the box', () => {
    saveComposerCustody(OWNER, null, FULL)
    saveComposerCustody(OWNER, null, EMPTY_COMPOSER_DRAFT)
    expect(takeComposerCustody(OWNER, null)).toEqual({ kind: 'none' })
  })

  it('reports a cross-conversation draft without consuming it', () => {
    saveComposerCustody(OWNER, 'thread-7', FULL)
    // An ordinary revisit cannot show it, so it stays put — not consume-and-drop.
    expect(takeComposerCustody(OWNER, null).kind).toBe('other-thread')
    expect(peekComposerCustody(OWNER, null).kind).toBe('other-thread')
    // Only a caller that can offer it takes it.
    expect(takeComposerCustody(OWNER, null, { acceptOtherThread: true }).kind).toBe('other-thread')
    expect(peekComposerCustody(OWNER, null)).toEqual({ kind: 'none' })
  })

  it('tells a stranger nothing, and leaves her draft alone', () => {
    saveComposerCustody(OWNER, null, FULL)
    for (const stranger of [
      { ...OWNER, familyId: 'fam-2' },
      { ...OWNER, profile: 'lincoln' },
      { ...OWNER, profile: null },
      { ...OWNER, chatContext: 'london' },
      { ...OWNER, contextChildId: 'child-london' },
    ]) {
      expect(takeComposerCustody(stranger, null)).toEqual({ kind: 'none' })
      expect(peekComposerCustody(stranger, null)).toEqual({ kind: 'none' })
    }
    expect(takeComposerCustody(OWNER, null).kind).toBe('same-thread')
  })

  it('does not hand back work from a different visit', () => {
    saveComposerCustody(OWNER, null, FULL, Date.now() - COMPOSER_CUSTODY_TTL_MS - 1)
    expect(takeComposerCustody(OWNER, null)).toEqual({ kind: 'none' })
  })

  it('hands back a copy, so a later edit cannot reach into the slot', () => {
    const live: ComposerDraft = { ...FULL, attachments: [...FULL.attachments] }
    saveComposerCustody(OWNER, null, live)
    live.attachments.push({ url: 'https://example.com/b.jpg', previewUrl: 'blob:b' })
    const taken = takeComposerCustody(OWNER, null)
    expect(taken.kind === 'same-thread' && taken.draft.attachments).toHaveLength(1)
  })
})
