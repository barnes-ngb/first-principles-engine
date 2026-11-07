import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

import { artifactsCollection, booksCollection, hoursCollection, stripUndefined } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { useDebounce } from '../../core/hooks/useDebounce'
import type { Artifact, Book, BookPage, ImageVersion, PageImage, StickerTag } from '../../core/types'
import type { SaveState } from '../../components/SaveIndicator'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { addDiamondEvent } from '../../core/xp/addDiamondEvent'
import { DIAMOND_EVENTS } from '../../core/types'
import { createEmptyPage, generateImageId } from './bookTypes'
import { cleanSketchBackground } from './cleanSketch'
import { reorderPageImages } from './draggableImageUtils'
import { ShelfReadPhase, shelfIdentityKnown, type ShelfIdentityState } from './shelfRead'

export interface BookPageChange {
  before: BookPage
  after: BookPage
}

interface UseBookResult {
  book: Book | null
  loading: boolean
  /** The report on the DOCUMENT write. Uploads no longer speak through it. */
  saveState: SaveState
  /** When saveState is 'error', contains the actual error message for debugging. */
  saveErrorMessage: string | null
  /**
   * A file that did not get added, kept APART from `saveState` (UX-473).
   * Re-writing the document cannot repair it and a document write that then
   * succeeds must not be allowed to imply the picture or the sound arrived, so
   * this is its own statement and a successful save does not clear it.
   */
  uploadErrorMessage: string | null
  /** At least one upload is running. Uploads never move `saveState`. */
  uploadBusy: boolean
  /** Dismiss the upload notice. It is information, not an outstanding edit. */
  clearUploadError: () => void
  /**
   * True from the moment an edit is accepted until a write ACKNOWLEDGES that
   * same edit (UX-473). It covers all three unsaved shapes — a call still
   * waiting on the 500 ms debounce, a write in flight, and a write that failed
   * — so a departure guard and a Retry door read one honest answer instead of
   * inferring one from `saveState`, which a late callback can make stale.
   *
   * This is React state, so it is the answer as of the last RENDER — use it to
   * draw, and `hasOutstandingEdits` to decide.
   */
  hasUnsavedEdits: boolean
  /**
   * The same answer, read SYNCHRONOUSLY and bound to this document.
   *
   * A chip that mutates and navigates in one handler asks before React has
   * re-rendered, and Chrome showed that gap letting the first edit of a session
   * escape the departure guard. This reads a ref written during `applyUpdate`
   * itself. It answers `false` once the hook has moved to another book, so a
   * late callback cannot release the wrong document's guard.
   */
  hasOutstandingEdits: () => boolean
  /**
   * Re-write the LATEST draft this hook owns, for the document it is currently
   * scoped to. A no-op when nothing is outstanding, or when the hook has moved
   * to another book since the failure — a retry must never post one book's
   * words to another's document (the UX-345 hazard `useDebounce` already
   * closed for the timer path).
   */
  retrySave: () => void
  updatePage: (pageId: string, changes: Partial<BookPage>) => void
  /** Atomic, scoped page mutation and its actual accepted before/after pair. */
  changePage: (pageId: string, mutate: (page: BookPage) => BookPage | undefined, options?: { usedAiGeneration?: boolean }) => BookPageChange | undefined
  addPage: () => void
  deletePage: (pageId: string) => void
  reorderPages: (fromIndex: number, toIndex: number) => void
  /**
   * `childId` is settable because moving a book to another child's shelf is a
   * real thing the editor's "For" control claims to do (UX-124) — the kid shelf,
   * the kid Today cards and the reader's hours all query `childId`.
   */
  updateBookMeta: (changes: Partial<Pick<Book, 'title' | 'status' | 'coverStyle' | 'coverImageUrl' | 'subjectBuckets' | 'isTogetherBook' | 'contributorIds' | 'theme' | 'createdBy' | 'createdFor' | 'childId' | 'generationConfig'>>) => void
  addImageToPage: (pageId: string, file: File, options?: { cleanBackground?: boolean }) => Promise<void>
  /** Upload a replacement candidate without removing or changing current art. */
  prepareBackgroundPhoto: (file: File) => Promise<PageImage | undefined>
  /** Construct an image candidate; usage changes only when it is accepted. */
  prepareAiPageImage: (url: string, storagePath: string, prompt: string) => PageImage
  removeImageFromPage: (pageId: string, imageId: string) => void
  uploadAudio: (pageId: string, blob: Blob) => Promise<void>
  addAiImageToPage: (pageId: string, url: string, storagePath: string, prompt: string) => void
  addStickerToPage: (pageId: string, stickerUrl: string, storagePath: string, label: string, tags?: StickerTag[]) => void
  /** Upload a cleaned drawing (transparent PNG) and add it to a page as a sticker.
   *  Returns the storage URL + path so callers can also save it to the library. */
  addStickerFileToPage: (pageId: string, file: File, label: string) => Promise<{ url: string; storagePath: string } | undefined>
  updateImagePosition: (pageId: string, imageId: string, position: PageImage['position']) => BookPageChange | undefined
  /** Move one image a single step in the layer stack ('up' = toward the top).
   *  Normalizes every image on the page to a contiguous zIndex so the order is
   *  explicit and survives reload. */
  reorderImage: (pageId: string, imageId: string, direction: 'up' | 'down') => BookPageChange | undefined
  /** Add a hand-drawn sketch photo to a page. Returns the image ID and storage path for later enhancement. */
  addSketchToPage: (pageId: string, file: File) => Promise<{ imageId: string; storagePath: string } | undefined>
  /** Update a sketch PageImage after AI enhancement resolves. */
  applySketchEnhancement: (pageId: string, imageId: string, enhancedUrl: string, enhancedStoragePath: string) => void
  /** Switch which version (original vs enhanced) is the active URL for a sketch image. */
  pickSketchVersion: (pageId: string, imageId: string, version: 'original' | 'enhanced') => void
  /** Restore a previous version of an image by index (0 = most recent previous). */
  restoreImageVersion: (pageId: string, imageId: string, versionIndex: number) => void
  /** Whether this session used AI image generation (for Art hours) */
  usedAiGeneration: boolean
}

interface UseBookshelfResult {
  /** Only ever the rows of the query owner this result is for. */
  books: Book[]
  /** Unchanged for every existing reader: the read is in flight. */
  loading: boolean
  /** Which of `ShelfReadPhase`'s five answers this is. */
  phase: ShelfReadPhase
  /** THIS read failed. Never true beside an affirmative answer, and never the
   *  word for an identity that is merely unknown — that is its own phase. */
  error: boolean
  /**
   * Ask the CURRENT owner's query again.
   *
   * A callback a replaced render still holds does nothing at all — it does not
   * re-read for whoever is on screen now (the `UX-345` hazard `retrySave`
   * already closed for the document write).
   */
  retry: () => void
  createBook: (
    title: string,
    coverStyle: Book['coverStyle'],
    isTogetherBook?: boolean,
    contributorIds?: string[],
    attribution?: { createdBy: 'parent' | string; createdFor: string },
  ) => Promise<string>
  deleteBook: (bookId: string) => Promise<void>
}

