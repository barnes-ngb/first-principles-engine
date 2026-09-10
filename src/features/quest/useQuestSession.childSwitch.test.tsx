import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-339 — a quest belongs to the child it was STARTED for.
 *
 * `endSession` and `resetToIntro` write `evaluationSessions`, `hours`,
 * `skillSnapshots`, `xpLedger`, `days` and `wordProgress`, and
 * `bankAnswerReward` writes a diamond and its XP as each correct answer
 * arrives. All of them read the active child, and a running quest survives a
 * change of it — so a session one boy answered could be filed, credited,
 * levelled and paid for as his brother's, on three propose-and-confirm rails at
 * once. See `questSessionOwner.ts` for why BIND rather than the census's other
 * four verdicts.
 *
 * `DOC-25` term 3: the unchanged hours arithmetic is asserted, not claimed —
 * 27 active minutes still round up to the next 5-minute bucket, and a session
 * with no active time still writes nothing. The POSITIVE CONTROL is the
 * attribution in each block: remove the owner binding and every `childId` below
 * comes back as `'london'`.
 */

const addDoc = vi.fn<(ref: unknown, data: unknown) => Promise<{ id: string }>>(
  async () => ({ id: 'new-doc' }),
)
const setDoc = vi.fn<(ref: unknown, data: unknown) => Promise<void>>(async () => {})
const addXpEvent = vi.fn(async () => {})
const addDiamondEvent = vi.fn(async () => {})

