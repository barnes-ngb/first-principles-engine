// ── "How's today going?" — the energy toggle and the day-type control (UX-182) ─
//
// FEAT-200 put the day-type control in the slot the plan-type chip already
// occupied: the right-hand end of a single non-wrapping row that also carried a
// label, a three-button `ToggleButtonGroup` and a `SaveIndicator`. The row was
// already full before the control was added to it. On the owner's ~390px phone
// the chip was cut in half at the right edge and the save indicator was off the
// screen entirely — so the whole of FEAT-200 had no reachable entry point on the
// only device the primary user uses. The unit tests passed; the phone did not.
//
// ── Why a restructure rather than `flexWrap: 'wrap'` ────────────────────────
//
// Adding wrap to the old row makes nothing overflow, but it leaves four items of
// very different weights breaking at whatever point the width happens to give:
// a sentence, a segmented control, a chip, and a transient status pill. What a
// parent actually has here is TWO questions — *how is your energy* and *what
// kind of day is this* — that were sharing one line because there used to be
// only one of them. So they get a line each, both full width, in the same
// section and the same order. Nothing moved out of the section (FEAT-200's
// placement was right; the pixels were not), and the control still says
// `Normal Day` / `Minimum Viable Day` / `Life Day` in words — a parent can read
// what kind of day this is without tapping anything.
//
// The one piece of new visible copy is the "Kind of day" caption, which is not
// new vocabulary: it is the chip's existing accessible name (`Kind of day:
// {label}. Change it.`) made visible, now that the chip stands on its own line
// instead of leaning on the row it sat in.
//
// Extracted from `TodayPage` because a row nobody could render is a row nobody
// could test. This component reads no Firestore, holds only the menu anchor, and
// writes nothing — every change is handed up. `DayStatusRow.test.tsx` renders it
// at a phone width and asserts the wrap, which is only possible because it is
// separable from the page's fifty subscriptions.

import { useState } from 'react'
import Chip from '@mui/material/Chip'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'

import SectionCard from '../../components/SectionCard'
import SaveIndicator, { type SaveState } from '../../components/SaveIndicator'
import { EnergyLevel, EnergyLevelLabel, PlanType, PlanTypeLabel } from '../../core/types/enums'
import { DAY_TYPE_CHOICES } from './dayTypeChoices'

interface DayStatusRowProps {
  energy: EnergyLevel
  onEnergyChange: (level: EnergyLevel) => void
  planType: PlanType
  /** Parent-only by capability. A kid never reaches here — `KidTodayView` returns first. */
  canEditDayType: boolean
  onDayTypeChange: (planType: PlanType) => void
  saveState: SaveState
}

function dayTypeColor(planType: PlanType): 'success' | 'default' | 'info' {
  if (planType === PlanType.Normal) return 'success'
  if (planType === PlanType.Life) return 'default'
  return 'info'
}

export default function DayStatusRow({
  energy,
  onEnergyChange,
  planType,
  canEditDayType,
  onDayTypeChange,
  saveState,
}: DayStatusRowProps) {
  const [dayTypeAnchor, setDayTypeAnchor] = useState<HTMLElement | null>(null)

  const openMenu = canEditDayType
    ? (e: React.MouseEvent<HTMLElement>) => setDayTypeAnchor(e.currentTarget)
    : undefined

  return (
    <SectionCard title="How's today going?">
      <Stack spacing={1.5}>
        {/* Question 1 — energy. The save indicator rides with the heading rather
            than the controls: it is status, not a thing to tap, and it is the
            item that was pushed off-screen when it competed with them. */}
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          sx={{ flexWrap: 'wrap', rowGap: 0.5 }}
        >
          <Typography color="text.secondary" variant="body2">
            How&apos;s your energy today?
          </Typography>
          <SaveIndicator state={saveState} />
        </Stack>
        <ToggleButtonGroup
          value={energy}
          exclusive
          size="small"
          fullWidth
          onChange={(_e, value) => { if (value) onEnergyChange(value as EnergyLevel) }}
        >
          {Object.values(EnergyLevel).map((level) => (
            <ToggleButton key={level} value={level}>
              {EnergyLevelLabel[level]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Question 2 — FEAT-200's day-type control. Same section, same order,
            now on a line it does not have to share. It wraps as well as sits on
            its own line, so it stays whole down to 320px. */}
        <Stack
          data-testid="day-type-row"
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ flexWrap: 'wrap', rowGap: 0.5 }}
        >
          <Typography color="text.secondary" variant="body2">
            Kind of day
          </Typography>
          <Chip
            size="small"
            label={PlanTypeLabel[planType]}
            color={dayTypeColor(planType)}
            variant="outlined"
            onClick={openMenu}
            deleteIcon={canEditDayType ? <ArrowDropDownIcon /> : undefined}
            onDelete={openMenu}
            aria-label={
              canEditDayType
                ? `Kind of day: ${PlanTypeLabel[planType]}. Change it.`
                : undefined
            }
          />
          <Menu
            anchorEl={dayTypeAnchor}
            open={Boolean(dayTypeAnchor)}
            onClose={() => setDayTypeAnchor(null)}
          >
            {DAY_TYPE_CHOICES.map((choice) => (
              <MenuItem
                key={choice.value}
                selected={planType === choice.value}
                onClick={() => {
                  onDayTypeChange(choice.value)
                  setDayTypeAnchor(null)
                }}
                sx={{ display: 'block', maxWidth: 320, whiteSpace: 'normal' }}
              >
                <Typography variant="body2">{PlanTypeLabel[choice.value]}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {choice.description}
                </Typography>
              </MenuItem>
            ))}
          </Menu>
        </Stack>
      </Stack>
    </SectionCard>
  )
}
