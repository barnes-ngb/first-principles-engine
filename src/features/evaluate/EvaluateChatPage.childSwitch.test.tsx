import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * FIX-248 — a guided evaluation's answer belongs to the visit that asked for it.
 *
 * The reproducer is the ordinary one, with no developer tooling in it: hold
 * Lincoln's **Start** reply (or an ordinary **Send**), switch the shell chip to
 * London, let London's sessions land, then let the old completion arrive. Before
 * the repair, Lincoln's finding was published under London's name and written to
 * London's session document, skill snapshot and learner model with a
 * London-shaped fallback session id — `initializing` was set inside an async
 * effect body and nothing bound the turn to the visit that started it.
 *
 * The second case is the POSITIVE CONTROL: with the keyed visit boundary removed
 * (or the `isCurrent(lifetime)` check after the `chat` await deleted), Lincoln's
 * evidence is on screen under London and `syncEvalFindingsToModel` runs with
 * `london`, and the assertions below fail.
 *
 * The first case is the ordinary-path control: the same turn, with nobody
 * switching, must still show its finding and persist it under Lincoln.
 */

const CHILDREN = [
  { id: 'lincoln', name: 'Lincoln' },
  { id: 'london', name: 'London' },
]

const activeChildId = vi.fn<() => string>()

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    children: CHILDREN,
    activeChildId: activeChildId(),
    activeChild: CHILDREN.find((c) => c.id === activeChildId()),
    setActiveChildId: vi.fn(),
    isChildProfile: false,
    isLoading: false,
    loadFailed: false,
    retryLoad: vi.fn(),
    addChild: vi.fn(),
  }),
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

// ── The AI turn, held open on purpose ───────────────────────────

let releaseChat: (value: { message: string } | null) => void = () => {}
const chat = vi.fn(
  () =>
    new Promise<{ message: string } | null>((resolve) => {
      releaseChat = resolve
    }),
)
const analyzePatterns = vi.fn(async () => null)

vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ chat, analyzePatterns, loading: false, error: null }),
  TaskType: { Evaluate: 'evaluate' },
}))

// ── Firestore, as references we can read back ───────────────────

const setDoc = vi.fn(async (..._args: unknown[]) => {})
const addDoc = vi.fn(async (..._args: unknown[]) => ({ id: 'new' }))
const updateDoc = vi.fn(async (..._args: unknown[]) => {})

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
  setDoc: (...args: unknown[]) => setDoc(...args),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
  doc: (collection: { name: string }, id: string) => ({ collection: collection.name, id }),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  evaluationSessionsCollection: () => ({ name: 'evaluationSessions' }),
  hoursCollection: () => ({ name: 'hours' }),
  skillSnapshotsCollection: () => ({ name: 'skillSnapshots' }),
}))

const syncEvalFindingsToModel = vi.fn(async (..._args: unknown[]) => {})
vi.mock('./evalModelWriteback', () => ({
  syncEvalFindingsToModel: (...args: unknown[]) => syncEvalFindingsToModel(...args),
}))

vi.mock('../../core/curriculum/updateSkillMapFromFindings', () => ({
  updateSkillMapFromFindings: vi.fn(async () => {}),
}))
vi.mock('../../core/xp/addXpEvent', () => ({ addXpEvent: vi.fn(async () => {}) }))
vi.mock('../../core/xp/addDiamondEvent', () => ({ addDiamondEvent: vi.fn(async () => {}) }))
vi.mock('./FoundationsSection', () => ({ default: () => null }))

import EvaluateChatPage from './EvaluateChatPage'

/** One finished turn: a finding Lincoln's parent would recognise, plus <complete>. */
const LINCOLN_TURN = {
  message:
    'Nice work.\n' +
    '<finding>{"skill":"phonics.cvc.short-o","status":"emerging","evidence":"Lincoln read hop and mop, stalled on dog"}</finding>' +
    '<complete>{"summary":"Short-o is the frontier.","frontier":"Short-o CVC words","recommendations":[]}</complete>',
}

/** Every evaluation-session write this render performed. */
function sessionWrites() {
  return setDoc.mock.calls.filter(
    (call) => (call[0] as { collection?: string })?.collection === 'evaluationSessions',
  ) as unknown as Array<[{ id: string }, { childId: string }]>
}

beforeEach(() => {
  vi.clearAllMocks()
  activeChildId.mockReturnValue('lincoln')
  // jsdom implements no layout, so the transcript's auto-scroll needs a stub or
  // the commit that adds a message throws.
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

describe('EvaluateChatPage — an evaluation turn belongs to its own visit (FIX-248)', () => {
  it('ORDINARY PATH — the turn shows and persists under the child it was started for', async () => {
    const user = userEvent.setup()
    render(<EvaluateChatPage />)

    const start = await screen.findByRole('button', { name: /start reading assessment/i })
    await user.click(start)

    await act(async () => {
      releaseChat(LINCOLN_TURN)
    })

    await waitFor(() => expect(screen.getByText(/stalled on dog/i)).toBeInTheDocument())

    const writes = sessionWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0][1].childId).toBe('lincoln')
    expect(writes[0][0].id).toMatch(/^lincoln_reading_/)
  })

  it('POSITIVE CONTROL — a completion released after a switch writes nothing and shows nothing', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<EvaluateChatPage />)

    const start = await screen.findByRole('button', { name: /start reading assessment/i })
    await user.click(start)
    expect(chat).toHaveBeenCalledTimes(1)

    // The shell chip moves to London, and London's own (empty) history lands.
    activeChildId.mockReturnValue('london')
    rerender(<EvaluateChatPage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start reading assessment/i })).toBeEnabled(),
    )
    expect(screen.getByRole('heading', { name: /Evaluate London/ })).toBeInTheDocument()

    // Lincoln's answer arrives now.
    await act(async () => {
      releaseChat(LINCOLN_TURN)
    })

    // Nothing of Lincoln's turn reaches London's screen…
    expect(screen.queryByText(/stalled on dog/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Short-o is the frontier/i)).not.toBeInTheDocument()
    // …and nothing was written for anybody: no evaluation record, no hours, no
    // learner-model projection. The turn had admitted no write, so it is
    // discarded whole rather than re-aimed.
    expect(sessionWrites()).toHaveLength(0)
    expect(addDoc).not.toHaveBeenCalled()
    expect(syncEvalFindingsToModel).not.toHaveBeenCalled()
    expect(analyzePatterns).not.toHaveBeenCalled()
  })
})
