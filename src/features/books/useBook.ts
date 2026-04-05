import { useCallback, useEffect, useRef, useState } from 'react'
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

import { artifactsCollection, booksCollection, hoursCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { useDebounce } from '../../core/hooks/useDebounce'
import type { Artifact, Book, BookPage, PageImage, StickerTag } from '../../core/types'
import type { SaveState } from '../../components/SaveIndicator'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { createEmptyPage, generateImageId } from './bookTypes'
import { cleanSketchBackground } from './cleanSketch'

interface UseBookResult {
  book: Book | null
  loading: boolean
  saveState: SaveState
  updatePage: (pageId: string, changes: Partial<BookPage>) => void
  addPage: () => void
  deletePage: (pageId: string) => void
  reorderPages: (fromIndex: number, toIndex: number) => void
  updateBookMeta: (changes: Partial<Pick<Book, 'title' | 'status' | 'coverStyle' | 'coverImageUrl' | 'subjectBuckets' | 'isTogetherBook' | 'contributorIds' | 'theme'>>) => void
  addImageToPage: (pageId: string, file: File, options?: { cleanBackground?: boolean }) => Promise<void>
  removeImageFromPage: (pageId: string, imageId: string) => void
  uploadAudio: (pageId: string, blob: Blob) => Promise<void>
  addAiImageToPage: (pageId: string, url: string, storagePath: string, prompt: string) => void
  addStickerToPage: (pageId: string, stickerUrl: string, storagePath: string, label: string, tags?: StickerTag[]) => void
  updateImagePosition: (pageId: string, imageId: string, position: PageImage['position']) => void
  /** Add a hand-drawn sketch photo to a page. Returns the image ID and storage path for later enhancement. */
  addSketchToPage: (pageId: string, file: File) => Promise<{ imageId: string; storagePath: string } | undefined>
  /** Update a sketch PageImage after AI enhancement resolves. */
  applySketchEnhancement: (pageId: string, imageId: string, enhancedUrl: string, enhancedStoragePath: string) => void
  /** Switch which version (original vs enhanced) is the active URL for a sketch image. */
  pickSketchVersion: (pageId: string, imageId: string, version: 'original' | 'enhanced') => void
  /** Whether this session used AI image generation (for Art hours) */
  usedAiGeneration: boolean
}

interface UseBookshelfResult {
  books: Book[]
  loading: boolean
  createBook: (title: string, coverStyle: Book['coverStyle'], isTogetherBook?: boolean, contributorIds?: string[]) => Promise<string>
  deleteBook: (bookId: string) => Promise<void>
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

export function useBook(familyId: string, bookId: string | undefined): UseBookResult {
  const [book, setBook] = useState<Book | null>(null)
  const [loading, setLoading] = useState(!!familyId && !!bookId)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [usedAiGeneration, setUsedAiGeneration] = useState(false)

  // Session time tracking
  const sessionStartRef = useRef<number>(Date.now())
  const hoursLoggedRef = useRef(false)

  // Reset session timer on mount
  useEffect(() => {
    sessionStartRef.current = Date.now()
    hoursLoggedRef.current = false
  }, [bookId])

  // Log hours on unmount (navigate away / close)
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

  // Load book
  useEffect(() => {
    if (!familyId || !bookId) return
    let cancelled = false
    const load = async () => {
      const docRef = doc(booksCollection(familyId), bookId)
      const snap = await getDoc(docRef)
      if (cancelled) return
      if (snap.exists()) {
        setBook({ ...snap.data(), id: snap.id })
      }
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [familyId, bookId])

  // Persist to Firestore
  const persist = useCallback(
    async (updated: Book) => {
      if (!familyId || !bookId) return
      setSaveState('saving')
      try {
        const docRef = doc(booksCollection(familyId), bookId)
        const { id, ...data } = updated
        void id
        await setDoc(docRef, { ...data, updatedAt: new Date().toISOString() })
        setSaveState('saved')
      } catch (err) {
        console.error('Book save failed:', err)
        setSaveState('error')
      }
    },
    [familyId, bookId],
  )

  const debouncedPersist = useDebounce(persist, 500)

  const applyUpdate = useCallback(
    (updater: (prev: Book) => Book) => {
      setBook((prev) => {
        if (!prev) return prev
        const next = updater(prev)
        debouncedPersist(next)
        return next
      })
    },
    [debouncedPersist],
  )

  const updatePage = useCallback(
    (pageId: string, changes: Partial<BookPage>) => {
      applyUpdate((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.id === pageId ? { ...p, ...changes, updatedAt: new Date().toISOString() } : p,
        ),
      }))
    },
    [applyUpdate],
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
    (changes: Partial<Pick<Book, 'title' | 'status' | 'coverStyle' | 'coverImageUrl' | 'subjectBuckets' | 'isTogetherBook' | 'contributorIds' | 'theme'>>) => {
      applyUpdate((prev) => {
        const next = { ...prev, ...changes }
        // If status changes to 'complete', create portfolio artifact + award XP
        if (changes.status === 'complete' && prev.status !== 'complete') {
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
          void addXpEvent(
            familyId,
            prev.childId,
            'BOOK_COMPLETE',
            5,
            `book_complete_${bookId}-diamond`,
            { title: next.title },
            { currencyType: 'diamond', category: 'earn' },
          )
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
      try {
        await uploadBytes(storageRef, processedFile)
        const url = await getDownloadURL(storageRef)

        // Smart default position: overlay size if layering on existing image
        const overlayPosition = isOverlay
          ? { x: 10, y: 10, width: 40, height: 40 }
          : undefined

        const image: PageImage = {
          id: imageId,
          url,
          storagePath,
          type: 'photo',
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
        console.error('Image upload failed:', err)
        setSaveState('error')
      }
    },
    [familyId, bookId, applyUpdate, book],
  )

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
        console.error('Audio upload failed:', err)
        setSaveState('error')
      }
    },
    [familyId, bookId, applyUpdate],
  )

  const addAiImageToPage = useCallback(
    (pageId: string, url: string, storagePath: string, prompt: string) => {
      setUsedAiGeneration(true)
      const image: PageImage = {
        id: generateImageId(),
        url,
        storagePath,
        type: 'ai-generated',
        prompt,
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

  const updateImagePosition = useCallback(
    (pageId: string, imageId: string, position: PageImage['position']) => {
      applyUpdate((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.id === pageId
            ? {
                ...p,
                images: p.images.map((img) =>
                  img.id === imageId ? { ...img, position } : img,
                ),
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      }))
    },
    [applyUpdate],
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
      try {
        await uploadBytes(storageRef, processedSketch)
        const url = await getDownloadURL(storageRef)

        const image: PageImage = {
          id: imageId,
          url,
          storagePath,
          type: 'sketch',
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
        console.error('Sketch upload failed:', err)
        setSaveState('error')
        return undefined
      }
    },
    [familyId, bookId, applyUpdate, book],
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
                images: p.images.map((img) =>
                  img.id === imageId
                    ? { ...img, enhancedUrl, enhancedStoragePath }
                    : img,
                ),
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
                  return { ...img, url: newUrl, style: newStyle }
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

  return {
    book,
    loading,
    saveState,
    updatePage,
    addPage,
    deletePage,
    reorderPages,
    updateBookMeta,
    addImageToPage,
    removeImageFromPage,
    uploadAudio,
    addAiImageToPage,
    addStickerToPage,
    updateImagePosition,
    addSketchToPage,
    applySketchEnhancement,
    pickSketchVersion,
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
    async (title: string, coverStyle: Book['coverStyle'], isTogetherBook?: boolean, contributorIds?: string[]): Promise<string> => {
      const now = new Date().toISOString()
      const newBook: Omit<Book, 'id'> = {
        childId,
        title,
        coverStyle,
        pages: [createEmptyPage(1)],
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        subjectBuckets: ['LanguageArts'],
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
