import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import ReplayIcon from '@mui/icons-material/Replay'
import PauseIcon from '@mui/icons-material/Pause'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import HomeIcon from '@mui/icons-material/Home'

import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import { UserProfile } from '../../core/types/enums'
import VoiceInput from '../../components/VoiceInput'
import { useBookReview } from './useBookReview'

// ── Age helper (mirrors BookGenerateChat) ─────────────────────────

function ageFromBirthdate(birthdate: string | undefined, fallback: number): number {
  if (!birthdate) return fallback
  try {
    const birth = new Date(birthdate)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
    return age > 0 ? age : fallback
  } catch {
    return fallback
  }
}

// ── Component ─────────────────────────────────────────────────────

export default function BookReviewChat() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const { profile } = useProfile()
  const isParent = profile === UserProfile.Parents

  const childName = activeChild?.name ?? 'kid'
  const isLincoln = childName.toLowerCase() === 'lincoln'
  const childAge = ageFromBirthdate(activeChild?.birthdate, isLincoln ? 10 : 6)

  const review = useBookReview({
    familyId,
    bookId,
    childName,
    childAge,
  })

  const {
    book,
    currentPage,
    currentPageIndex,
    totalPages,
    phase,
    isLoading,
    error,
    reviewedCount,
    imageRegenerating,
    playCurrentPage,
    approveCurrentPage,
    reviseCurrentPage,
    skipRemaining,
    gotoPage,
    setRecording,
  } = review

  const [showVoice, setShowVoice] = useState(false)
  const [lastFeedback, setLastFeedback] = useState('')

  // Auto-play page 1 on first load (phase lands on 'idle' after load).
  const autoPlayedRef = useRef(false)
  useEffect(() => {
    if (isLoading) return
    if (phase === 'idle' && currentPage && !autoPlayedRef.current) {
      autoPlayedRef.current = true
      void playCurrentPage()
    }
  }, [isLoading, phase, currentPage, playCurrentPage])

  const handleChangeThis = useCallback(() => {
    setShowVoice(true)
    setRecording(true)
  }, [setRecording])

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      setShowVoice(false)
      setLastFeedback(text)
      void reviseCurrentPage(text)
    },
    [reviseCurrentPage],
  )

  const handleVoiceCancel = useCallback(() => {
    setShowVoice(false)
    setRecording(false)
  }, [setRecording])

  const voiceProfile = useMemo(
    () => ({
      id: activeChild?.id ?? '',
      voiceInputEnhanced: activeChild?.voiceInputEnhanced === true,
    }),
    [activeChild?.id, activeChild?.voiceInputEnhanced],
  )

  const backToBook = useCallback(() => {
    navigate(`/books/${bookId}`)
  }, [navigate, bookId])

  // ── Loading / not-found ──────────────────────────────────────────

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!book) {
    return (
      <Box sx={{ p: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/books')}>
          Back to bookshelf
        </Button>
        <Typography sx={{ mt: 2 }}>We couldn't find that book.</Typography>
      </Box>
    )
  }

  // ── Completion screen ────────────────────────────────────────────

  if (phase === 'completed') {
    return (
      <Stack spacing={3} sx={{ p: 3, textAlign: 'center', maxWidth: 480, mx: 'auto' }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={backToBook}
          sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
        >
          Back to my book
        </Button>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          🎉 All done!
        </Typography>
        <Typography variant="body1">
          You reviewed {reviewedCount} of {totalPages} pages.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {totalPages} pages are ready to read or print.
        </Typography>
        <Stack direction="row" spacing={2} justifyContent="center">
          <Button
            variant="contained"
            startIcon={<MenuBookIcon />}
            onClick={backToBook}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            📖 Open my book
          </Button>
          <Button
            variant="outlined"
            startIcon={<HomeIcon />}
            onClick={() => navigate('/books')}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            🏠 Back to bookshelf
          </Button>
        </Stack>
      </Stack>
    )
  }

  // ── Page review surface ──────────────────────────────────────────

  const imageUrl =
    currentPage?.images?.find((img) => img.type === 'ai-generated')?.url ??
    currentPage?.images?.[0]?.url ??
    (currentPageIndex === 0 ? book.coverImageUrl : undefined)

  const isRevising = phase === 'revising'

  return (
    <Stack spacing={2} sx={{ p: 2, maxWidth: 640, mx: 'auto' }}>
      {/* Top bar */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={backToBook}
          sx={{ textTransform: 'none' }}
        >
          Back to my book
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          Page {currentPageIndex + 1} of {totalPages}
        </Typography>
      </Stack>

      {/* Illustration */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'grey.100',
          minHeight: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt={`Page ${currentPageIndex + 1} illustration`}
            sx={{ width: '100%', display: 'block' }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ py: 6 }}>
            (no picture yet)
          </Typography>
        )}
        {imageRegenerating && (
          <Box
            aria-live="polite"
            sx={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.25,
              py: 0.5,
              borderRadius: 1,
              bgcolor: 'rgba(0,0,0,0.6)',
              color: '#fff',
            }}
          >
            <CircularProgress size={14} sx={{ color: '#fff' }} />
            <Typography variant="caption">Updating picture…</Typography>
          </Box>
        )}
      </Box>

      {/* Page text */}
      <Typography variant="h6" sx={{ lineHeight: 1.5, fontWeight: 500, minHeight: 48 }}>
        {currentPage?.text ?? ''}
      </Typography>

      {/* Playback controls */}
      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          startIcon={<PauseIcon />}
          onClick={() => setRecording(false)}
          disabled={isRevising}
          sx={{ textTransform: 'none' }}
        >
          Pause
        </Button>
        <Button
          variant="outlined"
          startIcon={<ReplayIcon />}
          onClick={() => void playCurrentPage()}
          disabled={isRevising}
          sx={{ textTransform: 'none' }}
        >
          Read again
        </Button>
      </Stack>

      <Box sx={{ borderTop: 1, borderColor: 'divider' }} />

      {error && (
        <Alert
          severity="warning"
          action={
            <Stack direction="row" spacing={1}>
              <Button
                color="inherit"
                size="small"
                onClick={() => lastFeedback && void reviseCurrentPage(lastFeedback)}
              >
                Try again
              </Button>
              <Button
                color="inherit"
                size="small"
                onClick={() => void approveCurrentPage()}
              >
                Skip this page
              </Button>
            </Stack>
          }
        >
          {error}
        </Alert>
      )}

      {isRevising ? (
        <Stack spacing={1} alignItems="center" sx={{ py: 2 }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary">
            Fixing your page…
          </Typography>
        </Stack>
      ) : showVoice ? (
        <Box>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Tell me what to change about this page:
          </Typography>
          <VoiceInput
            profile={voiceProfile}
            sourceSurface="book-review"
            mode="toggle"
            maxDurationSec={45}
            placeholder="Tell me what to change about this page"
            showConfirmation={true}
            onTranscript={(text) => handleVoiceTranscript(text)}
            onCancel={handleVoiceCancel}
          />
        </Box>
      ) : (
        <>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            How does this page sound?
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              color="success"
              size="large"
              fullWidth
              onClick={() => void approveCurrentPage()}
              sx={{ minHeight: 56, textTransform: 'none', fontWeight: 700 }}
            >
              ✓ Sounds good!
            </Button>
            <Button
              variant="outlined"
              size="large"
              fullWidth
              onClick={handleChangeThis}
              sx={{ minHeight: 56, textTransform: 'none', fontWeight: 700 }}
            >
              🎤 Change this
            </Button>
          </Stack>
          <Button
            variant="text"
            onClick={() => void skipRemaining()}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            ⏭ Skip the rest, I'm done →
          </Button>
        </>
      )}

      {/* Parent post-hoc navigation (prev/next). Hidden for kid flow. */}
      {isParent && !isRevising && !showVoice && (
        <Stack direction="row" spacing={1} justifyContent="space-between">
          <Button
            startIcon={<ArrowBackIosNewIcon />}
            disabled={currentPageIndex <= 0}
            onClick={() => void gotoPage(currentPageIndex - 1)}
            sx={{ textTransform: 'none' }}
          >
            Prev
          </Button>
          <Button
            endIcon={<ArrowForwardIosIcon />}
            disabled={currentPageIndex >= totalPages - 1}
            onClick={() => void gotoPage(currentPageIndex + 1)}
            sx={{ textTransform: 'none' }}
          >
            Next
          </Button>
        </Stack>
      )}
    </Stack>
  )
}
