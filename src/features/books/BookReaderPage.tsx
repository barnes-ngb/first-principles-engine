import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { addDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import EditIcon from '@mui/icons-material/Edit'
import DownloadIcon from '@mui/icons-material/Download'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import StopIcon from '@mui/icons-material/Stop'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'

import Page from '../../components/Page'
import { EmptyState, LoadingState } from '../../components/states'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { ProfileContext } from '../../core/profile/context'
import { computeAge } from '../../core/profile/childIdentity'
import { artifactsCollection, hoursCollection } from '../../core/firebase/firestore'
import type { Book, BookPage } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { addDiamondEvent } from '../../core/xp/addDiamondEvent'
import { DIAMOND_EVENTS } from '../../core/types'
import { useBook } from './useBook'
import { practiceWordsUsedIn } from './storyPracticeWords'
import { stackOrder, imageGeometry } from './draggableImageUtils'
import { hasFitBackdrop, resolveImageFit } from './imageFit'
import ImageFitBackdrop from './ImageFitBackdrop'
import { makeBookPdf } from './makeBookPdf'
import PrintSettingsDialog from './PrintSettingsDialog'
import type { PrintSettings } from './PrintSettingsDialog'
import { TEXT_SIZE_STYLES, TEXT_FONT_FAMILIES } from './bookTypes'
import { renderInteractiveText } from './highlightSightWords'
import { useSightWordProgress } from './useSightWordProgress'
import { useComprehensionQuestions } from './useComprehensionQuestions'
import ComprehensionQuestions from './ComprehensionQuestions'
import AskMePanel from './AskMePanel'
import { buildReadingCompletionContent, buildReadingHoursNotes } from './readingLog.logic'
import {
  nextReaderSession,
  readerDocumentKey,
  readerIdentityKey,
  readerSessionAdmits,
  readerSessionCovers,
  readerSessionKey,
  readerSessionLabel,
  ReaderOwnership,
  resolveReaderSession,
  type ReaderQuestion,
  type ReaderSession,
} from './readerSession'
import { STORY_CALL_AUDIENCES } from './storyCallLabels'

// ── Reading session helpers ──────────────────────────────────────

/** Log reading time as compliance hours */
async function logReadingHours(
  familyId: string,
  childId: string,
  minutes: number,
  bookTitle: string,
  completed: boolean,
  pagesRead: number,
  totalPages: number,
  sightWordCount: number,
  audience?: string,
): Promise<void> {
  if (minutes < 1) return
  const date = new Date().toISOString().slice(0, 10)

  const notes = buildReadingHoursNotes(
    bookTitle,
    completed,
    pagesRead,
    totalPages,
    sightWordCount,
    audience,
  )

  await addDoc(hoursCollection(familyId), {
    childId,
    date,
    minutes,
    subjectBucket: SubjectBucket.LanguageArts,
    notes,
  })
}

/**
 * Create a portfolio artifact when a book is read to completion.
 *
 * `readerChildId` / `readerName` are the SESSION's captured reader (see
 * `readerSession.ts`) rather than the book's owner and the live header: the id
 * and the words are two halves of one claim, and they used to be able to name
 * different children on a sibling-owned contributor book.
 */
async function logReadingCompletion(
  familyId: string,
  book: Book,
  readerChildId: string,
  readerName: string,
  audience?: string,
): Promise<void> {
  const coverUrl = book.coverImageUrl ?? book.pages.find(p => p.images.length > 0)?.images[0]?.url

  await addDoc(artifactsCollection(familyId), {
    childId: readerChildId,
    title: `Read "${book.title}"`,
    type: coverUrl ? EvidenceType.Photo : EvidenceType.Note,
    content: buildReadingCompletionContent(book, readerName, audience),
    createdAt: new Date().toISOString(),
    tags: {
      engineStage: EngineStage.Share,
      domain: 'language-arts',
      subjectBucket: SubjectBucket.LanguageArts,
      location: 'Home',
    },
    ...(coverUrl ? { uri: coverUrl } : {}),
  })
}

const SWIPE_THRESHOLD = 50

/** Story Call audience chips — "Who did you read to?" (skippable). Labels: {@link STORY_CALL_AUDIENCES}. */
const AUDIENCE_OPTIONS = STORY_CALL_AUDIENCES

/**
 * The reader mounts `useBook` to READ a document, so it opts out of that hook's
 * editing-hours emission and of nothing else — the reading hours below stay the
 * only hours lane this screen has, and the book's cumulative `totalMinutes`
 * still accumulates (see `UseBookOptions.suppressEditingHours`).
 *
 * Module-level and frozen: it is a property of this screen, not of a render.
 */
const READER_BOOK_OPTIONS = { suppressEditingHours: true } as const

export default function BookReaderPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const {
    activeChild,
    isChildProfile,
    isLoading: identityLoading,
    loadFailed: identityLoadFailed,
  } = useActiveChild()
  const childName = activeChild?.name ?? ''
  const childId = activeChild?.id ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'
  // The RAW profile, read straight from context rather than through
  // `useProfile`, which throws without a provider — this is one optional string
  // used to describe a question boundary, and it must not become a new reason
  // for a mounted screen or a test harness to fail. It is never an answer to
  // WHO read: that stays `resolveReaderSession`'s, from the resolved child.
  const rawProfile = useContext(ProfileContext)?.profile ?? null
  // A failed children read keeps `isLoading` true on purpose (`useChildren`), so
  // "settled" means ANSWERED WITH CHILDREN and the failure is its own word.
  const identityFailed = identityLoadFailed === true
  const identitySettled = identityLoading !== true && !identityFailed

  // Story Call mode (?call=1): a screen-shared read-aloud to a far-away grandparent.
  // Presentation only — larger art/text, parent/utility chrome hidden, Ask-Me back
  // cover instead of the comprehension check. Completion / hours / XP run unchanged.
  const [searchParams] = useSearchParams()
  const isCallMode = searchParams.get('call') === '1'

  const { book, loading } = useBook(familyId, bookId, READER_BOOK_OPTIONS)
  const isSightWordBook = (book?.sightWords?.length ?? 0) > 0
  // The word lane and the hours lane share one committed boundary rather than
  // two: a CHILD session's scope key contains its reader (`readerSessionKey`),
  // so a committed locked-profile change ENDS the running session and starts a
  // replacement — which is why the live child here is always the running child
  // session's own reader, and a word tap and the reading record it sits beside
  // can no longer name different children. Before any reader is resolved this is
  // `''`, which is the same refusal the session makes. A parent's word ownership
  // is the legacy live child and is deferred with the rest of FEAT-95.
  const { progressMap, recordInteraction } = useSightWordProgress(
    familyId,
    childId,
  )

  // FEAT-183 / UX-152 (B4): the comprehension-questions AI gets the child's
  // REAL age, read off the identity profile the app already stores, not an
  // age inferred from his name. The name-keyed pair survives only as the
  // fallback for a doc with no birthdate — the same shape the three sibling
  // Books surfaces already use (`StoryGuidePage`, `BookGenerateChat`,
  // `BookReviewChat` each keep a local `ageFromBirthdate`; collapsing the
  // four copies into one helper is filed, not done here).
  const childAge = computeAge(activeChild?.birthdate) ?? (isLincoln ? 10 : 6)
  const {
    questions: comprehensionQuestions,
    loading: comprehensionLoading,
    error: comprehensionError,
    generateQuestions,
  } = useComprehensionQuestions(familyId, childId)

  const [currentPage, setCurrentPage] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [printing, setPrinting] = useState(false)
  const [showPrintSettings, setShowPrintSettings] = useState(false)
  const [printSkipNotice, setPrintSkipNotice] = useState<string | null>(null)
  const [totalWordsEncountered, setTotalWordsEncountered] = useState(0)
  /** Pages whose words this session has already recorded, stamped with it. */
  const seenPagesRef = useRef<{ sessionId: number; pages: Set<number> }>({
    sessionId: 0,
    pages: new Set(),
  })

  // TTS read-aloud state
  const [isReading, setIsReading] = useState(false)

  // Session tracking. `sessionStartRef` is the RUNNING session's start: the
  // mount for the first one, and the boundary for a replacement — never reset
  // because data settled.
  const sessionStartRef = useRef<number>(Date.now())
  /** Which pages the running session has seen, stamped with whose session. */
  const pagesViewedRef = useRef<{ sessionId: number; pages: Set<number> }>({
    sessionId: 0,
    pages: new Set(),
  })
  const completedRef = useRef(false)
  /** The last session finalised, so each is finalised exactly once. */
  const finalizedSessionRef = useRef(0)
  const callQuestionsRequestedRef = useRef(false)
  const completionWrittenRef = useRef(false)
  const audienceRef = useRef<string | undefined>(undefined)

  // Story Call audience ("Who did you read to?") — one tap, skippable, never blocks nav.
  const [selectedAudience, setSelectedAudience] = useState<string | null>(null)

  // Compute sight words for the "Words to Watch For" vocabulary page
  const sightWordsForPage = useMemo(() => {
    if (!book) return []
    // 1. Book's explicit sight words
    const bookWords = book.sightWords ?? []
    // 2. Child's working words that appear in this book's text — as WHOLE
    //    words (UX-134). A substring match put "a" on the page of every book,
    //    "in" on any book with "into" and "at" on any book with "cat", so a
    //    child with a long practice list got a "Words to Watch For" page full
    //    of words the book does not contain. `practiceWordsUsedIn` is the same
    //    check FEAT-169 wrote for the chat, for the same reason.
    const candidates = [...progressMap.values()]
      .filter((w) => w.masteryLevel === 'new' || w.masteryLevel === 'practicing')
      .map((w) => w.word)
    const workingWords = practiceWordsUsedIn(book.pages, candidates)
    // 3. Combined, deduplicated
    return [...new Set([...bookWords, ...workingWords])]
  }, [book, progressMap])

  const hasSightWordsPage = sightWordsForPage.length > 0

  // Total pages: cover + (optional sight words page) + content pages + back cover
  const totalPages = useMemo(
    () => (book ? book.pages.length + 2 + (hasSightWordsPage ? 1 : 0) : 0),
    [book, hasSightWordsPage],
  )

  // Content page offset: cover is 0, sight words page is 1 (if present), then content
  const contentPageOffset = hasSightWordsPage ? 2 : 1

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
  }, [])

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart === null) return
      setSwipeOffset(e.touches[0].clientX - touchStart)
    },
    [touchStart],
  )

  // ── One session per COMMITTED scope ───────────────────────────────────────
  //
  // `readerSession.ts` holds the rule and the reasons; what lives here is the
  // lifecycle. The session is STATE derived DURING RENDER — React's
  // derive-from-input path, the shape `useBookshelf` uses for shelf ownership —
  // because state is what the commit keeps: a render React throws away cannot
  // spend an incarnation, and the commit the screen belongs to keeps its reader,
  // its clock, its Share text and its exit records. A ref written during render
  // would not be part of the commit at all.
  // ── 1. The RAW question, which is knowable before anything resolves ───────
  //
  // This is what tells an ENDED session apart from one that has not started
  // yet. A committed move of family, route book or locked profile/child is KNOWN
  // at once, so it ends the running session THERE — letting the old clock run on
  // through an unresolved replacement would bill the first reader for time he
  // was not reading, and hiding the stale document while doing it makes that
  // worse rather than better. What the raw question may never do is NAME the new
  // reader; that stays `resolveReaderSession`'s answer, from the resolved child.
  const documentKey = readerDocumentKey(familyId, bookId)
  const identityKey = readerIdentityKey(isChildProfile === true, rawProfile, childId)
  // A raw profile or document move starts a new clock even before either reader
  // resolves. A child ID arriving for the same profile is identity resolution.
  const clockScopeKey = documentKey + '|' + readerIdentityKey(isChildProfile === true, rawProfile, '')
  const clockScopeRef = useRef(clockScopeKey)
  const [askedQuestion, setAskedQuestion] = useState<ReaderQuestion>(() => ({
    id: 1,
    documentKey,
    identityKey,
    staleBook: null,
  }))
  const documentMoved = askedQuestion.documentKey !== documentKey
  const questionMoved = documentMoved || askedQuestion.identityKey !== identityKey
  const question: ReaderQuestion = questionMoved
    ? {
        id: askedQuestion.id + 1,
        documentKey,
        identityKey,
        // The document still in hand at the moment the document question moved
        // belongs to the question that is LEAVING. An identity-only move changes
        // no document, so whatever was already proven stays proven.
        staleBook: documentMoved ? book : askedQuestion.staleBook,
      }
    : askedQuestion

  // ── 2. Provenance: is this document THIS question's? ──────────────────────
  //
  // `useBook` hands back the previous family's document for the one render
  // before its own load effect clears it, and the route's book id is unchanged
  // by a family move — so a matching id proves nothing. Identity by reference
  // does: the document that was in hand when the question moved is the one thing
  // this question's book cannot be.
  const documentProven = !!book && book !== question.staleBook

  // ── 3. The session, if this question has one yet ──────────────────────────
  const resolvedReader = useMemo(
    () =>
      resolveReaderSession({
        familyId,
        book,
        documentProven,
        isChildProfile: isChildProfile === true,
        activeChildId: childId,
        activeChildName: childName,
        identitySettled,
        identityFailed,
      }),
    [
      familyId,
      book,
      documentProven,
      isChildProfile,
      childId,
      childName,
      identitySettled,
      identityFailed,
    ],
  )
  const [committed, setCommitted] = useState<ReaderSession | null>(null)
  // Ids are monotonic across a PENDING GAP as well as across a replacement, so a
  // handler retained from an earlier incarnation can never match the live one —
  // `A → B → A` issues a third id even though the first and third scopes are the
  // same string.
  const [issuedSessions, setIssuedSessions] = useState(0)
  const resolvedKey = resolvedReader ? readerSessionKey(resolvedReader) : ''
  const stillRunning =
    !!committed &&
    committed.questionId === question.id &&
    !!resolvedReader &&
    committed.key === resolvedKey
  const session = stillRunning
    ? committed
    : resolvedReader
      ? nextReaderSession(issuedSessions, question.id, resolvedReader)
      : null

  if (questionMoved) setAskedQuestion(question)
  if (session !== committed) {
    setCommitted(session)
    if (session) setIssuedSessions(session.id)
  }
  if (questionMoved) {
    // A new question inherits none of the previous one's display state. The page
    // index goes back to the cover only when the DOCUMENT moved — a different
    // book is a different set of pages, and keeping the old index also let a
    // short replacement open on its own back cover and count as read.
    setTotalWordsEncountered(0)
    setSelectedAudience(null)
    if (documentMoved) setCurrentPage(0)
    // An IN-FLIGHT gesture is display state too, and it was the one piece that
    // outlived the boundary. A pending swipe is held as `touchStart` state, not
    // in the handler's closure, so the CURRENT surface's handler — which passes
    // `admits` because the replacement session really is live — still measured
    // its `touchend` against the finger-down of the reader who has LEFT. On the
    // phone that turned Lincoln's half-finished swipe on a content page into
    // London's advance to the back cover, and wrote a London Share artifact from
    // a gesture nobody made in his session. A gesture belongs to the question it
    // started under: dropping the pending one here means a replacement can only
    // complete a swipe its own reader began, while an ordinary swipe inside one
    // question, and a fresh swipe after the move, are untouched.
    setTouchStart(null)
    setSwipeOffset(0)
  }

  /**
   * The LIVE session, for handlers that are already on screen and tappable.
   *
   * Written in a layout effect and cleared in its cleanup, which is the shape
   * `useBookshelf` uses for the same problem: React runs a commit's teardowns
   * before its setups, so from the moment the session changes until this runs
   * again there is NO live session and every retained handler asks nothing. A
   * passive effect would leave a window in which the new commit is on screen,
   * its controls are usable, and the authority ref still names the session that
   * has left.
   */
  const liveSessionRef = useRef<ReaderSession | null>(null)
  useLayoutEffect(() => {
    liveSessionRef.current = session
    return () => {
      liveSessionRef.current = null
    }
  }, [session])

  /**
   * May a handler rendered under `incarnation` act now? Asked at the TAP.
   *
   * Stable, so every handler below can close over the session it was rendered
   * with and still be re-created only when that session changes.
   */
  const admits = useCallback(
    (incarnation: ReaderSession | null) =>
      readerSessionAdmits(liveSessionRef.current, incarnation),
    [],
  )

  /**
   * May the WORD lane write for this render's reader?
   *
   * The word hook is keyed to the live selected child, which moves the instant a
   * profile is switched — before, and independently of, any reader being
   * resolved. So a child-mode word tap is admitted only when the running session
   * is the one that owns that child: during a pending replacement there is no
   * session and nothing may be written for either boy. A parent's word lane is
   * the legacy live child and is deferred with the rest of FEAT-95.
   */
  const wordOwnerIsLive =
    !!session &&
    (session.ownership !== ReaderOwnership.ChildReader || session.readerChildId === childId)

  // ── Pagination is a record-producing action, so it is fenced too ───────────
  //
  // Reaching the back cover is what completes a read, so the page a handler
  // moves to decides whether a Share artifact exists. These are the handlers a
  // retained closure reaches: the dot indicators and the swipe. Each carries the
  // session it was rendered under and is refused when that session is no longer
  // the live one — or when no reader is resolved at all, which is a refusal to
  // record rather than a guess.
  const goToPage = useCallback(
    (index: number) => {
      if (!admits(session)) return
      setCurrentPage(index)
    },
    [admits, session],
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart === null) return
      const diff = e.changedTouches[0].clientX - touchStart
      if (Math.abs(diff) > SWIPE_THRESHOLD && admits(session)) {
        if (diff > 0 && currentPage > 0) setCurrentPage((p) => p - 1)
        if (diff < 0 && currentPage < totalPages - 1) setCurrentPage((p) => p + 1)
      }
      setTouchStart(null)
      setSwipeOffset(0)
    },
    [touchStart, currentPage, totalPages, admits, session],
  )

  /**
   * The running session's own snapshot — the family, the document and the facts
   * its records will be written from, stamped with WHOSE session they are.
   *
   * Updated only on a committed render whose document the session actually
   * covers, so a render already showing a REPLACEMENT book cannot overwrite what
   * the original session is finalised against. A latest-document ref is not a
   * session snapshot, which is exactly how a book or family move lost both
   * reads.
   */
  const snapshotRef = useRef<{
    sessionId: number
    book: Book | null
    totalPages: number
    legacyChildName: string
  }>({ sessionId: 0, book: null, totalPages: 0, legacyChildName: '' })
  useEffect(() => {
    if (!session || !readerSessionCovers(session, familyId, book)) return
    snapshotRef.current = {
      sessionId: session.id,
      book,
      totalPages,
      legacyChildName: childName,
    }
  }, [session, familyId, book, totalPages, childName])

  // Record sight word encounters when viewing a page. Stamped with the session,
  // so a replacement reader records the page he is actually looking at rather
  // than inheriting the pages his brother had already been credited with.
  useEffect(() => {
    if (!isSightWordBook || !book) return
    const sessionId = session?.id ?? 0
    if (seenPagesRef.current.sessionId !== sessionId) {
      seenPagesRef.current = { sessionId, pages: new Set() }
    }
    // Same authority as a word tap: no resolved reader, or a word hook keyed to
    // somebody the running session does not own, means nothing is recorded.
    if (!wordOwnerIsLive) return
    const contentPageIndex = currentPage - contentPageOffset
    if (contentPageIndex < 0 || contentPageIndex >= book.pages.length) return
    if (seenPagesRef.current.pages.has(contentPageIndex)) return
    seenPagesRef.current.pages.add(contentPageIndex)

    const page = book.pages[contentPageIndex]
    const wordsOnPage = page.sightWordsOnPage ?? []
    const uniqueWords = [...new Set(wordsOnPage.map(w => w.toLowerCase()))]
    setTotalWordsEncountered(prev => prev + uniqueWords.length)

    // Batch record 'seen' for each unique word on this page
    for (const word of uniqueWords) {
      void recordInteraction(word, 'seen')
    }
  }, [
    currentPage,
    isSightWordBook,
    book,
    recordInteraction,
    contentPageOffset,
    session,
    wordOwnerIsLive,
  ])

  // Track which pages THIS session has viewed, same stamping rule.
  useEffect(() => {
    const sessionId = session?.id ?? 0
    if (pagesViewedRef.current.sessionId !== sessionId) {
      pagesViewedRef.current = { sessionId, pages: new Set() }
    }
    pagesViewedRef.current.pages.add(currentPage)
  }, [currentPage, session])

  /**
   * Write the Share artifact for one session, exactly once.
   *
   * Stable (it reads only refs and its argument), so the lifecycle effect below
   * can depend on the session alone. The artifact's `childId` and the child
   * named in its words come from the SAME session — on a sibling-owned
   * contributor book they used to name different children.
   */
  const writeCompletionFor = useCallback((target: ReaderSession, audience?: string) => {
    if (completionWrittenRef.current) return
    const snapshot = snapshotRef.current
    // No committed snapshot for this session: nothing honest to describe yet.
    // Not lost — the caller asks again on the next committed render — and never
    // answered with another session's document or the book owner's id.
    if (snapshot.sessionId !== target.id || !snapshot.book) return
    completionWrittenRef.current = true
    void logReadingCompletion(
      target.familyId,
      snapshot.book,
      target.readerChildId,
      readerSessionLabel(target, snapshot.legacyChildName),
      audience,
    )
  }, [])

  /**
   * FINALISE one session: its Share artifact, its reading hours and its awards,
   * against its own snapshot — and hand the clock to whatever comes next.
   *
   * Called from the lifecycle effect's cleanup, which React runs both when a
   * replacement scope commits and on unmount, so a legitimate original session
   * is completed rather than dropped. Stable, and everything it reads is either
   * its argument or a ref stamped with that session's id, so a later session's
   * facts can never be written under an earlier one's name.
   *
   * The elapsed formula is untouched: `Math.round(ms / 60000)` and then the
   * rounded-minute floor, exactly the two lines that were here before.
   */
  const finalizeSession = useCallback((ending: ReaderSession | null) => {
    if (!ending) return
    if (finalizedSessionRef.current >= ending.id) return
    const snapshot = snapshotRef.current
    const endedAt = Date.now()
    const startedAt = sessionStartRef.current
    // Whatever happens, the NEXT session starts here: no minute is counted
    // twice, and none is lost to the gap while a replacement document loads.
    sessionStartRef.current = endedAt
    // A session that never had a committed snapshot of its own (an unresolved or
    // failed child read, a book that never landed) has nothing to say.
    if (snapshot.sessionId !== ending.id || !snapshot.book) return
    const endedBook = snapshot.book

    // Story Call: in call mode the completion write is deferred to here so it carries
    // the FINAL audience selection (un-stamped if no chip was tapped). Non-call already
    // wrote on back-cover reach, so this is a no-op there (completionWrittenRef guard).
    if (completedRef.current) writeCompletionFor(ending, audienceRef.current)

    const elapsed = Math.round((endedAt - startedAt) / 60000)
    if (elapsed < 1) return

    // Marked only once there is something to be once-only ABOUT. The app runs
    // under `StrictMode`, which tears an effect down and sets it up again on the
    // initial mount: a flag set before this line would be spent by that
    // rehearsal — at zero elapsed minutes, so nothing was written — and the real
    // end of the session would then find itself already finalised and write
    // nothing at all. The Share artifact has its own once-only flag, so the one
    // write above this line cannot double either.
    finalizedSessionRef.current = ending.id

    const pagesViewed = pagesViewedRef.current
    void logReadingHours(
      ending.familyId,
      ending.readerChildId,
      elapsed,
      endedBook.title,
      completedRef.current,
      pagesViewed.sessionId === ending.id ? pagesViewed.pages.size : 0,
      snapshot.totalPages,
      endedBook.sightWords?.length ?? 0,
      audienceRef.current,
    )

    // Award XP for reading session (once per book per day). The dedup key is
    // unchanged; the ledger's own doc id is `{childId}_{dedupKey}`, so pointing
    // the award at the reader keeps the per-child-per-book-per-day guard exactly
    // as it was — and lets each brother earn once for the same book.
    const date = new Date().toISOString().slice(0, 10)
    void addXpEvent(
      ending.familyId,
      ending.readerChildId,
      'BOOK_READ',
      15,
      `book_${endedBook.id ?? 'unknown'}_${date}`,
    ).catch((err) => console.error('[XP] Award failed:', err))

    // Award 3 diamonds for reading a book
    void addDiamondEvent({
      familyId: ending.familyId,
      childId: ending.readerChildId,
      amount: 3,
      type: DIAMOND_EVENTS.BOOK_READ,
      reason: `Read: ${endedBook.title ?? 'book'}`,
      dedupKey: `book_${endedBook.id ?? 'unknown'}_${date}-diamond`,
    }).catch((err) => console.error('[Diamond] Award failed:', err))
  }, [writeCompletionFor])

  // ── The lifecycle itself ──────────────────────────────────────────────────
  //
  // One effect per session. Its cleanup closes over the session it was set up
  // for — not a ref, so there is no window in which it could finalise the wrong
  // one — and React runs that cleanup exactly when the session ends: a
  // replacement scope committing, or unmount. Its setup then clears the state a
  // replacement may not inherit (completion, the audience stamp, the deferred
  // questions), after the outgoing session has been written from it.
  useEffect(() => {
    // The outgoing cleanup has already finalized its own time. Start the new
    // scope here even if both this session and the previous one were pending.
    if (clockScopeRef.current !== clockScopeKey) {
      clockScopeRef.current = clockScopeKey
      sessionStartRef.current = Date.now()
    }
    const running = session
    if (running) {
      completedRef.current = false
      completionWrittenRef.current = false
      audienceRef.current = undefined
      callQuestionsRequestedRef.current = false
    }
    return () => {
      finalizeSession(running)
    }
  }, [session, finalizeSession, clockScopeKey])

  // Detect book completion — reaching the last page (back cover).
  // Non-call mode writes the Share artifact immediately (unchanged behavior). Call mode
  // DEFERS the write until reader exit so it carries the FINAL audience selection — a
  // grandparent can correct a mis-tapped chip and both records (artifact + hours) agree.
  //
  // Declared AFTER the snapshot effect, so by the time this runs the running
  // session's snapshot is the committed one; and asking again on a later render
  // is how a read completed before its reader resolved still gets its artifact,
  // rather than being written to a guess at the time or dropped.
  useEffect(() => {
    if (!session) return
    // A replacement session may not inherit the completion the previous one
    // navigated to: if this session has only ever seen the back cover, it is
    // standing where its predecessor finished, not finishing a read of its own.
    const viewed = pagesViewedRef.current
    const standingOnTheEnd =
      viewed.sessionId === session.id &&
      viewed.pages.size === 1 &&
      viewed.pages.has(totalPages - 1)
    if (currentPage === totalPages - 1 && book && !standingOnTheEnd) completedRef.current = true
    if (completedRef.current && !isCallMode) writeCompletionFor(session)
  }, [currentPage, totalPages, book, isCallMode, session, writeCompletionFor])

  // Story Call audience chip → record the selection (mutable — re-tapping corrects it).
  // The write is deferred to exit so the last tap wins in BOTH the artifact and hours.
  // Fenced like the rest: the audience is part of two records, so a chip retained
  // from a session that has ended may not stamp the one now running.
  const handleAudience = useCallback(
    (audience: string) => {
      if (!admits(session)) return
      audienceRef.current = audience
      setSelectedAudience(audience)
    },
    [admits, session],
  )

  // Call mode: auto-generate the Ask-Me questions once the back cover is reached —
  // a grandparent reads them aloud, so there's no tap-to-generate affordance. Fires
  // once; on failure the panel falls back to static prompts (never blank on a call).
  useEffect(() => {
    if (!isCallMode || !book) return
    if (currentPage !== totalPages - 1) return
    if (callQuestionsRequestedRef.current) return
    callQuestionsRequestedRef.current = true
    void generateQuestions(book, childName, childAge)
  }, [isCallMode, currentPage, totalPages, book, childName, childAge, generateQuestions])

  // A word tap writes `sightWordProgress/{childId}_{word}` for whoever the word
  // hook is keyed to, so it is fenced on the SAME committed authority as the
  // reading and completion lanes: an obsolete tap writes nothing, and a tap
  // during a pending child replacement writes nothing for either boy — the
  // selector has already moved, and a selector is not a resolved reader.
  const handleWordTap = useCallback((word: string, action: 'help' | 'known') => {
    if (!admits(session) || !wordOwnerIsLive) return
    void recordInteraction(word, action)
  }, [recordInteraction, admits, session, wordOwnerIsLive])

  // ── TTS Read Aloud ─────────────────────────────────────────────
  const handleReadPage = useCallback(() => {
    if (typeof speechSynthesis === 'undefined') return
    speechSynthesis.cancel()

    if (isReading) {
      setIsReading(false)
      return
    }

    const contentIdx = currentPage - contentPageOffset
    if (!book || contentIdx < 0 || contentIdx >= book.pages.length) return
    const pageText = book.pages[contentIdx].text || ''
    if (!pageText.trim()) return

    const utterance = new SpeechSynthesisUtterance(pageText)
    utterance.rate = 0.85
    utterance.onend = () => setIsReading(false)
    utterance.onerror = () => setIsReading(false)
    setIsReading(true)
    speechSynthesis.speak(utterance)
  }, [isReading, currentPage, book, contentPageOffset])

  // Cancel TTS on page change
  useEffect(() => {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    setIsReading(false)
  }, [currentPage])

  // Cancel TTS on unmount
  useEffect(() => {
    return () => {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    }
  }, [])

  const handleDownloadPdf = useCallback(async (settings: PrintSettings) => {
    if (!book) return
    setShowPrintSettings(false)
    setPrinting(true)
    try {
      const notice = await makeBookPdf(book, {
        childName,
        isLincoln,
        sightWords: book.sightWords,
        settings,
      })
      if (notice) setPrintSkipNotice(notice)
    } finally {
      setPrinting(false)
    }
  }, [book, childName, isLincoln])

  if (loading) {
    return (
      <Page>
        <LoadingState fullHeight />
      </Page>
    )
  }

  if (!book) {
    return (
      <Page>
        <EmptyState
          title="Book not found."
          action={
            <Button onClick={() => navigate('/books')} startIcon={<ArrowBackIcon />}>
              My Books
            </Button>
          }
        />
      </Page>
    )
  }

  const contentPage: BookPage | null =
    currentPage >= contentPageOffset && currentPage < contentPageOffset + book.pages.length
      ? book.pages[currentPage - contentPageOffset]
      : null

  const getTextStyles = (page: BookPage) => {
    const sizeKey = page.textSize ?? 'medium'
    const fontKey = page.textFont ?? 'print'
    return {
      ...TEXT_SIZE_STYLES[sizeKey],
      fontFamily: TEXT_FONT_FAMILIES[fontKey],
    }
  }

  const bgColor = isLincoln ? '#1a1a2e' : '#faf5ef'
  const textColor = isLincoln ? '#e0e0e0' : '#3d3d3d'
  const accentColor = isLincoln ? '#4caf50' : '#e8a0bf'
  const titleFont = isLincoln
    ? '"Press Start 2P", monospace'
    : '"Fredoka", cursive'

  // Call mode enlarges the broadcast surface: bigger page text + wider content column.
  const callTextSx = isCallMode ? { fontSize: '1.9rem', lineHeight: 1.6 } : {}

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        bgcolor: bgColor,
        color: textColor,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 2, py: 1, flexShrink: 0 }}
      >
        <IconButton
          onClick={() => navigate('/books')}
          sx={{ color: textColor, minWidth: 44, minHeight: 44 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography
          variant="subtitle1"
          sx={{
            flex: 1,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: titleFont,
            fontSize: isLincoln ? '0.65rem' : '1rem',
          }}
        >
          {book.title}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
          {currentPage + 1}/{totalPages}
        </Typography>
      </Stack>

      {/* Page content area */}
      <Box
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        sx={{
          flex: 1,
          overflow: 'hidden',
          px: 2,
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: isCallMode ? 760 : 600,
            transform: `translateX(${swipeOffset * 0.3}px)`,
            transition: swipeOffset === 0 ? 'transform 0.3s ease' : 'none',
          }}
        >
          {/* Cover page */}
          {currentPage === 0 && (
            <Stack alignItems="center" spacing={3} sx={{ textAlign: 'center', py: 4 }}>
              {(book.coverImageUrl ?? book.pages.find((p) => p.images.length > 0)?.images[0]?.url) && (
                <Box
                  component="img"
                  src={book.coverImageUrl ?? book.pages.find((p) => p.images.length > 0)?.images[0]?.url}
                  sx={{
                    maxWidth: isCallMode ? '92%' : '80%',
                    maxHeight: isCallMode ? 420 : 300,
                    borderRadius: 3,
                    objectFit: 'contain',
                    boxShadow: 4,
                  }}
                />
              )}
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  fontFamily: titleFont,
                  fontSize: isLincoln
                    ? (isCallMode ? '1.1rem' : '0.9rem')
                    : (isCallMode ? '2.4rem' : '1.8rem'),
                }}
              >
                {book.title}
              </Typography>
              <Typography
                variant="h6"
                sx={{ color: 'text.secondary', fontFamily: titleFont, fontSize: isLincoln ? '0.6rem' : '1.1rem' }}
              >
                By {childName}
              </Typography>
            </Stack>
          )}

          {/* Sight words page */}
          {hasSightWordsPage && currentPage === 1 && (
            <Stack
              alignItems="center"
              spacing={3}
              sx={{ textAlign: 'center', py: 4, height: '100%', justifyContent: 'center' }}
            >
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '0.7rem' : '1.4rem',
                }}
              >
                {isLincoln ? '\u26CF\uFE0F Words to Mine' : '\u2728 Words to Watch For'}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center', px: 2 }}>
                {sightWordsForPage.map((word) => (
                  <Chip
                    key={word}
                    label={word}
                    onClick={() => {
                      if (typeof speechSynthesis !== 'undefined') {
                        const utterance = new SpeechSynthesisUtterance(word)
                        utterance.rate = 0.8
                        speechSynthesis.speak(utterance)
                      }
                    }}
                    sx={{
                      fontSize: '1.1rem',
                      py: 1,
                      px: 2,
                      fontWeight: 600,
                      bgcolor: isLincoln ? 'rgba(91,252,238,0.15)' : 'rgba(232,160,191,0.2)',
                      color: textColor,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: isLincoln ? 'rgba(91,252,238,0.3)' : 'rgba(232,160,191,0.4)' },
                    }}
                  />
                ))}
              </Box>
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', mt: 2 }}
              >
                Tap any word to hear it!
              </Typography>
            </Stack>
          )}

          {/* Content pages */}
          {contentPage && (
            <Stack spacing={2}>
              {/* Images — single unified stacking order (matches the editor) */}
              {contentPage.images.length > 0 && (
                <Box
                  sx={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '3 / 2',
                    borderRadius: 2,
                    overflow: 'hidden',
                    bgcolor: isLincoln ? 'rgba(255,255,255,0.05)' : 'grey.100',
                  }}
                >
                  {stackOrder(contentPage.images).map((img, stackIdx) => {
                    const pos = imageGeometry(img)
                    const transforms: string[] = []
                    if (pos.rotation) transforms.push(`rotate(${pos.rotation}deg)`)
                    if (pos.flipH) transforms.push('scaleX(-1)')
                    if (pos.flipV) transforms.push('scaleY(-1)')
                    // Two z slots per element — the element and, below it, its
                    // FEAT-177 blurred backdrop (matches the editor exactly).
                    const renderZ = (stackIdx + 1) * 2
                    const geometry = {
                      position: 'absolute' as const,
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      width: `${pos.width}%`,
                      height: `${pos.height}%`,
                      borderRadius: 1,
                      transformOrigin: 'center center',
                    }
                    return (
                      <Fragment key={img.id}>
                        {hasFitBackdrop(img) && (
                          <ImageFitBackdrop
                            url={img.url}
                            sx={{
                              ...geometry,
                              transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                              zIndex: renderZ - 1,
                            }}
                          />
                        )}
                        <Box
                          component="img"
                          src={img.url}
                          sx={{
                            ...geometry,
                            objectFit: resolveImageFit(img),
                            zIndex: renderZ,
                            transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                          }}
                        />
                      </Fragment>
                    )
                  })}
                </Box>
              )}

              {/* Text — all words tappable for TTS, sight words get colored chips */}
              {contentPage.text && (
                <Typography
                  component="div"
                  sx={{
                    px: 1,
                    ...getTextStyles(contentPage),
                    ...callTextSx,
                    color: textColor,
                  }}
                >
                  {renderInteractiveText(
                    contentPage.text,
                    book.sightWords ?? [],
                    handleWordTap,
                    progressMap,
                  )}
                </Typography>
              )}

              {/* Audio + Read Aloud */}
              <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1 }}>
                {contentPage.audioUrl && (
                  <>
                    <VolumeUpIcon sx={{ color: 'primary.main' }} />
                    <Box
                      component="audio"
                      controls
                      src={contentPage.audioUrl}
                      sx={{ flex: 1, height: 36 }}
                    />
                  </>
                )}
                {contentPage.text?.trim() && typeof speechSynthesis !== 'undefined' && (
                  <Tooltip title={isReading ? 'Stop reading' : 'Read aloud'}>
                    <IconButton
                      onClick={handleReadPage}
                      sx={{
                        color: isReading ? 'error.main' : accentColor,
                        minWidth: 44,
                        minHeight: 44,
                      }}
                    >
                      {isReading ? <StopIcon /> : <MenuBookIcon />}
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Stack>
          )}

          {/* Back cover */}
          {currentPage === totalPages - 1 && (
            <Stack alignItems="center" spacing={3} sx={{ textAlign: 'center', py: 6 }}>
              {isSightWordBook ? (
                <>
                  <Typography
                    variant="h5"
                    sx={{ fontFamily: titleFont, fontSize: isLincoln ? '0.7rem' : '1.4rem' }}
                  >
                    Great reading!
                  </Typography>
                  <Typography variant="h6" sx={{ color: 'primary.main' }}>
                    You practiced {totalWordsEncountered} sight words!
                  </Typography>
                </>
              ) : (
                <Typography
                  variant="h5"
                  sx={{ fontFamily: titleFont, fontSize: isLincoln ? '0.7rem' : '1.4rem' }}
                >
                  Made by {childName}
                </Typography>
              )}
              {completedRef.current && (
                <Chip
                  label={isLincoln ? '\u26CF\uFE0F Achievement: Reader!' : '\u{1F31F} Great reading!'}
                  color="success"
                  sx={{ mt: 2, fontWeight: 700 }}
                />
              )}
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {new Date(book.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: isLincoln ? 'text.disabled' : accentColor,
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '0.5rem' : '0.75rem',
                }}
              >
                First Principles Engine
              </Typography>

              {/* Back-cover panel: Ask-Me (call mode) or the comprehension check (default).
                  Call mode is a broadcast surface — questions only, no answers/scores. */}
              {isCallMode ? (
                <AskMePanel
                  childName={childName}
                  questions={comprehensionQuestions}
                  loading={comprehensionLoading}
                />
              ) : (
                <ComprehensionQuestions
                  questions={comprehensionQuestions}
                  loading={comprehensionLoading}
                  error={comprehensionError}
                  onGenerate={() => {
                    if (book) void generateQuestions(book, childName, childAge)
                  }}
                  isLincoln={isLincoln}
                />
              )}

              {/* Audience stamp (call mode) — one tap, skippable, never blocks nav. */}
              {isCallMode && (
                <Stack spacing={1.5} alignItems="center" sx={{ pt: 2, width: '100%' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.2rem' }}>
                    Who did you read to?
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={1}
                    flexWrap="wrap"
                    justifyContent="center"
                    useFlexGap
                  >
                    {AUDIENCE_OPTIONS.map((opt) => (
                      <Chip
                        key={opt}
                        label={opt}
                        onClick={() => handleAudience(opt)}
                        color={selectedAudience === opt ? 'success' : 'default'}
                        variant={selectedAudience === opt ? 'filled' : 'outlined'}
                        sx={{ fontSize: '1rem', height: 44, px: 1.5, borderRadius: 3 }}
                      />
                    ))}
                  </Stack>
                  {selectedAudience && (
                    <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
                      Read to {selectedAudience} 💚
                    </Typography>
                  )}
                </Stack>
              )}
            </Stack>
          )}
        </Box>
      </Box>

      {/* Sight word page count — hidden in call mode (utility chrome off the broadcast) */}
      {!isCallMode && isSightWordBook && contentPage?.sightWordsOnPage && (
        <Stack direction="row" justifyContent="center" sx={{ px: 2, pb: 0.5 }}>
          <Chip
            label={`${new Set(contentPage.sightWordsOnPage.map(w => w.toLowerCase())).size} sight words on this page`}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: 24 }}
          />
        </Stack>
      )}

      {/* Bottom bar */}
      <Stack
        direction="row"
        alignItems="center"
        sx={{ px: 2, py: 1.5, flexShrink: 0, gap: 1 }}
      >
        {/* Dot indicators */}
        <Stack direction="row" spacing={0.5} sx={{ flex: 1, flexWrap: 'wrap' }}>
          {Array.from({ length: totalPages }, (_, i) => (
            <Box
              key={i}
              role="button"
              aria-label={`Go to page ${i + 1}`}
              onClick={() => goToPage(i)}
              sx={{
                width: currentPage === i ? 10 : 7,
                height: currentPage === i ? 10 : 7,
                borderRadius: '50%',
                bgcolor: currentPage === i ? 'primary.main' : 'text.disabled',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            />
          ))}
        </Stack>

        {/* Edit + Download are parent/utility chrome — hidden in call mode. */}
        {!isCallMode && (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={() => navigate(`/books/${bookId}`)}
              sx={{ minHeight: 36, color: textColor, borderColor: textColor }}
            >
              Edit
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={printing ? <CircularProgress size={14} /> : <DownloadIcon />}
              onClick={() => setShowPrintSettings(true)}
              disabled={printing}
              sx={{ minHeight: 36, color: textColor, borderColor: textColor }}
            >
              {printing ? 'Making PDF\u2026' : 'Make a PDF'}
            </Button>
          </>
        )}
      </Stack>

      {/* Print settings dialog */}
      <PrintSettingsDialog
        open={showPrintSettings}
        onClose={() => setShowPrintSettings(false)}
        onPrint={(s) => { void handleDownloadPdf(s) }}
        hasSightWords={(book.sightWords?.length ?? 0) > 0}
      />

      {/* Print: skipped-image notice */}
      <Snackbar
        open={!!printSkipNotice}
        autoHideDuration={8000}
        onClose={() => setPrintSkipNotice(null)}
      >
        <Alert severity="warning" onClose={() => setPrintSkipNotice(null)} sx={{ width: '100%' }}>
          {printSkipNotice}
        </Alert>
      </Snackbar>
    </Box>
  )
}
