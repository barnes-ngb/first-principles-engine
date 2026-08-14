import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import type { ChatAction, Child } from '../../core/types'

// ── Mocks ────────────────────────────────────────────────────────
// Route applyChatAction through the shared sight-word writers (mocked) and a
// mocked Firestore so the propose→confirm→write contract is testable without
// touching real Firebase.
const addSightWord = vi.fn()
const removeSightWord = vi.fn()
vi.mock('../books/useSightWordProgress', () => ({
  addSightWord: (...args: unknown[]) => addSightWord(...args),
  removeSightWord: (...args: unknown[]) => removeSightWord(...args),
}))

// The shared soft-profile writer — the same one Settings uses. Mocked so the
// chat-action routing is testable without Firestore. Its own validation
// (disallowed-key defense in depth) is covered in updateChildSoftProfile.test.ts.
const updateChildSoftProfile = vi.fn()
vi.mock('../../core/family/updateChildSoftProfile', () => ({
  updateChildSoftProfile: (...args: unknown[]) => updateChildSoftProfile(...args),
}))

// The central additive snapshot writer (6a). Mocked so the 6b snapshot-action
// routing is testable without Firestore; its additive/dedup/evidence-stamp
// guarantees are covered in skillSnapshotWrites.test.ts.
const writeSnapshotUpdate = vi.fn()
vi.mock('../evaluate/skillSnapshotWrites', () => ({
  writeSnapshotUpdate: (...args: unknown[]) => writeSnapshotUpdate(...args),
}))

// The plan-adjustment HANDOFF staging (chunk 2A/2). Mocked so the handoff
// routing is testable without Firestore; its doc-write/path are covered in
// stagePlanAdjustment.test.ts. The key contract here: confirming the handoff
// stages a brief and navigates — it NEVER writes a plan or a child record.
const stagePlanAdjustment = vi.fn()
vi.mock('./stagePlanAdjustment', () => ({
  stagePlanAdjustment: (...args: unknown[]) => stagePlanAdjustment(...args),
}))

// The narrow single-field activity write (FEAT-135). Mocked so the resolution
// gate ("a hallucinated id never reaches a write") is assertable directly.
const updateActivityConfigMinutes = vi.fn()
vi.mock('../../core/firebase/updateActivityMinutes', () => ({
  updateActivityConfigMinutes: (...args: unknown[]) => updateActivityConfigMinutes(...args),
}))

// The shared `activityConfigs` write core (FEAT-143) — the SAME core
// `useActivityConfigs` wraps for Progress → Curriculum. Spied, not
// reimplemented, so these tests assert the chat calls the real writers with the
// real arguments; the payloads those writers produce (completedDate, the
// created-doc shape, the owner-rule throw) are pinned in
// activityConfigWrites.test.ts against actual Firestore primitives.
const addActivityConfig = vi.fn()
const completeActivityConfig = vi.fn()
const setActivityConfigPosition = vi.fn()
vi.mock('../../core/firebase/activityConfigWrites', async () => {
  const actual = await vi.importActual<typeof import('../../core/firebase/activityConfigWrites')>(
    '../../core/firebase/activityConfigWrites',
  )
  return {
    ...actual,
    addActivityConfig: (...args: unknown[]) => addActivityConfig(...args),
    completeActivityConfig: (...args: unknown[]) => completeActivityConfig(...args),
    setActivityConfigPosition: (...args: unknown[]) => setActivityConfigPosition(...args),
  }
})

// The FEAT-138 live-day edit lane (FEAT-142). Spied — NOT reimplemented — so
// these tests assert the chat calls the REAL lane. Everything else in the module
// (the completed-row rule, the identity lookup, the preservation guard) is left
// actual, and is covered by liveDayEdit.test.ts.
const removeItemFromLiveDay = vi.fn()
const moveItemToLiveDay = vi.fn()
const addItemToLiveDay = vi.fn()
vi.mock('../today/liveDayEdit', async () => {
  const actual = await vi.importActual<typeof import('../today/liveDayEdit')>(
    '../today/liveDayEdit',
  )
  return {
    ...actual,
    removeItemFromLiveDay: (...args: unknown[]) => removeItemFromLiveDay(...args),
    moveItemToLiveDay: (...args: unknown[]) => moveItemToLiveDay(...args),
    addItemToLiveDay: (...args: unknown[]) => addItemToLiveDay(...args),
  }
})

