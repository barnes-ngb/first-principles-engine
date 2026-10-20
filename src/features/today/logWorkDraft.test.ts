/**
 * `FIX-267` — what the *Log work* form promises, before the tap.
 *
 * The product bar for this run is that a parent can predict and confirm
 * exactly what evidence and time a save will produce. These are the sentences
 * that make that checkable, so they are asserted as text: the summary above the
 * button, the reason a disabled button gives, and the two questions the form
 * asks before it takes something away.
 *
 * Pure: no React, no Firestore, no clock.
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LOG_WORK_BUCKET,
  LOG_WORK_TITLE,
  describeEvidence,
  describeTime,
  logWorkBlockedReason,
  logWorkDayLabel,
  logWorkReceiptBase,
  logWorkRetiredNotice,
  logWorkRetirement,
  logWorkSaveable,
  logWorkSummary,
  mediaReplaceQuestion,
  presetOverwriteQuestion,
  presetOverwrites,
  selectedDayNotice,
  stopPendingQuestion,
  type LogWorkDraft,
  type PresetField,
} from './logWorkDraft'
import { SubjectBucket } from '../../core/types/enums'

const DAY = '2026-10-20'

function draft(overrides: Partial<LogWorkDraft> = {}): LogWorkDraft {
  return {
    childName: 'Lincoln',
    day: DAY,
    activityName: '',
    subjectBucket: DEFAULT_LOG_WORK_BUCKET,
    minutes: 0,
    note: '',
    mediaKind: null,
    photoCount: 0,
    hasAudio: false,
    ...overrides,
  }
}

describe('logWorkDraft — what is in this draft', () => {
  it('names the heading the jump and the card share', () => {
    expect(LOG_WORK_TITLE).toBe('Log work')
  })

  it('names a day a person can read, and keeps an unreadable key as it is', () => {
    expect(logWorkDayLabel(DAY)).toBe('Tue, Oct 20')
    expect(logWorkDayLabel('not-a-day')).toBe('not-a-day')
  })

  it('names the note FIRST — the piece the old card dropped', () => {
    expect(describeEvidence(draft({ note: 'Rome day', photoCount: 2 }))).toBe(
      'your note and 2 photos',
    )
    expect(describeEvidence(draft({ note: 'Rome day', hasAudio: true }))).toBe(
      'your note and your recording',
    )
    expect(describeEvidence(draft({ photoCount: 1 }))).toBe('1 photo')
    expect(describeEvidence(draft({ note: '   ' }))).toBeNull()
  })

  it('states whether time is recorded, either way', () => {
    expect(describeTime(draft())).toBe('No time is recorded.')
    expect(
      describeTime(draft({ minutes: 45, subjectBucket: SubjectBucket.PracticalArts })),
    ).toBe('Records 45 minutes to Practical Arts.')
  })

  it('summarises whose, when, where it is filed, and both halves of the save', () => {
    const summary = logWorkSummary(
      draft({ note: 'Rome day', minutes: 45, subjectBucket: SubjectBucket.SocialStudies }),
    )
    expect(summary.scopeLine).toBe('Lincoln · Tue, Oct 20 · Social Studies')
    expect(summary.savesLine).toBe('Saves your note.')
    expect(summary.timeLine).toBe('Records 45 minutes to Social Studies.')
  })

  it('says so when a log is time only', () => {
    expect(logWorkSummary(draft({ minutes: 20 })).savesLine).toBe(
      'Saves no evidence — time only.',
    )
  })

  it('does not call an EMPTY draft time only — it is nothing yet', () => {
    // Zero minutes under the words *time only* read as a promise to log time.
    const summary = logWorkSummary(draft())
    expect(summary.savesLine).toBe('Nothing to save yet.')
    expect(summary.timeLine).toBe('No time is recorded.')
  })
})

describe('logWorkDraft — which day, said correctly in both directions', () => {
  it('says nothing about today', () => {
    expect(selectedDayNotice(DAY, DAY)).toBeNull()
  })

  it('calls a past day past', () => {
    expect(selectedDayNotice('2026-10-13', DAY)).toBe(
      'This is a past day. The work is filed under 2026-10-13, not today.',
    )
  })

  it('does NOT call a future day past', () => {
    // The first cut asked `day !== todayKey()` and said *past* either way, so a
    // day picked ahead of today was described as one that had happened.
    const notice = selectedDayNotice('2026-10-27', DAY)
    expect(notice).toBe(
      'This day hasn’t happened yet. The work is filed under 2026-10-27, not today.',
    )
    expect(notice).not.toContain('past')
  })

  it('handles a month and a year boundary, since the keys sort as they read', () => {
    expect(selectedDayNotice('2026-09-30', '2026-10-01')).toContain('past day')
    expect(selectedDayNotice('2027-01-01', '2026-12-31')).toContain('hasn’t happened')
  })
})

describe('logWorkDraft — stopping an unfinished save explains itself', () => {
  it('promises to clear the draft it submitted, and not to delete records', () => {
    const owned = stopPendingQuestion(true)
    expect(owned).toContain('Whatever already saved stays saved — nothing is deleted.')
    expect(owned).toContain('clears this draft, so the same work can’t be filed twice')
  })

  /**
   * The old assertion here required the sentence *"The draft you have typed
   * since is kept as it is."* and is deliberately replaced rather than deleted:
   * the promise was false for the fields that draft had INHERITED, which is the
   * duplicate `hours` row PR #1909 round 1 reported. What the safeguard was
   * protecting — that a confirmation may not imply the parent's own typing is
   * about to be cleared — is kept, and now stated as what actually happens.
   */
  it('keeps a newer draft’s own edits, and does not promise more than that', () => {
    const newer = stopPendingQuestion(false)
    expect(newer).toContain('Whatever already saved stays saved — nothing is deleted.')
    expect(newer).toContain(
      'The parts you already submitted are taken out of this draft, because they may be saved already — what you have changed or attached since is kept.',
    )
    expect(newer).not.toContain('clears this draft')
    // It may not promise every inherited field survives.
    expect(newer).not.toContain('kept as it is')
  })
})

