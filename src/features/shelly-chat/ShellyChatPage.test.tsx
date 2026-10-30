import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ── Firebase + app-service mocks ────────────────────────────────
// The page is a thin shell; useShellyChatFlows fires Firestore listeners on
// mount. Stub them so the smoke test exercises composition + render only.
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async () => ({ id: 'new-thread' })),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [] })),
  increment: vi.fn(() => 1),
  limit: vi.fn(() => ({})),
  onSnapshot: (_q: unknown, onNext: (snap: { docs: [] }) => void) => {
    onNext({ docs: [] })
    return () => {}
  },
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  updateDoc: vi.fn(async () => {}),
  where: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn(async () => {}) })),
}))

vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(async () => 'https://example.com/x.jpg'),
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(async () => {}),
}))

vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: vi.fn(() => ({})),
  db: {},
  shellyChatMessagesCollection: vi.fn(() => ({})),
  shellyChatThreadsCollection: vi.fn(() => ({})),
}))

vi.mock('../../core/firebase/storage', () => ({ storage: {} }))

vi.mock('../../core/utils/compressImage', () => ({
  compressIfNeeded: vi.fn(async (f: unknown) => f),
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

// Stable references — the real useActiveChild memoizes these; returning fresh
// arrays/objects each render would retrigger effects and loop.
const STABLE_CHILDREN: never[] = []
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({ activeChildId: '', children: STABLE_CHILDREN }),
}))

// The page reads the profile to gate the parent-only setActivityMinutes
// capability (FEAT-135). The smoke test renders outside ProfileProvider, so
// stub the hook — parent, matching the real /chat audience.
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: 'parents' }),
}))

vi.mock('../../core/ai/useAI', () => ({
  TaskType: { ShellyChat: 'shellyChat' },
  useAI: () => ({
    imageFailureRef: { current: null },
    chat: vi.fn(async () => ({ message: 'hi' })),
    generateImage: vi.fn(async () => ({ url: '' })),
    lastErrorRef: { current: null },
  }),
}))

import { addDoc, updateDoc } from 'firebase/firestore'

import ShellyChatPage from './ShellyChatPage'
import {
  clearPlannerAskHandoff,
  PLANNER_ASK_HANDOFF_STATE_KEY,
  stagePlannerAskHandoff,
} from '../planner-chat/plannerAskHandoff'

function renderPage() {
  return render(
    <MemoryRouter>
      <ShellyChatPage />
    </MemoryRouter>,
  )
}

const composer = () => screen.getByPlaceholderText('Ask AI…') as HTMLTextAreaElement

describe('ShellyChatPage (shell smoke test)', () => {
  it('renders the general empty state with greeting and starter prompts', () => {
    renderPage()
    // Default context is "general" when there is no active child.
    // UX-39: the General tab no longer greets the parent by Shelly's name — one
    // assistant name (the nav's "Ask AI"), and a greeting that says what the tab does.
    expect(screen.getByText('Ask me anything')).toBeInTheDocument()
    expect(screen.queryByText(/Hi Shelly/)).not.toBeInTheDocument()
    expect(screen.getByText('Weekly planning help')).toBeInTheDocument()
  })

  it('renders the context tabs and the composer controls', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: 'Lincoln' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'London' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ask AI\u2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
  })

  it('disables Send while the input is empty', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })
})

/**
 * UX-273 on the shell this file already mocks: a family with NO resolved child.
 *
 * The journeys live in `plannerAskHandoff.route.test.tsx`, which mounts a real
 * two-child identity and drives the route. What this shell is good for is the
 * fail-closed direction — nothing about the receiving end may fill a composer
 * when the app cannot say whose question it is.
 */
describe('a planner question arriving where no child is resolved', () => {
  afterEach(() => {
    clearPlannerAskHandoff()
    vi.mocked(addDoc).mockClear()
    vi.mocked(updateDoc).mockClear()
  })

  it('fills nothing, says why, and writes nothing', async () => {
    const payload = stagePlannerAskHandoff({
      familyId: 'fam-1',
      childId: 'child-lincoln',
      weekStart: '2099-01-04',
      question: 'add TGTB Math Level 1, 30 minutes daily',
      jobId: 'curriculum',
    })

    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/chat', state: { [PLANNER_ASK_HANDOFF_STATE_KEY]: payload?.generation } },
        ]}
      >
        <ShellyChatPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/still in Plan My Week/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
  })

  it('leaves the composer empty, and the slot unread, on an ordinary visit', () => {
    stagePlannerAskHandoff({
      familyId: 'fam-1',
      childId: 'child-lincoln',
      weekStart: '2099-01-04',
      question: 'add TGTB Math Level 1',
      jobId: 'curriculum',
    })
    renderPage()
    expect(composer().value).toBe('')
    expect(screen.queryByText(/Plan My Week/)).not.toBeInTheDocument()
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })
})