const updateDoc = vi.fn()
const arrayUnion = vi.fn((...v: unknown[]) => ({ __arrayUnion: v[0] }))
const doc = vi.fn((...args: unknown[]) => ({ __doc: args.length }))
vi.mock('firebase/firestore', () => ({
  updateDoc: (...args: unknown[]) => updateDoc(...args),
  arrayUnion: (...args: unknown[]) => arrayUnion(...args),
  doc: (...args: unknown[]) => doc(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  shellyChatMessagesCollection: vi.fn(() => ({ __collection: true })),
}))

import {
  resolveActivityConfig,
  useShellyChatActions,
  type ActivityMinutesAction,
  type ChatActivityConfig,
} from './useShellyChatActions'
import type { ChatWeekDay } from './dayItemActions'
import { currentWeekDayKeys } from './useChatWeekDays'

// The hook re-reads the CLOCK to bound proposals to the current week, so these
// fixtures are built from the real current week rather than hardcoded dates —
// hardcoded ones would pass this week and fail every week after.
const WEEK_KEYS = currentWeekDayKeys()
const MONDAY = WEEK_KEYS[0].dateKey
const THURSDAY = WEEK_KEYS[3].dateKey
const TUESDAY = WEEK_KEYS[1].dateKey

/** Lincoln's live week: a finished row, an ordinary one, and empty weekdays. */
const WEEK: ChatWeekDay[] = WEEK_KEYS.map((d, i) => ({
  dateKey: d.dateKey,
  label: d.label,
  items:
    i === 0
      ? [
          {
            itemKey: 'Reading Eggs (30m)::Reading',
            label: 'Reading Eggs (30m)',
            completed: true,
          },
          { itemKey: 'Math Facts (10m)::Math', label: 'Math Facts (10m)', completed: false },
        ]
      : [],
}))

/** Lincoln's own math activity, plus a shared read-aloud both boys do. */
const CONFIGS: ChatActivityConfig[] = [
  { id: 'cfg_math', name: 'Math Lesson', childId: 'lincoln1', defaultMinutes: 15 },
  { id: 'cfg_read', name: 'Read Aloud', childId: 'both', defaultMinutes: 20 },
  { id: 'cfg_london', name: "London's Letters", childId: 'london1', defaultMinutes: 10 },
]

const CHILDREN: Child[] = [
  { id: 'lincoln1', name: 'Lincoln' } as Child,
  { id: 'london1', name: 'London' } as Child,
]

const navigateToPlanner = vi.fn()

function setup(
  activeChildId = 'lincoln1',
  activeThreadId: string | null = 'thread1',
  opts: {
    activityConfigs?: ChatActivityConfig[]
    canEditActivityConfigs?: boolean
    weekDays?: ChatWeekDay[]
  } = {},
) {
  return renderHook(() =>
    useShellyChatActions({
      familyId: 'fam1',
      children: CHILDREN,
      activeChildId,
      activeThreadId,
      navigateToPlanner,
      activityConfigs: opts.activityConfigs ?? CONFIGS,
      weekDays: opts.weekDays ?? WEEK,
      canEditActivityConfigs: opts.canEditActivityConfigs ?? true,
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  addSightWord.mockResolvedValue(undefined)
  removeSightWord.mockResolvedValue(undefined)
  updateChildSoftProfile.mockResolvedValue(undefined)
  writeSnapshotUpdate.mockResolvedValue({ changed: true })
  stagePlanAdjustment.mockResolvedValue(undefined)
  updateActivityConfigMinutes.mockResolvedValue(undefined)
  addActivityConfig.mockResolvedValue('new-cfg-id')
  completeActivityConfig.mockResolvedValue(undefined)
  setActivityConfigPosition.mockResolvedValue(undefined)
  removeItemFromLiveDay.mockResolvedValue({ status: 'done' })
  moveItemToLiveDay.mockResolvedValue({ status: 'done' })
  addItemToLiveDay.mockResolvedValue({ status: 'done' })
  updateDoc.mockResolvedValue(undefined)
})

// ── setActivityMinutes (FEAT-135) ───────────────────────────────────
// Two contracts under test: a hallucinated id never reaches the write, and a
// confirmed write moves exactly one number forward — no dayLog, no plan, no
// child record, nothing retroactive.

const MINUTES_ACTION: ActivityMinutesAction = {
  kind: 'setActivityMinutes',
  childId: 'lincoln1',
  activityConfigId: 'cfg_math',
  minutes: 30,
}

describe('resolveActivityConfig (FEAT-135)', () => {
  it('resolves a config the acting child owns', () => {
    expect(resolveActivityConfig(CONFIGS, MINUTES_ACTION)?.name).toBe('Math Lesson')
  })

  it("resolves a shared ('both') config for either child", () => {
    const shared = { ...MINUTES_ACTION, activityConfigId: 'cfg_read' }
    expect(resolveActivityConfig(CONFIGS, shared)?.name).toBe('Read Aloud')
    expect(
      resolveActivityConfig(CONFIGS, { ...shared, childId: 'london1' })?.name,
    ).toBe('Read Aloud')
  })

  it('refuses an id that names no config at all', () => {
    const bogus = { ...MINUTES_ACTION, activityConfigId: 'cfg_hallucinated' }
    expect(resolveActivityConfig(CONFIGS, bogus)).toBeNull()
  })

  it("refuses a real config that belongs to a different child", () => {
    const sibling = { ...MINUTES_ACTION, activityConfigId: 'cfg_london' }
    expect(resolveActivityConfig(CONFIGS, sibling)).toBeNull()
  })
})

describe('useShellyChatActions — setActivityMinutes (FEAT-135)', () => {
  it('writes only defaultMinutes on the one named config, through the narrow helper', async () => {
    const { result } = setup()

    act(() => result.current.stagePendingActions('msg1', [MINUTES_ACTION]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(MINUTES_ACTION)
    })

    expect(ok).toBe(true)
    expect(updateActivityConfigMinutes).toHaveBeenCalledTimes(1)
    expect(updateActivityConfigMinutes).toHaveBeenCalledWith('fam1', 'cfg_math', 30)
    expect(result.current.pending[0].status).toBe('applied')
  })

  it('touches no day log, no plan, and no child record on a confirmed write', async () => {
    const { result } = setup()

    act(() => result.current.stagePendingActions('msg1', [MINUTES_ACTION]))
    await act(async () => {
      await result.current.applyChatAction(MINUTES_ACTION)
    })

    // Nothing retroactive: hours already recorded are a child's school record.
    expect(stagePlanAdjustment).not.toHaveBeenCalled()
    expect(addSightWord).not.toHaveBeenCalled()
    expect(removeSightWord).not.toHaveBeenCalled()
    expect(updateChildSoftProfile).not.toHaveBeenCalled()
    expect(writeSnapshotUpdate).not.toHaveBeenCalled()
    expect(navigateToPlanner).not.toHaveBeenCalled()
    // The ONLY Firestore doc write is the inline confirm audit on the source
    // chat message — the day-log persist path is never reached.
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const [, payload] = updateDoc.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(Object.keys(payload)).toEqual(['appliedActions'])
  })

  it('never offers a card for an id that resolves to no real config', () => {
    const { result } = setup()
    const bogus: ChatAction = { ...MINUTES_ACTION, activityConfigId: 'cfg_hallucinated' }

    act(() => result.current.stagePendingActions('msg1', [bogus]))

    expect(result.current.pending).toHaveLength(0)
  })

  it('never writes for a hallucinated id even if apply is called directly', async () => {
    const { result } = setup()
    const bogus: ChatAction = { ...MINUTES_ACTION, activityConfigId: 'cfg_hallucinated' }

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(bogus)
    })

    expect(ok).toBe(false)
    expect(updateActivityConfigMinutes).not.toHaveBeenCalled()
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it("never writes against another child's config", async () => {
    const { result } = setup()
    const sibling: ChatAction = { ...MINUTES_ACTION, activityConfigId: 'cfg_london' }

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(sibling)
    })

    expect(ok).toBe(false)
    expect(updateActivityConfigMinutes).not.toHaveBeenCalled()
  })

  // Codex P2 (PR #1653): the CF prompt is not profile-aware and always signs
  // off with "confirm with a tap", so a SILENTLY dropped proposal leaves the
  // reply promising a card that never renders. Dropping must be visible.
  it('explains a parent-only drop instead of dropping it silently', () => {
    const { result } = setup('lincoln1', 'thread1', { canEditActivityConfigs: false })

    act(() => result.current.stagePendingActions('msg1', [MINUTES_ACTION]))

    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed).toHaveLength(1)
    expect(result.current.suppressed[0]).toMatch(/grown-up/)
    expect(result.current.suppressed[0]).toMatch(/nothing was changed/)
  })

  it('explains an unmatched-activity drop, and points at the real screen', () => {
    const { result } = setup()
    const bogus: ChatAction = { ...MINUTES_ACTION, activityConfigId: 'nope' }

    act(() => result.current.stagePendingActions('msg1', [bogus]))

    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed[0]).toMatch(/didn't match one of your activities/)
    expect(result.current.suppressed[0]).toContain('Progress → Curriculum')
  })

  it('leaves no notice when every proposal is offerable', () => {
    const { result } = setup()

    act(() => result.current.stagePendingActions('msg1', [MINUTES_ACTION]))

    expect(result.current.pending).toHaveLength(1)
    expect(result.current.suppressed).toEqual([])
  })

  it('does not stack the same sentence for two bad proposals in one turn', () => {
    const { result } = setup()
    const a: ChatAction = { ...MINUTES_ACTION, activityConfigId: 'nope1' }
    const b: ChatAction = { ...MINUTES_ACTION, activityConfigId: 'nope2' }

    act(() => result.current.stagePendingActions('msg1', [a, b]))

    expect(result.current.suppressed).toHaveLength(1)
  })

  it('clears notices with the rest of the pending state', () => {
    const { result } = setup('lincoln1', 'thread1', { canEditActivityConfigs: false })

    act(() => result.current.stagePendingActions('msg1', [MINUTES_ACTION]))
    expect(result.current.suppressed).toHaveLength(1)

    act(() => result.current.clearPending())
    expect(result.current.suppressed).toEqual([])
  })

  it('is parent-only — a non-parent profile neither stages nor writes', async () => {
    const { result } = setup('lincoln1', 'thread1', { canEditActivityConfigs: false })

    act(() => result.current.stagePendingActions('msg1', [MINUTES_ACTION]))
    expect(result.current.pending).toHaveLength(0)

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(MINUTES_ACTION)
    })
    expect(ok).toBe(false)
    expect(updateActivityConfigMinutes).not.toHaveBeenCalled()
  })

  it('still stages other action kinds alongside a dropped activity proposal', () => {
    const { result } = setup()
    const bogus: ChatAction = { ...MINUTES_ACTION, activityConfigId: 'nope' }
    const word: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'because' }

    act(() => result.current.stagePendingActions('msg1', [bogus, word]))

    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0].action).toEqual(word)
  })
})

