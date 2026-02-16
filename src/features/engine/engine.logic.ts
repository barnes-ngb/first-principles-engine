import type { Artifact, MilestoneProgress } from '../../core/types/domain'
import { EngineStage } from '../../core/types/enums'
import { formatDateYmd } from '../../core/utils/format'
import type { WeekRange } from '../../core/utils/time'

export type { WeekRange } from '../../core/utils/time'
export { getWeekRange } from '../../core/utils/time'

export type StageCounts = Partial<Record<EngineStage, number>>

export type LoopStatus = 'complete' | 'minimum' | 'incomplete'

const orderedStages = [
  EngineStage.Wonder,
  EngineStage.Build,
  EngineStage.Explain,
  EngineStage.Reflect,
  EngineStage.Share,
]

const minimumStages = [EngineStage.Wonder, EngineStage.Explain, EngineStage.Reflect]

const getCount = (counts: StageCounts, stage: EngineStage) => counts[stage] ?? 0

const getDateKey = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return formatDateYmd(date)
}

const isWithinWeekRange = (value: string | undefined, range: WeekRange) => {
  if (!value) {
    return false
  }
  const key = getDateKey(value)
  if (!key) {
    return false
  }
  return key >= range.start && key <= range.end
}

export const countUniqueRungsInRange = (
  artifacts: Artifact[],
  childId: string,
  range: WeekRange,
) => {
  const unique = new Set<string>()

  artifacts.forEach((artifact) => {
    if (artifact.childId !== childId) {
      return
    }
    const rungId = artifact.tags?.ladderRef?.rungId
    if (!rungId) {
      return
    }
    if (!isWithinWeekRange(artifact.createdAt, range)) {
      return
    }
    unique.add(rungId)
  })

  return unique.size
}

export const countMilestonesAchievedInRange = (
  milestoneProgress: MilestoneProgress[],
  childId: string,
  range: WeekRange,
) =>
  milestoneProgress.filter(
    (entry) => entry.childId === childId && isWithinWeekRange(entry.achievedAt, range),
  ).length

export const computeLoopStatus = (counts: StageCounts): LoopStatus => {
  const hasAllStages = orderedStages.every((stage) => getCount(counts, stage) > 0)
  if (hasAllStages) {
    return 'complete'
  }

  const hasMinimumLoop = minimumStages.every((stage) => getCount(counts, stage) > 0)
  if (hasMinimumLoop) {
    return 'minimum'
  }

  return 'incomplete'
}

export const suggestNextStage = (counts: StageCounts): EngineStage | null => {
  const missingMinimum = minimumStages.find((stage) => getCount(counts, stage) === 0)
  if (missingMinimum) {
    return missingMinimum
  }

  const missingStage = orderedStages.find((stage) => getCount(counts, stage) === 0)
  return missingStage ?? null
}
