import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import BookmarkOutlinedIcon from '@mui/icons-material/BookmarkOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useMonthlyReviews } from '../../core/hooks/useMonthlyReviews'
import { MonthlyReviewStatus } from '../../core/types/enums'

interface DraftReadyCardProps {
  familyId: string
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  if (!y || !m) return month
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

/** `YYYY-MM` for the month before `now` — the oldest draft worth nudging on. */
function previousMonthKey(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${mm}`
}

export default function DraftReadyCard({ familyId }: DraftReadyCardProps) {
  const navigate = useNavigate()
  const { reviews, loading } = useMonthlyReviews(familyId)
  const { children } = useActiveChild()

  const childNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of children) map.set(c.id, c.name)
    return map
  }, [children])

  const latestDraft = useMemo(() => {
    // Only nudge on a draft for the current or previous month. A draft for an
    // older month (e.g. a March book still unpublished in June, or a stale
    // scheduler run) is no longer a useful "ready to publish" prompt and reads
    // as a bug — it stays accessible from the Progress route, just not here.
    const cutoff = previousMonthKey(new Date())
    const drafts = reviews.filter(
      (r) =>
        r.status === MonthlyReviewStatus.Draft && (r.month ?? '') >= cutoff,
    )
    if (drafts.length === 0) return null
    return [...drafts].sort((a, b) =>
      (b.generatedAt ?? '').localeCompare(a.generatedAt ?? ''),
    )[0]
  }, [reviews])

  if (loading || !latestDraft) return null

  const childName = childNameById.get(latestDraft.childId) ?? 'your kid'
  const monthLabel = formatMonthLabel(latestDraft.month)

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: 'primary.50',
        border: '1px solid',
        borderColor: 'primary.200',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <BookmarkOutlinedIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {monthLabel} book ready for {childName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            A draft is waiting for you to skim and publish.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          onClick={() =>
            navigate(`/progress/monthly-books/${latestDraft.id}`)
          }
        >
          Open
        </Button>
      </Stack>
    </Box>
  )
}