describe('useShellyChatActions', () => {
  it('does not write when actions are merely staged (no confirm tap)', () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'because' }

    act(() => result.current.stagePendingActions('msg1', [action]))

    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0].status).toBe('pending')
    expect(addSightWord).not.toHaveBeenCalled()
    expect(removeSightWord).not.toHaveBeenCalled()
  })

  it('routes a confirmed addSightWord through the shared writer', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'Because' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(true)
    expect(addSightWord).toHaveBeenCalledWith('fam1', 'lincoln1', 'Because')
    expect(removeSightWord).not.toHaveBeenCalled()
    expect(result.current.pending[0].status).toBe('applied')
  })

  it('routes a confirmed removeSightWord through the shared writer', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'removeSightWord', childId: 'lincoln1', word: 'the' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    await act(async () => {
      await result.current.applyChatAction(action)
    })

    expect(removeSightWord).toHaveBeenCalledWith('fam1', 'lincoln1', 'the')
    expect(addSightWord).not.toHaveBeenCalled()
  })

  it('records the applied action inline on the source message', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'said' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    await act(async () => {
      await result.current.applyChatAction(action)
    })

    expect(updateDoc).toHaveBeenCalledTimes(1)
    expect(arrayUnion).toHaveBeenCalledWith(
      expect.objectContaining({ action, appliedAt: expect.any(String) }),
    )
  })

  it('rejects an action whose childId is not a family child', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'ghost', word: 'because' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(false)
    expect(addSightWord).not.toHaveBeenCalled()
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('rejects an action that targets a child other than the active context', async () => {
    const { result } = setup('lincoln1')
    // london1 is a real child, but the active tab is Lincoln.
    const action: ChatAction = { kind: 'addSightWord', childId: 'london1', word: 'cat' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(false)
    expect(addSightWord).not.toHaveBeenCalled()
  })

  it('is idempotent and safe to re-tap a confirmed action', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'and' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    await act(async () => {
      await result.current.applyChatAction(action)
      await result.current.applyChatAction(action)
    })

    // The writer is safe to call again (setDoc merge); no throw, still applied.
    expect(addSightWord).toHaveBeenCalledTimes(2)
    expect(result.current.pending[0].status).toBe('applied')
  })

  it('dismisses an action without writing', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'play' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    act(() => result.current.dismissAction(action))

    expect(result.current.pending[0].status).toBe('dismissed')
    expect(addSightWord).not.toHaveBeenCalled()
  })

  // ── editProfileField (Tier B, Step 4) ──────────────────────────

  it('does not write an editProfileField when only staged', () => {
    const { result } = setup()
    const action: ChatAction = {
      kind: 'editProfileField',
      childId: 'lincoln1',
      field: 'motivators',
      value: 'Minecraft, Lego',
    }

    act(() => result.current.stagePendingActions('msg1', [action]))

    expect(result.current.pending[0].status).toBe('pending')
    expect(updateChildSoftProfile).not.toHaveBeenCalled()
  })

  it('routes a confirmed editProfileField through the shared profile writer', async () => {
    const { result } = setup()
    const action: ChatAction = {
      kind: 'editProfileField',
      childId: 'lincoln1',
      field: 'motivators',
      value: 'Minecraft, Lego, Art',
    }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(true)
    expect(updateChildSoftProfile).toHaveBeenCalledWith('fam1', 'lincoln1', {
      motivators: 'Minecraft, Lego, Art',
    })
    expect(addSightWord).not.toHaveBeenCalled()
    expect(result.current.pending[0].status).toBe('applied')
    // audit recorded inline on the source message
    expect(updateDoc).toHaveBeenCalledTimes(1)
  })

  it('rejects an editProfileField for a child other than the active context', async () => {
    const { result } = setup('lincoln1')
    const action: ChatAction = {
      kind: 'editProfileField',
      childId: 'london1', // real child, but Lincoln is active
      field: 'interests',
      value: 'dinosaurs',
    }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(false)
    expect(updateChildSoftProfile).not.toHaveBeenCalled()
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('rejects an editProfileField whose childId is not a family child', async () => {
    const { result } = setup()
    const action: ChatAction = {
      kind: 'editProfileField',
      childId: 'ghost',
      field: 'strengths',
      value: 'persistence',
    }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(false)
    expect(updateChildSoftProfile).not.toHaveBeenCalled()
  })

  // ── Tier C Option 2 — additive snapshot edits (6b) ──────────────

  it('does not write a snapshot action when only staged', () => {
    const { result } = setup()
    const action: ChatAction = {
      kind: 'addPrioritySkill',
      childId: 'lincoln1',
      skill: 'inference from passages',
    }

    act(() => result.current.stagePendingActions('msg1', [action]))

    expect(result.current.pending[0].status).toBe('pending')
    expect(writeSnapshotUpdate).not.toHaveBeenCalled()
  })

  it('routes a confirmed addPrioritySkill through the central writer', async () => {
    const { result } = setup()
    const action: ChatAction = {
      kind: 'addPrioritySkill',
      childId: 'lincoln1',
      skill: 'inference from passages',
    }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(true)
    expect(writeSnapshotUpdate).toHaveBeenCalledWith(
      'fam1',
      'lincoln1',
      expect.objectContaining({ addPrioritySkills: ['inference from passages'], at: expect.any(String) }),
    )
    expect(result.current.pending[0].status).toBe('applied')
    // audit recorded inline on the source message
    expect(updateDoc).toHaveBeenCalledTimes(1)
  })

  it('routes a confirmed addSupport through the central writer', async () => {
    const { result } = setup()
    const action: ChatAction = {
      kind: 'addSupport',
      childId: 'lincoln1',
      support: 'movement break every 10 min',
    }

    act(() => result.current.stagePendingActions('msg1', [action]))
    await act(async () => {
      await result.current.applyChatAction(action)
    })

    expect(writeSnapshotUpdate).toHaveBeenCalledWith(
      'fam1',
      'lincoln1',
      expect.objectContaining({ addSupports: ['movement break every 10 min'] }),
    )
  })

  it('routes a confirmed addStopRule through the central writer', async () => {
    const { result } = setup()
    const action: ChatAction = {
      kind: 'addStopRule',
      childId: 'lincoln1',
      rule: 'stop if frustration spikes',
    }

    act(() => result.current.stagePendingActions('msg1', [action]))
    await act(async () => {
      await result.current.applyChatAction(action)
    })

    expect(writeSnapshotUpdate).toHaveBeenCalledWith(
      'fam1',
      'lincoln1',
      expect.objectContaining({ addStopRules: ['stop if frustration spikes'] }),
    )
  })

  it('routes a confirmed markSkillProgress (mastered) through the mastered-skill path with an evidence stamp', async () => {
    const { result } = setup()
    const action: ChatAction = {
      kind: 'markSkillProgress',
      childId: 'lincoln1',
      skill: 'CVCe long vowels',
      mastered: true,
    }

    act(() => result.current.stagePendingActions('msg1', [action]))
    await act(async () => {
      await result.current.applyChatAction(action)
    })

    expect(writeSnapshotUpdate).toHaveBeenCalledWith(
      'fam1',
      'lincoln1',
      expect.objectContaining({
        masteredSkills: ['CVCe long vowels'],
        fullyMastered: true,
        source: 'parent',
        evidence: expect.stringContaining('parent directive via chat'),
      }),
    )
  })

  it('marks a skill as progressing (not mastered) when mastered is omitted', async () => {
    const { result } = setup()
    const action: ChatAction = {
      kind: 'markSkillProgress',
      childId: 'lincoln1',
      skill: 'two-digit addition',
    }

    act(() => result.current.stagePendingActions('msg1', [action]))
    await act(async () => {
      await result.current.applyChatAction(action)
    })

    expect(writeSnapshotUpdate).toHaveBeenCalledWith(
      'fam1',
      'lincoln1',
      expect.objectContaining({ masteredSkills: ['two-digit addition'], fullyMastered: false }),
    )
  })

  it('rejects a snapshot action for a child other than the active context', async () => {
    const { result } = setup('lincoln1')
    const action: ChatAction = {
      kind: 'addPrioritySkill',
      childId: 'london1', // real child, but Lincoln is active
      skill: 'letter sounds',
    }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(false)
    expect(writeSnapshotUpdate).not.toHaveBeenCalled()
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('rejects a snapshot action whose childId is not a family child', async () => {
    const { result } = setup()
    const action: ChatAction = {
      kind: 'addPrioritySkill',
      childId: 'ghost',
      skill: 'blends',
    }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(false)
    expect(writeSnapshotUpdate).not.toHaveBeenCalled()
  })

  it('treats a duplicate add as a no-op (6a dedup) without throwing', async () => {
    // Simulate 6a's dedup: the writer reports no change on the duplicate add.
    writeSnapshotUpdate.mockResolvedValueOnce({ changed: true })
    writeSnapshotUpdate.mockResolvedValueOnce({ changed: false })
    const { result } = setup()
    const action: ChatAction = {
      kind: 'addPrioritySkill',
      childId: 'lincoln1',
      skill: 'inference',
    }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let first: boolean | undefined
    let second: boolean | undefined
    await act(async () => {
      first = await result.current.applyChatAction(action)
      second = await result.current.applyChatAction(action)
    })

    // Both taps succeed at the hook boundary; the central writer absorbs the
    // duplicate (changed:false) without error, and the card stays applied.
    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(writeSnapshotUpdate).toHaveBeenCalledTimes(2)
    expect(result.current.pending[0].status).toBe('applied')
  })

  // ── proposePlanAdjustment — HANDOFF, not a write (chunk 2A/2) ────

  const PLAN_ADJ: ChatAction = {
    kind: 'proposePlanAdjustment',
    childId: 'lincoln1',
    summary: 'Reduce math to 10 min/day next week',
    rationale: 'Frustration is spiking in math',
  }

  it('does not stage or navigate when a plan adjustment is merely staged', () => {
    const { result } = setup()

    act(() => result.current.stagePendingActions('msg1', [PLAN_ADJ]))

    expect(result.current.pending[0].status).toBe('pending')
    expect(stagePlanAdjustment).not.toHaveBeenCalled()
    expect(navigateToPlanner).not.toHaveBeenCalled()
  })

  it('stages the brief and navigates to the planner WITHOUT writing a plan or child record', async () => {
    const { result } = setup()

    act(() => result.current.stagePendingActions('msg1', [PLAN_ADJ]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(PLAN_ADJ)
    })

    expect(ok).toBe(true)
    // Handoff staged through the dedicated helper, then navigated.
    expect(stagePlanAdjustment).toHaveBeenCalledWith('fam1', PLAN_ADJ)
    expect(navigateToPlanner).toHaveBeenCalledTimes(1)
    // Crucially: NO plan write, and NO child-record write of any kind.
    expect(addSightWord).not.toHaveBeenCalled()
    expect(removeSightWord).not.toHaveBeenCalled()
    expect(updateChildSoftProfile).not.toHaveBeenCalled()
    expect(writeSnapshotUpdate).not.toHaveBeenCalled()
    // Confirm audit still recorded inline on the source message.
    expect(updateDoc).toHaveBeenCalledTimes(1)
    expect(result.current.pending[0].status).toBe('applied')
  })

  it('rejects a plan adjustment targeting a child other than the active context', async () => {
    const { result } = setup('lincoln1')
    const action: ChatAction = { ...PLAN_ADJ, childId: 'london1' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(false)
    expect(stagePlanAdjustment).not.toHaveBeenCalled()
    expect(navigateToPlanner).not.toHaveBeenCalled()
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('confirmAll applies every still-pending action', async () => {
    const { result } = setup()
    const a1: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'and' }
    const a2: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'said' }

    act(() => result.current.stagePendingActions('msg1', [a1, a2]))
    await act(async () => {
      await result.current.confirmAll()
    })

    expect(addSightWord).toHaveBeenCalledTimes(2)
    expect(result.current.pending.every((p) => p.status === 'applied')).toBe(true)
  })
})

// ── Live-day edits (FEAT-142) ───────────────────────────────────────
// Three contracts under test: a hallucinated row or an out-of-week date never
// reaches a write (and the parent is TOLD why no card appeared), a completed row
// is refused at the stage as well as at the write, and every confirmed edit goes
// through the REAL FEAT-138 lane rather than a second write path of the chat's
// own.

const REMOVE_ACTION: ChatAction = {
  kind: 'removeItemFromDay',
  childId: 'lincoln1',
  dateKey: MONDAY,
  itemKey: 'Math Facts (10m)::Math',
}

const MOVE_ACTION: ChatAction = {
  kind: 'moveItemToDay',
  childId: 'lincoln1',
  fromDateKey: MONDAY,
  toDateKey: THURSDAY,
  itemKey: 'Math Facts (10m)::Math',
}

const ADD_ACTION: ChatAction = {
  kind: 'addItemToDay',
  childId: 'lincoln1',
  dateKey: TUESDAY,
  label: 'Sight word games',
  estimatedMinutes: 15,
  subjectBucket: 'Reading',
}

describe('live-day edits — the staging gate (FEAT-142)', () => {
  it('stages a proposal that resolves against the live week', () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [REMOVE_ACTION]))
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.suppressed).toEqual([])
  })

  it('never lets a hallucinated itemKey become a card — and says why', () => {
    const { result } = setup()
    const bogus: ChatAction = { ...REMOVE_ACTION, itemKey: 'Handwriting (20m)::LanguageArts' }
    act(() => result.current.stagePendingActions('msg1', [bogus]))
    expect(result.current.pending).toHaveLength(0)
    // FEAT-135's lesson, asserted: a dropped proposal is never dropped silently.
    expect(result.current.suppressed[0]).toContain("couldn't find that item on Monday")
  })

  it('never lets an out-of-week date become a card — and says why', () => {
    const { result } = setup()
    const nextWeek: ChatAction = { ...REMOVE_ACTION, dateKey: '2099-08-17' }
    act(() => result.current.stagePendingActions('msg1', [nextWeek]))
    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed[0]).toContain('current week')
  })

  it('REFUSES a completed row at the stage, naming the child and the un-check path', () => {
    const { result } = setup()
    const finished: ChatAction = { ...REMOVE_ACTION, itemKey: 'Reading Eggs (30m)::Reading' }
    act(() => result.current.stagePendingActions('msg1', [finished]))
    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed[0]).toContain('Lincoln already did this one')
    expect(result.current.suppressed[0].toLowerCase()).toContain('un-check')
  })

  it('drops every live-day proposal for a non-parent profile, with a reason', () => {
    // `/chat` is nav-gated, not route-gated: a kid can reach it by URL.
    const { result } = setup('lincoln1', 'thread1', { canEditActivityConfigs: false })
    act(() => result.current.stagePendingActions('msg1', [REMOVE_ACTION, MOVE_ACTION, ADD_ACTION]))
    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed[0]).toContain('grown-up')
  })

  it('offers no live-day card at all when there is no week loaded', () => {
    // General/kid-scoped chat passes no week — fail closed, and say so.
    const { result } = setup('lincoln1', 'thread1', { weekDays: [] })
    act(() => result.current.stagePendingActions('msg1', [ADD_ACTION]))
    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed).toHaveLength(1)
  })
})

