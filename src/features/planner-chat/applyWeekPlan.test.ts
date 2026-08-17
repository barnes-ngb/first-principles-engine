// ── Characterization: the extracted Apply ≡ the page's Apply (FEAT-150) ──────
//
// Written BEFORE the logic moved out of `PlannerChatPage.handleApplyPlan`, and
// asserting the behaviour that was there — so a regression in the move shows up
// as a red test rather than as a compliance bug three weeks later. The five
// things the page's version guaranteed, and this suite pins:
//
//   1. completed work is retained (with its minutes and evidence);
//   2. manually-added rows are retained;
//   3. stale incomplete planner/rolled-over residue is dropped;
//   4. blocks are written, carrying `plannedMinutes`;
//   5. the day's budget is persisted.
//
// Plus the two structural rules that were easy to lose in an extraction: every
// day write goes through `setDayLogGuarded` (FEAT-114), and an absent `WeekPlan`
// doc is created rather than skipped (FEAT-112 follow-up).

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChecklistItem, DayBlock, DayLog, DraftWeeklyPlan } from '../../core/types'
import { DayBlockType, SubjectBucket } from '../../core/types/enums'

const { getDocMock, setDocMock, setDayLogGuardedMock } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  setDocMock: vi.fn(),
  setDayLogGuardedMock:
    vi.fn<(ref: { id: string }, payload: DayLog, context: string) => Promise<void>>(),
}))

vi.mock('firebase/firestore', () => ({
  doc: (_collection: unknown, id: string) => ({ id }),
  getDoc: getDocMock,
  setDoc: setDocMock,
  collection: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: (familyId: string) => ({ familyId, kind: 'days' }),
  weeksCollection: (familyId: string) => ({ familyId, kind: 'weeks' }),
}))
vi.mock('../today/dayWriteGuard', async () => {
  const actual =
    await vi.importActual<typeof import('../today/dayWriteGuard')>('../today/dayWriteGuard')
  return { ...actual, setDayLogGuarded: setDayLogGuardedMock }
})

import {
  applicableDays,
  applyDraftWeek,
  buildApplyBlocks,
  buildApplyChecklist,
  buildAppliedDayLog,
  planGoalsForDraft,
  subjectToDayBlockType,
  WeekApplyError,
  type ApplyWeekPlanInput,
} from './applyWeekPlan'

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Sunday 2026-08-16 → Monday is 2026-08-17. */
const WEEK_START = '2026-08-16'
const MONDAY = '2026-08-17'
const TUESDAY = '2026-08-18'

const item = (over: Partial<DraftWeeklyPlan['days'][number]['items'][number]> = {}) => ({
  id: 'i1',
  title: 'GATB Math',
  subjectBucket: SubjectBucket.Math,
  estimatedMinutes: 30,
  skillTags: [],
  accepted: true,
  ...over,
})

const draft = (over: Partial<DraftWeeklyPlan> = {}): DraftWeeklyPlan => ({
  days: [
    { day: 'Monday', timeBudgetMinutes: 120, items: [item()] },
    { day: 'Tuesday', timeBudgetMinutes: 90.4, items: [item({ id: 'i2', title: 'Reading', subjectBucket: SubjectBucket.Reading, estimatedMinutes: 20 })] },
  ],
  skipSuggestions: [],
  minimumWin: 'Read together',
  ...over,
})

const baseInput = (over: Partial<ApplyWeekPlanInput> = {}): ApplyWeekPlanInput => ({
  familyId: 'fam1',
  childId: 'c1',
  weekStart: WEEK_START,
  draft: draft(),
  children: [{ id: 'c1' }, { id: 'c2' }],
  activityConfigs: [],
  canEdit: true,
  ...over,
})

const completedRow = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  label: 'Finished handwriting (15m)',
  completed: true,
  source: 'planner',
  estimatedMinutes: 15,
  actualMinutes: 18,
  evidenceArtifactId: 'art-1',
  ...over,
})