/**
 * WHOSE books a read is for — the query's own permission scope.
 *
 * Family + audience, plus the child only when the child is what the query
 * FILTERS ON. A parent reads the whole family (`loadAll`), so neither the
 * selected child nor that child's readiness is part of that question: moving
 * the app-bar chip must not reload the shelf, blank it, fail it or take a
 * dialog down with it. A child's shelf is their own id, so a different child is
 * a different question — and a child who is not KNOWN is no question at all.
 *
 * `''` means there is nothing honest to ask.
 */
function shelfQueryScope(
  familyId: string,
  childId: string,
  loadAll: boolean,
  identityKnown: boolean,
): string {
  if (!familyId) return ''
  if (loadAll) return `${familyId}|family`
  if (!identityKnown) return ''
  return childId ? `${familyId}|child|${childId}` : ''
}

/**
 * WHAT is being asked, derived from this render's inputs alone.
 *
 * Pure and anonymous: it carries no identity of its own, so two renders that
 * compute the same question are the same question — and whether that question
 * is a NEW asking of it is `ShelfReadOwner`'s business, below.
 */
interface ShelfQuestion {
  /** The query's scope, or why there is none — see `ownerKeyFor`. */
  readonly key: string
  /** The query to ask, or `''` when there is nothing honest to ask. */
  readonly scope: string
  readonly familyId: string
  readonly childId: string
  readonly audienceIsFamily: boolean
  /** The phase this question begins in, before anything has been asked. */
  readonly phase: ShelfReadPhase
}

/**
 * One OWNER of the read — one incarnation of one question.
 *
 * A new object with a new id every time the owner changes, which is what the
 * admission checks compare: the key alone cannot do it, because a scope that is
 * left and returned to (`A → B → A`, or `A → no child → A`) produces the same
 * string for two different questions, and a callback retained from the first
 * must be inert while the second asks for itself.
 *
 * **Immutable, and owned by STATE** (`ShelfReadState.owner`). It used to live in
 * a ref that render replaced in place, which made a render that React never
 * commits — one thrown away behind a suspended sibling, one abandoned
 * transition — able to retire the owner the screen still belongs to: the
 * committed read's answer was then refused as somebody else's and its retry
 * went inert, with nothing on screen having changed. State cannot do that: a
 * discarded render's state update is discarded with it, so the committed
 * incarnation keeps its request, its answer and its retry. Nothing here is
 * written during render, which is also why the hook is lint-clean under
 * `react-hooks/refs` rather than exempted from it.
 */
interface ShelfReadOwner extends ShelfQuestion {
  /** Monotonic within one mounted hook, and never reused. */
  readonly id: number
}

/**
 * Why there is no query, when there is none — so that a change of REASON is a
 * change of owner too. Unsettled and unknown are different frames, and an
 * unknown identity that becomes merely unsettled (a retry starting) must move.
 */
function ownerKeyFor(scope: string, phase: ShelfReadPhase): string {
  return scope || `none|${phase}`
}

/**
 * The next incarnation of a question — pure, so a thrown-away render computes
 * the same id as the retained one and ids are never skipped or shared.
 *
 * Every field the read itself uses is pinned by `key`: the scope string already
 * carries the family and the audience, and carries the child exactly when the
 * query filters on one. A family owner's `childId` is therefore the one field
 * that can go stale while the key holds, and the family read does not look at
 * it — which is the same reason a parent's selected child may not re-ask it.
 */
function nextOwner(previousId: number, question: ShelfQuestion): ShelfReadOwner {
  return { id: previousId + 1, ...question }
}

interface ShelfReadState {
  /** The incarnation these rows belong to. They are shown under no other. */
  readonly owner: ShelfReadOwner
  readonly phase: ShelfReadPhase
  readonly books: Book[]
  readonly error: boolean
}

/** The state an owner starts in: asking, waiting, or unable to ask. */
function openingState(owner: ShelfReadOwner): ShelfReadState {
  return { owner, phase: owner.phase, books: [], error: false }
}

/** The parent's shelf: the whole family, newest first, no child filter. */
async function readFamilyShelf(familyId: string): Promise<Book[]> {
  const allQ = query(booksCollection(familyId), orderBy('updatedAt', 'desc'))
  const snap = await getDocs(allQ)
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }))
}

/**
 * A child's shelf: their own books unioned with the Together books they
 * contributed to, deduped (own wins) and sorted newest first.
 *
 * `Promise.all` is load-bearing: either both halves answer or the read failed.
 * Half a union drawn as a shelf reads as books that have been deleted.
 */