describe('live-day edits — the write goes through the FEAT-138 lane (FEAT-142)', () => {
  it('a confirmed removal calls removeItemFromLiveDay with the capability', async () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [REMOVE_ACTION]))
    let ok = false
    await act(async () => {
      ok = await result.current.applyChatAction(REMOVE_ACTION)
    })
    expect(ok).toBe(true)
    expect(removeItemFromLiveDay).toHaveBeenCalledWith({
      familyId: 'fam1',
      childId: 'lincoln1',
      dateKey: MONDAY,
      itemKey: 'Math Facts (10m)::Math',
      canEdit: true,
    })
    // No second write path: nothing else in the portal was touched.
    expect(moveItemToLiveDay).not.toHaveBeenCalled()
    expect(addItemToLiveDay).not.toHaveBeenCalled()
    expect(updateActivityConfigMinutes).not.toHaveBeenCalled()
    expect(writeSnapshotUpdate).not.toHaveBeenCalled()
  })

  it('a confirmed move calls moveItemToLiveDay with both days', async () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [MOVE_ACTION]))
    await act(async () => {
      await result.current.applyChatAction(MOVE_ACTION)
    })
    expect(moveItemToLiveDay).toHaveBeenCalledWith({
      familyId: 'fam1',
      childId: 'lincoln1',
      fromDateKey: MONDAY,
      toDateKey: THURSDAY,
      itemKey: 'Math Facts (10m)::Math',
      canEdit: true,
    })
  })

  it("marks a move done on the lane's survivable 'duplicated' half-failure", async () => {
    // The row DID reach the target day; the source removal failed and the lane
    // already logged it. Marking the card done is honest — the move happened.
    moveItemToLiveDay.mockResolvedValue({ status: 'duplicated' })
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [MOVE_ACTION]))
    let ok = false
    await act(async () => {
      ok = await result.current.applyChatAction(MOVE_ACTION)
    })
    expect(ok).toBe(true)
  })

  it('a confirmed add writes a source: manual row through the guarded lane', async () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [ADD_ACTION]))
    await act(async () => {
      await result.current.applyChatAction(ADD_ACTION)
    })
    expect(addItemToLiveDay).toHaveBeenCalledTimes(1)
    const call = addItemToLiveDay.mock.calls[0][0] as {
      familyId: string
      childId: string
      dateKey: string
      canEdit: boolean
      item: Record<string, unknown>
    }
    expect(call.familyId).toBe('fam1')
    expect(call.dateKey).toBe(TUESDAY)
    expect(call.canEdit).toBe(true)
    // `'planner'` would let a later re-apply silently delete the row.
    expect(call.item.source).toBe('manual')
    expect(call.item.label).toBe('Sight word games (15m)')
    expect(call.item.estimatedMinutes).toBe(15)
    expect(call.item.completed).toBe(false)
    // No plannedMinutes anywhere — minutes on a live week stay locked.
    expect(call.item).not.toHaveProperty('plannedMinutes')
  })

  it('leaves the card pending when the lane REFUSES the write', async () => {
    // A completion landing between the card rendering and the tap: the lane
    // re-checks against the freshly-read document and refuses. The card must not
    // claim "Done" over a write that did not happen.
    removeItemFromLiveDay.mockResolvedValue({ status: 'refused', refusal: 'completed' })
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [REMOVE_ACTION]))
    let ok = true
    await act(async () => {
      ok = await result.current.applyChatAction(REMOVE_ACTION)
    })
    expect(ok).toBe(false)
    expect(result.current.pending[0].status).toBe('pending')
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('rejects a live-day edit for a child other than the active one', async () => {
    const { result } = setup()
    const wrongChild: ChatAction = { ...REMOVE_ACTION, childId: 'london1' }
    let ok = true
    await act(async () => {
      ok = await result.current.applyChatAction(wrongChild)
    })
    expect(ok).toBe(false)
    expect(removeItemFromLiveDay).not.toHaveBeenCalled()
  })

  it('backstops a stale card: an apply is re-resolved and refused before any call', async () => {
    const { result } = setup()
    const finished: ChatAction = { ...REMOVE_ACTION, itemKey: 'Reading Eggs (30m)::Reading' }
    let ok = true
    await act(async () => {
      ok = await result.current.applyChatAction(finished)
    })
    expect(ok).toBe(false)
    expect(removeItemFromLiveDay).not.toHaveBeenCalled()
  })

  it('never writes without the parent capability, even if a card were somehow offered', async () => {
    const { result } = setup('lincoln1', 'thread1', { canEditActivityConfigs: false })
    let ok = true
    await act(async () => {
      ok = await result.current.applyChatAction(ADD_ACTION)
    })
    expect(ok).toBe(false)
    expect(addItemToLiveDay).not.toHaveBeenCalled()
  })
})

