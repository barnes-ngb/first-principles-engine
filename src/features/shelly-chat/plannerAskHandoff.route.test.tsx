import { createRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-273 across the REAL route journey.
 *
 * The first candidate passed its unit tests and failed in a browser, for one
 * reason: every receiver test had the page already mounted, and the actual
 * journey unmounts it. So this suite drives the real `PlannerChatMessages` →
 * `PlannerBoundaryLink` → router → `ShellyChatPage` → `useShellyChatFlows`
 * composition, with only the service boundaries stubbed (Firebase, auth,
 * profile, identity, the AI hook). Nothing here imports a helper to assert what
 * the helper already says: the assertions are the composer's value, the
 * rendered notice, the Firestore mocks, and the arguments the AI service
 * received.
 */

// ── Service boundaries only ─────────────────────────────────────
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async () => ({ id: 'new-thread' })),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [] })),
  increment: vi.fn(() => 1),
  limit: vi.fn(() => ({})),
  onSnapshot: (_q: unknown, onNext: (snap: { docs: unknown[] }) => void) => {
    // Two docs: enough that the pre-seeded-thread auto-send (length === 1)
    // cannot fire, so "no model call on arrival" is a real assertion.
    // The same docs serve the thread-list and message listeners, so they carry
    // both shapes: a title for the list, a role/content for the transcript.
    onNext({
      docs: [
        {
          id: 't1',
          data: () => ({
            role: 'user',
            content: 'older thread talk',
            timestamp: '2026-10-01T00:00:00.000Z',
            title: 'Saved chat one',
            lastMessagePreview: 'older thread talk',
            updatedAt: '2026-10-01T00:00:00.000Z',
            chatContext: 'lincoln',
            archived: false,
          }),
        },
        {
          id: 't2',
          data: () => ({
            role: 'assistant',
            content: 'older answer',
            timestamp: '2026-10-01T00:01:00.000Z',
            title: 'Saved chat two',
            lastMessagePreview: 'older answer',
            updatedAt: '2026-10-01T00:01:00.000Z',
            chatContext: 'lincoln',
            archived: false,
          }),
        },
      ],
    })
    return () => {}
  },
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  updateDoc: vi.fn(async () => {}),
  where: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn(async () => {}) })),
}))

vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(async () => 'https://example.com/uploaded.jpg'),
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
vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => identity.familyId }))

const LINCOLN = { id: 'synthetic-a', name: 'Lincoln' }
const LONDON = { id: 'synthetic-b', name: 'London' }
const CHILDREN = [LINCOLN, LONDON]

/** Mutable synthetic identity — the shell's answers, changed between acts. */
const identity = {
  familyId: 'fam-1',
  profile: 'parents' as string | null,
  activeChildId: LINCOLN.id,
  isLoading: false,
}

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: identity.activeChildId,
    children: CHILDREN,
    isLoading: identity.isLoading,
  }),
}))
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: identity.profile }),
}))

interface ChatCall {
  familyId: string
  childId: string
  taskType: string
  messages: { role: string; content: string }[]
}
const chatCalls: ChatCall[] = []
vi.mock('../../core/ai/useAI', () => ({
  TaskType: { ShellyChat: 'shellyChat' },
  useAI: () => ({
    imageFailureRef: { current: null },
    chat: vi.fn(async (args: ChatCall) => {
      chatCalls.push(args)
      return { message: 'synthetic answer' }
    }),
    generateImage: vi.fn(async () => ({ url: '' })),
    lastErrorRef: { current: null },
  }),
}))

// Imported after the mocks and the consts they close over, matching
// ShellyChatPage.test.tsx — the module graph is evaluated in source order.
import { addDoc, updateDoc } from 'firebase/firestore'

import type { ChatMessage } from '../../core/types'
import { ChatMessageRole } from '../../core/types/enums'
import { getWeekRange } from '../../core/utils/time'
import PlannerChatMessages from '../planner-chat/PlannerChatMessages'
import { withDeclinedAskCleared } from '../planner-chat/plannerRequest'
import {
  clearPlannerAskHandoff,
  PLANNER_ASK_HANDOFF_STATE_KEY,
  stagePlannerAskHandoff,
  type PlannerAskHandoffSource,
} from '../planner-chat/plannerAskHandoff'
import { clearComposerCustody } from './composerCustody'
import ShellyChatPage from './ShellyChatPage'

const ASK = 'add TGTB Math Level 1, 30 minutes daily'
/** The live planning week, so the source-week check is exercised, not bypassed. */
const WEEK_START = getWeekRange(new Date()).start

const SOURCE: PlannerAskHandoffSource = {
  familyId: 'fam-1',
  childId: LINCOLN.id,
  childName: LINCOLN.name,
  weekStart: WEEK_START,
}

