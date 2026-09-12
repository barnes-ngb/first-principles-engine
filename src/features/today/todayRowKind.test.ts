import { describe, expect, it } from 'vitest'

import {
  CONFIG_READ_FAILED_NOTE,
  CONFIG_READ_FAILED_TELL,
  DOOR_FOR_KIND,
  isPhotoDoor,
  resolveTodayRow,
  TODAY_ROW_DOOR_LABEL,
  TODAY_ROW_KIND_WORD,
  TODAY_ROW_UNKNOWN_NOTE,
  TodayRowConfigsState,
  TodayRowDoor,
  TodayRowKind,
  TodayRowUnknownReason,
  UNPLACED_ROW_EVIDENCE_CLAUSE,
} from './todayRowKind'
import type { TodayRowConfigLike } from './todayRowKind'
import type { ChecklistItem } from '../../core/types'
import { ActivityType, SubjectBucket } from '../../core/types/enums'
import { findWorkbookConfigId } from '../../core/utils/workbookMatching'
import { findStrandConfigId } from '../progress/strand'

function item(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return { label: 'Something (20m)', completed: false, ...overrides }
}

function config(overrides: Partial<TodayRowConfigLike> = {}): TodayRowConfigLike {
  return { id: 'cfg-1', name: 'Something', type: ActivityType.Routine, ...overrides }
}

// ── The seven curriculum kinds, resolved from the family's own rows ──────────

describe('resolveTodayRow — every kind, resolved from a config', () => {
  const cases: Array<{ type: ActivityType; kind: TodayRowKind }> = [
    { type: ActivityType.Workbook, kind: TodayRowKind.Workbook },
    { type: ActivityType.Routine, kind: TodayRowKind.Routine },
    { type: ActivityType.Formation, kind: TodayRowKind.Formation },
    { type: ActivityType.Activity, kind: TodayRowKind.Activity },
    { type: ActivityType.App, kind: TodayRowKind.App },
    { type: ActivityType.Evaluation, kind: TodayRowKind.Evaluation },
    { type: ActivityType.Strand, kind: TodayRowKind.Strand },
  ]

  for (const { type, kind } of cases) {
    it(`names a ${type} row by its config, through the stamped join`, () => {
      const row = resolveTodayRow(
        item({ label: 'History (30m)', activityConfigId: 'cfg-1' }),
        [config({ name: 'History', type })],
      )
      expect(row.kind).toBe(kind)
      expect(row.configId).toBe('cfg-1')
      expect(row.note).toBeNull()
      expect(row.addDoor).toBe(DOOR_FOR_KIND[kind])
    })

    it(`names a ${type} row by its NAME when nothing is stamped`, () => {
      const row = resolveTodayRow(
        item({ label: 'History (30m)' }),
        [config({ name: 'History', type })],
      )
      expect(row.kind).toBe(kind)
      expect(row.configId).toBe('cfg-1')
    })
  }

  it('reads an alias a rename left behind (UX-280)', () => {
    const row = resolveTodayRow(
      item({ label: 'Simply Good and Beautiful Math K (20m)' }),
      [config({
        id: 'wb-1',
        name: 'Math',
        aliases: ['Simply Good and Beautiful Math K'],
        type: ActivityType.Strand,
      })],
    )
    expect(row.kind).toBe(TodayRowKind.Strand)
    expect(row.configId).toBe('wb-1')
  })

  it('matches a label a family really typed WITH a duration in it', () => {
    const row = resolveTodayRow(
      item({ label: 'History (30m)' }),
      [config({ name: 'History (30m)', type: ActivityType.Strand })],
    )
    expect(row.kind).toBe(TodayRowKind.Strand)
  })

  it('skips a finished program — its record is closed', () => {
    const row = resolveTodayRow(
      item({ label: 'History (30m)' }),
      [config({ name: 'History', type: ActivityType.Strand, completed: true })],
    )
    expect(row.kind).toBe(TodayRowKind.Unknown)
    expect(row.unknownReason).toBe(TodayRowUnknownReason.NoMatch)
  })
})

// ── Where the row stands ────────────────────────────────────────────────────

