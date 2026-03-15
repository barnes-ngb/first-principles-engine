import { useCallback, useEffect, useState } from 'react'
import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

import { booksCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { useDebounce } from '../../core/hooks/useDebounce'
import type { Book, BookPage, PageImage } from '../../core/types/domain'
import type { SaveState } from '../../components/SaveIndicator'
import { createEmptyPage, generateImageId } from './bookTypes'

interface UseBookResult {
  book: Book | null
  loading: boolean
  saveState: SaveState
  updatePage: (pageId: string, changes: Partial<BookPage>) => void
  addPage: () => void
  deletePage: (pageId: string) => void
  reorderPages: (fromIndex: number, toIndex: number) => void
  updateBookMeta: (changes: Partial<Pick<Book, 'title' | 'status' | 'coverStyle' | 'subjectBuckets'>>) => void
  addImageToPage: (pageId: string, file: File) => Promise<void>
  removeImageFromPage: (pageId: string, imageId: string) => void
}

interface UseBookshelfResult {
  books: Book[]
  loading: boolean
  createBook: (title: string, coverStyle: Book['coverStyle']) => Promise<string>
}

export function useBook(familyId: string, bookId: string | undefined): UseBookResult {
  const [book, setBook] = useState<Book | null>(null)
  const [loading, setLoading] = useState(!!familyId && !!bookId)
  const [saveState, setSaveState] = useState<SaveState>('idle')

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
        const { id: _id, ...data } = updated
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
    (changes: Partial<Pick<Book, 'title' | 'status' | 'coverStyle' | 'subjectBuckets'>>) => {
      applyUpdate((prev) => ({ ...prev, ...changes }))
    },
    [applyUpdate],
  )

  const addImageToPage = useCallback(
    async (pageId: string, file: File) => {
      if (!familyId || !bookId) return
      const imageId = generateImageId()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `${ts}.${ext}`
      const storagePath = `families/${familyId}/books/${bookId}/${filename}`
      const storageRef = ref(storage, storagePath)

      setSaveState('saving')
      try {
        await uploadBytes(storageRef, file)
        const url = await getDownloadURL(storageRef)
        const image: PageImage = {
          id: imageId,
          url,
          storagePath,
          type: 'photo',
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
    [familyId, bookId, applyUpdate],
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
  }
}

export function useBookshelf(familyId: string, childId: string): UseBookshelfResult {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(!!familyId && !!childId)

  useEffect(() => {
    if (!familyId || !childId) return
    let cancelled = false
    const load = async () => {
      const q = query(
        booksCollection(familyId),
        where('childId', '==', childId),
        orderBy('updatedAt', 'desc'),
      )
      const snap = await getDocs(q)
      if (cancelled) return
      setBooks(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [familyId, childId])

  const createBook = useCallback(
    async (title: string, coverStyle: Book['coverStyle']): Promise<string> => {
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
      }
      const docRef = await addDoc(booksCollection(familyId), newBook as Book)
      const created = { ...newBook, id: docRef.id }
      setBooks((prev) => [created, ...prev])
      return docRef.id
    },
    [familyId, childId],
  )

  return { books, loading, createBook }
}
