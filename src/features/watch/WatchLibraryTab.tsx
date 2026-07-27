import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'

import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { useChildren } from '../../core/hooks/useChildren'
import { useProfile } from '../../core/profile/useProfile'
import { SubjectBucketLabel } from '../../core/types/enums'
import type { WatchVideo } from '../../core/types'
import WatchVetInForm from './WatchVetInForm'
import WatchPlayerDialog from './WatchPlayerDialog'
import { useWatchLibrary } from './useWatchLibrary'
import { activeVideos, isRetired, retiredVideos } from './watchLibraryStatus'

/** Resolve a scope value to a display label (child name, or "Both"). */
function scopeLabel(childId: WatchVideo['childId'], names: Record<string, string>): string {
  return childId === 'both' ? 'Both' : (names[childId] ?? childId)
}

/**
 * Parent-only Watch Vehicle library (FEAT-100 slice 1; CRUD completed in
 * FEAT-129). The curation surface — vet-in, list, edit, and retire.
 *
 * **Capability gate (FEAT-129).** Curation is a parent job, and this surface
 * writes to `watchLibrary`. `SettingsPage` already hides the tab behind its own
 * parent check, but that is a call-site gate: the component carries its own
 * `canEdit` check so the surface is safe wherever it is mounted. The gate sits
 * ABOVE the data hooks, so a non-parent profile costs **zero Firestore reads** —
 * the FEAT-122 shape (capability, never a name — ARCH-41/42/43).
 */
export default function WatchLibraryTab() {
  const { canEdit } = useProfile()
  // Gate BEFORE the subscription: `WatchLibraryTabInner` owns every hook that
  // touches Firestore, so a gated render never opens one.
  if (!canEdit) return null
  return <WatchLibraryTabInner />
}

function WatchLibraryTabInner() {
  const { videos, loading, error, addVideo, updateVideo, retireVideo, restoreVideo } =
    useWatchLibrary()
  const { children } = useChildren()
  const names = Object.fromEntries(children.map((c) => [c.id, c.name])) as Record<string, string>
  const [playing, setPlaying] = useState<WatchVideo | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Retire is propose→confirm: the first tap arms the row, the second writes.
  const [confirmRetireId, setConfirmRetireId] = useState<string | null>(null)
  const [showRetired, setShowRetired] = useState(false)

  const retiredCount = retiredVideos(videos).length
  const shown = showRetired ? videos : activeVideos(videos)

  return (
    <Stack spacing={3}>
      <WatchVetInForm onSave={async (v) => void (await addVideo(v))} />

      <Divider />

      <Stack spacing={1.5}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
        >
          <Typography variant="h6">Library</Typography>
          {retiredCount > 0 && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showRetired}
                  onChange={(e) => setShowRetired(e.target.checked)}
                />
              }
              label={`Show retired (${retiredCount})`}
            />
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Vetted videos live here. Plan one onto a day in Plan My Week (it counts time and
          leaves a portfolio note), or press Watch to preview it — previewing here doesn&apos;t
          count hours.
        </Typography>

        {loading ? (
          <LoadingState label="Loading library…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<OndemandVideoIcon />}
            title={videos.length === 0 ? 'No videos yet' : 'Nothing in the library'}
            description={
              videos.length === 0
                ? 'Paste a YouTube link above, give it a title in your words, and add it.'
                : 'Every video here is retired. Turn on “Show retired” to bring one back.'
            }
          />
        ) : (
          <Stack spacing={1}>
            {shown.map((v) => {
              const retired = isRetired(v)
              return (
                <Box
                  key={v.id}
                  sx={{
                    p: 1.5,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    opacity: retired ? 0.6 : 1,
                  }}
                >
                  {editingId === v.id ? (
                    /* Edit in place, reusing the vet-in form (one form, one set
                       of validation rules). A title edit patches THIS document
                       only — a planned item keeps the label it was planned with
                       and resolves the video by id, so past weeks never
                       silently rewrite. */
                    <WatchVetInForm
                      initial={v}
                      onCancel={() => setEditingId(null)}
                      onSave={async (patch) => {
                        await updateVideo(v.id, patch)
                        setEditingId(null)
                      }}
                    />
                  ) : (
                    <>
                      <Typography variant="subtitle1">{v.title}</Typography>
                      {v.why && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          {v.why}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                        <Chip size="small" label={`${v.plannedMinutes} min`} />
                        <Chip size="small" label={SubjectBucketLabel[v.subjectBucket]} />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={scopeLabel(v.childId, names)}
                        />
                        <Chip size="small" variant="outlined" label={`Added by ${v.addedBy}`} />
                        {retired && <Chip size="small" color="default" label="Retired" />}
                      </Box>

                      {confirmRetireId === v.id ? (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            Remove “{v.title}” from the library? It stays in any week it was
                            already planned into, and can still be watched there.
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="contained"
                              color="warning"
                              onClick={async () => {
                                await retireVideo(v.id)
                                setConfirmRetireId(null)
                              }}
                            >
                              Remove from library
                            </Button>
                            <Button size="small" onClick={() => setConfirmRetireId(null)}>
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
                            onClick={() => setPlaying(v)}
                          >
                            Watch
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => {
                              setConfirmRetireId(null)
                              setEditingId(v.id)
                            }}
                          >
                            Edit
                          </Button>
                          {retired ? (
                            <Button
                              size="small"
                              variant="text"
                              onClick={() => void restoreVideo(v.id)}
                            >
                              Put back
                            </Button>
                          ) : (
                            <Button
                              size="small"
                              variant="text"
                              color="warning"
                              onClick={() => setConfirmRetireId(v.id)}
                            >
                              Remove
                            </Button>
                          )}
                        </Stack>
                      )}
                    </>
                  )}
                </Box>
              )
            })}
          </Stack>
        )}
      </Stack>

      {/* Practice player — watch a curated video outside a plan (§9). It does
          not count hours (D3); planning + counting live in the planner path. */}
      <WatchPlayerDialog
        video={playing}
        open={playing !== null}
        onClose={() => setPlaying(null)}
      />
    </Stack>
  )
}