describe('live-day edits — the week is re-read from the clock (Codex P2, PR #1667)', () => {
  // A chat page left open across a Sunday->Monday rollover holds a week that has
  // stopped being this week. The whole capability is scoped to THIS week, so the
  // clock is re-read at the moment it matters — a card proposed before the
  // boundary must not apply against last week's days.
  const LAST_WEEK: ChatWeekDay[] = [
    {
      dateKey: '2020-01-06',
      label: 'Monday',
      items: [
        { itemKey: 'Math Facts (10m)::Math', label: 'Math Facts (10m)', completed: false },
      ],
    },
  ]

  const STALE_ACTION: ChatAction = {
    kind: 'removeItemFromDay',
    childId: 'lincoln1',
    dateKey: '2020-01-06',
    itemKey: 'Math Facts (10m)::Math',
  }

  it('never stages a proposal for a week that is no longer current', () => {
    const { result } = setup('lincoln1', 'thread1', { weekDays: LAST_WEEK })
    act(() => result.current.stagePendingActions('msg1', [STALE_ACTION]))
    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed[0]).toContain('current week')
  })

  it('never applies one either, even with no re-render between the card and the tap', async () => {
    const { result } = setup('lincoln1', 'thread1', { weekDays: LAST_WEEK })
    let ok = true
    await act(async () => {
      ok = await result.current.applyChatAction(STALE_ACTION)
    })
    expect(ok).toBe(false)
    expect(removeItemFromLiveDay).not.toHaveBeenCalled()
  })
})

