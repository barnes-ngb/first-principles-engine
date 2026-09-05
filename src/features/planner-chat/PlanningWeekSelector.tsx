import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import type { PlanningWeekChoice, PlanningWeekOption } from './planningWeekSelection'

interface PlanningWeekSelectorProps {
  options: PlanningWeekOption[]
  value: PlanningWeekChoice
  onChange: (choice: PlanningWeekChoice) => void
  /** Locked once a plan is applied — the week is written; switching is a new plan. */
  disabled?: boolean
}

/**
 * "Which week am I planning?" — This week / Next week, each carrying the real
 * Mon–Fri dates it writes to (FEAT-196).
 *
 * Presentational only: every date, label and disabled state is computed by the
 * pure `planningWeekSelection.ts`, so what this renders and what Apply writes
 * come from one place. It cannot resolve a week itself, which is the whole point
 * — a selector that did its own date math would be a second definition of "next
 * week" sitting next to the one the write uses.
 *
 * A passed week (Saturday's "this week") renders greyed with its reason rather
 * than vanishing: hiding it would leave a one-button toggle answering a question
 * the parent can plainly see is a question.
 */
export default function PlanningWeekSelector({
  options,
  value,
  onChange,
  disabled = false,
}: PlanningWeekSelectorProps) {
  return (
    <Box data-testid="planning-week-selector">
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Which week are you planning?
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value}
        onChange={(_e, next: PlanningWeekChoice | null) => {
          // MUI hands back `null` when the active button is re-tapped. A week is
          // never "none", so a deselect is ignored rather than clearing the target.
          if (next) onChange(next)
        }}
        sx={{ width: '100%', display: 'flex' }}
      >
        {options.map((option) => (
          <ToggleButton
            key={option.choice}
            value={option.choice}
            disabled={disabled || option.disabled}
            sx={{ flex: 1, textTransform: 'none', py: 0.75, flexDirection: 'column', gap: 0.25 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              {option.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
              {option.disabledReason
                ? `${option.dates} · ${option.disabledReason.toLowerCase()}`
                : option.dates}
            </Typography>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  )
}
