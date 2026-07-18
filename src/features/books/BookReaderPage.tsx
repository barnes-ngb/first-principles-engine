import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { artifactsCollection, hoursCollection } from '../../core/firebase/firestore'
import type { Book, BookPage } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { addDiamondEvent } from '../../core/xp/addDiamondEvent'
import { DIAMOND_EVENTS } from '../../core/types'
import { useBook } from './useBook'
import { printBook } from './printBook'
import PrintSettingsDialog from './PrintSettingsDialog'
import type { PrintSettings } from './PrintSettingsDialog'
import { TEXT_SIZE_STYLES, TEXT_FONT_FAMILIES } from './bookTypes'
import { renderInteractiveText } from './highlightSightWords'
import { useSightWordProgress } from './useSightWordProgress'
import { useComprehensionQuestions } from './useComprehensionQuestions'
import ComprehensionQuestions from './ComprehensionQuestions'
import AskMePanel from './AskMePanel'
import { buildReadingCompletionContent, buildReadingHoursNotes } from './readingLog.logic'

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

/** Create a portfolio artifact when a book is read to completion */
async function logReadingCompletion(
  familyId: string,
  book: Book,
  childName: string,
  audience?: string,
): Promise<void> {
  const coverUrl = book.coverImageUrl ?? book.pages.find(p => p.images.length > 0)?.images[0]?.url

  await addDoc(artifactsCollection(familyId), {
    childId: book.childId,
    title: `Read "${book.title}"`,
    type: coverUrl ? EvidenceType.Photo : EvidenceType.Note,
    content: buildReadingCompletionContent(book, childName, audience),
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

/** Story Call audience chips — "Who did you read to?" (skippable). */
const AUDIENCE_OPTIONS = ['Grandma', 'Grandpa', 'Someone else'] as const

export default function BookReaderPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childName = activeChild?.name ?? ''
  const childId = activeChild?.id ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'

  // Story Call mode (?call=1): a screen-shared read-aloud to a far-away grandparent.
  // Presentation only — larger art/text, parent/utility chrome hidden, Ask-Me back
  // cover instead of the comprehension check. Completion / hours / XP run unchanged.
  const [searchParams] = useSearchParams()
  const isCallMode = searchParams.get('call') === '1'

  const { book, loading } = useBook(familyId, bookId)
  const isSightWordBook = (book?.sightWords?.length ?? 0) > 0
  const { progressMap, recordInteraction } = useSightWordProgress(
    familyId,
    childId,
  )

  const childAge = isLincoln ? 10 : 6
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
  const seenPagesRef = useRef<Set<number>>(new Set())

  // TTS read-aloud state
  const [isReading, setIsReading] = useState(false)

  // Session tracking
  const sessionStartRef = useRef<number>(Date.now())
  const pagesViewedRef = useRef<Set<number>>(new Set())
  const completedRef = useRef(false)
  const hoursLoggedRef = useRef(false)
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
    // 2. Child's working words that appear in this book's text
    const allBookText = book.pages.map((p) => p.text ?? '').join(' ').toLowerCase()
    const workingWords = [...progressMap.values()]
      .filter((w) => w.masteryLevel === 'new' || w.masteryLevel === 'practicing')
      .filter((w) => allBookText.includes(w.word.toLowerCase()))
      .map((w) => w.word)
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

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart === null) return
      const diff = e.changedTouches[0].clientX - touchStart
      if (Math.abs(diff) > SWIPE_THRESHOLD) {
        if (diff > 0 && currentPage > 0) setCurrentPage((p) => p - 1)
        if (diff < 0 && currentPage < totalPages - 1) setCurrentPage((p) => p + 1)
      }
      setTouchStart(null)
      setSwipeOffset(0)
    },
    [touchStart, currentPage, totalPages],
  )

  // Record sight word encounters when viewing a page
  useEffect(() => {
    if (!isSightWordBook || !book) return
    const contentPageIndex = currentPage - contentPageOffset
    if (contentPageIndex < 0 || contentPageIndex >= book.pages.length) return
    if (seenPagesRef.current.has(contentPageIndex)) return
    seenPagesRef.current.add(contentPageIndex)

    const page = book.pages[contentPageIndex]
    const wordsOnPage = page.sightWordsOnPage ?? []
    const uniqueWords = [...new Set(wordsOnPage.map(w => w.toLowerCase()))]
    setTotalWordsEncountered(prev => prev + uniqueWords.length)

    // Batch record 'seen' for each unique word on this page
    for (const word of uniqueWords) {
      void recordInteraction(word, 'seen')
    }
  }, [currentPage, isSightWordBook, book, recordInteraction, contentPageOffset])

  // Track which pages have been viewed
  useEffect(() => {
    pagesViewedRef.current.add(currentPage)
  }, [currentPage])

  // Writes the Share artifact exactly once — optionally stamped with the Story Call
  // audience. A ref mirror lets the unmount fallback call the latest writer.
  const writeCompletion = useCallback(
    (audience?: string) => {
      if (completionWrittenRef.current || !book) return
      completionWrittenRef.current = true
      void logReadingCompletion(familyId, book, childName, audience)
    },
    [familyId, book, childName],
  )
  const writeCompletionRef = useRef(writeCompletion)
  writeCompletionRef.current = writeCompletion

  // Detect book completion — reaching the last page (back cover).
  // Non-call mode writes the Share artifact immediately (unchanged behavior). Call mode
  // DEFERS the write until reader exit so it carries the FINAL audience selection — a
  // grandparent can correct a mis-tapped chip and both records (artifact + hours) agree.
  useEffect(() => {
    if (currentPage === totalPages - 1 && !completedRef.current && book) {
      completedRef.current = true
      if (!isCallMode) writeCompletion()
    }
  }, [currentPage, totalPages, book, isCallMode, writeCompletion])

  // Story Call audience chip → record the selection (mutable — re-tapping corrects it).
  // The write is deferred to exit so the last tap wins in BOTH the artifact and hours.
  const handleAudience = useCallback((audience: string) => {
    audienceRef.current = audience
    setSelectedAudience(audience)
  }, [])

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

  // Log reading hours and award XP when leaving the reader
  useEffect(() => {
    const sessionStart = sessionStartRef.current
    const pagesViewed = pagesViewedRef.current
    return () => {
      if (hoursLoggedRef.current || !book) return
      hoursLoggedRef.current = true

      // Story Call: in call mode the completion write is deferred to here so it carries
      // the FINAL audience selection (un-stamped if no chip was tapped). Non-call already
      // wrote on back-cover reach, so this is a no-op there (completionWrittenRef guard).
      if (completedRef.current) writeCompletionRef.current(audienceRef.current)

      const elapsed = Math.round((Date.now() - sessionStart) / 60000)
      if (elapsed < 1) return

      void logReadingHours(
        familyId,
        book.childId,
        elapsed,
        book.title,
        completedRef.current,
        pagesViewed.size,
        totalPages,
        book.sightWords?.length ?? 0,
        audienceRef.current,
      )

      // Award XP for reading session (once per book per day)
      const date = new Date().toISOString().slice(0, 10)
      void addXpEvent(
        familyId,
        book.childId,
        'BOOK_READ',
        15,
        `book_${book.id ?? 'unknown'}_${date}`,
      ).catch((err) => console.error('[XP] Award failed:', err))

      // Award 3 diamonds for reading a book
      void addDiamondEvent({
        familyId,
        childId: book.childId,
        amount: 3,
        type: DIAMOND_EVENTS.BOOK_READ,
        reason: `Read: ${book.title ?? 'book'}`,
        dedupKey: `book_${book.id ?? 'unknown'}_${date}-diamond`,
      }).catch((err) => console.error('[Diamond] Award failed:', err))
    }
    // Only run cleanup on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, book?.childId, book?.title, book?.id, totalPages])

  const handleWordTap = useCallback((word: string, action: 'help' | 'known') => {
    void recordInteraction(word, action)
  }, [recordInteraction])

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
      const { skippedImageCount } = await printBook(book, {
        childName,
        isLincoln,
        sightWords: book.sightWords,
        settings,
      })
      if (skippedImageCount > 0) {
        setPrintSkipNotice(
          `${skippedImageCount} image${skippedImageCount === 1 ? '' : 's'} couldn't be embedded and ${skippedImageCount === 1 ? 'was' : 'were'} left blank.`,
        )
      }
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
              Back to My Books
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
              {/* Images — separated into background + sticker layers */}
              {contentPage.images.length > 0 && (() => {
                const bgImages = contentPage.images.filter((img) => img.type !== 'sticker')
                const stickerImgs = contentPage.images.filter((img) => img.type === 'sticker')
                return (
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
                    {/* Background layer */}
                    {bgImages.map((img) => {
                      const pos = img.position ?? { x: 0, y: 0, width: 100, height: 100 }
                      const transforms: string[] = []
                      if (pos.rotation) transforms.push(`rotate(${pos.rotation}deg)`)
                      if (pos.flipH) transforms.push('scaleX(-1)')
                      if (pos.flipV) transforms.push('scaleY(-1)')
                      return (
                        <Box
                          key={img.id}
                          component="img"
                          src={img.url}
                          sx={{
                            position: 'absolute',
                            left: `${pos.x}%`,
                            top: `${pos.y}%`,
                            width: `${pos.width}%`,
                            height: `${pos.height}%`,
                            objectFit: 'cover',
                            borderRadius: 1,
                            zIndex: 0,
                            transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                            transformOrigin: 'center center',
                          }}
                        />
                      )
                    })}
                    {/* Sticker layer — always on top */}
                    {stickerImgs.map((img) => {
                      const pos = img.position ?? { x: 0, y: 0, width: 100, height: 100 }
                      const transforms: string[] = []
                      if (pos.rotation) transforms.push(`rotate(${pos.rotation}deg)`)
                      if (pos.flipH) transforms.push('scaleX(-1)')
                      if (pos.flipV) transforms.push('scaleY(-1)')
                      return (
                        <Box
                          key={img.id}
                          component="img"
                          src={img.url}
                          sx={{
                            position: 'absolute',
                            left: `${pos.x}%`,
                            top: `${pos.y}%`,
                            width: `${pos.width}%`,
                            height: `${pos.height}%`,
                            objectFit: 'contain',
                            borderRadius: 1,
                            zIndex: (pos.zIndex ?? 0) + 1,
                            transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                            transformOrigin: 'center center',
                          }}
                        />
                      )
                    })}
                  </Box>
                )
              })()}

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
              onClick={() => setCurrentPage(i)}
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
              {printing ? 'Creating PDF...' : 'Download PDF'}
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
