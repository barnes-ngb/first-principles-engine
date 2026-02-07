import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { Artifact } from '../core/types/domain'

interface ArtifactCardProps {
  artifact: Artifact
}

export default function ArtifactCard({ artifact }: ArtifactCardProps) {
  const createdLabel = artifact.createdAt
    ? new Date(artifact.createdAt).toLocaleDateString()
    : 'Date not set'

  return (
    <Card elevation={2}>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack spacing={0.5}>
            <Typography color="text.secondary" variant="overline">
              {artifact.type}
            </Typography>
            <Typography component="h3" variant="h6">
              {artifact.title}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {createdLabel}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Chip
              label={`Domain: ${artifact.tags.domain}`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`Stage: ${artifact.tags.engineStage}`}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
