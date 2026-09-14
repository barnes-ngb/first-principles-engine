import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import ArtifactMedia from '../../components/ArtifactMedia'
import type { Artifact, ChecklistItem } from '../../core/types'
import {
  EvidenceAudience,
  buildTodayEvidence,
  evidenceCopy,
} from './todayEvidence'

/**
 * The day's evidence, as a person reads it (UX-431).
 *
 * Presentational and read-only: it subscribes to nothing, holds no state, and
 * renders no control that changes anything. Both Today surfaces render THIS —
 * the parent's section at the bottom of the page and Kid Today's inventory —
 * so the two can never again show different subsets of the same five types.
 *
 * The wording is the audience's, gated on **capability** and never on a name;
 * the kid strings are held to the shared readability bar in
 * `TodayEvidenceList.test.tsx`.
 *
 * **A failed read is not an empty day.** The caller passes `failed` and this
 * says so, rather than printing "nothing captured yet" over a read that did not
 * land — the same rule the weekly review states in four places.
 */
export interface TodayEvidenceListProps {
  artifacts: readonly Artifact[]
  checklist?: readonly ChecklistItem[]
  audience: EvidenceAudience
  /** The read dropped. Never rendered as an affirmative empty result. */
  failed?: boolean
  /**
   * The family's own `FamilySettings.timeZone`, where they have set one
   * (Codex round 1, P2). Absent falls back to the app's default inside
   * `resolveFamilyTimeZone`; so does a value the runtime cannot parse.
   */
  timeZone?: string
}

export default function TodayEvidenceList({
  artifacts,
  checklist = [],
  audience,
  failed = false,
  timeZone,
}: TodayEvidenceListProps) {
  const copy = evidenceCopy(audience)

  if (failed) {
    return (
      <Typography variant="body2" color="text.secondary">
        {copy.failedLine}
      </Typography>
    )
  }

  const entries = buildTodayEvidence({ artifacts, checklist, audience, timeZone })

  if (entries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {copy.emptyLine}
      </Typography>
    )
  }

  return (
    <Stack spacing={1}>
      {entries.map((entry) => (
        <Stack
          key={entry.key}
          direction="row"
          spacing={1.5}
          alignItems="flex-start"
          sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover' }}
        >
          {/* The time, first and fixed-width, so the column reads as a column.
              A stamp that cannot be read shows nothing rather than a guess. */}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ minWidth: 64, flexShrink: 0, pt: 0.25 }}
          >
            {entry.time ?? ''}
          </Typography>

          <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip size="small" label={entry.typeWord} />
              {entry.title && (
                <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
                  {entry.title}
                </Typography>
              )}
            </Stack>

            {/* Which row it belongs to. A kid gets the row's name when there is
                one and nothing when there is not — "(not attached to a row)" is
                a filing word, not his. */}
            {entry.rowLabel ? (
              <Typography variant="caption" color="text.secondary">
                {entry.rowLabel}
              </Typography>
            ) : (
              copy.unattachedLabel && (
                <Typography variant="caption" color="text.secondary">
                  {copy.unattachedLabel}
                </Typography>
              )
            )}

            {entry.details.map((detail, i) => (
              <Typography
                key={`${entry.key}-detail-${i}`}
                variant="body2"
                color="text.secondary"
                sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
              >
                {detail}
              </Typography>
            ))}

            <Box>
              <ArtifactMedia
                artifact={entry.artifact}
                dense
                fileMissingLabel={copy.fileMissingLabel}
              />
            </Box>
          </Stack>
        </Stack>
      ))}
    </Stack>
  )
}
