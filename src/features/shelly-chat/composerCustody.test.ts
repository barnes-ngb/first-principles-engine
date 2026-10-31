import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  adoptRestoredUploadPreviews,
  advanceComposerCustodyThread,
  clearComposerCustody,
  composerDraftIsEmpty,
  COMPOSER_CUSTODY_TTL_MS,
  currentComposerCustodySession,
  EMPTY_COMPOSER_DRAFT,
  endComposerCustodySession,
  peekComposerCustody,
  peekDisplacedComposerCustody,
  saveComposerCustody,
  saveDisplacedComposerCustody,
  takeComposerCustody,
  takeDisplacedComposerCustody,
  type ComposerCustodyOrigin,
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

/**
 * A carried hand-off's guard metadata, as the receiver hands it over.
 *
 * Custody never interprets it, so what the slot owes it is a verbatim round
 * trip: the identity the question was ACCEPTED under is what makes a later scope
 * change read as a revocation rather than as a fresh arrival, and a field this
 * module quietly dropped or re-stamped would be that check reading a lie.
 */
const ORIGIN: ComposerCustodyOrigin = {
  handoff: {
    familyId: 'fam-1',
    childId: 'child-lincoln',
    childName: 'Lincoln',
    weekStart: '2026-11-02',
    question: 'add TGTB Math Level 1, 30 minutes daily',
    jobId: 'curriculum',
    generation: 3,
    stagedAt: 1_762_000_000_000,
  },
  receiver: {
    familyId: 'fam-1',
    profile: 'parents',
    chatContext: 'lincoln',
    contextChildId: 'child-lincoln',
    threadId: null,
  },
  activeChildId: 'child-lincoln',
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

  it('can be looked at as often as it takes, and is consumed by the placement only', () => {
    // The shape the receiver was repaired into: a cross-conversation draft is
    // PEEKED on arrival, left where it is through every early return the
    // hand-off can make — refused, expired, or a saved conversation she stays
    // in — and taken at the one point something PLACES it. So looking has to be
    // free, and the take has to be once.
    saveComposerCustody(OWNER, 'thread-7', FULL)
    for (let i = 0; i < 3; i += 1) {
      expect(peekComposerCustody(OWNER, null).kind, `peek ${i + 1}`).toBe('other-thread')
    }

    const placed = takeComposerCustody(OWNER, null, { acceptOtherThread: true })
    expect(placed.kind).toBe('other-thread')
    expect(placed.kind === 'other-thread' && placed.draft).toEqual(FULL)
    // A second pass, a replay, a second reader: there is nothing left to place.
    expect(takeComposerCustody(OWNER, null, { acceptOtherThread: true })).toEqual({ kind: 'none' })
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
    // The WHOLE look, `origin` included: an ordinary draft is hers and carries
    // no guard, and `null` is the answer the receiver acts on. Asserted as an
    // exact object rather than matched loosely, so a field added to this shape
    // has to be stated here — a `toMatchObject` would have let the new one
    // through unread, which is the opposite of what these tests are for.
    expect(takeComposerCustody(OWNER, null)).toEqual({
      kind: 'same-thread',
      draft: ordinary,
      origin: null,
    })
  })

  it('hands back a copy, so a later edit cannot reach into the slot', () => {
    const live: ComposerDraft = { ...FULL, attachments: [...FULL.attachments] }
    saveComposerCustody(OWNER, null, live)
    live.attachments.push({ url: 'https://example.com/b.jpg', previewUrl: 'blob:b' })
    const taken = takeComposerCustody(OWNER, null)
    expect(taken.kind === 'same-thread' && taken.draft.attachments).toHaveLength(1)
  })
})

