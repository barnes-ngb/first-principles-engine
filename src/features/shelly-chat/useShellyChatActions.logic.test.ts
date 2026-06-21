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

import { useShellyChatActions } from './useShellyChatActions'

const CHILDREN: Child[] = [
  { id: 'lincoln1', name: 'Lincoln' } as Child,
  { id: 'london1', name: 'London' } as Child,
]

const navigateToPlanner = vi.fn()

function setup(activeChildId = 'lincoln1', activeThreadId: string | null = 'thread1') {
  return renderHook(() =>
    useShellyChatActions({
      familyId: 'fam1',
      children: CHILDREN,
      activeChildId,
      activeThreadId,
      navigateToPlanner,
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
  updateDoc.mockResolvedValue(undefined)
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