describe('resolveTodayRow — the tell says where the row stands', () => {
  it('a workbook reads its lesson number', () => {
    const row = resolveTodayRow(
      item({ label: 'Math K (20m)', workbookConfigId: 'wb-1' }),
      [config({ id: 'wb-1', name: 'Math K', type: ActivityType.Workbook, currentPosition: 35 })],
    )
    expect(row.tell).toBe('Workbook · lesson 35')
  })

  it('a workbook that stores its own unit label uses it', () => {
    const row = resolveTodayRow(
      item({ label: 'Reader (20m)', workbookConfigId: 'wb-1' }),
      [config({
        id: 'wb-1', name: 'Reader', type: ActivityType.Workbook,
        currentPosition: 4, unitLabel: 'chapter',
      })],
    )
    expect(row.tell).toBe('Workbook · chapter 4')
  })

  it('a strand reads its SESSION count, never a lesson (UX-282)', () => {
    const row = resolveTodayRow(
      item({ label: 'History (30m)', strandConfigId: 'st-1' }),
      [config({ id: 'st-1', name: 'History', type: ActivityType.Strand, currentPosition: 14 })],
    )
    expect(row.tell).toBe('Strand · session 14')
  })

  it('a strand with no sessions yet prints no count — never "session 0"', () => {
    const row = resolveTodayRow(
      item({ label: 'History (30m)', strandConfigId: 'st-1' }),
      [config({ id: 'st-1', name: 'History', type: ActivityType.Strand })],
    )
    expect(row.tell).toBe('Strand')
  })

  it('a corrupt stored position is no position, not a number on the screen', () => {
    for (const bad of [Number.NaN, -3, 0, Infinity, '35' as unknown as number]) {
      const row = resolveTodayRow(
        item({ label: 'Math K (20m)', workbookConfigId: 'wb-1' }),
        [config({ id: 'wb-1', name: 'Math K', type: ActivityType.Workbook, currentPosition: bad })],
      )
      expect(row.tell).toBe('Workbook')
    }
  })
})

// ── The two kinds that are not curriculum rows ──────────────────────────────

describe('resolveTodayRow — watch and evaluation', () => {
  it('a watch row is a video, never a curriculum row', () => {
    const row = resolveTodayRow(
      item({ label: 'Watch: volcanoes (10m)', itemType: 'watch', watchVideoId: 'v1' }),
      [config({ name: 'Watch: volcanoes', type: ActivityType.Workbook })],
    )
    expect(row.kind).toBe(TodayRowKind.Watch)
    expect(row.configId).toBeNull()
    expect(row.addDoor).toBe(TodayRowDoor.Watch)
  })

  it("a planner's Knowledge Mine row is an evaluation with no config", () => {
    const row = resolveTodayRow(
      item({ label: 'Knowledge Mine (15m)', itemType: 'evaluation', link: '/quest' }),
      [],
    )
    expect(row.kind).toBe(TodayRowKind.Evaluation)
    expect(row.configId).toBeNull()
    expect(row.addDoor).toBe(TodayRowDoor.StartMining)
  })
})

// ── The legacy five, still resolving ────────────────────────────────────────

describe('resolveTodayRow — the legacy five itemType values still resolve', () => {
  const legacy = ['routine', 'workbook', 'evaluation', 'activity', 'watch'] as const
  for (const value of legacy) {
    it(`"${value}" resolves to its own kind when no config answers`, () => {
      const row = resolveTodayRow(item({ label: 'Handwriting (15m)', itemType: value }), [])
      expect(row.kind).toBe(value)
      expect(row.configId).toBeNull()
      expect(row.note).toBeNull()
    })
  }
})

// ── Unknown, and its three reasons ──────────────────────────────────────────