async function readChildShelf(familyId: string, childId: string): Promise<Book[]> {
  const ownQ = query(
    booksCollection(familyId),
    where('childId', '==', childId),
    orderBy('updatedAt', 'desc'),
  )
  const togetherQ = query(
    booksCollection(familyId),
    where('contributorIds', 'array-contains', childId),
    orderBy('updatedAt', 'desc'),
  )
  const [ownSnap, togetherSnap] = await Promise.all([getDocs(ownQ), getDocs(togetherQ)])

  const bookMap = new Map<string, Book>()
  for (const d of ownSnap.docs) {
    bookMap.set(d.id, { ...d.data(), id: d.id })
  }
  for (const d of togetherSnap.docs) {
    if (!bookMap.has(d.id)) {
      bookMap.set(d.id, { ...d.data(), id: d.id })
    }
  }
  return [...bookMap.values()].sort(
    (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
  )
}

/** Push the current URL onto previousVersions (max 5). */
function pushVersion(
  image: PageImage,
  replacedBy: ImageVersion['replacedBy'],
): ImageVersion[] {
  const entry: ImageVersion = {
    url: image.url,
    replacedAt: new Date().toISOString(),
    replacedBy,
  }
  return [entry, ...(image.previousVersions ?? []).slice(0, 4)]
}

/**
 * What a failed upload says (UX-473).
 *
 * Neutral and type-appropriate, and deliberately silent about two things it
 * cannot know: whether the file is really gone (Storage may have taken it and
 * only the URL round-trip failed) and whether the kid's words are safe (that is
 * the DOCUMENT's status, which has its own indicator and its own Retry). So it
 * states only what it observed — this did not get added — and what to do.
 */
export function uploadNotAddedMessage(
  kind: 'picture' | 'drawing' | 'sticker' | 'recording',
  reason: string,
): string {
  return `This ${kind} wasn't added. Try adding it again. (${reason})`
}

/** Get today as YYYY-MM-DD string. */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Log compliance hours for book editing session. */
async function logBookHours(
  familyId: string,
  childId: string,
  minutes: number,
  bookTitle: string,
  usedAiGeneration: boolean,
): Promise<void> {
  if (minutes < 1) return
  const date = todayStr()

  // Language Arts hours
  await addDoc(hoursCollection(familyId), {
    childId,
    date,
    minutes,
    subjectBucket: SubjectBucket.LanguageArts,
    notes: `Book: "${bookTitle}" (page editing)`,
  })

  // Art hours if AI generation was used
  if (usedAiGeneration) {
    await addDoc(hoursCollection(familyId), {
      childId,
      date,
      minutes: Math.min(minutes, 5),
      subjectBucket: SubjectBucket.Art,
      notes: `Book illustrations: "${bookTitle}"`,
    })
  }
}

/** Create a portfolio artifact when a book is completed. */
export async function createBookArtifact(familyId: string, book: Book): Promise<void> {
  const artifact: Omit<Artifact, 'id'> = {
    childId: book.childId,
    title: `"${book.title}" — ${book.pages.length} page book`,
    type: book.coverImageUrl ? EvidenceType.Photo : EvidenceType.Note,
    content: `Book completed: "${book.title}" with ${book.pages.length} pages. ${book.pages.filter((p) => p.audioUrl).length} pages have narration.`,
    createdAt: new Date().toISOString(),
    tags: {
      engineStage: EngineStage.Share,
      domain: 'language-arts',
      subjectBucket: SubjectBucket.LanguageArts,
      location: 'Home',
    },
    notes: book.pages
      .map((p, i) => `Page ${i + 1}: ${p.text?.slice(0, 50) || '(illustration only)'}`)
      .join('\n'),
    ...(book.coverImageUrl ? { uri: book.coverImageUrl } : {}),
  }

  await addDoc(artifactsCollection(familyId), artifact)
}

export function shouldTriggerBookCompletionRewards(
  previousStatus: Book['status'],
  nextStatus: Book['status'] | undefined,
): boolean {
  return nextStatus === 'complete' && previousStatus !== 'complete'
}

export function useBook(familyId: string, bookId: string | undefined): UseBookResult {
  const [book, setBook] = useState<Book | null>(null)
  const documentScope = useMemo(() => ({ familyId, bookId }), [familyId, bookId])
  // Mutation authority, including calls batched before React renders. This is
  // scoped to the document, and never advanced by an abandoned render.
  const latestBook = useRef<{ scope: object; value: Book | null }>({ scope: documentScope, value: null })
  const [loading, setLoading] = useState(!!familyId && !!bookId)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null)
  const [usedAiGeneration, setUsedAiGeneration] = useState(false)

  // ── Which edit is saved, and which is not (UX-473) ────────────────────────
  //
  // A counter rather than a flag, because the question a failed save asks is
  // *which* edit landed. Writes are not ordered: a rapid typist can have two
  // `setDoc`s in flight, and the one that resolves second is not necessarily
  // the one that was sent second. `editSeq` is the newest edit this hook has
  // accepted; `ackedSeq` is the newest edit a write has acknowledged. So
  // "saved" is only claimed for the newest edit, a success for an older one
  // leaves the newer edit visibly unsaved, and a failure that arrives for an
  // edit a later write already carried is ignored instead of alarming.
  // Both are per-document and reset by the load effect below.
  const editSeqRef = useRef(0)
  const ackedSeqRef = useRef(0)
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false)
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null)
  // Upload bookkeeping, declared here with the rest of the per-document state
  // so the load effect below can reset it. Its helpers are further down.
  const uploadsRef = useRef<{ scope: object; active: number }>({ scope: documentScope, active: 0 })
  const [uploadBusy, setUploadBusy] = useState(false)
  // The same answer as `hasUnsavedEdits`, written SYNCHRONOUSLY and stamped with
  // the document it belongs to. React state is a render behind, and a chip that
  // edits and navigates in one handler asks the departure guard before that
  // render happens — the gap Chrome found the first edit of a session escaping
  // through. The scope stamp is what stops a late callback for an abandoned
  // book from answering for the one now on screen.
  const outstandingRef = useRef<{ scope: object; dirty: boolean }>({ scope: documentScope, dirty: false })
  const hasOutstandingEdits = useCallback(
    () => outstandingRef.current.scope === documentScope && outstandingRef.current.dirty,
    [documentScope],
  )

  // Session time tracking
  const sessionStartRef = useRef<number>(Date.now())
  const hoursLoggedRef = useRef(false)

  // Reset session timer on mount
  useEffect(() => {
    sessionStartRef.current = Date.now()
    hoursLoggedRef.current = false
  }, [bookId])

  // (The unmount hours write is declared BELOW `debouncedPersist` — see the
  // ordering note there. It used to sit here, and that was the bug.)

  // Load book
  useEffect(() => {
    latestBook.current = { scope: documentScope, value: null }
    setBook(null)
    // A new document starts with nothing outstanding and no verdict. Carrying
    // the previous book's 'error' across would claim THIS book failed to save,
    // and carrying its unsaved flag would arm a departure guard over edits
    // that belong to a document this hook no longer holds.
    editSeqRef.current = 0
    ackedSeqRef.current = 0
    outstandingRef.current = { scope: documentScope, dirty: false }
    setHasUnsavedEdits(false)
    setSaveState('idle')
    setSaveErrorMessage(null)
    setUploadErrorMessage(null)
    uploadsRef.current = { scope: documentScope, active: 0 }
    setUploadBusy(false)
    if (!familyId || !bookId) { setLoading(false); return }
    setLoading(true)
    let cancelled = false
    const load = async () => {
      const docRef = doc(booksCollection(familyId), bookId)
      const snap = await getDoc(docRef)
      if (cancelled) return
      if (snap.exists()) {
        const loaded = { ...snap.data(), id: snap.id }
        latestBook.current = { scope: documentScope, value: loaded }
        setBook(loaded)
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
      latestBook.current = { scope: documentScope, value: null }
    }
  }, [familyId, bookId, documentScope])

  // Persist to Firestore
  //
  // `seq` is the edit this call carries (see the counters above). It is a second
  // ARGUMENT rather than a closure read because `useDebounce` delivers a pending
  // call with the function and args it was MADE with, so the seq a flushed write
  // reports is the edit that write actually contains.
  const persist = useCallback(
    async (updated: Book, seq: number) => {
      if (!familyId || !bookId) return
      // The document this call is for. Checked again after the await, so a
      // callback that lands after the editor moved to another book cannot
      // repaint that book's status with this one's outcome.
      const scope = documentScope
      const isCurrent = latestBook.current.scope === scope
      // Already stored: a duplicate dispatch of an edit this hook has ALREADY
      // acknowledged — a debounce flush arriving after a Retry landed the same
      // words. Writing it again is a no-op whose 'Saving…' the settle paths
      // below would then (correctly) refuse to resolve, leaving a spinner that
      // never ends over a book that is in fact saved.
      if (isCurrent && seq <= ackedSeqRef.current) return
      // A write for a document this hook no longer shows still goes through —
      // that edit is owed to the book it was made in — but it does not paint
      // the status of the book now on screen.
      if (isCurrent) {
        setSaveState('saving')
        setSaveErrorMessage(null)
      }
      try {
        const docRef = doc(booksCollection(familyId), bookId)
        const { id, ...data } = updated
        void id
        const sanitized = stripUndefined(data as unknown as Record<string, unknown>) as Omit<Book, 'id'>
        await setDoc(docRef, { ...sanitized, updatedAt: new Date().toISOString() })
        if (latestBook.current.scope !== scope) return
        if (seq < ackedSeqRef.current) return
        ackedSeqRef.current = seq
        // A newer edit exists and has not been written: this book is NOT saved,
        // whatever this call just managed to land. The write that carries the
        // newer edit owns the verdict.
        if (seq < editSeqRef.current) return
        outstandingRef.current = { scope, dirty: false }
        setHasUnsavedEdits(false)
        setSaveState('saved')
        setSaveErrorMessage(null)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('Book save failed:', err)
        if (latestBook.current.scope !== scope) return
        // A later write already acknowledged this edit (a retry that landed, or
        // a fuller write that overtook this one), so its content IS stored and
        // reporting a failure would be a lie that re-arms the departure guard.
        if (seq <= ackedSeqRef.current) return
        setSaveState('error')
        setSaveErrorMessage(`Save failed: ${errMsg}`)
      }
    },
    [familyId, bookId, documentScope],
  )

  const debouncedPersist = useDebounce(persist, 500)

  // ── Log hours on unmount (navigate away / close) ──────────────────────────
  //
  // **Declared AFTER `debouncedPersist` on purpose** (Codex round 1, P2). React
  // runs a component's effect cleanups in the order the effects were declared,
  // and UX-353 made `useDebounce` flush its pending call on unmount instead of
  // dropping it. `persist` writes the WHOLE book with a non-merge `setDoc`,
  // carrying the `totalMinutes` this hook last read — so with this effect
  // declared first, the two unmount writes queued on the same document in the
  // wrong order: the merge below recorded the session's minutes, and the flushed
  // full-document write then put the old total back, leaving `books.totalMinutes`
  // disagreeing with the `hours` entry `logBookHours` had just written. Flushing
  // first makes the merge last, and `newTotal` is `book.totalMinutes + elapsed`
  // off the same value `persist` writes, so the stored total is right either way
  // the race resolves. Pinned by `useBook.unmountOrder.test.ts`.
  //
  // Neither write changed — this is the order, and nothing else. No hours math,
  // no fold, no rounding moved.
  useEffect(() => {
    return () => {
      const elapsed = Math.round((Date.now() - sessionStartRef.current) / 60000)
      if (elapsed >= 1 && !hoursLoggedRef.current && book) {
        hoursLoggedRef.current = true
        // Update totalMinutes on the book
        const newTotal = (book.totalMinutes ?? 0) + elapsed
        if (familyId && bookId) {
          const docRef = doc(booksCollection(familyId), bookId)
          void setDoc(docRef, { totalMinutes: newTotal, updatedAt: new Date().toISOString() }, { merge: true })
        }
        void logBookHours(familyId, book.childId, elapsed, book.title, usedAiGeneration)
      }
    }
    // Only run cleanup on unmount — intentionally stable deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, bookId, book?.childId, book?.title, book?.totalMinutes, usedAiGeneration])

  const applyUpdate = useCallback(
    (updater: (prev: Book) => Book) => {
      const current = latestBook.current
      if (current.scope !== documentScope || !current.value) return undefined
      const previous = current.value
      const next = updater(previous)
      if (next === previous) return undefined
      latestBook.current = { scope: documentScope, value: next }
      setBook(next)
      editSeqRef.current += 1
      // Before the state update, and before the write is even scheduled: a
      // handler that navigates on the next line must find this already true.
      outstandingRef.current = { scope: documentScope, dirty: true }
      setHasUnsavedEdits(true)
      debouncedPersist(next, editSeqRef.current)
      return { before: previous, after: next }
    },
    [debouncedPersist, documentScope],
  )

  /**
   * Explicit Retry (UX-473). It re-writes `latestBook`, not the document the
   * failed call carried, so edits made while the error was on screen are part
   * of what gets saved — the whole point of keeping them. Scoped: a retry after
   * the editor moved to another book writes nothing.
   */
  const retrySave = useCallback(() => {
    if (!familyId || !bookId) return
    const current = latestBook.current
    if (current.scope !== documentScope || !current.value) return
    if (editSeqRef.current === ackedSeqRef.current) return
    void persist(current.value, editSeqRef.current)
  }, [familyId, bookId, documentScope, persist])

  // ── Uploads report on THEMSELVES, never on the document (UX-473) ──────────
  //
  // They used to borrow `saveState`, and that produced a state the editor could
  // not get out of: a document write that had already failed left `saveState`
  // 'error' with the draft dirty; an upload then set 'saving'; the upload
  // failed; and because the draft was dirty the 'saving' was kept — so the save
  // indicator span 700 ms later with no document request in flight, the *Try
  // again* banner (gated on 'error') had vanished, and the departure dialog
  // believed a write was in the air and withheld its controls. Reproduced by
  // the root against the real hook.
  //
  // So `saveState` now means exactly one thing — the last DOCUMENT write — and
  // uploads carry their own `uploadBusy` / `uploadErrorMessage`. An upload's
  // success still goes through `applyUpdate`, which schedules a real document
  // save that moves `saveState` for real.
  //
  // Both helpers are bound to the document the upload was STARTED for. A photo
  // begun on one book and rejected after the editor moved to another used to
  // post the old book's error onto the new one's notice.
  const beginUpload = useCallback((scope: object) => {
    if (latestBook.current.scope !== scope) return
    if (uploadsRef.current.scope !== scope) uploadsRef.current = { scope, active: 0 }
    uploadsRef.current.active += 1
    setUploadBusy(true)
    setUploadErrorMessage(null)
  }, [])

  /** Settle one upload. `message` is its failure, if it had one. */
  const endUpload = useCallback((scope: object, message?: string) => {
    // A callback that lands after the editor moved on reports nothing: neither
    // the spinner nor the error belongs to the book now on screen.
    if (latestBook.current.scope !== scope) return
    if (uploadsRef.current.scope === scope) {
      uploadsRef.current.active = Math.max(0, uploadsRef.current.active - 1)
      setUploadBusy(uploadsRef.current.active > 0)
    }
    if (message) setUploadErrorMessage(message)
  }, [])

  const clearUploadError = useCallback(() => setUploadErrorMessage(null), [])

  const changePage = useCallback((pageId: string, mutate: (page: BookPage) => BookPage | undefined, options?: { usedAiGeneration?: boolean }): BookPageChange | undefined => {
    const change = applyUpdate((previous) => {
      const page = previous.pages.find((item) => item.id === pageId)
      if (!page) return previous
      const result = mutate(page)
      if (!result || result === page || JSON.stringify(result) === JSON.stringify(page)) return previous
      return { ...previous, pages: previous.pages.map((item) => item.id === pageId ? { ...result, updatedAt: new Date().toISOString() } : item) }
    })
    if (!change) return undefined
    if (options?.usedAiGeneration) setUsedAiGeneration(true)
    return { before: change.before.pages.find((page) => page.id === pageId)!, after: change.after.pages.find((page) => page.id === pageId)! }
  }, [applyUpdate])

  const updatePage = useCallback(
    (pageId: string, changes: Partial<BookPage>) => {
      changePage(pageId, (page) => ({ ...page, ...changes }))
    },
    [changePage],
  )

  const addPage = useCallback(() => {
    applyUpdate((prev) => {
      const newPage = createEmptyPage(prev.pages.length + 1)
      return { ...prev, pages: [...prev.pages, newPage] }
    })
  }, [applyUpdate])

  const deletePage = useCallback(
    (pageId: string) => {
      applyUpdate((prev) => ({
        ...prev,
        pages: prev.pages
          .filter((p) => p.id !== pageId)
          .map((p, i) => ({ ...p, pageNumber: i + 1 })),
      }))
    },
    [applyUpdate],
  )

  const reorderPages = useCallback(
    (fromIndex: number, toIndex: number) => {
      applyUpdate((prev) => {
        const pages = [...prev.pages]
        const [moved] = pages.splice(fromIndex, 1)
        pages.splice(toIndex, 0, moved)
        return {
          ...prev,
          pages: pages.map((p, i) => ({ ...p, pageNumber: i + 1 })),
        }
      })
    },
    [applyUpdate],
  )

  const updateBookMeta = useCallback(
    (changes: Partial<Pick<Book, 'title' | 'status' | 'coverStyle' | 'coverImageUrl' | 'subjectBuckets' | 'isTogetherBook' | 'contributorIds' | 'theme' | 'createdBy' | 'createdFor' | 'childId' | 'generationConfig'>>) => {
      applyUpdate((prev) => {
        const next = { ...prev, ...changes }
        // If status changes to 'complete', create portfolio artifact + award XP
        if (shouldTriggerBookCompletionRewards(prev.status, changes.status)) {
          void createBookArtifact(familyId, next)
          // 25 XP for finishing a book (lifetime dedup per book)
          void addXpEvent(
            familyId,
            prev.childId,
            'BOOK_COMPLETE',
            25,
            `book_complete_${bookId}`,
            { title: next.title },
          )
          // 5 diamonds for finishing a book
          void addDiamondEvent({
            familyId,
            childId: prev.childId,
            amount: 5,
            type: DIAMOND_EVENTS.BOOK_COMPLETE,
            reason: `Book complete: ${next.title}`,
            dedupKey: `book_complete_${bookId}-diamond`,
          })
        }
        return next
      })
    },
    [applyUpdate, familyId, bookId],
  )

  const addImageToPage = useCallback(
    async (pageId: string, file: File, options?: { cleanBackground?: boolean }) => {
      if (!familyId || !bookId) return
      // The document this upload belongs to, for the whole of its life.
      const scope = documentScope

      // Smart overlay detection: is there already an image on this page?
      const currentPage = book?.pages.find((p) => p.id === pageId)
      const isOverlay = (currentPage?.images.length ?? 0) > 0

      // If overlaying and cleanup requested, remove paper background
      let processedFile: File | Blob = file
      if (isOverlay && options?.cleanBackground && file.type.startsWith('image/')) {
        try {
          processedFile = await cleanSketchBackground(file)
        } catch {
          console.warn('Sketch cleanup failed, using original')
        }
      }

      // Compress before uploading
      const { compressIfNeeded } = await import('../../core/utils/compressImage')
      processedFile = await compressIfNeeded(processedFile, 500_000, {
        maxWidth: 1024,
        quality: 0.85,
      })

      const imageId = generateImageId()
      const ext = processedFile instanceof File
        ? processedFile.name.split('.').pop() ?? 'jpg'
        : 'jpg'
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `${ts}.${ext}`
      const storagePath = `families/${familyId}/books/${bookId}/${filename}`
      const storageRef = ref(storage, storagePath)

      beginUpload(scope)
      try {
        await uploadBytes(storageRef, processedFile)
        const url = await getDownloadURL(storageRef)

        // Smart default position: overlay size if layering on existing image
        const overlayPosition = isOverlay
          ? { x: 10, y: 10, width: 40, height: 40 }
          : undefined

        // A first (full-page) photo is the page background; a photo added over
        // an existing image is a placed element (FEAT-116).
        const image: PageImage = {
          id: imageId,
          url,
          storagePath,
          type: 'photo',
          layerType: isOverlay ? 'element' : 'background',
          ...(overlayPosition ? { position: overlayPosition } : {}),
        }
        applyUpdate((prev) => ({
          ...prev,
          pages: prev.pages.map((p) =>
            p.id === pageId
              ? { ...p, images: [...p.images, image], updatedAt: new Date().toISOString() }
              : p,
          ),
        }))
        endUpload(scope)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('Image upload failed:', err)
        endUpload(scope, uploadNotAddedMessage('picture', errMsg))
      }
    },
    [familyId, bookId, documentScope, applyUpdate, book, beginUpload, endUpload],
  )

  const prepareBackgroundPhoto = useCallback(async (file: File): Promise<PageImage | undefined> => {
    if (!familyId || !bookId) return undefined
    try {
      const { compressIfNeeded } = await import('../../core/utils/compressImage')
      const processed = await compressIfNeeded(file, 500_000, { maxWidth: 1024, quality: 0.85 })
      const id = generateImageId()
      const ext = processed instanceof File ? processed.name.split('.').pop() ?? 'jpg' : 'jpg'
      const storagePath = `families/${familyId}/books/${bookId}/${id}.${ext}`
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, processed)
      const url = await getDownloadURL(storageRef)
      // No page write here: the editor first validates its original target.
      return { id, url, storagePath, type: 'photo', layerType: 'background' }
    } catch (err) {
      console.error('Background upload failed:', err)
      return undefined
    }
  }, [familyId, bookId])

  const removeImageFromPage = useCallback(
    (pageId: string, imageId: string) => {
      applyUpdate((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.id === pageId
            ? { ...p, images: p.images.filter((img) => img.id !== imageId), updatedAt: new Date().toISOString() }
            : p,
        ),
      }))
    },
    [applyUpdate],
  )

  const uploadAudio = useCallback(
    async (pageId: string, blob: Blob) => {
      if (!familyId || !bookId) return
      const scope = documentScope
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `audio_${pageId}_${ts}.webm`
      const storagePath = `families/${familyId}/books/${bookId}/${filename}`
      const storageRef = ref(storage, storagePath)

      beginUpload(scope)
      try {
        await uploadBytes(storageRef, blob)
        const url = await getDownloadURL(storageRef)
        applyUpdate((prev) => ({
          ...prev,
          pages: prev.pages.map((p) =>
            p.id === pageId
              ? { ...p, audioUrl: url, audioStoragePath: storagePath, updatedAt: new Date().toISOString() }
              : p,
          ),
        }))
        endUpload(scope)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('Audio upload failed:', err)
        endUpload(scope, uploadNotAddedMessage('recording', errMsg))
      }
    },
    [familyId, bookId, documentScope, applyUpdate, beginUpload, endUpload],
  )

  const prepareAiPageImage = useCallback((url: string, storagePath: string, prompt: string): PageImage => {
      return {
        id: generateImageId(),
        url,
        storagePath,
        type: 'ai-generated',
        layerType: 'background',
        prompt,
      }
  }, [])

  const addAiImageToPage = useCallback(
    (pageId: string, url: string, storagePath: string, prompt: string) => {
      const image = prepareAiPageImage(url, storagePath, prompt)
      changePage(pageId, (page) => ({ ...page, images: [...page.images, image] }), { usedAiGeneration: true })
    },
    [changePage, prepareAiPageImage],
  )

  const updateImagePosition = useCallback(
    (pageId: string, imageId: string, position: PageImage['position']) => {
      return changePage(pageId, (p) => p.images.some((image) => image.id === imageId)
            ? {
                ...p,
                images: p.images.map((img) => {
                  if (img.id !== imageId) return img
                  // Layer order is owned solely by reorderImage. A transform
                  // (drag/resize/rotate/flip) must NOT rewrite zIndex — the
                  // DraggableImage's local pos.zIndex can be stale after a
                  // reorder, and writing it back would undo the visible order.
                  const preservedZ = img.position?.zIndex
                  const nextPos = position ? { ...position } : position
                  if (nextPos) {
                    if (preservedZ !== undefined) nextPos.zIndex = preservedZ
                    else delete nextPos.zIndex
                  }
                  return { ...img, position: nextPos }
                }),
                updatedAt: new Date().toISOString(),
              }
            : undefined)
    },
    [changePage],
  )

  const reorderImage = useCallback(
    (pageId: string, imageId: string, direction: 'up' | 'down') => {
      return changePage(pageId, (p) => {
          const images = reorderPageImages(p.images, imageId, direction)
          if (images === p.images) return undefined
          return {
            ...p,
            images,
            updatedAt: new Date().toISOString(),
          }
        })
    },
    [changePage],
  )

  const addSketchToPage = useCallback(
    async (pageId: string, file: File): Promise<{ imageId: string; storagePath: string } | undefined> => {
      if (!familyId || !bookId) return undefined
      const scope = documentScope

      const imageId = generateImageId()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `${ts}_sketch.${ext}`
      const storagePath = `families/${familyId}/sketches/${filename}`
      const storageRef = ref(storage, storagePath)

      // Compress sketch before uploading
      const { compressIfNeeded: compressSketch } = await import('../../core/utils/compressImage')
      const processedSketch = await compressSketch(file, 500_000, {
        maxWidth: 1024,
        quality: 0.85,
      })

      beginUpload(scope)
      try {
        await uploadBytes(storageRef, processedSketch)
        const url = await getDownloadURL(storageRef)

        const image: PageImage = {
          id: imageId,
          url,
          storagePath,
          type: 'sketch',
          layerType: 'background',
          style: 'sketch',
          originalSketchUrl: url,
          label: 'Hand-drawn sketch',
        }
        applyUpdate((prev) => ({
          ...prev,
          pages: prev.pages.map((p) =>
            p.id === pageId
              ? { ...p, images: [...p.images, image], updatedAt: new Date().toISOString() }
              : p,
          ),
        }))

        // Save as portfolio artifact
        if (book) {
          const artifact: Omit<Artifact, 'id'> = {
            childId: book.childId,
            title: 'Hand-drawn sketch',
            type: EvidenceType.Photo,
            uri: url,
            storagePath,
            createdAt: new Date().toISOString(),
            content: `Sketch captured for book "${book.title}"`,
            tags: {
              engineStage: EngineStage.Build,
              domain: 'art',
              subjectBucket: SubjectBucket.Art,
              location: 'Home',
            },
          }
          void addDoc(artifactsCollection(familyId), artifact)
        }

        endUpload(scope)
        return { imageId, storagePath }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('Sketch upload failed:', err)
        endUpload(scope, uploadNotAddedMessage('drawing', errMsg))
        return undefined
      }
    },
    [familyId, bookId, documentScope, applyUpdate, book, beginUpload, endUpload],
  )

  const applySketchEnhancement = useCallback(
    (pageId: string, imageId: string, enhancedUrl: string, enhancedStoragePath: string) => {
      setUsedAiGeneration(true)
      applyUpdate((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.id === pageId
            ? {
                ...p,
                images: p.images.map((img) => {
                  if (img.id !== imageId) return img
                  return {
                    ...img,
                    enhancedUrl,
                    enhancedStoragePath,
                    previousVersions: pushVersion(img, 'reimagine'),
                  }
                }),
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      }))
    },
    [applyUpdate],
  )

  const pickSketchVersion = useCallback(
    (pageId: string, imageId: string, version: 'original' | 'enhanced') => {
      applyUpdate((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.id === pageId
            ? {
                ...p,
                images: p.images.map((img) => {
                  if (img.id !== imageId) return img
                  const newUrl = version === 'enhanced' && img.enhancedUrl
                    ? img.enhancedUrl
                    : img.originalSketchUrl ?? img.url
                  const newStyle = version === 'enhanced' ? 'ai-enhanced' as const : 'sketch' as const
                  return {
                    ...img,
                    url: newUrl,
                    style: newStyle,
                    previousVersions: pushVersion(img, 'reimagine'),
                  }
                }),
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      }))
    },
    [applyUpdate],
  )

  const restoreImageVersion = useCallback(
    (pageId: string, imageId: string, versionIndex: number) => {
      applyUpdate((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.id === pageId
            ? {
                ...p,
                images: p.images.map((img) => {
                  if (img.id !== imageId) return img
                  const versions = img.previousVersions ?? []
                  const target = versions[versionIndex]
                  if (!target) return img
                  // Push current to front, remove the restored one
                  const newVersions = [
                    { url: img.url, replacedAt: new Date().toISOString(), replacedBy: 'reimagine' as const },
                    ...versions.filter((_, i) => i !== versionIndex),
                  ].slice(0, 5)
                  return { ...img, url: target.url, previousVersions: newVersions }
                }),
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      }))
    },
    [applyUpdate],
  )

  const addStickerToPage = useCallback(
    (pageId: string, stickerUrl: string, storagePath: string, label: string, tags?: StickerTag[]) => {
      const image: PageImage = {
        id: generateImageId(),
        url: stickerUrl,
        storagePath,
        type: 'sticker',
        layerType: 'element',
        label,
        ...(tags?.length ? { tags } : {}),
      }
      applyUpdate((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.id === pageId
            ? { ...p, images: [...p.images, image], updatedAt: new Date().toISOString() }
            : p,
        ),
      }))
    },
    [applyUpdate],
  )

  const addStickerFileToPage = useCallback(
    async (pageId: string, file: File, label: string) => {
      if (!familyId || !bookId) return undefined
      const scope = documentScope
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const ext = (file.name.split('.').pop() ?? 'png').toLowerCase()
      const filename = `sticker_${ts}.${ext}`
      const storagePath = `families/${familyId}/books/${bookId}/${filename}`
      const storageRef = ref(storage, storagePath)
      beginUpload(scope)
      try {
        await uploadBytes(storageRef, file)
        const url = await getDownloadURL(storageRef)
        const image: PageImage = {
          id: generateImageId(),
          url,
          storagePath,
          type: 'sticker',
          layerType: 'element',
          label,
          // Sticker default position: small + centered so it's clearly a movable sticker
          position: { x: 30, y: 30, width: 40, height: 40 },
        }
        applyUpdate((prev) => ({
          ...prev,
          pages: prev.pages.map((p) =>
            p.id === pageId
              ? { ...p, images: [...p.images, image], updatedAt: new Date().toISOString() }
              : p,
          ),
        }))
        endUpload(scope)
        return { url, storagePath }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('Sticker upload failed:', err)
        endUpload(scope, uploadNotAddedMessage('sticker', errMsg))
        return undefined
      }
    },
    [familyId, bookId, documentScope, applyUpdate, beginUpload, endUpload],
  )

  return {
    book,
    loading,
    saveState,
    saveErrorMessage,
    uploadErrorMessage,
    uploadBusy,
    clearUploadError,
    hasUnsavedEdits,
    hasOutstandingEdits,
    retrySave,
    updatePage,
    changePage,
    addPage,
    deletePage,
    reorderPages,
    updateBookMeta,
    addImageToPage,
    prepareBackgroundPhoto,
    prepareAiPageImage,
    removeImageFromPage,
    uploadAudio,
    addAiImageToPage,
    addStickerToPage,
    addStickerFileToPage,
    updateImagePosition,
    reorderImage,
    addSketchToPage,
    applySketchEnhancement,
    pickSketchVersion,
    restoreImageVersion,
    usedAiGeneration,
  }
}

