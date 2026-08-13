import { describe, expect, it } from 'vitest'

import {
  CONTENT_NOTE_MAX_LENGTH,
  clampContentNote,
  deriveScanContentNote,
  pickArtifactContentNote,
} from './contentNote'
import type { CertificateScanResult, WorksheetScanResult } from '../types/planning'

function worksheet(over: Partial<WorksheetScanResult> = {}): WorksheetScanResult {
  return {
    pageType: 'worksheet',
    subject: 'math',
    specificTopic: '',
    skillsTargeted: [],
    estimatedDifficulty: 'appropriate',
    recommendation: 'do',
    recommendationReason: '',
    estimatedMinutes: 15,
    teacherNotes: '',
    ...over,
  }
}

describe('clampContentNote', () => {
  it('returns undefined for anything that is not a usable string', () => {
    expect(clampContentNote(undefined)).toBeUndefined()
    expect(clampContentNote(null)).toBeUndefined()
    expect(clampContentNote(42)).toBeUndefined()
    expect(clampContentNote('')).toBeUndefined()
    expect(clampContentNote('   \n ')).toBeUndefined()
  })

  it('collapses whitespace and trims', () => {
    expect(clampContentNote('  two-digit   addition\n with regrouping ')).toBe(
      'two-digit addition with regrouping',
    )
  })

  it('leaves a note at the cap untouched', () => {
    const exact = 'a'.repeat(CONTENT_NOTE_MAX_LENGTH)
    expect(clampContentNote(exact)).toBe(exact)
  })

  it('truncates past the cap on a word boundary with an ellipsis', () => {
    const long = 'word '.repeat(60)
    const note = clampContentNote(long)!
    expect(note.length).toBeLessThanOrEqual(CONTENT_NOTE_MAX_LENGTH)
    expect(note.endsWith('…')).toBe(true)
    expect(note.startsWith('word word')).toBe(true)
  })

  it('still truncates a single unbroken run with no word boundary', () => {
    const note = clampContentNote('x'.repeat(400))!
    expect(note.length).toBeLessThanOrEqual(CONTENT_NOTE_MAX_LENGTH)
    expect(note.endsWith('…')).toBe(true)
  })
})

describe('deriveScanContentNote', () => {
  it('returns undefined when there is no analysis to read', () => {
    expect(deriveScanContentNote(null)).toBeUndefined()
    expect(deriveScanContentNote(undefined)).toBeUndefined()
  })

  it('reads curriculum + page + topic straight off the stored results', () => {
    const note = deriveScanContentNote(
      worksheet({
        specificTopic: 'elapsed time + multiplication facts',
        curriculumDetected: {
          provider: 'gatb',
          name: 'GATB Math 3',
          lessonNumber: null,
          pageNumber: 73,
          levelDesignation: null,
        },
      }),
    )
    expect(note).toBe('GATB Math 3 p.73 — elapsed time + multiplication facts')
  })

  it('prefers the lesson number over the page number', () => {
    const note = deriveScanContentNote(
      worksheet({
        specificTopic: 'consonant blends',
        curriculumDetected: {
          provider: 'other',
          name: 'TGTB Language Arts',
          lessonNumber: 47,
          pageNumber: 12,
          levelDesignation: 'Level 1',
        },
      }),
    )
    expect(note).toBe('TGTB Language Arts Lesson 47 — consonant blends')
  })

  it('falls back to the subject when no curriculum was identified', () => {
    expect(deriveScanContentNote(worksheet({ specificTopic: 'counting by fives' }))).toBe(
      'math — counting by fives',
    )
  })

  it('falls back to the targeted skills when there is no specific topic', () => {
    const note = deriveScanContentNote(
      worksheet({
        skillsTargeted: [
          { skill: 'regrouping', level: 'practice', alignsWithSnapshot: 'at-level' },
          { skill: 'place value', level: 'review', alignsWithSnapshot: 'at-level' },
          { skill: 'estimation', level: 'review', alignsWithSnapshot: 'unknown' },
        ],
      }),
    )
    // At most two skills, so the line stays a label rather than a list.
    expect(note).toBe('math — regrouping + place value')
  })

  it('returns undefined when the analysis identified nothing at all', () => {
    expect(
      deriveScanContentNote(worksheet({ pageType: 'other', subject: '', specificTopic: '' })),
    ).toBeUndefined()
  })

  it('derives a certificate line from its own fields', () => {
    const cert: CertificateScanResult = {
      pageType: 'certificate',
      curriculum: 'reading-eggs',
      curriculumName: 'Reading Eggs',
      level: 'Level 4',
      milestone: 'Map 13 complete — 100% Gold',
      lessonRange: 'Lessons 121-130',
      skillsCovered: [],
      wordsRead: [],
      date: '',
      childName: '',
      suggestedSnapshotUpdate: { masteredSkills: [], recommendedStartLevel: null, notes: '' },
    }
    expect(deriveScanContentNote(cert)).toBe(
      'Reading Eggs Level 4 — Map 13 complete — 100% Gold',
    )
  })

  it('never exceeds the cap, however long the stored fields are', () => {
    const note = deriveScanContentNote(
      worksheet({ specificTopic: 'a very long topic '.repeat(20) }),
    )!
    expect(note.length).toBeLessThanOrEqual(CONTENT_NOTE_MAX_LENGTH)
  })
})

describe('pickArtifactContentNote', () => {
  it('prefers the note the classification pass emitted', () => {
    const results = worksheet({
      specificTopic: 'addition',
      contentNote: 'Lego castle with a working drawbridge',
    })
    expect(pickArtifactContentNote(results)).toBe('Lego castle with a working drawbridge')
  })

  it('clamps the emitted note like any other', () => {
    const results = worksheet({ contentNote: 'note '.repeat(80) })
    expect(pickArtifactContentNote(results)!.length).toBeLessThanOrEqual(
      CONTENT_NOTE_MAX_LENGTH,
    )
  })

  it('falls back to the deterministic derivation when the model omitted it', () => {
    expect(pickArtifactContentNote(worksheet({ specificTopic: 'skip counting' }))).toBe(
      'math — skip counting',
    )
  })

  it('returns undefined rather than inventing a description', () => {
    expect(pickArtifactContentNote(null)).toBeUndefined()
    expect(
      pickArtifactContentNote(worksheet({ pageType: 'other', subject: '', specificTopic: '' })),
    ).toBeUndefined()
  })
})