describe('resolveTodayRow — unknown says which kind of nothing it is', () => {
  it('no curriculum row answers at all', () => {
    const row = resolveTodayRow(item({ label: 'Trip to the museum (90m)' }), [])
    expect(row.kind).toBe(TodayRowKind.Unknown)
    expect(row.unknownReason).toBe(TodayRowUnknownReason.NoMatch)
    expect(row.note).toBe(TODAY_ROW_UNKNOWN_NOTE[TodayRowUnknownReason.NoMatch])
    expect(row.tell).toBe('No curriculum row')
  })

  it('two rows answer to the name, so picking one would be a guess', () => {
    const row = resolveTodayRow(
      item({ label: 'Sight word games (10m)' }),
      [
        config({ id: 'a', name: 'Sight word games', type: ActivityType.Routine }),
        config({ id: 'b', name: 'Sight word games', type: ActivityType.Activity }),
      ],
    )
    expect(row.kind).toBe(TodayRowKind.Unknown)
    expect(row.unknownReason).toBe(TodayRowUnknownReason.Ambiguous)
    expect(row.configId).toBeNull()
  })

  it('a stale stamp never falls back to the label (the findStrandConfigId rule)', () => {
    const row = resolveTodayRow(
      item({ label: 'History (30m)', activityConfigId: 'gone' }),
      [config({ id: 'other', name: 'History', type: ActivityType.Strand })],
    )
    expect(row.kind).toBe(TodayRowKind.Unknown)
    expect(row.unknownReason).toBe(TodayRowUnknownReason.StaleJoin)
    expect(row.configId).toBeNull()
  })

  it('an itemType from a build this one does not know reads as unknown, not as itself', () => {
    const row = resolveTodayRow(
      item({ label: 'Something (20m)', itemType: 'quest' as never }),
      [],
    )
    expect(row.kind).toBe(TodayRowKind.Unknown)
  })

  it('an empty label cannot match a config whose name normalises to nothing', () => {
    const row = resolveTodayRow(item({ label: '   ' }), [config({ name: '!!!' })])
    expect(row.kind).toBe(TodayRowKind.Unknown)
  })

  it('every unknown row still gets a capture door — the note explains, it does not refuse', () => {
    for (const reason of Object.values(TodayRowUnknownReason)) {
      expect(TODAY_ROW_UNKNOWN_NOTE[reason]).toContain(UNPLACED_ROW_EVIDENCE_CLAUSE)
    }
    expect(DOOR_FOR_KIND[TodayRowKind.Unknown]).toBe(TodayRowDoor.AddPhoto)
  })

  // Codex round 1 (P1): the first draft said "no lesson count moves", which is
  // false — an unplaced row's photo takes the fuzzy classification path and may
  // create or advance a workbook. Narrowing that write is propose-and-confirm
  // (UX-403); the sentence was this run's to fix.
  it('no note claims a photo changes nothing', () => {
    for (const note of Object.values(TODAY_ROW_UNKNOWN_NOTE)) {
      expect(note).not.toMatch(/no lesson count moves|nothing (?:else )?moves|changes nothing/i)
    }
  })

  it('ambiguity outranks what the row SAYS it is', () => {
    const duplicated: TodayRowConfigLike[] = [
      config({ id: 'a', name: 'Sight word games', type: ActivityType.Routine }),
      config({ id: 'b', name: 'Sight word games', type: ActivityType.Activity }),
    ]
    // A model-planned row asserting a kind must not be believed over the fact
    // that the app cannot tell which curriculum row it names.
    const row = resolveTodayRow(
      item({ label: 'Sight word games (10m)', itemType: 'routine' }),
      duplicated,
    )
    expect(row.kind).toBe(TodayRowKind.Unknown)
    expect(row.unknownReason).toBe(TodayRowUnknownReason.Ambiguous)
    // …and with no duplicate, the asserted kind is still honoured.
    expect(
      resolveTodayRow(item({ label: 'Nothing here (10m)', itemType: 'routine' }), duplicated).kind,
    ).toBe(TodayRowKind.Routine)
  })
})

// ── An unread curriculum list is not an empty one (Codex round 1, P2) ────────

