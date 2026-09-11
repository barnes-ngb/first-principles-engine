export type ReviewPeriod = 'week' | 'month'

/** Keep the optional diagnostic view through old and new book links. */
function reviewQuery(current?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams()
  const diag = current?.get('diag')
  if (diag != null) params.set('diag', diag)
  return params
}

export function reviewPath(period: ReviewPeriod = 'week', current?: URLSearchParams): string {
  const params = reviewQuery(current)
  if (period === 'month') params.set('period', 'month')
  const query = params.toString()
  return `/review${query ? `?${query}` : ''}`
}

export function monthlyBookPath(reviewId: string, current?: URLSearchParams): string {
  const query = reviewQuery(current).toString()
  return `/review/monthly-books/${encodeURIComponent(reviewId)}${query ? `?${query}` : ''}`
}
