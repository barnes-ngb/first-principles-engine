import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'

export default function WeekPage() {
  const navigate = useNavigate()

  return (
    <Page>
      <SectionCard title="Week">
        <Stack spacing={2}>
          <Typography color="text.secondary">
            Review the week plan, then jump into quick capture mode when ready.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/week/lab')}
          >
            Start Lab Mode
          </Button>
        </Stack>
      </SectionCard>
    </Page>
  )
}
