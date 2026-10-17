import { describe, expect, it } from 'vitest'

import {
  NativeProgressMeaning,
  NativeProgressProgram,
  NativeProgressSource,
  type NativeProgressObservation,
} from '../../../core/types/nativeProgress'
import {
  alreadyRecordedNotice,
  buildHistoryRows,
  childSwitchNotice,
  draftIsEmpty,
  emptyNativeProgressDraft,
  enteredOnLabel,
  failureNotice,
  NATIVE_PROGRESS_NO_PLANNING_NOTICE,
  newEntryKey,
  NOTE_MAX_LENGTH,
  notSentNotice,
  numberPhrase,
  observationSentence,
  parseNativeNumber,
  parseObservedOn,
  previewSentence,
  reviewNativeProgressDraft,
  savedNotice,
  sortObservations,
  strandedCorrectionNote,
  strandedSaveNotice,
  strandedSaveTitle,
  summarizeProgram,
  summarySentence,
  type NativeProgressDraft,
} from './nativeProgressRule'

/**
 * The rule half of FEAT-241 — what counts as an observation, and what is said
 * about a list of them.
 *
 * The cases that matter are the honesty ones, and each is here because getting it
 * wrong would store or display a claim nobody made: a number silently turned into
 * a completion, a ceiling the app invented, a future date accepted as a reading,
 * two disagreeing rows resolved into one "current" position.
 */

const TODAY = '2026-10-16'

function draft(overrides: Partial<NativeProgressDraft> = {}): NativeProgressDraft {
  return { ...emptyNativeProgressDraft(TODAY), numberInput: '42', ...overrides }
}

function observation(
  overrides: Partial<NativeProgressObservation> = {},
): NativeProgressObservation {
  return {
    id: overrides.id ?? 'lincoln__e1',
    childId: 'lincoln',
    program: NativeProgressProgram.Mathseeds,
    nativeNumber: 42,
    meaning: NativeProgressMeaning.WorkingOn,
    observedOn: '2026-10-12',
    source: NativeProgressSource.ParentReport,
    recordedAt: '2026-10-14T15:00:00.000Z',
    entryKey: 'e1',
    ...overrides,
  }
}

describe('the number', () => {
  it('reads a positive whole number', () => {
    expect(parseNativeNumber('42', NativeProgressProgram.Mathseeds)).toEqual({
      ok: true,
      value: 42,
    })
    expect(parseNativeNumber('  7 ', NativeProgressProgram.FastPhonics)).toEqual({
      ok: true,
      value: 7,
    })
  })

  it('names the program unit when the field is blank', () => {
    expect(parseNativeNumber('', NativeProgressProgram.Mathseeds)).toEqual({
      ok: false,
      error: 'Type the lesson number the app showed.',
    })
    expect(parseNativeNumber('', NativeProgressProgram.FastPhonics)).toEqual({
      ok: false,
      error: 'Type the peak number the app showed.',
    })
  })

  it('refuses what is not a whole positive number', () => {
    for (const bad of ['4.5', '-3', 'twelve', '1e3', '42a', '0']) {
      expect(parseNativeNumber(bad, NativeProgressProgram.Mathseeds).ok).toBe(false)
    }
  })

  it('reads leading zeros as the keypad artefact they are', () => {
    expect(parseNativeNumber('007', NativeProgressProgram.Mathseeds)).toEqual({
      ok: true,
      value: 7,
    })
  })

  it('accepts a number far above any plausible lesson — no invented ceiling', () => {
    // The review's item 5, as an assertion: the app does not know how far either
    // program counts, so a real number read off a real screen is never refused as
    // a typo, however unlikely it looks.
    for (const big of ['9999', '10000', '250000', String(Number.MAX_SAFE_INTEGER)]) {
      expect(parseNativeNumber(big, NativeProgressProgram.Mathseeds)).toEqual({
        ok: true,
        value: Number(big),
      })
    }
  })

  it('refuses only what cannot be stored exactly, and says that is what it is', () => {
    const tooLong = '9007199254740993' // MAX_SAFE_INTEGER + 2, which rounds
    const result = parseNativeNumber(tooLong, NativeProgressProgram.Mathseeds)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('too long to store exactly')
    // It must not imply anything about the program's range.
    expect(result.error).not.toMatch(/this program|lessons in total|the last lesson|limit/i)
  })
})

