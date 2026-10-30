import { createRef } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-273 across the REAL route journey.
 *
 * Real `PlannerChatMessages` → `PlannerBoundaryLink` → router →
 * `ShellyChatPage` → `useShellyChatFlows` → `usePlannerAskHandoff`. Only the
 * service boundaries are stubbed (Firebase SDK + the app's collection helpers,
 * auth, profile, identity, the AI hook) — every feature effect, including the
 * legacy migration and the pre-seeded auto-send, runs for real. Assertions are
 * the composer's value, the rendered notice, the Firestore mocks and the
 * arguments the AI service received.
 */

// ── Mutable fixture state (read by the mock factories at import time) ───────
const batchSpy = { update: vi.fn(), commit: vi.fn(async () => {}) }

interface DocLike {
  id: string
  data: () => Record<string, unknown>
  ref?: unknown
}
const fixture: { listenerDocs: DocLike[]; legacyThreads: DocLike[] } = {
  listenerDocs: [],
  legacyThreads: [],
}

const savedThread = (over: Record<string, unknown> = {}): DocLike => ({
  id: 't1',
  ref: { id: 't1' },
  data: () => ({
    role: 'user',
    content: 'older thread talk',
    timestamp: '2026-10-01T00:00:00.000Z',
    title: 'Saved chat one',
    lastMessagePreview: 'older thread talk',
    updatedAt: '2026-10-01T00:00:00.000Z',
    chatContext: 'lincoln',
    archived: false,
    ...over,
  }),
})

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async () => ({ id: 'new-thread' })),
  arrayRemove: vi.fn(() => ({})),
  arrayUnion: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  deleteDoc: vi.fn(async () => {}),
  doc: vi.fn(() => ({})),
  documentId: vi.fn(() => 'id'),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ docs: fixture.legacyThreads })),
  increment: vi.fn(() => 1),
  limit: vi.fn(() => ({})),
  onSnapshot: (_ref: unknown, onNext: (snap: unknown) => void) => {
    // Serves both query and document listeners.
    onNext({ docs: fixture.listenerDocs, exists: () => false, data: () => undefined, id: 'synthetic' })
    return () => {}
  },
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  runTransaction: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => 'now'),
  setDoc: vi.fn(async () => {}),
  startAfter: vi.fn(() => ({})),
  updateDoc: vi.fn(async () => {}),
  where: vi.fn(() => ({})),
  writeBatch: vi.fn(() => batchSpy),
}))

/**
 * The requests a test holds open, so a route change can interrupt one.
 *
 * Read only inside a mock's call, never in a factory body — like `fixture`
 * above, because a factory runs while the mocked module is imported, which is
 * before this module body initialises anything.
 */
const inFlight: {
  holdChat: boolean
  holdUpload: boolean
  /** The held upload ends in a throw, so its owner's catch runs. */
  failUpload: boolean
  releaseChat: ((value: { message: string }) => void) | null
  releaseUpload: (() => void) | null
} = { holdChat: false, holdUpload: false, failUpload: false, releaseChat: null, releaseUpload: null }

vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(async () => 'https://example.com/uploaded.jpg'),
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(async () => {
    if (inFlight.holdUpload) {
      await new Promise<void>((resolve) => {
        inFlight.releaseUpload = () => resolve()
      })
    }
    if (inFlight.failUpload) throw new Error('synthetic upload failure')
  }),
}))

