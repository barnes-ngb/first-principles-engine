import { useEffect, useState } from 'react'
import { doc, onSnapshot, orderBy, query } from 'firebase/firestore'

import {
  monthlyReviewsCollection,
} from '../firebase/firestore'
import type { MonthlyReview } from '../types'

interface UseMonthlyReviewsResult {
  reviews: MonthlyReview[]
  loading: boolean
  error: Error | null
}

/** Subscribe to all monthly reviews for the family. */
export function useMonthlyReviews(familyId: string | undefined): UseMonthlyReviewsResult {
  const [reviews, setReviews] = useState<MonthlyReview[]>([])
  const [loading, setLoading] = useState(!!familyId)
  const [error, setError] = useState<Error | null>(null)
  const [lastFamilyId, setLastFamilyId] = useState(familyId)

  if (lastFamilyId !== familyId) {
    setLastFamilyId(familyId)
    setReviews([])
    setError(null)
    setLoading(!!familyId)
  }

  useEffect(() => {
    if (!familyId) return
    const q = query(monthlyReviewsCollection(familyId), orderBy('month', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({
          ...(d.data() as MonthlyReview),
          id: d.id,
        }))
        setReviews(next)
        setLoading(false)
      },
      (err) => {
        console.error('useMonthlyReviews failed:', err)
        setError(err)
        setLoading(false)
      },
    )
    return unsub
  }, [familyId])

  return { reviews, loading, error }
}

interface UseMonthlyReviewResult {
  review: MonthlyReview | null
  loading: boolean
  error: Error | null
}

/** Subscribe to a single monthly review by id. */
export function useMonthlyReview(
  familyId: string | undefined,
  reviewId: string | undefined,
): UseMonthlyReviewResult {
  const enabled = !!familyId && !!reviewId
  const [review, setReview] = useState<MonthlyReview | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)
  const [lastKey, setLastKey] = useState(`${familyId ?? ''}|${reviewId ?? ''}`)
  const key = `${familyId ?? ''}|${reviewId ?? ''}`

  if (lastKey !== key) {
    setLastKey(key)
    setReview(null)
    setError(null)
    setLoading(enabled)
  }

  useEffect(() => {
    if (!familyId || !reviewId) return
    const ref = doc(monthlyReviewsCollection(familyId), reviewId)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setReview({ ...(snap.data() as MonthlyReview), id: snap.id })
        } else {
          setReview(null)
        }
        setLoading(false)
      },
      (err) => {
        console.error('useMonthlyReview failed:', err)
        setError(err)
        setLoading(false)
      },
    )
    return unsub
  }, [familyId, reviewId])

  return { review, loading, error }
}
