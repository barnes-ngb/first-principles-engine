import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

import { ErrorState } from '../../components/states'
import { useFamilyId } from '../../core/auth/useAuth'
import { app } from '../../core/firebase/firebase'
import type { MonthlyReview } from '../../core/types'

const functions = getFunctions(app)
const auditFn = httpsCallable<
  { familyId: string; childId: string; month: string },
  Record<string, unknown>
>(functions, 'auditMonthlyReviewSources')

interface DiagnosticPanelProps {
  review: MonthlyReview
}

/**
 * Flag-gated diagnostic surface for monthly review aggregation. Renders only
 * when `?diag=1` is in the URL — never visible to Shelly or the kids by
 * default. Shows what the persisted book recorded plus a button to fetch the
 * raw aggregation counts and dadLabReports document shapes from Firestore
 * (via the `auditMonthlyReviewSources` callable) without regenerating the
 * book. Lets us answer "what does the loader actually see?" from a phone.
 */
export function DiagnosticPanel({ review }: DiagnosticPanelProps) {
  const [searchParams] = useSearchParams()
  const familyId = useFamilyId()
  const [audit, setAudit] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runAudit = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await auditFn({
        familyId,
        childId: review.childId,
        month: review.month,
      })
      setAudit(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit failed')
    } finally {
      setLoading(false)
    }
  }, [familyId, review.childId, review.month])

  if (searchParams.get('diag') !== '1') return null

  return (
    <Box
      sx={{
        m: 2,
        p: 2,
        bgcolor: 'warning.50',
        border: '1px dashed',
        borderColor: 'warning.main',
        borderRadius: 1,
      }}
    >
      <Typography variant="overline" sx={{ fontWeight: 700 }}>
        Diagnostic — what aggregation saw
      </Typography>

      <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
        Stats from this book:
      </Typography>
      <Box
        component="pre"
        sx={{ fontSize: 11, m: 0, overflowX: 'auto', whiteSpace: 'pre-wrap' }}
      >
        {JSON.stringify(review.stats, null, 2)}
      </Box>

      <Typography variant="body2" sx={{ mt: 2, fontWeight: 600 }}>
        Source refs:
      </Typography>
      <Box
        component="pre"
        sx={{ fontSize: 11, m: 0, overflowX: 'auto', whiteSpace: 'pre-wrap' }}
      >
        {JSON.stringify(review.sourceRefs, null, 2)}
      </Box>

      <Typography variant="body2" sx={{ mt: 2, fontWeight: 600 }}>
        Photos: {review.curatedPhotos?.length ?? 0} curated,{' '}
        {review.unplacedPhotos?.length ?? 0} unplaced
      </Typography>

      <Typography variant="body2" sx={{ mt: 2, fontWeight: 600 }}>
        Pages with photos:
      </Typography>
      <Box component="ul" sx={{ fontSize: 12, m: 0, pl: 3 }}>
        {review.pages.map((p) => {
          const refs = p.photoRefs
          const kidCount = Array.isArray(refs)
            ? refs.length
            : (refs?.kid?.length ?? 0)
          const parentCount = Array.isArray(refs)
            ? refs.length
            : (refs?.parent?.length ?? 0)
          return (
            <li key={p.id}>
              {p.sectionType}: kid={kidCount}, parent={parentCount}
            </li>
          )
        })}
      </Box>

      <Box sx={{ mt: 2 }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => void runAudit()}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={14} /> : undefined}
        >
          {loading ? 'Auditing…' : 'Audit raw sources'}
        </Button>
      </Box>

      {error && (
        <Box sx={{ mt: 2 }}>
          <ErrorState message={error} />
        </Box>
      )}

      {audit && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Audit result:
          </Typography>
          <Box
            component="pre"
            sx={{
              fontSize: 10,
              m: 0,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              bgcolor: 'background.paper',
              p: 1,
              borderRadius: 0.5,
            }}
          >
            {JSON.stringify(audit, null, 2)}
          </Box>
        </Box>
      )}
    </Box>
  )
}