describe('the date', () => {
  it('accepts today and any past day', () => {
    expect(parseObservedOn(TODAY, TODAY)).toEqual({ ok: true, value: TODAY })
    expect(parseObservedOn('2026-09-01', TODAY)).toEqual({ ok: true, value: '2026-09-01' })
  })

  it('refuses a day that has not happened', () => {
    expect(parseObservedOn('2026-10-17', TODAY)).toEqual({
      ok: false,
      error: "That day hasn't happened yet.",
    })
  })

  it('refuses a date that is not a calendar day', () => {
    expect(parseObservedOn('2026-02-30', TODAY).ok).toBe(false)
    expect(parseObservedOn('16/10/2026', TODAY).ok).toBe(false)
    expect(parseObservedOn('', TODAY).ok).toBe(false)
  })

  it('refuses a mistyped year', () => {
    expect(parseObservedOn('0226-10-12', TODAY).ok).toBe(false)
  })
})

describe('reviewing a draft', () => {
  it('turns a good draft into a reviewed observation, note absent when blank', () => {
    const review = reviewNativeProgressDraft(draft({ observedOn: '2026-10-12' }), TODAY)
    expect(review).toEqual({
      ok: true,
      reviewed: {
        program: NativeProgressProgram.Mathseeds,
        nativeNumber: 42,
        meaning: NativeProgressMeaning.WorkingOn,
        observedOn: '2026-10-12',
        source: NativeProgressSource.ParentReport,
        note: undefined,
      },
    })
  })

  it('keeps a trimmed note', () => {
    const review = reviewNativeProgressDraft(draft({ note: '  from the email  ' }), TODAY)
    expect(review.ok && review.reviewed.note).toBe('from the email')
  })

  it('reports every bad field at once, not just the first', () => {
    const review = reviewNativeProgressDraft(
      draft({ numberInput: 'x', observedOn: '2027-01-01', note: 'n'.repeat(NOTE_MAX_LENGTH + 1) }),
      TODAY,
    )
    expect(review.ok).toBe(false)
    if (review.ok) return
    expect(Object.keys(review.errors).sort()).toEqual(['note', 'numberInput', 'observedOn'])
  })

  it('does not trust the choice fields either', () => {
    const review = reviewNativeProgressDraft(
      { ...draft(), program: 'readingEggs' as NativeProgressDraft['program'] },
      TODAY,
    )
    expect(review.ok).toBe(false)
    if (review.ok) return
    expect(review.errors.program).toBeTruthy()
  })

  it('records the number exactly, with no inference about earlier lessons', () => {
    const review = reviewNativeProgressDraft(
      draft({ numberInput: '42', meaning: NativeProgressMeaning.WorkingOn }),
      TODAY,
    )
    expect(review.ok && review.reviewed.nativeNumber).toBe(42)
    // No N-1 normalisation: "working on 42" is stored as 42.
    expect(review.ok && review.reviewed).not.toHaveProperty('completedThrough')
  })
})

describe('what a draft and an entry key are', () => {
  it('knows an untouched draft from one with something in it', () => {
    expect(draftIsEmpty(emptyNativeProgressDraft(TODAY), TODAY)).toBe(true)
    expect(draftIsEmpty(draft(), TODAY)).toBe(false)
    expect(draftIsEmpty({ ...emptyNativeProgressDraft(TODAY), note: 'hm' }, TODAY)).toBe(false)
    expect(
      draftIsEmpty({ ...emptyNativeProgressDraft(TODAY), observedOn: '2026-10-01' }, TODAY),
    ).toBe(false)
    expect(
      draftIsEmpty(
        { ...emptyNativeProgressDraft(TODAY), program: NativeProgressProgram.FastPhonics },
        TODAY,
      ),
    ).toBe(false)
  })

  it('mints a distinct key per entry, in the shape the writer accepts', () => {
    const a = newEntryKey()
    const b = newEntryKey()
    expect(a).not.toBe(b)
    for (const key of [a, b]) expect(key).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
  })
})

