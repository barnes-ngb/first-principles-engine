import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Child } from '../core/types/domain'

interface ChildSelectorProps {
  children: Child[]
  selectedChildId: string
  onSelect: (childId: string) => void
  isLoading?: boolean
  emptyMessage?: string
}

export default function ChildSelector({
  children,
  selectedChildId,
  onSelect,
  isLoading,
  emptyMessage = 'No children found.',
}: ChildSelectorProps) {
  if (isLoading) {
    return (
      <Typography color="text.secondary" variant="body2">
        Loading...
      </Typography>
    )
  }

  if (children.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        {emptyMessage}
      </Typography>
    )
  }

  // Don't render if there's only one child — the page implicitly works for that child
  if (children.length === 1) return null

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {children.map((child) => {
        const selected = child.id === selectedChildId
        return (
          <Chip
            key={child.id}
            label={child.name}
            variant={selected ? 'filled' : 'outlined'}
            color={selected ? 'primary' : 'default'}
            onClick={() => onSelect(child.id)}
            sx={{
              fontWeight: selected ? 700 : 400,
              fontSize: '0.9rem',
              py: 2,
            }}
          />
        )
      })}
    </Stack>
  )
}
