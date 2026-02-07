import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { Artifact } from '../core/types/domain'

interface ArtifactCardProps {
  artifact: Artifact
}

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '')

export default function ArtifactCard({ artifact }: ArtifactCardProps) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle1" fontWeight={600}>
              {artifact.title}
            </Typography>
            <Chip size="small" label={artifact.type} />
          </Stack>
          {artifact.createdAt && (
            <Typography variant="caption" color="text.secondary">
              {formatDate(artifact.createdAt)}
            </Typography>
          )}
          {artifact.content && (
            <Typography variant="body2" color="text.secondary">
              {artifact.content}
            </Typography>
          )}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {artifact.tags?.domain && (
              <Chip size="small" variant="outlined" label={artifact.tags.domain} />
            )}
            {artifact.tags?.engineStage && (
              <Chip size="small" variant="outlined" label={artifact.tags.engineStage} />
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