describe('the sentences', () => {
  it('never shows a number without its meaning', () => {
    expect(numberPhrase(observation())).toBe('working on lesson 42')
    expect(
      numberPhrase(observation({ meaning: NativeProgressMeaning.CompletedThrough })),
    ).toBe('finished through lesson 42')
    expect(numberPhrase(observation({ meaning: NativeProgressMeaning.Uncertain }))).toBe(
      'around lesson 42 (not sure which)',
    )
    expect(
      numberPhrase(
        observation({ program: NativeProgressProgram.FastPhonics, nativeNumber: 7 }),
      ),
    ).toBe('working on peak 7')
  })

  it('names the day observed and the source, as reported', () => {
    expect(observationSentence(observation())).toBe(
      'Mathseeds — working on lesson 42, seen Oct 12 (parent report)',
    )
  })

  it('names the child before the save, and says nothing else changed after it', () => {
    expect(previewSentence(
      {
        program: NativeProgressProgram.Mathseeds,
        nativeNumber: 42,
        meaning: NativeProgressMeaning.CompletedThrough,
        observedOn: '2026-10-12',
        source: NativeProgressSource.Certificate,
      },
      'Lincoln',
    )).toBe('Lincoln: Mathseeds — finished through lesson 42, seen Oct 12.')
    expect(savedNotice(observation(), 'Lincoln')).toContain('Nothing else changed.')
  })

  it('says, in one short line, that planning has not moved', () => {
    expect(NATIVE_PROGRESS_NO_PLANNING_NOTICE).toBe(
      'Saved for reference. This does not update plans, hours or skills.',
    )
    // Short enough to be read rather than skimmed (review item 10).
    expect(NATIVE_PROGRESS_NO_PLANNING_NOTICE.length).toBeLessThan(90)
  })

  it('shows the entry day in local terms, not sliced off a UTC stamp', () => {
    // 2026-10-14T23:30Z is still Oct 14 in UTC and Oct 14 or 15 locally; the
    // assertion is only that it goes through the local calendar rather than the
    // string, so a late-evening entry is never labelled with tomorrow's date.
    const at = new Date('2026-10-14T23:30:00.000Z')
    const expected = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    expect(enteredOnLabel('2026-10-14T23:30:00.000Z')).toBe(expected)
    expect(enteredOnLabel('not a date')).toBe('not a date')
  })

  it('names the loss when the child changes under a draft', () => {
    expect(childSwitchNotice('Lincoln', false, false)).toBeNull()
    expect(childSwitchNotice('Lincoln', true, false)).toContain('was cleared and not saved')
    // A confirmed save is bound to the child it was confirmed for.
    expect(childSwitchNotice('Lincoln', false, true)).toContain("Lincoln's record")
  })

  it('states the confirmed save timelessly — the notice outlives the moment', () => {
    // Review item 9: the notice stays on screen after the save has long finished,
    // so it may not claim anything about what is happening right now.
    const notice = childSwitchNotice('Lincoln', true, true) ?? ''
    expect(notice).toContain("Lincoln's record")
    expect(notice).not.toMatch(/still finishing|in progress|is saving|right now/i)
  })

  it('does not promise the other record RECEIVED the entry — or that it did not', () => {
    // PR-1897 P1: the destination sentence carries its own exception rather than a
    // landing nobody has seen yet. Round 2: that exception may not swing the other
    // way either — the surface does not know the entry failed to save.
    const notice = childSwitchNotice('Lincoln', false, true) ?? ''
    expect(notice).toMatch(/cannot confirm/)
    expect(notice).not.toMatch(/was saved to|has been saved|is on the record/i)
    expect(notice).not.toMatch(/did not save|was not saved|nothing was written/i)
  })

  /**
   * Round 2, finding 1. A generic failure is INDETERMINATE: the transaction may
   * have committed and the answer been lost on the way home. So the wording may
   * assert neither absence nor presence — only that nothing is confirmed, and that
   * a retry checks the same entry rather than adding one.
   */
  it('says whose stranded entry is unconfirmed, without claiming it was lost', () => {
    expect(strandedSaveTitle('Lincoln')).toBe('Not confirmed for Lincoln')
    const notice = strandedSaveNotice('Lincoln')
    expect(notice).toContain('Lincoln')
    expect(notice).toContain('no confirmation')
    expect(notice).toContain("Lincoln's record")
    // ...and the promise the entry key keeps, in both directions.
    expect(notice).toContain('cannot be recorded twice')
    expect(notice).toContain('already recorded')

    for (const sentence of [
      strandedSaveTitle('Lincoln'),
      notice,
      strandedCorrectionNote('Lincoln'),
    ]) {
      expect(sentence).not.toMatch(/did not save|was not saved|nothing was written/i)
      expect(sentence).not.toMatch(/was saved to|has been saved|is on the record/i)
    }
    // The correction link is a property of the entry whenever it lands, which is
    // not the same claim as "it is filed".
    expect(strandedCorrectionNote('Lincoln')).toContain('as a correction')
  })

  it('reports a generic failure as unconfirmed, and an unsent one as absent', () => {
    const generic = failureNotice()
    expect(generic).toContain('not confirmed as saved')
    expect(generic).toContain('cannot be recorded twice')
    expect(generic).not.toMatch(/did not save|was not saved|nothing was written/i)
    // A detail rides along without changing the claim.
    expect(failureNotice('permission denied')).toContain('(permission denied)')
    // The one failure that may state absence: it never left the device.
    const unsent = notSentNotice('no child is selected')
    expect(unsent).toContain('was not sent')
    expect(unsent).toContain('Nothing was written')
  })

  it('tells a retry that had already landed from one that is new', () => {
    const already = alreadyRecordedNotice(observation(), 'Lincoln')
    expect(already).toContain('Already recorded for Lincoln')
    expect(already).toContain('Nothing was saved twice.')
    expect(savedNotice(observation(), 'Lincoln')).not.toContain('Already recorded')
  })
})

