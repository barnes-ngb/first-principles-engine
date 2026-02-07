import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'

import Page from '../../components/Page'

export default function WeekPage() {
  const navigate = useNavigate()

  return (
    <Page>
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">
          This Week
        </Typography>
        <Button variant="contained" onClick={() => navigate('/week/lab')}>
          Start Lab Mode
        </Button>
      </Stack>
    </Page>
  )
}
