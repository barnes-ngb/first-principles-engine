import { describe, expect, it } from 'vitest'

import type {
  ActivityConfig,
  Artifact,
  ChecklistItem,
  DayLog,
  HoursAdjustment,
  HoursEntry,
} from '../../core/types'
import {
  ActivityFrequency,
  ActivityType,
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
} from '../../core/types/enums'
import { computeHoursSummary } from '../records/records.logic'
import {
  MAX_NAMED_ENTRIES,
  NO_TOPIC_LABEL,
  cleanItemLabel,
  groupWeekBySubject,
  namedCountsLine,
  subjectEvidenceLine,
  subjectHoursLine,
  subjectItemsLine,
  subjectTopicsLine,
} from './weekBySubject'
import type { WeekBySubjectInput } from './weekBySubject'

/**
 * UX-388 — the week, by subject and topic.
 *
 * The cases that carry the design: a renamed activity, two spellings of one
 * topic, a strand session with no topic, a subject with hours but no items, an
 * item with no subject bucket, and — the rail — that the minutes reconcile with
 * the canonical fold rather than being re-derived here.
 */

const CHILD = 'c1'

const item = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  label: 'Fast Phonics (20m)',
  completed: true,
  subjectBucket: SubjectBucket.Reading,
  estimatedMinutes: 20,
  ...over,
})

const day = (date: string, checklist: ChecklistItem[], childId = CHILD): DayLog =>
  ({ childId, date, blocks: [], checklist }) as DayLog

const config = (over: Partial<ActivityConfig> = {}): ActivityConfig => ({
  id: 'cfg-1',
  name: 'Fast Phonics',
  type: ActivityType.Workbook,
  subjectBucket: SubjectBucket.Reading,
  defaultMinutes: 20,
  frequency: ActivityFrequency.Daily,
  childId: CHILD,
  sortOrder: 1,
  completed: false,
  scannable: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
})

const artifact = (over: Partial<Artifact> = {}): Artifact =>
  ({
    childId: CHILD,
    title: 'Ancient Egypt',
    type: EvidenceType.Photo,
    createdAt: '2026-08-31T10:00:00.000Z',
    tags: {
      engineStage: EngineStage.Build,
      domain: '',
      subjectBucket: SubjectBucket.SocialStudies,
      location: LearningLocation.Home,
    },
    ...over,
  }) as Artifact

const input = (over: Partial<WeekBySubjectInput> = {}): WeekBySubjectInput => ({
  dayLogs: [],
  hoursEntries: [],
  adjustments: [],
  artifacts: [],
  configs: [],
  childId: CHILD,
  ...over,
})

const bySubject = (
  rows: ReturnType<typeof groupWeekBySubject>,
  bucket: string,
) => rows.find((r) => r.subjectBucket === bucket)

// ── The hours rail: the canonical fold, never a second count ─────────────────

