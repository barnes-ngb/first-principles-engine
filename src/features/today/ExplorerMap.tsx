import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getDocs, query, where } from 'firebase/firestore'

import SectionCard from '../../components/SectionCard'
import { daysCollection } from '../../core/firebase/firestore'
import type { DayLog } from '../../core/types/domain'

interface ExplorerMapProps {
  familyId: string
  childId: string
  weekStart: string // Monday date YYYY-MM-DD
  todayDate: string
  childName?: string
}

const TRAIL_SETS = [
  ['🏕️', '🌲', '⛰️', '🌊', '🏔️'], // Forest trail
  ['🚀', '🌙', '⭐', '☄️', '🪐'], // Space mission
  ['🏝️', '🐚', '🦈', '🌋', '💎'], // Island adventure
  ['🏰', '🐉', '⚔️', '🗝️', '👑'], // Castle quest
]

const MC_TRAIL_SETS = [
  ['⛏️', '🪨', '🔥', '💎', '🏆'], // Mining expedition
  ['🌲', '🐺', '🗡️', '🛡️', '🏠'], // Forest survival
  ['🌊', '🐙', '🧭', '🗺️', '⚓'], // Ocean monument
  ['🏜️', '🌵', '🏛️', '💀', '👑'], // Desert temple
]

const GARDEN_SET = ['🌱', '🌿', '🌸', '🌺', '🌻']

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function getWeekDates(weekStart: string): string[] {
  const start = new Date(weekStart + 'T00:00:00')
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
}

export default function ExplorerMap({
  familyId,
  childId,
  weekStart,
  todayDate,
  childName,
}: ExplorerMapProps) {
  const [exploredDates, setExploredDates] = useState<Set<string>>(new Set())

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])

  const isLondon = childName?.toLowerCase() === 'london'
  const isLincoln = childName?.toLowerCase() === 'lincoln'

  const trailSet = useMemo(() => {
    if (isLondon) return GARDEN_SET
    const weekNum = Math.floor(
      new Date(weekStart + 'T00:00:00').getTime() / (7 * 24 * 60 * 60 * 1000),
    )
    const sets = isLincoln ? MC_TRAIL_SETS : TRAIL_SETS
    return sets[weekNum % sets.length]
  }, [weekStart, isLondon, isLincoln])

  // Load day completion data
  useEffect(() => {
    if (!familyId || !childId || weekDates.length === 0) return

    const q = query(
      daysCollection(familyId),
      where('childId', '==', childId),
      where('date', '>=', weekDates[0]),
      where('date', '<=', weekDates[weekDates.length - 1]),
    )

    getDocs(q).then((snap) => {
      const explored = new Set<string>()
      snap.docs.forEach((doc) => {
        const data = doc.data() as DayLog
        const hasCompleted = data.checklist?.some((item) => item.completed)
        if (hasCompleted) {
          explored.add(data.date)
        }
      })
      setExploredDates(explored)
    })
  }, [familyId, childId, weekDates])

  const exploredCount = weekDates.filter((d) => exploredDates.has(d)).length
  const remainingCount = weekDates.filter(
    (d) => d >= todayDate && !exploredDates.has(d),
  ).length

  // Streak calculation: consecutive explored days backward from today/yesterday
  const streak = useMemo(() => {
    let count = 0
    for (let i = weekDates.length - 1; i >= 0; i--) {
      if (weekDates[i] > todayDate) continue
      if (exploredDates.has(weekDates[i])) {
        count++
      } else {
        // If today hasn't been explored yet, skip it and keep counting
        if (weekDates[i] === todayDate && count === 0) continue
        break
      }
    }
    return count
  }, [weekDates, exploredDates, todayDate])

  const allExplored = exploredCount === 5

  const summaryText = allExplored
    ? isLondon
      ? 'Full garden bloomed this week! 🎉'
      : isLincoln
        ? 'Full map explored! Legendary week!'
        : 'Full week explored! What an adventure! 🎉'
    : isLondon
      ? `${exploredCount} flower${exploredCount !== 1 ? 's' : ''} bloomed! ${remainingCount} to grow...`
      : isLincoln
        ? `${exploredCount} biome${exploredCount !== 1 ? 's' : ''} explored! ${remainingCount} to discover...`
        : `${exploredCount} day${exploredCount !== 1 ? 's' : ''} explored! ${remainingCount} to discover...`

  const title = isLondon
    ? '🌸 This Week\'s Garden'
    : isLincoln
      ? '🗺️ World Map'
      : '🗺️ This Week\'s Journey'

  return (
    <SectionCard title={title}>
      {/* Trail visualization */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ px: 1 }}
      >
        {weekDates.map((date, i) => {
          const isExplored = exploredDates.has(date)
          const isToday = date === todayDate
          const isFuture = date > todayDate

          return (
            <Stack key={date} alignItems="center" spacing={0.5} sx={{ flex: 1 }}>
              {/* Landmark emoji */}
              <Box
                sx={{
                  fontSize: '1.75rem',
                  opacity: isExplored ? 1 : isFuture ? 0.3 : 0.5,
                  animation: isToday && !isExplored ? 'pulse 2s ease-in-out infinite' : undefined,
                  '@keyframes pulse': {
                    '0%, 100%': { transform: 'scale(1)' },
                    '50%': { transform: 'scale(1.15)' },
                  },
                }}
              >
                {trailSet[i]}
              </Box>

              {/* Day label */}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? 'primary.main' : 'text.secondary',
                }}
              >
                {DAY_LABELS[i]}
              </Typography>

              {/* Status indicator */}
              <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                {isExplored ? '✓' : '·'}
              </Typography>

              {/* Connecting line (not after last) */}
              {i < 4 && (
                <Box
                  sx={{
                    position: 'absolute',
                    display: 'none', // Hidden — trail emoji are close enough
                  }}
                />
              )}
            </Stack>
          )
        })}
      </Stack>

      {/* Connecting trail line behind landmarks */}
      <Box
        sx={{
          mx: 4,
          mt: -4.5,
          mb: 1,
          borderBottom: '2px dashed',
          borderColor: 'divider',
          position: 'relative',
          zIndex: 0,
        }}
      />

      {/* Summary */}
      <Typography
        variant="body2"
        color="text.secondary"
        textAlign="center"
        sx={{ mt: 1 }}
      >
        {summaryText}
      </Typography>

      {/* Streak (only show if >= 2) */}
      {streak >= 2 && (
        <Typography
          variant="body2"
          textAlign="center"
          sx={{ color: 'warning.main', fontWeight: 600 }}
        >
          {isLincoln ? `⛏️ Mining streak: ${streak} days` : `🔥 Streak: ${streak} days`}
        </Typography>
      )}
    </SectionCard>
  )
}