describe('the set-aside home, beside the box', () => {
  /**
   * Why there are two homes rather than one.
   *
   * The hand-off has two drafts in flight — the one in the box and the one the
   * question pushed out of it — and with a single slot whichever was saved last
   * won. Point `saveDisplacedComposerCustody` at the ordinary slot instead of
   * this one and the first test here fails: that is the positive control for
   * the whole pair.
   */
  const HERS: ComposerDraft = { ...EMPTY_COMPOSER_DRAFT, text: 'the draft she set aside' }
  const EDITED: ComposerDraft = { ...EMPTY_COMPOSER_DRAFT, text: 'the question, as she edited it' }

  it('keeps the two apart, so saving one is never what loses the other', () => {
    saveDisplacedComposerCustody(OWNER, null, HERS, 'mine')
    saveComposerCustody(OWNER, null, EDITED)

    expect(takeComposerCustody(OWNER, null)).toEqual({
      kind: 'same-thread',
      draft: EDITED,
      origin: null,
    })
    expect(takeDisplacedComposerCustody(OWNER)).toEqual({
      kind: 'held',
      draft: HERS,
      threadId: null,
      holds: 'mine',
      origin: null,
    })
  })

  it('is read once, like the box’s own slot', () => {
    saveDisplacedComposerCustody(OWNER, null, HERS, 'mine')
    expect(peekDisplacedComposerCustody(OWNER).kind).toBe('held')
    expect(takeDisplacedComposerCustody(OWNER).kind).toBe('held')
    expect(takeDisplacedComposerCustody(OWNER)).toEqual({ kind: 'none' })
  })

  it('hands back the conversation it was displaced in, and does not key on it', () => {
    // A restore is an explicit tap into the box she is looking at, and the
    // thread of a fresh conversation moves the moment she sends — so the
    // conversation travels as a fact rather than as a lock.
    saveDisplacedComposerCustody(OWNER, 'thread-7', HERS, 'mine')
    expect(peekDisplacedComposerCustody(OWNER)).toEqual({
      kind: 'held',
      draft: HERS,
      threadId: 'thread-7',
      holds: 'mine',
      origin: null,
    })
  })

  it('remembers WHICH draft it is holding', () => {
    // After a restore the two have swapped and what is set aside is the
    // question as she edited it. The note on screen names it, so the slot has
    // to know which it has.
    saveDisplacedComposerCustody(OWNER, null, EDITED, 'question')
    expect(peekDisplacedComposerCustody(OWNER)).toMatchObject({ holds: 'question' })
  })

  it('tells a stranger nothing, and leaves the draft where it is', () => {
    saveDisplacedComposerCustody(OWNER, null, HERS, 'mine')
    for (const stranger of [
      { ...OWNER, familyId: 'fam-2' },
      { ...OWNER, profile: 'lincoln' },
      { ...OWNER, chatContext: 'london' },
      { ...OWNER, contextChildId: 'child-london' },
    ]) {
      expect(takeDisplacedComposerCustody(stranger)).toEqual({ kind: 'none' })
    }
    expect(peekDisplacedComposerCustody(OWNER).kind).toBe('held')
  })

  it('clears only its own entry when the draft it holds is emptied', () => {
    saveComposerCustody(OWNER, null, EDITED)
    saveDisplacedComposerCustody(OWNER, null, HERS, 'mine')
    saveDisplacedComposerCustody(OWNER, null, EMPTY_COMPOSER_DRAFT, 'mine')

    expect(peekDisplacedComposerCustody(OWNER)).toEqual({ kind: 'none' })
    expect(peekComposerCustody(OWNER, null).kind).toBe('same-thread')
  })

  it('obeys the same sign-in and visit limits as the box', () => {
    const session = currentComposerCustodySession()
    saveDisplacedComposerCustody(OWNER, null, HERS, 'mine')
    endComposerCustodySession()
    // Emptied by the ending, and a save still in flight from it is refused.
    expect(peekDisplacedComposerCustody(OWNER)).toEqual({ kind: 'none' })
    saveDisplacedComposerCustody(OWNER, null, HERS, 'mine', Date.now(), session)
    expect(peekDisplacedComposerCustody(OWNER)).toEqual({ kind: 'none' })

    saveDisplacedComposerCustody(OWNER, null, HERS, 'mine', Date.now() - COMPOSER_CUSTODY_TTL_MS - 1)
    expect(peekDisplacedComposerCustody(OWNER)).toEqual({ kind: 'none' })
  })

  it('winds an interrupted stage back on the way in, exactly as the box does', () => {
    saveDisplacedComposerCustody(
      OWNER,
      null,
      { ...FULL, imageFlowStep: 'generating' },
      'mine',
    )
    const taken = takeDisplacedComposerCustody(OWNER)
    expect(taken.kind === 'held' && taken.draft.imageFlowStep).toBe('questions')
    expect(taken.kind === 'held' && taken.draft.uploadDialogOpen).toBe(true)
  })

  it('is dropped by the scope observer’s clear, like everything else here', () => {
    saveDisplacedComposerCustody(OWNER, null, HERS, 'mine')
    clearComposerCustody()
    expect(peekDisplacedComposerCustody(OWNER)).toEqual({ kind: 'none' })
  })
})

