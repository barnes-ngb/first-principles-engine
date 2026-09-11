import { useNavigate, useSearchParams } from 'react-router-dom'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import ChildSelector from '../../components/ChildSelector'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import MonthlyBooksTab from '../monthly-review/MonthlyBooksTab'
import WeeklyReviewPage from '../weekly-review/WeeklyReviewPage'
import { reviewPath } from './reviewNav'
import type { ReviewPeriod } from './reviewNav'

export default function ReviewPage() {
  const { isChildProfile } = useActiveChild()
  if (isChildProfile) return null
  return <ParentReview />
}

function ParentReview() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const period: ReviewPeriod = params.get('period') === 'month' ? 'month' : 'week'
  const { children, activeChildId, setActiveChildId, addChild, isLoading } = useActiveChild()
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
        <ChildSelector
          children={children}
          selectedChildId={activeChildId}
          onSelect={setActiveChildId}
          onChildAdded={addChild}
          isLoading={isLoading}
        />
        {!isLoading && activeChildId && (
          <div id="review-panel" role="tabpanel" aria-labelledby={`review-${period}-tab`}>
            {period === 'month' ? <MonthlyBooksTab /> : <WeeklyReviewPage embedded />}
          </div>
        )}
      </Stack>
    </Container>
  )
}
