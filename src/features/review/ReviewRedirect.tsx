import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { monthlyBookPath, reviewPath } from './reviewNav'

/** Compatibility for saved weekly-review and monthly-book URLs. */
export default function ReviewRedirect() {
  const { reviewId } = useParams<{ reviewId: string }>()
  const [params] = useSearchParams()
  return <Navigate to={reviewId ? monthlyBookPath(reviewId, params) : reviewPath('week', params)} replace />
}