describe('the guard a carried draft travels with', () => {
  /**
   * The release review's behavioural blocker, at the slot's own level: a
   * restored question that came back without its authority was ordinary text in
   * a box, and a Send from another child's tab wrote that child's conversation
   * while the words still named the first. So the guard travels WITH the draft,
   * and what is pinned here is that this module hands it back unchanged — it is
   * carried, never interpreted.
   */
  const QUESTION: ComposerDraft = { ...EMPTY_COMPOSER_DRAFT, text: 'the question, as she edited it' }
  const HERS: ComposerDraft = { ...EMPTY_COMPOSER_DRAFT, text: 'the draft she set aside' }

  it('round-trips the origin through the box’s slot, field for field', () => {
    saveComposerCustody(OWNER, null, QUESTION, Date.now(), currentComposerCustodySession(), ORIGIN)
    expect(takeComposerCustody(OWNER, null)).toEqual({
      kind: 'same-thread',
      draft: QUESTION,
      origin: ORIGIN,
    })
  })

  it('round-trips it through the set-aside home too, because a set-aside question is still one', () => {
    saveDisplacedComposerCustody(
      OWNER,
      null,
      QUESTION,
      'question',
      Date.now(),
      currentComposerCustodySession(),
      ORIGIN,
    )
    expect(takeDisplacedComposerCustody(OWNER)).toEqual({
      kind: 'held',
      draft: QUESTION,
      threadId: null,
      holds: 'question',
      origin: ORIGIN,
    })
  })

  it('offers a cross-conversation draft with its origin, rather than stripping it', () => {
    // The receiver's rule is that a carried question is only PLACED where its
    // guard can be rebuilt with it, which it can only decide if the look says
    // there is one.
    saveComposerCustody(OWNER, 'thread-7', QUESTION, Date.now(), currentComposerCustodySession(), ORIGIN)
    expect(peekComposerCustody(OWNER, null)).toEqual({
      kind: 'other-thread',
      draft: QUESTION,
      origin: ORIGIN,
    })
  })

  describe('and the conversation her own Attach minted for it', () => {
    /**
     * The closeout's blocker, from the slot's side. A fresh conversation has no
     * id, so everything about this work is stamped `null`; her explicit "Attach
     * to my message" creates the thread document without her going anywhere, and
     * a slot still naming `null` then disagrees with the live composer about
     * where its work is. The entry moves, the IDENTITY does not.
     */
    it('moves both homes’ stamp and the carried origin’s conversation', () => {
      saveComposerCustody(OWNER, null, QUESTION, Date.now(), currentComposerCustodySession(), ORIGIN)
      saveDisplacedComposerCustody(
        OWNER,
        null,
        HERS,
        'question',
        Date.now(),
        currentComposerCustodySession(),
        ORIGIN,
      )

      advanceComposerCustodyThread(OWNER, null, 'minted-1')

      const box = peekComposerCustody(OWNER, 'minted-1')
      expect(box.kind).toBe('same-thread')
      // Everything the identity is made of is untouched — only the conversation
      // moved, and only from the fresh one it actually named.
      expect(box.kind !== 'none' && box.origin).toEqual({
        ...ORIGIN,
        receiver: { ...ORIGIN.receiver, threadId: 'minted-1' },
      })
      const aside = peekDisplacedComposerCustody(OWNER)
      expect(aside.kind === 'held' && aside.threadId).toBe('minted-1')
      expect(aside.kind === 'held' && aside.origin?.receiver.threadId).toBe('minted-1')
      expect(aside.kind === 'held' && aside.origin?.handoff).toEqual(ORIGIN.handoff)
      expect(aside.kind === 'held' && aside.holds).toBe('question')
    })

    it('leaves an entry that names a different conversation exactly where it is', () => {
      // The one-way bound that keeps this from being a free re-address: an entry
      // already in a saved conversation was not in the one that just got an id.
      saveComposerCustody(OWNER, 'thread-7', QUESTION, Date.now(), currentComposerCustodySession(), ORIGIN)
      advanceComposerCustodyThread(OWNER, null, 'minted-1')
      expect(peekComposerCustody(OWNER, 'thread-7')).toEqual({
        kind: 'same-thread',
        draft: QUESTION,
        origin: ORIGIN,
      })
    })

    it('never re-addresses a stranger’s work, or work from a sign-in that has ended', () => {
      saveComposerCustody(OWNER, null, QUESTION, Date.now(), currentComposerCustodySession(), ORIGIN)
      for (const stranger of [
        { ...OWNER, familyId: 'fam-2' },
        { ...OWNER, profile: 'lincoln' },
        { ...OWNER, chatContext: 'london' },
        { ...OWNER, contextChildId: 'child-london' },
      ]) {
        advanceComposerCustodyThread(stranger, null, 'minted-1')
      }
      expect(peekComposerCustody(OWNER, null).kind).toBe('same-thread')

      // A late result from a sign-in that is over moves nothing, exactly as a
      // late SAVE from one writes nothing.
      const ended = currentComposerCustodySession()
      endComposerCustodySession()
      saveComposerCustody(OWNER, null, QUESTION, Date.now(), currentComposerCustodySession(), ORIGIN)
      advanceComposerCustodyThread(OWNER, null, 'minted-1', ended)
      expect(peekComposerCustody(OWNER, null).kind).toBe('same-thread')
    })

    it('leaves an origin accepted in another conversation under its own identity', () => {
      // The draft is in the fresh conversation; the guard it carries was accepted
      // in a saved one. Moving that receiver would re-stamp the question as newly
      // legitimate somewhere it never was, so only the entry moves.
      const elsewhere: ComposerCustodyOrigin = {
        ...ORIGIN,
        receiver: { ...ORIGIN.receiver, threadId: 'thread-7' },
      }
      saveComposerCustody(OWNER, null, QUESTION, Date.now(), currentComposerCustodySession(), elsewhere)
      advanceComposerCustodyThread(OWNER, null, 'minted-1')
      const box = peekComposerCustody(OWNER, 'minted-1')
      expect(box.kind).toBe('same-thread')
      expect(box.kind !== 'none' && box.origin).toEqual(elsewhere)
    })
  })
})

