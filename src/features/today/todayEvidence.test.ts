import { describe, expect, it } from 'vitest'

import {
  EVIDENCE_EMPTY_LINE,
  EVIDENCE_FAILED_LINE,
  EVIDENCE_SECTION_TITLE,
  EVIDENCE_WORD,
  EvidenceAudience,
  FILE_MISSING_LABEL,
  KID_EVIDENCE_EMPTY_LINE,
  KID_EVIDENCE_FAILED_LINE,
  KID_EVIDENCE_SECTION_TITLE,
  KID_EVIDENCE_WORD,
  KID_FILE_MISSING_LABEL,
  UNATTACHED_ROW_LABEL,
  buildTodayEvidence,
  evidenceCopy,
  evidenceDetails,
  evidenceRowLabel,
  resolveEvidenceRow,
} from './todayEvidence'
import { expectKidLine, expectKidWording } from '../../test/kidReadability'
import type { Artifact, ChecklistItem } from '../../core/types'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
} from '../../core/types/enums'

const artifact = (over: Partial<Artifact>): Artifact => ({
  childId: 'lincoln',
  title: 'Work',
  type: EvidenceType.Photo,
  createdAt: '2026-09-14T14:05:00Z',
  tags: {
    engineStage: EngineStage.Build,
    domain: '',
    subjectBucket: SubjectBucket.Reading,
    location: LearningLocation.Home,
  },
  ...over,
})

const row = (over: Partial<ChecklistItem>): ChecklistItem => ({
  label: 'Reading (20m)',
  completed: false,
  ...over,
})

// ── The five types ──────────────────────────────────────────────────────────

describe('every evidence type gets a word (UX-431)', () => {
  it('names all five for a parent', () => {
    expect(EVIDENCE_WORD).toEqual({
      Photo: 'Photo',
      Note: 'Note',
      Audio: 'Audio',
      Video: 'Video',
      Worksheet: 'Page',
    })
  })

  it('covers every member of the enum — a sixth fails to compile, and this catches a rename', () => {
    for (const type of Object.values(EvidenceType)) {
      expect(EVIDENCE_WORD[type], `parent word for ${type}`).toBeTruthy()
      expect(KID_EVIDENCE_WORD[type], `kid word for ${type}`).toBeTruthy()
    }
  })

  it('builds an entry for each of the five, none dropped', () => {
    const entries = buildTodayEvidence({
      artifacts: Object.values(EvidenceType).map((type, i) =>
        artifact({
          id: `a${i}`,
          type,
          title: `${type} entry`,
          createdAt: `2026-09-14T1${i}:00:00Z`,
          uri: type === EvidenceType.Note ? undefined : 'https://x/f',
        }),
      ),
      audience: EvidenceAudience.Parent,
    })
    expect(entries).toHaveLength(5)
    expect(entries.map((e) => e.typeWord)).toEqual([
      'Photo',
      'Audio',
      'Note',
      'Video',
      'Page',
    ])
  })

  it('names an unrecognised stored type rather than dropping the entry', () => {
    const [entry] = buildTodayEvidence({
      artifacts: [artifact({ id: 'a', type: 'photo' as EvidenceType })],
      audience: EvidenceAudience.Parent,
    })
    expect(entry.typeWord).toBe('Entry')
  })
})

// ── Time ────────────────────────────────────────────────────────────────────

describe('the time comes from the shared helper', () => {
  it('reads the stamp in the family zone', () => {
    const [entry] = buildTodayEvidence({
      artifacts: [artifact({ id: 'a', createdAt: '2026-09-14T14:05:00Z' })],
      audience: EvidenceAudience.Parent,
    })
    expect(entry.time).toBe('9:05 AM')
  })

  it('answers null for an unreadable stamp, never "Invalid Date"', () => {
    const [entry] = buildTodayEvidence({
      artifacts: [artifact({ id: 'a', createdAt: '' })],
      audience: EvidenceAudience.Parent,
    })
    expect(entry.time).toBeNull()
  })
})

// ── Order ───────────────────────────────────────────────────────────────────

describe('the day reads in the order it happened', () => {
  it('is oldest first, whatever order the caller holds', () => {
    const entries = buildTodayEvidence({
      artifacts: [
        artifact({ id: 'late', createdAt: '2026-09-14T20:00:00Z' }),
        artifact({ id: 'early', createdAt: '2026-09-14T13:00:00Z' }),
        artifact({ id: 'mid', createdAt: '2026-09-14T16:00:00Z' }),
      ],
      audience: EvidenceAudience.Parent,
    })
    expect(entries.map((e) => e.key)).toEqual(['early', 'mid', 'late'])
  })

  it('holds an unreadable stamp back rather than letting it displace a real one', () => {
    const entries = buildTodayEvidence({
      artifacts: [
        artifact({ id: 'unstamped', createdAt: '' }),
        artifact({ id: 'stamped', createdAt: '2026-09-14T13:00:00Z' }),
      ],
      audience: EvidenceAudience.Parent,
    })
    expect(entries.map((e) => e.key)).toEqual(['stamped', 'unstamped'])
  })

  it('gives an artifact with no id a stable key', () => {
    const entries = buildTodayEvidence({
      artifacts: [artifact({ createdAt: '2026-09-14T13:00:00Z' })],
      audience: EvidenceAudience.Parent,
    })
    expect(entries[0].key).toBe('2026-09-14T13:00:00Z-0')
  })
})

