import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <Page>
      <SectionCard title="Page not found">
        <Stack spacing={2}>
          <Typography color="text.secondary">
            The page you&apos;re looking for doesn&apos;t exist.
          </Typography>
          <Button
            variant="contained"
            onClick={() => navigate('/today')}
            sx={{ alignSelf: 'flex-start' }}
          >
            Go to Today
          </Button>
        </Stack>
      </SectionCard>
    </Page>
  )
}
