// ── FEAT-150: the draft is bound to the boy it was made for ──────────────────
//
// Codex P1 on PR #1679. The chat's active child changes when the parent taps a
// tab; a draft on screen does not. So "which child does Apply write to" cannot
// be answered by reading the current tab — it has to be the child the draft was
// GENERATED for, because the plan inside it was built from that child's
// snapshot, workbook positions and priority skills.
//
// Two defences, and this suite pins both: the write targets `view.childId`, and
// the draft is cleared outright when the context changes so a card for one boy
// never sits under another boy's tab.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import type { DraftWeeklyPlan } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'

const { generateMock, writeMock } = vi.hoisted(() => ({
  generateMock: vi.fn(),
  writeMock: vi.fn(),
}))

vi.mock('./generateNextWeekDraft', () => ({ generateNextWeekDraft: generateMock }))
vi.mock('./writeNextWeekDraft', () => ({ writeNextWeekDraft: writeMock }))

import { useNextWeekDraft, type UseNextWeekDraftDeps } from './useNextWeekDraft'
import type { DraftNextWeekAction } from './nextWeekActions'

const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Chicago'
})
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

const draft: DraftWeeklyPlan = {
  days: [
    {
      day: 'Monday',
      timeBudgetMinutes: 120,
      items: [
        {
          id: 'i1',
          title: 'GATB Math',
          subjectBucket: SubjectBucket.Math,
          estimatedMinutes: 30,
          skillTags: [],
          accepted: true,
        },
      ],
    },
  ],
  skipSuggestions: [],
  minimumWin: 'Read together',
}

const deps = (over: Partial<UseNextWeekDraftDeps> = {}): UseNextWeekDraftDeps => ({
  familyId: 'fam1',
  activeChildId: 'lincoln',
  children: [{ id: 'lincoln' }, { id: 'london' }],
  activityConfigs: [],
  dailyRoutine: 'Reading 20m',
  hoursPerDay: 2.5,
  snapshot: null,
  canEdit: true,
  chat: vi.fn(),
  ...over,
})

const action = (childId = 'lincoln'): DraftNextWeekAction => ({
  kind: 'draftNextWeek',
  childId,
  instructions: 'lighter, math every day but short',
})

beforeEach(() => {
  vi.clearAllMocks()
  generateMock.mockResolvedValue({ draft, usedAI: true })
  writeMock.mockResolvedValue({ status: 'done', daysWritten: ['2026-08-24'] })
})

describe('useNextWeekDraft — the draft belongs to a child (Codex P1, #1679)', () => {
  it('stamps the generating child onto the draft', async () => {
    const { result } = renderHook(() => useNextWeekDraft(deps()))
    await act(async () => {
      await result.current.generateNextWeek(action('lincoln'))
    })
    expect(result.current.nextWeek.childId).toBe('lincoln')
    expect(result.current.nextWeek.phase).toBe('ready')
  })

  it("applies to the DRAFT's stamped child, not to a re-read of the active tab", async () => {
    // Defence in depth, and worth being precise about what this does and does
    // not prove. With the clearing effect below in place the two values cannot
    // diverge in a mounted component — a tab switch destroys the draft before it
    // can be applied. What this pins is that the write reads the value that is
    // *bound to the plan* rather than the one that follows the UI, so the
    // guarantee does not depend on the effect firing first. Both defences are
    // cheap; relying on either alone is what made this a P1.
    const { result } = renderHook(() => useNextWeekDraft(deps({ activeChildId: 'lincoln' })))
    await act(async () => {
      await result.current.generateNextWeek(action('lincoln'))
    })
    await act(async () => {
      await result.current.applyNextWeek()
    })
    expect(writeMock.mock.calls[0][0].childId).toBe(result.current.nextWeek.childId)
    expect(writeMock.mock.calls[0][0].childId).toBe('lincoln')
  })

  it('refuses to generate for a child other than the active one', async () => {
    const { result } = renderHook(() => useNextWeekDraft(deps({ activeChildId: 'lincoln' })))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.generateNextWeek(action('london'))
    })
    expect(ok).toBe(false)
    expect(generateMock).not.toHaveBeenCalled()
    expect(result.current.nextWeek.draft).toBeNull()
  })
})

