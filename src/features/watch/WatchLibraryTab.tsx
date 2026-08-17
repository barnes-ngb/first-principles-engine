import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import InventoryIcon from '@mui/icons-material/Inventory2'
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo'

import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { useChildren } from '../../core/hooks/useChildren'
import { useProfile } from '../../core/profile/useProfile'
import type { SubjectBucket } from '../../core/types/enums'
import type { WatchVideo } from '../../core/types'
import WatchVetInForm from './WatchVetInForm'
import WatchPlayerDialog from './WatchPlayerDialog'
import WatchLibraryFiltersBar from './WatchLibraryFilters'
import WatchVideoCard from './WatchVideoCard'
import { useWatchHistory } from './useWatchHistory'
import { useWatchLibrary } from './useWatchLibrary'
import { summarizeWatchEntry } from './watchHistory'
import { activeVideos, retiredVideos } from './watchLibraryStatus'
import {
  EMPTY_WATCH_FILTERS,
  describeActiveFilters,
  filterWatchVideos,
  groupBySubject,
  hasActiveFilters,
  type WatchLibraryFilters,
} from './watchLibraryFilter'

/** Resolve a scope value to a display label (child name, or "Both"). */
function scopeLabel(childId: WatchVideo['childId'], names: Record<string, string>): string {
  return childId === 'both' ? 'Both' : (names[childId] ?? childId)
}

type LibraryView = 'library' | 'archive'

