import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── FEAT-70: the review note's "was anything tricky?" seeds the re-test queue ──
//
// The review note is a DIFFERENT MOMENT from the other daily struggle signals, not a
// duplicate of them: "Quick Review" is gated on `evidenceArtifactId`, so it appears
// only AFTER work was captured and the parent looked at what came back — often when
// the in-the-moment mastery chip already reads `got-it`.
//
// These tests cover the wire (does the toggle seed?), the transition guard (the
// subtle one), the no-guess bail, fire-and-forget isolation, and the §14 copy rails.
// `enqueueStuckRetests` and the resolver are UNTOUCHED — this is a fourth caller of a
// tested path, so the existing `stuckRetestQueue.test.ts` cases stay green unmodified.

// Only `enqueueStuckRetests` is mocked — the real constants and the real transition
// predicate stay live, so the assertions below check the shipped values, not stand-ins.
const enqueueStuckRetests = vi.fn()
vi.mock('./stuckRetestQueue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./stuckRetestQueue')>()
  return {
    ...actual,
    enqueueStuckRetests: (...args: unknown[]) => enqueueStuckRetests(...args),
  }
})

import TodayChecklist from './TodayChecklist'
import {
  GRADE_NOTE_RETEST_REASON,
  STUCK_RETEST_REASON,
  ENGAGEMENT_RETEST_REASON,
  shouldSeedFromReviewNote,
} from './stuckRetestQueue'
import { MathTags } from '../../core/types/skillTags'
import type { ChecklistItem, DayLog, SkillSnapshot } from '../../core/types'
import { PlanType, SubjectBucket } from '../../core/types/enums'
import type { WorkbookConfigLike } from '../../core/utils/workbookMatching'

/** A workbook config the item points at by id, so the resolved `config` is assertable. */
const fpConfig: WorkbookConfigLike & { currentPosition?: number } = {
  id: 'cfg-fp',
  name: 'Fast Phonics',
  type: 'workbook',
  scannable: true,
  currentPosition: 65,
}

/**
 * A completed item with captured evidence and NO saved note — the exact gate the
 * "Quick Review" button reads (`evidenceArtifactId && !gradeResult`). Carries a
 * mapped `skillTag` so the tag path resolves without a workbook link.
 */
function makeItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    label: 'Regrouping practice',
    completed: true,
    subjectBucket: SubjectBucket.Math,
    evidenceArtifactId: 'artifact-1',
    evidenceCollection: 'artifacts',
    skillTags: [MathTags.SubtractionRegroup],
    ...overrides,
  }
}

function renderChecklist(
  item: ChecklistItem,
  opts: {
    persistDayLogImmediate?: ReturnType<typeof vi.fn>
    configs?: Array<WorkbookConfigLike & { currentPosition?: number }>
    familyId?: string
    selectedChildId?: string
  } = {},
) {
  const dayLog = { id: '2026-07-26', date: '2026-07-26', checklist: [item] } as unknown as DayLog
  render(
    <MemoryRouter>
      <TodayChecklist
        dayLog={dayLog}
        selectedChild={{ name: 'Lincoln', id: 'c1' }}
        selectedChildId={opts.selectedChildId ?? 'c1'}
        familyId={opts.familyId ?? 'f1'}
        today="2026-07-26"
        isToday
        planType={PlanType.Normal}
        todaySnapshot={null as SkillSnapshot | null}
        activeRoutineItems={undefined}
        persistDayLogImmediate={opts.persistDayLogImmediate ?? vi.fn()}
        onTeachHelperOpen={vi.fn()}
        onUnifiedCapture={vi.fn()}
        onBackfillWorkbookScan={vi.fn()}
        todayArtifacts={[]}
        configs={opts.configs ?? []}
        onPreCompletionScan={vi.fn()}
        captureLoading={false}
        captureItemIndex={null}
        scanResult={null}
        scanError={null}
        onScanAddToPlan={vi.fn()}
        onScanSkip={vi.fn()}
        onClearScan={vi.fn()}
        onPrintMaterials={vi.fn()}
        printingMaterials={false}
      />
    </MemoryRouter>,
  )
}

const quickReview = () => screen.getByRole('button', { name: /quick review/i })
const trickyToggle = () => screen.getByRole('checkbox', { name: /was anything here tricky/i })
const saveButton = () => screen.getByRole('button', { name: /^save$/i })

/** Open the note editor, type a note, optionally flip the toggle, and save. */
async function saveNote(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
  flagTricky: boolean,
) {
  await user.click(quickReview())
  await user.type(screen.getByRole('textbox'), text)
  if (flagTricky) await user.click(trickyToggle())
  await user.click(saveButton())
}

