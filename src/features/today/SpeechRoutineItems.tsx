import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { RoutineItem, SpeechRoutine } from '../../core/types/domain'
import { RoutineItemKey } from '../../core/types/enums'
import SectionCard from '../../components/SectionCard'
import type { XP_VALUES as XpValuesType } from './xp'

interface SpeechRoutineItemsProps {
  speech: SpeechRoutine
  items: Set<string>
  xpValues: typeof XpValuesType
  onUpdateSpeech: (value: Partial<SpeechRoutine>) => void
  onUpdateSpeechItem: (field: 'narrationReps', value: Partial<RoutineItem>) => void
}

export default function SpeechRoutineItems({
  speech,
  items,
  xpValues,
  onUpdateSpeech,
  onUpdateSpeechItem,
}: SpeechRoutineItemsProps) {
  return (
    <SectionCard title="Speech">
      <Stack spacing={1.5}>
        {/* Legacy speech toggle */}
        {items.has(RoutineItemKey.Speech) && (
        <>
          <FormControlLabel
            control={
              <Checkbox
                checked={speech.done}
                onChange={(e) => onUpdateSpeech({ done: e.target.checked })}
              />
            }
            label={
              <Typography variant="body2" fontWeight={600}>
                Sentence routine (2-5 min)
              </Typography>
            }
          />
          {speech.done && (
            <TextField
              label="Notes"
              size="small"
              multiline
              minRows={2}
              value={speech.note ?? ''}
              onChange={(e) => onUpdateSpeech({ note: e.target.value })}
              sx={{ pl: 4 }}
            />
          )}
        </>
        )}

        {/* Narration / Sound Reps */}
        {items.has(RoutineItemKey.NarrationOrSoundReps) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={speech.narrationReps?.done ?? false}
                onChange={(e) =>
                  onUpdateSpeechItem('narrationReps', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Narration / Sound Reps (1-3 min)
                </Typography>
                <Chip size="small" label={`+${xpValues.narrationOrSoundReps} XP`} variant="outlined" />
              </Stack>
            }
          />
          {speech.narrationReps?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Minutes"
                type="number"
                size="small"
                fullWidth
                value={speech.narrationReps?.minutes ?? ''}
                onChange={(e) =>
                  onUpdateSpeechItem('narrationReps', {
                    minutes: e.target.value ? Number(e.target.value) : undefined,
                  } as Partial<RoutineItem>)
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={speech.narrationReps?.note ?? ''}
                onChange={(e) =>
                  onUpdateSpeechItem('narrationReps', { note: e.target.value })
                }
              />
            </Stack>
          )}
        </Stack>
        )}
      </Stack>
    </SectionCard>
  )
}