describe('resolveTodayRow — an unsettled or failed configs read claims nothing', () => {
  const loading = TodayRowConfigsState.Loading
  const failed = TodayRowConfigsState.Failed

  it('does not call a row "No curriculum row" while the list is still loading', () => {
    const row = resolveTodayRow(item({ label: 'Handwriting (15m)' }), [], loading)
    expect(row.kind).toBe(TodayRowKind.Unresolved)
    expect(row.unknownReason).toBeNull()
    expect(row.note).toBeNull()
    expect(row.tell).not.toContain('No curriculum row')
  })

  it('a FAILED read says so, in its own sentence, and still offers the photo', () => {
    const row = resolveTodayRow(item({ label: 'Handwriting (15m)' }), [], failed)
    expect(row.kind).toBe(TodayRowKind.Unresolved)
    expect(row.tell).toBe(CONFIG_READ_FAILED_TELL)
    expect(row.note).toBe(CONFIG_READ_FAILED_NOTE)
    expect(row.addDoor).toBe(TodayRowDoor.AddPhoto)
  })

  it('the two sentences are kept apart — one resolves itself, the other does not', () => {
    expect(CONFIG_READ_FAILED_TELL).not.toBe(TODAY_ROW_KIND_WORD[TodayRowKind.Unresolved])
  })

  it('a stamped workbook is STILL a workbook — the capture path uses the stamp', () => {
    for (const state of [loading, failed]) {
      const row = resolveTodayRow(
        item({ label: 'GATB Math (30m)', workbookConfigId: 'wb-1' }),
        [],
        state,
      )
      expect(row.kind).toBe(TodayRowKind.Workbook)
      expect(row.configId).toBe('wb-1')
      expect(row.addDoor).toBe(TodayRowDoor.AddPage)
      // No position: the document is not in hand, and inventing one is the thing
      // this module refuses everywhere else.
      expect(row.tell).toBe('Workbook')
    }
  })

  it('a stamped activityConfigId is NOT called stale while the list is unread', () => {
    const row = resolveTodayRow(
      item({ label: 'History (30m)', activityConfigId: 'st-1' }),
      [],
      loading,
    )
    expect(row.kind).toBe(TodayRowKind.Unresolved)
    expect(row.unknownReason).toBeNull()
  })

  it('a watch row needs no config, so it answers either way', () => {
    for (const state of [loading, failed]) {
      expect(resolveTodayRow(item({ itemType: 'watch' }), [], state).kind)
        .toBe(TodayRowKind.Watch)
    }
  })

  it('once settled, an empty list IS an answer', () => {
    const row = resolveTodayRow(item({ label: 'Handwriting (15m)' }), [])
    expect(row.kind).toBe(TodayRowKind.Unknown)
    expect(row.unknownReason).toBe(TodayRowUnknownReason.NoMatch)
  })

  // Codex round 2 (P2): the ID-only override is right while there is no list to
  // contradict it, and wrong once there is — `syncScanToConfig` returns
  // `target-missing`, so *Add page* would advertise a curriculum action that
  // cannot happen.
  it('a stamped workbook missing from a SETTLED list is a stale join, not a workbook', () => {
    const row = resolveTodayRow(
      item({ label: 'GATB Math (30m)', workbookConfigId: 'gone' }),
      [config({ id: 'rt-1', name: 'Handwriting', type: ActivityType.Routine })],
    )
    expect(row.kind).toBe(TodayRowKind.Unknown)
    expect(row.unknownReason).toBe(TodayRowUnknownReason.StaleJoin)
    expect(row.configId).toBeNull()
    expect(row.addDoor).toBe(TodayRowDoor.AddPhoto)
  })
})

// ── The stamp outranks a fuzzy workbook name (Codex round 2, P1) ─────────────