describe('a list that may disagree with itself', () => {
  const latest = observation({ id: 'a', observedOn: '2026-10-12', recordedAt: '2026-10-12T10:00:00.000Z' })
  const older = observation({ id: 'b', observedOn: '2026-10-05', recordedAt: '2026-10-05T10:00:00.000Z' })

  it('sorts by the day observed, then by entry time', () => {
    const sameDay = observation({ id: 'c', observedOn: '2026-10-12', recordedAt: '2026-10-13T10:00:00.000Z' })
    expect(sortObservations([older, latest, sameDay]).map((o) => o.id)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('reports the most recent READING, never a current position', () => {
    const summary = summarizeProgram(NativeProgressProgram.Mathseeds, [older, latest])
    expect(summary.mostRecentlyObserved?.id).toBe('a')
    expect(summary.count).toBe(2)
    expect(summary.sameDateDisagreement).toBe(false)
    expect(summary.enteredOutOfOrder).toBe(false)
    expect(summarySentence(summary)).toBe(
      'Latest record: working on lesson 42, as of Oct 12.',
    )
  })

  it('flags two entries for the same day that disagree, and picks neither', () => {
    const rival = observation({ id: 'c', observedOn: '2026-10-12', nativeNumber: 44, recordedAt: '2026-10-12T11:00:00.000Z' })
    const summary = summarizeProgram(NativeProgressProgram.Mathseeds, [latest, rival])
    expect(summary.sameDateDisagreement).toBe(true)
    expect(summarySentence(summary)).toContain('both are kept')
  })

  it('flags a backdated entry rather than presenting it as the latest news', () => {
    const backdated = observation({
      id: 'c',
      observedOn: '2026-09-20',
      recordedAt: '2026-10-15T10:00:00.000Z',
    })
    const summary = summarizeProgram(NativeProgressProgram.Mathseeds, [latest, backdated])
    expect(summary.enteredOutOfOrder).toBe(true)
    expect(summary.mostRecentlyObserved?.id).toBe('a')
    expect(summarySentence(summary)).toContain('added out of order')
  })

  it('keeps the programs apart', () => {
    const phonics = observation({ id: 'c', program: NativeProgressProgram.FastPhonics, nativeNumber: 3 })
    const math = summarizeProgram(NativeProgressProgram.Mathseeds, [latest, phonics])
    expect(math.count).toBe(1)
    expect(summarizeProgram(NativeProgressProgram.FastPhonics, [latest, phonics]).count).toBe(1)
  })

  it('says nothing is recorded when nothing is', () => {
    const summary = summarizeProgram(NativeProgressProgram.FastPhonics, [])
    expect(summary.mostRecentlyObserved).toBeNull()
    expect(summarySentence(summary)).toContain('nothing recorded yet')
  })
})

describe('corrections', () => {
  const original = observation({ id: 'a', observedOn: '2026-10-12', recordedAt: '2026-10-12T10:00:00.000Z' })
  const fix = observation({
    id: 'b',
    observedOn: '2026-10-12',
    nativeNumber: 41,
    recordedAt: '2026-10-15T10:00:00.000Z',
    correctsObservationId: 'a',
  })

  it('pairs a correction with its original and KEEPS the original row', () => {
    const rows = buildHistoryRows([original, fix])
    expect(rows.map((r) => r.observation.id)).toEqual(['b', 'a'])
    expect(rows[0].corrects?.id).toBe('a')
    expect(rows[1].correctedBy.map((o) => o.id)).toEqual(['b'])
    // The original is still in the history, with its own number.
    expect(rows[1].observation.nativeNumber).toBe(42)
  })

  it('survives a correction whose original is not in the list', () => {
    const rows = buildHistoryRows([fix])
    expect(rows[0].corrects).toBeNull()
    expect(rows[0].correctedBy).toEqual([])
  })
})