// Every collection helper the chat's hook tree reaches, stubbed by NAME — the
// previous fixture omitted `activityConfigsCollection` and the suite failed for
// a reason that had nothing to do with the feature.
vi.mock('../../core/firebase/firestore', () => {
  const mod: Record<string, unknown> = { db: {}, stripUndefined: (v: unknown) => v }
  const collections = [
    'childrenCollection', 'weeksCollection', 'daysCollection', 'artifactsCollection',
    'hoursCollection', 'evaluationsCollection', 'hoursAdjustmentsCollection',
    'dailyPlansCollection', 'dadLabReportsCollection', 'conceptArcsCollection',
    'ladderProgressCollection', 'skillSnapshotsCollection', 'lessonCardsCollection',
    'helpCardsCollection', 'plannerConversationsCollection', 'workbookConfigsCollection',
    'activityConfigsCollection', 'weeklyReviewsCollection', 'monthlyReviewsCollection',
    'xpLedgerCollection', 'featureRequestsCollection', 'booksCollection',
    'stickerLibraryCollection', 'sightWordProgressCollection', 'aiUsageCollection',
    'avatarProfilesCollection', 'dailyArmorSessionsCollection', 'stonebridgeProgressCollection',
    'evaluationSessionsCollection', 'scansCollection', 'storyGamesCollection',
    'shellyChatThreadsCollection', 'shellyChatMessagesCollection', 'childSkillMapsCollection',
    'learnerModelsCollection', 'learnerReviewSessionsCollection', 'chapterResponsesCollection',
    'chapterBooksCollection', 'bookProgressCollection', 'businessLogCollection',
    'businessGoalsCollection', 'kitRostersCollection', 'catalogProductsCollection',
    'catalogOrdersCollection', 'artQuotaCollection', 'watchLibraryCollection',
    'nativeProgressObservationsCollection', 'programCompletionEventsCollection',
    'programCompletionStateCollection', 'nativeProgressCorrectionMarkersCollection',
    'errorLogsCollection',
  ]
  for (const name of collections) mod[name] = () => ({})
  const ids = [
    'dailyPlanDocId', 'ladderProgressDocId', 'plannerConversationDocId', 'workbookConfigDocId',
    'weeklyReviewDocId', 'monthlyReviewDocId', 'xpLedgerDocId', 'dailyArmorSessionDocId',
    'sightWordProgressDocId', 'bookProgressDocId', 'nativeProgressObservationDocId',
  ]
  for (const name of ids) mod[name] = () => 'synthetic-id'
  for (const name of ['conceptArcConverter', 'kitRosterConverter', 'catalogProductConverter', 'catalogOrderConverter']) {
    mod[name] = {}
  }
  mod.normalizePlanType = (v: unknown) => v
  mod.normalizeCurriculumKey = (v: unknown) => v
  mod.monthlyReviewDoc = () => ({})
  return mod
})

vi.mock('../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('../../core/utils/compressImage', () => ({
  compressIfNeeded: vi.fn(async (f: unknown) => f),
}))
vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => identity.familyId,
  useAuth: () => ({ familyId: identity.familyId }),
}))

const LINCOLN = { id: 'synthetic-a', name: 'Lincoln' }
const LONDON = { id: 'synthetic-b', name: 'London' }
const CHILDREN = [LINCOLN, LONDON]

/** The shell's answers, changed between acts. */
const identity = {
  familyId: 'fam-1',
  profile: 'parents' as string | null,
  activeChildId: LINCOLN.id,
  isLoading: false,
}

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: identity.activeChildId,
    activeChild: CHILDREN.find((c) => c.id === identity.activeChildId),
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
/** Counted outside the hook, because `useAI()` hands out a new spy per render. */
const generateImageCalls: unknown[] = []
vi.mock('../../core/ai/useAI', () => ({
  TaskType: { ShellyChat: 'shellyChat' },
  useAI: () => ({
    imageFailureRef: { current: null },
    chat: vi.fn(async (args: ChatCall) => {
      chatCalls.push(args)
      if (inFlight.holdChat) {
        return await new Promise<{ message: string }>((resolve) => {
          inFlight.releaseChat = (value) => resolve(value)
        })
      }
      return { message: 'synthetic answer' }
    }),
    generateImage: vi.fn(async (args: unknown) => {
      generateImageCalls.push(args)
      return { url: '' }
    }),
    lastErrorRef: { current: null },
  }),
}))

// Imported after the mocks and the consts their factories close over.
import { addDoc, updateDoc } from 'firebase/firestore'
import { getDownloadURL, uploadBytes } from 'firebase/storage'

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
/** The image idea she had typed but never generated from. */
const IDEA = 'a poster for our reading corner'
const IDEA_PLACEHOLDER = 'e.g., something for our reading corner'
/** The answer to the request she walked away from, arriving after the restore. */
const LATE_QUESTIONS = {
  message: JSON.stringify({ questions: [{ question: 'What style?', options: ['Cartoon'] }] }),
}
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

