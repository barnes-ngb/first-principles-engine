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

// The Watch Vehicle writers (FEAT-149). `addWatchVideo` is the SAME
// module-level writer `WatchVetInForm` reaches through `useWatchLibrary.addVideo`,
// and `writeWatchItemToDay` is the FEAT-132 day lane. Both are spied so these
// tests assert the chat CALLS them rather than opening a second write path; what
// each one writes is pinned in useWatchLibrary.test.ts / writeWatchItemToDay.test.ts.
const addWatchVideo = vi.fn()
vi.mock('../watch/useWatchLibrary', () => ({
  addWatchVideo: (...args: unknown[]) => addWatchVideo(...args),
}))
const writeWatchItemToDay = vi.fn()
vi.mock('../watch/writeWatchItemToDay', () => ({
  writeWatchItemToDay: (...args: unknown[]) => writeWatchItemToDay(...args),
}))

// The Dad Lab writers (FEAT-157). `createArc` is the SAME module-level writer
// the Dad Lab page's New Arc dialog reaches through `useConceptArcs`, and
// `createPlannedLab` is the extracted suggestion-flow lane. Both are spied so
// these tests assert the chat CALLS them rather than opening a second write
// path; what each one writes is pinned in plannedLab.test.ts and the
// ConceptArcsSection suite.
const createArc = vi.fn()
vi.mock('../dad-lab/useConceptArcs', () => ({
  createArc: (...args: unknown[]) => createArc(...args),
}))
const createPlannedLab = vi.fn()
vi.mock('../dad-lab/plannedLab', () => ({
  createPlannedLab: (...args: unknown[]) => createPlannedLab(...args),
}))

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
  generalTabDropNotice,
  resolveActivityConfig,
  useShellyChatActions,
  type ActivityMinutesAction,
  type ChatActivityConfig,
} from './useShellyChatActions'
import type { ChatWeekDay } from './dayItemActions'
import type { DraftNextWeekAction } from './nextWeekActions'
import { currentWeekDayKeys, plannableWatchDayKeys } from './useChatWeekDays'
import { ArcOrigin, ArcStepStatus, SubjectBucket } from '../../core/types/enums'
import { WatchVideoStatus } from '../../core/types/watch'
import type { ConceptArc, WatchVideo } from '../../core/types'

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

