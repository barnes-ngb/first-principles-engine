import { useCallback, useEffect, useMemo, useState } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

import { useFamilyId } from '../../core/auth/useAuth'
import { app } from '../../core/firebase/firebase'
import { useMonthlyReview } from '../../core/hooks/useMonthlyReviews'
import { MonthlyReviewStatus, SectionType } from '../../core/types/enums'
import type { MonthlyReviewPage as MonthlyReviewPageType } from '../../core/types'
import { MonthlyReviewPage } from './MonthlyReviewPage'
import { PublishConfirmDialog } from './PublishConfirmDialog'

const functions = getFunctions(app)
const publishFn = httpsCallable<
  { familyId: string; childId: string; month: string },
  { reviewId: string; publishedAt: string }
>(functions, 'publishMonthlyReview')
const unpublishFn = httpsCallable<
  { familyId: string; childId: string; month: string },
  { reviewId: string }
>(functions, 'unpublishMonthlyReview')

/** Sections rendered in MVP. Other section types are filtered out
 * defensively even if the backend ever produces them. */
const MVP_SECTION_TYPES: ReadonlyArray<string> = [
  SectionType.Cover,
  SectionType.MonthInSentence,
  SectionType.WhatYouLoved,
  SectionType.WorkedThrough,
  SectionType.ByTheNumbers,
  SectionType.MoreFromMonth,
]

type ReaderMode = 'kid' | 'parent'

const SWIPE_THRESHOLD = 50

export interface MonthlyReviewReaderProps {
  reviewId: string
  lockedMode?: ReaderMode
  defaultMode?: ReaderMode
  onExit?: () => void
  childName?: string
}