const manualRow = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  label: 'Library trip (40m)',
  completed: false,
  source: 'manual',
  estimatedMinutes: 40,
  ...over,
})

const staleplannerRow = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  label: 'Old math from last plan (30m)',
  completed: false,
  source: 'planner',
  estimatedMinutes: 30,
  ...over,
})

const rolledResidue = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  label: 'Rolled over reading (20m)',
  completed: false,
  source: 'planner',
  rolledOverFrom: '2026-08-14',
  estimatedMinutes: 20,
  ...over,
})

const trackedBlock = (over: Partial<DayBlock> = {}): DayBlock => ({
  type: DayBlockType.Reading,
  title: 'Read aloud',
  plannedMinutes: 20,
  actualMinutes: 22,
  source: 'planner',
  ...over,
})

/**
 * Wire the mocked `getDoc` so the week doc and each day doc answer with the
 * supplied state. Anything not named answers "absent".
 */
function stubDocs(present: Record<string, object>) {
  getDocMock.mockImplementation((ref: { id: string }) => {
    const data = present[ref.id]
    return Promise.resolve({
      exists: () => data !== undefined,
      data: () => data,
    })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setDayLogGuardedMock.mockResolvedValue(undefined)
  setDocMock.mockResolvedValue(undefined)
  stubDocs({})
})

// ── Pure core ────────────────────────────────────────────────────────────────

describe('buildApplyChecklist', () => {
  it('writes the "(Nm)" label shape the rest of the app matches on', () => {
    const [row] = buildApplyChecklist([item()], [], new Map())
    expect(row.label).toBe('GATB Math (30m)')
    expect(row.source).toBe('planner')
    expect(row.completed).toBe(false)
  })

  // The two fields default ASYMMETRICALLY, and this suite pins that rather than
  // tidying it: `category` falls back to `'must-do'`, but `mvdEssential` is
  // computed from the item's OWN category (`item.category === 'must-do'`), which
  // is false when the item never carried one. So an untagged item is must-do on
  // the day and still not part of the MVD floor. Whether that is what anyone
  // intended is a separate question from whether the extraction changed it — it
  // did not, and a run that "fixed" it here would have silently altered which
  // items survive a Minimum Viable Day.
  it('defaults an untagged item to category must-do but NOT to the MVD floor', () => {
    const [row] = buildApplyChecklist([item()], [], new Map())
    expect(row.category).toBe('must-do')
    expect(row.mvdEssential).toBe(false)
  })

  it('puts an explicit must-do item on the MVD floor', () => {
    const [row] = buildApplyChecklist([item({ category: 'must-do' })], [], new Map())
    expect(row.category).toBe('must-do')
    expect(row.mvdEssential).toBe(true)
  })

  it('keeps an explicit choose category out of the MVD floor', () => {
    const [row] = buildApplyChecklist([item({ category: 'choose' })], [], new Map())
    expect(row.category).toBe('choose')
    expect(row.mvdEssential).toBe(false)
  })

  it("honours an item's own mvdEssential flag over the category inference", () => {
    const [row] = buildApplyChecklist(
      [item({ category: 'choose', mvdEssential: true })],
      [],
      new Map(),
    )
    expect(row.mvdEssential).toBe(true)
  })

  it('stamps a lessonCardId only when the caller generated one', () => {
    const withCard = buildApplyChecklist([item()], [], new Map([['GATB Math', 'card-9']]))
    expect(withCard[0].lessonCardId).toBe('card-9')
    // The chat passes no map at all — the row is simply cardless, which is the
    // same shape a failed generation has always produced.
    const withoutCard = buildApplyChecklist([item()], [], new Map())
    expect(withoutCard[0]).not.toHaveProperty('lessonCardId')
  })

  it('joins the FEAT-62 workbookConfigId while the identity is recoverable', () => {
    const [row] = buildApplyChecklist(
      [item({ title: 'GATB Math' })],
      [{ id: 'cfg-1', name: 'GATB Math', subjectBucket: SubjectBucket.Math, type: 'workbook' }],
      new Map(),
    )
    expect(row.workbookConfigId).toBe('cfg-1')
  })

  it('carries the optional item fields through only when present', () => {
    const [row] = buildApplyChecklist(
      [item({ itemType: 'watch', watchVideoId: 'v1', link: '/quest', bookId: 'b1' })],
      [],
      new Map(),
    )
    expect(row.itemType).toBe('watch')
    expect(row.watchVideoId).toBe('v1')
    expect(row.link).toBe('/quest')
    expect(row.bookId).toBe('b1')
    expect(row).not.toHaveProperty('skipGuidance')
    expect(row).not.toHaveProperty('evaluationMode')
  })
})

describe('buildApplyBlocks', () => {
  it('writes a block per non-app item, carrying plannedMinutes', () => {
    const blocks = buildApplyBlocks([item()])
    expect(blocks).toEqual([
      {
        type: DayBlockType.Math,
        title: 'GATB Math',
        subjectBucket: SubjectBucket.Math,
        plannedMinutes: 30,
        skillTags: [],
        ladderRef: undefined,
        source: 'planner',
      },
    ])
  })

  it('never gives an app block planned minutes', () => {
    expect(buildApplyBlocks([item({ isAppBlock: true })])).toEqual([])
  })
})

describe('subjectToDayBlockType', () => {
  it('maps every subject the way the page did', () => {
    expect(subjectToDayBlockType(SubjectBucket.Reading)).toBe(DayBlockType.Reading)
    expect(subjectToDayBlockType(SubjectBucket.LanguageArts)).toBe(DayBlockType.Reading)
    expect(subjectToDayBlockType(SubjectBucket.Math)).toBe(DayBlockType.Math)
    expect(subjectToDayBlockType(SubjectBucket.Science)).toBe(DayBlockType.Project)
    expect(subjectToDayBlockType(SubjectBucket.SocialStudies)).toBe(DayBlockType.Together)
    expect(subjectToDayBlockType(SubjectBucket.Other)).toBe(DayBlockType.Other)
  })
})

describe('buildAppliedDayLog — the retain rules (HARD CONSTRAINT)', () => {
  const existing: DayLog = {
    childId: 'c1',
    date: MONDAY,
    checklist: [completedRow(), manualRow(), staleplannerRow(), rolledResidue()],
    blocks: [trackedBlock(), { type: DayBlockType.Math, title: 'Untracked', source: 'planner' }],
    createdAt: 'x',
    updatedAt: 'x',
  }

  it('retains completed work with its minutes and evidence', () => {
    const after = buildAppliedDayLog(existing, [], [], 120, 'now')
    const kept = after.checklist?.find((i) => i.label === completedRow().label)
    expect(kept).toBeDefined()
    expect(kept?.actualMinutes).toBe(18)
    expect(kept?.evidenceArtifactId).toBe('art-1')
  })

  it('retains manually-added rows', () => {
    const after = buildAppliedDayLog(existing, [], [], 120, 'now')
    expect(after.checklist?.some((i) => i.source === 'manual')).toBe(true)
  })

  it('drops stale incomplete planner residue and rolled-over leftovers', () => {
    const after = buildAppliedDayLog(existing, [], [], 120, 'now')
    const labels = after.checklist?.map((i) => i.label) ?? []
    expect(labels).not.toContain(staleplannerRow().label)
    expect(labels).not.toContain(rolledResidue().label)
  })

  it('appends the fresh plan AFTER everything retained', () => {
    const fresh = buildApplyChecklist([item()], [], new Map())
    const after = buildAppliedDayLog(existing, fresh, [], 120, 'now')
    expect(after.checklist?.at(-1)?.label).toBe('GATB Math (30m)')
  })

  it('keeps blocks carrying logged minutes and drops untracked planner blocks', () => {
    const after = buildAppliedDayLog(existing, [], buildApplyBlocks([item()]), 120, 'now')
    const titles = after.blocks?.map((b) => b.title) ?? []
    expect(titles).toContain('Read aloud')
    expect(titles).not.toContain('Untracked')
    expect(titles).toContain('GATB Math')
  })

  it('persists the day budget and stamps updatedAt', () => {
    const after = buildAppliedDayLog(existing, [], [], 120, 'stamp')
    expect(after.dailyBudgetMinutes).toBe(120)
    expect(after.updatedAt).toBe('stamp')
  })
})

describe('applicableDays / planGoalsForDraft', () => {
  it('skips days with no accepted items and days outside Mon–Fri', () => {
    const plan = draft({
      days: [
        { day: 'Monday', timeBudgetMinutes: 60, items: [item()] },
        { day: 'Tuesday', timeBudgetMinutes: 60, items: [item({ accepted: false })] },
        { day: 'Saturday', timeBudgetMinutes: 60, items: [item()] },
      ],
    })
    expect(applicableDays(plan).map((d) => d.day)).toEqual(['Monday'])
  })

  it('records accepted non-app item titles as the week goals', () => {
    const plan = draft({
      days: [
        {
          day: 'Monday',
          timeBudgetMinutes: 60,
          items: [item(), item({ id: 'a', title: 'Minecraft', isAppBlock: true }), item({ id: 'b', title: 'Nope', accepted: false })],
        },
      ],
    })
    expect(planGoalsForDraft(plan)).toEqual(['GATB Math'])
  })
})

// ── The guarded writer ───────────────────────────────────────────────────────

describe('applyDraftWeek', () => {
  it('writes each Mon–Fri day through setDayLogGuarded, never a raw setDoc', async () => {
    const result = await applyDraftWeek(baseInput())

    expect(result.daysWritten).toEqual([MONDAY, TUESDAY])
    expect(setDayLogGuardedMock).toHaveBeenCalledTimes(2)
    // The only `setDoc` in the run is the WeekPlan upsert — days never take one.
    const dayWrites = setDocMock.mock.calls.filter(
      ([ref]) => typeof (ref as { id?: string }).id === 'string' && (ref as { id: string }).id.includes('_c1'),
    )
    expect(dayWrites).toHaveLength(0)
  })

  it('creates a fresh day log when the day has never been opened', async () => {
    await applyDraftWeek(baseInput())
    const [, payload, context] = setDayLogGuardedMock.mock.calls[0]
    expect(context).toBe('apply-plan-new')
    expect(payload.date).toBe(MONDAY)
    expect(payload.childId).toBe('c1')
    expect(payload.dailyBudgetMinutes).toBe(120)
    expect(payload.checklist?.[0].label).toBe('GATB Math (30m)')
    expect(payload.blocks?.[0].plannedMinutes).toBe(30)
  })

  it('rounds a fractional day budget, as the page did', async () => {
    await applyDraftWeek(baseInput())
    const tuesday = setDayLogGuardedMock.mock.calls[1][1]
    expect(tuesday.dailyBudgetMinutes).toBe(90)
  })

  it('merges onto an existing day under the retain rules', async () => {
    stubDocs({
      [`${MONDAY}_c1`]: {
        childId: 'c1',
        date: MONDAY,
        checklist: [completedRow(), manualRow(), staleplannerRow()],
        blocks: [trackedBlock()],
      },
    })

    await applyDraftWeek(baseInput())

    const [, payload, context] = setDayLogGuardedMock.mock.calls[0]
    expect(context).toBe('apply-plan')
    const labels = payload.checklist?.map((i) => i.label) ?? []
    expect(labels).toContain(completedRow().label)
    expect(labels).toContain(manualRow().label)
    expect(labels).not.toContain(staleplannerRow().label)
    expect(labels.at(-1)).toBe('GATB Math (30m)')
    expect(payload.blocks?.some((b) => b.title === 'Read aloud')).toBe(true)
  })

  it('creates an absent WeekPlan doc rather than skipping it (FEAT-112 follow-up)', async () => {
    await applyDraftWeek(baseInput())
    const weekWrite = setDocMock.mock.calls.find(([ref]) => (ref as { id: string }).id === WEEK_START)
    expect(weekWrite).toBeDefined()
    const plan = weekWrite?.[1] as { startDate: string; childGoals: { childId: string; goals: string[] }[] }
    expect(plan.startDate).toBe(WEEK_START)
    expect(plan.childGoals.find((g) => g.childId === 'c1')?.goals).toEqual(['GATB Math', 'Reading'])
    // Siblings are seeded with empty goals, exactly like the planner's own seed.
    expect(plan.childGoals.find((g) => g.childId === 'c2')?.goals).toEqual([])
  })

  it('appends this child’s goals to an existing WeekPlan without touching a sibling', async () => {
    stubDocs({
      [WEEK_START]: {
        startDate: WEEK_START,
        theme: 'Courage',
        childGoals: [
          { childId: 'c1', goals: ['Earlier goal'] },
          { childId: 'c2', goals: ['Sibling goal'] },
        ],
      },
    })

    await applyDraftWeek(baseInput())

    const weekWrite = setDocMock.mock.calls.find(([ref]) => (ref as { id: string }).id === WEEK_START)
    const plan = weekWrite?.[1] as { theme: string; childGoals: { childId: string; goals: string[] }[] }
    expect(plan.theme).toBe('Courage')
    expect(plan.childGoals.find((g) => g.childId === 'c1')?.goals).toEqual([
      'Earlier goal',
      'GATB Math',
      'Reading',
    ])
    expect(plan.childGoals.find((g) => g.childId === 'c2')?.goals).toEqual(['Sibling goal'])
  })

  it('leaves an existing read-aloud book alone when the caller passes none', async () => {
    stubDocs({
      [WEEK_START]: { startDate: WEEK_START, childGoals: [], readAloudBookId: 'book-7' },
    })

    await applyDraftWeek(baseInput())

    const weekWrite = setDocMock.mock.calls.find(([ref]) => (ref as { id: string }).id === WEEK_START)
    expect((weekWrite?.[1] as { readAloudBookId?: string }).readAloudBookId).toBe('book-7')
  })

  it('clears the read-aloud book when the caller explicitly passes null', async () => {
    stubDocs({
      [WEEK_START]: { startDate: WEEK_START, childGoals: [], readAloudBookId: 'book-7' },
    })

    await applyDraftWeek(baseInput({ readAloudBookId: null }))

    const weekWrite = setDocMock.mock.calls.find(([ref]) => (ref as { id: string }).id === WEEK_START)
    expect(weekWrite?.[1]).not.toHaveProperty('readAloudBookId')
  })

  it('sets the read-aloud book when the caller names one', async () => {
    stubDocs({ [WEEK_START]: { startDate: WEEK_START, childGoals: [] } })
    await applyDraftWeek(baseInput({ readAloudBookId: 'book-9' }))
    const weekWrite = setDocMock.mock.calls.find(([ref]) => (ref as { id: string }).id === WEEK_START)
    expect((weekWrite?.[1] as { readAloudBookId?: string }).readAloudBookId).toBe('book-9')
  })

  it('refuses without canEdit, before any read or write', async () => {
    await expect(applyDraftWeek(baseInput({ canEdit: false }))).rejects.toThrow(WeekApplyError)
    expect(setDayLogGuardedMock).not.toHaveBeenCalled()
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('reports which days landed when a later day fails mid-week', async () => {
    setDayLogGuardedMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'))

    const err = await applyDraftWeek(baseInput()).catch((e) => e as WeekApplyError)

    expect(err).toBeInstanceOf(WeekApplyError)
    expect((err as WeekApplyError).daysWritten).toEqual([MONDAY])
    expect((err as WeekApplyError).weekPlanWritten).toBe(true)
    expect((err as WeekApplyError).cause).toBeInstanceOf(Error)
  })
})