/**
 * Parent-only Watch Vehicle library (FEAT-100 slice 1; CRUD in FEAT-129; its own
 * `/watch` home in FEAT-132; **organised in FEAT-139**). The curation surface —
 * vet-in, find, list, edit, and retire.
 *
 * **Capability gate (FEAT-129).** Curation is a parent job, and this surface
 * writes to `watchLibrary`. `WatchLibraryPage` sits behind `RequireParent`, but
 * that is a call-site gate: the component carries its own `canEdit` check so the
 * surface is safe wherever it is mounted. The gate sits ABOVE the data hooks, so
 * a non-parent profile costs **zero Firestore reads** — the FEAT-122 shape
 * (capability, never a name — ARCH-41/42/43).
 *
 * **FEAT-139 — two views, one subscription.** Retired videos move out of the old
 * inline "Show retired" switch into their own **Archive** tab. A tab rather than
 * a second route, because `useWatchLibrary()` already returns the whole family
 * library in one snapshot: a route would stand up a second subscription and a
 * second copy of the parent gate to render a subset of data this component is
 * already holding, and "Put back" would then be a navigation instead of a video
 * visibly moving between two tabs. The active library no longer shows retired
 * entries at all, and the picker's `activeVideos` filter is untouched — a retired
 * video still can't be planned or swapped in (FEAT-138).
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
  // Watch history is a bounded, one-shot look-back over day logs — see
  // `useWatchHistory` for the window and what it hides. Read-only.
  const {
    history,
    loading: historyLoading,
    error: historyError,
    windowDays,
  } = useWatchHistory()
  // A failed read yields the SAME empty index as a successful one that found
  // nothing, so the error has to be carried here — otherwise every card would
  // render the confident "Not watched in the last N days" for a lookup that
  // never actually answered. Loading and failure both mean "no claim".
  const historyUnavailable = historyLoading || historyError !== null

  const names = Object.fromEntries(children.map((c) => [c.id, c.name])) as Record<string, string>
  const childName = (id: string) => names[id] ?? id

  const [playing, setPlaying] = useState<WatchVideo | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Retire is propose→confirm: the first tap arms the row, the second writes.
  const [confirmRetireId, setConfirmRetireId] = useState<string | null>(null)
  const [view, setView] = useState<LibraryView>('library')
  const [filters, setFilters] = useState<WatchLibraryFilters>(EMPTY_WATCH_FILTERS)

  const active = useMemo(() => activeVideos(videos), [videos])
  const retired = useMemo(() => retiredVideos(videos), [videos])
  const visible = useMemo(() => filterWatchVideos(active, filters), [active, filters])
  const groups = useMemo(() => groupBySubject(visible), [visible])

  // Offer a subject chip only for buckets that are actually on the shelf, and
  // derive them from the UNFILTERED active list so the chips don't disappear as
  // a parent narrows down (which would make the filter un-undoable).
  const availableBuckets = useMemo(
    () => [...new Set(active.map((v) => v.subjectBucket))] as SubjectBucket[],
    [active],
  )

  /** Shared row renderer — the two views must not drift. */
  const renderCard = (v: WatchVideo) => (
    <WatchVideoCard
      key={v.id}
      video={v}
      scopeLabel={scopeLabel(v.childId, names)}
      historyLine={summarizeWatchEntry(history[v.id], childName)}
      historyWindowDays={windowDays}
      historyUnavailable={historyUnavailable}
      editing={editingId === v.id}
      confirmingRetire={confirmRetireId === v.id}
      onWatch={() => setPlaying(v)}
      onEdit={() => {
        setConfirmRetireId(null)
        setEditingId(v.id)
      }}
      onCancelEdit={() => setEditingId(null)}
      onSave={async (patch) => {
        await updateVideo(v.id, patch)
        setEditingId(null)
      }}
      onArmRetire={() => setConfirmRetireId(v.id)}
      onCancelRetire={() => setConfirmRetireId(null)}
      onConfirmRetire={async () => {
        await retireVideo(v.id)
        setConfirmRetireId(null)
      }}
      onRestore={() => void restoreVideo(v.id)}
    />
  )

  const filterDescription = describeActiveFilters(filters, childName)

  return (
    <Stack spacing={3}>
      {/* Vet-in stays with the active library only — you don't add a video to
          the archive. */}
      {view === 'library' && <WatchVetInForm onSave={async (v) => void (await addVideo(v))} />}

      <Divider />

      <Stack spacing={1.5}>
        <Tabs
          value={view}
          onChange={(_, next: LibraryView) => {
            setView(next)
            // Leave no half-armed confirm or open editor behind on the other view.
            setEditingId(null)
            setConfirmRetireId(null)
          }}
          variant="fullWidth"
        >
          <Tab value="library" label="Library" />
          <Tab value="archive" label={`Archive (${retired.length})`} />
        </Tabs>

        {view === 'library' ? (
          <>
            <Typography variant="body2" color="text.secondary">
              Vetted videos live here. Plan one onto a day in Plan My Week (it counts time and
              leaves a portfolio note), or press Watch to preview it — previewing here
              doesn&apos;t count hours.
            </Typography>

            {loading ? (
              <LoadingState label="Loading library…" />
            ) : error ? (
              <ErrorState message={error} />
            ) : (
              <>
                {active.length > 0 && (
                  <WatchLibraryFiltersBar
                    filters={filters}
                    onChange={setFilters}
                    availableBuckets={availableBuckets}
                    children={children.map((c) => ({ id: c.id, name: c.name }))}
                  />
                )}

                {visible.length === 0 ? (
                  /* Three distinct empties, because "nothing here" for three very
                     different reasons is the confusing case this run exists to
                     fix. A filtered-empty shelf says which filter is hiding
                     things; a fully-retired shelf points at the Archive. */
                  hasActiveFilters(filters) && active.length > 0 ? (
                    <EmptyState
                      icon={<OndemandVideoIcon />}
                      title="No videos match those filters"
                      description={`Nothing in the library ${filterDescription}. Clear the filters to see all ${active.length} of them.`}
                    />
                  ) : videos.length === 0 ? (
                    <EmptyState
                      icon={<OndemandVideoIcon />}
                      title="No videos yet"
                      description="Paste a YouTube link above, give it a title in your words, and add it."
                    />
                  ) : (
                    <EmptyState
                      icon={<InventoryIcon />}
                      title="Everything is in the Archive"
                      description={`All ${retired.length} videos are archived. Open the Archive tab to put one back.`}
                    />
                  )
                ) : (
                  <Stack spacing={2.5}>
                    {groups.map((group) => (
                      <Box key={group.bucket}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                          {group.label} ({group.count})
                        </Typography>
                        <Stack spacing={1}>{group.videos.map(renderCard)}</Stack>
                      </Box>
                    ))}
                  </Stack>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary">
              Videos you archived. Nothing is ever deleted — a week that already planned one
              still plays it, and it stays out of the planner until you put it back.
            </Typography>

            {loading ? (
              <LoadingState label="Loading library…" />
            ) : error ? (
              <ErrorState message={error} />
            ) : retired.length === 0 ? (
              <EmptyState
                icon={<InventoryIcon />}
                title="Nothing archived"
                description="Videos you archive land here, so you can always put one back."
              />
            ) : (
              <Stack spacing={1}>{retired.map(renderCard)}</Stack>
            )}
          </>
        )}
      </Stack>

      {/* Practice player — watch a curated video outside a plan (§9). It does
          not count hours (D3); planning + counting live in the planner path. */}
      <WatchPlayerDialog video={playing} open={playing !== null} onClose={() => setPlaying(null)} />
    </Stack>
  )
}
