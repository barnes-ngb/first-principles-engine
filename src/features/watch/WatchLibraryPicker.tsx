import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo'

import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { SubjectBucketLabel } from '../../core/types/enums'
import type { WatchVideo } from '../../core/types'
import WatchVetInForm from './WatchVetInForm'
import type { NewWatchVideo } from './useWatchLibrary'

interface WatchLibraryPickerProps {
  open: boolean
  onClose: () => void
  /** Curated videos in scope for the child (D7 filter applied upstream). */
  videos: WatchVideo[]
  loading?: boolean
  error?: string | null
  /** Pick a vetted video to plan onto the day. */
  onSelect: (video: WatchVideo) => void
  /**
   * Vet a brand-new video in without leaving the planner (FEAT-107 inline
   * vet-in). When provided, an "Add a new video" affordance opens the shared
   * `WatchVetInForm` inline; on save the new video flows back through the
   * caller's `useWatchLibrary` subscription and appears selectable immediately.
   * **Parent-gated at the call site** — omit it (kid / non-parent) and no
   * curation affordance renders. Reuses the Settings vet-in form; no duplicate
   * form logic.
   */
  onAddVideo?: (video: NewWatchVideo) => Promise<void>
  /** Jump to the full Watch Library (Settings) for bulk curation. Shown next to
   *  the inline add affordance; parent-gated with it. */
  onManageLibrary?: () => void
}

/**
 * Watch Vehicle — the planner's "pick a vetted video" dialog (FEAT-104 / design
 * FEAT-86, slice 3). A parent plans a watch item onto a day by choosing from the
 * curated library — never an open search or a raw URL. Scope (D7) is applied by
 * the caller's `useWatchLibrary(childId)`, so only in-scope videos ever show.
 *
 * FEAT-107 (inline vet-in): a parent who thinks of a video mid-planning can vet
 * it in right here (see `onAddVideo`) instead of leaving for Settings and back.
 */
export default function WatchLibraryPicker({
  open,
  onClose,
  videos,
  loading = false,
  error = null,
  onSelect,
  onAddVideo,
  onManageLibrary,
}: WatchLibraryPickerProps) {
  const [adding, setAdding] = useState(false)

  // The picker stays mounted across sessions (the caller only toggles `open`),
  // so collapse any expanded vet-in panel on the way out — otherwise the next
  // open (possibly for a different day) would jump straight to an empty form
  // labelled "Cancel" instead of the normal library list. Every closure path
  // the picker owns resets it: backdrop/Escape/close button via `handleClose`,
  // and selecting a video via `handleSelect`.
  const handleClose = () => {
    setAdding(false)
    onClose()
  }
  const handleSelect = (video: WatchVideo) => {
    setAdding(false)
    onSelect(video)
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Add a video
        <IconButton
          aria-label="Close"
          onClick={handleClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {/* Inline vet-in (parent-gated by the caller passing onAddVideo). */}
        {onAddVideo && (
          <Box sx={{ mb: 2 }}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="space-between"
            >
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setAdding((a) => !a)}
              >
                {adding ? 'Cancel' : 'Add a new video'}
              </Button>
              {onManageLibrary && (
                <Button size="small" variant="text" onClick={onManageLibrary}>
                  Manage library
                </Button>
              )}
            </Stack>
            <Collapse in={adding} unmountOnExit>
              <Box
                sx={{
                  mt: 1.5,
                  p: 1.5,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                {/* Reuse the Settings vet-in form verbatim — no duplicate form
                    logic. On save the video persists via the caller's addVideo;
                    the library subscription re-renders it into the list below. */}
                <WatchVetInForm
                  onSave={async (v) => {
                    await onAddVideo(v)
                    setAdding(false)
                  }}
                />
              </Box>
            </Collapse>
            <Divider sx={{ mt: 2 }} />
          </Box>
        )}

        {loading ? (
          <LoadingState label="Loading library…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : videos.length === 0 ? (
          <EmptyState
            icon={<OndemandVideoIcon />}
            title="No videos to plan yet"
            description={
              onAddVideo
                ? 'Add one with “Add a new video” above, or vet a batch in the Watch Library (Settings).'
                : 'Vet a video into the Watch Library (Settings) first, then plan it here.'
            }
          />
        ) : (
          <Stack spacing={1}>
            {videos.map((v) => (
              <Box
                key={v.id}
                sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}
              >
                <Typography variant="subtitle1">{v.title}</Typography>
                {v.why && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {v.why}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                  <Chip size="small" label={`${v.plannedMinutes} min`} />
                  <Chip size="small" label={SubjectBucketLabel[v.subjectBucket]} />
                </Box>
                <Box sx={{ mt: 1 }}>
                  <Button size="small" variant="contained" onClick={() => handleSelect(v)}>
                    Plan this
                  </Button>
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  )
}
