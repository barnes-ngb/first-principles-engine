import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import EditIcon from '@mui/icons-material/Edit'
import PrintIcon from '@mui/icons-material/Print'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import CircularProgress from '@mui/material/CircularProgress'

import Page from '../../components/Page'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { BookPage } from '../../core/types/domain'
import { useBook } from './useBook'
import { printBook } from './printBook'
import { TEXT_SIZE_STYLES, TEXT_FONT_FAMILIES } from './bookTypes'
import { renderTextWithSightWords } from './highlightSightWords'
import { useSightWordProgress } from './useSightWordProgress'

const SWIPE_THRESHOLD = 50

export default function BookReaderPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childName = activeChild?.name ?? ''
  const childId = activeChild?.id ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'

  const { book, loading } = useBook(familyId, bookId)
  const isSightWordBook = book?.bookType === 'sight-word' && (book.sightWords?.length ?? 0) > 0
  const { progressMap, recordInteraction } = useSightWordProgress(
    isSightWordBook ? familyId : '',
    isSightWordBook ? childId : '',
  )

  const [currentPage, setCurrentPage] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [printing, setPrinting] = useState(false)
  const [totalWordsEncountered, setTotalWordsEncountered] = useState(0)
  const seenPagesRef = useRef<Set<number>>(new Set())

  // Total pages: cover + content pages + back cover
  const totalPages = useMemo(() => (book ? book.pages.length + 2 : 0), [book])

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
    const contentPageIndex = currentPage - 1
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
  }, [currentPage, isSightWordBook, book, recordInteraction])

  const handleWordTap = useCallback((word: string, action: 'help' | 'known') => {
    void recordInteraction(word, action)
  }, [recordInteraction])

  const handlePrint = useCallback(async () => {
    if (!book) return
    setPrinting(true)
    try {
      await printBook(book, childName)
    } finally {
      setPrinting(false)
    }
  }, [book, childName])

  if (loading) {
    return (
      <Page>
        <Stack alignItems="center" py={4}>
          <CircularProgress />
        </Stack>
      </Page>
    )
  }

  if (!book) {
    return (
      <Page>
        <Typography color="text.secondary">Book not found.</Typography>
        <Button onClick={() => navigate('/books')} startIcon={<ArrowBackIcon />}>
          Back to My Books
        </Button>
      </Page>
    )
  }

  const contentPage: BookPage | null =
    currentPage >= 1 && currentPage <= book.pages.length
      ? book.pages[currentPage - 1]
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
  const textColor = isLincoln ? '#e0e0e0' : '#333'
  const titleFont = isLincoln
    ? '"Press Start 2P", monospace'
    : '"Fredoka", cursive'

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
            maxWidth: 600,
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
                    maxWidth: '80%',
                    maxHeight: 300,
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
                  fontSize: isLincoln ? '0.9rem' : '1.8rem',
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

          {/* Content pages */}
          {contentPage && (
            <Stack spacing={2}>
              {/* Images */}
              {contentPage.images.length > 0 && (
                <Box
                  sx={{
                    position: 'relative',
                    width: '100%',
                    minHeight: 200,
                    maxHeight: 350,
                    height: 280,
                    borderRadius: 2,
                    overflow: 'hidden',
                    bgcolor: isLincoln ? 'rgba(255,255,255,0.05)' : 'grey.100',
                  }}
                >
                  {contentPage.images.map((img) => {
                    const pos = img.position ?? { x: 0, y: 0, width: 100, height: 100 }
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
                          objectFit: img.type === 'sticker' ? 'contain' : 'cover',
                          borderRadius: 1,
                        }}
                      />
                    )
                  })}
                </Box>
              )}

              {/* Text */}
              {contentPage.text && (
                <Typography
                  component="div"
                  sx={{
                    px: 1,
                    ...getTextStyles(contentPage),
                    color: textColor,
                  }}
                >
                  {isSightWordBook && book.sightWords
                    ? renderTextWithSightWords(
                        contentPage.text,
                        book.sightWords,
                        handleWordTap,
                        progressMap,
                      )
                    : contentPage.text}
                </Typography>
              )}

              {/* Audio */}
              {contentPage.audioUrl && (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1 }}>
                  <VolumeUpIcon sx={{ color: 'primary.main' }} />
                  <Box
                    component="audio"
                    controls
                    src={contentPage.audioUrl}
                    sx={{ flex: 1, height: 36 }}
                  />
                </Stack>
              )}
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
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {new Date(book.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Typography>
              {isLincoln && (
                <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: '"Press Start 2P", monospace', fontSize: '0.5rem' }}>
                  First Principles Engine
                </Typography>
              )}
            </Stack>
          )}
        </Box>
      </Box>

      {/* Sight word page count */}
      {isSightWordBook && contentPage?.sightWordsOnPage && (
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
          startIcon={printing ? <CircularProgress size={14} /> : <PrintIcon />}
          onClick={() => { void handlePrint() }}
          disabled={printing}
          sx={{ minHeight: 36, color: textColor, borderColor: textColor }}
        >
          Print
        </Button>
      </Stack>
    </Box>
  )
}
