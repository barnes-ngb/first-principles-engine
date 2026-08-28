import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { useMonthlyReview } from '../../core/hooks/useMonthlyReviews'
import { PROGRESS_TABS, progressPath } from '../progress/progressNav'
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
      // UX-52: exit lands back on Monthly Books — the tab she came from —
      // instead of resetting to Foundations, and carries `?diag=1` through so
      // the reader's own diagnostic panel stays reachable by navigation.
      onExit={() => navigate(progressPath(PROGRESS_TABS.MonthlyBooks, searchParams))}
    />
  )
}