describe('the minutes come from the shared counting path (UX-388)', () => {
  it('reconciles the subject rows with computeHoursSummary for the same week', () => {
    const dayLogs = [
      day('2026-08-31', [
        item({ label: 'Fast Phonics (20m)', estimatedMinutes: 20 }),
        item({
          label: 'Math K (30m)',
          estimatedMinutes: 30,
          subjectBucket: SubjectBucket.Math,
        }),
      ]),
      day('2026-09-01', [item({ label: 'Fast Phonics (20m)', estimatedMinutes: 20 })]),
    ]
    const hoursEntries: HoursEntry[] = [
      {
        id: 'h1',
        childId: CHILD,
        date: '2026-09-02',
        minutes: 45,
        subjectBucket: SubjectBucket.Science,
      } as HoursEntry,
    ]
    const adjustments: HoursAdjustment[] = [
      {
        id: 'a1',
        childId: CHILD,
        date: '2026-09-03',
        minutes: 15,
        subjectBucket: SubjectBucket.Math,
      } as HoursAdjustment,
    ]

    const rows = groupWeekBySubject(input({ dayLogs, hoursEntries, adjustments }))
    const canonical = computeHoursSummary(dayLogs, hoursEntries, adjustments, CHILD)

    // The rail: the section's own subject minutes sum to the number the Records
    // page and the compliance pack state for the same week. Not approximately —
    // the rows ARE that fold, reshaped.
    expect(rows.reduce((sum, r) => sum + r.totalMinutes, 0)).toBe(
      canonical.totalMinutes,
    )
    expect(bySubject(rows, SubjectBucket.Reading)?.totalMinutes).toBe(40)
    expect(bySubject(rows, SubjectBucket.Math)?.totalMinutes).toBe(45)
    expect(bySubject(rows, SubjectBucket.Science)?.totalMinutes).toBe(45)
  })

  it('orders subjects by counted minutes, descending', () => {
    const rows = groupWeekBySubject(
      input({
        dayLogs: [
          day('2026-08-31', [
            item({ estimatedMinutes: 10 }),
            item({
              label: 'Math K (60m)',
              estimatedMinutes: 60,
              subjectBucket: SubjectBucket.Math,
            }),
            item({
              label: 'Nature walk (30m)',
              estimatedMinutes: 30,
              subjectBucket: SubjectBucket.Science,
            }),
          ]),
        ],
      }),
    )
    expect(rows.map((r) => r.subjectBucket)).toEqual([
      SubjectBucket.Math,
      SubjectBucket.Science,
      SubjectBucket.Reading,
    ])
  })

  it('counts only the child it was asked about', () => {
    const rows = groupWeekBySubject(
      input({
        dayLogs: [
          day('2026-08-31', [item({ estimatedMinutes: 20 })]),
          day('2026-08-31', [item({ estimatedMinutes: 90 })], 'other-child'),
        ],
        artifacts: [artifact({ childId: 'other-child' })],
      }),
    )
    expect(bySubject(rows, SubjectBucket.Reading)?.totalMinutes).toBe(20)
    expect(bySubject(rows, SubjectBucket.Reading)?.items).toHaveLength(1)
    expect(bySubject(rows, SubjectBucket.SocialStudies)).toBeUndefined()
  })
})

// ── What got done ────────────────────────────────────────────────────────────

describe('what got done, named and counted', () => {
  it('counts a completed item once per day it was completed on', () => {
    const rows = groupWeekBySubject(
      input({
        dayLogs: [
          day('2026-08-31', [item()]),
          day('2026-09-01', [item()]),
          day('2026-09-02', [item(), item({ label: 'Booster cards (10m)' })]),
        ],
      }),
    )
    expect(bySubject(rows, SubjectBucket.Reading)?.items).toEqual([
      { key: 'label:fastphonics', name: 'Fast Phonics', count: 3 },
      { key: 'label:boostercards', name: 'Booster cards', count: 1 },
    ])
  })

  it('strips the planner’s duration suffix from the name a person reads', () => {
    expect(cleanItemLabel('Fast Phonics (20m)')).toBe('Fast Phonics')
    expect(cleanItemLabel('History')).toBe('History')
    // A label that is ONLY a suffix keeps itself rather than becoming empty.
    expect(cleanItemLabel('(20m)')).toBe('(20m)')
    expect(cleanItemLabel(undefined)).toBe('')
  })

  it('ignores an item that was not completed', () => {
    const rows = groupWeekBySubject(
      input({
        dayLogs: [
          day('2026-08-31', [
            item({ completed: false }),
            item({ label: 'Booster cards (10m)', completed: true }),
          ]),
        ],
      }),
    )
    expect(bySubject(rows, SubjectBucket.Reading)?.items).toEqual([
      { key: 'label:boostercards', name: 'Booster cards', count: 1 },
    ])
  })

  it('files an item with no subject bucket under Other / untagged, never dropping it', () => {
    // The export shows 18 h of untagged time this year, so this is the common
    // case and not the edge one. It reads honestly rather than disappearing.
    const rows = groupWeekBySubject(
      input({
        dayLogs: [
          day('2026-08-31', [
            item({
              label: 'Packing boxes (45m)',
              estimatedMinutes: 45,
              subjectBucket: undefined,
            }),
          ]),
        ],
      }),
    )
    const other = bySubject(rows, SubjectBucket.Other)
    expect(other?.label).toBe('Other / untagged')
    expect(other?.totalMinutes).toBe(45)
    expect(other?.items).toEqual([
      { key: 'label:packingboxes', name: 'Packing boxes', count: 1 },
    ])
  })

  it('shows a subject with hours but no completed items', () => {
    // A creative timer or a quick-add writes an `hours` document and checks
    // nothing, so the block has a number and an empty "what got done" line.
    const rows = groupWeekBySubject(
      input({
        hoursEntries: [
          {
            id: 'h1',
            childId: CHILD,
            date: '2026-09-02',
            minutes: 25,
            subjectBucket: SubjectBucket.Art,
          } as HoursEntry,
        ],
      }),
    )
    const art = bySubject(rows, SubjectBucket.Art)
    expect(art?.totalMinutes).toBe(25)
    expect(art?.items).toEqual([])
    expect(subjectItemsLine(art?.items ?? [])).toBe('')
  })

  it('shows a subject with evidence but no counted minutes', () => {
    const rows = groupWeekBySubject(
      input({ artifacts: [artifact({ activityConfigId: undefined, topic: undefined })] }),
    )
    const social = bySubject(rows, SubjectBucket.SocialStudies)
    expect(social?.totalMinutes).toBe(0)
    expect(social?.artifactCount).toBe(1)
    expect(subjectHoursLine(social?.totalMinutes ?? 0)).toBe('No hours counted')
  })

  it('drops a subject with nothing at all', () => {
    expect(groupWeekBySubject(input())).toEqual([])
  })
})