vi.mock('firebase/firestore', () => ({
  addDoc: (ref: unknown, data: unknown) => addDoc(ref, data),
  collection: vi.fn(() => ({})),
  doc: vi.fn((_c: unknown, id?: string) => ({ id })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  limit: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  setDoc: (ref: unknown, data: unknown) => setDoc(ref, data),
  updateDoc: vi.fn(async () => {}),
  where: vi.fn(() => ({})),
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  activityConfigsCollection: () => ({}),
  daysCollection: () => ({}),
  evaluationSessionsCollection: () => ({}),
  hoursCollection: () => ({}),
  learnerModelsCollection: () => ({}),
  sightWordProgressCollection: () => ({}),
  skillSnapshotsCollection: () => ({}),
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../../core/xp/addXpEvent', () => ({
  addXpEvent: (...a: unknown[]) => addXpEvent(...(a as [])),
}))
vi.mock('../../core/xp/addDiamondEvent', () => ({
  addDiamondEvent: (...a: unknown[]) => addDiamondEvent(...(a as [])),
}))
vi.mock('../../core/curriculum/updateSkillMapFromFindings', () => ({
  updateSkillMapFromFindings: vi.fn(async () => {}),
}))
vi.mock('../evaluate/skillSnapshotWrites', () => ({ writeSnapshotUpdate: vi.fn(async () => {}) }))
vi.mock('./questModelSync', () => ({ syncQuestResultsToModel: vi.fn(async () => {}) }))
vi.mock('../today/dayWriteGuard', () => ({ updateDayLogGuarded: vi.fn(async () => {}) }))
vi.mock('../../core/foundations/questTargeting', () => ({ selectQuestTargets: () => [] }))

/** The idle-aware timer, so the hours arithmetic below is driven, not guessed. */
let activeSeconds = 0
vi.mock('../../core/utils/sessionTimer', () => ({
  useSessionTimer: () => ({
    startTimer: vi.fn(),
    stop: () => activeSeconds,
    pause: vi.fn(),
    resume: vi.fn(),
    isActive: true,
    isPaused: false,
  }),
}))

const chat = vi.fn()
vi.mock('../../core/ai/useAI', async () => {
  const actual = await vi.importActual<typeof import('../../core/ai/useAI')>('../../core/ai/useAI')
  return {
    ...actual,
    useAI: () => ({ chat, analyzePatterns: vi.fn(), loading: false, error: null }),
  }
})

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

const LINCOLN = { id: 'lincoln', name: 'Lincoln' }
const LONDON = { id: 'london', name: 'London' }

function setActive(child: { id: string; name: string }) {
  mockUseActiveChild.mockReturnValue({
    activeChildId: child.id,
    activeChild: child,
    children: [LINCOLN, LONDON],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
    isLoading: false,
    addChild: vi.fn(),
  })
}

const QUESTION = JSON.stringify({
  prompt: 'Which word says /kat/?',
  options: ['cat', 'cot', 'cut'],
  correctAnswer: 'cat',
  level: 2,
  skill: 'phonics.cvc',
})

/** Start a quest, answer one question correctly, and hand back the hook. */
async function startAndAnswer(useQuestSession: typeof import('./useQuestSession').useQuestSession) {
  const view = renderHook(() => useQuestSession())
  await act(async () => {
    await view.result.current.startQuest('reading', 'phonics')
  })
  await waitFor(() => expect(view.result.current.currentQuestion).not.toBeNull())
  await act(async () => {
    await view.result.current.submitAnswer('cat')
  })
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
  activeSeconds = 0
  setActive(LINCOLN)
  chat.mockResolvedValue({ message: `<quest>${QUESTION}</quest>` })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('useQuestSession binds every write to the child the quest started for', () => {
  it('banks the answer reward for the owner, not the newly active child', async () => {
    const { useQuestSession } = await import('./useQuestSession')
    const view = renderHook(() => useQuestSession())

    await act(async () => {
      await view.result.current.startQuest('reading', 'phonics')
    })
    await waitFor(() => expect(view.result.current.currentQuestion).not.toBeNull())

    // The header moves mid-quest.
    setActive(LONDON)
    view.rerender()
    expect(view.result.current.sessionLeftItsChild).toBe(true)
    expect(view.result.current.sessionOwnerName).toBe('Lincoln')

    await act(async () => {
      await view.result.current.submitAnswer('cat')
    })

    // POSITIVE CONTROL — before the bind, both of these read 'london'.
    expect(addDiamondEvent).toHaveBeenCalledWith(
      expect.objectContaining({ childId: 'lincoln' }),
    )
    const [, xpChildId] = addXpEvent.mock.calls[0] as unknown as [string, string]
    expect(xpChildId).toBe('lincoln')
  })

  it('files the partial session and its hours against the owner', async () => {
    const { useQuestSession } = await import('./useQuestSession')
    const view = await startAndAnswer(useQuestSession)

    setActive(LONDON)
    view.rerender()

    // 27 active minutes.
    activeSeconds = 27 * 60
    await act(async () => {
      view.result.current.resetToIntro()
    })

    const session = setDoc.mock.calls
      .map((c) => c[1] as unknown as { childId?: string; status?: string })
      .find((d) => d.status === 'partial')
    expect(session?.childId).toBe('lincoln')

    const hours = addDoc.mock.calls
      .map((c) => c[1] as unknown as { childId?: string; minutes?: number; source?: string })
      .find((d) => d.source === 'knowledge-mine')
    // POSITIVE CONTROL — before the bind this row read 'london' in the
    // collection the compliance pack and `collectHoursContributions` read.
    expect(hours?.childId).toBe('lincoln')
    // `DOC-25` term 1, asserted: no hours math changed. 27 minutes still rounds
    // UP to the next 5-minute bucket.
    expect(hours?.minutes).toBe(30)
  })

  it('still writes no hours row for a session with no active time', async () => {
    const { useQuestSession } = await import('./useQuestSession')
    const view = await startAndAnswer(useQuestSession)

    activeSeconds = 0
    await act(async () => {
      view.result.current.resetToIntro()
    })

    // The `minutes >= 5` floor is untouched — the second half of the UX-327
    // precedent's assertion, and the control that makes the 30 above mean
    // something.
    const hours = addDoc.mock.calls
      .map((c) => c[1] as unknown as { source?: string })
      .filter((d) => d.source === 'knowledge-mine')
    expect(hours).toHaveLength(0)
  })

  it('follows the live child again once the session is over', async () => {
    const { useQuestSession } = await import('./useQuestSession')
    const view = await startAndAnswer(useQuestSession)

    setActive(LONDON)
    view.rerender()
    await act(async () => {
      view.result.current.resetToIntro()
    })

    // The bind lasts exactly as long as the session. With none running the hook
    // reports no owner, so the intro screen, the resume card and the
    // eligibility reads behave exactly as they did before.
    expect(view.result.current.sessionLeftItsChild).toBe(false)
    expect(view.result.current.sessionOwnerName).toBe('')

    addDoc.mockClear()
    setDoc.mockClear()
    await act(async () => {
      await view.result.current.startQuest('reading', 'phonics')
    })
    await waitFor(() => expect(view.result.current.currentQuestion).not.toBeNull())
    expect(view.result.current.sessionOwnerName).toBe('London')
  })
})