// ── Curriculum edits (FEAT-143) ─────────────────────────────────────
//
// Three contracts under test: a hallucinated / finished / out-of-bounds proposal
// never becomes a card (and says why), a confirmed action calls the SAME shared
// writer Progress → Curriculum calls, and nothing retroactive happens — no
// dayLog, no plan, no child record, on any of the three.

/** Lincoln's live curriculum: a workbook mid-book, a shared routine, a finished book. */
const CURRICULUM_CONFIGS: ChatActivityConfig[] = [
  {
    id: 'cfg_gatb',
    name: 'GATB Math 3',
    childId: 'lincoln1',
    defaultMinutes: 20,
    type: 'workbook',
    currentPosition: 98,
    totalUnits: 140,
    unitLabel: 'lesson',
    sortOrder: 2,
  },
  {
    id: 'cfg_morning',
    name: 'Morning formation',
    childId: 'both',
    defaultMinutes: 10,
    type: 'routine',
    sortOrder: 1,
  },
  {
    id: 'cfg_etc',
    name: 'Explode the Code 3',
    childId: 'lincoln1',
    defaultMinutes: 15,
    type: 'workbook',
    currentPosition: 60,
    totalUnits: 60,
    completed: true,
    sortOrder: 5,
  },
]

const curriculumSetup = (
  opts: { canEditActivityConfigs?: boolean; activeChildId?: string } = {},
) =>
  setup(opts.activeChildId ?? 'lincoln1', 'thread1', {
    activityConfigs: CURRICULUM_CONFIGS,
    canEditActivityConfigs: opts.canEditActivityConfigs ?? true,
  })