function declinedTranscript(ask = ASK): ChatMessage[] {
  const typed: ChatMessage[] = [
    { id: 'u1', role: ChatMessageRole.User, text: ask, typedByParent: true, createdAt: '2026-10-30T10:00:00.000Z' },
  ]
  return [
    ...withDeclinedAskCleared(typed, 'u1'),
    {
      id: 'a1',
      role: ChatMessageRole.Assistant,
      text: "I can't change curriculum from here.",
      boundaryJobId: 'curriculum',
      createdAt: '2026-10-30T10:00:01.000Z',
    },
  ]
}

/** The real source component, on its own route. */
function PlannerRoute({ ask }: { ask?: string }) {
  return (
    <PlannerChatMessages
      messages={declinedTranscript(ask)}
      messagesEndRef={createRef<HTMLDivElement>()}
      askHandoffSource={SOURCE}
    />
  )
}

function renderApp(entry = '/chat', ask?: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Link to="/planner">to-planner</Link>
      <Routes>
        <Route path="/chat" element={<ShellyChatPage />} />
        <Route path="/planner" element={<PlannerRoute ask={ask} />} />
      </Routes>
    </MemoryRouter>,
  )
}

const composer = () => screen.getByPlaceholderText('Ask AI…') as HTMLTextAreaElement
const goToPlanner = () => fireEvent.click(screen.getByText('to-planner'))
const tapRefusal = () => fireEvent.click(screen.getByRole('button', { name: /Open Ask AI/ }))
const sendButton = () => screen.getByRole('button', { name: 'Send message' })

beforeAll(() => {
  // jsdom has no object URLs; the upload path needs one for its preview strip.
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:preview', writable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, writable: true })
  }
})

beforeEach(() => {
  identity.familyId = 'fam-1'
  identity.profile = 'parents'
  identity.activeChildId = LINCOLN.id
  identity.isLoading = false
  chatCalls.length = 0
  clearPlannerAskHandoff()
  clearComposerCustody()
  vi.mocked(addDoc).mockClear()
  vi.mocked(updateDoc).mockClear()
})

afterEach(() => {
  clearPlannerAskHandoff()
  clearComposerCustody()
})

describe('the journey the browser run failed on', () => {
  it("preserves the destination's unsent draft across the route unmount", async () => {
    renderApp()
    fireEvent.change(composer(), { target: { value: 'Existing destination draft — preserve me' } })

    goToPlanner()
    tapRefusal()

    // Back on the real /chat route, freshly mounted.
    await screen.findByText(/You were already typing something/)
    expect(composer().value).toBe('Existing destination draft — preserve me')
    expect(screen.getByText(ASK)).toBeInTheDocument()
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(chatCalls).toHaveLength(0)
  })

  it('keeps her draft when she says keep, and only then replaces on an explicit tap', async () => {
    renderApp()
    fireEvent.change(composer(), { target: { value: 'mine' } })
    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)

    fireEvent.click(screen.getByRole('button', { name: /Keep what I was typing/ }))
    expect(composer().value).toBe('mine')

    fireEvent.click(screen.getByRole('button', { name: /Use the planner's question/ }))
    expect(composer().value).toContain(ASK)
    // Her displaced draft is retrievable for the rest of the visit.
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe('mine')
  })

  it('protects a staged attachment, not only text', async () => {
    const { container } = renderApp()
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'page.jpg', { type: 'image/jpeg' })] },
    })
    fireEvent.click(await screen.findByText('Attach to my message'))
    await screen.findByText(/Image attached/)
    fireEvent.change(composer(), { target: { value: 'what is this page?' } })

    goToPlanner()
    tapRefusal()

    await screen.findByText(/You were already typing something/)
    expect(composer().value).toBe('what is this page?')
    expect(screen.getByText(/1 image attached/)).toBeInTheDocument()
    expect(screen.getByText(/Image attached/)).toBeInTheDocument()
  })

  it('fills exactly once, with the context that will be sent, and writes nothing', async () => {
    renderApp()
    goToPlanner()
    tapRefusal()

    await screen.findByText(/From Plan My Week/)
    const draft = composer().value
    expect(draft).toContain(ASK)
    expect(draft).toContain('Lincoln')
    expect(screen.getByText(/unsent/i)).toBeInTheDocument()
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
    expect(chatCalls).toHaveLength(0)
  })
})

describe('explicit Send', () => {
  it('targets exactly the reviewed child and carries the disclosed context', async () => {
    renderApp()
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)

    fireEvent.click(sendButton())

    await waitFor(() => expect(chatCalls).toHaveLength(1))
    expect(chatCalls[0].childId).toBe(LINCOLN.id)
    expect(chatCalls[0].familyId).toBe('fam-1')
    // One message: a fresh conversation inherits no unrelated history.
    expect(chatCalls[0].messages).toHaveLength(1)
    expect(chatCalls[0].messages[0].content).toContain(ASK)
    expect(chatCalls[0].messages[0].content).toContain('Lincoln')
  })
})