/** A direct arrival, for the cases no link composes today. */
function renderArrival(search = '') {
  const payload = stagePlannerAskHandoff({ ...SOURCE, question: ASK, jobId: 'curriculum' })
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/chat',
          search,
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

const composer = () => screen.getByPlaceholderText('Ask AI…') as HTMLTextAreaElement
const goToPlanner = () => fireEvent.click(screen.getByText('to-planner'))
const tapRefusal = () => fireEvent.click(screen.getByRole('button', { name: /Open Ask AI/ }))
const sendButton = () => screen.getByRole('button', { name: 'Send message' })

/**
 * Object-URL lifetimes, which jsdom has none of: a distinct string per call and
 * a note of what was revoked, so a preview's USABILITY is assertable here. A
 * revoked `blob:` is exactly the `naturalWidth === 0` the browser run read off
 * the restored chooser's retry.
 */
const objectUrls: { minted: string[]; revoked: string[] } = { minted: [], revoked: [] }
let objectUrlSeq = 0

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: () => {
      const url = `blob:preview-${(objectUrlSeq += 1)}`
      objectUrls.minted.push(url)
      return url
    },
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    value: (url: string) => void objectUrls.revoked.push(url),
  })
  // jsdom has no layout; the transcript's auto-scroll calls it.
  if (!Element.prototype.scrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => {}, writable: true })
  }
})

beforeEach(() => {
  identity.familyId = 'fam-1'
  identity.profile = 'parents'
  identity.activeChildId = LINCOLN.id
  identity.isLoading = false
  fixture.listenerDocs = []
  fixture.legacyThreads = []
  chatCalls.length = 0
  generateImageCalls.length = 0
  inFlight.holdChat = false
  inFlight.holdUpload = false
  inFlight.failUpload = false
  inFlight.releaseChat = null
  inFlight.releaseUpload = null
  objectUrls.minted.length = 0
  objectUrls.revoked.length = 0
  clearPlannerAskHandoff()
  clearComposerCustody()
  vi.mocked(addDoc).mockClear()
  vi.mocked(updateDoc).mockClear()
  vi.mocked(uploadBytes).mockClear()
  vi.mocked(getDownloadURL).mockClear()
  batchSpy.update.mockClear()
  batchSpy.commit.mockClear()
})

afterEach(() => {
  // Let a held request finish, so it cannot resolve into the next test — and
  // let it finish SUCCESSFULLY, since a throw nobody is awaiting any more is an
  // unhandled rejection charged to whichever test is running by then.
  inFlight.failUpload = false
  inFlight.releaseChat?.(LATE_QUESTIONS)
  inFlight.releaseUpload?.()
  clearPlannerAskHandoff()
  clearComposerCustody()
})

describe('the arrival keeps its notice and its ownership', () => {
  it('fills, says where it came from, and still says so after the flush', async () => {
    renderApp()
    goToPlanner()
    tapRefusal()

    const notice = await screen.findByText(/From Plan My Week/)
    expect(notice).toBeInTheDocument()
    const draft = composer().value
    expect(draft).toContain(ASK)
    expect(draft).toContain('Lincoln')
    // The defect: the notice vanished on the very next flush.
    await waitFor(() => expect(composer().value).toContain(ASK))
    expect(screen.getByText(/From Plan My Week/)).toBeInTheDocument()
    expect(screen.getByText(/unsent/i)).toBeInTheDocument()
    expect(sendButton()).not.toBeDisabled()
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
    expect(chatCalls).toHaveLength(0)
  })

  it('targets exactly the reviewed child on Send, with the disclosed context', async () => {
    renderApp()
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)

    fireEvent.click(sendButton())

    await waitFor(() => expect(chatCalls).toHaveLength(1))
    expect(chatCalls[0].childId).toBe(LINCOLN.id)
    expect(chatCalls[0].messages).toHaveLength(1)
    expect(chatCalls[0].messages[0].content).toContain(ASK)
    expect(chatCalls[0].messages[0].content).toContain('Lincoln')
  })
})

