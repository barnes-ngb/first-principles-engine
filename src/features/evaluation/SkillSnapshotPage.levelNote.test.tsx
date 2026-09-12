import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Child } from '../../core/types'
import { UserProfile } from '../../core/types/enums'

/**
 * UX-393 — a level is an observation, and the level control says so.
 *
 * PR #1838 found that `handleUpdateSkill` changes `prioritySkills[].level`
 * without touching an existing `masteryGate`, while `getEffectiveMasteryGate`
 * prefers that gate — so a parent could set *secure* and the planner's skip
 * advisor kept saying active practice. Owner decision, 2026-09-11: **a level is
 * an observation; the gate stays; the UI says so.**
 *
 * So this file asserts two things that must both hold:
 *
 *  1. the sentence renders on the control, and
 *  2. **the write is byte-unchanged** — same fields, same values, and
 *     `masteryGate` still untouched. The last case is the positive control for
 *     that second claim: it pins the exact payload, so a "copy-only" change
 *     that quietly altered a `skillSnapshots` write — the propose-and-confirm
 *     rail `CLAUDE.md` protects — fails here rather than shipping.
 */

const setDoc = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined)

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../../core/firebase/firestore', () => ({ skillSnapshotsCollection: () => ({}) }))
vi.mock('../../core/hooks/useSaveState', () => ({
  useSaveState: () => ({
    saveState: 'idle',
    withSave: async (fn: () => Promise<unknown>) => fn(),
  }),
}))

/**
 * The stored skill this page reads back. `masteryGate: 0` is `NotYet` — the
 * value both children's starter defaults carry, and the one that makes the
 * level/gate disagreement reachable in the first place.
 */
const STORED_SKILL = {
  label: 'Reading focus',
  tag: 'reading.cvcBlend',
  level: 'developing',
  masteryGate: 0,
  notes: 'blends c-v-c with a prompt',
}

vi.mock('firebase/firestore', () => ({
  doc: (_collection: unknown, id: string) => ({ id }),
  updateDoc: vi.fn(),
  deleteField: vi.fn(),
  setDoc: (ref: unknown, data: unknown) => setDoc(ref, data),
  onSnapshot: (
    _ref: unknown,
    onNext: (snap: { exists: () => boolean; id: string; data: () => unknown }) => void,
  ) => {
    onNext({
      exists: () => true,
      id: 'c1',
      data: () => ({
        childId: 'c1',
        prioritySkills: [STORED_SKILL],
        workingLevels: {},
        supports: [],
        stopRules: [],
        evidenceDefinitions: [],
      }),
    })
    return () => {}
  },
}))

vi.mock('../../components/ChildSelector', () => ({ default: () => null }))
vi.mock('./QuickCheckPanel', () => ({ default: () => null }))
vi.mock('../evaluate/MasteryCheckoffPanel', () => ({ default: () => null }))
vi.mock('../evaluate/FoundationsSection', () => ({ default: () => null }))
vi.mock('../planner-chat/SkipAdvisorChip', () => ({ default: () => null }))
vi.mock('../planner-chat/skipAdvisor.logic', () => ({
  evaluatePrioritySkillStatus: () => ({ action: 'focus' }),
}))

const CHILD: Child = { id: 'c1', name: 'Lincoln' } as Child
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    children: [CHILD],
    activeChildId: CHILD.id,
    activeChild: CHILD,
    setActiveChildId: vi.fn(),
    isLoading: false,
    addChild: vi.fn(),
  }),
}))
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: UserProfile.Parents }),
}))

import SkillSnapshotPage from './SkillSnapshotPage'
import { SKILL_LEVEL_OBSERVATION_NOTE } from './skillLevelCopy'

/** Opens the Priority Skills section and returns a scope over it. */
function openPrioritySkills() {
  render(<SkillSnapshotPage />)
  fireEvent.click(screen.getByRole('button', { name: /Priority Skills/ }))
  return within(screen.getByRole('region', { name: /Priority Skills/ }))
}

beforeEach(() => {
  setDoc.mockClear()
})

describe('Skill Snapshot — the level control says what it reaches (UX-393)', () => {
  it('renders the observation note under the level dropdown', () => {
    const section = openPrioritySkills()
    expect(section.getByText(SKILL_LEVEL_OBSERVATION_NOTE)).toBeInTheDocument()
  })

  it('renders it from the shared copy module, not a local string', () => {
    // If someone re-types the sentence here, the quick-check panel's copy and
    // this one can drift — which is the two-controls-disagreeing shape this
    // whole row is about. The literal below is the module's own value.
    const section = openPrioritySkills()
    expect(section.getByText(
      'Changes the level the planner sees. Mastery is confirmed by check-off.',
    )).toBeInTheDocument()
  })
})

describe('Skill Snapshot — the level write is unchanged (UX-393)', () => {
  it('POSITIVE CONTROL — changing the level writes level and nothing else', async () => {
    const section = openPrioritySkills()

    // MUI's Select is a listbox behind a combobox, not a native <select>.
    fireEvent.mouseDown(section.getByRole('combobox', { name: 'Level' }))
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'secure' }))

    await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1))
    const written = setDoc.mock.calls[0][1] as { prioritySkills: Record<string, unknown>[] }

    // The one changed field…
    expect(written.prioritySkills[0]).toMatchObject({ level: 'secure' })
    // …and every other field of the stored skill carried through untouched,
    // `masteryGate` above all: the owner's decision is that the gate STAYS, so
    // a fix that helpfully raised it here would be the invariant change this
    // run is not authorised to make.
    expect(written.prioritySkills[0]).toEqual({ ...STORED_SKILL, level: 'secure' })
    expect(written.prioritySkills[0].masteryGate).toBe(STORED_SKILL.masteryGate)
  })
})
