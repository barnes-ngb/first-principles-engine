import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'

import ChildFilterChips, {
  CHILD_FILTER_ALL,
} from '../../components/ChildFilterChips'
import { LoadingState } from '../../components/states'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useMonthlyReviews } from '../../core/hooks/useMonthlyReviews'
import type { MonthlyReview, MonthlyReviewPage } from '../../core/types'
import { MonthlyReviewStatus } from '../../core/types/enums'
import { GenerateNowDialog } from './GenerateNowDialog'
import { MonthlyPhoto } from './MonthlyPhoto'
import { getModePhotos } from './photoRefs'

const ALL = CHILD_FILTER_ALL

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  if (!y || !m) return month
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

export default function MonthlyBooksTab() {
  const familyId = useFamilyId()
  const navigate = useNavigate()
  const { children, activeChildId } = useActiveChild()
  const { reviews, loading } = useMonthlyReviews(familyId)
  const [filterChildId, setFilterChildId] = useState<string>(ALL)
  const [generateOpen, setGenerateOpen] = useState(false)

  const childById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of children) map.set(c.id, c.name)
    return map
  }, [children])

  const filtered = useMemo(() => {
    const list =
      filterChildId === ALL
        ? reviews
        : reviews.filter((r) => r.childId === filterChildId)
    return [...list].sort((a, b) => {
      if (b.month !== a.month) return b.month.localeCompare(a.month)
      return (childById.get(a.childId) ?? '').localeCompare(
        childById.get(b.childId) ?? '',
      )
    })
  }, [reviews, filterChildId, childById])

  const handleGenerated = (reviewId: string) => {
    setGenerateOpen(false)
    navigate(`/progress/monthly-books/${reviewId}`)
  }

  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Typography variant="h5" sx={{ flex: 1, fontWeight: 600 }}>
          Monthly Books
        </Typography>
        <Button
          variant="contained"
          startIcon={<AutoStoriesIcon />}
          onClick={() => setGenerateOpen(true)}
          disabled={children.length === 0}
        >
          Generate Now
        </Button>
      </Stack>

      <Box sx={{ mb: 2 }}>
        <ChildFilterChips
          children={children}
          selectedChildId={filterChildId}
          onSelect={setFilterChildId}
        />
      </Box>

      {loading && <LoadingState fullHeight />}

      {!loading && filtered.length === 0 && <EmptyState />}

      {!loading && filtered.length > 0 && (
        <Stack spacing={1.5}>
          {filtered.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              childName={childById.get(review.childId) ?? 'Unknown'}
              onOpen={() =>
                navigate(`/progress/monthly-books/${review.id}`)
              }
            />
          ))}
        </Stack>
      )}

      <GenerateNowDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        childOptions={children}
        defaultChildId={activeChildId || children[0]?.id}
        onGenerated={handleGenerated}
      />
    </Container>
  )
}

function EmptyState() {
  return (
    <Box
      sx={{
        py: 6,
        px: 3,
        textAlign: 'center',
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 2,
      }}
    >
      <AutoStoriesIcon
        sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }}
      />
      <Typography variant="h6" sx={{ mb: 1 }}>
        No monthly books yet
      </Typography>
      <Typography color="text.secondary">
        Click <strong>Generate Now</strong> to create one — try last month for
        either kid.
      </Typography>
    </Box>
  )
}

interface ReviewCardProps {
  review: MonthlyReview
  childName: string
  onOpen: () => void
}

function firstPagePhoto(pages: MonthlyReviewPage[]) {
  for (const page of pages) {
    const kid = getModePhotos(page, 'kid')
    if (kid.length) return kid[0]
    const parent = getModePhotos(page, 'parent')
    if (parent.length) return parent[0]
  }
  return undefined
}

function ReviewCard({ review, childName, onOpen }: ReviewCardProps) {
  const isPublished = review.status === MonthlyReviewStatus.Published
  const isGenerating = review.status === MonthlyReviewStatus.Generating
  const hero =
    review.heroPhotoRef ??
    review.curatedPhotos?.[0] ??
    firstPagePhoto(review.pages)

  return (
    <Box
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen()
      }}
      sx={{
        display: 'flex',
        gap: 2,
        alignItems: 'center',
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        cursor: 'pointer',
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{ width: 80, flexShrink: 0 }}>
        {hero ? (
          <MonthlyPhoto photo={hero} size={80} aspectRatio="1 / 1" />
        ) : (
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: 2,
              bgcolor: 'grey.200',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AutoStoriesIcon sx={{ color: 'text.disabled' }} />
          </Box>
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {childName} — {formatMonthLabel(review.month)}
        </Typography>
        {review.theme && (
          <Typography
            variant="body2"
            sx={{
              fontStyle: 'italic',
              color: 'text.secondary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {review.theme}
          </Typography>
        )}
      </Box>

      <Chip
        size="small"
        label={
          isGenerating ? 'Generating' : isPublished ? 'Published' : 'Draft'
        }
        color={isPublished ? 'success' : isGenerating ? 'warning' : 'default'}
        variant={isPublished ? 'filled' : 'outlined'}
      />
    </Box>
  )
}
