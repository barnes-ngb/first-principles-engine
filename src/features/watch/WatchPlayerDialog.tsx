import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'

import type { WatchVideo } from '../../core/types'
import WatchPlayer from './WatchPlayer'

interface WatchPlayerDialogProps {
  /** The single video to play — the player never reaches past it (D7 scope is upstream). */
  video: WatchVideo | null
  open: boolean
  onClose: () => void
}

/**
 * Full-width modal host for the Watch Vehicle player (slice 2). Opened from the
 * library so a curated video can be watched outside a plan first, to de-risk the
 * embed (design §9). Closing / finishing returns to the library — the player's
 * only forward action.
 */
export default function WatchPlayerDialog({ video, open, onClose }: WatchPlayerDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Watch
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {/* key by video so switching videos remounts with fresh done/error state. */}
        {video && <WatchPlayer key={video.youtubeId} video={video} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
