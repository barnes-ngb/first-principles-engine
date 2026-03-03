import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getDocs, query, where } from 'firebase/firestore'

import SectionCard from '../../components/SectionCard'
import { ladderProgressCollection } from '../../core/firebase/firestore'
import type { LadderCardDefinition, LadderProgress } from '../../core/types/domain'

interface LadderQuickLogProps {
  familyId: string
  childId: string
  ladders: LadderCardDefinition[]
}

export default function LadderQuickLog({ familyId, childId, ladders }: LadderQuickLogProps) {
  const navigate = useNavigate()
  const [progressMap, setProgressMap] = useState<Record<string, LadderProgress>>({})
  const [loaded, setLoaded] = useState(false)

  // Reset state on child switch (render-time, not in effect)
  const [prevChildId, setPrevChildId] = useState(childId)
  if (prevChildId !== childId) {
    setPrevChildId(childId)
    setProgressMap({})
    setLoaded(false)
  }

  useEffect(() => {
    if (!childId || !familyId) return
    let cancelled = false

    const load = async () => {
      try {
        const q = query(
          ladderProgressCollection(familyId),
          where('childId', '==', childId),
        )
        const snapshot = await getDocs(q)
        if (cancelled) return
        const map: Record<string, LadderProgress> = {}
        for (const d of snapshot.docs) {
          const data = d.data() as LadderProgress
          map[data.ladderKey] = data
        }
        setProgressMap(map)
      } catch (err) {
        console.error('Failed to load ladder progress for quick-log', err)
      }
      if (!cancelled) setLoaded(true)
    }

    load()
    return () => { cancelled = true }
  }, [familyId, childId])

  const items = useMemo(
    () =>
      ladders.map((ladder) => {
        const progress = progressMap[ladder.ladderKey]
        const rungId = progress?.currentRungId ?? ladder.rungs[0]?.rungId ?? 'R0'
        const rung = ladder.rungs.find((r) => r.rungId === rungId)
        const streak = progress?.streakCount ?? 0
        return { ladder, rungId, rungName: rung?.name ?? rungId, streak }
      }),
    [ladders, progressMap],
  )

  if (ladders.length === 0) return null

  return (
    <SectionCard title="Ladder Quick-Log">
      {!loaded ? (
        <Typography variant="body2" color="text.secondary">Loading ladders...</Typography>
      ) : (
        <Stack spacing={1}>
          {items.map(({ ladder, rungId, rungName, streak }) => (
            <Stack
              key={ladder.ladderKey}
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: 1,
                bgcolor: 'action.hover',
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                {ladder.title}
              </Typography>
              <Chip
                label={`${rungId}: ${rungName}`}
                size="small"
                color="primary"
                variant="outlined"
              />
              <Stack direction="row" spacing={0.25} alignItems="center">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Box
                    key={i}
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: i < streak ? 'success.main' : 'action.disabledBackground',
                    }}
                  />
                ))}
              </Stack>
              <Button
                size="small"
                variant="outlined"
                onClick={() => navigate(`/ladders?ladder=${ladder.ladderKey}`)}
                sx={{ minWidth: 48, px: 1 }}
              >
                Log
              </Button>
            </Stack>
          ))}
        </Stack>
      )}
    </SectionCard>
  )
}