describe('the question cannot be sent under another identity', () => {
  async function arrive() {
    renderApp()
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)
  }

  it('is withdrawn when the chat tab moves, and Send does nothing stale', async () => {
    await arrive()
    fireEvent.click(screen.getByRole('tab', { name: 'London' }))

    expect(await screen.findByText(/another child's conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(sendButton()).toBeDisabled()
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })

  it('keeps the guard over EDITED text and a dismissed notice', async () => {
    await arrive()
    fireEvent.change(composer(), { target: { value: `${composer().value} and more phonics` } })
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText(/From Plan My Week/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'London' }))
    expect(await screen.findByText(/another child's conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
  })

  it('cannot be revived by returning to the tab it came from', async () => {
    await arrive()
    fireEvent.click(screen.getByRole('tab', { name: 'London' }))
    await screen.findByText(/another child's conversation/)
    fireEvent.click(screen.getByRole('tab', { name: 'Lincoln' }))

    expect(composer().value).toBe('')
    expect(screen.queryByText(/is in the box below/)).not.toBeInTheDocument()
    expect(chatCalls).toHaveLength(0)
  })

  it('is withdrawn when the shell changes child under it', async () => {
    await arrive()
    identity.activeChildId = LONDON.id
    fireEvent.change(composer(), { target: { value: `${composer().value} ` } })

    expect(await screen.findByText(/active child changed/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
  })

  it('is withdrawn when the profile stops being a parent', async () => {
    await arrive()
    identity.profile = 'lincoln'
    fireEvent.change(composer(), { target: { value: `${composer().value} ` } })

    expect(await screen.findByText(/can't carry a planner question/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
  })

  it('is withdrawn when she opens a saved conversation holding it', async () => {
    fixture.listenerDocs = [savedThread()]
    await arrive()
    fireEvent.click(screen.getByText('Saved chat one'))

    expect(await screen.findByText(/wasn't added to this conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })
})

describe('her own unsent work survives the route', () => {
  it('is restored and offered as a choice, not overwritten', async () => {
    renderApp()
    fireEvent.change(composer(), { target: { value: 'Existing destination draft — preserve me' } })

    goToPlanner()
    tapRefusal()

    await screen.findByText(/You were already typing something/)
    expect(composer().value).toBe('Existing destination draft — preserve me')
    expect(screen.getByText(ASK)).toBeInTheDocument()
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(chatCalls).toHaveLength(0)
  })

  it('keeps hers on keep, replaces only on an explicit tap, and gives hers back', async () => {
    renderApp()
    fireEvent.change(composer(), { target: { value: 'mine' } })
    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)

    fireEvent.click(screen.getByRole('button', { name: /Keep what I was typing/ }))
    expect(composer().value).toBe('mine')

    fireEvent.click(screen.getByRole('button', { name: /Use the planner's question/ }))
    expect(composer().value).toContain(ASK)

    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe('mine')
  })

  it('sets aside the edit she made WHILE the choice was on screen', async () => {
    // The ninth browser run's blocker. The choice is a live notice, not a modal:
    // the composer still holds her draft and she can keep typing in it. The
    // set-aside was taken from the snapshot made when the collision arrived, so
    // replacing and then bringing her draft back restored the ORIGINAL text and
    // her newer edit was gone.
    renderApp()
    fireEvent.change(composer(), { target: { value: 'mine' } })
    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)

    fireEvent.change(composer(), { target: { value: 'mine, and the newer edit' } })
    fireEvent.click(screen.getByRole('button', { name: /Use the planner's question/ }))
    expect(composer().value).toContain(ASK)

    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe('mine, and the newer edit')
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })

  it('does not resurrect a selection she cancelled WHILE the choice was on screen', async () => {
    // The same stale snapshot, read through the restored chooser. She cancels the
    // raw file — which removes it and revokes the preview this page minted — and
    // then takes the planner's question. The arrival snapshot still held the file,
    // so the set-aside brought the cancelled chooser back with a dead `blob:`
    // behind its thumbnail (`naturalWidth === 0` on the browser run).
    const { container } = renderApp()
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'raw.png', { type: 'image/png' })] },
    })
    await screen.findByText('Attach to my message')

    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)
    const restoredPreview = screen.getByAltText('Selected 1').getAttribute('src')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByAltText('Selected 1')).not.toBeInTheDocument())
    expect(objectUrls.revoked).toContain(restoredPreview)

    // The chooser's EXIT transition still has MUI's `aria-hidden` over the page
    // behind it, so the notice's buttons are out of the accessibility tree for a
    // moment after the selection has gone. Waited out, not reached past: a
    // `getByText` bypass would pass while the real screen was still unusable.
    fireEvent.click(await screen.findByRole('button', { name: /Use the planner's question/ }))
    expect(composer().value).toContain(ASK)

    // Nothing of hers was left to set aside, so there is nothing to bring back —
    // and the cancelled chooser stays cancelled either way.
    expect(screen.queryByRole('button', { name: /Bring my own draft back/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Attach to my message')).not.toBeInTheDocument()
    expect(screen.queryByAltText('Selected 1')).not.toBeInTheDocument()
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(uploadBytes)).not.toHaveBeenCalled()
  })

  it('keeps the edit she made to an OFFERED cross-thread draft while the choice was up', async () => {
    // A cross-thread draft is not merely offered — the arrival PLACES it in this
    // composer (`adoptRestoredUploadPreviews` then `applyDraft`) before the
    // choice is shown, so it is hers to edit and to cancel media in exactly like
    // the same-thread case above. The set-aside read the arrival snapshot for
    // this one case, which lost the edit and brought the cancelled file back.
    // An ANSWERED saved conversation: a thread whose only message is still hers
    // is a pre-seeded one, which an ordinary open auto-sends (pinned by its own
    // tests below). That send is not what this test is about, so give custody a
    // completed history to offer the draft from.
    fixture.listenerDocs = [savedThread({ role: 'assistant' })]
    const { container } = renderApp()
    // Typed inside a SAVED conversation, so the hand-off's fresh thread is a
    // different one and custody offers the draft rather than placing it on sight.
    fireEvent.click(screen.getByText('Saved chat one'))
    fireEvent.change(composer(), { target: { value: 'mine, from the saved chat' } })
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'raw.png', { type: 'image/png' })] },
    })
    await screen.findByText('Attach to my message')

    goToPlanner()
    tapRefusal()

    // The offer is in the box she is looking at, which is what makes it editable.
    // The other-thread wording is the assertion: it is what proves this fixture
    // really reached the cross-thread branch and not the same-thread one.
    await screen.findByText(/You were typing this in another conversation/)
    expect(composer().value).toBe('mine, from the saved chat')
    expect(screen.getByAltText('Selected 1')).toBeInTheDocument()

    // Both of her live actions, while the choice is still on screen.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByAltText('Selected 1')).not.toBeInTheDocument())
    // Same exit transition as the test above: wait for the real button.
    await screen.findByRole('button', { name: /Use the planner's question/ })
    fireEvent.change(composer(), { target: { value: 'mine, from the saved chat and edited' } })

    fireEvent.click(screen.getByRole('button', { name: /Use the planner's question/ }))
    expect(composer().value).toContain(ASK)

    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe('mine, from the saved chat and edited')
    // And the file she cancelled stays cancelled, here as everywhere.
    expect(screen.queryByText('Attach to my message')).not.toBeInTheDocument()
    expect(screen.queryByAltText('Selected 1')).not.toBeInTheDocument()
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(uploadBytes)).not.toHaveBeenCalled()
  })

  it('protects a staged attachment as well as the text', async () => {
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
    expect(screen.getByText(/with 1 image/)).toBeInTheDocument()
    expect(screen.getByText(/Image attached/)).toBeInTheDocument()
  })

  it('gives an interrupted refinement back as a form she can act on', async () => {
    // The third browser run's blocker. She typed an idea, tapped Next, and left
    // for the planner while the question request was still running. Custody does
    // not carry `loadingQuestions`, so the `questions` stage came back with no
    // questions: no idea input, no Next, no Generate — only the close button,
    // which discards the idea. Nothing on screen could repair it.
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Generate image' }))
    fireEvent.change(await screen.findByPlaceholderText(IDEA_PLACEHOLDER), {
      target: { value: IDEA },
    })
    inFlight.holdChat = true
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    // The one explicit call, held open, so the departure interrupts it.
    await waitFor(() => expect(screen.getByText(/Getting suggestions/)).toBeInTheDocument())
    expect(chatCalls).toHaveLength(1)

    goToPlanner()
    tapRefusal()

    await screen.findByText(/You were already typing something/)
    fireEvent.click(screen.getByRole('button', { name: /Keep what I was typing/ }))

    // Back at the idea stage, with her words verbatim and both exits live.
    const idea = screen.getByPlaceholderText(IDEA_PLACEHOLDER) as HTMLInputElement
    expect(idea.value).toBe(IDEA)
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Just generate' })).not.toBeDisabled()
    expect(screen.queryByText(/Getting suggestions/)).not.toBeInTheDocument()
    // The retry is hers to make: the restore asked nothing and generated nothing.
    expect(chatCalls).toHaveLength(1)
    expect(generateImageCalls).toHaveLength(0)

    // And the request she walked away from cannot come back and take the form
    // over, however well-formed its answer is: it finishes into the instance
    // that asked it, which the route change unmounted.
    const release = inFlight.releaseChat
    inFlight.releaseChat = null
    await act(async () => {
      release?.(LATE_QUESTIONS)
    })
    expect((screen.getByPlaceholderText(IDEA_PLACEHOLDER) as HTMLInputElement).value).toBe(IDEA)
    expect(screen.queryByText('What style?')).not.toBeInTheDocument()
    expect(chatCalls).toHaveLength(1)
    expect(generateImageCalls).toHaveLength(0)
  })

  it('gives an interrupted upload back in the chooser it was started from', async () => {
    // The same boundary's second case. She chose a file and tapped Attach; the
    // upload was still running when she left. The raw file and its preview came
    // back but `uploading` is not carried and the dialog was closed, so the
    // notice said "with 1 image" over a screen with no image, no chooser and no
    // way to attach it.
    const { container } = renderApp()
    inFlight.holdUpload = true
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'raw.png', { type: 'image/png' })] },
    })
    fireEvent.click(await screen.findByText('Attach to my message'))
    // In flight: the chooser closed on the tap and the upload is running.
    await waitFor(() => expect(vi.mocked(uploadBytes)).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('Attach to my message')).not.toBeInTheDocument())
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)

    goToPlanner()
    tapRefusal()

    // Tapped by text, not by role: the restored chooser is modal and MUI hides
    // the page behind it from the accessibility tree — the same shape the
    // selection test below already pins, since a chooser she had not left is
    // restored open too.
    await screen.findByText(/You were already typing something/)
    fireEvent.click(screen.getByText(/Keep what I was typing/))

    // The chooser is back with the selection in it, which is where the choice
    // for these files lives — retry or Cancel, both explicit.
    expect(screen.getByText('Attach to my message')).toBeInTheDocument()
    expect(screen.getByAltText('Selected 1')).toBeInTheDocument()
    expect(screen.getByText('Analyze this image')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    // Nothing was re-uploaded on her behalf.
    expect(vi.mocked(uploadBytes)).toHaveBeenCalledTimes(1)

    // The upload she walked away from finishing cannot attach itself to the
    // draft that came back: like the held question, it finishes into the
    // instance that started it.
    const release = inFlight.releaseUpload
    inFlight.releaseUpload = null
    await act(async () => {
      release?.()
    })
    await waitFor(() => expect(vi.mocked(getDownloadURL)).toHaveBeenCalled())
    expect(screen.getByText('Attach to my message')).toBeInTheDocument()
    expect(screen.queryByText(/Image attached/)).not.toBeInTheDocument()
    expect(vi.mocked(uploadBytes)).toHaveBeenCalledTimes(1)
  })

  it('gives back a selection she can still SEE after the old upload failed', async () => {
    // The eighth browser run's blocker, and the one case the test above cannot
    // reach: that upload was released successfully, this one FAILS. The failure
    // cleanup belongs to the departed instance and revokes the `blob:` URLs it
    // was showing — which custody had carried into the restored chooser, so the
    // retry attached a dead preview (cached it still looked right; reloaded it
    // was a blank 40×40). What comes back must be a view this page owns.
    const { container } = renderApp()
    inFlight.holdUpload = true
    inFlight.failUpload = true
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'raw.png', { type: 'image/png' })] },
    })
    const departedPreview = objectUrls.minted[0]
    fireEvent.click(await screen.findByText('Attach to my message'))
    await waitFor(() => expect(vi.mocked(uploadBytes)).toHaveBeenCalledTimes(1))

    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)
    fireEvent.click(screen.getByText(/Keep what I was typing/))

    // Now the upload she left behind fails, into the instance that started it.
    const release = inFlight.releaseUpload
    inFlight.releaseUpload = null
    await act(async () => {
      release?.()
    })
    expect(objectUrls.revoked).toContain(departedPreview)

    // The chooser is back, and showing a URL of its own — not the dead one.
    // Read as the attribute, which is the string the component put there; the
    // `src` property is resolved against the document's base URL.
    const selected = screen.getByAltText('Selected 1').getAttribute('src')
    expect(selected).not.toBe(departedPreview)
    expect(objectUrls.revoked).not.toContain(selected)

    // Her explicit retry, which is the only upload anything here starts.
    inFlight.holdUpload = false
    inFlight.failUpload = false
    fireEvent.click(screen.getByText('Attach to my message'))
    await screen.findByText(/Image attached/)

    // Asserted non-null first, because `not.toContain(null)` passes for a reason
    // that has nothing to do with the preview: a missing `src` is already the
    // defect this reads for.
    const attached = screen.getByAltText('Attached 1').getAttribute('src')
    expect(attached).toBeTruthy()
    expect(attached).not.toBe(departedPreview)
    expect(objectUrls.revoked).not.toContain(attached)
    // The attachment itself — the payload and the note over it — is unchanged.
    expect(vi.mocked(getDownloadURL)).toHaveBeenCalled()
    expect(screen.getByText('Image attached — type your question')).toBeInTheDocument()
    expect(vi.mocked(uploadBytes)).toHaveBeenCalledTimes(2)
    expect(chatCalls).toHaveLength(0)
    expect(generateImageCalls).toHaveLength(0)
  })

  it('revokes the preview it minted when she cancels the restored chooser', async () => {
    // The other half of owning it: a fresh URL is a resource, so the restored
    // chooser's own exits have to free it. Cancel is the one that frees it
    // without an upload behind it.
    const { container } = renderApp()
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'raw.png', { type: 'image/png' })] },
    })
    await screen.findByText('Attach to my message')

    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)
    fireEvent.click(screen.getByText(/Keep what I was typing/))

    const restoredPreview = screen.getByAltText('Selected 1').getAttribute('src')
    expect(objectUrls.revoked).not.toContain(restoredPreview)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByAltText('Selected 1')).not.toBeInTheDocument())
    expect(objectUrls.revoked).toContain(restoredPreview)
    // One live view at a time: the restore derived exactly one URL from the one
    // preserved file, so a repeated render or a second pass cannot pile them up.
    expect(objectUrls.minted).toHaveLength(2)
  })

  it('protects a raw file selection and an image idea she had not sent', async () => {
    const { container } = renderApp()
    // The chooser's dialog, with the raw file still selected.
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'raw.png', { type: 'image/png' })] },
    })
    await screen.findByText('Attach to my message')

    goToPlanner()
    tapRefusal()

    // The dialog and its selection came back, and the incoming question did not
    // silently take the box.
    expect(await screen.findByText(/You were already typing something/)).toBeInTheDocument()
    expect(screen.getByText('Attach to my message')).toBeInTheDocument()
  })
})