beforeEach(() => {
  // Default to a resolving promise — the real writer is `async` (typed `Promise<void>`)
  // and the call-site chains `.catch` off it.
  enqueueStuckRetests.mockReset()
  enqueueStuckRetests.mockResolvedValue(undefined)
})

describe('FEAT-70 — the toggle is optional and defaults off', () => {
  it('renders the note editor with the tricky toggle unchecked', async () => {
    const user = userEvent.setup()
    renderChecklist(makeItem())
    await user.click(quickReview())
    expect(trickyToggle()).not.toBeChecked()
  })

  it('saving with the toggle OFF persists the note, no flag, and seeds nothing', async () => {
    const user = userEvent.setup()
    const persist = vi.fn()
    renderChecklist(makeItem(), { persistDayLogImmediate: persist })

    await saveNote(user, 'went fine', false)

    // The note still saves exactly as it did before the flag existed.
    const saved = persist.mock.calls.at(-1)?.[0] as DayLog
    expect(saved.checklist?.[0].gradeResult).toBe('went fine')
    expect(saved.checklist?.[0].reviewFlaggedTricky).toBeFalsy()
    // No struggle signal ⇒ no re-test.
    expect(enqueueStuckRetests).not.toHaveBeenCalled()
  })

  it('never sets mastery or engagement — three fields, three meanings', async () => {
    const user = userEvent.setup()
    const persist = vi.fn()
    renderChecklist(makeItem(), { persistDayLogImmediate: persist })

    await saveNote(user, 'regrouping was tricky', true)

    const saved = persist.mock.calls.at(-1)?.[0] as DayLog
    expect(saved.checklist?.[0].reviewFlaggedTricky).toBe(true)
    // The toggle must not overwrite the parent's in-the-moment read (which would also
    // trigger the mastery chip's parallel skillSnapshots write).
    expect(saved.checklist?.[0].mastery).toBeUndefined()
    expect(saved.checklist?.[0].engagement).toBeUndefined()
  })
})

describe('FEAT-70 — flipping the toggle on seeds the re-test queue', () => {
  it('persists the flag alongside the note in ONE write and enqueues once', async () => {
    const user = userEvent.setup()
    const persist = vi.fn()
    renderChecklist(makeItem(), { persistDayLogImmediate: persist })

    await saveNote(user, 'regrouping was tricky', true)

    // One write carries both the note and the flag — not two.
    const persistCalls = persist.mock.calls.filter((c) => {
      const log = c[0] as DayLog
      return log.checklist?.[0].gradeResult === 'regrouping was tricky'
    })
    expect(persistCalls).toHaveLength(1)
    expect((persistCalls[0][0] as DayLog).checklist?.[0].reviewFlaggedTricky).toBe(true)

    expect(enqueueStuckRetests).toHaveBeenCalledTimes(1)
  })

  it('passes the item, the resolved config, and the FEAT-70 reason', async () => {
    const user = userEvent.setup()
    renderChecklist(makeItem({ workbookConfigId: 'cfg-fp' }), { configs: [fpConfig] })

    await saveNote(user, 'regrouping was tricky', true)

    const [familyId, childId, item, config, nowIso, reason] =
      enqueueStuckRetests.mock.calls[0]
    expect(familyId).toBe('f1')
    expect(childId).toBe('c1')
    expect((item as ChecklistItem).skillTags).toEqual([MathTags.SubtractionRegroup])
    // Resolved exactly as the two existing call-sites resolve it.
    expect(config).toBe(fpConfig)
    expect(typeof nowIso).toBe('string')
    expect(reason).toBe(GRADE_NOTE_RETEST_REASON)
  })

  it("the reason is distinct from the chip's and the engagement flag's", () => {
    // The parent-facing ask must read honestly about WHICH signal seeded it.
    expect(GRADE_NOTE_RETEST_REASON).not.toBe(STUCK_RETEST_REASON)
    expect(GRADE_NOTE_RETEST_REASON).not.toBe(ENGAGEMENT_RETEST_REASON)
  })

  it('passes `undefined` config for a non-workbook item — the tag path fills in', async () => {
    const user = userEvent.setup()
    renderChecklist(makeItem(), { configs: [fpConfig] })

    await saveNote(user, 'regrouping was tricky', true)

    expect(enqueueStuckRetests.mock.calls[0][3]).toBeUndefined()
  })

  it('does not enqueue without a familyId (same guard as handleEngagement)', async () => {
    const user = userEvent.setup()
    const persist = vi.fn()
    renderChecklist(makeItem(), { familyId: '', persistDayLogImmediate: persist })

    await saveNote(user, 'regrouping was tricky', true)

    // The note still saves — only the model write-back is skipped.
    expect((persist.mock.calls.at(-1)?.[0] as DayLog).checklist?.[0].gradeResult).toBe(
      'regrouping was tricky',
    )
    expect(enqueueStuckRetests).not.toHaveBeenCalled()
  })
})