describe('logWorkDraft — which submitted fields a finished save still owns', () => {
  const epochs = (note: number, duration: number) => ({ note, duration })
  const stored = { note: true, minutes: true }

  it('retires a note and minutes the parent has not touched since', () => {
    expect(
      logWorkRetirement(
        { note: 'Built a tower', minutes: 27, epochs: epochs(3, 4) },
        epochs(3, 4),
        stored,
      ),
    ).toEqual({ note: true, minutes: true })
  })

  it('keeps whichever field has moved, field by field', () => {
    // The reported case: only the note was edited, so only the note stays.
    expect(
      logWorkRetirement(
        { note: 'Built a tower', minutes: 27, epochs: epochs(3, 4) },
        epochs(4, 4),
        stored,
      ),
    ).toEqual({ note: false, minutes: true })
    expect(
      logWorkRetirement(
        { note: 'Built a tower', minutes: 27, epochs: epochs(3, 4) },
        epochs(3, 9),
        stored,
      ),
    ).toEqual({ note: true, minutes: false })
  })

  it('is identity, not value equality — away and back is a NEW value', () => {
    // `captureDraftOwnership`'s `revision` treats typing a word away and back
    // as a new draft on purpose. A field-level rule that compared the TEXT
    // would quietly contradict it and take the parent's retyped note.
    expect(
      logWorkRetirement(
        { note: 'Built a tower', minutes: 27, epochs: epochs(1, 1) },
        // Same characters on screen, two edits later.
        epochs(3, 3),
        stored,
      ),
    ).toEqual({ note: false, minutes: false })
  })

  it('retires nothing the submission did not hold, or may not have stored', () => {
    // An empty note and zero minutes were never part of any record.
    expect(
      logWorkRetirement({ note: '   ', minutes: 0, epochs: epochs(1, 1) }, epochs(1, 1), stored),
    ).toEqual({ note: false, minutes: false })
    // And a part no write may have reached stays in the draft, where the parent
    // can still save it.
    expect(
      logWorkRetirement({ note: 'Built a tower', minutes: 27, epochs: epochs(1, 1) }, epochs(1, 1), {
        note: false,
        minutes: false,
      }),
    ).toEqual({ note: false, minutes: false })
  })
})

