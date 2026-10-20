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

  it('promises to KEEP a newer draft rather than implying it goes', () => {
    const newer = stopPendingQuestion(false)
    expect(newer).toContain('The draft you have typed since is kept as it is.')
    expect(newer).not.toContain('clears this draft')
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