describe('a hand-off visit writes nothing on arrival', () => {
  it('does not run the legacy chatContext migration', async () => {
    renderApp()
    goToPlanner()
    // The legacy threads appear while Ask AI is unmounted, so the only mount
    // that could migrate them is the hand-off's.
    fixture.legacyThreads = [{ id: 'old', ref: { id: 'old' }, data: () => ({ archived: false }) }]
    batchSpy.update.mockClear()
    batchSpy.commit.mockClear()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)

    await waitFor(() => expect(composer().value).toContain(ASK))
    expect(batchSpy.update).not.toHaveBeenCalled()
    expect(batchSpy.commit).not.toHaveBeenCalled()
  })

  it('still runs that migration on an ordinary visit', async () => {
    fixture.legacyThreads = [{ id: 'old', ref: { id: 'old' }, data: () => ({ archived: false }) }]
    renderApp()
    await waitFor(() => expect(batchSpy.commit).toHaveBeenCalled())
  })

  it('does not auto-send into a saved one-message conversation', async () => {
    fixture.listenerDocs = [savedThread()]
    renderArrival('?thread=t1')

    expect(await screen.findByText(/saved conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    // The saved turn IS rendered, in the transcript — the positive control for
    // the scoped assertion the "new conversation" test below makes. A page-wide
    // query cannot tell this from the same sentence appearing as a sidebar
    // PREVIEW, and those are opposite answers.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('chat-transcript')).getByText(/older thread talk/),
      ).toBeInTheDocument(),
    )
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
  })

  it('does not auto-send when a saved conversation is opened AFTER arrival', async () => {
    // The independent run's second blocker. `handleSelectThread` calls
    // `setSearchParams`, which replaces the history entry and takes the
    // hand-off's router state with it — so a `handoffVisit` recomputed from
    // `location.state` flipped back to false here and the pre-seeded auto-send
    // effect called the model, writing an assistant turn into a conversation she
    // had only LOOKED at, under a notice reading "Nothing was sent."
    fixture.listenerDocs = [savedThread()]
    renderApp()
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)

    fireEvent.click(screen.getByText('Saved chat one'))

    expect(await screen.findByText(/wasn't added to this conversation/)).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(screen.getByTestId('chat-transcript')).getByText(/older thread talk/),
      ).toBeInTheDocument(),
    )
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
    expect(batchSpy.commit).not.toHaveBeenCalled()
  })

  it('still auto-sends a pre-seeded thread on an ordinary visit', async () => {
    // `openChatWithContext` deliberately pre-seeds one user message and expects
    // the answer; suppression must be the hand-off's alone.
    fixture.listenerDocs = [savedThread()]
    render(
      <MemoryRouter initialEntries={[{ pathname: '/chat', search: '?thread=t1' }]}>
        <Routes>
          <Route path="/chat" element={<ShellyChatPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(chatCalls).toHaveLength(1))
  })

  it('keeps the suppression through the new-conversation choice', async () => {
    fixture.listenerDocs = [savedThread()]
    renderArrival('?thread=t1')
    await screen.findByText(/saved conversation/)

    fireEvent.click(screen.getByRole('button', { name: /Ask in a new conversation/ }))
    expect(composer().value).toContain(ASK)
    // Scoped to the TRANSCRIPT. The old conversation's `lastMessagePreview`
    // still names that sentence under "Recent conversations", which is her
    // history and must stay; what must not happen is the saved TURN being in
    // the view she is about to send into. The first cut asked the whole page and
    // failed on the preview.
    const transcript = screen.queryByTestId('chat-transcript')
    expect(transcript && within(transcript).queryByText(/older thread talk/)).toBeFalsy()
    expect(screen.getByText('Ask about Lincoln')).toBeInTheDocument()
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()

    fireEvent.click(sendButton())
    await waitFor(() => expect(chatCalls).toHaveLength(1))
    expect(chatCalls[0].messages).toHaveLength(1)
    expect(chatCalls[0].childId).toBe(LINCOLN.id)
  })

  it('leaves the saved conversation alone on "not now"', async () => {
    fixture.listenerDocs = [savedThread()]
    renderArrival('?thread=t1')
    await screen.findByText(/saved conversation/)

    fireEvent.click(screen.getByRole('button', { name: /Not now/ }))
    expect(composer().value).toBe('')
    expect(screen.getByText(/still in Plan My Week/)).toBeInTheDocument()
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })
})

describe('the ordinary visit is unchanged', () => {
  it('fills nothing and says nothing when she walks in herself', async () => {
    renderApp()
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
