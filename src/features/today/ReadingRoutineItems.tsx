import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { ReadingRoutine } from '../../core/types/domain'
import { RoutineItemKey } from '../../core/types/enums'
import SectionCard from '../../components/SectionCard'
import type { XP_VALUES as XpValuesType } from './xp'

interface ReadingRoutineItemsProps {
  reading: ReadingRoutine
  items: Set<string>
  title: string
  xpValues: typeof XpValuesType
  onUpdateReading: (field: keyof ReadingRoutine, value: Record<string, unknown>) => void
}

export default function ReadingRoutineItems({
  reading,
  items,
  title,
  xpValues,
  onUpdateReading,
}: ReadingRoutineItemsProps) {
  return (
    <SectionCard title={title}>
      <Stack spacing={1.5}>
        {/* --- New Lincoln Literacy Engine items --- */}

        {/* Phonemic Awareness */}
        {items.has(RoutineItemKey.PhonemicAwareness) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={reading.phonemicAwareness?.done ?? false}
                onChange={(e) =>
                  onUpdateReading('phonemicAwareness', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Phonemic Awareness (5 min)
                </Typography>
                <Chip size="small" label={`+${xpValues.phonemicAwareness} XP`} variant="outlined" />
              </Stack>
            }
          />
          {reading.phonemicAwareness?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Minutes"
                type="number"
                size="small"
                fullWidth
                value={reading.phonemicAwareness.minutes ?? ''}
                onChange={(e) =>
                  onUpdateReading('phonemicAwareness', {
                    minutes: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={reading.phonemicAwareness.note ?? ''}
                onChange={(e) =>
                  onUpdateReading('phonemicAwareness', { note: e.target.value })
                }
              />
            </Stack>
          )}
        </Stack>
        )}

        {/* Phonics Lesson */}
        {items.has(RoutineItemKey.PhonicsLesson) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={reading.phonicsLesson?.done ?? false}
                onChange={(e) =>
                  onUpdateReading('phonicsLesson', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Phonics Lesson (15-20 min)
                </Typography>
                <Chip size="small" label={`+${xpValues.phonicsLesson} XP`} variant="outlined" />
              </Stack>
            }
          />
          {reading.phonicsLesson?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Minutes"
                type="number"
                size="small"
                fullWidth
                value={reading.phonicsLesson.minutes ?? ''}
                onChange={(e) =>
                  onUpdateReading('phonicsLesson', {
                    minutes: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={reading.phonicsLesson.note ?? ''}
                onChange={(e) =>
                  onUpdateReading('phonicsLesson', { note: e.target.value })
                }
              />
            </Stack>
          )}
        </Stack>
        )}

        {/* Decodable Reading */}
        {items.has(RoutineItemKey.DecodableReading) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={reading.decodableReading?.done ?? false}
                onChange={(e) =>
                  onUpdateReading('decodableReading', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Decodable Reading (10 min + reread)
                </Typography>
                <Chip size="small" label={`+${xpValues.decodableReading} XP`} variant="outlined" />
              </Stack>
            }
          />
          {reading.decodableReading?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }} alignItems={{ sm: 'center' }}>
              <TextField
                label="Minutes"
                type="number"
                size="small"
                fullWidth
                value={reading.decodableReading.minutes ?? ''}
                onChange={(e) =>
                  onUpdateReading('decodableReading', {
                    minutes: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={reading.decodableReading.rereadDone ?? false}
                    size="small"
                    onChange={(e) =>
                      onUpdateReading('decodableReading', { rereadDone: e.target.checked })
                    }
                  />
                }
                label={<Typography variant="body2">1-min reread</Typography>}
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={reading.decodableReading.note ?? ''}
                onChange={(e) =>
                  onUpdateReading('decodableReading', { note: e.target.value })
                }
              />
            </Stack>
          )}
        </Stack>
        )}

        {/* Spelling / Dictation */}
        {items.has(RoutineItemKey.SpellingDictation) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={reading.spellingDictation?.done ?? false}
                onChange={(e) =>
                  onUpdateReading('spellingDictation', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Spelling / Dictation (2-3 lines)
                </Typography>
                <Chip size="small" label={`+${xpValues.spellingDictation} XP`} variant="outlined" />
              </Stack>
            }
          />
          {reading.spellingDictation?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Lines"
                type="number"
                size="small"
                fullWidth
                value={reading.spellingDictation.lines ?? ''}
                onChange={(e) =>
                  onUpdateReading('spellingDictation', {
                    lines: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={reading.spellingDictation.note ?? ''}
                onChange={(e) =>
                  onUpdateReading('spellingDictation', { note: e.target.value })
                }
              />
            </Stack>
          )}
        </Stack>
        )}

        {/* Read Aloud */}
        {items.has(RoutineItemKey.ReadAloud) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={reading.readAloud?.done ?? false}
                onChange={(e) =>
                  onUpdateReading('readAloud', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Read Aloud (10 min)
                </Typography>
                <Chip size="small" label={`+${xpValues.readAloud} XP`} variant="outlined" />
              </Stack>
            }
          />
          {reading.readAloud?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Minutes"
                type="number"
                size="small"
                fullWidth
                value={reading.readAloud.minutes ?? ''}
                onChange={(e) =>
                  onUpdateReading('readAloud', {
                    minutes: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={reading.readAloud.note ?? ''}
                onChange={(e) =>
                  onUpdateReading('readAloud', { note: e.target.value })
                }
              />
            </Stack>
          )}
        </Stack>
        )}

        {/* --- Legacy reading items --- */}

        {/* Handwriting */}
        {items.has(RoutineItemKey.Handwriting) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={reading.handwriting?.done ?? false}
                onChange={(e) =>
                  onUpdateReading('handwriting', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Handwriting
                </Typography>
                <Chip size="small" label={`+${xpValues.handwriting} XP`} variant="outlined" />
              </Stack>
            }
          />
          {reading.handwriting?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Minutes"
                type="number"
                size="small"
                fullWidth
                value={reading.handwriting.minutes ?? ''}
                onChange={(e) =>
                  onUpdateReading('handwriting', {
                    minutes: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Lines"
                type="number"
                size="small"
                fullWidth
                value={reading.handwriting.lines ?? ''}
                onChange={(e) =>
                  onUpdateReading('handwriting', {
                    lines: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={reading.handwriting.note ?? ''}
                onChange={(e) =>
                  onUpdateReading('handwriting', { note: e.target.value })
                }
              />
            </Stack>
          )}
        </Stack>
        )}

        {/* Spelling */}
        {items.has(RoutineItemKey.Spelling) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={reading.spelling?.done ?? false}
                onChange={(e) =>
                  onUpdateReading('spelling', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Spelling word
                </Typography>
                <Chip size="small" label={`+${xpValues.spelling} XP`} variant="outlined" />
              </Stack>
            }
          />
          {reading.spelling?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Word(s) practiced"
                size="small"
                fullWidth
                value={reading.spelling.words ?? ''}
                onChange={(e) =>
                  onUpdateReading('spelling', { words: e.target.value })
                }
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={reading.spelling.note ?? ''}
                onChange={(e) =>
                  onUpdateReading('spelling', { note: e.target.value })
                }
              />
            </Stack>
          )}
        </Stack>
        )}

        {/* Sight Words */}
        {items.has(RoutineItemKey.SightWords) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={reading.sightWords?.done ?? false}
                onChange={(e) =>
                  onUpdateReading('sightWords', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Sight words
                </Typography>
                <Chip size="small" label={`+${xpValues.sightWords} XP`} variant="outlined" />
              </Stack>
            }
          />
          {reading.sightWords?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Count"
                type="number"
                size="small"
                fullWidth
                value={reading.sightWords.count ?? ''}
                onChange={(e) =>
                  onUpdateReading('sightWords', {
                    count: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 100 } }}
                placeholder="5 or 10"
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={reading.sightWords.note ?? ''}
                onChange={(e) =>
                  onUpdateReading('sightWords', { note: e.target.value })
                }
              />
            </Stack>
          )}
        </Stack>
        )}

        {/* Minecraft Reading */}
        {items.has(RoutineItemKey.MinecraftReading) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={reading.minecraft?.done ?? false}
                onChange={(e) =>
                  onUpdateReading('minecraft', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Minecraft book reading
                </Typography>
                <Chip size="small" label={`+${xpValues.minecraft} XP`} variant="outlined" />
              </Stack>
            }
          />
          {reading.minecraft?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Pages"
                type="number"
                size="small"
                fullWidth
                value={reading.minecraft.pages ?? ''}
                onChange={(e) =>
                  onUpdateReading('minecraft', {
                    pages: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Book points"
                type="number"
                size="small"
                fullWidth
                value={reading.minecraft.points ?? ''}
                onChange={(e) =>
                  onUpdateReading('minecraft', {
                    points: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 120 } }}
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={reading.minecraft.note ?? ''}
                onChange={(e) =>
                  onUpdateReading('minecraft', { note: e.target.value })
                }
              />
            </Stack>
          )}
        </Stack>
        )}

        {/* Reading Eggs */}
        {items.has(RoutineItemKey.ReadingEggs) && (
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={reading.readingEggs?.done ?? false}
                onChange={(e) =>
                  onUpdateReading('readingEggs', { done: e.target.checked })
                }
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600}>
                  Reading Eggs (tablet)
                </Typography>
                <Chip size="small" label={`+${xpValues.readingEggs} XP`} variant="outlined" />
              </Stack>
            }
          />
          {reading.readingEggs?.done && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pl: 4 }}>
              <TextField
                label="Minutes"
                type="number"
                size="small"
                fullWidth
                value={reading.readingEggs.minutes ?? ''}
                onChange={(e) =>
                  onUpdateReading('readingEggs', {
                    minutes: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Lessons"
                type="number"
                size="small"
                fullWidth
                value={reading.readingEggs.lessons ?? ''}
                onChange={(e) =>
                  onUpdateReading('readingEggs', {
                    lessons: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                sx={{ maxWidth: { sm: 100 } }}
              />
              <TextField
                label="Note"
                size="small"
                fullWidth
                value={reading.readingEggs.note ?? ''}
                onChange={(e) =>
                  onUpdateReading('readingEggs', { note: e.target.value })
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
