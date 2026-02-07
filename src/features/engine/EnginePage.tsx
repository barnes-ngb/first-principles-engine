import { useCallback, useEffect, useMemo, useState } from 'react'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getDocs } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { DEFAULT_FAMILY_ID } from '../../core/firebase/config'
import {
  artifactsCollection,
  childrenCollection,
  milestoneProgressCollection,
} from '../../core/firebase/firestore'
import type { Artifact, Child, MilestoneProgress } from '../../core/types/domain'
import { EngineStage } from '../../core/types/enums'
import {
  computeLoopStatus,
  getWeekRange,
  suggestNextStage,
  type StageCounts,
} from './engine.logic'

const orderedStages = [
  EngineStage.Wonder,
  EngineStage.Build,
  EngineStage.Explain,
  EngineStage.Reflect,
  EngineStage.Share,
]

const weekDayLabels = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const getWeekStartIndex = (value?: string) => {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('sun')) return 0
  if (normalized.startsWith('mon')) return 1
  if (normalized.startsWith('tue')) return 2
  if (normalized.startsWith('wed')) return 3
  if (normalized.startsWith('thu')) return 4
  if (normalized.startsWith('fri')) return 5
  if (normalized.startsWith('sat')) return 6
  return null
}

const parseDateValue = (value?: string) => {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value}T00:00:00`
  const time = Date.parse(normalized)
  if (Number.isNaN(time)) return null
  return new Date(time)
}

const isDateInRange = (value: Date, start: Date, end: Date) =>
  value.getTime() >= start.getTime() && value.getTime() <= end.getTime()

const getStatusLabel = (status: ReturnType<typeof computeLoopStatus>) => {
  if (status === 'complete') return 'Complete loop'
  if (status === 'minimum') return 'Minimum loop'
  return 'Incomplete loop'
}

const getStatusColor = (status: ReturnType<typeof computeLoopStatus>) => {
  if (status === 'complete') return 'success'
  if (status === 'minimum') return 'warning'
  return 'default'
}

export default function EnginePage() {
  const familyId = DEFAULT_FAMILY_ID
  const [children, setChildren] = useState<Child[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [milestoneProgress, setMilestoneProgress] = useState<MilestoneProgress[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    const [childrenSnapshot, artifactsSnapshot, milestoneSnapshot] = await Promise.all(
      [
        getDocs(childrenCollection(familyId)),
        getDocs(artifactsCollection(familyId)),
        getDocs(milestoneProgressCollection(familyId)),
      ],
    )

    const loadedChildren = childrenSnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data() as Child
      return { ...data, id: data.id ?? docSnapshot.id }
    })
    const loadedArtifacts = artifactsSnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data() as Artifact
      return { ...data, id: data.id ?? docSnapshot.id }
    })
    const loadedMilestones = milestoneSnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data() as MilestoneProgress
      return { ...data, id: data.id ?? docSnapshot.id }
    })

    setChildren(loadedChildren)
    setArtifacts(loadedArtifacts)
    setMilestoneProgress(loadedMilestones)
    setIsLoading(false)
  }, [familyId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const weekStartIndex = useMemo(() => {
    const configured = children.find((child) => child.settings?.weekStartDay)
      ?.settings?.weekStartDay
    return getWeekStartIndex(configured)
  }, [children])

  const weekRange = useMemo(
    () => getWeekRange(new Date(), weekStartIndex ?? undefined),
    [weekStartIndex],
  )

  const rangeStart = useMemo(
    () => new Date(`${weekRange.start}T00:00:00`),
    [weekRange.start],
  )
  const rangeEnd = useMemo(
    () => new Date(`${weekRange.end}T23:59:59.999`),
    [weekRange.end],
  )

  const artifactsInRange = useMemo(() => {
    return artifacts.filter((artifact) => {
      const created = parseDateValue(artifact.createdAt)
      if (!created) return false
      return isDateInRange(created, rangeStart, rangeEnd)
    })
  }, [artifacts, rangeEnd, rangeStart])

  const milestonesInRange = useMemo(() => {
    return milestoneProgress.filter((entry) => {
      const achieved = parseDateValue(entry.achievedAt)
      if (!achieved) return false
      return isDateInRange(achieved, rangeStart, rangeEnd)
    })
  }, [milestoneProgress, rangeEnd, rangeStart])

  const metricsByChild = useMemo(() => {
    return children.reduce<Record<string, {
      rungsTouched: number
      newlyAchieved: number
      stageCounts: StageCounts
    }>>((acc, child) => {
      if (!child.id) return acc
      const childArtifacts = artifactsInRange.filter(
        (artifact) => artifact.childId === child.id,
      )
      const rungIds = new Set(
        childArtifacts
          .map((artifact) => artifact.tags?.ladderRef?.rungId)
          .filter((rungId): rungId is string => Boolean(rungId)),
      )

      const stageCounts = childArtifacts.reduce<StageCounts>((counts, artifact) => {
        const stage = artifact.tags?.engineStage
        if (!stage) return counts
        counts[stage] = (counts[stage] ?? 0) + 1
        return counts
      }, {})

      const newlyAchieved = milestonesInRange.filter(
        (entry) => entry.childId === child.id,
      ).length

      acc[child.id] = {
        rungsTouched: rungIds.size,
        newlyAchieved,
        stageCounts,
      }
      return acc
    }, {})
  }, [artifactsInRange, children, milestonesInRange])

  const weekStartLabel = weekStartIndex !== null ? weekDayLabels[weekStartIndex] : null

  return (
    <Page>
      <SectionCard title="Engine">
        <Stack spacing={1}>
          <Typography color="text.secondary">
            Week of {weekRange.start} through {weekRange.end}.
          </Typography>
          {weekStartLabel ? (
            <Typography color="text.secondary">
              Week starts on {weekStartLabel}.
            </Typography>
          ) : null}
        </Stack>
      </SectionCard>

      {isLoading ? (
        <SectionCard title="Loading">
          <Typography color="text.secondary">Loading engine stats...</Typography>
        </SectionCard>
      ) : children.length === 0 ? (
        <SectionCard title="Children">
          <Typography color="text.secondary">
            No children are set up yet. Add a child to see the weekly flywheel.
          </Typography>
        </SectionCard>
      ) : (
        children.map((child, index) => {
          const metrics = child.id ? metricsByChild[child.id] : undefined
          const stageCounts = metrics?.stageCounts ?? {}
          const loopStatus = computeLoopStatus(stageCounts)
          const nextStage = suggestNextStage(stageCounts)

          return (
            <SectionCard
              key={child.id ?? child.name ?? `child-${index}`}
              title={child.name || 'Child'}
            >
              <Stack spacing={2}>
                <Stack spacing={1}>
                  <Typography variant="subtitle2">Flywheel status</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip
                      label={getStatusLabel(loopStatus)}
                      color={getStatusColor(loopStatus)}
                    />
                    {nextStage ? (
                      <Chip label={`Next up: ${nextStage}`} variant="outlined" />
                    ) : null}
                  </Stack>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {orderedStages.map((stage) => {
                      const count = stageCounts[stage] ?? 0
                      return (
                        <Chip
                          key={stage}
                          label={`${stage} ${count}`}
                          color={count > 0 ? 'primary' : 'default'}
                          variant={count > 0 ? 'filled' : 'outlined'}
                          size="small"
                        />
                      )
                    })}
                  </Stack>
                </Stack>
                <Divider />
                <Stack spacing={1}>
                  <Typography variant="subtitle2">This week</Typography>
                  <Typography>
                    Rungs touched this week: {metrics?.rungsTouched ?? 0}
                  </Typography>
                  <Typography>
                    Newly achieved: {metrics?.newlyAchieved ?? 0}
                  </Typography>
                </Stack>
              </Stack>
            </SectionCard>
          )
        })
      )}
    </Page>
  )
}
