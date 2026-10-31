import { createRef } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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
  // Holdable, like the upload below: the closeout's blocker is about the moment
  // a thread CREATION resolves, so a test has to be able to stand in it. Held
  // only when a test asks; every other test sees the immediate resolve it did.
  addDoc: vi.fn(async () => {
    if (inFlight.holdThread) {
      await new Promise<void>((resolve) => {
        inFlight.releaseThread = () => resolve()
      })
    }
    return { id: 'new-thread' }
  }),
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
  /** The thread document an explicit Attach creates for a fresh conversation. */
  holdThread: boolean
  /** The compression that runs BEFORE the thread creation in two handlers. */
  holdCompress: boolean
  /** The held upload ends in a throw, so its owner's catch runs. */
  failUpload: boolean
  releaseChat: ((value: { message: string }) => void) | null
  releaseUpload: (() => void) | null
  releaseThread: (() => void) | null
  releaseCompress: (() => void) | null
} = {
  holdChat: false,
  holdUpload: false,
  holdThread: false,
  holdCompress: false,
  failUpload: false,
  releaseChat: null,
  releaseUpload: null,
  releaseThread: null,
  releaseCompress: null,
}

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
  // Holdable too, for the same reason the thread creation is: compression is the
  // FIRST `await` in the analyze and reference-generate handlers, so a test that
  // wants to prove the claim was taken before it has to be able to stand inside
  // it. Held only when a test asks.
  compressIfNeeded: vi.fn(async (f: unknown) => {
    if (inFlight.holdCompress) {
      await new Promise<void>((resolve) => {
        inFlight.releaseCompress = () => resolve()
      })
    }
    return f
  }),
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
import { getPlanningWeekRange } from '../../core/utils/time'
import PlannerChatMessages from '../planner-chat/PlannerChatMessages'
import { withDeclinedAskCleared } from '../planner-chat/plannerRequest'
import {
  clearPlannerAskHandoff,
  PLANNER_ASK_HANDOFF_STATE_KEY,
  PLANNER_ASK_HANDOFF_TTL_MS,
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
/**
 * The live planning week, so the source-week check is exercised, not bypassed.
 *
 * The PLANNER's week, not the plain Sun–Sat one. `isPlanningWeekPast` reads the
 * Mon–Fri body, so `getWeekRange` names a week that is already past from Friday
 * evening on — on Sat Oct 31 every journey here refused with `week-passed`,
 * which is a fixture that stopped exercising the check rather than a product
 * failure. `getPlanningWeekRange` is the planner's own rolling default and is
 * never a past week on any day.
 */
const WEEK_START = getPlanningWeekRange(new Date()).start

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

/**
 * The query string, on screen, so "which conversation is she in?" is assertable
 * from the rendered page rather than from a mock. Only the search part, which is
 * empty on every ordinary journey here — a `?thread=` appearing in it is the
 * page opening a conversation, which is exactly what a stale operation must not
 * be able to do.
 */
function LocationProbe() {
  return <span data-testid="chat-search">{useLocation().search}</span>
}

function renderApp(entry = '/chat', ask?: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Link to="/planner">to-planner</Link>
      <LocationProbe />
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
  inFlight.holdThread = false
  inFlight.holdCompress = false
  inFlight.failUpload = false
  inFlight.releaseChat = null
  inFlight.releaseUpload = null
  inFlight.releaseThread = null
  inFlight.releaseCompress = null
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
  inFlight.holdThread = false
  inFlight.holdCompress = false
  inFlight.releaseChat?.(LATE_QUESTIONS)
  inFlight.releaseUpload?.()
  inFlight.releaseThread?.()
  inFlight.releaseCompress?.()
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

describe('a draft the question displaced is still hers', () => {
  /**
   * Round 1's P2, end to end, and the release review's correction to the first
   * repair of it.
   *
   * Her work was displaced by an explicit tap and the ONLY copy of it lived in
   * the notice's own state, so closing the notice — or sending, or leaving —
   * took her text, her photo and her image idea with it. The first repair kept
   * that draft by giving it the single custody slot, which then cost the OTHER
   * draft: the question as she had edited it, and anything she attached to it,
   * were dropped on the way out on the false premise that the planner could
   * give them back. The planner holds the original sentence and nothing else.
   * So both drafts are kept, each in its own home.
   */
  const MINE = 'mine — the one copy of this'

  async function displace() {
    renderApp()
    fireEvent.change(composer(), { target: { value: MINE } })
    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)
    fireEvent.click(screen.getByRole('button', { name: /Use the planner's question/ }))
    expect(composer().value).toContain(ASK)
    expect(screen.getByRole('button', { name: /Bring my own draft back/ })).toBeInTheDocument()
  }

  it('survives her closing the notice, and comes back on a tap', async () => {
    await displace()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))

    // The hand-off's note is gone, as a close should do. The one that says
    // where her own work is takes its place rather than going with it.
    expect(screen.queryByText(/From Plan My Week/)).not.toBeInTheDocument()
    expect(screen.getByText(/set aside, unsent/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe(MINE)
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
  })

  it('is not discarded by the Send that takes the question away', async () => {
    await displace()
    fireEvent.click(sendButton())
    await waitFor(() => expect(chatCalls).toHaveLength(1))

    // The question was sent — the composer is empty and the hand-off's note is
    // finished — and her own unsent work is exactly where she left it.
    expect(await screen.findByText(/set aside, unsent/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe(MINE)
    // The restore asked nothing and sent nothing: one call, hers.
    expect(chatCalls).toHaveLength(1)
    expect(chatCalls[0].messages[0].content).toContain(ASK)
  })

  it('keeps BOTH drafts across the route — her edits in the box, her original set aside', async () => {
    // The release review's repro. She displaces her own work, then edits the
    // question and leaves. Two drafts exist and neither is reproducible: the
    // planner holds the sentence she typed, not the words she changed in it and
    // not the photo or the image idea beside her original. The first repair
    // saved the displaced one and dropped the box; the one before it saved the
    // box and dropped the displaced one. Both come back now.
    const { container } = renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Generate image' }))
    fireEvent.change(await screen.findByPlaceholderText(IDEA_PLACEHOLDER), {
      target: { value: IDEA },
    })
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'raw.png', { type: 'image/png' })] },
    })
    await screen.findByText('Attach to my message')
    fireEvent.change(composer(), { target: { value: MINE } })

    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)
    // Tapped by text: her chooser and her image form are both open, so MUI has
    // `aria-hidden` over the notice behind them — the same shape the restored
    // chooser's tests already pin.
    fireEvent.click(screen.getByText(/Use the planner's question/))
    // Her work is set aside and the planner's question is in the box, where she
    // edits it — the edit the planner can still reproduce, unlike her draft.
    expect(composer().value).toContain(ASK)
    fireEvent.change(composer(), { target: { value: `${composer().value} and more phonics` } })

    goToPlanner()
    tapRefusal()

    // Back. The box has her EDIT of the question — the draft the old code
    // deleted on the way out — and the new question is offered against it.
    await screen.findByText(/You were already typing something/)
    expect(composer().value).toContain('and more phonics')
    expect(composer().value).toContain(ASK)

    // And her original is still set aside: one tap to see the offer, one to
    // take it, and it brings its photo and its image idea with it.
    fireEvent.click(screen.getByRole('button', { name: /Keep what I was typing/ }))
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByText(/Your own draft is set aside/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))

    expect(composer().value).toBe(MINE)
    expect(screen.getByText('Attach to my message')).toBeInTheDocument()
    expect(screen.getByAltText('Selected 1')).toBeInTheDocument()
    expect((screen.getByPlaceholderText(IDEA_PLACEHOLDER) as HTMLInputElement).value).toBe(IDEA)
    // The preview she is shown is one this page minted, so the restored chooser
    // is usable: a string carried from the instance that left is one its own
    // upload failure or cancel would revoke.
    const restoredPreview = screen.getByAltText('Selected 1').getAttribute('src')
    expect(objectUrls.revoked).not.toContain(restoredPreview)

    // And the journey back wrote nothing and asked nothing.
    expect(chatCalls).toHaveLength(0)
    expect(generateImageCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(uploadBytes)).not.toHaveBeenCalled()
    expect(batchSpy.commit).not.toHaveBeenCalled()
  })

  it('stops being offered when another child’s tab is in front of her', async () => {
    await displace()
    fireEvent.click(screen.getByRole('tab', { name: 'London' }))
    expect(await screen.findByText(/another child's conversation/)).toBeInTheDocument()

    // Shelly's Lincoln draft is not offered into London's composer — not now, and
    // not by coming back, exactly as the question's own authority cannot be
    // revived by returning to the tab it came from.
    expect(screen.queryByRole('button', { name: /Bring my own draft back/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText(/set aside, unsent/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Lincoln' }))
    expect(screen.queryByRole('button', { name: /Bring my own draft back/ })).not.toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })

  it('goes when she discards it, and then stays gone across the route', async () => {
    await displace()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    fireEvent.click(screen.getByRole('button', { name: /Discard it/ }))
    expect(screen.queryByText(/set aside, unsent/)).not.toBeInTheDocument()

    // The one explicit end of its life: not restored here, and not waiting in
    // the set-aside home to be handed back on the next visit either. The box
    // still travels — that is the other draft, and it is hers too.
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)
    expect(composer().value).toContain(ASK)
    expect(screen.queryByText(MINE)).not.toBeInTheDocument()
    expect(screen.queryByText(/set aside, unsent/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bring my own draft back/ })).not.toBeInTheDocument()
  })

  it('does not let the restore quietly eat the newer work in the box', async () => {
    // The release review's second point: restoring the old draft must not throw
    // away the current one. It trades places with it — the box's draft becomes
    // the set-aside one — so no tap in this feature destroys unsent work
    // without saying so.
    await displace()
    fireEvent.change(composer(), { target: { value: `${composer().value} and more phonics` } })
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe(MINE)

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByText(/The planner's question is set aside/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bring that draft back/ }))
    expect(composer().value).toContain('and more phonics')

    // Both drafts are still alive after two swaps, and the one not in the box
    // is still named and still one tap away.
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByText(/Your own draft is set aside/)).toBeInTheDocument()
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })
})

describe('a question restored across the route is still a GUARDED question', () => {
  /**
   * The release review's behavioural blocker, reproduced then closed.
   *
   * Shelly edits the Lincoln question, leaves for the planner, comes back to find
   * it restored verbatim — and the guard did not come back with it. The text
   * was ordinary typing, so a Send from London's tab wrote a thread with
   * `chatContext: 'london'` and called the model with London's `childId`,
   * carrying Lincoln's name, Lincoln's week and Lincoln's question. No error,
   * no notice: the wrong child's record, one tap from a screen the parent had
   * opened for the other one.
   *
   * The draft and its authority travel together now. Both of these assert the
   * SAME thing from the two directions the scope can move — the tab she sends
   * under, and the shell's active child — and the positive control below proves
   * the guard did not simply break Send.
   */
  const EDIT = ' and more phonics'

  /** Edit the arrived question, leave, and come back to it. */
  async function returnToTheEditedQuestion() {
    renderApp()
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)
    fireEvent.change(composer(), { target: { value: `${composer().value}${EDIT}` } })

    goToPlanner()
    tapRefusal()
    // Restored verbatim, which is the behaviour the repair keeps.
    await waitFor(() => expect(composer().value).toContain(EDIT))
    expect(composer().value).toContain(ASK)
    // No spy is reset here: nothing in this journey writes or calls the model,
    // so the zero the tests below assert is the run's own total.
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  }

  it('is withdrawn, not sent, when she moves to another child’s tab', async () => {
    await returnToTheEditedQuestion()

    fireEvent.click(screen.getByRole('tab', { name: 'London' }))

    // The guard came back with the draft, so this reads as a revocation: the
    // box is emptied and the note says where her question still is.
    expect(await screen.findByText(/another child's conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(sendButton()).toBeDisabled()

    fireEvent.click(sendButton())
    await waitFor(() => expect(screen.getByText(/another child's conversation/)).toBeInTheDocument())
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()

    // And going back to the tab it came from does not revive it.
    fireEvent.click(screen.getByRole('tab', { name: 'Lincoln' }))
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })

  it('is withdrawn, not sent, when the shell changes child under it', async () => {
    await returnToTheEditedQuestion()

    // The other half of the same blocker: the tab is untouched and the shell's
    // active child moves, which is what `activeChildId` is re-checked for.
    identity.activeChildId = LONDON.id
    fireEvent.change(composer(), { target: { value: `${composer().value} ` } })

    expect(await screen.findByText(/active child changed/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    fireEvent.click(sendButton())
    await waitFor(() => expect(screen.getByText(/active child changed/)).toBeInTheDocument())
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
  })

  it('positive control: the same restored draft sends normally in its own scope', async () => {
    // The guard is a guard, not a wall. Nothing moved, so her edited question
    // goes — to the child it was accepted for, with her words intact.
    await returnToTheEditedQuestion()

    fireEvent.click(sendButton())

    await waitFor(() => expect(chatCalls).toHaveLength(1))
    expect(chatCalls[0].childId).toBe(LINCOLN.id)
    expect(chatCalls[0].messages[0].content).toContain(ASK)
    expect(chatCalls[0].messages[0].content).toContain(EDIT.trim())
    expect(chatCalls[0].messages[0].content).toContain('Lincoln')
  })

  it('keeps the guard on a restored draft whose MEDIA she had attached to it', async () => {
    // The same journey with a photo on the question, so the media half of the
    // restore is covered by the guard rather than only the text.
    const { container } = renderApp()
    goToPlanner()
    tapRefusal()
    await screen.findByText(/From Plan My Week/)
    fireEvent.change(composer(), { target: { value: `${composer().value}${EDIT}` } })
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'raw.png', { type: 'image/png' })] },
    })
    await screen.findByText('Attach to my message')

    goToPlanner()
    tapRefusal()
    await waitFor(() => expect(composer().value).toContain(EDIT))
    // Her raw file came back in a chooser she can act on, as before.
    expect(screen.getByText('Attach to my message')).toBeInTheDocument()
    expect(screen.getByAltText('Selected 1')).toBeInTheDocument()

    // The chooser is modal, so the tab is reached as the real screen allows:
    // cancel the selection first, then switch.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByAltText('Selected 1')).not.toBeInTheDocument())
    fireEvent.click(await screen.findByRole('tab', { name: 'London' }))

    expect(await screen.findByText(/another child's conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(uploadBytes)).not.toHaveBeenCalled()
  })
})

describe('an offered draft is consumed only where it is placed', () => {
  /**
   * Round 1's other P2. The arrival took a cross-thread draft out of the
   * slot with `acceptOtherThread` on EVERY hand-off visit — before the hand-off
   * had been accepted and before the saved-conversation choice — so a refusal,
   * an expiry or a "not now" emptied the slot and left her only copy in a local
   * variable belonging to a function that had already returned.
   */
  const MINE = 'mine, and the only copy of it'

  /** Mount the chat on its own, with whatever router entry a case needs. */
  const mountChat = (entry: { pathname: string; search?: string; state?: unknown }) =>
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/chat" element={<ShellyChatPage />} />
        </Routes>
      </MemoryRouter>,
    )

  /**
   * Leave a draft in the slot under the SAVED conversation, then unmount.
   *
   * A later arrival at `/chat` — no `?thread` — is therefore a different
   * conversation of the same tab, which is the cross-thread case: offered, never
   * placed on sight.
   */
  function strandInTheSavedConversation() {
    fixture.listenerDocs = [savedThread({ role: 'assistant' })]
    const app = renderApp()
    fireEvent.click(screen.getByText('Saved chat one'))
    fireEvent.change(composer(), { target: { value: MINE } })
    // Its own unmount is the handover; nothing has been staged yet.
    app.unmount()
  }

  /** The same, in the FRESH conversation, for an arrival INTO a saved one. */
  function strandInTheFreshConversation() {
    const app = renderApp()
    fireEvent.change(composer(), { target: { value: MINE } })
    app.unmount()
  }

  /** Is it still in the slot? Asked by mounting the conversation that owns it. */
  async function expectItIsStillWaiting(search: string) {
    fixture.listenerDocs = [savedThread({ role: 'assistant' })]
    mountChat({ pathname: '/chat', search })
    await waitFor(() => expect(composer().value).toBe(MINE))
  }

  it('leaves it in the slot when the hand-off arrives too late to be read', async () => {
    strandInTheSavedConversation()
    // Staged outside the 2-minute TTL — the children read settling that slowly
    // is the gap the TTL exists for, and the reason this refusal has a line.
    const payload = stagePlannerAskHandoff(
      { ...SOURCE, question: ASK, jobId: 'curriculum' },
      Date.now() - PLANNER_ASK_HANDOFF_TTL_MS - 1,
    )
    const late = mountChat({
      pathname: '/chat',
      state: { [PLANNER_ASK_HANDOFF_STATE_KEY]: payload?.generation },
    })

    expect(await screen.findByText(/wasn't carried over/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    late.unmount()

    // The refused visit had nowhere to show her cross-conversation draft, so it
    // never touched it. The old order consumed it before deciding, and this
    // mount came back to an empty box.
    await expectItIsStillWaiting('?thread=t1')
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })

  it('leaves it in the slot when the question itself is refused', async () => {
    strandInTheSavedConversation()
    // A refusal that leaves the receiving identity — and therefore the owner of
    // her draft — completely unchanged: the planner's week has finished.
    const payload = stagePlannerAskHandoff({
      ...SOURCE,
      weekStart: '2026-10-11',
      question: ASK,
      jobId: 'curriculum',
    })
    const refused = mountChat({
      pathname: '/chat',
      state: { [PLANNER_ASK_HANDOFF_STATE_KEY]: payload?.generation },
    })

    expect(await screen.findByText(/planning week has finished/)).toBeInTheDocument()
    refused.unmount()

    await expectItIsStillWaiting('?thread=t1')
  })

  it('leaves it in the slot when she stays in the saved conversation', async () => {
    strandInTheFreshConversation()
    fixture.listenerDocs = [savedThread({ role: 'assistant' })]
    const choice = renderArrival('?thread=t1')
    await screen.findByText(/saved conversation/)

    fireEvent.click(screen.getByRole('button', { name: /Not now/ }))
    expect(screen.getByText(/still in Plan My Week/)).toBeInTheDocument()
    choice.unmount()

    // Hers was typed in the fresh conversation and that is where it still is.
    await expectItIsStillWaiting('')
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
  })

  it('places it ONCE when the new-conversation choice gives it somewhere to go', async () => {
    // Her draft and a raw file, typed in the fresh conversation, so "ask in a
    // new conversation" lands in the very conversation they belong to.
    const app = renderApp()
    fireEvent.change(composer(), { target: { value: MINE } })
    const fileInput = app.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'raw.png', { type: 'image/png' })] },
    })
    await screen.findByText('Attach to my message')
    expect(objectUrls.minted).toHaveLength(1)
    app.unmount()

    fixture.listenerDocs = [savedThread({ role: 'assistant' })]
    renderArrival('?thread=t1')
    await screen.findByText(/saved conversation/)
    // The peek mints nothing: a preview for work that is not placed is a URL
    // nothing would ever revoke.
    expect(objectUrls.minted).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /Ask in a new conversation/ }))

    // Offered as the collision it is — not overwritten, not merged, and not
    // consumed twice: one placement, one fresh view of the one preserved file.
    expect(await screen.findByText(/You were typing this in another conversation/)).toBeInTheDocument()
    expect(composer().value).toBe(MINE)
    expect(screen.getByText(ASK)).toBeInTheDocument()
    expect(screen.getByAltText('Selected 1')).toBeInTheDocument()
    expect(objectUrls.minted).toHaveLength(2)
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(uploadBytes)).not.toHaveBeenCalled()
  })

  it('never hands a draft to a tab it was not typed in, or consumes it there', async () => {
    strandInTheSavedConversation()
    // London's tab is a different owner, so the same conversation key is not
    // enough: Shelly's Lincoln draft is neither shown here nor taken away.
    identity.activeChildId = LONDON.id
    const stranger = mountChat({ pathname: '/chat', search: '?thread=t1' })
    await waitFor(() =>
      expect(
        within(screen.getByTestId('chat-transcript')).getByText(/older thread talk/),
      ).toBeInTheDocument(),
    )
    expect(composer().value).toBe('')
    stranger.unmount()

    identity.activeChildId = LINCOLN.id
    await expectItIsStillWaiting('?thread=t1')
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

describe('the conversation her own Attach creates for the question', () => {
  /**
   * The release closeout's blocker, reproduced then closed.
   *
   * The whole journey in the normal UI: her own draft displaced, the planner's
   * question edited in the box, the route left and returned — and then a NEW raw
   * photo and an explicit "Attach to my message". That tap's handler creates the
   * thread document a FRESH conversation has never had and sets it active, so
   * the guard saw its own conversation go from `null` to an id, read it as her
   * opening a different conversation, revoked — and cleared the edited question
   * behind a notice whose message had just been withdrawn. The photo arrived
   * attached to an empty box and her words were gone.
   *
   * The thread check is right and stays. What is added is provenance: the
   * operation takes a one-shot authority before its first `await`, and only the
   * id its own creation returned, landing while everything it captured is still
   * true, may move the guard's conversation.
   */
  const MINE = 'mine — the one copy of this'
  const EDIT = ' and more phonics'

  /**
   * Both drafts alive, the question edited and restored across the route, and a
   * raw photo chosen but not yet attached.
   */
  async function readyToAttach() {
    const app = renderApp()
    fireEvent.change(composer(), { target: { value: MINE } })
    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)
    fireEvent.click(screen.getByRole('button', { name: /Use the planner's question/ }))
    expect(composer().value).toContain(ASK)
    fireEvent.change(composer(), { target: { value: `${composer().value}${EDIT}` } })

    // Away and back: the edited question comes back under its own guard and her
    // original is still set aside, which is the state the blocker was found in.
    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)
    expect(composer().value).toContain(EDIT)
    fireEvent.click(screen.getByRole('button', { name: /Keep what I was typing/ }))

    const fileInput = app.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'raw.png', { type: 'image/png' })] },
    })
    await screen.findByText('Attach to my message')
    return app
  }

  /**
   * The chooser has not merely closed — it has LEFT.
   *
   * MUI keeps the dialog mounted through its exit transition and marks the rest
   * of the page `aria-hidden` while it is there, so a tab, Send or a notice's
   * close button is unreachable by role even though its text is on screen. Her
   * next tap in the real workflow happens after the dialog has gone, so the
   * tests wait for the same thing instead of reaching past it.
   */
  async function chooserHasLeft() {
    await waitFor(() => {
      expect(screen.queryByText('Attach to my message')).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  }

  /** Her explicit tap, run to completion. */
  async function attach() {
    fireEvent.click(screen.getByText('Attach to my message'))
    await screen.findByText(/Image attached/)
    await chooserHasLeft()
  }

  it('keeps the edited question, and mints the conversation under the same child', async () => {
    await readyToAttach()
    await attach()

    // The blocker: this came back empty.
    expect(composer().value).toContain(ASK)
    expect(composer().value).toContain(EDIT)
    expect(screen.queryByText(/wasn't added to this conversation/)).not.toBeInTheDocument()
    expect(screen.getByText(/Kept what you were typing/)).toBeInTheDocument()

    // One conversation, created by the existing handler for the tab she is on —
    // the same child, not a new scope, and the photo really did upload.
    expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(addDoc).mock.calls[0][1]).toMatchObject({
      chatContext: 'lincoln',
      messageCount: 0,
    })
    expect(vi.mocked(uploadBytes)).toHaveBeenCalledTimes(1)
    expect(chatCalls).toHaveLength(0)

    // And the way back to her own draft is still there, behind the notice's
    // close exactly as it is everywhere else.
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByText(/Your own draft is set aside/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bring my own draft back/ })).toBeInTheDocument()
  })

  it('still owns the right conversation after a swap to her draft and back', async () => {
    await readyToAttach()
    await attach()

    // Swap: her original comes back into the box and the edited question — with
    // the photo now on it — takes the set-aside home.
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe(MINE)

    // Swap back. The question is armed from the origin it travelled with, and
    // that origin now names the conversation her own Attach minted — so this is
    // a restore rather than a revocation, which is what the stamps are for.
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByText(/The planner's question is set aside/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bring that draft back/ }))
    expect(composer().value).toContain(ASK)
    expect(composer().value).toContain(EDIT)
    expect(screen.getByText('Image attached — type your question')).toBeInTheDocument()
    expect(screen.queryByText(/wasn't added to this conversation/)).not.toBeInTheDocument()

    // Both drafts are still alive after the two swaps.
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByText(/Your own draft is set aside/)).toBeInTheDocument()
    expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1)
  })

  it('positive control: Send goes to the reviewed child, in the minted conversation', async () => {
    // The guard is a guard, not a wall: nothing moved, so the question she
    // attached a photo to goes where it was accepted for.
    await readyToAttach()
    await attach()

    fireEvent.click(sendButton())

    await waitFor(() => expect(chatCalls).toHaveLength(1))
    expect(chatCalls[0].childId).toBe(LINCOLN.id)
    expect(chatCalls[0].messages[0].content).toContain(ASK)
    expect(chatCalls[0].messages[0].content).toContain(EDIT.trim())
    expect(chatCalls[0].messages[0].content).toContain('Lincoln')
    // No second conversation was created by the Send: it sent into the one the
    // Attach minted. Counted by the payload that only a thread document has, so
    // the message writes the Send does make are not mistaken for one.
    const threadCreations = vi
      .mocked(addDoc)
      .mock.calls.filter(
        (call) => typeof call[1] === 'object' && call[1] !== null && 'chatContext' in call[1],
      )
    expect(threadCreations).toHaveLength(1)
  })

  it('still blocks when she moves to another child’s tab afterwards', async () => {
    await readyToAttach()
    await attach()

    fireEvent.click(screen.getByRole('tab', { name: 'London' }))

    // Withdrawn and emptied, as before the mint — the one difference is WHICH
    // line it uses: a tab switch also leaves the minted conversation for a fresh
    // one, and the thread check is the first of the two to notice. Both say
    // where the question still is, and neither lets it go anywhere.
    expect(await screen.findByText(/wasn't added to this conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(sendButton()).toBeDisabled()
    fireEvent.click(sendButton())
    expect(chatCalls).toHaveLength(0)
    // And returning to the tab it came from does not revive it.
    fireEvent.click(screen.getByRole('tab', { name: 'Lincoln' }))
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
  })

  it('still blocks when the shell changes child afterwards', async () => {
    await readyToAttach()
    await attach()

    identity.activeChildId = LONDON.id
    fireEvent.change(composer(), { target: { value: `${composer().value} ` } })

    expect(await screen.findByText(/active child changed/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
  })

  it('still blocks when she leaves the minted conversation for a new one', async () => {
    // The conversation half, from the direction the mint created: the guard now
    // owns an id, and "New" is her moving off it. Advancing the stamp did not
    // turn the thread check off — it only told the check which conversation this
    // composer's work is in.
    await readyToAttach()
    await attach()

    fireEvent.click(screen.getByRole('button', { name: 'New' }))

    expect(await screen.findByText(/wasn't added to this conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1)
  })

  /** Tap Attach and stand in the moment its thread creation has not resolved. */
  async function attachWithTheMintHeld() {
    inFlight.holdThread = true
    fireEvent.click(screen.getByText('Attach to my message'))
    await waitFor(() => expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1))
    await chooserHasLeft()
  }

  /**
   * Let the held creation resolve into whoever is still listening.
   *
   * `expectUpload` is the point rather than a convenience: a claim the guard
   * REFUSES aborts the operation before a byte is uploaded, so a helper that
   * always waits for `uploadBytes` would be asserting the stale upload it is
   * supposed to prevent. The rejected cases wait for the continuation to run
   * out instead, and then assert that it uploaded nothing.
   */
  async function releaseTheMint({ expectUpload }: { expectUpload: boolean }) {
    const release = inFlight.releaseThread
    inFlight.releaseThread = null
    inFlight.holdThread = false
    await act(async () => {
      release?.()
      // Enough turns for the continuation to reach either its abort or its
      // first upload — it is all microtasks from the resolve onwards.
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })
    if (expectUpload) await waitFor(() => expect(vi.mocked(uploadBytes)).toHaveBeenCalled())
  }

  it('cannot re-arm a revoked question when the mint lands after a tab switch', async () => {
    // The authority was taken before the `await`, and by the time the id comes
    // back she is on another child's tab: the operation is no longer in the scope
    // it was started in, so its id is dropped and the revocation stands. A
    // version that simply allowed `null → id` would hand the guard a conversation
    // nobody is in — and re-arm a question that had already been withdrawn.
    await readyToAttach()
    await attachWithTheMintHeld()

    fireEvent.click(screen.getByRole('tab', { name: 'London' }))
    expect(await screen.findByText(/another child's conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')

    await releaseTheMint({ expectUpload: false })

    // The refusal ABORTS the operation it came back to, so the conversation
    // that id names is never opened and her photo never goes into it: the URL
    // stays on the tab she switched to and nothing was uploaded.
    expect(screen.getByTestId('chat-search').textContent).toBe('')
    expect(vi.mocked(uploadBytes)).not.toHaveBeenCalled()
    // One thread document, created by her own explicit tap before the switch —
    // and no second write of any kind afterwards.
    expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()

    // Nothing was put back, nothing was re-armed, and nothing was sent.
    expect(composer().value).toBe('')
    expect(screen.getByText(/another child's conversation/)).toBeInTheDocument()
    expect(sendButton()).toBeDisabled()
    expect(chatCalls).toHaveLength(0)
    fireEvent.click(screen.getByRole('tab', { name: 'Lincoln' }))
    expect(composer().value).toBe('')
    expect(chatCalls).toHaveLength(0)
  })

  it('does not open the stale conversation when she picks a saved one mid-mint', async () => {
    // The release review's blocker, in the shape it was reproduced in. The
    // refusal was silent: the guard returned early and said nothing, so the
    // handler that asked went on to make the id it had just minted the live
    // conversation, rewrite the URL to it, and upload her photo into it — a
    // conversation she had moved off while it was being created. The refusal is
    // now an answer, and the answer stops the operation dead.
    fixture.listenerDocs = [savedThread()]
    await readyToAttach()
    await attachWithTheMintHeld()

    fireEvent.click(screen.getByText('Saved chat one'))
    expect(await screen.findByText(/wasn't added to this conversation/)).toBeInTheDocument()

    await releaseTheMint({ expectUpload: false })

    // She is in the conversation she chose, and the stale one was never opened.
    expect(screen.getByTestId('chat-search').textContent).toBe('?thread=t1')
    await waitFor(() =>
      expect(
        within(screen.getByTestId('chat-transcript')).getByText(/older thread talk/),
      ).toBeInTheDocument(),
    )
    // Nothing was uploaded, nothing was sent, and the one thread document is the
    // one her own explicit tap created before she moved — no second write.
    expect(vi.mocked(uploadBytes)).not.toHaveBeenCalled()
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()

    // The question stays withdrawn — a refused claim re-arms nothing — and her
    // own set-aside draft is still there to come back to.
    expect(composer().value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByText(/Your own draft is set aside/)).toBeInTheDocument()
  })

  it('cannot reach the next visit’s draft when the mint lands after she leaves and returns', async () => {
    // The same lateness across the route. The operation holds the refs of the
    // instance the departure unmounted, and the draft in front of her now was
    // placed by a different visit — so the id addresses nothing.
    await readyToAttach()
    await attachWithTheMintHeld()

    goToPlanner()
    tapRefusal()
    // Restored, with the chooser wound back open: the raw files were never
    // cleared, because the upload that would have cleared them is still held.
    await screen.findByText(/You were already typing something/)
    expect(composer().value).toContain(EDIT)
    fireEvent.click(screen.getByText(/Keep what I was typing/))

    await releaseTheMint({ expectUpload: false })

    // This visit's words are untouched and its guard is its own: still the fresh
    // conversation, so nothing has been revoked.
    expect(composer().value).toContain(ASK)
    expect(composer().value).toContain(EDIT)
    expect(screen.queryByText(/wasn't added to this conversation/)).not.toBeInTheDocument()
    // And the departed visit's operation stopped at the refusal: this visit was
    // not dragged into the conversation that id names, and her photo — which
    // belongs to the chooser in front of her, unsent — was not uploaded into it.
    expect(screen.getByTestId('chat-search').textContent).toBe('')
    expect(vi.mocked(uploadBytes)).not.toHaveBeenCalled()
    expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1)

    // Positive control, through the chooser the restore gave her back: cancel the
    // selection she has already seen, then send. The dialog has to be gone
    // before Send is reachable by role — its own exit transition `aria-hidden`s
    // the page it is leaving, exactly as it does for her.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByAltText('Selected 1')).not.toBeInTheDocument())
    await chooserHasLeft()
    fireEvent.click(sendButton())
    await waitFor(() => expect(chatCalls).toHaveLength(1))
    expect(chatCalls[0].childId).toBe(LINCOLN.id)
    expect(chatCalls[0].messages[0].content).toContain(EDIT.trim())
  })
})

describe('the conversations her OTHER taps create for the question', () => {
  /**
   * External review round 2's P2, and the class behind it.
   *
   * "Attach to my message" was not the only handler that mints a conversation
   * while her unsent work stays in the box. Three siblings do the same thing and
   * none of them took the own-thread claim: "Analyze this image", "Use as
   * reference for image creation", and `handleGenerateImageDirect` — the funnel
   * behind every image door. So choosing "Use as reference" on a fresh
   * conversation created a thread, the guard read `null → id` as Shelly opening a
   * different conversation, and the edited question for Lincoln was cleared out
   * of the composer. Her parent is the only person who ever types in that box, so
   * what was lost was work that exists nowhere else.
   *
   * `handleSend` is deliberately absent from this block: it consumes the
   * submitted text BEFORE it mints, so there is no unsent draft for a claim to
   * protect, and the describe below pins that its behaviour did not change.
   */
  const MINE = 'mine — the one copy of this'
  const EDIT = ' and more phonics'

  /** Both drafts alive, the question edited, and a raw photo chosen. */
  async function readyWithAPhoto() {
    const app = renderApp()
    fireEvent.change(composer(), { target: { value: MINE } })
    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)
    fireEvent.click(screen.getByRole('button', { name: /Use the planner's question/ }))
    fireEvent.change(composer(), { target: { value: `${composer().value}${EDIT}` } })

    const fileInput = app.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'raw.png', { type: 'image/png' })] },
    })
    await screen.findByText('Attach to my message')
    return app
  }

  /** Both drafts alive and the question edited, with no file chosen. */
  async function readyToGenerate() {
    const app = renderApp()
    fireEvent.change(composer(), { target: { value: MINE } })
    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)
    fireEvent.click(screen.getByRole('button', { name: /Use the planner's question/ }))
    fireEvent.change(composer(), { target: { value: `${composer().value}${EDIT}` } })
    return app
  }

  /** The chooser has not merely closed — it has LEFT. See the Attach block. */
  async function chooserHasLeft() {
    await waitFor(() => {
      expect(screen.queryByText('Attach to my message')).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  }

  /** Let a held creation resolve into whoever is still listening. */
  async function releaseTheMint() {
    const release = inFlight.releaseThread
    inFlight.releaseThread = null
    inFlight.holdThread = false
    await act(async () => {
      release?.()
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })
  }

  it('keeps the edited question through a normal reference preparation', async () => {
    // The reported P2, head on. Reference preparation stages the image and opens
    // the refinement form; it asks for nothing and generates nothing.
    await readyWithAPhoto()
    fireEvent.click(screen.getByText('Use as reference for image creation'))
    await screen.findByText('Using as reference')
    await chooserHasLeft()

    // The defect: this came back empty.
    expect(composer().value).toContain(ASK)
    expect(composer().value).toContain(EDIT)
    expect(screen.queryByText(/wasn't added to this conversation/)).not.toBeInTheDocument()
    expect(screen.queryByText(/another child's conversation/)).not.toBeInTheDocument()

    // One conversation, on her parent's own tab, and the photo really uploaded —
    // but no model call and no generation, because preparing a reference is not
    // a request.
    expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(addDoc).mock.calls[0][1]).toMatchObject({
      chatContext: 'lincoln',
      messageCount: 0,
    })
    expect(vi.mocked(uploadBytes)).toHaveBeenCalledTimes(1)
    expect(chatCalls).toHaveLength(0)
    expect(generateImageCalls).toHaveLength(0)

    // And BOTH drafts are still recoverable: the question is in the box and her
    // own set-aside draft is behind the notice's close, exactly as after Attach.
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByText(/Your own draft is set aside/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe(MINE)
  })

  it('positive control: Send after a reference preparation is one request for Lincoln', async () => {
    await readyWithAPhoto()
    fireEvent.click(screen.getByText('Use as reference for image creation'))
    await screen.findByText('Using as reference')
    await chooserHasLeft()

    fireEvent.click(sendButton())

    await waitFor(() => expect(chatCalls).toHaveLength(1))
    expect(chatCalls[0].childId).toBe(LINCOLN.id)
    expect(chatCalls[0].messages[0].content).toContain(ASK)
    expect(chatCalls[0].messages[0].content).toContain(EDIT.trim())
    // It sent into the conversation the reference preparation minted: no second
    // thread document, counted by the payload only a thread document has.
    const threadCreations = vi
      .mocked(addDoc)
      .mock.calls.filter(
        (call) => typeof call[1] === 'object' && call[1] !== null && 'chatContext' in call[1],
      )
    expect(threadCreations).toHaveLength(1)
    expect(screen.getByTestId('chat-search').textContent).toBe('?thread=new-thread')
  })

  it('keeps the edited question through a normal analyze', async () => {
    await readyWithAPhoto()
    fireEvent.click(screen.getByText('Analyze this image'))

    // Analyze IS a request, and it keeps the one it already had: a single call,
    // for the child the question was accepted for.
    await waitFor(() => expect(chatCalls).toHaveLength(1))
    expect(chatCalls[0].childId).toBe(LINCOLN.id)
    await chooserHasLeft()

    expect(composer().value).toContain(ASK)
    expect(composer().value).toContain(EDIT)
    expect(screen.queryByText(/wasn't added to this conversation/)).not.toBeInTheDocument()
    expect(vi.mocked(uploadBytes)).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByText(/Your own draft is set aside/)).toBeInTheDocument()
  })

  it('keeps the edited question through a normal direct generation', async () => {
    await readyToGenerate()
    fireEvent.click(screen.getByRole('button', { name: 'Generate image' }))
    fireEvent.change(await screen.findByPlaceholderText(IDEA_PLACEHOLDER), {
      target: { value: IDEA },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Just generate' }))

    await waitFor(() => expect(generateImageCalls).toHaveLength(1))

    expect(composer().value).toContain(ASK)
    expect(composer().value).toContain(EDIT)
    expect(screen.queryByText(/wasn't added to this conversation/)).not.toBeInTheDocument()
    expect(chatCalls).toHaveLength(0)
  })

  it('aborts a reference preparation whose mint lands after a child switch', async () => {
    // The claim is taken at the TAP and refused when it lands in a scope nobody
    // is in: no conversation opened, no URL rewritten, no upload, and no
    // reference image staged into a composer that is no longer this tap's.
    await readyWithAPhoto()
    inFlight.holdThread = true
    fireEvent.click(screen.getByText('Use as reference for image creation'))
    await waitFor(() => expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1))
    await chooserHasLeft()

    fireEvent.click(screen.getByRole('tab', { name: 'London' }))
    expect(await screen.findByText(/another child's conversation/)).toBeInTheDocument()
    expect(composer().value).toBe('')

    await releaseTheMint()

    expect(screen.getByTestId('chat-search').textContent).toBe('')
    expect(vi.mocked(uploadBytes)).not.toHaveBeenCalled()
    expect(screen.queryByText('Using as reference')).not.toBeInTheDocument()
    expect(screen.queryByText('Create an Image')).not.toBeInTheDocument()
    expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
    expect(generateImageCalls).toHaveLength(0)
    expect(chatCalls).toHaveLength(0)
  })

  it('aborts an analyze whose mint lands after she picks a saved conversation', async () => {
    fixture.listenerDocs = [savedThread()]
    await readyWithAPhoto()
    inFlight.holdThread = true
    fireEvent.click(screen.getByText('Analyze this image'))
    await waitFor(() => expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1))
    await chooserHasLeft()

    fireEvent.click(screen.getByText('Saved chat one'))
    expect(await screen.findByText(/wasn't added to this conversation/)).toBeInTheDocument()

    await releaseTheMint()

    // She is in the conversation she chose; the stale one was never opened, no
    // byte was uploaded into it and — the part only analyze can get wrong — no
    // model call was made under it.
    expect(screen.getByTestId('chat-search').textContent).toBe('?thread=t1')
    expect(vi.mocked(uploadBytes)).not.toHaveBeenCalled()
    expect(chatCalls).toHaveLength(0)
    expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled()
  })

  it('aborts a direct generation whose mint lands after a route departure and return', async () => {
    await readyToGenerate()
    fireEvent.click(screen.getByRole('button', { name: 'Generate image' }))
    fireEvent.change(await screen.findByPlaceholderText(IDEA_PLACEHOLDER), {
      target: { value: IDEA },
    })
    inFlight.holdThread = true
    fireEvent.click(screen.getByRole('button', { name: 'Just generate' }))
    await waitFor(() => expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1))

    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)
    fireEvent.click(screen.getByText(/Keep what I was typing/))
    expect(composer().value).toContain(EDIT)

    await releaseTheMint()

    // The departed visit's generation stopped at the refusal: no paid call, so
    // nothing was accounted for, and THIS visit's words are untouched.
    expect(generateImageCalls).toHaveLength(0)
    expect(composer().value).toContain(ASK)
    expect(composer().value).toContain(EDIT)
    expect(screen.queryByText(/wasn't added to this conversation/)).not.toBeInTheDocument()
    expect(screen.getByTestId('chat-search').textContent).toBe('')
    expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1)
  })

  it('takes the claim BEFORE the compression, not just before the thread write', async () => {
    // The ordering this round turns on. Compression is the first `await` in both
    // upload handlers, so a claim taken after it would be taken from inside a
    // continuation: by then the tab has moved, the guard is already revoked, and
    // `beginOwnThreadMint` would answer `null` — no claim, no refusal, and the
    // handler would open the stale conversation and upload into it exactly as
    // before the fix. Held at the compression, so the capture point is what is
    // being measured and nothing else.
    fixture.listenerDocs = [savedThread()]
    await readyWithAPhoto()
    inFlight.holdCompress = true
    fireEvent.click(screen.getByText('Use as reference for image creation'))
    await waitFor(() => expect(screen.queryByText('Use as reference for image creation')).not.toBeInTheDocument())
    await chooserHasLeft()
    // Nothing has been created yet: the handler is still inside the compression.
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Saved chat one'))
    expect(await screen.findByText(/wasn't added to this conversation/)).toBeInTheDocument()

    const release = inFlight.releaseCompress
    inFlight.releaseCompress = null
    inFlight.holdCompress = false
    await act(async () => {
      release?.()
      for (let i = 0; i < 8; i++) await Promise.resolve()
    })

    // The creation happened — this handler always creates when it has no thread —
    // and the claim it took at the tap refused the id, so the operation stopped
    // there: she is still in the conversation she chose, nothing was uploaded,
    // and no reference was staged.
    expect(screen.getByTestId('chat-search').textContent).toBe('?thread=t1')
    expect(vi.mocked(uploadBytes)).not.toHaveBeenCalled()
    expect(screen.queryByText('Using as reference')).not.toBeInTheDocument()
    expect(chatCalls).toHaveLength(0)
    expect(generateImageCalls).toHaveLength(0)

    // Her own set-aside draft survived the abort and is still there to come back
    // to — a refused claim clears its own selection and nothing of hers.
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByText(/Your own draft is set aside/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe(MINE)
  })

  it('does not clear a NEWER selection when the refused tap cleans up', async () => {
    // The cleanup half. By the time the claim is refused the restored composer
    // holds a different chooser with previews of its own, and the departed tap's
    // `finally` must not clear them or revoke them — that would destroy the work
    // the refusal exists to protect.
    await readyWithAPhoto()
    inFlight.holdThread = true
    fireEvent.click(screen.getByText('Analyze this image'))
    await waitFor(() => expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1))
    await chooserHasLeft()

    // Away and back: the restore gives her the chooser with a preview this visit
    // owns, which is the newer work the stale tap must not touch.
    goToPlanner()
    tapRefusal()
    await screen.findByText(/You were already typing something/)
    fireEvent.click(screen.getByText(/Keep what I was typing/))
    const restoredPreview = screen.getByAltText('Selected 1').getAttribute('src')
    expect(restoredPreview).toBeTruthy()

    await releaseTheMint()

    // Still selectable, still showing a live URL, and still hers to act on.
    expect(screen.getByAltText('Selected 1').getAttribute('src')).toBe(restoredPreview)
    expect(objectUrls.revoked).not.toContain(restoredPreview)
    expect(screen.getByText('Attach to my message')).toBeInTheDocument()
    expect(composer().value).toContain(EDIT)
    expect(vi.mocked(uploadBytes)).not.toHaveBeenCalled()
    expect(chatCalls).toHaveLength(0)
  })

  it('Send is unchanged: it consumes the question instead of claiming a thread', async () => {
    // Verified rather than converted. Send takes the submitted text out of the
    // box before it mints, so there is no unsent draft for a claim to protect —
    // and a claim here would be wrong, because the question has been SENT. What
    // must not happen is the sent text coming back, or going out twice.
    await readyToGenerate()
    fireEvent.click(sendButton())

    await waitFor(() => expect(chatCalls).toHaveLength(1))
    expect(chatCalls[0].childId).toBe(LINCOLN.id)
    expect(chatCalls[0].messages[0].content).toContain(ASK)
    expect(chatCalls[0].messages[0].content).toContain(EDIT.trim())

    // The box stays empty — nothing restored it and nothing duplicated it — and
    // the one request went into the one conversation the Send minted.
    expect(composer().value).toBe('')
    expect(screen.getByTestId('chat-search').textContent).toBe('?thread=new-thread')
    const threadCreations = vi
      .mocked(addDoc)
      .mock.calls.filter(
        (call) => typeof call[1] === 'object' && call[1] !== null && 'chatContext' in call[1],
      )
    expect(threadCreations).toHaveLength(1)
    expect(screen.queryByText(/wasn't added to this conversation/)).not.toBeInTheDocument()

    // Her own set-aside draft outlives the Send, which is the rule this feature
    // already had: the offer replaces the question's note rather than going with
    // it.
    expect(await screen.findByText(/Your own draft is set aside/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bring my own draft back/ }))
    expect(composer().value).toBe(MINE)
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
