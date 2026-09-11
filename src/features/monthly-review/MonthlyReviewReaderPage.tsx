import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { useMonthlyReview } from '../../core/hooks/useMonthlyReviews'
import { reviewPath } from '../review/reviewNav'
import { MonthlyReviewReaderContent } from './MonthlyReviewReader'

export default function MonthlyReviewReaderPage() {
  const { reviewId } = useParams<{ reviewId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const familyId = useFamilyId()
  const { children, setActiveChildId } = useActiveChild()

  const reviewState = useMonthlyReview(familyId, reviewId)
  const { review } = reviewState

  const childName = useMemo(() => {
    if (!review) return ''
    return children.find((c) => c.id === review.childId)?.name ?? ''
  }, [children, review])

  if (!reviewId) return null

  return (
    <MonthlyReviewReaderContent
      reviewState={reviewState}
      reviewId={reviewId}
      defaultMode="parent"
      childName={childName}
      // A saved reader link may open a different child's book than the active one.
      onExit={() => {
        if (review) setActiveChildId(review.childId)
        navigate(reviewPath('month', searchParams))
      }}
    />
  )
}
