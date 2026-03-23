import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

/**
 * Pre-defined adjustment suggestions the user can tap instead of typing.
 */
const SUGGESTIONS = [
  { label: 'Make Wed light', text: 'make wednesday light' },
  { label: 'Make Fri light', text: 'make friday light' },
  { label: 'More reading', text: 'add more reading time' },
  { label: 'Less math', text: 'reduce math' },
  { label: 'Swap Thu/Fri', text: 'swap thursday and friday' },
  { label: 'Cap writing 10m', text: 'cap writing at 10 min' },
] as const

interface QuickSuggestionButtonsProps {
  onSelect: (text: string) => void
  visible: boolean
}

export default function QuickSuggestionButtons({ onSelect, visible }: QuickSuggestionButtonsProps) {
  if (!visible) return null

  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">
        Quick adjustments:
      </Typography>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {SUGGESTIONS.map((s) => (
          <Chip
            key={s.label}
            label={s.label}
            size="small"
            variant="outlined"
            clickable
            onClick={() => onSelect(s.text)}
          />
        ))}
      </Stack>
    </Stack>
  )
}
