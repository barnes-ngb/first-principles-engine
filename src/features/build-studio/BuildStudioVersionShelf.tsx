/**
 * The shelf of saved versions (LOCAL-BUILD-001).
 *
 * Presentational and **stateless** — it reads no Firestore, holds no React
 * state, writes nothing and cannot start a save. Both audiences render it: the
 * child, who may reopen a version, and the parent, who may only look. The
 * difference is one prop, `canOpen`, so the two views cannot drift into
 * disagreeing about what is on the shelf.
 *
 * ── Three states, three sentences ──────────────────────────────────────────
 *
 * A read that FAILED is not an empty shelf, and this component is where that
 * rule becomes something a person sees: a failure says the list could not be
 * read and offers a retry, and only an answered, genuinely empty list says
 * nothing has been saved yet.
 */

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { BuildStudioVersion } from '../../core/types/buildStudio'
import { formatClockTime } from '../../core/utils/clockTime'
import { VersionsStatus, type BuildStudioVersionsRead } from './useBuildStudioVersions'

export interface BuildStudioVersionShelfProps {
  read: BuildStudioVersionsRead
  /** True only for the child's own build view. A parent never gets this. */
  canOpen: boolean
  /** Reopen one version. Absent when `canOpen` is false. */
  onOpen?: (version: BuildStudioVersion) => void
  /** Get the bytes out — offered to both audiences, always. */
  onDownload: (version: BuildStudioVersion) => void
  /** The version the editor currently holds, when one was reopened. */
  currentVersionId?: string | null
  /** A version whose open is in flight. */
  busyVersionId?: string | null
  /** Ask for the read again, after a failure. */
  onRetryRead?: () => void
}

/** The day and time a version was saved, in the family's own clock. */
function savedLine(version: BuildStudioVersion): string {
  const time = formatClockTime(version.createdAt)
  const day = version.createdAt?.slice(0, 10) ?? ''
  if (!day) return 'Saved — time unknown'
  return time ? `Saved ${day} at ${time}` : `Saved ${day}`
}

export default function BuildStudioVersionShelf({
  read,
  canOpen,
  onOpen,
  onDownload,
  currentVersionId,
  busyVersionId,
  onRetryRead,
}: BuildStudioVersionShelfProps) {
  if (read.status === VersionsStatus.Loading) {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center" role="status" aria-live="polite">
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          Looking for your saved games…
        </Typography>
      </Stack>
    )
  }

  if (read.status === VersionsStatus.Failed) {
    return (
      <Alert
        severity="warning"
        action={
          onRetryRead ? (
            <Button size="small" onClick={onRetryRead} sx={{ textTransform: 'none' }}>
              Try again
            </Button>
          ) : undefined
        }
      >
        {/* The load-bearing sentence of this whole component: a failed read is
            NOT an empty shelf, and a child must never be told his saves are
            gone because one request did not come back. */}
        Couldn&apos;t load your saved games just now. They are still there — this is
        the list that didn&apos;t load, not your games.
      </Alert>
    )
  }

  if (read.versions.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Nothing saved yet. Change something, then tap Save my version.
      </Typography>
    )
  }

  return (
    <Stack spacing={1} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {read.versions.map((version) => {
        const isCurrent = currentVersionId === version.versionId
        const isBusy = busyVersionId === version.versionId
        return (
          <Box
            key={version.id}
            component="li"
            sx={{
              border: '1px solid',
              borderColor: isCurrent ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: 1.5,
            }}
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              justifyContent="space-between"
            >
              <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {version.label}
                  {isCurrent && ' — open now'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {savedLine(version)}
                </Typography>
                {/* The digest is shown rather than hidden: it is how a person
                    confirms by eye that a reopened version is the same bytes
                    that were stored, which is the slice's own acceptance
                    check. */}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
                >
                  {version.fileCount} files · {version.sourceDigest}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
                {canOpen && onOpen && (
                  <Button
                    variant={isCurrent ? 'outlined' : 'contained'}
                    size="large"
                    disabled={isBusy}
                    onClick={() => onOpen(version)}
                    sx={{ textTransform: 'none', fontWeight: 600, minHeight: 48 }}
                  >
                    {isBusy ? 'Opening…' : 'Open this one'}
                  </Button>
                )}
                <Button
                  variant="text"
                  size="large"
                  onClick={() => onDownload(version)}
                  sx={{ textTransform: 'none', minHeight: 48 }}
                >
                  Download a copy
                </Button>
              </Stack>
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
