import { useEffect, useMemo, useRef, useState } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { getDocs, orderBy, query, where } from 'firebase/firestore'

import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  bookProgressCollection,
  chapterResponsesCollection,
} from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { BookProgress, ChapterResponse } from '../../core/types'

function AudioPlayButton({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(url)
      audioRef.current.onended = () => setPlaying(false)
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }

  return (
    <Button
      size="small"
      startIcon={playing ? <PauseIcon /> : <PlayArrowIcon />}
      onClick={toggle}
      variant="outlined"
      sx={{ textTransform: 'none' }}
    >
      {playing ? 'Pause' : 'Listen'}
    </Button>
  )
}

function formatResponseDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** Parse chapter number from "Ch 5" or "Ch 5: Title" strings */
function parseChapterNumber(chapterStr: string): number | null {
  const m = chapterStr.match(/^Ch\s+(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

interface BookGroup {
  bookId: string | null
  bookTitle: string
  author: string
  totalChapters: number
  /** Pool items from bookProgress (gives us full chapter list + skipped state) */
  poolItems: Array<{
    chapter: number
    chapterTitle?: string
    answered: boolean
    skipped?: boolean
  }>
  /** Actual response docs for this book, keyed by chapter number */
  responsesByChapter: Map<number, ChapterResponse>
  /** Responses that couldn't be matched to a pool chapter number */
  unmatchedResponses: ChapterResponse[]
  completedAt?: string
}

export default function ChapterResponsesTab() {
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const [responses, setResponses] = useState<ChapterResponse[]>([])
  const [bookProgressList, setBookProgressList] = useState<BookProgress[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!familyId || !activeChild?.id) return
    let cancelled = false

    const loadData = async () => {
      try {
        const [responsesSnap, progressSnap] = await Promise.all([
          getDocs(
            query(
              chapterResponsesCollection(familyId),
              where('childId', '==', activeChild.id),
              orderBy('date', 'desc'),
            ),
          ),
          getDocs(
            query(
              bookProgressCollection(familyId),
              where('childId', '==', activeChild.id),
            ),
          ),
        ])

        if (cancelled) return

        const items = responsesSnap.docs.map((doc) => ({
          ...(doc.data() as ChapterResponse),
          id: doc.id,
        }))
        const progress = progressSnap.docs.map((doc) => ({
          ...(doc.data() as BookProgress),
          id: doc.id,
        }))

        setResponses(items)
        setBookProgressList(progress)
      } catch (err) {
        if (!cancelled) console.error('Failed to load chapter data:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [familyId, activeChild?.id])

  // Build book groups
  const bookGroups = useMemo(() => {
    // Index bookProgress by bookId and title for matching
    const progressByBookId = new Map<string, BookProgress>()
    const progressByTitle = new Map<string, BookProgress>()
    for (const bp of bookProgressList) {
      progressByBookId.set(bp.bookId, bp)
      progressByTitle.set(bp.bookTitle.toLowerCase(), bp)
    }

    // Track which responses have been placed into a group
    const placedResponseIds = new Set<string>()
    const groups = new Map<string, BookGroup>()

    // Create a group for each bookProgress entry
    for (const bp of bookProgressList) {
      const key = bp.bookId
      const answeredCount = bp.questionPool.filter((p) => p.answered).length
      const skippedCount = bp.questionPool.filter(
        (p) => p.answered && p.skipped,
      ).length

      groups.set(key, {
        bookId: bp.bookId,
        bookTitle: bp.bookTitle,
        author: bp.author,
        totalChapters: bp.totalChapters,
        poolItems: bp.questionPool.map((p) => ({
          chapter: p.chapter,
          chapterTitle: p.chapterTitle,
          answered: p.answered,
          skipped: p.skipped,
        })),
        responsesByChapter: new Map(),
        unmatchedResponses: [],
        completedAt:
          answeredCount - skippedCount > 0 || answeredCount === bp.questionPool.length
            ? bp.completedAt
            : undefined,
      })
    }

    // Place each response into a group
    for (const r of responses) {
      const rId = r.id ?? r.createdAt
      const chNum = parseChapterNumber(r.chapter)

      // Try bookId match first
      if (r.bookId && groups.has(r.bookId)) {
        const group = groups.get(r.bookId)!
        if (chNum != null) {
          // Keep earliest response per chapter (responses ordered desc, so last write wins — but we want first for display)
          if (!group.responsesByChapter.has(chNum)) {
            group.responsesByChapter.set(chNum, r)
          }
        } else {
          group.unmatchedResponses.push(r)
        }
        placedResponseIds.add(rId)
        continue
      }

      // Try title match
      const titleKey = (r.bookTitle || '').toLowerCase()
      if (titleKey && progressByTitle.has(titleKey)) {
        const bp = progressByTitle.get(titleKey)!
        const group = groups.get(bp.bookId)!
        if (chNum != null) {
          if (!group.responsesByChapter.has(chNum)) {
            group.responsesByChapter.set(chNum, r)
          }
        } else {
          group.unmatchedResponses.push(r)
        }
        placedResponseIds.add(rId)
        continue
      }
    }

    // Collect unplaced responses into "Other Books" grouped by title
    const otherByTitle = new Map<string, ChapterResponse[]>()
    for (const r of responses) {
      const rId = r.id ?? r.createdAt
      if (placedResponseIds.has(rId)) continue
      const key = r.bookTitle || 'Unknown Book'
      const list = otherByTitle.get(key) ?? []
      list.push(r)
      otherByTitle.set(key, list)
    }

    // Convert otherByTitle into BookGroup entries
    for (const [title, resps] of otherByTitle.entries()) {
      const key = `__other__${title}`
      const chapterNums = resps
        .map((r) => parseChapterNumber(r.chapter))
        .filter((n): n is number => n != null)
      const maxCh = chapterNums.length > 0 ? Math.max(...chapterNums) : resps.length

      const responsesByChapter = new Map<number, ChapterResponse>()
      const unmatched: ChapterResponse[] = []
      for (const r of resps) {
        const ch = parseChapterNumber(r.chapter)
        if (ch != null) {
          if (!responsesByChapter.has(ch)) responsesByChapter.set(ch, r)
        } else {
          unmatched.push(r)
        }
      }

      groups.set(key, {
        bookId: null,
        bookTitle: title,
        author: '',
        totalChapters: maxCh,
        poolItems: [], // No pool for legacy-only books
        responsesByChapter,
        unmatchedResponses: unmatched,
      })
    }

    // Sort: in-progress first, then completed, then other
    const sorted = Array.from(groups.values()).sort((a, b) => {
      const aIsOther = a.bookId == null
      const bIsOther = b.bookId == null
      if (aIsOther !== bIsOther) return aIsOther ? 1 : -1

      const aComplete = a.completedAt != null
      const bComplete = b.completedAt != null
      if (aComplete !== bComplete) return aComplete ? 1 : -1

      return a.bookTitle.localeCompare(b.bookTitle)
    })

    return sorted
  }, [responses, bookProgressList])

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography color="text.secondary">
          Loading chapter responses...
        </Typography>
      </Container>
    )
  }

  if (responses.length === 0 && bookProgressList.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <SectionCard title="Book Responses">
          <Typography color="text.secondary" sx={{ py: 2 }}>
            No chapter responses recorded yet.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            When {activeChild?.name ?? 'your child'} records thoughts on the
            read-aloud book, they&apos;ll appear here.
          </Typography>
        </SectionCard>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        {bookGroups.map((group) => (
          <BookAccordion key={group.bookId ?? group.bookTitle} group={group} />
        ))}
      </Stack>
    </Container>
  )
}

function BookAccordion({ group }: { group: BookGroup }) {
  const hasPool = group.poolItems.length > 0
  const answeredCount = hasPool
    ? group.poolItems.filter((p) => p.answered && !p.skipped).length
    : group.responsesByChapter.size
  const skippedCount = hasPool
    ? group.poolItems.filter((p) => p.skipped).length
    : 0
  const totalCount = hasPool ? group.poolItems.length : group.totalChapters

  // Build summary parts
  const summaryParts: string[] = []
  summaryParts.push(`${answeredCount} of ${totalCount} answered`)
  if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`)

  // Build chapter rows — use pool if available, otherwise just responses
  const chapterRows: Array<{
    chapter: number
    chapterTitle?: string
    state: 'answered' | 'skipped' | 'unanswered'
    response?: ChapterResponse
  }> = []

  if (hasPool) {
    for (const poolItem of group.poolItems) {
      const response = group.responsesByChapter.get(poolItem.chapter)
      chapterRows.push({
        chapter: poolItem.chapter,
        chapterTitle: poolItem.chapterTitle,
        state: poolItem.skipped
          ? 'skipped'
          : poolItem.answered
            ? 'answered'
            : 'unanswered',
        response,
      })
    }
  } else {
    // Legacy: build from responses only
    const chapters = Array.from(group.responsesByChapter.entries()).sort(
      ([a], [b]) => a - b,
    )
    for (const [ch, resp] of chapters) {
      chapterRows.push({
        chapter: ch,
        state: 'answered',
        response: resp,
      })
    }
  }

  // Sort chapter rows by chapter number
  chapterRows.sort((a, b) => a.chapter - b.chapter)

  return (
    <Accordion defaultExpanded={!group.completedAt}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{ width: '100%', pr: 1 }}
        >
          <Typography sx={{ fontSize: '1.5rem', lineHeight: 1 }}>
            {'\u{1F4D6}'}
          </Typography>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap>
              {group.bookTitle}
            </Typography>
            {group.author && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {group.author}
              </Typography>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {summaryParts.join(' \u00B7 ')}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1}>
          {chapterRows.map((row) => (
            <ChapterRow key={row.chapter} row={row} />
          ))}
          {/* Unmatched responses (no parseable chapter number) */}
          {group.unmatchedResponses.map((r) => (
            <Box
              key={r.id ?? r.createdAt}
              sx={{
                pl: 2,
                borderLeft: '3px solid',
                borderLeftColor: 'primary.light',
                py: 1,
              }}
            >
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  {formatResponseDate(r.date)} — {r.chapter}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontStyle: 'italic', lineHeight: 1.5 }}
                >
                  {r.question}
                </Typography>
                {r.audioUrl && (
                  <Box sx={{ mt: 0.5 }}>
                    <AudioPlayButton url={r.audioUrl} />
                  </Box>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}

function ChapterRow({
  row,
}: {
  row: {
    chapter: number
    chapterTitle?: string
    state: 'answered' | 'skipped' | 'unanswered'
    response?: ChapterResponse
  }
}) {
  const label = row.chapterTitle
    ? `Ch ${row.chapter}: ${row.chapterTitle}`
    : `Ch ${row.chapter}`

  if (row.state === 'unanswered') {
    return (
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ py: 0.75, opacity: 0.5 }}
      >
        <Typography variant="body2" sx={{ flex: 1 }}>
          {label}
        </Typography>
        <Chip label="Not yet" size="small" variant="outlined" />
      </Stack>
    )
  }

  if (row.state === 'skipped') {
    return (
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ py: 0.75, opacity: 0.5 }}
      >
        <Typography variant="body2" sx={{ flex: 1 }}>
          {label}
        </Typography>
        <Chip label="Skipped" size="small" variant="outlined" color="default" />
      </Stack>
    )
  }

  // Answered
  const r = row.response
  return (
    <Box
      sx={{
        pl: 2,
        borderLeft: '3px solid',
        borderLeftColor: 'primary.light',
        py: 1,
      }}
    >
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            {label}
          </Typography>
          {r && (
            <Typography variant="caption" color="text.secondary">
              {formatResponseDate(r.date)}
            </Typography>
          )}
        </Stack>
        {r && (
          <Typography
            variant="body2"
            sx={{ fontStyle: 'italic', lineHeight: 1.5, color: 'text.secondary' }}
          >
            {r.question}
          </Typography>
        )}
        {r?.audioUrl && (
          <Box sx={{ mt: 0.5 }}>
            <AudioPlayButton url={r.audioUrl} />
          </Box>
        )}
        {r?.textResponse && (
          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.primary' }}>
            {r.textResponse}
          </Typography>
        )}
        {!r && (
          <Typography variant="caption" color="text.secondary">
            Answered (response not recorded in this format)
          </Typography>
        )}
      </Stack>
    </Box>
  )
}
