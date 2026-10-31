import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
   * A file that did not reach Storage, kept APART from `saveState` (UX-473).
   * Re-writing the document cannot repair it and a document write that then
   * succeeds must not be allowed to imply the picture or the sound arrived, so
   * this is its own statement and a successful save does not clear it.
   */
  uploadErrorMessage: string | null
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
  books: Book[]
  loading: boolean
  createBook: (
    title: string,
    coverStyle: Book['coverStyle'],
    isTogetherBook?: boolean,
    contributorIds?: string[],
    attribution?: { createdBy: 'parent' | string; createdFor: string },
  ) => Promise<string>
  deleteBook: (bookId: string) => Promise<void>
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

  /**
   * A file that never reached Storage (UX-473).
   *
   * It is reported SEPARATELY from `saveState` on purpose. These used to share
   * one slot, which made the editor capable of two lies at once: a kid whose
   * photo failed while her typing was still pending saw a *Try again* that
   * cannot re-upload anything, and a document write that then succeeded flipped
   * the indicator to "Saved" over a page whose picture was still missing. So
   * this says only its own true thing, a successful save does not clear it, and
   * the document's own status is left to the document.
   */
  const failUpload = useCallback((message: string) => {
    setUploadErrorMessage(message)
    // Hand the document's status back. A dirty draft still has its own write to
    // report and must keep it; a clean one is simply unchanged, so the 'saving'
    // this upload set is over and 'idle' is the honest reading.
    setSaveState((current) =>
      current === 'saving' && !outstandingRef.current.dirty ? 'idle' : current,
    )
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

      setSaveState('saving')
      setUploadErrorMessage(null)
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
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('Image upload failed:', err)
        failUpload(`That picture didn't upload: ${errMsg}`)
      }
    },
    [familyId, bookId, applyUpdate, book, failUpload],
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
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `audio_${pageId}_${ts}.webm`
      const storagePath = `families/${familyId}/books/${bookId}/${filename}`
      const storageRef = ref(storage, storagePath)

      setSaveState('saving')
      setUploadErrorMessage(null)
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
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('Audio upload failed:', err)
        failUpload(`That recording didn't upload: ${errMsg}`)
      }
    },
    [familyId, bookId, applyUpdate, failUpload],
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

      setSaveState('saving')
      setUploadErrorMessage(null)
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

        return { imageId, storagePath }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('Sketch upload failed:', err)
        failUpload(`That drawing didn't upload: ${errMsg}`)
        return undefined
      }
    },
    [familyId, bookId, applyUpdate, book, failUpload],
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
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const ext = (file.name.split('.').pop() ?? 'png').toLowerCase()
      const filename = `sticker_${ts}.${ext}`
      const storagePath = `families/${familyId}/books/${bookId}/${filename}`
      const storageRef = ref(storage, storagePath)
      setSaveState('saving')
      setUploadErrorMessage(null)
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
        return { url, storagePath }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('Sticker upload failed:', err)
        failUpload(`That sticker didn't upload: ${errMsg}`)
        return undefined
      }
    },
    [familyId, bookId, applyUpdate, failUpload],
  )

  return {
    book,
    loading,
    saveState,
    saveErrorMessage,
    uploadErrorMessage,
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

export function useBookshelf(familyId: string, childId: string, loadAll?: boolean): UseBookshelfResult {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(!!familyId && (!!childId || !!loadAll))

  useEffect(() => {
    if (!familyId || (!childId && !loadAll)) return
    let cancelled = false
    const load = async () => {
      if (loadAll) {
        // Parent view: load ALL books for the family
        const allQ = query(
          booksCollection(familyId),
          orderBy('updatedAt', 'desc'),
        )
        const snap = await getDocs(allQ)
        if (cancelled) return
        const all = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        setBooks(all)
        setLoading(false)
        return
      }

      // Load books where childId matches OR child is a contributor (Together Books)
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
      if (cancelled) return

      const bookMap = new Map<string, Book>()
      for (const d of ownSnap.docs) {
        bookMap.set(d.id, { ...d.data(), id: d.id })
      }
      for (const d of togetherSnap.docs) {
        if (!bookMap.has(d.id)) {
          bookMap.set(d.id, { ...d.data(), id: d.id })
        }
      }
      const all = [...bookMap.values()].sort(
        (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
      )
      setBooks(all)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [familyId, childId, loadAll])

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
      setBooks((prev) => [created, ...prev])
      return docRef.id
    },
    [familyId, childId],
  )

  const deleteBook = useCallback(
    async (bookId: string) => {
      if (!familyId) return
      await deleteDoc(doc(booksCollection(familyId), bookId))
      setBooks((prev) => prev.filter((b) => b.id !== bookId))
    },
    [familyId],
  )

  return { books, loading, createBook, deleteBook }
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