describe('logWorkDraft — a field that empties itself says why', () => {
  it('names every part it took, and what it did not take', () => {
    expect(
      logWorkRetiredNotice({ note: true, minutes: 27, photoCount: 1, audio: false }),
    ).toBe(
      'The note, 1 photo and 27 minutes you submitted have been taken out of this draft, so the same work can’t be filed twice. Nothing saved was deleted, and anything you changed or attached since is still here.',
    )
    expect(
      logWorkRetiredNotice({ note: false, minutes: 0, photoCount: 3, audio: false }),
    ).toContain('3 photos you submitted have been taken out')
    expect(
      logWorkRetiredNotice({ note: false, minutes: 0, photoCount: 0, audio: true }),
    ).toContain('The recording you submitted has been taken out')
  })

  it('says nothing when nothing was taken', () => {
    expect(
      logWorkRetiredNotice({ note: false, minutes: 0, photoCount: 0, audio: false }),
    ).toBeNull()
  })

  it('never claims a record was deleted', () => {
    const notice = logWorkRetiredNotice({
      note: true,
      minutes: 27,
      photoCount: 0,
      audio: false,
    })
    // It is about the DRAFT. The only claim it makes about stored records is
    // that none of them went anywhere.
    expect(notice).toContain('Nothing saved was deleted')
    expect(notice).not.toMatch(/rolled back|removed from (your|the) records|undone/i)
  })
})

describe('logWorkDraft — what may be saved', () => {
  it('accepts a note alone, minutes alone, a photo alone and a recording alone', () => {
    expect(logWorkSaveable(draft({ note: 'Visited the dentist' }))).toBe(true)
    expect(logWorkSaveable(draft({ minutes: 20 }))).toBe(true)
    expect(logWorkSaveable(draft({ photoCount: 1 }))).toBe(true)
    expect(logWorkSaveable(draft({ hasAudio: true }))).toBe(true)
  })

  it('refuses an empty draft, and a NAME on its own, and says which', () => {
    expect(logWorkSaveable(draft())).toBe(false)
    expect(logWorkBlockedReason(draft())).toBe(
      'Add a note, some minutes, a photo or a recording.',
    )

    // The reported shape: a parent types what the work was and taps Save. The
    // name is filing, not a record, so the reason names the gap rather than
    // leaving a dead button with a tooltip nobody can hover on a phone.
    const named = draft({ activityName: 'dentist visit' })
    expect(logWorkSaveable(named)).toBe(false)
    expect(logWorkBlockedReason(named)).toBe(
      'A name on its own isn’t saved. Add a note, some minutes, a photo or a recording.',
    )
  })

  it('has no reason to give once there is something to save', () => {
    expect(logWorkBlockedReason(draft({ minutes: 5 }))).toBeNull()
  })
})

describe('logWorkDraft — the receipt states both halves', () => {
  it('names the evidence and the minutes together', () => {
    expect(logWorkReceiptBase({ evidence: 'your note and 2 photos', minutes: 45 })).toBe(
      'Saved your note and 2 photos — 45 min logged',
    )
  })

  it('says when no time was logged, rather than leaving it open', () => {
    expect(logWorkReceiptBase({ evidence: '1 photo', minutes: 0 })).toBe(
      'Saved 1 photo — no time logged',
    )
  })

  it('says when no evidence was saved', () => {
    expect(logWorkReceiptBase({ evidence: null, minutes: 30 })).toBe(
      'Logged 30 min — no evidence saved',
    )
  })

  it('claims nothing for a draft that wrote nothing', () => {
    expect(logWorkReceiptBase({ evidence: null, minutes: 0 })).toBe('Nothing to save')
  })
})

describe('logWorkDraft — nothing a parent typed is taken silently', () => {
  const edited = (...fields: PresetField[]) => new Set<PresetField>(fields)

  it('reports exactly the hand-edited fields a quick fill would overwrite', () => {
    expect(presetOverwrites(edited())).toEqual([])
    expect(presetOverwrites(edited('minutes'))).toEqual(['minutes'])
    // In the form's own order, not the order they were touched in.
    expect(presetOverwrites(edited('minutes', 'name'))).toEqual(['name', 'minutes'])
  })

  it('asks the question in the parent’s words', () => {
    expect(presetOverwriteQuestion('Lego build', ['minutes'])).toBe(
      'Use “Lego build” and replace the minutes you typed?',
    )
    expect(presetOverwriteQuestion('Lego build', ['name', 'category', 'minutes'])).toBe(
      'Use “Lego build” and replace what this is, the category and the minutes you typed?',
    )
  })

  it('asks before replacing OR removing staged media, and counts it', () => {
    expect(mediaReplaceQuestion('photo', 2, 'audio')).toBe(
      'Remove the 2 photos you attached and record audio instead? Nothing has been saved yet.',
    )
    expect(mediaReplaceQuestion('photo', 1, null)).toBe(
      'Remove the photo you attached? Nothing has been saved yet.',
    )
    expect(mediaReplaceQuestion('audio', 0, 'photo')).toBe(
      'Remove the recording you attached and add photos instead? Nothing has been saved yet.',
    )
  })
})