// ── Which row ───────────────────────────────────────────────────────────────

describe('resolveEvidenceRow', () => {
  it('takes the row that CLAIMS the artifact first', () => {
    const claimed = row({ label: 'Math (15m)', evidenceArtifactId: 'a1' })
    const decoy = row({ label: 'Reading (20m)' })
    expect(resolveEvidenceRow(artifact({ id: 'a1' }), [decoy, claimed])).toBe(claimed)
  })

  it('ignores a claim that points at a scan document, not an artifact', () => {
    const scanRow = row({ evidenceArtifactId: 'a1', evidenceCollection: 'scans' })
    expect(resolveEvidenceRow(artifact({ id: 'a1' }), [scanRow])).toBeNull()
  })

  it('falls back to the planItem join the Captured chip already uses', () => {
    const target = row({ label: 'Reading (20m)' })
    const found = resolveEvidenceRow(
      artifact({
        id: 'a1',
        tags: {
          engineStage: EngineStage.Build,
          domain: '',
          subjectBucket: SubjectBucket.Reading,
          location: LearningLocation.Home,
          planItem: 'Reading (20m)',
        },
      }),
      [row({ label: 'Math (15m)' }), target],
    )
    expect(found).toBe(target)
  })

  it('resolves a strand session through its activityConfigId', () => {
    const target = row({ label: 'History (30m)', strandConfigId: 'cfg-history' })
    expect(
      resolveEvidenceRow(artifact({ id: 'a1', activityConfigId: 'cfg-history' }), [target]),
    ).toBe(target)
  })

  it('REFUSES an ambiguous inferred match rather than naming the wrong row', () => {
    const tags = {
      engineStage: EngineStage.Build,
      domain: '',
      subjectBucket: SubjectBucket.Reading,
      location: LearningLocation.Home,
      planItem: 'Reading (20m)',
    }
    expect(
      resolveEvidenceRow(artifact({ id: 'a1', tags }), [
        row({ label: 'Reading (20m)' }),
        row({ label: 'Reading (20m)' }),
      ]),
    ).toBeNull()
    expect(
      resolveEvidenceRow(artifact({ id: 'a1', activityConfigId: 'cfg' }), [
        row({ label: 'A', activityConfigId: 'cfg' }),
        row({ label: 'B', workbookConfigId: 'cfg' }),
      ]),
    ).toBeNull()
  })

  it('but an explicit claim on two rows is taken — both rows are the same work', () => {
    const first = row({ label: 'Reading (20m)', evidenceArtifactId: 'a1' })
    const second = row({ label: 'Reading (20m)', evidenceArtifactId: 'a1' })
    expect(resolveEvidenceRow(artifact({ id: 'a1' }), [first, second])).toBe(first)
  })

  it('answers null when the page cannot tell, and the entry says so', () => {
    const [entry] = buildTodayEvidence({
      artifacts: [artifact({ id: 'a1' })],
      checklist: [row({ label: 'Reading (20m)' })],
      audience: EvidenceAudience.Parent,
    })
    expect(entry.rowLabel).toBeNull()
    expect(evidenceCopy(EvidenceAudience.Parent).unattachedLabel).toBe(UNATTACHED_ROW_LABEL)
  })

  it('strips the planner’s trailing minutes from the label a person reads', () => {
    expect(evidenceRowLabel('Reading (20m)')).toBe('Reading')
    expect(evidenceRowLabel('Sight word games')).toBe('Sight word games')
  })
})

// ── Details ─────────────────────────────────────────────────────────────────

describe('evidenceDetails', () => {
  it('renders a Note’s own text — a note is evidence, not a degraded photo', () => {
    expect(
      evidenceDetails(
        artifact({ type: EvidenceType.Note, title: 'Narration', content: 'He retold the whole chapter.' }),
      ),
    ).toEqual(['He retold the whole chapter.'])
  })

  it('puts the parent’s notes verbatim, before the artifact’s own text', () => {
    expect(
      evidenceDetails(artifact({ notes: 'Did it standing up.', content: 'Two pages.' })),
    ).toEqual(['Did it standing up.', 'Two pages.'])
  })

  it('carries a strand topic', () => {
    expect(evidenceDetails(artifact({ title: 'Ancient Egypt', topic: 'Ancient Egypt' }))).toEqual([])
    expect(evidenceDetails(artifact({ title: 'Session', topic: 'Ancient Egypt' }))).toEqual([
      'Ancient Egypt',
    ])
  })

  it('never prints a video’s address twice — it is stored in both uri and content (UX-285)', () => {
    expect(
      evidenceDetails(
        artifact({ type: EvidenceType.Video, uri: 'https://y/v', content: 'https://y/v' }),
      ),
    ).toEqual([])
  })

  it('drops blank and duplicate lines', () => {
    expect(evidenceDetails(artifact({ notes: '  ', content: 'One.', topic: 'One.' }))).toEqual([
      'One.',
    ])
  })
})