describe('FEAT-70 — the false→true transition guard', () => {
  // THE SUBTLE ONE. `withOpenQuestion` dedups the openQuestion, but the `queueTest`
  // branch appends a `changeFeed` line UNCONDITIONALLY, so a re-save on an
  // already-flagged item would stack duplicate change lines onto the learner model.
  // Asserted directly against the shipped predicate: "Quick Review" is gated on
  // `!item.gradeResult`, so a re-save is unreachable in today's UI and a render-level
  // test could not prove this.

  it('seeds on the false→true transition', () => {
    expect(shouldSeedFromReviewNote(undefined, true)).toBe(true)
    expect(shouldSeedFromReviewNote(false, true)).toBe(true)
  })

  it('does NOT seed again when the item is already flagged (re-save)', () => {
    expect(shouldSeedFromReviewNote(true, true)).toBe(false)
  })

  it('does not seed when the toggle is off, flagged or not', () => {
    expect(shouldSeedFromReviewNote(undefined, false)).toBe(false)
    expect(shouldSeedFromReviewNote(false, false)).toBe(false)
    expect(shouldSeedFromReviewNote(true, false)).toBe(false)
  })
})

describe('FEAT-70 — fire-and-forget: the note is never blocked by the model write', () => {
  // `enqueueStuckRetests` is `async`, so a REJECTION is the reachable failure mode —
  // and a reachable one: the writer's own try/catch starts after its model-free
  // pre-resolve, so a throw out of `resolveStuckConcepts` escapes as a rejection. The
  // call-site `.catch` is what keeps that from becoming an unhandled rejection.
  it('swallows a rejected enqueue and still saves the note, unreverted', async () => {
    const user = userEvent.setup()
    const persist = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    enqueueStuckRetests.mockRejectedValue(new Error('learner model unreachable'))
    renderChecklist(makeItem(), { persistDayLogImmediate: persist })

    await expect(saveNote(user, 'regrouping was tricky', true)).resolves.toBeUndefined()

    // The parent's write landed and was not reverted.
    const saved = persist.mock.calls.at(-1)?.[0] as DayLog
    expect(saved.checklist?.[0].gradeResult).toBe('regrouping was tricky')
    expect(saved.checklist?.[0].reviewFlaggedTricky).toBe(true)

    // Swallowed at the call-site, not escalated — and visible in the log.
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })

  it('closes the editor and shows the saved note even when the enqueue rejects', async () => {
    const user = userEvent.setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    enqueueStuckRetests.mockRejectedValue(new Error('write failed'))
    renderChecklist(makeItem(), { persistDayLogImmediate: vi.fn() })

    await saveNote(user, 'regrouping was tricky', true)

    // The UI completed its own transition — the failed model write is invisible here.
    expect(screen.queryByRole('checkbox', { name: /was anything here tricky/i })).toBeNull()
    warn.mockRestore()
  })
})

describe('FEAT-70 — §14 / ETHOS-02 copy rails on the new UI', () => {
  it('the toggle and the reason carry no band, percent, score, or judgment words', async () => {
    const user = userEvent.setup()
    renderChecklist(makeItem())
    await user.click(quickReview())

    // The new copy, plus the parent-facing ask text this path stamps.
    const strings = [
      trickyToggle().closest('label')?.textContent ?? '',
      GRADE_NOTE_RETEST_REASON,
    ]
    for (const s of strings) {
      expect(s).not.toMatch(/regress|dropped|failed|wrong|missed/i)
      expect(s).not.toMatch(/\d+\s*%/) // percentages
      expect(s).not.toMatch(/\b\d+\s*\/\s*\d+\b/) // 5/6-style bands
      expect(s).not.toMatch(/\bscore|grade[ds]?\b/i)
      expect(s).not.toMatch(/\bband\b/i)
    }
  })

  it('asks in the softened register — a question about tricky, not a grade', () => {
    expect(GRADE_NOTE_RETEST_REASON.toLowerCase()).toContain('tricky')
  })
})