describe('the question cannot be sent under another identity', () => {
  it('is withdrawn when the chat tab moves, and Send does nothing stale', async () => {
    renderApp()
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)

    fireEvent.click(screen.getByRole('tab', { name: 'London' }))

    expect(await screen.findByText(/another child's conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(sendButton()).toBeDisabled()
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })

  it('keeps the guard over EDITED incoming text and a dismissed notice', async () => {
    renderApp()
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)

    fireEvent.change(composer(), { target: { value: `${composer().value} and more phonics` } })
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText(/From Plan My Week/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'London' }))
    expect(await screen.findByText(/another child's conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
  })

  it('cannot be revived by going back to the tab it came from', async () => {
    renderApp()
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)

    fireEvent.click(screen.getByRole('tab', { name: 'London' }))
    await screen.findByText(/another child's conversation/)
    fireEvent.click(screen.getByRole('tab', { name: 'Lincoln' }))

    expect(composer().value).toBe('')
    expect(screen.queryByText(/is in the box below/)).not.toBeInTheDocument()
    fireEvent.click(sendButton())
    expect(chatCalls).toHaveLength(0)
  })

  it('is withdrawn when the shell changes child under it', async () => {
    renderApp()
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)

    identity.activeChildId = LONDON.id
    // Any re-render re-evaluates ownership; typing is the cheapest real one.
    fireEvent.change(composer(), { target: { value: `${composer().value} ` } })

    expect(await screen.findByText(/active child changed/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
  })

  it('is withdrawn when the profile stops being a parent', async () => {
    renderApp()
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)

    identity.profile = 'lincoln'
    fireEvent.change(composer(), { target: { value: `${composer().value} ` } })

    expect(await screen.findByText(/can't carry a planner question/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
  })
})

describe('a saved conversation is not joined silently', () => {
  /**
   * The planner's own link lands on a FRESH `/chat`, so arrival inside a saved
   * conversation is reached the two ways it is actually reachable: a navigation
   * that already carries `?thread=` (staged directly, since no link composes
   * that today), and — the journey a parent really takes — opening a saved
   * conversation while the question is still in the box.
   */
  function arriveInThread() {
    const payload = stagePlannerAskHandoff({ ...SOURCE, question: ASK, jobId: 'curriculum' })
    return render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/chat',
            search: '?thread=t1',
            state: { [PLANNER_ASK_HANDOFF_STATE_KEY]: payload?.generation },
          },
        ]}
      >
        <Routes>
          <Route path="/chat" element={<ShellyChatPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('asks first, writes nothing, and inherits no history on the fresh path', async () => {
    arriveInThread()
    expect(await screen.findByText(/saved conversation/)).toBeInTheDocument()
    expect(screen.getByText(/older thread talk/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(chatCalls).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /Ask in a new conversation/ }))
    expect(composer().value).toContain(ASK)
    expect(screen.queryByText(/older thread talk/)).not.toBeInTheDocument()
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()

    fireEvent.click(sendButton())
    await waitFor(() => expect(chatCalls).toHaveLength(1))
    expect(chatCalls[0].messages).toHaveLength(1)
    expect(chatCalls[0].childId).toBe(LINCOLN.id)
  })

  it('leaves the conversation alone when she says not now', async () => {
    arriveInThread()
    await screen.findByText(/saved conversation/)

    fireEvent.click(screen.getByRole('button', { name: /Not now/ }))
    expect(composer().value).toBe('')
    expect(screen.getByText(/still in Plan My Week/)).toBeInTheDocument()
    expect(screen.getByText(/older thread talk/)).toBeInTheDocument()
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(chatCalls).toHaveLength(0)
  })

  it('withdraws the question when she opens a saved conversation holding it', async () => {
    renderApp()
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)

    fireEvent.click(screen.getByText('Saved chat one'))

    expect(await screen.findByText(/wasn't added to this conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })
})

describe('the ordinary visit is unchanged', () => {
  it('fills nothing and says nothing when she walks in herself', async () => {
    renderApp()
    // No refusal tapped: the slot is never read, so there is nothing to say.
    await waitFor(() => expect(screen.getByText('Ask about Lincoln')).toBeInTheDocument())
    expect(composer().value).toBe('')
    expect(screen.queryByText(/Plan My Week/)).not.toBeInTheDocument()
  })

  it('still sends an ordinary question, unguarded', async () => {
    renderApp()
    fireEvent.change(composer(), { target: { value: 'how is reading going?' } })
    fireEvent.click(sendButton())
    await waitFor(() => expect(chatCalls).toHaveLength(1))
    expect(chatCalls[0].messages[0].content).toBe('how is reading going?')
  })

  it('reports an empty slot after a refresh rather than filling silently', async () => {
    // A reload loses page-session memory while the history entry still names a
    // hand-off — the Back/forward and refresh case.
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/chat', state: { [PLANNER_ASK_HANDOFF_STATE_KEY]: 99 } }]}
      >
        <Routes>
          <Route path="/chat" element={<ShellyChatPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(
      await screen.findByText(/didn't come across — it's still in Plan My Week/),
    ).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })
})
