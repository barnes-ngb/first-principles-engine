import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo'

import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { SubjectBucketLabel } from '../../core/types/enums'
import type { WatchVideo } from '../../core/types'

interface WatchLibraryPickerProps {
  open: boolean
  onClose: () => void
  /** Curated videos in scope for the child (D7 filter applied upstream). */
  videos: WatchVideo[]
  loading?: boolean
  error?: string | null
  /** Pick a vetted video to plan onto the day. */
  onSelect: (video: WatchVideo) => void
}

/**
 * Watch Vehicle — the planner's "pick a vetted video" dialog (FEAT-104 / design
 * FEAT-86, slice 3). A parent plans a watch item onto a day by choosing from the
 * curated library — never an open search or a raw URL. Scope (D7) is applied by
 * the caller's `useWatchLibrary(childId)`, so only in-scope videos ever show.
 */
export default function WatchLibraryPicker({
  open,
  onClose,
  videos,
  loading = false,
  error = null,
  onSelect,
}: WatchLibraryPickerProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Add a video
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <LoadingState label="Loading library…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : videos.length === 0 ? (
          <EmptyState
            icon={<OndemandVideoIcon />}
            title="No videos to plan yet"
            description="Vet a video into the Watch Library (Settings) first, then plan it here."
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
                  <Button size="small" variant="contained" onClick={() => onSelect(v)}>
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
