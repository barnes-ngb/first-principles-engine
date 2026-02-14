import { useCallback, useMemo } from 'react'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type {
  DayLog,
  MathRoutine,
  ReadingRoutine,
  RoutineItem,
  SpeechRoutine,
} from '../../core/types/domain'
import { RoutineItemKey } from '../../core/types/enums'
import SectionCard from '../../components/SectionCard'
import { ALL_ROUTINE_ITEMS } from './daylog.model'
import { calculateXp, XP_VALUES } from './xp'

interface RoutineSectionProps {
  dayLog: DayLog
  onUpdate: (updated: DayLog) => void
  onUpdateImmediate: (updated: DayLog) => void
  /** Which routine items to show, in priority order. Defaults to all. */
  routineItems?: RoutineItemKey[]
}

export default function RoutineSection({
  dayLog,
  onUpdate,
  onUpdateImmediate,
  routineItems,
}: RoutineSectionProps) {
  const items = useMemo(
    () => new Set(routineItems ?? ALL_ROUTINE_ITEMS),
    [routineItems],
  )
  const reading = useMemo(() => dayLog.reading ?? {
    handwriting: { done: false },
    spelling: { done: false },
    sightWords: { done: false },
    minecraft: { done: false },
    readingEggs: { done: false },
  }, [dayLog.reading])
  const math = useMemo(() => dayLog.math ?? { done: false }, [dayLog.math])
  const speech = useMemo(() => dayLog.speech ?? { done: false }, [dayLog.speech])

  const hasLegacyReading =
    items.has(RoutineItemKey.Handwriting) ||
    items.has(RoutineItemKey.Spelling) ||
    items.has(RoutineItemKey.SightWords) ||
    items.has(RoutineItemKey.MinecraftReading) ||
    items.has(RoutineItemKey.ReadingEggs)
  const hasNewLiteracy =
    items.has(RoutineItemKey.PhonemicAwareness) ||
    items.has(RoutineItemKey.PhonicsLesson) ||
    items.has(RoutineItemKey.DecodableReading) ||
    items.has(RoutineItemKey.SpellingDictation)
  const hasReading = hasLegacyReading || hasNewLiteracy
  const hasMath =
    items.has(RoutineItemKey.Math) ||
    items.has(RoutineItemKey.NumberSenseOrFacts) ||
    items.has(RoutineItemKey.WordProblemsModeled)
  const hasSpeech =
    items.has(RoutineItemKey.Speech) ||
    items.has(RoutineItemKey.NarrationOrSoundReps)

  // Use "Literacy" heading when new engine items are present
  const literacyHeading = hasNewLiteracy ? 'Literacy' : 'Reading & Literacy'

  const xp = calculateXp(dayLog)

  const updateReading = useCallback(
    (field: keyof ReadingRoutine, value: Record<string, unknown>) => {
      const current = reading[field] ?? { done: false }
      const updated: DayLog = {
        ...dayLog,
        reading: {
          ...reading,
          [field]: { ...current, ...value },
        },
      }
      if ('done' in value) {
        onUpdateImmediate(updated)
      } else {
        onUpdate(updated)
      }
    },
    [dayLog, reading, onUpdate, onUpdateImmediate],
  )

  const updateMath = useCallback(
    (value: Partial<MathRoutine>) => {
      const updated: DayLog = {
        ...dayLog,
        math: { ...math, ...value },
      }
      if ('done' in value) {
        onUpdateImmediate(updated)
      } else {
        onUpdate(updated)
      }
    },
    [dayLog, math, onUpdate, onUpdateImmediate],
  )

  const updateMathItem = useCallback(
    (field: 'numberSense' | 'wordProblems', value: Partial<RoutineItem>) => {
      const current = (math as MathRoutine)[field] ?? { done: false }
      const updated: DayLog = {
        ...dayLog,
        math: { ...math, [field]: { ...current, ...value } },
      }
      if ('done' in value) {
        onUpdateImmediate(updated)
      } else {
        onUpdate(updated)
      }
    },
    [dayLog, math, onUpdate, onUpdateImmediate],
  )

  const updateSpeech = useCallback(
    (value: Partial<SpeechRoutine>) => {
      const updated: DayLog = {
        ...dayLog,
        speech: { ...speech, ...value },
      }
      if ('done' in value) {
        onUpdateImmediate(updated)
      } else {
        onUpdate(updated)
      }
    },
    [dayLog, speech, onUpdate, onUpdateImmediate],
  )

  const updateSpeechItem = useCallback(
    (field: 'narrationReps', value: Partial<RoutineItem>) => {
      const current = (speech as SpeechRoutine)[field] ?? { done: false }
      const updated: DayLog = {
        ...dayLog,
        speech: { ...speech, [field]: { ...current, ...value } },
      }
      if ('done' in value) {
        onUpdateImmediate(updated)
      } else {
        onUpdate(updated)
      }
    },
    [dayLog, speech, onUpdate, onUpdateImmediate],
  )

  return (
    <Stack spacing={2}>
      {/* XP Summary — sticky on mobile so it stays visible while scrolling */}
      <Box
        sx={{
          position: { xs: 'sticky', md: 'static' },
          top: { xs: 56, md: 'auto' },
          zIndex: { xs: 10, md: 'auto' },
          bgcolor: 'background.default',
          py: { xs: 1, md: 0 },
          mx: { xs: -2, md: 0 },
          px: { xs: 2, md: 0 },
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Daily Routine</Typography>
          <Chip
            label={`${xp} XP`}
            color={xp > 0 ? 'success' : 'default'}
            variant={xp > 0 ? 'filled' : 'outlined'}
          />
        </Stack>
      </Box>

      {/* Reading / Literacy Routine */}
      {hasReading && (
      <SectionCard title={literacyHeading}>
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
                    updateReading('phonemicAwareness', { done: e.target.checked })
                  }
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Phonemic Awareness (5 min)
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.phonemicAwareness} XP`} variant="outlined" />
                </Stack>
              }
            />
            {reading.phonemicAwareness?.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
                <TextField
                  label="Minutes"
                  type="number"
                  size="small"
                  value={reading.phonemicAwareness.minutes ?? ''}
                  onChange={(e) =>
                    updateReading('phonemicAwareness', {
                      minutes: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Note"
                  size="small"
                  value={reading.phonemicAwareness.note ?? ''}
                  onChange={(e) =>
                    updateReading('phonemicAwareness', { note: e.target.value })
                  }
                  sx={{ flex: 1, minWidth: 120 }}
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
                    updateReading('phonicsLesson', { done: e.target.checked })
                  }
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Phonics Lesson (15-20 min)
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.phonicsLesson} XP`} variant="outlined" />
                </Stack>
              }
            />
            {reading.phonicsLesson?.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
                <TextField
                  label="Minutes"
                  type="number"
                  size="small"
                  value={reading.phonicsLesson.minutes ?? ''}
                  onChange={(e) =>
                    updateReading('phonicsLesson', {
                      minutes: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Note"
                  size="small"
                  value={reading.phonicsLesson.note ?? ''}
                  onChange={(e) =>
                    updateReading('phonicsLesson', { note: e.target.value })
                  }
                  sx={{ flex: 1, minWidth: 120 }}
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
                    updateReading('decodableReading', { done: e.target.checked })
                  }
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Decodable Reading (10 min + reread)
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.decodableReading} XP`} variant="outlined" />
                </Stack>
              }
            />
            {reading.decodableReading?.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }} alignItems="center">
                <TextField
                  label="Minutes"
                  type="number"
                  size="small"
                  value={reading.decodableReading.minutes ?? ''}
                  onChange={(e) =>
                    updateReading('decodableReading', {
                      minutes: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 100 }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={reading.decodableReading.rereadDone ?? false}
                      size="small"
                      onChange={(e) =>
                        updateReading('decodableReading', { rereadDone: e.target.checked })
                      }
                    />
                  }
                  label={<Typography variant="body2">1-min reread</Typography>}
                />
                <TextField
                  label="Note"
                  size="small"
                  value={reading.decodableReading.note ?? ''}
                  onChange={(e) =>
                    updateReading('decodableReading', { note: e.target.value })
                  }
                  sx={{ flex: 1, minWidth: 120 }}
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
                    updateReading('spellingDictation', { done: e.target.checked })
                  }
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Spelling / Dictation (2-3 lines)
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.spellingDictation} XP`} variant="outlined" />
                </Stack>
              }
            />
            {reading.spellingDictation?.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
                <TextField
                  label="Lines"
                  type="number"
                  size="small"
                  value={reading.spellingDictation.lines ?? ''}
                  onChange={(e) =>
                    updateReading('spellingDictation', {
                      lines: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Note"
                  size="small"
                  value={reading.spellingDictation.note ?? ''}
                  onChange={(e) =>
                    updateReading('spellingDictation', { note: e.target.value })
                  }
                  sx={{ flex: 1, minWidth: 120 }}
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
                  checked={reading.handwriting.done}
                  onChange={(e) =>
                    updateReading('handwriting', { done: e.target.checked })
                  }
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Handwriting
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.handwriting} XP`} variant="outlined" />
                </Stack>
              }
            />
            {reading.handwriting.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
                <TextField
                  label="Minutes"
                  type="number"
                  size="small"
                  value={reading.handwriting.minutes ?? ''}
                  onChange={(e) =>
                    updateReading('handwriting', {
                      minutes: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Lines"
                  type="number"
                  size="small"
                  value={reading.handwriting.lines ?? ''}
                  onChange={(e) =>
                    updateReading('handwriting', {
                      lines: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Note"
                  size="small"
                  value={reading.handwriting.note ?? ''}
                  onChange={(e) =>
                    updateReading('handwriting', { note: e.target.value })
                  }
                  sx={{ flex: 1, minWidth: 120 }}
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
                  checked={reading.spelling.done}
                  onChange={(e) =>
                    updateReading('spelling', { done: e.target.checked })
                  }
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Spelling word
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.spelling} XP`} variant="outlined" />
                </Stack>
              }
            />
            {reading.spelling.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
                <TextField
                  label="Word(s) practiced"
                  size="small"
                  value={reading.spelling.words ?? ''}
                  onChange={(e) =>
                    updateReading('spelling', { words: e.target.value })
                  }
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Note"
                  size="small"
                  value={reading.spelling.note ?? ''}
                  onChange={(e) =>
                    updateReading('spelling', { note: e.target.value })
                  }
                  sx={{ flex: 1 }}
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
                  checked={reading.sightWords.done}
                  onChange={(e) =>
                    updateReading('sightWords', { done: e.target.checked })
                  }
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Sight words
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.sightWords} XP`} variant="outlined" />
                </Stack>
              }
            />
            {reading.sightWords.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
                <TextField
                  label="Count"
                  type="number"
                  size="small"
                  value={reading.sightWords.count ?? ''}
                  onChange={(e) =>
                    updateReading('sightWords', {
                      count: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 100 }}
                  placeholder="5 or 10"
                />
                <TextField
                  label="Note"
                  size="small"
                  value={reading.sightWords.note ?? ''}
                  onChange={(e) =>
                    updateReading('sightWords', { note: e.target.value })
                  }
                  sx={{ flex: 1 }}
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
                  checked={reading.minecraft.done}
                  onChange={(e) =>
                    updateReading('minecraft', { done: e.target.checked })
                  }
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Minecraft book reading
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.minecraft} XP`} variant="outlined" />
                </Stack>
              }
            />
            {reading.minecraft.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
                <TextField
                  label="Pages"
                  type="number"
                  size="small"
                  value={reading.minecraft.pages ?? ''}
                  onChange={(e) =>
                    updateReading('minecraft', {
                      pages: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Book points"
                  type="number"
                  size="small"
                  value={reading.minecraft.points ?? ''}
                  onChange={(e) =>
                    updateReading('minecraft', {
                      points: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 120 }}
                />
                <TextField
                  label="Note"
                  size="small"
                  value={reading.minecraft.note ?? ''}
                  onChange={(e) =>
                    updateReading('minecraft', { note: e.target.value })
                  }
                  sx={{ flex: 1, minWidth: 120 }}
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
                  checked={reading.readingEggs.done}
                  onChange={(e) =>
                    updateReading('readingEggs', { done: e.target.checked })
                  }
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Reading Eggs (tablet)
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.readingEggs} XP`} variant="outlined" />
                </Stack>
              }
            />
            {reading.readingEggs.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
                <TextField
                  label="Minutes"
                  type="number"
                  size="small"
                  value={reading.readingEggs.minutes ?? ''}
                  onChange={(e) =>
                    updateReading('readingEggs', {
                      minutes: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Lessons"
                  type="number"
                  size="small"
                  value={reading.readingEggs.lessons ?? ''}
                  onChange={(e) =>
                    updateReading('readingEggs', {
                      lessons: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Note"
                  size="small"
                  value={reading.readingEggs.note ?? ''}
                  onChange={(e) =>
                    updateReading('readingEggs', { note: e.target.value })
                  }
                  sx={{ flex: 1, minWidth: 120 }}
                />
              </Stack>
            )}
          </Stack>
          )}
        </Stack>
      </SectionCard>
      )}

      {/* Math */}
      {hasMath && (
      <SectionCard title="Math">
        <Stack spacing={1.5}>
          {/* Legacy single math toggle */}
          {items.has(RoutineItemKey.Math) && (
          <>
            <FormControlLabel
              control={
                <Checkbox
                  checked={math.done}
                  onChange={(e) => updateMath({ done: e.target.checked })}
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Math completed
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.math} XP`} variant="outlined" />
                </Stack>
              }
            />
            {math.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
                <TextField
                  label="Problems"
                  type="number"
                  size="small"
                  value={math.problems ?? ''}
                  onChange={(e) =>
                    updateMath({
                      problems: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 110 }}
                />
                <TextField
                  label="Pages"
                  type="number"
                  size="small"
                  value={math.pages ?? ''}
                  onChange={(e) =>
                    updateMath({
                      pages: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Note"
                  size="small"
                  value={math.note ?? ''}
                  onChange={(e) => updateMath({ note: e.target.value })}
                  sx={{ flex: 1, minWidth: 120 }}
                />
              </Stack>
            )}
          </>
          )}

          {/* Number Sense / Facts */}
          {items.has(RoutineItemKey.NumberSenseOrFacts) && (
          <Stack spacing={0.5}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={(math as MathRoutine).numberSense?.done ?? false}
                  onChange={(e) =>
                    updateMathItem('numberSense', { done: e.target.checked })
                  }
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Number Sense / Facts (10 min)
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.numberSenseOrFacts} XP`} variant="outlined" />
                </Stack>
              }
            />
            {(math as MathRoutine).numberSense?.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
                <TextField
                  label="Minutes"
                  type="number"
                  size="small"
                  value={(math as MathRoutine).numberSense?.minutes ?? ''}
                  onChange={(e) =>
                    updateMathItem('numberSense', {
                      minutes: e.target.value ? Number(e.target.value) : undefined,
                    } as Partial<RoutineItem>)
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Note"
                  size="small"
                  value={(math as MathRoutine).numberSense?.note ?? ''}
                  onChange={(e) =>
                    updateMathItem('numberSense', { note: e.target.value })
                  }
                  sx={{ flex: 1, minWidth: 120 }}
                />
              </Stack>
            )}
          </Stack>
          )}

          {/* Word Problems (Modeled) */}
          {items.has(RoutineItemKey.WordProblemsModeled) && (
          <Stack spacing={0.5}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={(math as MathRoutine).wordProblems?.done ?? false}
                  onChange={(e) =>
                    updateMathItem('wordProblems', { done: e.target.checked })
                  }
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Word Problems &ndash; Modeled (10-15 min)
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.wordProblemsModeled} XP`} variant="outlined" />
                </Stack>
              }
            />
            {(math as MathRoutine).wordProblems?.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
                <TextField
                  label="Minutes"
                  type="number"
                  size="small"
                  value={(math as MathRoutine).wordProblems?.minutes ?? ''}
                  onChange={(e) =>
                    updateMathItem('wordProblems', {
                      minutes: e.target.value ? Number(e.target.value) : undefined,
                    } as Partial<RoutineItem>)
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Count"
                  type="number"
                  size="small"
                  value={(math as MathRoutine).wordProblems?.count ?? ''}
                  onChange={(e) =>
                    updateMathItem('wordProblems', {
                      count: e.target.value ? Number(e.target.value) : undefined,
                    } as Partial<RoutineItem>)
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Note"
                  size="small"
                  value={(math as MathRoutine).wordProblems?.note ?? ''}
                  onChange={(e) =>
                    updateMathItem('wordProblems', { note: e.target.value })
                  }
                  sx={{ flex: 1, minWidth: 120 }}
                />
              </Stack>
            )}
          </Stack>
          )}
        </Stack>
      </SectionCard>
      )}

      {/* Speech */}
      {hasSpeech && (
      <SectionCard title="Speech">
        <Stack spacing={1.5}>
          {/* Legacy speech toggle */}
          {items.has(RoutineItemKey.Speech) && (
          <>
            <FormControlLabel
              control={
                <Checkbox
                  checked={speech.done}
                  onChange={(e) => updateSpeech({ done: e.target.checked })}
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
                onChange={(e) => updateSpeech({ note: e.target.value })}
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
                  checked={(speech as SpeechRoutine).narrationReps?.done ?? false}
                  onChange={(e) =>
                    updateSpeechItem('narrationReps', { done: e.target.checked })
                  }
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>
                    Narration / Sound Reps (1-3 min)
                  </Typography>
                  <Chip size="small" label={`+${XP_VALUES.narrationOrSoundReps} XP`} variant="outlined" />
                </Stack>
              }
            />
            {(speech as SpeechRoutine).narrationReps?.done && (
              <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
                <TextField
                  label="Minutes"
                  type="number"
                  size="small"
                  value={(speech as SpeechRoutine).narrationReps?.minutes ?? ''}
                  onChange={(e) =>
                    updateSpeechItem('narrationReps', {
                      minutes: e.target.value ? Number(e.target.value) : undefined,
                    } as Partial<RoutineItem>)
                  }
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Note"
                  size="small"
                  value={(speech as SpeechRoutine).narrationReps?.note ?? ''}
                  onChange={(e) =>
                    updateSpeechItem('narrationReps', { note: e.target.value })
                  }
                  sx={{ flex: 1, minWidth: 120 }}
                />
              </Stack>
            )}
          </Stack>
          )}
        </Stack>
      </SectionCard>
      )}
    </Stack>
  )
}