/** Lincoln's curated library: one live video and one he has retired. */
const VIDEOS: WatchVideo[] = [
  {
    id: 'vid_glacier',
    youtubeId: 'dQw4w9WgXcQ',
    title: 'How Glaciers Move',
    plannedMinutes: 9,
    subjectBucket: SubjectBucket.Science,
    childId: 'lincoln1',
    addedBy: 'parent',
    vettedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'vid_volcano',
    youtubeId: 'aBcDeFgHiJk',
    title: 'Inside a Volcano',
    plannedMinutes: 12,
    subjectBucket: SubjectBucket.Science,
    childId: 'both',
    addedBy: 'parent',
    status: WatchVideoStatus.Retired,
    vettedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
]

const CHILDREN: Child[] = [
  { id: 'lincoln1', name: 'Lincoln' } as Child,
  { id: 'london1', name: 'London' } as Child,
]

/** One live arc with two steps, for the FEAT-157 resolution gate. */
const ARCS: ConceptArc[] = [
  {
    id: 'arc_elec',
    title: 'The Electricity Arc',
    childIds: ['lincoln1', 'london1'],
    steps: [
      { title: 'Static electricity', conceptBeat: 'Charge jumps', status: ArcStepStatus.Done },
      { title: 'Make a circuit', conceptBeat: 'A loop', status: ArcStepStatus.Active },
    ],
    createdFrom: ArcOrigin.OwnerAuthored,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
]

const navigateToPlanner = vi.fn()
const onDraftNextWeek = vi.fn<(action: DraftNextWeekAction) => Promise<boolean>>()

function setup(
  activeChildId = 'lincoln1',
  activeThreadId: string | null = 'thread1',
  opts: {
    activityConfigs?: ChatActivityConfig[]
    canEditActivityConfigs?: boolean
    weekDays?: ChatWeekDay[]
    watchVideos?: WatchVideo[]
    conceptArcs?: ConceptArc[]
    onDraftNextWeek?: (action: DraftNextWeekAction) => Promise<boolean>
  } = {},
) {
  return renderHook(() =>
    useShellyChatActions({
      familyId: 'fam1',
      children: CHILDREN,
      activeChildId,
      activeThreadId,
      navigateToPlanner,
      onDraftNextWeek: 'onDraftNextWeek' in opts ? opts.onDraftNextWeek : onDraftNextWeek,
      activityConfigs: opts.activityConfigs ?? CONFIGS,
      weekDays: opts.weekDays ?? WEEK,
      watchVideos: opts.watchVideos ?? VIDEOS,
      conceptArcs: opts.conceptArcs ?? ARCS,
      canEditActivityConfigs: opts.canEditActivityConfigs ?? true,
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  onDraftNextWeek.mockResolvedValue(true)
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
  addWatchVideo.mockResolvedValue('new-vid-id')
  writeWatchItemToDay.mockResolvedValue(undefined)
  createArc.mockResolvedValue('new-arc-id')
  createPlannedLab.mockResolvedValue('new-lab-id')
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

  // Superseded by the FEAT-143 re-entry guard (Codex P1, PR #1669). This used to
  // assert that a re-tap simply wrote again, which was harmless while every kind
  // was idempotent. It no longer is — `addActivity` mints a fresh auto-id per
  // call, and `addItemToDay` appends a row with no id — so the guard now refuses
  // the second tap for EVERY kind rather than relying on each writer to absorb
  // it. Re-tapping is still safe; it is now safe by construction.
  it('refuses a re-tap of a confirmed action instead of writing twice', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'and' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let second: boolean | undefined
    await act(async () => {
      await result.current.applyChatAction(action)
      second = await result.current.applyChatAction(action)
    })

    expect(addSightWord).toHaveBeenCalledTimes(1)
    expect(second).toBe(false)
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

    // The first tap succeeds. The second never reaches the writer at all now —
    // the FEAT-143 re-entry guard refuses it (Codex P1, PR #1669) — so 6a's
    // dedup is no longer the thing standing between a double tap and a
    // duplicate. It still absorbs one if a write arrives by another route; this
    // test now pins the guard, and the card stays applied either way.
    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(writeSnapshotUpdate).toHaveBeenCalledTimes(1)
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

// ── Re-entry guard (Codex P1, PR #1669) ─────────────────────────────
//
// Until FEAT-143 every kind in the union was idempotent, so a double tap on
// Confirm was harmless. `addActivity` is the first kind that is not: it mints a
// fresh auto-id per call, so two taps would create two active curriculum entries
// and BOTH would land in future plans.

describe('a repeat confirm never reaches a writer (FEAT-143 / Codex P1)', () => {
  it('writes ONCE when two taps race the same in-flight add', async () => {
    // Hold the write open so both taps land before either resolves — the exact
    // window a double tap on a phone falls into.
    // The gate promise is built UP FRONT, not inside the mock, so `release` is
    // callable the moment the test wants it. Confirmed writes are queued behind
    // one another (Codex P1, PR #1676), so a write no longer necessarily starts
    // in the same microtask as the tap — a `release` assigned by the mock body
    // would still be undefined when the test reaches for it.
    let release!: () => void
    const gate = new Promise<string>((resolve) => {
      release = () => resolve('new-cfg-id')
    })
    addActivityConfig.mockImplementation(() => gate)

    const { result } = curriculumSetup()
    act(() => {
      result.current.stagePendingActions('m1', [CURRICULUM_ADD])
    })

    let first: Promise<boolean> | undefined
    let second: Promise<boolean> | undefined
    await act(async () => {
      first = result.current.applyChatAction(CURRICULUM_ADD)
      second = result.current.applyChatAction(CURRICULUM_ADD)
      release()
      await Promise.all([first, second])
    })

    expect(addActivityConfig).toHaveBeenCalledTimes(1)
    expect(await first).toBe(true)
    expect(await second).toBe(false)
  })

  it('refuses a re-tap after the write has already succeeded', async () => {
    const { result } = curriculumSetup()
    act(() => {
      result.current.stagePendingActions('m1', [CURRICULUM_ADD])
    })
    await act(async () => {
      await result.current.applyChatAction(CURRICULUM_ADD)
    })
    let again: boolean | undefined
    await act(async () => {
      again = await result.current.applyChatAction(CURRICULUM_ADD)
    })
    expect(again).toBe(false)
    expect(addActivityConfig).toHaveBeenCalledTimes(1)
  })

  it('marks the card `applying` while in flight, then `applied`', async () => {
    // The gate promise is built UP FRONT, not inside the mock, so `release` is
    // callable the moment the test wants it. Confirmed writes are queued behind
    // one another (Codex P1, PR #1676), so a write no longer necessarily starts
    // in the same microtask as the tap — a `release` assigned by the mock body
    // would still be undefined when the test reaches for it.
    let release!: () => void
    const gate = new Promise<string>((resolve) => {
      release = () => resolve('new-cfg-id')
    })
    addActivityConfig.mockImplementation(() => gate)
    const { result } = curriculumSetup()
    act(() => {
      result.current.stagePendingActions('m1', [CURRICULUM_ADD])
    })

    let inFlight: Promise<boolean> | undefined
    await act(async () => {
      inFlight = result.current.applyChatAction(result.current.pending[0].action)
    })
    expect(result.current.pending[0].status).toBe('applying')

    await act(async () => {
      release()
      await inFlight
    })
    expect(result.current.pending[0].status).toBe('applied')
  })

  // A failure must stay retryable — the guard is against duplicates, not against
  // second chances.
  it('returns the card to `pending` and releases the guard when the write fails', async () => {
    addActivityConfig.mockRejectedValueOnce(new Error('network'))
    const { result } = curriculumSetup()
    act(() => {
      result.current.stagePendingActions('m1', [CURRICULUM_ADD])
    })

    // UX-33(c): the rejection used to escape into an `onClick` that discards
    // it. It is caught now — the call resolves `false`, and the failure is a
    // sentence on the card instead of nothing at all.
    let failed: boolean | undefined
    await act(async () => {
      failed = await result.current.applyChatAction(CURRICULUM_ADD)
    })
    expect(failed).toBe(false)
    expect(result.current.pending[0].status).toBe('pending')
    expect(result.current.pending[0].error).toMatch(/didn't save/)

    addActivityConfig.mockResolvedValue('new-cfg-id')
    let retried: boolean | undefined
    await act(async () => {
      retried = await result.current.applyChatAction(CURRICULUM_ADD)
    })
    expect(retried).toBe(true)
    expect(addActivityConfig).toHaveBeenCalledTimes(2)
  })

  it('guards every kind, not just the non-idempotent one', async () => {
    const { result } = curriculumSetup()
    await act(async () => {
      await result.current.applyChatAction(CURRICULUM_COMPLETE)
    })
    let again: boolean | undefined
    await act(async () => {
      again = await result.current.applyChatAction(CURRICULUM_COMPLETE)
    })
    expect(again).toBe(false)
    expect(completeActivityConfig).toHaveBeenCalledTimes(1)
  })

  it('clearPending releases the guard, so a fresh turn starts clean', async () => {
    const { result } = curriculumSetup()
    await act(async () => {
      await result.current.applyChatAction(CURRICULUM_COMPLETE)
    })
    act(() => {
      result.current.clearPending()
    })
    await act(async () => {
      await result.current.applyChatAction(CURRICULUM_COMPLETE)
    })
    expect(completeActivityConfig).toHaveBeenCalledTimes(2)
  })
})

// ── Watch Vehicle actions (FEAT-149) ─────────────────────────────────────────
//
// Three contracts under test: a duplicate or retired video never becomes a card
// (and the parent is told why), a confirmed vet-in lands through the vet-in
// form's OWN writer with the confirming account's uid as provenance, and a
// confirmed plan lands through the FEAT-132 day lane — no second write path to
// either the library or a day document.

// Built from the real window rather than hardcoded dates — hardcoded ones would
// pass this week and fail every week after. The window runs from TODAY through
// next Friday and shrinks as the week elapses (Codex P2, PR #1676), so these
// pick by position from each end rather than assuming ten entries.
const PLANNABLE = plannableWatchDayKeys()
/** The soonest plannable weekday (today, or the next one that hasn't gone by). */
const SOONEST = PLANNABLE[0].dateKey
/** The far end of the window — next Friday. */
const NEXT_TUESDAY = PLANNABLE[PLANNABLE.length - 1].dateKey

const VET_IN_ACTION: ChatAction = {
  kind: 'vetInVideo',
  childId: 'lincoln1',
  youtubeId: 'zZzZzZzZzZz',
  title: 'How Rivers Carve Canyons',
  plannedMinutes: 11,
  subjectBucket: SubjectBucket.Science,
  why: 'He asked how the Grand Canyon got there',
  suggestedFromUrl: 'https://www.youtube.com/watch?v=zZzZzZzZzZz',
}

const PLAN_ACTION: ChatAction = {
  kind: 'planVideoOnDay',
  childId: 'lincoln1',
  watchVideoId: 'vid_glacier',
  dateKey: NEXT_TUESDAY,
}

describe('watch actions — the staging gate (FEAT-149)', () => {
  it('offers a card for a video that is not in the library yet', () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('m1', [VET_IN_ACTION]))
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.suppressed).toEqual([])
  })

  it('drops a duplicate of an ACTIVE video — no card, and the reason offers to plan it', () => {
    const { result } = setup()
    const dup = { ...VET_IN_ACTION, youtubeId: 'dQw4w9WgXcQ' } as ChatAction
    act(() => result.current.stagePendingActions('m1', [dup]))
    expect(result.current.pending).toEqual([])
    expect(result.current.suppressed).toHaveLength(1)
    expect(result.current.suppressed[0]).toContain('already in the Watch Library')
    expect(result.current.suppressed[0]).toContain('plan it onto a day')
    expect(addWatchVideo).not.toHaveBeenCalled()
  })

  it('drops a duplicate of a RETIRED video — no card, and the reason names the Archive', () => {
    const { result } = setup()
    const dup = { ...VET_IN_ACTION, youtubeId: 'aBcDeFgHiJk' } as ChatAction
    act(() => result.current.stagePendingActions('m1', [dup]))
    expect(result.current.pending).toEqual([])
    expect(result.current.suppressed[0]).toContain('Archive')
    expect(addWatchVideo).not.toHaveBeenCalled()
  })

  it('accepts both ends of the window — the soonest day and next Friday', () => {
    const { result } = setup()
    act(() =>
      result.current.stagePendingActions('m1', [
        { ...PLAN_ACTION, dateKey: SOONEST } as ChatAction,
        PLAN_ACTION,
      ]),
    )
    expect(result.current.pending).toHaveLength(PLANNABLE.length > 1 ? 2 : 1)
    expect(result.current.suppressed).toEqual([])
  })

  it('drops a weekend, a past day, and the week after next — each with a reason', () => {
    const shift = (dateKey: string, days: number) => {
      const d = new Date(`${dateKey}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + days)
      return d
    }
    const last = PLANNABLE[PLANNABLE.length - 1].dateKey
    const saturday = shift(last, 1)
    const yesterday = shift(PLANNABLE[0].dateKey, -1)
    const weekAfterNext = shift(last, 7)

    for (const d of [saturday, yesterday, weekAfterNext]) {
      const { result } = setup()
      const dateKey = d.toISOString().slice(0, 10)
      act(() =>
        result.current.stagePendingActions('m1', [{ ...PLAN_ACTION, dateKey } as ChatAction]),
      )
      expect(result.current.pending, dateKey).toEqual([])
      expect(result.current.suppressed[0], dateKey).toContain('this week or next week')
    }
    expect(writeWatchItemToDay).not.toHaveBeenCalled()
  })

  it('drops a plan for a RETIRED video, naming it', () => {
    const { result } = setup()
    const retired = { ...PLAN_ACTION, watchVideoId: 'vid_volcano' } as ChatAction
    act(() => result.current.stagePendingActions('m1', [retired]))
    expect(result.current.pending).toEqual([])
    expect(result.current.suppressed[0]).toContain('Inside a Volcano')
  })

  it('drops a plan for a video that is not in the library at all', () => {
    const { result } = setup()
    const bogus = { ...PLAN_ACTION, watchVideoId: 'vid_hallucinated' } as ChatAction
    act(() => result.current.stagePendingActions('m1', [bogus]))
    expect(result.current.pending).toEqual([])
    expect(result.current.suppressed[0]).toContain("didn't match a video")
  })

  it('drops both kinds for a kid profile, and says why', () => {
    // `/chat` is nav-gated, not route-gated, so a kid can reach it by URL.
    const { result } = setup('lincoln1', 'thread1', { canEditActivityConfigs: false })
    act(() => result.current.stagePendingActions('m1', [VET_IN_ACTION, PLAN_ACTION]))
    expect(result.current.pending).toEqual([])
    expect(result.current.suppressed).toHaveLength(1)
    expect(result.current.suppressed[0]).toContain('a grown-up does')
    expect(addWatchVideo).not.toHaveBeenCalled()
    expect(writeWatchItemToDay).not.toHaveBeenCalled()
  })
})

describe('watch actions — the write (FEAT-149)', () => {
  it('vets a video in through the vet-in form\'s own writer, stamped with the confirming uid', async () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('m1', [VET_IN_ACTION]))
    await act(async () => {
      await result.current.applyChatAction(VET_IN_ACTION)
    })

    expect(addWatchVideo).toHaveBeenCalledTimes(1)
    expect(addWatchVideo).toHaveBeenCalledWith('fam1', {
      youtubeId: 'zZzZzZzZzZz',
      title: 'How Rivers Carve Canyons',
      plannedMinutes: 11,
      subjectBucket: SubjectBucket.Science,
      childId: 'lincoln1',
      why: 'He asked how the Grand Canyon got there',
      // The tap IS the vetting act: provenance is the confirming account's uid
      // (which is the family id), never anything the model supplied.
      addedBy: 'fam1',
      suggestedFromUrl: 'https://www.youtube.com/watch?v=zZzZzZzZzZz',
    })
    // A vet-in plans nothing.
    expect(writeWatchItemToDay).not.toHaveBeenCalled()
    expect(result.current.pending[0].status).toBe('applied')
  })

  it('plans a vetted video through the FEAT-132 day lane, with the real library entry', async () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('m1', [PLAN_ACTION]))
    await act(async () => {
      await result.current.applyChatAction(PLAN_ACTION)
    })

    expect(writeWatchItemToDay).toHaveBeenCalledTimes(1)
    expect(writeWatchItemToDay).toHaveBeenCalledWith({
      familyId: 'fam1',
      childId: 'lincoln1',
      dateKey: NEXT_TUESDAY,
      // The whole library document, so the lane's shared row builder keeps
      // `itemType` / `watchVideoId` — not a hand-made subset.
      video: VIDEOS[0],
    })
    // Planning writes no library entry, no activity config, no day-item lane.
    expect(addWatchVideo).not.toHaveBeenCalled()
    expect(addItemToLiveDay).not.toHaveBeenCalled()
  })

  it('touches nothing retroactive — no hours, no plan, no child record', async () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('m1', [VET_IN_ACTION, PLAN_ACTION]))
    await act(async () => {
      await result.current.applyChatAction(VET_IN_ACTION)
      await result.current.applyChatAction(PLAN_ACTION)
    })
    expect(writeSnapshotUpdate).not.toHaveBeenCalled()
    expect(updateChildSoftProfile).not.toHaveBeenCalled()
    expect(updateActivityConfigMinutes).not.toHaveBeenCalled()
    expect(stagePlanAdjustment).not.toHaveBeenCalled()
    expect(removeItemFromLiveDay).not.toHaveBeenCalled()
    expect(moveItemToLiveDay).not.toHaveBeenCalled()
  })

  it('refuses a repeat confirm — vetInVideo mints a doc per call, so two taps would add two', async () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('m1', [VET_IN_ACTION]))
    await act(async () => {
      await Promise.all([
        result.current.applyChatAction(VET_IN_ACTION),
        result.current.applyChatAction(VET_IN_ACTION),
      ])
      await result.current.applyChatAction(VET_IN_ACTION)
    })
    expect(addWatchVideo).toHaveBeenCalledTimes(1)
  })
})

describe('watch actions — the write backstop (FEAT-149)', () => {
  it('refuses a staged plan whose video was retired before the tap', async () => {
    const { result, rerender } = renderHook(
      ({ videos }: { videos: WatchVideo[] }) =>
        useShellyChatActions({
          familyId: 'fam1',
          children: CHILDREN,
          activeChildId: 'lincoln1',
          activeThreadId: 'thread1',
          watchVideos: videos,
          canEditActivityConfigs: true,
        }),
      { initialProps: { videos: VIDEOS } },
    )

    act(() => result.current.stagePendingActions('m1', [PLAN_ACTION]))
    expect(result.current.pending).toHaveLength(1)

    // Retired in the Watch Library in another tab, between the card and the tap.
    rerender({
      videos: [{ ...VIDEOS[0], status: WatchVideoStatus.Retired }, VIDEOS[1]],
    })
    await act(async () => {
      const wrote = await result.current.applyChatAction(PLAN_ACTION)
      expect(wrote).toBe(false)
    })
    expect(writeWatchItemToDay).not.toHaveBeenCalled()
    // The card stays retryable rather than claiming a write that didn't happen.
    expect(result.current.pending[0].status).toBe('pending')
  })

  it('refuses a watch action bound to a different child than the active tab', async () => {
    const { result } = setup('lincoln1')
    const wrongChild = { ...VET_IN_ACTION, childId: 'london1' } as ChatAction
    await act(async () => {
      expect(await result.current.applyChatAction(wrongChild)).toBe(false)
    })
    expect(addWatchVideo).not.toHaveBeenCalled()
  })
})

// ── Codex findings on PR #1676 ───────────────────────────────────────────────

describe('a repeated vet-in in one reply becomes one card (Codex P2, PR #1676)', () => {
  it('stages the first and drops the second, saying it was proposed twice', () => {
    // Both would resolve against the SAME pre-write library snapshot, so neither
    // sees the other; `addWatchVideo` is an `addDoc` and the re-entry guard is
    // keyed on the action OBJECT, so two objects would mint two library entries.
    const { result } = setup()
    const again = { ...VET_IN_ACTION, title: 'Rivers and canyons' } as ChatAction
    act(() => result.current.stagePendingActions('m1', [VET_IN_ACTION, again]))

    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0].action).toBe(VET_IN_ACTION)
    expect(result.current.suppressed).toHaveLength(1)
    // It is NOT a library duplicate — nothing is written yet — so the sentence
    // must not send her looking for it in the Watch Library.
    expect(result.current.suppressed[0]).toContain('twice in one message')
    expect(result.current.suppressed[0]).not.toContain('already in the Watch Library')
  })

  it('writes once when the reply repeated itself', async () => {
    const { result } = setup()
    const again = { ...VET_IN_ACTION } as ChatAction
    act(() => result.current.stagePendingActions('m1', [VET_IN_ACTION, again]))
    await act(async () => {
      await result.current.confirmAll()
    })
    expect(addWatchVideo).toHaveBeenCalledTimes(1)
  })

  it('still stages two DIFFERENT videos from one reply', () => {
    // The dedupe is on the video, not on the kind — "add these two" must work.
    const other = {
      ...VET_IN_ACTION,
      youtubeId: 'qQqQqQqQqQq',
      title: 'How Caves Form',
      suggestedFromUrl: 'https://www.youtube.com/watch?v=qQqQqQqQqQq',
    } as ChatAction
    const { result } = setup()
    act(() => result.current.stagePendingActions('m1', [VET_IN_ACTION, other]))
    expect(result.current.pending).toHaveLength(2)
    expect(result.current.suppressed).toEqual([])
  })
})

describe('confirmed writes are serialized (Codex P1, PR #1676)', () => {
  it('does not start a second day write while the first is still in flight', async () => {
    // `writeWatchItemToDay` is a read-modify-setDoc, so two of them racing on the
    // same day both build from the same old checklist and the later write drops
    // the earlier one's row — while BOTH cards say "Done". Two different cards
    // are not covered by the per-action re-entry guard, so the queue is what
    // holds the line.
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = () => resolve()
    })
    let started = 0
    writeWatchItemToDay.mockImplementation(() => {
      started += 1
      return gate
    })

    const second = { ...PLAN_ACTION, dateKey: SOONEST } as ChatAction
    const { result } = setup()
    act(() => result.current.stagePendingActions('m1', [PLAN_ACTION, second]))

    await act(async () => {
      const a = result.current.applyChatAction(PLAN_ACTION)
      const b = result.current.applyChatAction(second)
      // Let both taps get as far as they can while the first write hangs.
      await Promise.resolve()
      await Promise.resolve()
      expect(started).toBe(1)
      release()
      await Promise.all([a, b])
    })

    // Both still happen — serialized, not dropped.
    expect(started).toBe(2)
    expect(writeWatchItemToDay).toHaveBeenCalledTimes(2)
    expect(result.current.pending.every((p) => p.status === 'applied')).toBe(true)
  })

  it('a failed write does not wedge the queue for the rest of the turn', async () => {
    writeWatchItemToDay.mockRejectedValueOnce(new Error('offline'))
    const second = { ...PLAN_ACTION, dateKey: SOONEST } as ChatAction
    const { result } = setup()
    act(() => result.current.stagePendingActions('m1', [PLAN_ACTION, second]))

    // UX-33(c): the rejection is caught and reported on the card rather than
    // thrown past the caller. The queue rail this test exists for is unchanged
    // — the SECOND write still runs.
    await act(async () => {
      expect(await result.current.applyChatAction(PLAN_ACTION)).toBe(false)
    })
    expect(result.current.pending[0].error).toMatch(/didn't save/)
    await act(async () => {
      expect(await result.current.applyChatAction(second)).toBe(true)
    })
    expect(writeWatchItemToDay).toHaveBeenCalledTimes(2)
  })
})

describe('draftNextWeek — the first of two taps (FEAT-150)', () => {
  const DRAFT: ChatAction = {
    kind: 'draftNextWeek',
    childId: 'lincoln1',
    instructions: 'lighter, math every day but short',
  }

  it('offers the card when a parent asks', () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [DRAFT]))
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.suppressed).toEqual([])
  })

  it('refuses a kid profile with a reason, not silently', () => {
    const { result } = setup('lincoln1', 'thread1', { canEditActivityConfigs: false })
    act(() => result.current.stagePendingActions('msg1', [DRAFT]))
    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed[0]).toMatch(/grown-up/i)
  })

  it('refuses when no draft surface is wired, rather than promising a dead card', () => {
    const { result } = setup('lincoln1', 'thread1', { onDraftNextWeek: undefined })
    act(() => result.current.stagePendingActions('msg1', [DRAFT]))
    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed[0]).toMatch(/Plan My Week/)
  })

  it('runs the generation on confirm and marks the card applied', async () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [DRAFT]))
    await act(async () => {
      await result.current.applyChatAction(DRAFT)
    })
    expect(onDraftNextWeek).toHaveBeenCalledWith(DRAFT)
    expect(result.current.pending[0].status).toBe('applied')
  })

  it('leaves the card PENDING when generation produced no week', async () => {
    onDraftNextWeek.mockResolvedValue(false)
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [DRAFT]))
    await act(async () => {
      await result.current.applyChatAction(DRAFT)
    })
    // No "Done ✓" over a week that does not exist — the tap stays retryable.
    expect(result.current.pending[0].status).toBe('pending')
  })

  it('writes nothing — it is a generation, not a write', async () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [DRAFT]))
    await act(async () => {
      await result.current.applyChatAction(DRAFT)
    })
    expect(addSightWord).not.toHaveBeenCalled()
    expect(updateChildSoftProfile).not.toHaveBeenCalled()
    expect(stagePlanAdjustment).not.toHaveBeenCalled()
    expect(navigateToPlanner).not.toHaveBeenCalled()
  })
})

describe('draftNextWeek vs the handoff — one question, one card (Codex P2, PR #1679)', () => {
  const DRAFT: ChatAction = {
    kind: 'draftNextWeek',
    childId: 'lincoln1',
    instructions: 'lighter next week',
  }
  const HANDOFF: ChatAction = {
    kind: 'proposePlanAdjustment',
    childId: 'lincoln1',
    summary: 'Reduce math next week',
    rationale: 'Frustration is spiking',
  }

  it('drops the handoff when a draft is proposed in the same turn', () => {
    // Both answer "reshape next week". Two cards would be two conflicting
    // confirmations for one intent — one drafting here, one navigating away.
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [HANDOFF, DRAFT]))
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0].action.kind).toBe('draftNextWeek')
  })

  it('drops it regardless of which order the model emitted them', () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [DRAFT, HANDOFF]))
    expect(result.current.pending.map((p) => p.action.kind)).toEqual(['draftNextWeek'])
  })

  it('records no suppressed notice — a card DID appear for what she asked', () => {
    // The notices exist so a reply promising "confirm with a tap" never leaves
    // the parent waiting on a card that never comes. Here one comes, and it does
    // the thing she asked for; naming a redundant route she never saw is noise.
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [HANDOFF, DRAFT]))
    expect(result.current.suppressed).toEqual([])
  })

  it('still offers the handoff alone when no draft accompanies it', () => {
    const { result } = setup()
    act(() => result.current.stagePendingActions('msg1', [HANDOFF]))
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0].action.kind).toBe('proposePlanAdjustment')
  })

  it('keeps the handoff when the draft was itself refused', () => {
    // A kid profile: the draft never becomes a card, so suppressing the handoff
    // too would leave the turn with nothing at all.
    const { result } = setup('lincoln1', 'thread1', { canEditActivityConfigs: false })
    act(() => result.current.stagePendingActions('msg1', [HANDOFF, DRAFT]))
    expect(result.current.pending.map((p) => p.action.kind)).toEqual(['proposePlanAdjustment'])
  })
})

// ── FEAT-152. The General tab writes nothing, and drops out loud ──
//
// The prompt fix (functions/src/ai/tasks/shellyChat.ts) is the real one: the
// general branch now carries an explicit no-write contract, so the model stops
// narrating a "Pushed! ✅" over a turn in which nothing was proposed. This is
// the seatbelt under it, and it closes a hole the prompt alone would not have:
//
// on the General tab `activeChildId` is `''`, so `rejectReason`'s mismatch check
// — `activeChildId && action.childId !== activeChildId` — short-circuits, and a
// well-formed action naming a REAL child (one the model can read straight off
// the ALL CHILDREN section) would have been offered as a card and written. The
// tab with no write powers had, structurally, the loosest child binding.

describe('generalTabDropNotice (FEAT-152)', () => {
  it('names the family\'s own tabs, not hardcoded strings', () => {
    expect(generalTabDropNotice(['Lincoln', 'London'])).toContain(
      "Ask on Lincoln's or London's tab",
    )
  })

  it('handles a single child without a dangling or', () => {
    const out = generalTabDropNotice(['Lincoln'])
    expect(out).toContain("Ask on Lincoln's tab")
    expect(out).not.toContain("'s or ")
  })

  it('scales past two without hardcoding a count', () => {
    expect(generalTabDropNotice(['A', 'B', 'C'])).toContain("Ask on A, B's or C's tab")
  })

  it('falls back to a generic, still-actionable sentence with no names', () => {
    for (const names of [[], ['', '  ']]) {
      expect(generalTabDropNotice(names)).toContain("the child's tab")
    }
  })

  it('says nothing was changed, and says the card is what writes', () => {
    const out = generalTabDropNotice(['Lincoln', 'London'])
    expect(out).toContain('nothing was changed')
    expect(out).toContain('the card is what makes it real')
  })
})

describe('the General tab drops every action, with a visible reason (FEAT-152)', () => {
  /** The General tab: no child selected. */
  const general = () => setup('')

  const SIGHT_WORD: ChatAction = {
    kind: 'addSightWord',
    childId: 'lincoln1',
    word: 'because',
  }

  it('offers no card for a well-formed action naming a REAL child', () => {
    // The pre-fix hole: `lincoln1` is a real family child, so nothing in the
    // binding checks refused it once `activeChildId` was ''.
    const { result } = general()
    act(() => result.current.stagePendingActions('msg1', [SIGHT_WORD]))
    expect(result.current.pending).toEqual([])
  })

  it('drops it with a reason the parent can read, not silently', () => {
    const { result } = general()
    act(() => result.current.stagePendingActions('msg1', [SIGHT_WORD]))
    expect(result.current.suppressed).toHaveLength(1)
    expect(result.current.suppressed[0]).toContain("can't change anything from the General tab")
    expect(result.current.suppressed[0]).toContain('nothing was changed')
    // Names the real tabs from the family's children.
    expect(result.current.suppressed[0]).toContain("Lincoln's or London's tab")
  })

  it('drops EVERY kind, including the ones with no other gate', () => {
    // Deliberately spans the union: a sight word (no resolver at all), a
    // snapshot add (no resolver), a handoff (no resolver), and a live-day add
    // (resolver would have passed it — the day is real and the row is new).
    const { result } = general()
    const actions: ChatAction[] = [
      SIGHT_WORD,
      { kind: 'addPrioritySkill', childId: 'lincoln1', skill: 'inference' },
      { kind: 'editProfileField', childId: 'lincoln1', field: 'motivators', value: 'Lego' },
      {
        kind: 'proposePlanAdjustment',
        childId: 'lincoln1',
        summary: 'lighter week',
        rationale: 'frustration is spiking',
      },
    ]
    act(() => result.current.stagePendingActions('msg1', actions))
    expect(result.current.pending).toEqual([])
    // One sentence, not four — the tab can't write, and that is the whole story.
    expect(result.current.suppressed).toHaveLength(1)
  })

  it('stays quiet on an ordinary General-tab turn that proposed nothing', () => {
    // The overwhelmingly common case, and the one the contract is meant to
    // produce: discussion, no action block, no notice, no card.
    const { result } = general()
    act(() => result.current.stagePendingActions('msg1', []))
    expect(result.current.pending).toEqual([])
    expect(result.current.suppressed).toEqual([])
  })

  it('refuses the write even if a card were somehow tapped (backstop)', async () => {
    const { result } = general()
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(SIGHT_WORD)
    })
    expect(ok).toBe(false)
    expect(addSightWord).not.toHaveBeenCalled()
  })

  it('changes nothing on a child tab — the same action is still offered there', () => {
    const { result } = setup('lincoln1')
    act(() => result.current.stagePendingActions('msg1', [SIGHT_WORD]))
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.suppressed).toEqual([])
  })
})

// ── Dad Lab — createConceptArc / planLab (FEAT-157) ─────────────────
// The contracts under test: a confirmed arc lands through the SAME writer the
// New Arc dialog uses, carrying exactly the card's steps in order with the
// dialog's own statuses and the AI origin; a confirmed lab lands through the
// extracted Planned lane (whose Planned-only / zero-hours shape is pinned in
// plannedLab.test.ts); and a hallucinated arc link never becomes a card.

const CREATE_ARC_ACTION: ChatAction = {
  kind: 'createConceptArc',
  childId: 'lincoln1',
  title: 'The Motor Arc',
  domainLabel: 'Motors',
  steps: [
    { title: 'Spin a magnet' },
    { title: 'Build the motor', conceptBeat: 'Current makes torque' },
    { title: 'Race it' },
  ],
}

const PLAN_LAB_ACTION: ChatAction = {
  kind: 'planLab',
  childId: 'lincoln1',
  title: 'Make a bulb light up',
  question: 'What makes it turn on?',
  labType: 'science',
  materials: ['battery', 'bulb', 'wire'],
  arcId: 'arc_elec',
  arcStepIndex: 1,
}

describe('useShellyChatActions — Dad Lab (FEAT-157)', () => {
  it('a confirmed arc routes through createArc with EXACTLY the card steps in order, first active, AI origin', async () => {
    const { result } = setup()

    act(() => result.current.stagePendingActions('msg1', [CREATE_ARC_ACTION]))
    expect(result.current.pending).toHaveLength(1)

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(CREATE_ARC_ACTION)
    })

    expect(ok).toBe(true)
    expect(createArc).toHaveBeenCalledTimes(1)
    expect(createArc).toHaveBeenCalledWith('fam1', ['lincoln1', 'london1'], {
      title: 'The Motor Arc',
      domainLabel: 'Motors',
      childIds: undefined,
      createdFrom: 'ai-suggested',
      steps: [
        { title: 'Spin a magnet', conceptBeat: '', status: 'active' },
        { title: 'Build the motor', conceptBeat: 'Current makes torque', status: 'upcoming' },
        { title: 'Race it', conceptBeat: '', status: 'upcoming' },
      ],
    })
    expect(createPlannedLab).not.toHaveBeenCalled()
    expect(result.current.pending[0].status).toBe('applied')
  })

  it('a confirmed lab routes through the Planned lane with the card fields — and touches nothing else', async () => {
    const { result } = setup()

    act(() => result.current.stagePendingActions('msg1', [PLAN_LAB_ACTION]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(PLAN_LAB_ACTION)
    })

    expect(ok).toBe(true)
    expect(createPlannedLab).toHaveBeenCalledTimes(1)
    expect(createPlannedLab).toHaveBeenCalledWith('fam1', {
      title: 'Make a bulb light up',
      question: 'What makes it turn on?',
      labType: 'science',
      materials: ['battery', 'bulb', 'wire'],
      arcId: 'arc_elec',
      arcStepIndex: 1,
    })
    // No hours, no status flip, no other lane: the write layer's zero-hours
    // shape is pinned in plannedLab.test.ts; here we pin that the chat reached
    // ONLY the Dad Lab lane plus the inline confirm audit.
    expect(createArc).not.toHaveBeenCalled()
    expect(addActivityConfig).not.toHaveBeenCalled()
    expect(addItemToLiveDay).not.toHaveBeenCalled()
    expect(writeSnapshotUpdate).not.toHaveBeenCalled()
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const [, payload] = updateDoc.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(Object.keys(payload)).toEqual(['appliedActions'])
  })

  it('never offers a card for a hallucinated arcId — dropped with the reason shown', () => {
    const { result } = setup()
    const bogus: ChatAction = { ...PLAN_LAB_ACTION, arcId: 'arc_made_up' } as ChatAction

    act(() => result.current.stagePendingActions('msg1', [bogus]))

    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed.join(' ')).toContain('concept arcs')
    expect(createPlannedLab).not.toHaveBeenCalled()
  })

  it('never offers a card for a step index past the end of a real arc', () => {
    const { result } = setup()
    const past: ChatAction = { ...PLAN_LAB_ACTION, arcStepIndex: 2 } as ChatAction

    act(() => result.current.stagePendingActions('msg1', [past]))

    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed.join(' ')).toContain('past the end')
  })

  it('drops both kinds for a kid profile, out loud, and never reaches a writer', async () => {
    const { result } = setup('lincoln1', 'thread1', { canEditActivityConfigs: false })

    act(() =>
      result.current.stagePendingActions('msg1', [CREATE_ARC_ACTION, PLAN_LAB_ACTION]),
    )
    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed.join(' ')).toContain('grown-up')

    // Backstop: even a direct apply attempt is refused.
    await act(async () => {
      expect(await result.current.applyChatAction(CREATE_ARC_ACTION)).toBe(false)
    })
    expect(createArc).not.toHaveBeenCalled()
    expect(createPlannedLab).not.toHaveBeenCalled()
  })

  it('drops both kinds on the General tab like every other action', () => {
    const { result } = setup('')

    act(() =>
      result.current.stagePendingActions('msg1', [CREATE_ARC_ACTION, PLAN_LAB_ACTION]),
    )

    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed).toEqual([
      generalTabDropNotice(['Lincoln', 'London']),
    ])
  })

  it('an arc naming a stranger in childIds never becomes a card', () => {
    const { result } = setup()
    const bad: ChatAction = {
      ...CREATE_ARC_ACTION,
      childIds: ['lincoln1', 'stranger'],
    } as ChatAction

    act(() => result.current.stagePendingActions('msg1', [bad]))

    expect(result.current.pending).toHaveLength(0)
    expect(result.current.suppressed.join(' ')).toContain("don't recognize")
  })

  it('a named-audience arc passes the ids through to the shared writer', async () => {
    const { result } = setup()
    const named: ChatAction = { ...CREATE_ARC_ACTION, childIds: ['london1'] } as ChatAction

    act(() => result.current.stagePendingActions('msg1', [named]))
    await act(async () => {
      await result.current.applyChatAction(named)
    })

    expect(createArc).toHaveBeenCalledWith(
      'fam1',
      ['lincoln1', 'london1'],
      expect.objectContaining({ childIds: ['london1'] }),
    )
  })
})

// ── The confirm-card LIFECYCLE (FEAT-162 / UX-33) ────────────────────────
//
// The portal's promise is that the card is the only thing that writes. These
// three moments broke it from the other end: a card that vanishes with no
// account, a card that survives its context and does nothing when tapped, and
// a write that fails behind a button that just comes back.
describe('pending-card lifecycle (UX-33)', () => {
  const WORD_A: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'said' }
  const WORD_B: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'come' }
  const WORD_C: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'were' }

  describe('(a) a new turn replaces the cards', () => {
    it('accounts for the cards the new turn replaced — never a silent wipe', () => {
      const { result } = setup()
      act(() => result.current.stagePendingActions('msg1', [WORD_A, WORD_B]))
      expect(result.current.pending).toHaveLength(2)

      act(() => result.current.stagePendingActions('msg2', [WORD_C]))

      expect(result.current.pending).toHaveLength(1)
      expect(result.current.suppressed.join(' ')).toContain('2 suggestions')
      expect(result.current.suppressed.join(' ')).toContain('Nothing was changed')
    })

    it('says nothing when the previous turn had no cards left standing', () => {
      const { result } = setup()
      act(() => result.current.stagePendingActions('msg1', [WORD_A]))
      act(() => result.current.dismissAction(WORD_A))

      act(() => result.current.stagePendingActions('msg2', [WORD_B]))

      expect(result.current.suppressed).toEqual([])
    })

    it('carries the account even when every action in the new turn is dropped', () => {
      const { result } = setup('lincoln1', 'thread1', { canEditActivityConfigs: false })
      act(() => result.current.stagePendingActions('msg1', [WORD_A]))
      expect(result.current.pending).toHaveLength(1)

      // A parent-only proposal from a non-parent profile: dropped at the gate.
      act(() => result.current.stagePendingActions('msg2', [MINUTES_ACTION]))

      expect(result.current.pending).toHaveLength(0)
      const said = result.current.suppressed.join(' ')
      expect(said).toContain('1 suggestion')
      // Both sentences survive — the drop reason AND what it replaced.
      expect(said).toContain('grown-up does')
    })
  })

  describe('(b) the context the cards were proposed in is gone', () => {
    it('clears the cards on a child-tab switch and names the child they were for', () => {
      const { result } = setup()
      act(() => result.current.stagePendingActions('msg1', [WORD_A, WORD_B]))

      act(() => result.current.dropPendingForContext('context-switch'))

      expect(result.current.pending).toHaveLength(0)
      const said = result.current.suppressed.join(' ')
      expect(said).toContain('Lincoln')
      expect(said).toContain('can only be confirmed')
    })

    it('clears them on a thread switch, naming the conversation rather than the child', () => {
      const { result } = setup()
      act(() => result.current.stagePendingActions('msg1', [WORD_A]))

      act(() => result.current.dropPendingForContext('thread-switch'))

      expect(result.current.pending).toHaveLength(0)
      expect(result.current.suppressed.join(' ')).toContain('conversation')
    })

    it('says nothing when there were no cards to drop', () => {
      const { result } = setup()
      act(() => result.current.dropPendingForContext('context-switch'))
      expect(result.current.suppressed).toEqual([])
    })

    it('leaves no card behind that a later tap could reach', async () => {
      const { result } = setup()
      act(() => result.current.stagePendingActions('msg1', [WORD_A]))
      act(() => result.current.dropPendingForContext('context-switch'))

      // Nothing is on screen to tap; and the write lane is released too, so a
      // fresh proposal for the same word is not treated as already applied.
      expect(result.current.pending).toEqual([])
      act(() => result.current.stagePendingActions('msg2', [WORD_A]))
      await act(async () => {
        await result.current.applyChatAction(WORD_A)
      })
      expect(addSightWord).toHaveBeenCalledTimes(1)
    })
  })

  describe('(c) a confirmed write that fails', () => {
    it('says so on the card, and still leaves it retryable', async () => {
      addSightWord.mockRejectedValueOnce(new Error('offline'))
      const { result } = setup()
      act(() => result.current.stagePendingActions('msg1', [WORD_A]))

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.applyChatAction(WORD_A)
      })

      expect(ok).toBe(false)
      expect(result.current.pending[0].status).toBe('pending')
      expect(result.current.pending[0].error).toMatch(/didn't save/)
      expect(result.current.pending[0].error).toContain('nothing was changed')
    })

    it('never claims the write happened', async () => {
      addSightWord.mockRejectedValueOnce(new Error('offline'))
      const { result } = setup()
      act(() => result.current.stagePendingActions('msg1', [WORD_A]))
      await act(async () => {
        await result.current.applyChatAction(WORD_A)
      })
      expect(result.current.pending[0].status).not.toBe('applied')
    })

    it('clears the sentence when the retry succeeds', async () => {
      addSightWord.mockRejectedValueOnce(new Error('offline'))
      const { result } = setup()
      act(() => result.current.stagePendingActions('msg1', [WORD_A]))
      await act(async () => {
        await result.current.applyChatAction(WORD_A)
      })
      expect(result.current.pending[0].error).toBeTruthy()

      await act(async () => {
        await result.current.applyChatAction(WORD_A)
      })
      expect(result.current.pending[0].status).toBe('applied')
      expect(result.current.pending[0].error).toBeUndefined()
    })

    it('a failed card does not abort the cards behind it in Confirm all', async () => {
      addSightWord.mockRejectedValueOnce(new Error('offline'))
      const { result } = setup()
      act(() => result.current.stagePendingActions('msg1', [WORD_A, WORD_B]))

      await act(async () => {
        await result.current.confirmAll()
      })

      expect(result.current.pending[0].status).toBe('pending')
      expect(result.current.pending[0].error).toMatch(/didn't save/)
      expect(result.current.pending[1].status).toBe('applied')
      expect(addSightWord).toHaveBeenCalledTimes(2)
    })

    it('a rejected write never escapes applyChatAction as an unhandled rejection', async () => {
      addSightWord.mockRejectedValueOnce(new Error('offline'))
      const { result } = setup()
      act(() => result.current.stagePendingActions('msg1', [WORD_A]))

      // The old shape threw out of an `onClick` that discards the promise.
      await expect(
        act(async () => {
          await result.current.applyChatAction(WORD_A)
        }),
      ).resolves.not.toThrow()
    })
  })
})
