import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onSnapshot, orderBy, query, where } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'

import { EmptyState, LoadingState } from '../../components/states'
import { useFamilyId } from '../../core/auth/useAuth'
import { monthlyReviewsCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { MonthlyReview } from '../../core/types'
import { MonthlyReviewStatus } from '../../core/types/enums'
import { MonthlyPhoto } from './MonthlyPhoto'
import { getModePhotos } from './photoRefs'

function formatShortMonth(month: string): string {
  const [y, m] = month.split('-')
  if (!y || !m) return month
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleString(undefined, { month: 'long' })
}

export default function KidBooksAboutMePage() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChildId, activeChild } = useActiveChild()
  const [reviews, setReviews] = useState<MonthlyReview[]>([])
  const [loading, setLoading] = useState(!!activeChildId)
  const [lastChildId, setLastChildId] = useState(activeChildId)

  if (lastChildId !== activeChildId) {
    setLastChildId(activeChildId)
    setReviews([])
    setLoading(!!activeChildId)
  }

  useEffect(() => {
    if (!activeChildId) return
    const q = query(
      monthlyReviewsCollection(familyId),
      where('childId', '==', activeChildId),
      where('status', '==', MonthlyReviewStatus.Published),
      orderBy('month', 'desc'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setReviews(
          snap.docs.map((d) => ({
            ...(d.data() as MonthlyReview),
            id: d.id,
          })),
        )
        setLoading(false)
      },
      (err) => {
        console.error('KidBooksAboutMePage onSnapshot failed:', err)
        setLoading(false)
      },
    )
    return unsub
  }, [familyId, activeChildId])

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
        <AutoStoriesIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Books About {activeChild?.name ?? 'You'}
        </Typography>
      </Stack>

      {loading && <LoadingState fullHeight />}

      {!loading && reviews.length === 0 && (
        <Box
          sx={{
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <EmptyState
            icon={<AutoStoriesIcon />}
            title="Your first book is coming!"
            description="Mom is working on it."
          />
        </Box>
      )}

      {!loading && reviews.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(3, 1fr)',
              md: 'repeat(4, 1fr)',
            },
            gap: 2,
          }}
        >
          {reviews.map((review) => {
            const hero =
              review.heroPhotoRef ??
              review.curatedPhotos?.[0] ??
              review.pages
                .map((p) => getModePhotos(p, 'kid')[0])
                .find((p) => p !== undefined)
            return (
              <Box
                key={review.id}
                onClick={() =>
                  navigate(`/books-about-me/${review.id}`)
                }
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ')
                    navigate(`/books-about-me/${review.id}`)
                }}
                sx={{
                  cursor: 'pointer',
                  borderRadius: 2,
                  overflow: 'hidden',
                  transition: 'transform 0.15s',
                  '&:hover': { transform: 'translateY(-3px)' },
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                }}
              >
                {hero ? (
                  <MonthlyPhoto photo={hero} aspectRatio="3 / 4" />
                ) : (
                  <Box
                    sx={{
                      width: '100%',
                      aspectRatio: '3 / 4',
                      borderRadius: 2,
                      bgcolor: 'grey.300',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AutoStoriesIcon
                      sx={{ fontSize: 48, color: 'text.disabled' }}
                    />
                  </Box>
                )}
                <Typography
                  variant="h6"
                  align="center"
                  sx={{ mt: 1, fontWeight: 600 }}
                >
                  {formatShortMonth(review.month)}
                </Typography>
              </Box>
            )
          })}
        </Box>
      )}
    </Container>
  )
}
