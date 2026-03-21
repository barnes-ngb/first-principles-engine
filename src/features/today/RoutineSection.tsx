import { useCallback, useMemo } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type {
  DayLog,
  MathRoutine,
  ReadingRoutine,
  RoutineItem,
  SpeechRoutine,
} from '../../core/types'
import { RoutineItemKey } from '../../core/types/enums'
import { ALL_ROUTINE_ITEMS } from './daylog.model'
import { calculateXp, XP_VALUES } from './xp'
import ReadingRoutineItems from './ReadingRoutineItems'
import MathRoutineItems from './MathRoutineItems'
import SpeechRoutineItems from './SpeechRoutineItems'

interface RoutineSectionProps {
  dayLog: DayLog
  onUpdate: (updated: DayLog) => void
  onUpdateImmediate: (updated: DayLog) => void
  /** Which routine items to show, in priority order. Defaults to all. */
  routineItems?: RoutineItemKey[]
  /** Child name — used for themed UI (e.g. Minecraft for Lincoln) */
  childName?: string
}

export default function RoutineSection({
  dayLog,
  onUpdate,
  onUpdateImmediate,
  routineItems,
  childName,
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
    items.has(RoutineItemKey.ReadingEggs) ||
    items.has(RoutineItemKey.ReadAloud)
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

  const isLincoln = childName?.toLowerCase() === 'lincoln'
  const xp = calculateXp(dayLog, routineItems)

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
          <Typography variant="h6">{isLincoln ? '⛏️ Daily Crafting' : 'Daily Routine'}</Typography>
          <Chip
            label={`${xp} XP`}
            color={xp > 0 ? 'success' : 'default'}
            variant={xp > 0 ? 'filled' : 'outlined'}
            sx={isLincoln ? {
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '0.5rem',
              bgcolor: xp > 0 ? '#1A1A1A' : undefined,
              color: xp > 0 ? '#7EFC20' : undefined,
              border: xp > 0 ? '2px solid #3A3A3A' : undefined,
              borderRadius: 0,
              '& .MuiChip-label': { px: 1.5 },
            } : {}}
          />
        </Stack>
      </Box>

      {/* Reading / Literacy Routine */}
      {hasReading && (
        <ReadingRoutineItems
          reading={reading}
          items={items}
          title={literacyHeading}
          xpValues={XP_VALUES}
          onUpdateReading={updateReading}
        />
      )}

      {/* Math */}
      {hasMath && (
        <MathRoutineItems
          math={math as MathRoutine}
          items={items}
          xpValues={XP_VALUES}
          onUpdateMath={updateMath}
          onUpdateMathItem={updateMathItem}
        />
      )}

      {/* Speech */}
      {hasSpeech && (
        <SpeechRoutineItems
          speech={speech as SpeechRoutine}
          items={items}
          xpValues={XP_VALUES}
          onUpdateSpeech={updateSpeech}
          onUpdateSpeechItem={updateSpeechItem}
        />
      )}
    </Stack>
  )
}
