import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { Artifact } from '../core/types'
import { EvidenceType } from '../core/types/enums'

interface ArtifactCardProps {
  artifact: Artifact
}

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '')

export default function ArtifactCard({ artifact }: ArtifactCardProps) {
  const ladderRef = artifact.tags?.ladderRef
  const ladderLabel = ladderRef
    ? ladderRef.rungId
      ? `Ladder: ${ladderRef.ladderId} / Rung: ${ladderRef.rungId}`
      : `Ladder: ${ladderRef.ladderId}`
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
            <Typography variant="caption" color="text.secondary">
              Created {formatDate(artifact.createdAt)}
            </Typography>
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

          {/*
            A Video artifact's `uri` is an EXTERNAL link, not a Storage download
            URL — nothing is uploaded for it — so it is rendered as a link
            rather than as media (Codex round 1). Before this, `uri` was drawn
            only for Photo and Audio, so a captured link could not be opened or
            even read. `rel="noreferrer"` because the destination is arbitrary
            and parent-supplied.
          */}
          {artifact.type === EvidenceType.Video && artifact.uri && (
            <Link
              href={artifact.uri}
              target="_blank"
              rel="noreferrer"
              variant="body2"
              sx={{ overflowWrap: 'anywhere' }}
            >
              {artifact.uri}
            </Link>
          )}

          {artifact.content && artifact.content !== artifact.uri && (
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
