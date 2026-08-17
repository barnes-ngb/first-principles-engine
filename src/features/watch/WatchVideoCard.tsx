import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'

import { SubjectBucketLabel } from '../../core/types/enums'
import type { WatchVideo } from '../../core/types'
import WatchVetInForm from './WatchVetInForm'
import { isRetired } from './watchLibraryStatus'
import { watchCuratorLabel } from './watchCuratorLabel'

export interface WatchVideoCardProps {
  video: WatchVideo
  /** Display label for the video's scope (a child's name, or "Both"). */
  scopeLabel: string
  /**
   * One-line watch history, or `null` when the video has no completed watch
   * inside the read window. The card never invents this text — see
   * `summarizeWatchEntry`.
   */
  historyLine: string | null
  /** The window the history covers, so "not watched" can name its own limit. */
  historyWindowDays: number
  /**
   * `true` when the look-back has not produced an answer — still loading, or it
   * failed. The card then renders **no** history line at all.
   *
   * Loading and failure are one flag on purpose: the negative wording ("not
   * watched in the last N days") is a *claim*, and an empty history index means
   * "nothing found" only when the read actually succeeded. A failed read (offline,
   * permission) also yields an empty index, so rendering the negative there would
   * present a failed lookup as a confident negative result — the exact overclaim
   * the windowed wording exists to prevent.
   */
  historyUnavailable: boolean
  editing: boolean
  confirmingRetire: boolean
  onWatch: () => void
  onEdit: () => void
  onCancelEdit: () => void
  onSave: (patch: Partial<Omit<WatchVideo, 'id'>>) => Promise<void>
  onArmRetire: () => void
  onCancelRetire: () => void
  onConfirmRetire: () => Promise<void>
  onRestore: () => void
}

/**
 * One row of the Watch Library (FEAT-139) — extracted verbatim from
 * `WatchLibraryTab` so the library view and the archive view render a video the
 * same way rather than growing two drifting copies.
 *
 * Behaviour is unchanged from FEAT-129: inline edit reuses `WatchVetInForm`,
 * retire is propose→confirm, and a retired row offers "Put back" instead of
 * "Remove". What is new is the watch-history line (FEAT-139) — a **read**, never
 * a write, and deliberately worded to name its own window so an old watch
 * outside it is never reported as "never".
 */
export default function WatchVideoCard({
  video,
  scopeLabel,
  historyLine,
  historyWindowDays,
  historyUnavailable,
  editing,
  confirmingRetire,
  onWatch,
  onEdit,
  onCancelEdit,
  onSave,
  onArmRetire,
  onCancelRetire,
  onConfirmRetire,
  onRestore,
}: WatchVideoCardProps) {
  const retired = isRetired(video)

  return (
    <Box
      sx={{
        p: 1.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        opacity: retired ? 0.6 : 1,
      }}
    >
      {editing ? (
        /* Edit in place, reusing the vet-in form (one form, one set of
           validation rules). A title edit patches THIS document only — a planned
           item keeps the label it was planned with and resolves the video by id,
           so past weeks never silently rewrite. */
        <WatchVetInForm initial={video} onCancel={onCancelEdit} onSave={onSave} />
      ) : (
        <>
          <Typography variant="subtitle1">{video.title}</Typography>
          {video.why && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {video.why}
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
            <Chip size="small" label={`${video.plannedMinutes} min`} />
            <Chip size="small" label={SubjectBucketLabel[video.subjectBucket]} />
            <Chip size="small" variant="outlined" label={scopeLabel} />
            <Chip
              size="small"
              variant="outlined"
              label={`Added by ${watchCuratorLabel(video.addedBy)}`}
            />
            {retired && <Chip size="small" color="default" label="Retired" />}
          </Box>

          {/* Watch history (FEAT-139). Both wordings name the window: a video
              last watched before it is "not in the last N days", never "never".
              Rendered only once the look-back has actually answered — see
              `historyUnavailable`. */}
          {!historyUnavailable && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
              {historyLine ?? `Not watched in the last ${historyWindowDays} days`}
            </Typography>
          )}

          {confirmingRetire ? (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Remove “{video.title}” from the library? It stays in any week it was already
                planned into, and can still be watched there. You&apos;ll find it in the Archive.
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  color="warning"
                  onClick={() => void onConfirmRetire()}
                >
                  Remove from library
                </Button>
                <Button size="small" onClick={onCancelRetire}>
                  Cancel
                </Button>
              </Stack>
            </Box>
          ) : (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
              <Button
                size="small"
                variant="outlined"
                startIcon={<PlayArrowIcon />}
                onClick={onWatch}
              >
                Watch
              </Button>
              <Button size="small" variant="text" onClick={onEdit}>
                Edit
              </Button>
              {retired ? (
                <Button size="small" variant="text" onClick={onRestore}>
                  Put back
                </Button>
              ) : (
                <Button size="small" variant="text" color="warning" onClick={onArmRetire}>
                  Remove
                </Button>
              )}
            </Stack>
          )}
        </>
      )}
    </Box>
  )
}