// ── A rename is one activity, not two rows ───────────────────────────────────

describe('a renamed activity stays one row (UX-279 / UX-280)', () => {
  it('collapses the old label and the new one under her current name', () => {
    // A stored `days.checklist[].label` is evidence of the day it was logged on
    // and is never rewritten, so a program renamed mid-week has BOTH names in
    // this week's log. The rename left the publisher's name in `aliases`, which
    // is what lets the two collapse.
    const rows = groupWeekBySubject(
      input({
        dayLogs: [
          day('2026-08-31', [
            item({ label: 'Simply Good and Beautiful Math K (30m)', subjectBucket: SubjectBucket.Math }),
          ]),
          day('2026-09-02', [item({ label: 'Math K (30m)', subjectBucket: SubjectBucket.Math })]),
        ],
        configs: [
          config({
            id: 'cfg-math',
            name: 'Math K',
            subjectBucket: SubjectBucket.Math,
            aliases: ['Simply Good and Beautiful Math K'],
          }),
        ],
      }),
    )
    expect(bySubject(rows, SubjectBucket.Math)?.items).toEqual([
      { key: 'config:cfg-math', name: 'Math K', count: 2 },
    ])
  })

  it('degrades to two label rows with the same total when configs cannot be read', () => {
    // `useChatActivityConfigs` hands back `[]` on a failed subscribe. That
    // understates a MERGE and misstates no COUNT, which is why it needs no
    // warning line — asserted, so the claim is not merely made.
    const dayLogs = [
      day('2026-08-31', [
        item({ label: 'Simply Good and Beautiful Math K (30m)', subjectBucket: SubjectBucket.Math }),
      ]),
      day('2026-09-02', [item({ label: 'Math K (30m)', subjectBucket: SubjectBucket.Math })]),
    ]
    const rows = groupWeekBySubject(input({ dayLogs, configs: [] }))
    const items = bySubject(rows, SubjectBucket.Math)?.items ?? []
    expect(items).toHaveLength(2)
    expect(items.reduce((sum, i) => sum + i.count, 0)).toBe(2)
  })

  it('prefers the stamped join over the label', () => {
    const rows = groupWeekBySubject(
      input({
        dayLogs: [
          day('2026-08-31', [
            item({ label: 'Lesson 14 (20m)', activityConfigId: 'cfg-1' }),
            item({ label: 'Lesson 15 (20m)', workbookConfigId: 'cfg-1' }),
            item({ label: 'Egypt (30m)', strandConfigId: 'cfg-strand', subjectBucket: SubjectBucket.SocialStudies }),
          ]),
        ],
        configs: [
          config(),
          config({ id: 'cfg-strand', name: 'History', type: ActivityType.Strand, subjectBucket: SubjectBucket.SocialStudies }),
        ],
      }),
    )
    expect(bySubject(rows, SubjectBucket.Reading)?.items).toEqual([
      { key: 'config:cfg-1', name: 'Fast Phonics', count: 2 },
    ])
    expect(bySubject(rows, SubjectBucket.SocialStudies)?.items).toEqual([
      { key: 'config:cfg-strand', name: 'History', count: 1 },
    ])
  })

  it('refuses an ambiguous name match and groups the label as itself', () => {
    // Two live rows answering to one label is the duplicate case Curriculum's
    // own notice exists to surface. Picking one here would file a week's work
    // under a row it may not belong to.
    const rows = groupWeekBySubject(
      input({
        dayLogs: [day('2026-08-31', [item({ label: 'Fast Phonics (20m)' })])],
        configs: [
          config({ id: 'cfg-a' }),
          config({ id: 'cfg-b' }),
        ],
      }),
    )
    expect(bySubject(rows, SubjectBucket.Reading)?.items).toEqual([
      { key: 'label:fastphonics', name: 'Fast Phonics', count: 1 },
    ])
  })

  it('falls back to the label when a stamped join names a config that is gone', () => {
    const rows = groupWeekBySubject(
      input({
        dayLogs: [day('2026-08-31', [item({ activityConfigId: 'cfg-deleted' })])],
        configs: [],
      }),
    )
    expect(bySubject(rows, SubjectBucket.Reading)?.items).toEqual([
      { key: 'label:fastphonics', name: 'Fast Phonics', count: 1 },
    ])
  })
})