describe('resolveTodayRow — a picked activity is not overridden by a lookalike workbook', () => {
  // `isSameWorkbook` matches on two shared words plus a matching subject, so a
  // strand the parent chose can collide with a workbook they also own.
  const configs: TodayRowConfigLike[] = [
    {
      id: 'wb-1', name: 'Story of the World History', type: ActivityType.Workbook,
      scannable: true, subjectBucket: SubjectBucket.SocialStudies, currentPosition: 12,
    },
    {
      id: 'st-1', name: 'Story of the World', type: ActivityType.Strand,
      subjectBucket: SubjectBucket.SocialStudies, currentPosition: 3,
    },
  ]
  const stamped = item({
    label: 'Story of the World (30m)',
    subjectBucket: SubjectBucket.SocialStudies,
    activityConfigId: 'st-1',
  })

  it('the collision is real — the fuzzy matcher does claim this row', () => {
    // A positive control for the two tests below: without it they would pass on
    // a fixture where nothing was ever at risk.
    expect(findWorkbookConfigId(stamped, configs)).toBe('wb-1')
  })

  it('resolves the STAMPED strand, not the lookalike workbook', () => {
    const row = resolveTodayRow(stamped, configs)
    expect(row.kind).toBe(TodayRowKind.Strand)
    expect(row.configId).toBe('st-1')
    expect(row.addDoor).toBe(TodayRowDoor.RecordSession)
    // And therefore no up-front photo door, which is the reach UX-363 added.
    expect(isPhotoDoor(row.addDoor)).toBe(false)
  })

  it('an unstamped row that only the WORKBOOK answers to still takes it', () => {
    // Step 6 is the capture path's own question, asked its way, for the rows with
    // no stamp and no exact name to prefer (UX-402's cohort).
    const unstamped = item({
      label: 'Story of the World History Lesson 12 (30m)',
      subjectBucket: SubjectBucket.SocialStudies,
    })
    const row = resolveTodayRow(unstamped, configs)
    expect(row.kind).toBe(TodayRowKind.Workbook)
    expect(row.configId).toBe('wb-1')
    expect(row.configId).toBe(findWorkbookConfigId(unstamped, configs))
  })

  it('an unstamped row the STRAND answers to exactly beats the fuzzy workbook', () => {
    // Exact beats fuzzy: `activityMatchNames` + `nameKey` is an identity claim,
    // `isSameWorkbook`'s two-shared-words rule is a resemblance.
    const row = resolveTodayRow(
      item({ label: 'Story of the World (30m)', subjectBucket: SubjectBucket.SocialStudies }),
      configs,
    )
    expect(row.kind).toBe(TodayRowKind.Strand)
    expect(row.configId).toBe('st-1')
  })

  // The divergence this creates, pinned so it cannot silently widen (UX-403).
  //
  // `useUnifiedCapture` evaluates the fuzzy fallback FIRST and unconditionally,
  // so on these rows a post-completion photo still targets `wb-1` while the row
  // correctly reads *Strand*. Preventing that stops a `skillSnapshots.workingLevels`
  // write, which is propose-and-confirm, so it belongs to UX-403 and not here.
  // What UX-363 does fix is the reach: the resolved kind gives these rows no
  // up-front photo door, so the misroute is no easier to reach than before.
  it('names EXACTLY the rows where the capture path would still disagree', () => {
    const diverging = [
      item({ label: 'Story of the World (30m)', subjectBucket: SubjectBucket.SocialStudies, activityConfigId: 'st-1' }),
      item({ label: 'Story of the World (30m)', subjectBucket: SubjectBucket.SocialStudies }),
    ]
    for (const row of diverging) {
      const resolved = resolveTodayRow(row, configs)
      expect(resolved.kind).not.toBe(TodayRowKind.Workbook)
      // The capture path WOULD have gone to the workbook — that is the residual.
      expect(row.workbookConfigId ?? findWorkbookConfigId(row, configs)).toBe('wb-1')
      // …and the row offers no photo door up front, which is what bounds it.
      expect(isPhotoDoor(resolved.addDoor)).toBe(false)
    }
  })

  it("an explicit workbook stamp still wins — it is the capture path's own first read", () => {
    const row = resolveTodayRow(
      item({ label: 'Story of the World (30m)', activityConfigId: 'st-1', workbookConfigId: 'wb-1' }),
      configs,
    )
    expect(row.kind).toBe(TodayRowKind.Workbook)
    expect(row.configId).toBe('wb-1')
  })
})

// ── The property that matters: the tell cannot contradict the door ──────────

