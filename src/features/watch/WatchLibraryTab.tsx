import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'

import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { useChildren } from '../../core/hooks/useChildren'
import { SubjectBucketLabel } from '../../core/types/enums'
import type { WatchVideo } from '../../core/types'
import WatchVetInForm from './WatchVetInForm'
import WatchPlayerDialog from './WatchPlayerDialog'
import { useWatchLibrary } from './useWatchLibrary'

/** Resolve a scope value to a display label (child name, or "Both"). */
function scopeLabel(childId: WatchVideo['childId'], names: Record<string, string>): string {
  return childId === 'both' ? 'Both' : (names[childId] ?? childId)
}

/**
 * Parent-only Watch Vehicle library (FEAT-100 slice 1). The curation surface —
 * a vet-in form + the curated list — that lands the data model before the
 * player (slice 2) or planner (slice 3). Curation is a parent job, so this
 * lives behind the Settings parent gate, never on a kid surface.
 */
export default function WatchLibraryTab() {
  const { videos, loading, error, addVideo } = useWatchLibrary()
  const { children } = useChildren()
  const names = Object.fromEntries(children.map((c) => [c.id, c.name])) as Record<string, string>
  const [playing, setPlaying] = useState<WatchVideo | null>(null)

  return (
    <Stack spacing={3}>
      <WatchVetInForm onSave={async (v) => void (await addVideo(v))} />

      <Divider />

      <Stack spacing={1.5}>
        <Typography variant="h6">Library</Typography>
        <Typography variant="body2" color="text.secondary">
          Vetted videos live here. Planning and watching come next.
        </Typography>

        {loading ? (
          <LoadingState label="Loading library…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : videos.length === 0 ? (
          <EmptyState
            icon={<OndemandVideoIcon />}
            title="No videos yet"
            description="Paste a YouTube link above, give it a title in your words, and add it."
          />
        ) : (
          <Stack spacing={1}>
            {videos.map((v) => (
              <Box
                key={v.id}
                sx={{
                  p: 1.5,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
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
                  <Chip size="small" variant="outlined" label={scopeLabel(v.childId, names)} />
                  <Chip size="small" variant="outlined" label={`Added by ${v.addedBy}`} />
                </Box>
                <Box sx={{ mt: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<PlayArrowIcon />}
                    onClick={() => setPlaying(v)}
                  >
                    Watch
                  </Button>
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Stack>

      {/* Practice player — watch a curated video outside a plan (§9). It does
          not count hours yet (D3); planning + counting come in slice 3. */}
      <WatchPlayerDialog
        video={playing}
        open={playing !== null}
        onClose={() => setPlaying(null)}
      />
    </Stack>
  )
}