// ── A file that never arrived ───────────────────────────────────────────────

describe('a media artifact with no file (UX-432)', () => {
  it('is flagged, and a Note never is', () => {
    const entries = buildTodayEvidence({
      artifacts: [
        artifact({ id: 'photo', type: EvidenceType.Photo, createdAt: '2026-09-14T13:00:00Z' }),
        artifact({
          id: 'note',
          type: EvidenceType.Note,
          content: 'He read it aloud.',
          createdAt: '2026-09-14T14:00:00Z',
        }),
      ],
      audience: EvidenceAudience.Parent,
    })
    expect(entries[0].fileMissing).toBe(true)
    expect(entries[1].fileMissing).toBe(false)
  })
})

// ── Copy ────────────────────────────────────────────────────────────────────

describe('the audience’s copy', () => {
  it('gives a parent the parent wording', () => {
    expect(evidenceCopy(EvidenceAudience.Parent)).toEqual({
      title: EVIDENCE_SECTION_TITLE,
      emptyLine: EVIDENCE_EMPTY_LINE,
      failedLine: EVIDENCE_FAILED_LINE,
      fileMissingLabel: FILE_MISSING_LABEL,
      unattachedLabel: UNATTACHED_ROW_LABEL,
    })
  })

  it('gives a kid the kid wording, and no filing word for an unattached entry', () => {
    const copy = evidenceCopy(EvidenceAudience.Kid)
    expect(copy.title).toBe(KID_EVIDENCE_SECTION_TITLE)
    expect(copy.emptyLine).toBe(KID_EVIDENCE_EMPTY_LINE)
    expect(copy.failedLine).toBe(KID_EVIDENCE_FAILED_LINE)
    expect(copy.fileMissingLabel).toBe(KID_FILE_MISSING_LABEL)
    expect(copy.unattachedLabel).toBeNull()
  })

  it('holds every kid string to the shared readability bar', () => {
    expectKidWording(KID_EVIDENCE_SECTION_TITLE, 'kid section title')
    expectKidLine(KID_EVIDENCE_EMPTY_LINE, 'kid empty line')
    expectKidLine(KID_EVIDENCE_FAILED_LINE, 'kid failed line')
    expectKidWording(KID_FILE_MISSING_LABEL, 'kid file-missing label')
    for (const [type, word] of Object.entries(KID_EVIDENCE_WORD)) {
      expectKidWording(word, `kid word for ${type}`)
    }
  })
})

// ── contentNote is parent-only (Codex round 1, P2) ──────────────────────────

describe('contentNote', () => {
  const withNote = artifact({
    id: 'a',
    type: EvidenceType.Worksheet,
    title: 'Math (15m) — Lincoln’s work',
    contentNote: 'A page of two-digit addition, most of it worked out.',
  })

  it('reaches the PARENT — for a scan capture it is the only descriptive detail there is', () => {
    expect(evidenceDetails(withNote, EvidenceAudience.Parent)).toEqual([
      'A page of two-digit addition, most of it worked out.',
    ])
    const [entry] = buildTodayEvidence({
      artifacts: [withNote],
      audience: EvidenceAudience.Parent,
    })
    expect(entry.details).toContain('A page of two-digit addition, most of it worked out.')
  })

  it('is WITHHELD from the child — FEAT-141’s own contract, "never rendered to a child"', () => {
    expect(evidenceDetails(withNote, EvidenceAudience.Kid)).toEqual([])
    const [entry] = buildTodayEvidence({
      artifacts: [withNote],
      audience: EvidenceAudience.Kid,
    })
    expect(entry.details).toEqual([])
  })

  it('defaults to the parent reading, so a caller that forgets does not silently drop it', () => {
    expect(evidenceDetails(withNote)).toHaveLength(1)
  })
})

// ── The family's own zone (Codex round 1, P2) ───────────────────────────────

describe('the family’s configured time zone', () => {
  it('is used when the caller passes one', () => {
    const [entry] = buildTodayEvidence({
      artifacts: [artifact({ id: 'a', createdAt: '2026-09-14T14:05:00Z' })],
      audience: EvidenceAudience.Parent,
      timeZone: 'America/Denver',
    })
    expect(entry.time).toBe('8:05 AM')
  })

  it('falls back to the app default when unset or unparseable', () => {
    for (const zone of [undefined, 'Mars/Olympus_Mons']) {
      const [entry] = buildTodayEvidence({
        artifacts: [artifact({ id: 'a', createdAt: '2026-09-14T14:05:00Z' })],
        audience: EvidenceAudience.Parent,
        timeZone: zone,
      })
      expect(entry.time, `zone ${zone}`).toBe('9:05 AM')
    }
  })
})
