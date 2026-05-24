import { useNavigate, useParams } from 'react-router-dom'

import { useActiveChild } from '../../core/hooks/useActiveChild'
import { MonthlyReviewReader } from './MonthlyReviewReader'

export default function KidBookReaderPage() {
  const { reviewId } = useParams<{ reviewId: string }>()
  const navigate = useNavigate()
  const { activeChild } = useActiveChild()

  if (!reviewId) return null

  return (
    <MonthlyReviewReader
      reviewId={reviewId}
      lockedMode="kid"
      childName={activeChild?.name}
      onExit={() => navigate('/books-about-me')}
    />
  )
}
