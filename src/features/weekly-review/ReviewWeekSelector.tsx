import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import type { ReviewWeekChoice, ReviewWeekOption } from './reviewWeekSelection'

export const REVIEW_WEEK_SELECTOR_PROMPT = 'Which week are you looking at?'

interface ReviewWeekSelectorProps {
  options: ReviewWeekOption[]
  value: ReviewWeekChoice
  onChange: (choice: ReviewWeekChoice) => void
}

/**
 * "Which week are you looking at?" — Last week / This week, each carrying the
 * real Mon–Fri days it reads (UX-406).
 *
 * Presentational only, and deliberately the same shape as the planner's
 * `PlanningWeekSelector`: every date, label and note is computed by the pure
 * `reviewWeekSelection.ts`, so what this renders and what the page reads come
 * from one place. It cannot resolve a week itself, which is the whole point — a
 * selector that did its own date math would be a second definition of "this
 * week" sitting next to the one the read uses.
 *
 * **Nothing is ever disabled here**, which is the one way it differs from its
 * neighbour and is not an oversight: the planner greys out a week it would
 * refuse to write to, and reading a week writes nothing. A week still in
 * progress is offered with its own note instead, because a parent standing in
 * the middle of a week wanting to see what is in it so far is the report this
 * control exists for.
 */
export default function ReviewWeekSelector({
  options,
  value,
  onChange,
}: ReviewWeekSelectorProps) {
  return (
    <Box data-testid="review-week-selector">
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {REVIEW_WEEK_SELECTOR_PROMPT}
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value}
        onChange={(_e, next: ReviewWeekChoice | null) => {
          // MUI hands back `null` when the active button is re-tapped. A week is
          // never "none", so a deselect is ignored rather than clearing the read.
          if (next) onChange(next)
        }}
        sx={{ width: '100%', display: 'flex' }}
      >
        {options.map((option) => (
          <ToggleButton
            key={option.choice}
            value={option.choice}
            sx={{ flex: 1, textTransform: 'none', py: 0.75, flexDirection: 'column', gap: 0.25 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              {option.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
              {option.note ? `${option.dates} · ${option.note}` : option.dates}
            </Typography>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  )
}