const CURRICULUM_ADD: ChatAction = {
  kind: 'addActivity',
  childId: 'lincoln1',
  name: 'Khan Academy math',
  type: 'app',
  subjectBucket: 'Math',
  defaultMinutes: 20,
  frequency: 'daily',
}

const CURRICULUM_COMPLETE: ChatAction = {
  kind: 'markActivityComplete',
  childId: 'lincoln1',
  activityConfigId: 'cfg_gatb',
}

const CURRICULUM_POSITION: ChatAction = {
  kind: 'setActivityPosition',
  childId: 'lincoln1',
  activityConfigId: 'cfg_gatb',
  position: 107,
}

describe('curriculum edits — the resolution gate (FEAT-143)', () => {
  it('offers a card for each well-formed, resolvable action', () => {
    const { result } = curriculumSetup()
    act(() => {
      result.current.stagePendingActions('m1', [CURRICULUM_ADD, CURRICULUM_COMPLETE, CURRICULUM_POSITION])
    })
    expect(result.current.pending).toHaveLength(3)
    expect(result.current.suppressed).toEqual([])
  })

  it('drops a hallucinated activity id and shows the reason', () => {
    const { result } = curriculumSetup()
    act(() => {
      result.current.stagePendingActions('m1', [
        { ...CURRICULUM_COMPLETE, activityConfigId: 'cfg_nope' } as ChatAction,
      ])
    })
    expect(result.current.pending).toEqual([])
    expect(result.current.suppressed[0]).toContain("didn't match one of your activities")
  })

  it('drops both existing-config kinds against a FINISHED config, by name', () => {
    for (const action of [
      { ...CURRICULUM_COMPLETE, activityConfigId: 'cfg_etc' } as ChatAction,
      { ...CURRICULUM_POSITION, activityConfigId: 'cfg_etc', position: 12 } as ChatAction,
    ]) {
      const { result } = curriculumSetup()
      act(() => {
        result.current.stagePendingActions('m1', [action])
      })
      expect(result.current.pending, `kind=${action.kind}`).toEqual([])
      expect(result.current.suppressed[0]).toContain('Explode the Code 3')
      expect(result.current.suppressed[0]).toContain('already marked finished')
    }
  })

  it('drops a position set against a config that tracks no position', () => {
    const { result } = curriculumSetup()
    act(() => {
      result.current.stagePendingActions('m1', [
        { ...CURRICULUM_POSITION, activityConfigId: 'cfg_morning', position: 3 } as ChatAction,
      ])
    })
    expect(result.current.pending).toEqual([])
    expect(result.current.suppressed[0]).toContain("doesn't track a lesson or page number")
  })

  it('drops a position past the end of the book rather than clamping it', () => {
    const { result } = curriculumSetup()
    act(() => {
      result.current.stagePendingActions('m1', [
        { ...CURRICULUM_POSITION, position: 141 } as ChatAction,
      ])
    })
    expect(result.current.pending).toEqual([])
    expect(result.current.suppressed[0]).toContain('past the end')
  })

  it('drops every curriculum action for a non-parent, with the gate reason', () => {
    const { result } = curriculumSetup({ canEditActivityConfigs: false })
    act(() => {
      result.current.stagePendingActions('m1', [CURRICULUM_ADD, CURRICULUM_COMPLETE, CURRICULUM_POSITION])
    })
    expect(result.current.pending).toEqual([])
    expect(result.current.suppressed).toEqual([
      'Changing the curriculum is something a grown-up does — nothing was changed.',
    ])
  })

  it('drops a shared workbook add with the DATA-08 owner rule reason', () => {
    const { result } = curriculumSetup()
    act(() => {
      result.current.stagePendingActions('m1', [
        { ...CURRICULUM_ADD, type: 'workbook', shared: true } as ChatAction,
      ])
    })
    expect(result.current.pending).toEqual([])
    expect(result.current.suppressed[0]).toContain('must belong to a specific child')
  })
})

