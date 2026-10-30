import { afterEach, describe, expect, it } from 'vitest'

import {
  clearComposerCustody,
  composerDraftIsEmpty,
  COMPOSER_CUSTODY_TTL_MS,
  currentComposerCustodySession,
  EMPTY_COMPOSER_DRAFT,
  endComposerCustodySession,
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

  it('refuses work from a sign-in that is over, however late it arrives', () => {
    // The logout case, as a rule rather than as an ordering. The composer hands
    // its unsent work over in its UNMOUNT cleanup and a logout IS that unmount,
    // so the save and the invalidation race; an upload or image callback that
    // outlived the route is the same shape one step later.
    const session = currentComposerCustodySession()
    endComposerCustodySession()

    saveComposerCustody(OWNER, null, FULL, Date.now(), session)

    expect(peekComposerCustody(OWNER, null)).toEqual({ kind: 'none' })
    // And the next sign-in can still save and read its own work.
    saveComposerCustody(OWNER, null, FULL)
    expect(takeComposerCustody(OWNER, null).kind).toBe('same-thread')
  })

  it('empties the slot when a sign-in ends, not only on the next save', () => {
    saveComposerCustody(OWNER, null, FULL)
    endComposerCustodySession()
    expect(peekComposerCustody(OWNER, null)).toEqual({ kind: 'none' })
  })

  it('keeps an ordinary scope change saveable — clearing is not ending', () => {
    // A child or tab change inside one sign-in clears the slot, but her
    // composer is still mounted and must be able to hand its work over later.
    const session = currentComposerCustodySession()
    saveComposerCustody(OWNER, null, FULL)
    clearComposerCustody()
    saveComposerCustody(OWNER, null, FULL, Date.now(), session)
    expect(takeComposerCustody(OWNER, null).kind).toBe('same-thread')
  })

  it('hands an interrupted refinement back at the idea, with the idea intact', () => {
    // The third browser run's blocker: she tapped Next, the question request was
    // still running when she left, and `loadingQuestions` is not carried — so the
    // `questions` stage came back with no questions, no input, no Next and no
    // Generate. Only the close button, which discards the idea.
    const pending: ComposerDraft = {
      ...FULL,
      text: '',
      imageFlowStep: 'questions',
      imageQuestions: [],
      imageAnswers: {},
      uploadFiles: [],
      uploadPreviews: [],
      uploadDialogOpen: false,
    }
    saveComposerCustody(OWNER, null, pending)
    const taken = takeComposerCustody(OWNER, null)
    expect(taken.kind).toBe('same-thread')
    if (taken.kind !== 'same-thread') return
    expect(taken.draft.imageFlowStep).toBe('idea')
    // Verbatim, and with everything a retry needs still attached.
    expect(taken.draft.imageIdea).toBe(FULL.imageIdea)
    expect(taken.draft.referenceImage).toEqual(FULL.referenceImage)
    expect(taken.draft.imageFlowOpen).toBe(true)
  })

  it('drops answers that no longer have a question to belong to', () => {
    // They are keyed by position; a retry's questions are a different list.
    saveComposerCustody(OWNER, null, { ...FULL, imageFlowStep: 'questions', imageQuestions: [] })
    const taken = takeComposerCustody(OWNER, null)
    expect(taken.kind === 'same-thread' && taken.draft.imageAnswers).toEqual({})
  })

  it('leaves questions that arrived, and the answers she gave them, alone', () => {
    saveComposerCustody(OWNER, null, FULL)
    const taken = takeComposerCustody(OWNER, null)
    expect(taken.kind).toBe('same-thread')
    if (taken.kind !== 'same-thread') return
    expect(taken.draft.imageFlowStep).toBe('questions')
    expect(taken.draft.imageQuestions).toEqual(FULL.imageQuestions)
    expect(taken.draft.imageAnswers).toEqual(FULL.imageAnswers)
  })

  it('returns an interrupted generation to the answers it was generating from', () => {
    // `generating` renders a spinner and nothing else, so it is the same dead
    // form one stage further on — but her answers are complete, so winding back
    // to the idea would throw them away.
    saveComposerCustody(OWNER, null, { ...FULL, imageFlowStep: 'generating' })
    const taken = takeComposerCustody(OWNER, null)
    expect(taken.kind).toBe('same-thread')
    if (taken.kind !== 'same-thread') return
    expect(taken.draft.imageFlowStep).toBe('questions')
    expect(taken.draft.imageAnswers).toEqual(FULL.imageAnswers)
  })

  it('hands an interrupted upload back in the chooser it was started from', () => {
    // The same boundary's second case: Attach was tapped, the upload was still
    // running when she left, and `uploading` is not carried — so the raw files
    // and their previews came back with no dialog to show them in.
    const pending: ComposerDraft = {
      ...FULL,
      uploadDialogOpen: false,
      imageFlowOpen: false,
      imageFlowStep: 'idea',
      imageIdea: '',
      imageQuestions: [],
      imageAnswers: {},
    }
    saveComposerCustody(OWNER, null, pending)
    const taken = takeComposerCustody(OWNER, null)
    expect(taken.kind).toBe('same-thread')
    if (taken.kind !== 'same-thread') return
    expect(taken.draft.uploadDialogOpen).toBe(true)
    expect(taken.draft.uploadFiles).toEqual(FULL.uploadFiles)
    expect(taken.draft.uploadPreviews).toEqual(FULL.uploadPreviews)
    // An earlier batch that DID finish is hers too, and is not re-offered.
    expect(taken.draft.attachments).toEqual(FULL.attachments)
  })

  it('does not read a finished attachment as the raw files being done', () => {
    // The inference that would lose the work: `attachments` is non-empty from an
    // EARLIER batch, which says nothing about the files still in the chooser.
    saveComposerCustody(OWNER, null, {
      ...EMPTY_COMPOSER_DRAFT,
      attachments: FULL.attachments,
      uploadFiles: FULL.uploadFiles,
      uploadPreviews: FULL.uploadPreviews,
    })
    const taken = takeComposerCustody(OWNER, null)
    expect(taken.kind === 'same-thread' && taken.draft.uploadDialogOpen).toBe(true)
  })

  it('leaves a draft with nothing in flight exactly as it was', () => {
    // The ordinary hand-off, which is most of them: normalizing is not meant to
    // be something she can notice on a draft that was not interrupted.
    const ordinary: ComposerDraft = {
      ...EMPTY_COMPOSER_DRAFT,
      text: 'what should Lincoln work on next?',
      attachments: FULL.attachments,
    }
    saveComposerCustody(OWNER, null, ordinary)
    expect(takeComposerCustody(OWNER, null)).toEqual({ kind: 'same-thread', draft: ordinary })
  })

  it('hands back a copy, so a later edit cannot reach into the slot', () => {
    const live: ComposerDraft = { ...FULL, attachments: [...FULL.attachments] }
    saveComposerCustody(OWNER, null, live)
    live.attachments.push({ url: 'https://example.com/b.jpg', previewUrl: 'blob:b' })
    const taken = takeComposerCustody(OWNER, null)
    expect(taken.kind === 'same-thread' && taken.draft.attachments).toHaveLength(1)
  })
})
