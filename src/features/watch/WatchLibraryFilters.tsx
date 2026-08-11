import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { SubjectBucketLabel } from '../../core/types/enums'
import type { SubjectBucket } from '../../core/types/enums'
import {
  ANY_FILTER,
  hasActiveFilters,
  type WatchLibraryFilters as Filters,
} from './watchLibraryFilter'

interface WatchLibraryFiltersProps {
  filters: Filters
  onChange: (next: Filters) => void
  /**
   * Subject buckets that actually appear in the unfiltered list. The control
   * offers only what is on the shelf — a filter for an empty bucket is a tap
   * that can only ever produce "nothing here".
   */
  availableBuckets: SubjectBucket[]
  /** Children to scope by. A `'both'` video shows under either (see `matchesChild`). */
  children: { id: string; name: string }[]
}

/**
 * Search + filter controls for the Watch Library (FEAT-139).
 *
 * Tappable chips rather than dropdowns, matching `WatchVetInForm`'s existing
 * vocabulary and the repo's mobile-first rule (large tap targets, minimal text
 * entry). Search is the one place typing is unavoidable.
 *
 * Presentation only — it holds no state and reads no data; the parent owns the
 * filter object so the same values drive the list, the grouping, and the empty
 * state without a second copy.
 */
export default function WatchLibraryFiltersBar({
  filters,
  onChange,
  availableBuckets,
  children,
}: WatchLibraryFiltersProps) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })

  return (
    <Stack spacing={1.5}>
      <TextField
        label="Search videos"
        size="small"
        value={filters.search}
        onChange={(e) => set({ search: e.target.value })}
        placeholder="Title or why we're watching"
        fullWidth
      />

      {availableBuckets.length > 1 && (
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Subject
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Chip
              label="All subjects"
              color={filters.subjectBucket === ANY_FILTER ? 'primary' : 'default'}
              variant={filters.subjectBucket === ANY_FILTER ? 'filled' : 'outlined'}
              onClick={() => set({ subjectBucket: ANY_FILTER })}
            />
            {availableBuckets.map((b) => (
              <Chip
                key={b}
                label={SubjectBucketLabel[b]}
                color={filters.subjectBucket === b ? 'primary' : 'default'}
                variant={filters.subjectBucket === b ? 'filled' : 'outlined'}
                onClick={() => set({ subjectBucket: b })}
              />
            ))}
          </Box>
        </Box>
      )}

      {children.length > 1 && (
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Who it&apos;s for
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Chip
              label="Everyone"
              color={filters.childId === ANY_FILTER ? 'primary' : 'default'}
              variant={filters.childId === ANY_FILTER ? 'filled' : 'outlined'}
              onClick={() => set({ childId: ANY_FILTER })}
            />
            {children.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                color={filters.childId === c.id ? 'primary' : 'default'}
                variant={filters.childId === c.id ? 'filled' : 'outlined'}
                onClick={() => set({ childId: c.id })}
              />
            ))}
          </Box>
          {/* Say the 'both' rule out loud — a parent filtering to one boy should
              not wonder why shared videos are still listed. */}
          <Typography variant="caption" color="text.secondary">
            Videos marked “Both” show up for either boy.
          </Typography>
        </Box>
      )}

      {hasActiveFilters(filters) && (
        <Box>
          <Button
            size="small"
            onClick={() =>
              onChange({ search: '', subjectBucket: ANY_FILTER, childId: ANY_FILTER })
            }
          >
            Clear filters
          </Button>
        </Box>
      )}
    </Stack>
  )
}
