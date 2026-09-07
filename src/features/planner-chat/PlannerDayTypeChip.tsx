// ── The per-day Full / Light / Life control (UX-261) ─────────────────────────
//
// Deliberately the FEAT-200 shape — a small chip that says what the day is in
// words, with a menu whose every choice carries one line explaining it — and
// deliberately NOT the cycling button the retired `LightDayToggle` used. A bare
// chip that changes each time you tap it tells a parent nothing about what the
// third state does, and "Appt" was a state with no consumer anywhere in the app.
//
// It renders nothing when `onChange` is absent. That is how the caller gates it:
// `/planner/chat` sits outside `RequireParent`, so a kid profile can reach the
// page by URL, and the page withholds the handler. The write itself is guarded
// separately in `PlannerChatPage` — the FEAT-133 lesson that a gate stated only
// at the component is one call site away from being absent.
//
// Presentational: no Firestore, no state but the menu anchor, nothing computed.

import { useState } from 'react'
import Chip from '@mui/material/Chip'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'

import { DayType } from '../../core/types/enums'
import { PLANNER_DAY_TYPE_CHOICES, plannerDayTypeLabel } from './plannerDayTypes'

interface PlannerDayTypeChipProps {
  /** The weekday this chip belongs to — used for the accessible name. */
  day: string
  dayType: DayType
  /**
   * Set this day's type. **Absent renders nothing** — see the header: this is
   * the capability gate's visible half.
   */
  onChange?: (dayType: DayType) => void
}

function chipColor(dayType: DayType): 'default' | 'info' {
  return dayType === DayType.Normal ? 'default' : 'info'
}

export default function PlannerDayTypeChip({
  day,
  dayType,
  onChange,
}: PlannerDayTypeChipProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  if (!onChange) return null

  const open = (e: React.MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)

  return (
    <>
      <Chip
        size="small"
        label={plannerDayTypeLabel(dayType)}
        color={chipColor(dayType)}
        variant={dayType === DayType.Normal ? 'outlined' : 'filled'}
        onClick={open}
        deleteIcon={<ArrowDropDownIcon />}
        onDelete={open}
        aria-label={`${day}: ${plannerDayTypeLabel(dayType)}. Change what kind of day this is.`}
      />
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {PLANNER_DAY_TYPE_CHOICES.map((choice) => (
          <MenuItem
            key={choice.value}
            selected={dayType === choice.value}
            onClick={() => {
              onChange(choice.value)
              setAnchor(null)
            }}
            sx={{ display: 'block', maxWidth: 320, whiteSpace: 'normal' }}
          >
            <Typography variant="body2">{choice.label}</Typography>
            <Typography variant="caption" color="text.secondary">
              {choice.description}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