describe('adopting a restored selection’s previews', () => {
  const created: string[] = []
  const revoked: string[] = []
  const realCreate = URL.createObjectURL
  const realRevoke = URL.revokeObjectURL

  beforeEach(() => {
    created.length = 0
    revoked.length = 0
    let seq = 0
    URL.createObjectURL = ((file: File) => {
      const url = `blob:fresh-${(seq += 1)}-${file.name}`
      created.push(url)
      return url
    }) as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = ((url: string) => void revoked.push(url)) as typeof URL.revokeObjectURL
  })

  afterEach(() => {
    URL.createObjectURL = realCreate
    URL.revokeObjectURL = realRevoke
  })

  it('derives one fresh preview per preserved file and leaves the files alone', () => {
    const second = new File(['y'], 'page-2.png', { type: 'image/png' })
    const restored: ComposerDraft = {
      ...FULL,
      uploadFiles: [...FULL.uploadFiles, second],
      uploadPreviews: ['blob:departed-1', 'blob:departed-2'],
    }

    const adopted = adoptRestoredUploadPreviews(restored)

    expect(adopted.uploadPreviews).toEqual(created)
    expect(created).toHaveLength(2)
    expect(adopted.uploadFiles).toEqual(restored.uploadFiles)
    // Everything else — her text, a finished attachment, a reference image —
    // is not raw-file ownership and is passed through untouched.
    expect({ ...adopted, uploadPreviews: [] }).toEqual({ ...restored, uploadPreviews: [] })
  })

  it('never revokes the view the departed instance may still be using', () => {
    // The operation that minted those URLs can still be running into the
    // instance that owns it; revoking them from here is the defect, not the fix.
    adoptRestoredUploadPreviews({ ...FULL, uploadPreviews: ['blob:departed-1'] })
    expect(revoked).toEqual([])
  })

  it('drops a preview no preserved file can re-derive, rather than showing it dead', () => {
    const adopted = adoptRestoredUploadPreviews({
      ...FULL,
      uploadFiles: [],
      uploadPreviews: ['blob:departed-1'],
    })
    expect(adopted.uploadPreviews).toEqual([])
    expect(created).toEqual([])
    expect(revoked).toEqual([])
  })

  it('mints nothing for a draft with no raw files at all', () => {
    // The cost of the mistake this guards is a URL per peek or per render, so
    // the no-op case has to BE a no-op: same object back, nothing created.
    const plain: ComposerDraft = { ...EMPTY_COMPOSER_DRAFT, text: 'just words' }
    expect(adoptRestoredUploadPreviews(plain)).toBe(plain)
    expect(created).toEqual([])
  })

  it('is not reached by a peek or a take, which only read the slot', () => {
    saveComposerCustody(OWNER, null, FULL)
    peekComposerCustody(OWNER, null)
    peekComposerCustody(OWNER, null)
    const taken = takeComposerCustody(OWNER, null)
    expect(created).toEqual([])
    // The carried strings come back as they were; adopting them is the
    // PLACEMENT's job, which is where the clean-up lives.
    expect(taken.kind === 'same-thread' && taken.draft.uploadPreviews).toEqual(FULL.uploadPreviews)
  })
})
