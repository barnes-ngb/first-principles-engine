import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { Artifact } from '../core/types/domain'
import { EvidenceType } from '../core/types/enums'

interface ArtifactCardProps {
  artifact: Artifact
}

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '')

export default function ArtifactCard({ artifact }: ArtifactCardProps) {
  const ladderRef = artifact.tags?.ladderRef
  const [ladderId, rungId] = ladderRef?.split(':') ?? []
  const ladderLabel = ladderRef
    ? rungId
      ? `Ladder: ${ladderId} / Rung: ${rungId}`
      : `Ladder: ${ladderId}`
    : ''

  return (
    <Card variant="outlined" sx={{ width: '100%' }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack spacing={0.5}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
            >
              <Typography variant="subtitle1" fontWeight={600}>
                {artifact.title}
              </Typography>
              <Chip size="small" label={artifact.type} />
            </Stack>
            {artifact.createdAt && (
              <Typography variant="caption" color="text.secondary">
                Created {formatDate(artifact.createdAt)}
              </Typography>
            )}
          </Stack>

          {artifact.type === EvidenceType.Photo && artifact.uri && (
            <Box
              component="img"
              src={artifact.uri}
              alt={artifact.title}
              sx={{
                width: '100%',
                maxHeight: 240,
                objectFit: 'contain',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
              }}
            />
          )}

          {artifact.type === EvidenceType.Audio && artifact.uri && (
            <Box component="audio" controls src={artifact.uri} sx={{ width: '100%' }} />
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
            {ladderLabel && <Chip size="small" variant="outlined" label={ladderLabel} />}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
