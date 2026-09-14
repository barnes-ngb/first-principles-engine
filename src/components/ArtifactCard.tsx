import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { Artifact } from '../core/types'
import ArtifactMedia from './ArtifactMedia'

interface ArtifactCardProps {
  artifact: Artifact
}

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '')

/**
 * NOTE (Codex round 3 on the UX-285 PR): this component is imported nowhere, so
 * nothing here reaches a user. It is kept because it is the canonical card and
 * the place a reader looks for one — but it is NOT what makes a captured link
 * openable. That is `PortfolioPage`'s own link row and the portfolio markdown's
 * Links section (UX-285); if this component is ever mounted, check those first
 * rather than assuming this is the live path.
 *
 * UX-433: its hand-rolled media block — a photo, an audio control and a video
 * link, each behind its own `type ===` test — moved to the shared
 * `ArtifactMedia`, which the Today evidence list also renders. An unmounted
 * component quietly drifting away from the live one is exactly how four
 * different subsets of the same five types came to exist.
 */
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

          <ArtifactMedia artifact={artifact} />

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