describe('curriculum edits — the write (FEAT-143)', () => {
  it('routes a confirmed add through the shared writer, at the end of the list', async () => {
    const { result } = curriculumSetup()
    await act(async () => {
      await result.current.applyChatAction(CURRICULUM_ADD)
    })

    expect(addActivityConfig).toHaveBeenCalledTimes(1)
    const [familyId, payload] = addActivityConfig.mock.calls[0] as [string, Record<string, unknown>]
    expect(familyId).toBe('fam1')
    expect(payload).toMatchObject({
      name: 'Khan Academy math',
      type: 'app',
      subjectBucket: 'Math',
      defaultMinutes: 20,
      frequency: 'daily',
      childId: 'lincoln1',
      // max(1, 2, 5) + 1 — appended past the largest existing order, including
      // the completed config's, so a new row can never collide with an old one.
      sortOrder: 6,
      scannable: false,
    })
  })

  it('writes a shared add as childId "both"', async () => {
    const { result } = curriculumSetup()
    await act(async () => {
      await result.current.applyChatAction({
        ...CURRICULUM_ADD,
        type: 'routine',
        shared: true,
      } as ChatAction)
    })
    const [, payload] = addActivityConfig.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload.childId).toBe('both')
  })

  it('marks an add scannable with a unit label only when it tracks a position', async () => {
    const { result } = curriculumSetup()
    await act(async () => {
      await result.current.applyChatAction({
        ...CURRICULUM_ADD,
        type: 'workbook',
        totalUnits: 140,
        currentPosition: 1,
      } as ChatAction)
    })
    const [, payload] = addActivityConfig.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).toMatchObject({
      scannable: true,
      unitLabel: 'lesson',
      totalUnits: 140,
      currentPosition: 1,
    })
  })

  it('routes a confirmed completion through the shared writer', async () => {
    const { result } = curriculumSetup()
    await act(async () => {
      await result.current.applyChatAction(CURRICULUM_COMPLETE)
    })
    expect(completeActivityConfig).toHaveBeenCalledTimes(1)
    expect(completeActivityConfig).toHaveBeenCalledWith('fam1', 'cfg_gatb')
  })

  it('routes a confirmed position through the shared writer, with the config for the model sync', async () => {
    const { result } = curriculumSetup()
    await act(async () => {
      await result.current.applyChatAction(CURRICULUM_POSITION)
    })
    expect(setActivityConfigPosition).toHaveBeenCalledTimes(1)
    expect(setActivityConfigPosition).toHaveBeenCalledWith(
      'fam1',
      'cfg_gatb',
      107,
      expect.objectContaining({ id: 'cfg_gatb', name: 'GATB Math 3', childId: 'lincoln1' }),
    )
  })

  it('marks the card applied and audits it inline on the source message', async () => {
    const { result } = curriculumSetup()
    act(() => {
      result.current.stagePendingActions('m1', [CURRICULUM_POSITION])
    })
    await act(async () => {
      await result.current.applyChatAction(result.current.pending[0].action)
    })
    expect(result.current.pending[0].status).toBe('applied')
    expect(updateDoc).toHaveBeenCalled()
  })
})

describe('curriculum edits — the write backstop (FEAT-143)', () => {
  // Even if a card were somehow offered, the write must still be refused.
  it('refuses a hallucinated id at apply time', async () => {
    const { result } = curriculumSetup()
    let applied: boolean | undefined
    await act(async () => {
      applied = await result.current.applyChatAction({
        ...CURRICULUM_COMPLETE,
        activityConfigId: 'cfg_nope',
      } as ChatAction)
    })
    expect(applied).toBe(false)
    expect(completeActivityConfig).not.toHaveBeenCalled()
  })

  it('refuses a finished config at apply time', async () => {
    const { result } = curriculumSetup()
    let applied: boolean | undefined
    await act(async () => {
      applied = await result.current.applyChatAction({
        ...CURRICULUM_POSITION,
        activityConfigId: 'cfg_etc',
        position: 12,
      } as ChatAction)
    })
    expect(applied).toBe(false)
    expect(setActivityConfigPosition).not.toHaveBeenCalled()
  })

  it('refuses every curriculum write for a non-parent', async () => {
    const { result } = curriculumSetup({ canEditActivityConfigs: false })
    for (const action of [CURRICULUM_ADD, CURRICULUM_COMPLETE, CURRICULUM_POSITION]) {
      let applied: boolean | undefined
      await act(async () => {
        applied = await result.current.applyChatAction(action)
      })
      expect(applied, `kind=${action.kind}`).toBe(false)
    }
    expect(addActivityConfig).not.toHaveBeenCalled()
    expect(completeActivityConfig).not.toHaveBeenCalled()
    expect(setActivityConfigPosition).not.toHaveBeenCalled()
  })

  it('refuses an action bound to a different child than the active tab', async () => {
    const { result } = curriculumSetup({ activeChildId: 'london1' })
    let applied: boolean | undefined
    await act(async () => {
      applied = await result.current.applyChatAction(CURRICULUM_COMPLETE)
    })
    expect(applied).toBe(false)
    expect(completeActivityConfig).not.toHaveBeenCalled()
  })
})

describe('curriculum edits touch nothing retroactive (FEAT-143)', () => {
  it('writes no day, no plan, no snapshot and no profile on any of the three', async () => {
    const { result } = curriculumSetup()
    for (const action of [CURRICULUM_ADD, CURRICULUM_COMPLETE, CURRICULUM_POSITION]) {
      await act(async () => {
        await result.current.applyChatAction(action)
      })
    }
    expect(removeItemFromLiveDay).not.toHaveBeenCalled()
    expect(moveItemToLiveDay).not.toHaveBeenCalled()
    expect(addItemToLiveDay).not.toHaveBeenCalled()
    expect(stagePlanAdjustment).not.toHaveBeenCalled()
    expect(writeSnapshotUpdate).not.toHaveBeenCalled()
    expect(updateChildSoftProfile).not.toHaveBeenCalled()
    expect(addSightWord).not.toHaveBeenCalled()
    // And no cross-talk with FEAT-135's minutes write.
    expect(updateActivityConfigMinutes).not.toHaveBeenCalled()
  })
})

describe('setActivityMinutes against a finished config (FEAT-143 subscription change)', () => {
  // Completed configs are now visible to the resolvers (so a curriculum action
  // can refuse one BY NAME). `resolveActivityConfig` therefore has to say no
  // explicitly — this pins that FEAT-135's refusal survived the change.
  it('still refuses, and still never reaches the write', async () => {
    const { result } = curriculumSetup()
    const action: ChatAction = {
      kind: 'setActivityMinutes',
      childId: 'lincoln1',
      activityConfigId: 'cfg_etc',
      minutes: 30,
    }
    act(() => {
      result.current.stagePendingActions('m1', [action])
    })
    expect(result.current.pending).toEqual([])

    let applied: boolean | undefined
    await act(async () => {
      applied = await result.current.applyChatAction(action)
    })
    expect(applied).toBe(false)
    expect(updateActivityConfigMinutes).not.toHaveBeenCalled()
  })
})