describe('useNextWeekDraft — a draft is only visible under its own tab (Codex P1, #1679)', () => {
  it('clears a ready draft when the chat moves to another child', async () => {
    const { result, rerender } = renderHook((d: UseNextWeekDraftDeps) => useNextWeekDraft(d), {
      initialProps: deps({ activeChildId: 'lincoln' }),
    })
    await act(async () => {
      await result.current.generateNextWeek(action('lincoln'))
    })
    expect(result.current.nextWeek.phase).toBe('ready')

    await act(async () => {
      rerender(deps({ activeChildId: 'london' }))
    })

    // Gone from view entirely — not merely re-labelled. A card captioned
    // "London's week" showing a plan built from Lincoln's snapshot is the
    // untruth this prevents.
    expect(result.current.nextWeek.phase).toBe('idle')
    expect(result.current.nextWeek.draft).toBeNull()
    expect(result.current.nextWeek.childId).toBe('')
  })

  it("comes back when the parent returns to that boy's tab", async () => {
    // The keyed read hides the draft rather than destroying it, which is the
    // kinder behaviour: the plan is still Lincoln's, and the writer re-checks
    // the target week at the tap regardless of how long it sat.
    const { result, rerender } = renderHook((d: UseNextWeekDraftDeps) => useNextWeekDraft(d), {
      initialProps: deps({ activeChildId: 'lincoln' }),
    })
    await act(async () => {
      await result.current.generateNextWeek(action('lincoln'))
    })

    await act(async () => {
      rerender(deps({ activeChildId: 'london' }))
    })
    expect(result.current.nextWeek.phase).toBe('idle')

    await act(async () => {
      rerender(deps({ activeChildId: 'lincoln' }))
    })
    expect(result.current.nextWeek.phase).toBe('ready')
    expect(result.current.nextWeek.childId).toBe('lincoln')
  })

  it('does not clear on the first render, when nothing has switched', async () => {
    const { result } = renderHook(() => useNextWeekDraft(deps()))
    await act(async () => {
      await result.current.generateNextWeek(action())
    })
    expect(result.current.nextWeek.phase).toBe('ready')
  })

  it('survives an unrelated dep change — only the CHILD hides it', async () => {
    const { result, rerender } = renderHook((d: UseNextWeekDraftDeps) => useNextWeekDraft(d), {
      initialProps: deps({ hoursPerDay: 2.5 }),
    })
    await act(async () => {
      await result.current.generateNextWeek(action())
    })
    await act(async () => {
      rerender(deps({ hoursPerDay: 3 }))
    })
    expect(result.current.nextWeek.phase).toBe('ready')
  })
})

describe('useNextWeekDraft — the apply guard', () => {
  it('does not write twice on a repeat tap', async () => {
    const { result } = renderHook(() => useNextWeekDraft(deps()))
    await act(async () => {
      await result.current.generateNextWeek(action())
    })
    await act(async () => {
      await Promise.all([result.current.applyNextWeek(), result.current.applyNextWeek()])
    })
    // Applying appends the plan onto whatever the day already holds, so a second
    // write is a doubled checklist, not a no-op.
    expect(writeMock).toHaveBeenCalledTimes(1)
    expect(result.current.nextWeek.phase).toBe('applied')
  })

  it('returns to ready and releases the guard when the write is REFUSED', async () => {
    writeMock.mockResolvedValue({ status: 'refused', notice: 'The week rolled over.' })
    const { result } = renderHook(() => useNextWeekDraft(deps()))
    await act(async () => {
      await result.current.generateNextWeek(action())
    })
    await act(async () => {
      await result.current.applyNextWeek()
    })
    expect(result.current.nextWeek.phase).toBe('ready')
    expect(result.current.nextWeek.error).toBe('The week rolled over.')
  })

  it('goes terminal on a PARTIAL write, and reports what landed', async () => {
    writeMock.mockResolvedValue({
      status: 'partial',
      daysWritten: ['2026-08-24'],
      weekPlanWritten: true,
    })
    const { result } = renderHook(() => useNextWeekDraft(deps()))
    await act(async () => {
      await result.current.generateNextWeek(action())
    })
    await act(async () => {
      await result.current.applyNextWeek()
    })
    expect(result.current.nextWeek.phase).toBe('error')
    expect(result.current.nextWeek.error).toContain('Monday')
    // The guard stays set — a retry over a half-written week doubles a day.
    await act(async () => {
      await result.current.applyNextWeek()
    })
    expect(writeMock).toHaveBeenCalledTimes(1)
  })

  it('names the goals-only failure accurately (Codex P2, #1679)', async () => {
    writeMock.mockResolvedValue({ status: 'partial', daysWritten: [], weekPlanWritten: true })
    const { result } = renderHook(() => useNextWeekDraft(deps()))
    await act(async () => {
      await result.current.generateNextWeek(action())
    })
    await act(async () => {
      await result.current.applyNextWeek()
    })
    expect(result.current.nextWeek.error).toMatch(/goals were saved/i)
    expect(result.current.nextWeek.error).not.toMatch(/nothing was written/i)
  })

  it('refuses to generate at all without the capability', async () => {
    const { result } = renderHook(() => useNextWeekDraft(deps({ canEdit: false })))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.generateNextWeek(action())
    })
    expect(ok).toBe(false)
    expect(generateMock).not.toHaveBeenCalled()
  })
})
