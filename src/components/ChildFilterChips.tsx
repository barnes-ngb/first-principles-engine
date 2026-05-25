import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'

import type { Child } from '../core/types'

export const CHILD_FILTER_ALL = '__all__'

interface ChildFilterChipsProps {
  children: Child[]
  selectedChildId: string
  onSelect: (childId: string) => void
  /** Hide chips when only one child exists (the filter is meaningless). */
  hideWhenSingle?: boolean
}

/**
 * Filter chips sourced from the canonical families/{id}/children collection.
 * Renders "All" + one chip per unique child. The caller is responsible for
 * passing a deduped `children` list (useChildren() does this for you).
 */
export default function ChildFilterChips({
  children,
  selectedChildId,
  onSelect,
  hideWhenSingle = true,
}: ChildFilterChipsProps) {
  if (hideWhenSingle && children.length <= 1) return null

  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
      <Chip
        label="All"
        color={selectedChildId === CHILD_FILTER_ALL ? 'primary' : 'default'}
        variant={selectedChildId === CHILD_FILTER_ALL ? 'filled' : 'outlined'}
        onClick={() => onSelect(CHILD_FILTER_ALL)}
      />
      {children.map((c) => (
        <Chip
          key={c.id}
          label={c.name}
          color={selectedChildId === c.id ? 'primary' : 'default'}
          variant={selectedChildId === c.id ? 'filled' : 'outlined'}
          onClick={() => onSelect(c.id)}
        />
      ))}
    </Stack>
  )
}
