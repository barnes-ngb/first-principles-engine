import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { useMonthlyReview } from '../../core/hooks/useMonthlyReviews'
import { reviewPath } from '../review/reviewNav'
import { MonthlyReviewReader } from './MonthlyReviewReader'

export default function MonthlyReviewReaderPage() {
  const { reviewId } = useParams<{ reviewId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const familyId = useFamilyId()
  const { children } = useActiveChild()

  const { review } = useMonthlyReview(familyId, reviewId)

  const childName = useMemo(() => {
    if (!review) return ''
    return children.find((c) => c.id === review.childId)?.name ?? ''
  }, [children, review])

  if (!reviewId) return null

  return (
    <MonthlyReviewReader
      reviewId={reviewId}
      defaultMode="parent"
      childName={childName}
      // Return to Month, retaining the shared child selection and diagnostic view.
      onExit={() => navigate(reviewPath('month', searchParams))}
    />
  )
}