// ── Strand topics ────────────────────────────────────────────────────────────

describe('a strand’s sessions group by topic (UX-282)', () => {
  it('groups two spellings of one topic as one line', () => {
    const rows = groupWeekBySubject(
      input({
        artifacts: [
          artifact({ activityConfigId: 'cfg-strand', topic: 'Ancient Egypt' }),
          artifact({ activityConfigId: 'cfg-strand', topic: 'ancient egypt!' }),
          artifact({ activityConfigId: 'cfg-strand', topic: 'The Pilgrims' }),
        ],
      }),
    )
    const social = bySubject(rows, SubjectBucket.SocialStudies)
    expect(social?.topics?.map((t) => [t.label, t.count])).toEqual([
      ['Ancient Egypt', 2],
      ['The Pilgrims', 1],
    ])
    expect(subjectTopicsLine(social?.topics ?? [])).toBe(
      'Ancient Egypt ×2 · The Pilgrims ×1',
    )
  })

  it('keeps the spelling she typed, never re-casing it', () => {
    const rows = groupWeekBySubject(
      input({ artifacts: [artifact({ activityConfigId: 'c', topic: 'ancient egypt' })] }),
    )
    expect(bySubject(rows, SubjectBucket.SocialStudies)?.topics?.[0].label).toBe(
      'ancient egypt',
    )
  })

  it('lists a session with no topic rather than hiding it, and lists it last', () => {
    const rows = groupWeekBySubject(
      input({
        artifacts: [
          artifact({ activityConfigId: 'cfg-strand' }),
          artifact({ activityConfigId: 'cfg-strand' }),
          artifact({ activityConfigId: 'cfg-strand', topic: 'The Pilgrims' }),
        ],
      }),
    )
    const topics = bySubject(rows, SubjectBucket.SocialStudies)?.topics ?? []
    // Last despite holding MORE sessions: it is not a topic.
    expect(topics.map((t) => [t.label, t.count, t.recorded])).toEqual([
      ['The Pilgrims', 1, true],
      [NO_TOPIC_LABEL, 2, false],
    ])
  })

  it('says nothing about topics for a subject whose evidence carries none', () => {
    const rows = groupWeekBySubject(
      input({ artifacts: [artifact({ activityConfigId: undefined, topic: undefined })] }),
    )
    const social = bySubject(rows, SubjectBucket.SocialStudies)
    expect(social?.topics).toEqual([])
    expect(subjectTopicsLine(social?.topics ?? [])).toBe('')
    expect(social?.artifactCount).toBe(1)
  })

  it('files a topic under the subject the artifact itself recorded', () => {
    // The artifact carries the config's subject as it stood at capture time,
    // which is what the week's record says — not what the row reads today.
    const rows = groupWeekBySubject(
      input({
        artifacts: [
          artifact({
            activityConfigId: 'cfg-strand',
            topic: 'Volcanoes',
            tags: {
              engineStage: EngineStage.Build,
              domain: '',
              subjectBucket: SubjectBucket.Science,
              location: LearningLocation.Home,
            },
          }),
        ],
      }),
    )
    expect(bySubject(rows, SubjectBucket.Science)?.topics?.[0].label).toBe('Volcanoes')
    expect(bySubject(rows, SubjectBucket.SocialStudies)).toBeUndefined()
  })
})

