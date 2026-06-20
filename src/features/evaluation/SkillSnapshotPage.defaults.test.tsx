import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Child } from '../../core/types'
import { UserProfile } from '../../core/types/enums'
import { defaultPrioritySkills as lincolnPrioritySkills } from './lincolnDefaults'
import { defaultPrioritySkills as londonPrioritySkills } from './londonDefaults'

// ── Heavy / external deps mocked to a thin pass-through ──────────────
const setDoc = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined)

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))
vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
}))
vi.mock('../../core/firebase/firestore', () => ({
  skillSnapshotsCollection: () => ({}),
}))
vi.mock('../../core/hooks/useSaveState', () => ({
  useSaveState: () => ({
    saveState: 'idle',
    withSave: async (fn: () => Promise<unknown>) => fn(),
  }),
}))
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  setDoc: (ref: unknown, data: unknown) => setDoc(ref, data),
  onSnapshot: (
    _ref: unknown,
    onNext: (snap: {
      exists: () => boolean
      id: string
      data: () => unknown
    }) => void,
  ) => {
    onNext({
      exists: () => true,
      id: 'c1',
      data: () => ({
        childId: 'c1',
        prioritySkills: [],
        supports: [],
        stopRules: [],
        evidenceDefinitions: [],
      }),
    })
    return () => {}
  },
}))

// Thin stubs for the child panels (they pull their own firebase/quest deps).
vi.mock('../../components/ChildSelector', () => ({ default: () => null }))
vi.mock('./QuickCheckPanel', () => ({ default: () => null }))
vi.mock('./WorkingLevelsSection', () => ({ default: () => null }))
vi.mock('../evaluate/MasteryCheckoffPanel', () => ({ default: () => null }))
vi.mock('../evaluate/FoundationsSection', () => ({ default: () => null }))
vi.mock('../planner-chat/SkipAdvisorChip', () => ({ default: () => null }))
vi.mock('../planner-chat/skipAdvisor.logic', () => ({
  evaluatePrioritySkillStatus: () => ({ action: 'focus' }),
}))

const activeChild = vi.fn<() => Child>()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    children: [activeChild()],
    activeChildId: 'c1',
    activeChild: activeChild(),
    setActiveChildId: vi.fn(),
    isLoading: false,
    addChild: vi.fn(),
  }),
}))
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: UserProfile.Parents }),
}))

import SkillSnapshotPage from './SkillSnapshotPage'

describe('SkillSnapshotPage — Load Starter Defaults applies per-child defaults', () => {
  beforeEach(() => {
    setDoc.mockClear()
  })

  it('applies London defaults for a kindergarten-band child', async () => {
    activeChild.mockReturnValue({ id: 'c1', name: 'London', grade: 'Kindergarten' })
    render(<SkillSnapshotPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Load Starter Defaults/i }))

    await waitFor(() => {
      const lastCall = setDoc.mock.calls.at(-1)
      expect((lastCall?.[1] as unknown as { prioritySkills: unknown }).prioritySkills).toEqual(
        londonPrioritySkills,
      )
    })
  })

  it('applies Lincoln defaults for an older child (unchanged)', async () => {
    activeChild.mockReturnValue({ id: 'c1', name: 'Lincoln', grade: '4th grade' })
    render(<SkillSnapshotPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Load Starter Defaults/i }))

    await waitFor(() => {
      const lastCall = setDoc.mock.calls.at(-1)
      expect((lastCall?.[1] as unknown as { prioritySkills: unknown }).prioritySkills).toEqual(
        lincolnPrioritySkills,
      )
    })
  })
})
