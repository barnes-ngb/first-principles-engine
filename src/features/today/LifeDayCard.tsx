import { useState } from 'react'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import type { DayLog } from '../../core/types'
import {
  LIFE_DAY_CHIPS,
  LIFE_DAY_COPY,
  LIFE_DAY_MINUTE_CHOICES,
  lifeDayMinutes,
  lifeDayMinutesLabel,
  recordedLifeDayChipIds,
  toggleLifeDayChip,
  withLifeDayMinutes,
  withLifeDayNote,
} from './lifeDay'

/**
 * The Life Day capture surface (FEAT-200) — what Today shows in place of the
 * checklist when the day is a Life Day.
 *
 * **Nothing here can read as unfinished.** No progress bar, no "3 of 6", no
 * percentage, no red, no required field. That is the whole point of the type:
 * these are the days when a list would be a reproach. The chips are a record of
 * what happened, so an untapped chip means "this didn't happen today", never
 * "you missed this".
 *
 * All state lives on the day log; this component only renders it and hands the
 * pure transforms in `lifeDay.ts` back to the page's own persist function, which
 * is the same guarded manual-edit lane every other Today control uses. The note
 * field keeps a local draft so typing isn't a write per keystroke — it commits
 * on blur, and the caller keys this component by child+date so the draft resets
 * with the day rather than following the parent onto another child's record.
 */
interface LifeDayCardProps {
  dayLog: DayLog
  persistDayLogImmediate: (updated: DayLog) => void
  /** False while the day is read-only (a past day the parent may not edit). */
  canEdit?: boolean
}

export default function LifeDayCard({
  dayLog,
  persistDayLogImmediate,
  canEdit = true,
}: LifeDayCardProps) {
  const minutes = lifeDayMinutes(dayLog)
  const recorded = recordedLifeDayChipIds(dayLog)

  const [noteDraft, setNoteDraft] = useState(dayLog.retro ?? '')

  return (
    <SectionCard title="🌿 Life Day">
      <Stack spacing={2.5} sx={{ py: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {LIFE_DAY_COPY.description}
        </Typography>

        {/* Time — one tap. Defaults to the honest floor; the parent raises it. */}
        <Stack spacing={1}>
          <Typography variant="subtitle2">{LIFE_DAY_COPY.timeHeading}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {LIFE_DAY_MINUTE_CHOICES.map((choice) => (
              <Chip
                key={choice}
                label={lifeDayMinutesLabel(choice)}
                disabled={!canEdit}
                onClick={
                  canEdit
                    ? () => persistDayLogImmediate(withLifeDayMinutes(dayLog, choice))
                    : undefined
                }
                color={minutes === choice ? 'primary' : 'default'}
                variant={minutes === choice ? 'filled' : 'outlined'}
                sx={{ fontSize: '0.95rem', py: 2.5 }}
              />
            ))}
          </Stack>
        </Stack>

        {/* What happened — a record, not a list to finish. */}
        <Stack spacing={1}>
          <Typography variant="subtitle2">{LIFE_DAY_COPY.chipsHeading}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {LIFE_DAY_CHIPS.map((chip) => (
              <Chip
                key={chip.id}
                label={chip.label}
                disabled={!canEdit}
                onClick={
                  canEdit
                    ? () => persistDayLogImmediate(toggleLifeDayChip(dayLog, chip))
                    : undefined
                }
                color={recorded.has(chip.id) ? 'success' : 'default'}
                variant={recorded.has(chip.id) ? 'filled' : 'outlined'}
                sx={{ fontSize: '0.95rem', py: 2.5 }}
              />
            ))}
          </Stack>
        </Stack>

        {/* One optional line. Never required. */}
        <TextField
          label={LIFE_DAY_COPY.noteLabel}
          placeholder={LIFE_DAY_COPY.notePlaceholder}
          value={noteDraft}
          disabled={!canEdit}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => {
            if (noteDraft.trim() === (dayLog.retro ?? '').trim()) return
            persistDayLogImmediate(withLifeDayNote(dayLog, noteDraft))
          }}
          multiline
          minRows={2}
          fullWidth
          size="small"
        />
      </Stack>
    </SectionCard>
  )
}