export function useBookshelf(
  familyId: string,
  childId: string,
  loadAll?: boolean,
  identity?: ShelfIdentityState,
): UseBookshelfResult {
  const audienceIsFamily = !!loadAll
  // The family's audience does not depend on which child is selected, so it
  // does not depend on that child being known either.
  const identityKnown = audienceIsFamily || shelfIdentityKnown(identity)
  const scope = shelfQueryScope(familyId, childId, audienceIsFamily, identityKnown)
  const openingPhase = scope
    ? ShelfReadPhase.Pending
    : !audienceIsFamily && familyId && identity?.failed
      ? ShelfReadPhase.Unknown
      : ShelfReadPhase.Unsettled
  const ownerKey = ownerKeyFor(scope, openingPhase)
  const question: ShelfQuestion = {
    key: ownerKey,
    scope,
    familyId,
    childId,
    audienceIsFamily,
    phase: openingPhase,
  }

  const [state, setState] = useState<ShelfReadState>(() => openingState(nextOwner(0, question)))
  /**
   * The owner of this render, and the rows it is allowed to show.
   *
   * When the question has moved, this render already belongs to the NEW
   * incarnation: the previous owner's rows are gone in the SAME render — before
   * any effect runs — so a row this shelf may no longer show is never drawn,
   * never counted and never actionable through it. Setting state during render
   * is React's derive-from-input path: this render is thrown away and re-rendered
   * with exactly the value below, so the owner object the commit keeps is the one
   * every callback here closed over.
   */
  const ownerMoved = state.owner.key !== ownerKey
  const read = ownerMoved ? openingState(nextOwner(state.owner.id, question)) : state
  if (ownerMoved) setState(read)
  const owner = read.owner

  /** The latest read ASKED, so an earlier one's answer is never taken. */
  const lastRead = useRef(0)
  /**
   * Which incarnation's one automatic read has been asked for — bookkeeping
   * kept out of rendering, where the `requested` flag used to be mutated on the
   * owner itself. A render that is never committed must neither spend an
   * owner's read nor consume the committed owner's.
   */
  const startedFor = useRef(0)
  /**
   * The owner this hook has COMMITTED — the only one allowed to spend a read.
   *
   * Written in the commit's own layout phase and not in a passive effect: a
   * callback retained from the previous owner can be fired in the layout window
   * of the replacement commit, before any passive effect has run, and admission
   * has to be aligned with the commit rather than with the flush after it.
   *
   * What that window looks like, stated rather than hoped for. React runs a
   * commit's layout TEARDOWNS before its setups, so from the moment the owner
   * changes until this effect re-runs there is no live owner at all and every
   * retained callback — the replaced owner's included — asks nothing. After it,
   * the new owner's own retry is live for the rest of that same commit, which is
   * the half a passive effect would have got wrong. The one thing that is merely
   * deferred rather than exact: a retry fired from a layout effect that runs
   * EARLIER in this commit than this one (a child's, since a parent's hook sets
   * up after its children) finds the window empty and asks nothing — the owner's
   * one automatic read then asks for it in the passive flush that follows. And
   * because `apply` asks STATE rather than this ref for the final word, no answer
   * admitted anywhere in that window can land on an owner the screen has left.
   */
  const liveOwner = useRef<ShelfReadOwner | null>(null)
  const mounted = useRef(false)

  useLayoutEffect(() => {
    liveOwner.current = owner
    return () => {
      // Between a commit's teardowns and its setups there is no live owner at
      // all, and after unmount there is none again: a retained callback fired in
      // either window asks nothing.
      liveOwner.current = null
    }
  }, [owner])

  /**
   * Apply an ANSWER, if it is still this hook's to apply.
   *
   * Three refusals, each for a sequence that really happens: unmounted,
   * superseded by a later read (a retry), and answered for an owner that has
   * been replaced — including one whose key has since come back. The last one is
   * the UPDATE itself, because the committed state is what the screen is: an
   * answer whose incarnation is not the one in state changes nothing, and a
   * render that was thrown away never put its owner there to begin with.
   */
  const apply = useCallback(
    (forOwner: ShelfReadOwner, readSeq: number, next: Omit<ShelfReadState, 'owner'>) => {
      if (!mounted.current) return
      if (readSeq !== lastRead.current) return
      setState((prev) => (prev.owner.id === forOwner.id ? { owner: prev.owner, ...next } : prev))
    },
    [],
  )

  /**
   * May this owner ask at all? Scope, page, and the owner this hook committed.
   *
   * Read-only, and deliberately asked BEFORE anything is cleared: a retry that
   * is not admitted must not put the shelf that IS on screen back to pending on
   * its way out. A callback a gone page still holds asks nothing either — the
   * answer would have nowhere to land and the read would be paid for anyway.
   */
  const admits = useCallback(
    (forOwner: ShelfReadOwner) =>
      !!forOwner.scope && mounted.current && liveOwner.current?.id === forOwner.id,
    [],
  )

  /**
   * Ask one owner's query and SUBSCRIBE to its answer. Nothing else.
   *
   * No state is set before the request: an owner that has just been opened is
   * already `Pending` — that is what the render derived for it — so a loader
   * that re-states it would be a second source of truth for one fact, and from
   * the automatic effect it is also the setState an effect may not make. The
   * reset belongs to the one case where the current state really is something
   * else: the explicit retry EVENT, below. Sequence and started bookkeeping are
   * taken before the request, so the newest read always wins and an owner's
   * automatic read is spent exactly once however it was asked for.
   *
   * The answer is taken by SUBSCRIBING to the query's own promise rather than by
   * awaiting it. Nothing here is deferred and no extra promise is created: the
   * handlers are attached to the real read, and the read is the thing that
   * resolves them. What that buys is that this function's body is synchronous
   * and ends at the request, so the automatic effect below calls something that
   * sets no state of its own — the shape the lint rail reads as a subscription
   * instead of as an effect that resolves into an update.
   */
  const runRead = useCallback(
    (forOwner: ShelfReadOwner) => {
      // Admission, page and committed owner first — before a sequence is spent
      // or a request is paid for.
      if (!admits(forOwner)) return
      // Reserved BEFORE the query exists, so the newest read always wins and an
      // owner's automatic read is spent exactly once however it was asked for.
      lastRead.current += 1
      const readSeq = lastRead.current
      startedFor.current = forOwner.id
      return (
        forOwner.audienceIsFamily
          ? readFamilyShelf(forOwner.familyId)
          : readChildShelf(forOwner.familyId, forOwner.childId)
      ).then(
        (books) => {
          apply(forOwner, readSeq, { phase: ShelfReadPhase.Ready, books, error: false })
        },
        (err: unknown) => {
          console.error('Bookshelf read failed:', err)
          // A refused or dropped read is reported as one. It is not an empty
          // shelf, and a union that lost half of itself is not a shelf at all.
          apply(forOwner, readSeq, { phase: ShelfReadPhase.Error, books: [], error: true })
        },
      )
    },
    [admits, apply],
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    // One automatic read per owner, and the owner object is what changes — so a
    // parent's selected child, which is not part of the family's question, asks
    // nothing again, while a question left and returned to is asked afresh. It
    // asks and it does not SAY anything: this owner's pending state is the one
    // the render it arrived in already derived.
    if (startedFor.current === owner.id) return
    void runRead(owner)
  }, [owner, runRead])

  const retry = useCallback(() => {
    /**
     * The one ask that is a state change as well as a read, because it is the
     * one whose current state is an answer: a failure a child is looking at, or
     * rows from before. So it says *in flight* again, from an event, and then
     * asks.
     *
     * Admission first, and the reset only after it. Bound to the INCARNATION
     * this render belongs to and not to its key, so a retry retained across a
     * departure and a return is inert even though the same shelf is on screen
     * again — inert meaning it asks nothing AND resets nothing, which is why
     * the order of these two lines is the postcondition and not a style.
     */
    if (!admits(owner)) return
    setState((prev) => (prev.owner.id === owner.id ? openingState(prev.owner) : prev))
    void runRead(owner)
  }, [admits, owner, runRead])

  const createBook = useCallback(
    async (
      title: string,
      coverStyle: Book['coverStyle'],
      isTogetherBook?: boolean,
      contributorIds?: string[],
      attribution?: { createdBy: 'parent' | string; createdFor: string },
    ): Promise<string> => {
      const now = new Date().toISOString()
      const targetChildId = attribution?.createdFor ?? childId
      const newBook: Omit<Book, 'id'> = {
        childId: targetChildId,
        title,
        coverStyle,
        pages: [createEmptyPage(1)],
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        subjectBuckets: ['LanguageArts'],
        ...(attribution
          ? { createdBy: attribution.createdBy, createdFor: attribution.createdFor }
          : { createdBy: childId, createdFor: childId }),
        ...(isTogetherBook ? { isTogetherBook: true, contributorIds: contributorIds ?? [] } : {}),
      }
      const docRef = await addDoc(booksCollection(familyId), newBook as Book)
      const created = { ...newBook, id: docRef.id }
      /**
       * The optimistic row joins the view it was made in and no other: a create
       * that lands after the owner changed must not inject a row into the new
       * one's shelf. The phase is untouched — a created book is not an answer to
       * a read that failed or has not come back.
       */
      setState((prev) =>
        prev.owner.id === owner.id ? { ...prev, books: [created, ...prev.books] } : prev,
      )
      return docRef.id
    },
    [familyId, childId, owner],
  )

  const deleteBook = useCallback(
    async (bookId: string) => {
      if (!familyId) return
      await deleteDoc(doc(booksCollection(familyId), bookId))
      // Same ownership rule as the create above; the write itself is unchanged.
      setState((prev) =>
        prev.owner.id === owner.id
          ? { ...prev, books: prev.books.filter((b) => b.id !== bookId) }
          : prev,
      )
    },
    [familyId, owner],
  )

  return {
    books: read.books,
    // Exactly what it always meant: the read is in flight.
    loading: read.phase === ShelfReadPhase.Pending,
    phase: read.phase,
    error: read.error,
    retry,
    createBook,
    deleteBook,
  }
}