export function MonthlyReviewReader({
  reviewId,
  lockedMode,
  defaultMode = 'parent',
  onExit,
  childName,
}: MonthlyReviewReaderProps) {
  const familyId = useFamilyId()
  const { review, loading } = useMonthlyReview(familyId, reviewId)

  const [mode, setMode] = useState<ReaderMode>(lockedMode ?? defaultMode)
  const [pageIndex, setPageIndex] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [snack, setSnack] = useState<{
    text: string
    severity: 'success' | 'error'
  } | null>(null)

  const pages: MonthlyReviewPageType[] = useMemo(() => {
    if (!review) return []
    return [...review.pages]
      .filter((p) => {
        if (p.hidden) return false
        if (!MVP_SECTION_TYPES.includes(p.sectionType)) return false
        // moreFromMonth is the kid-only overflow gallery — never show it
        // in parent mode even if the data exists.
        if (
          p.sectionType === SectionType.MoreFromMonth &&
          mode === 'parent'
        ) {
          return false
        }
        return true
      })
      .sort((a, b) => a.order - b.order)
  }, [review, mode])

  const totalPages = pages.length
  const currentPage = pages[pageIndex]

  // Clamp index if pages array shrinks
  useEffect(() => {
    if (pageIndex >= totalPages && totalPages > 0) {
      setPageIndex(totalPages - 1)
    }
  }, [pageIndex, totalPages])

  const goNext = useCallback(() => {
    setPageIndex((p) => Math.min(p + 1, totalPages - 1))
  }, [totalPages])

  const goPrev = useCallback(() => {
    setPageIndex((p) => Math.max(p - 1, 0))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev])

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
        if (diff > 0) goPrev()
        else goNext()
      }
      setTouchStart(null)
      setSwipeOffset(0)
    },
    [touchStart, goPrev, goNext],
  )

  const handlePublishConfirm = useCallback(async () => {
    if (!review) return
    setPublishing(true)
    try {
      await publishFn({
        familyId,
        childId: review.childId,
        month: review.month,
      })
      setSnack({ text: 'Book published', severity: 'success' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to publish'
      setSnack({ text: msg, severity: 'error' })
    } finally {
      setPublishing(false)
      setPublishOpen(false)
    }
  }, [familyId, review])

  const handleUnpublish = useCallback(async () => {
    if (!review) return
    setPublishing(true)
    try {
      await unpublishFn({
        familyId,
        childId: review.childId,
        month: review.month,
      })
      setSnack({ text: 'Returned to draft', severity: 'success' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to unpublish'
      setSnack({ text: msg, severity: 'error' })
    } finally {
      setPublishing(false)
    }
  }, [familyId, review])

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    )
  }

  if (!review) {
    return (
      <Box
        sx={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          px: 3,
        }}
      >
        <Typography color="text.secondary">
          This book isn't available.
        </Typography>
        {onExit && (
          <Button onClick={onExit} startIcon={<ArrowBackIcon />}>
            Back
          </Button>
        )}
      </Box>
    )
  }

  if (totalPages === 0) {
    return (
      <Box
        sx={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          px: 3,
          textAlign: 'center',
        }}
      >
        <Typography color="text.secondary">
          This book has no pages yet.
        </Typography>
        {onExit && (
          <Button onClick={onExit} startIcon={<ArrowBackIcon />}>
            Back
          </Button>
        )}
      </Box>
    )
  }

  const isPublished = review.status === MonthlyReviewStatus.Published
  const isKidLocked = lockedMode === 'kid'
  // Slight cream tint in kid mode to signal the view change
  const bgColor = mode === 'kid' ? '#fdfaf2' : 'background.paper'

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: bgColor,
      }}
    >
      {/* Top bar */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: bgColor,
        }}
      >
        {onExit && (
          <IconButton
            onClick={onExit}
            aria-label="Exit reader"
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            <ArrowBackIcon />
          </IconButton>
        )}

        {!lockedMode && (
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <ToggleButtonGroup
              value={mode}
              exclusive
              size="small"
              onChange={(_, next) => {
                if (next) setMode(next)
              }}
            >
              <ToggleButton value="kid">Kid</ToggleButton>
              <ToggleButton value="parent">Parent</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}

        {lockedMode && <Box sx={{ flex: 1 }} />}

        {!isKidLocked && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={isPublished ? 'Published' : 'Draft'}
              size="small"
              color={isPublished ? 'success' : 'default'}
              variant={isPublished ? 'filled' : 'outlined'}
            />
            {isPublished ? (
              <Button
                size="small"
                variant="outlined"
                onClick={handleUnpublish}
                disabled={publishing}
              >
                Unpublish
              </Button>
            ) : (
              <Button
                size="small"
                variant="contained"
                color="success"
                onClick={() => setPublishOpen(true)}
                disabled={publishing}
              >
                Publish
              </Button>
            )}
          </Stack>
        )}
      </Stack>

      {/* Page area */}
      <Box
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          px: { xs: 1.5, sm: 3 },
          pt: 2,
          pb: 3,
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 720,
            transform: `translateX(${swipeOffset * 0.3}px)`,
            transition: swipeOffset === 0 ? 'transform 0.3s ease' : 'none',
          }}
        >
          {currentPage && (
            <MonthlyReviewPage
              page={currentPage}
              review={review}
              mode={mode}
            />
          )}
        </Box>
      </Box>

      {/* Bottom bar */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        sx={{
          px: 2,
          py: 1.25,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: bgColor,
        }}
      >
        <Stack direction="row" spacing={0.75} sx={{ flex: 1 }}>
          {pages.map((_, i) => (
            <Box
              key={i}
              onClick={() => setPageIndex(i)}
              sx={{
                width: i === pageIndex ? 11 : 8,
                height: i === pageIndex ? 11 : 8,
                borderRadius: '50%',
                bgcolor: i === pageIndex ? 'primary.main' : 'text.disabled',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            />
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Page {pageIndex + 1} of {totalPages}
        </Typography>
      </Stack>

      {/* All done — kid only */}
      {isKidLocked && onExit && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 70,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Button
            variant="contained"
            color="success"
            size="large"
            onClick={onExit}
            sx={{
              pointerEvents: 'auto',
              borderRadius: 99,
              px: 4,
              boxShadow: 4,
            }}
          >
            All done
          </Button>
        </Box>
      )}

      <PublishConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={() => void handlePublishConfirm()}
        childName={childName ?? ''}
        month={review.month}
        loading={publishing}
      />

      <Snackbar
        open={snack !== null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack(null)}
          severity={snack?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snack?.text}
        </Alert>
      </Snackbar>
    </Box>
  )
}
