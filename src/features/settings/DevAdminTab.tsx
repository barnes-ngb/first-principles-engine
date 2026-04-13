import { useState, useEffect, useCallback } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material'
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

import { useAI, TaskType } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  bookProgressCollection,
  bookProgressDocId,
  chapterBooksCollection,
  db,
} from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { BookProgress, ChapterBook, ChapterQuestionPoolItem } from '../../core/types'
import { SEED_CHAPTER_BOOKS } from '../../core/data/chapterBooks'
import { todayKey } from '../../core/utils/dateKey'
import { getWeekRange } from '../../core/utils/time'
import { parseDateYmd } from '../../core/utils/format'

type SundayDoc = {
  id: string
  date: string
  childId?: string
  blockCount: number
}

type StatusMsg = {
  severity: 'success' | 'error' | 'info'
  text: string
}

export default function DevAdminTab() {
  // ── Shared hooks ───────────────────────────────────────────────────
  const familyId = useFamilyId()
  const { activeChild, activeChildId: selectedChildId } = useActiveChild()
  const { chat: aiChat } = useAI()

  // ── Section A: Chapter Book Library ──────────────────────────────
  const [bookCount, setBookCount] = useState<number | null>(null)
  const [narniaExists, setNarniaExists] = useState<boolean | null>(null)
  const [loadingBooks, setLoadingBooks] = useState(false)
  const [status, setStatus] = useState<StatusMsg | null>(null)

  const refreshBookCount = useCallback(async () => {
    setLoadingBooks(true)
    try {
      const colRef = collection(db, 'chapterBooks')
      const snap = await getCountFromServer(colRef)
      setBookCount(snap.data().count)

      const narniaDoc = await getDoc(doc(db, 'chapterBooks', 'lion-witch-wardrobe'))
      setNarniaExists(narniaDoc.exists())
    } catch (err) {
      console.error('Failed to check chapterBooks', err)
      setStatus({ severity: 'error', text: `Failed to check chapterBooks: ${err}` })
    } finally {
      setLoadingBooks(false)
    }
  }, [])

  useEffect(() => {
    refreshBookCount()
  }, [refreshBookCount])

  const handleSeedNarnia = async () => {
    setLoadingBooks(true)
    setStatus(null)
    try {
      const book = SEED_CHAPTER_BOOKS[0]
      await setDoc(doc(db, 'chapterBooks', book.id), {
        ...book,
        createdAt: new Date().toISOString(),
      })
      setStatus({ severity: 'success', text: 'Narnia seeded successfully.' })
      await refreshBookCount()
    } catch (err) {
      console.error('Failed to seed Narnia', err)
      setStatus({ severity: 'error', text: `Seed failed: ${err}` })
    } finally {
      setLoadingBooks(false)
    }
  }

  // ── Section B: Stale Sunday DayLog Cleanup ──────────────────────
  const [sundayDocs, setSundayDocs] = useState<SundayDoc[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [scanStatus, setScanStatus] = useState<StatusMsg | null>(null)

  const handleScan = async () => {
    setScanning(true)
    setScanStatus(null)
    setSundayDocs([])
    setSelectedIds(new Set())
    try {
      const colRef = collection(db, `families/${familyId}/days`)
      const snap = await getDocs(colRef)
      const sundays: SundayDoc[] = []
      for (const d of snap.docs) {
        // Doc IDs are YYYY-MM-DD or YYYY-MM-DD_childId
        const dateStr = d.id.split('_')[0]
        const parsed = parseDateYmd(dateStr)
        if (parsed && parsed.getDay() === 0) {
          const data = d.data() as Record<string, unknown>
          sundays.push({
            id: d.id,
            date: dateStr,
            childId: (data.childId as string) || undefined,
            blockCount: Array.isArray(data.blocks) ? data.blocks.length : 0,
          })
        }
      }
      sundays.sort((a, b) => b.date.localeCompare(a.date))
      setSundayDocs(sundays)
      setScanStatus({
        severity: 'info',
        text: `Found ${sundays.length} Sunday DayLog doc(s).`,
      })
    } catch (err) {
      console.error('Scan failed', err)
      setScanStatus({ severity: 'error', text: `Scan failed: ${err}` })
    } finally {
      setScanning(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const deleteDocs = async (ids: string[]) => {
    setDeleting(true)
    setScanStatus(null)
    let deleted = 0
    for (const id of ids) {
      try {
        await deleteDoc(doc(db, `families/${familyId}/days`, id))
        deleted++
      } catch (err) {
        console.error(`Failed to delete ${id}`, err)
      }
    }
    setScanStatus({
      severity: 'success',
      text: `Deleted ${deleted} of ${ids.length} doc(s).`,
    })
    setSundayDocs((prev) => prev.filter((d) => !ids.includes(d.id)))
    setSelectedIds(new Set())
    setDeleting(false)
  }

  const handleDeleteSelected = () => deleteDocs([...selectedIds])
  const handleDeleteAll = () => {
    setConfirmDeleteAll(false)
    deleteDocs(sundayDocs.map((d) => d.id))
  }

  // ── Section C: Current Week Sanity Check ────────────────────────
  const [weekInfo, setWeekInfo] = useState<{
    weekStart: string
    weekDocPath: string
    readAloudBookId: string | null
    loaded: boolean
  } | null>(null)
  const [settingBook, setSettingBook] = useState(false)
  const [weekStatus, setWeekStatus] = useState<StatusMsg | null>(null)

  const refreshWeekInfo = useCallback(async () => {
    const range = getWeekRange()
    const weekDocPath = `families/${familyId}/weeks/${range.start}`
    try {
      const snap = await getDoc(doc(db, weekDocPath))
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null
      setWeekInfo({
        weekStart: range.start,
        weekDocPath,
        readAloudBookId: (data?.readAloudBookId as string) || null,
        loaded: true,
      })
    } catch (err) {
      console.error('Failed to load week doc', err)
      setWeekStatus({ severity: 'error', text: `Failed to load week doc: ${err}` })
    }
  }, [familyId])

  useEffect(() => {
    refreshWeekInfo()
  }, [refreshWeekInfo])

  const handleSetReadAloudBook = async () => {
    if (!weekInfo) return
    setSettingBook(true)
    setWeekStatus(null)
    try {
      const weekDocRef = doc(db, weekInfo.weekDocPath)
      const snap = await getDoc(weekDocRef)
      if (snap.exists()) {
        await updateDoc(weekDocRef, { readAloudBookId: 'lion-witch-wardrobe' })
      } else {
        await setDoc(weekDocRef, {
          startDate: weekInfo.weekStart,
          readAloudBookId: 'lion-witch-wardrobe',
        })
      }
      setWeekStatus({ severity: 'success', text: 'readAloudBookId set.' })
      await refreshWeekInfo()
    } catch (err) {
      console.error('Failed to set readAloudBookId', err)
      setWeekStatus({ severity: 'error', text: `Failed: ${err}` })
    } finally {
      setSettingBook(false)
    }
  }

  // ── Section D: Generate Chapter Questions ────────────────────────
  const [poolStatus, setPoolStatus] = useState<StatusMsg | null>(null)
  const [generatingPool, setGeneratingPool] = useState(false)
  const [poolInfo, setPoolInfo] = useState<{
    bookId: string
    bookTitle: string
    totalChapters: number
    poolCount: number
    loaded: boolean
  } | null>(null)

  useEffect(() => {
    if (!weekInfo?.readAloudBookId || !selectedChildId || !familyId) {
      setPoolInfo(null)
      return
    }
    const bookId = weekInfo.readAloudBookId
    const check = async () => {
      try {
        const bookSnap = await getDoc(doc(chapterBooksCollection(), bookId))
        const book = bookSnap.exists() ? (bookSnap.data() as ChapterBook) : null
        if (!book) { setPoolInfo(null); return }

        const progressId = bookProgressDocId(selectedChildId, bookId)
        const progressSnap = await getDoc(doc(bookProgressCollection(familyId), progressId))
        const progress = progressSnap.exists() ? (progressSnap.data() as BookProgress) : null

        setPoolInfo({
          bookId,
          bookTitle: book.title ?? bookId,
          totalChapters: book.totalChapters ?? book.chapters?.length ?? 0,
          poolCount: progress?.questionPool?.length ?? 0,
          loaded: true,
        })
      } catch (err) {
        console.error('Failed to check pool info', err)
        setPoolInfo(null)
      }
    }
    void check()
  }, [weekInfo?.readAloudBookId, selectedChildId, familyId])

  const handleGenerateChapterQuestions = async () => {
    if (!weekInfo?.readAloudBookId || !selectedChildId || !familyId) return
    setGeneratingPool(true)
    setPoolStatus(null)
    try {
      const bookId = weekInfo.readAloudBookId
      const bookSnap = await getDoc(doc(chapterBooksCollection(), bookId))
      const book = bookSnap.exists() ? ({ ...bookSnap.data(), id: bookSnap.id } as ChapterBook) : null
      if (!book) {
        setPoolStatus({ severity: 'error', text: `Book ${bookId} not found in library.` })
        setGeneratingPool(false)
        return
      }

      const progressId = bookProgressDocId(selectedChildId, bookId)
      const progressRef = doc(bookProgressCollection(familyId), progressId)
      const progressSnap = await getDoc(progressRef)
      const existing = progressSnap.exists() ? (progressSnap.data() as BookProgress) : null

      const existingChapters = existing?.questionPool?.map((q) => q.chapter) ?? []
      const missingChapters = book.chapters?.filter(
        (c) => !existingChapters.includes(c.number),
      ) ?? []

      if (missingChapters.length === 0) {
        setPoolStatus({ severity: 'info', text: 'All chapters already have questions.' })
        setGeneratingPool(false)
        return
      }

      const result = await aiChat({
        familyId,
        childId: selectedChildId,
        taskType: TaskType.ChapterQuestions,
        messages: [{
          role: 'user',
          content: JSON.stringify({
            bookTitle: book.title,
            author: book.author,
            chapters: missingChapters,
            childName: activeChild?.name,
          }),
        }],
      })

      if (!result?.message) {
        setPoolStatus({ severity: 'error', text: 'AI returned empty response.' })
        setGeneratingPool(false)
        return
      }

      let questions: Array<{ chapter: number; questionType: string; question: string }> = []
      try {
        const parsed = JSON.parse(result.message) as unknown
        questions = Array.isArray(parsed) ? parsed as typeof questions : []
      } catch {
        setPoolStatus({ severity: 'error', text: 'Failed to parse AI response.' })
        setGeneratingPool(false)
        return
      }

      const newPoolItems: ChapterQuestionPoolItem[] = questions.map((q) => ({
        chapter: q.chapter,
        chapterTitle: book.chapters?.find((c) => c.number === q.chapter)?.title,
        questionType: q.questionType as ChapterQuestionPoolItem['questionType'],
        question: q.question,
        answered: false,
      }))

      if (existing) {
        await updateDoc(progressRef, {
          questionPool: [...existing.questionPool, ...newPoolItems],
          updatedAt: new Date().toISOString(),
        })
      } else {
        const newProgress: BookProgress = {
          bookId: book.id,
          childId: selectedChildId,
          bookTitle: book.title,
          author: book.author,
          totalChapters: book.totalChapters,
          questionPool: newPoolItems,
          startedAt: todayKey(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        await setDoc(progressRef, newProgress)
      }

      setPoolStatus({ severity: 'success', text: `Generated ${newPoolItems.length} chapter questions!` })
      // Refresh pool info
      setPoolInfo((prev) => prev ? { ...prev, poolCount: (prev.poolCount ?? 0) + newPoolItems.length } : prev)
    } catch (err) {
      console.error('Failed to generate chapter questions', err)
      setPoolStatus({ severity: 'error', text: `Failed: ${err}` })
    } finally {
      setGeneratingPool(false)
    }
  }

  const showGenButton = poolInfo?.loaded && weekInfo?.readAloudBookId &&
    (poolInfo.poolCount === 0 || poolInfo.poolCount < poolInfo.totalChapters)

  return (
    <Stack spacing={4}>
      {/* ── Section A: Chapter Book Library ─────────────────────── */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Chapter Book Library
        </Typography>
        {loadingBooks && bookCount === null ? (
          <CircularProgress size={24} />
        ) : (
          <Typography variant="body2" color="text.secondary" gutterBottom>
            <code>chapterBooks</code> collection: <strong>{bookCount ?? '?'}</strong> book(s)
          </Typography>
        )}
        {narniaExists === false && (
          <Button
            variant="contained"
            onClick={handleSeedNarnia}
            disabled={loadingBooks}
            sx={{ mt: 1, minHeight: 48 }}
          >
            {loadingBooks ? <CircularProgress size={20} /> : 'Seed Narnia'}
          </Button>
        )}
        {narniaExists === true && (
          <Chip label="Narnia present" color="success" size="small" sx={{ mt: 1 }} />
        )}
        {status && (
          <Alert severity={status.severity} sx={{ mt: 1 }}>
            {status.text}
          </Alert>
        )}
      </Box>

      <Divider />

      {/* ── Section B: Stale Sunday DayLog Cleanup ─────────────── */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Stale Sunday DayLog Cleanup
        </Typography>
        <Button
          variant="outlined"
          onClick={handleScan}
          disabled={scanning}
          sx={{ minHeight: 48 }}
        >
          {scanning ? <CircularProgress size={20} /> : 'Scan for Sunday DayLogs'}
        </Button>

        {scanStatus && (
          <Alert severity={scanStatus.severity} sx={{ mt: 1 }}>
            {scanStatus.text}
          </Alert>
        )}

        {sundayDocs.length > 0 && (
          <Stack spacing={1} sx={{ mt: 2 }}>
            {sundayDocs.map((d) => (
              <FormControlLabel
                key={d.id}
                control={
                  <Checkbox
                    checked={selectedIds.has(d.id)}
                    onChange={() => toggleSelect(d.id)}
                  />
                }
                label={
                  <Typography variant="body2" component="span">
                    <code>{d.id}</code> &mdash; {d.date}
                    {d.childId ? ` (${d.childId})` : ''}, {d.blockCount} block(s)
                  </Typography>
                }
              />
            ))}

            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
              <Button
                variant="contained"
                color="warning"
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0 || deleting}
                sx={{ minHeight: 48 }}
              >
                {deleting ? <CircularProgress size={20} /> : `Delete Selected (${selectedIds.size})`}
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={() => setConfirmDeleteAll(true)}
                disabled={deleting}
                sx={{ minHeight: 48 }}
              >
                Delete All Sunday DayLogs
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>

      {/* Confirm dialog for Delete All */}
      <Dialog open={confirmDeleteAll} onClose={() => setConfirmDeleteAll(false)}>
        <DialogTitle>Confirm Delete All</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete all {sundayDocs.length} Sunday DayLog doc(s)? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteAll(false)}>Cancel</Button>
          <Button onClick={handleDeleteAll} color="error" variant="contained">
            Delete All
          </Button>
        </DialogActions>
      </Dialog>

      <Divider />

      {/* ── Section C: Current Week Sanity Check ───────────────── */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Current Week Sanity Check
        </Typography>
        {weekInfo?.loaded ? (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Week start (Sunday): <strong>{weekInfo.weekStart}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Week doc: <code>{weekInfo.weekDocPath}</code>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              readAloudBookId:{' '}
              <strong>{weekInfo.readAloudBookId ?? <em>not set</em>}</strong>
            </Typography>
            {!weekInfo.readAloudBookId && (
              <Button
                variant="contained"
                onClick={handleSetReadAloudBook}
                disabled={settingBook}
                sx={{ mt: 1, minHeight: 48, alignSelf: 'flex-start' }}
              >
                {settingBook ? (
                  <CircularProgress size={20} />
                ) : (
                  'Set readAloudBookId to lion-witch-wardrobe'
                )}
              </Button>
            )}
            {weekInfo.readAloudBookId && (
              <Chip
                label={`Book: ${weekInfo.readAloudBookId}`}
                color="success"
                size="small"
                sx={{ alignSelf: 'flex-start' }}
              />
            )}
            {weekStatus && (
              <Alert severity={weekStatus.severity} sx={{ mt: 1 }}>
                {weekStatus.text}
              </Alert>
            )}
          </Stack>
        ) : (
          <CircularProgress size={24} />
        )}
      </Box>

      <Divider />

      {/* ── Section D: Generate Chapter Questions ─────────────── */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Generate Chapter Questions
        </Typography>
        {poolInfo?.loaded ? (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Book: <strong>{poolInfo.bookTitle}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Pool: <strong>{poolInfo.poolCount}</strong> / {poolInfo.totalChapters} chapters
            </Typography>
            {selectedChildId && (
              <Typography variant="body2" color="text.secondary">
                Child: <strong>{activeChild?.name ?? selectedChildId}</strong>
              </Typography>
            )}
            {showGenButton && (
              <Button
                variant="contained"
                onClick={() => void handleGenerateChapterQuestions()}
                disabled={generatingPool}
                sx={{ mt: 1, minHeight: 48, alignSelf: 'flex-start' }}
              >
                {generatingPool ? (
                  <CircularProgress size={20} />
                ) : (
                  'Generate Chapter Questions Now'
                )}
              </Button>
            )}
            {poolInfo.poolCount > 0 && poolInfo.poolCount >= poolInfo.totalChapters && (
              <Chip
                label="All chapters have questions"
                color="success"
                size="small"
                sx={{ alignSelf: 'flex-start' }}
              />
            )}
            {poolStatus && (
              <Alert severity={poolStatus.severity} sx={{ mt: 1 }}>
                {poolStatus.text}
              </Alert>
            )}
          </Stack>
        ) : weekInfo?.readAloudBookId ? (
          <CircularProgress size={24} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            No read-aloud book set for this week.
          </Typography>
        )}
      </Box>
    </Stack>
  )
}