/** Hook to load the most recent draft book for a child (for "Continue your book" card). */
export function useDraftBook(familyId: string, childId: string): { draftBook: Book | null; loading: boolean } {
  const [draftBook, setDraftBook] = useState<Book | null>(null)
  const [loading, setLoading] = useState(!!familyId && !!childId)

  useEffect(() => {
    if (!familyId || !childId) return
    let cancelled = false
    const load = async () => {
      const q = query(
        booksCollection(familyId),
        where('childId', '==', childId),
        where('status', '==', 'draft'),
        orderBy('updatedAt', 'desc'),
      )
      const snap = await getDocs(q)
      if (cancelled) return
      if (!snap.empty) {
        const d = snap.docs[0]
        setDraftBook({ ...d.data(), id: d.id })
      }
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [familyId, childId])

  return { draftBook, loading }
}

/** Hook to load the most recent completed book for a child (for "Read your books" card). */
export function useCompletedBook(familyId: string, childId: string): { completedBook: Book | null; loading: boolean } {
  const [completedBook, setCompletedBook] = useState<Book | null>(null)
  const [loading, setLoading] = useState(!!familyId && !!childId)

  useEffect(() => {
    if (!familyId || !childId) return
    let cancelled = false
    const load = async () => {
      const q = query(
        booksCollection(familyId),
        where('childId', '==', childId),
        where('status', '==', 'complete'),
        orderBy('updatedAt', 'desc'),
      )
      const snap = await getDocs(q)
      if (cancelled) return
      if (!snap.empty) {
        const d = snap.docs[0]
        setCompletedBook({ ...d.data(), id: d.id })
      }
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [familyId, childId])

  return { completedBook, loading }
}
