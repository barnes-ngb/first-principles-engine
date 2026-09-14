import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import LinkIcon from '@mui/icons-material/Link'

import type { Artifact } from '../core/types'
import { EvidenceType } from '../core/types/enums'
import {
  FILE_MISSING_LABEL,
  artifactMediaMissing,
  artifactMediaUrls,
} from '../core/utils/artifactMedia'

/**
 * The ONE renderer for a piece of evidence's media (UX-433).
 *
 * A photo's picture, an audio clip's play control, a captured video's link, and
 * the sentence for a media-typed artifact that never got its file. Before this
 * there were four hand-rolled copies of that ternary — `ArtifactCard`,
 * `PortfolioPage`, `UnifiedCaptureCard`'s artifact list and `KidTodayView`'s
 * inventory — and each rendered a different subset, which is why a captured
 * `Video` was a bare title on Today and a working link in the Portfolio.
 *
 * Two of them read this now: `ArtifactCard` (the canonical card) and the Today
 * evidence list. `PortfolioPage` is deliberately not rewired here — it layers
 * selection, a lightbox and a multi-photo chip over the same block, and moving
 * it is a wider change than this read-only section earns. Filed as `UX-433`.
 *
 * ── The three rules it carries ─────────────────────────────────────────────
 *
 * **A `Video` is a link, not a file.** Its `uri` is an external address that
 * nothing uploaded (`UX-285`), so it is drawn as an anchor with `rel="noreferrer"`
 * — the destination is arbitrary and parent-supplied.
 *
 * **A `Note` owes no file**, so it is never missing one; its text is the
 * caller's to render, because a parent reads it as a detail line and a kid
 * reads it as the whole entry.
 *
 * **A file that never arrived is SAID, never left blank.** `artifact-media-missing`
 * is 16 rows on Lincoln alone in the 2026-09-11 export (`UX-387`); rendering
 * nothing for one of those makes it indistinguishable from a picture that is
 * still loading.
 *
 * Presentational: no Firestore, no state, no control that changes anything.
 */
export interface ArtifactMediaProps {
  artifact: Artifact
  /** Thumbnails and a compact player, for a dense list. */
  dense?: boolean
  /** The audience's wording for a file that never arrived. */
  fileMissingLabel?: string
}

export default function ArtifactMedia({
  artifact,
  dense = false,
  fileMissingLabel = FILE_MISSING_LABEL,
}: ArtifactMediaProps) {
  const urls = artifactMediaUrls(artifact)
  const type = artifact.type as string
  const isPhoto = type === EvidenceType.Photo || type === 'photo'
  const isAudio = type === EvidenceType.Audio || type === 'audio'
  const isVideo = type === EvidenceType.Video || type === 'video'

  if (artifactMediaMissing(artifact)) {
    return (
      <Typography variant="caption" color="text.secondary">
        {fileMissingLabel}
      </Typography>
    )
  }

  if (isPhoto && urls.length > 0) {
    return (
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {urls.map((url, i) => (
          <Box
            key={`${url}-${i}`}
            component="img"
            src={url}
            alt={artifact.title}
            sx={
              dense
                ? { width: 56, height: 56, borderRadius: 1, objectFit: 'cover' }
                : {
                    width: '100%',
                    maxHeight: 240,
                    objectFit: 'contain',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                  }
            }
          />
        ))}
      </Stack>
    )
  }

  if (isAudio && urls.length > 0) {
    return (
      <Stack spacing={0.5} sx={{ width: '100%' }}>
        {urls.map((url, i) => (
          <Box
            key={`${url}-${i}`}
            component="audio"
            controls
            src={url}
            sx={dense ? { height: 32, width: '100%', maxWidth: 240 } : { width: '100%' }}
          />
        ))}
      </Stack>
    )
  }

  if (isVideo && artifact.uri) {
    return (
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
        <LinkIcon fontSize="small" color="action" />
        <Link
          href={artifact.uri}
          target="_blank"
          rel="noreferrer"
          variant={dense ? 'caption' : 'body2'}
          sx={{ overflowWrap: 'anywhere' }}
        >
          {dense ? 'Open link' : artifact.uri}
        </Link>
      </Stack>
    )
  }

  return null
}
