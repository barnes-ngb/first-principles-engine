import { useNavigate, useSearchParams } from 'react-router-dom'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import ActiveChildLine from '../../components/ActiveChildLine'
import { useActiveChild, type UseActiveChildResult } from '../../core/hooks/useActiveChild'
import MonthlyBooksTab from '../monthly-review/MonthlyBooksTab'
import { WeeklyReviewContent } from '../weekly-review/WeeklyReviewPage'
import { reviewPath } from './reviewNav'
import type { ReviewPeriod } from './reviewNav'

export default function ReviewPage() {
  const childContext = useActiveChild()
  if (childContext.isChildProfile) return null
  return <ParentReview childContext={childContext} />
}

function ParentReview({ childContext }: { childContext: UseActiveChildResult }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const period: ReviewPeriod = params.get('period') === 'month' ? 'month' : 'week'
  // UX-425: this page no longer chooses or adds a child — it reads the active
  // one. The shell's chip is the one control that changes it.
  const { activeChildId, isLoading } = childContext
  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Stack spacing={2}>
        <Typography component="h1" variant="h5">Review</Typography>
        <Tabs
          value={period}
          variant="fullWidth"
          aria-label="Review period"
          onChange={(_, value: ReviewPeriod) => navigate(reviewPath(value, params))}
        >
          <Tab id="review-week-tab" value="week" label="Week" aria-controls="review-panel" />
          <Tab id="review-month-tab" value="month" label="Month" aria-controls="review-panel" />
        </Tabs>
        {/* UX-425 / UX-426: the selector is gone; the heading is *Review* and
            names nobody, and the week panel below it carries the reflection
            write. The sentence stays where the control was. */}
        <ActiveChildLine hint />
        {!isLoading && activeChildId && (
          <div id="review-panel" role="tabpanel" aria-labelledby={`review-${period}-tab`}>
            {period === 'month' ? <MonthlyBooksTab childContext={childContext} /> : <WeeklyReviewContent childContext={childContext} embedded />}
          </div>
        )}
      </Stack>
    </Container>
  )
}
