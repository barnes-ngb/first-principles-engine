import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Child } from '../../core/types'
import { UserProfile } from '../../core/types/enums'

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
  doc: (_collection: unknown, id: string) => ({ id }),
  updateDoc: vi.fn(),
  deleteField: vi.fn(),
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
        childId: activeChild().id,
        prioritySkills: [{ label: 'Reading focus', tag: 'reading.cvcBlend', level: 'developing', masteryGate: 0 }],
        workingLevels: { phonics: { level: activeChild().id === 'c1' ? 4 : 2, source: 'quest', updatedAt: new Date().toISOString() } },
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
    activeChildId: activeChild().id,
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

describe('Skill Snapshot compact sections', () => {
  beforeEach(() => {
    setDoc.mockClear()
    activeChild.mockReturnValue({ id: 'c1', name: 'Lincoln' })
  })

  it('summarizes levels and priorities before opening an editor', () => {
    render(<SkillSnapshotPage />)
    expect(screen.getByRole('button', { name: /Working Levels.*Phonics: Level 4/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /Priority Skills.*Reading focus: developing/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Adjust' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Label' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeDisabled()
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('collapses all without saving or discarding an unfinished level adjustment', async () => {
    render(<SkillSnapshotPage />)
    fireEvent.click(screen.getByRole('button', { name: /Working Levels/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    fireEvent.click(screen.getByRole('button', { name: 'increase level' }))
    fireEvent.change(screen.getByRole('textbox', { name: /Why are you adjusting/ }), { target: { value: 'Reading comfortably' } })
    fireEvent.click(screen.getByRole('button', { name: /Priority Skills/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Priority Skills/ })).toHaveAttribute('aria-expanded', 'false')
    expect(setDoc).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Working Levels/ }))
    expect(screen.getByRole('textbox', { name: /Why are you adjusting/ })).toHaveValue('Reading comfortably')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(setDoc).toHaveBeenCalledWith(
      { id: 'c1' }, expect.objectContaining({ childId: 'c1', workingLevels: { phonics: expect.objectContaining({ level: 5, source: 'manual', evidence: 'Reading comfortably' }) } }),
    ))
  })

  it('closes sections and clears the previous child’s editor when the child changes', async () => {
    const view = render(<SkillSnapshotPage />)
    fireEvent.click(screen.getByRole('button', { name: /Working Levels/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    fireEvent.change(screen.getByRole('textbox', { name: /Why are you adjusting/ }), { target: { value: 'Lincoln note' } })
    activeChild.mockReturnValue({ id: 'c2', name: 'London' })
    view.rerender(<SkillSnapshotPage />)
    expect(screen.getByRole('heading', { name: /London.*Skill Snapshot/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Working Levels.*Phonics: Level 2/ })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: /Working Levels/ }))
    expect(screen.queryByRole('textbox', { name: /Why are you adjusting/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(screen.getByRole('textbox', { name: /Why are you adjusting/ })).toHaveValue('')
    expect(setDoc).not.toHaveBeenCalled()
  })
})
