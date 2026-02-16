import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { DayTypeConfig } from '../../core/types/domain'
import { DayType } from '../../core/types/enums'
import { WEEK_DAYS } from './chatPlanner.logic'

interface LightDayToggleProps {
  dayTypes: DayTypeConfig[]
  onChange: (dayTypes: DayTypeConfig[]) => void
}

const dayTypeLabel: Record<DayType, string> = {
  [DayType.Normal]: 'Full',
  [DayType.Light]: 'Light',
  [DayType.Appointment]: 'Appt',
}

const dayTypeColor: Record<DayType, 'success' | 'warning' | 'error'> = {
  [DayType.Normal]: 'success',
  [DayType.Light]: 'warning',
  [DayType.Appointment]: 'error',
}

export default function LightDayToggle({ dayTypes, onChange }: LightDayToggleProps) {
  const handleToggle = (day: string) => {
    const updated = dayTypes.map((dt) => {
      if (dt.day !== day) return dt
      // Cycle: normal -> light -> appointment -> normal
      const nextType =
        dt.dayType === DayType.Normal
          ? DayType.Light
          : dt.dayType === DayType.Light
            ? DayType.Appointment
            : DayType.Normal
      return { ...dt, dayType: nextType }
    })
    onChange(updated)
  }

  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">
        Day types (tap to toggle):
      </Typography>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {WEEK_DAYS.map((day) => {
          const config = dayTypes.find((dt) => dt.day === day)
          const dayType = config?.dayType ?? DayType.Normal

          return (
            <Chip
              key={day}
              label={`${day.slice(0, 3)}: ${dayTypeLabel[dayType]}`}
              size="small"
              color={dayTypeColor[dayType]}
              variant={dayType === DayType.Normal ? 'outlined' : 'filled'}
              onClick={() => handleToggle(day)}
              sx={{ cursor: 'pointer', minWidth: 80 }}
            />
          )
        })}
      </Stack>
    </Stack>
  )
}