// ── A failed read is never a result ──────────────────────────────────────────

describe('a failed artifacts read is absence, never zero', () => {
  it('reports the evidence count and the topics as unknown', () => {
    const rows = groupWeekBySubject(
      input({
        dayLogs: [day('2026-08-31', [item()])],
        artifacts: null,
      }),
    )
    const reading = bySubject(rows, SubjectBucket.Reading)
    expect(reading?.artifactCount).toBeNull()
    expect(reading?.topics).toBeNull()
    // And neither renders as a count of nothing.
    expect(subjectEvidenceLine(reading?.artifactCount ?? 0)).toBe('')
    expect(subjectTopicsLine(reading?.topics ?? null)).toBe('')
  })

  it('still reports the hours and the items it could read', () => {
    const rows = groupWeekBySubject(
      input({ dayLogs: [day('2026-08-31', [item()])], artifacts: null })
    )
    expect(bySubject(rows, SubjectBucket.Reading)?.totalMinutes).toBe(20)
    expect(bySubject(rows, SubjectBucket.Reading)?.items).toHaveLength(1)
  })
})

// ── Lines ────────────────────────────────────────────────────────────────────

describe('the lines state a record and never a target', () => {
  it('states a subject’s time with no denominator', () => {
    expect(subjectHoursLine(288)).toBe('4.8 hours')
    expect(subjectHoursLine(120)).toBe('2 hours')
    expect(subjectHoursLine(45)).toBe('45 minutes')
    expect(subjectHoursLine(1)).toBe('1 minute')
  })

  it('reports a non-positive total as none rather than a negative duration', () => {
    // `hoursLoggedLine`'s own rule, followed rather than re-decided: a
    // correcting adjustment can leave a subject net-negative, and a correction
    // is read on the Records page.
    expect(subjectHoursLine(0)).toBe('No hours counted')
    expect(subjectHoursLine(-30)).toBe('No hours counted')
    expect(subjectHoursLine(Number.NaN)).toBe('No hours counted')
  })

  it('counts the tail rather than dropping it silently', () => {
    const many = Array.from({ length: MAX_NAMED_ENTRIES + 3 }, (_, i) => ({
      label: `Item ${i}`,
      count: 1,
    }))
    const line = namedCountsLine(many)
    expect(line.endsWith('+3 more')).toBe(true)
    expect(line.split(' · ')).toHaveLength(MAX_NAMED_ENTRIES + 1)
  })

  it('says nothing at all when there is nothing to name', () => {
    expect(namedCountsLine([])).toBe('')
    expect(subjectItemsLine([])).toBe('')
    expect(subjectEvidenceLine(0)).toBe('')
    expect(subjectEvidenceLine(null)).toBe('')
  })

  it('counts evidence in the plural only when there is more than one', () => {
    expect(subjectEvidenceLine(1)).toBe('1 piece of evidence captured')
    expect(subjectEvidenceLine(4)).toBe('4 pieces of evidence captured')
  })
})