describe('resolveTodayRow — the workbook answer is the CAPTURE path answer', () => {
  // `useUnifiedCapture` resolves `item.workbookConfigId ?? findWorkbookConfigId(
  // item, configs)` before anything else and routes the photo there. A row that
  // read "Routine" while its photo advanced a workbook would be UX-363 in a new
  // form, so the two must ask the same question — asserted both ways.
  const configs: TodayRowConfigLike[] = [
    { id: 'wb-1', name: 'GATB Math', type: ActivityType.Workbook, scannable: true, currentPosition: 12 },
    { id: 'rt-1', name: 'Handwriting', type: ActivityType.Routine },
    { id: 'st-1', name: 'History', type: ActivityType.Strand, currentPosition: 3 },
    { id: 'ap-1', name: 'Reading Eggs', type: ActivityType.App },
  ]
  const rows: ChecklistItem[] = [
    item({ label: 'GATB Math (30m)', subjectBucket: SubjectBucket.Math }),
    item({ label: 'GATB Math (30m)', workbookConfigId: 'wb-1' }),
    item({ label: 'Handwriting (15m)' }),
    item({ label: 'History (30m)' }),
    item({ label: 'Reading Eggs (20m)' }),
    item({ label: 'Trip to the museum (90m)' }),
    item({ label: 'Watch: volcanoes (10m)', itemType: 'watch' }),
  ]

  for (const row of rows) {
    it(`agrees with the capture path for "${row.label}"`, () => {
      const resolved = resolveTodayRow(row, configs)
      const captureTarget = row.workbookConfigId ?? findWorkbookConfigId(row, configs)
      if (resolved.kind === TodayRowKind.Workbook) {
        expect(resolved.configId).toBe(captureTarget)
      } else if (resolved.kind !== TodayRowKind.Watch) {
        // A watch row never reaches the capture path's workbook branch — the
        // checkbox routes to the player. Every other non-workbook row in THIS
        // fixture must have nothing for that branch to find; the one shape where
        // an earlier step deliberately outranks the fuzzy matcher is pinned on
        // its own, above, with UX-403's residual named.
        expect(captureTarget).toBeUndefined()
      }
    })
  }

  it('agrees with findStrandConfigId about which rows are strands', () => {
    for (const row of rows) {
      const resolved = resolveTodayRow(row, configs)
      const strandTarget = findStrandConfigId(row, configs)
      if (resolved.kind === TodayRowKind.Strand) expect(resolved.configId).toBe(strandTarget)
    }
  })
})

// ── The tables themselves ───────────────────────────────────────────────────

describe('the kind and door tables are total and say something', () => {
  it('every kind has a word, a door, and a door with a label', () => {
    for (const kind of Object.values(TodayRowKind)) {
      expect(TODAY_ROW_KIND_WORD[kind].trim()).not.toBe('')
      const door = DOOR_FOR_KIND[kind]
      expect(door).toBeDefined()
      expect(TODAY_ROW_DOOR_LABEL[door].trim()).not.toBe('')
    }
  })

  it('every ActivityType is a TodayRowKind — the vocabulary is one vocabulary', () => {
    for (const type of Object.values(ActivityType)) {
      expect(Object.values(TodayRowKind)).toContain(type)
    }
  })

  it('the two capture doors are the two the component may render as a photo', () => {
    expect(isPhotoDoor(TodayRowDoor.AddPage)).toBe(true)
    expect(isPhotoDoor(TodayRowDoor.AddPhoto)).toBe(true)
    expect(isPhotoDoor(TodayRowDoor.RecordSession)).toBe(false)
    expect(isPhotoDoor(TodayRowDoor.StartMining)).toBe(false)
    expect(isPhotoDoor(TodayRowDoor.Watch)).toBe(false)
  })

  it('"Add page" and "Add a photo" are different words — that difference IS the finding', () => {
    expect(TODAY_ROW_DOOR_LABEL[TodayRowDoor.AddPage])
      .not.toBe(TODAY_ROW_DOOR_LABEL[TodayRowDoor.AddPhoto])
    expect(DOOR_FOR_KIND[TodayRowKind.Workbook]).toBe(TodayRowDoor.AddPage)
    expect(DOOR_FOR_KIND[TodayRowKind.Routine]).toBe(TodayRowDoor.AddPhoto)
  })
})
