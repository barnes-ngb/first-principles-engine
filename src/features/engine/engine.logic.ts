import { EngineStage } from '../../core/types/enums'
import { formatDateYmd } from '../../lib/format'

export type WeekRange = {
  start: string
  end: string
}

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

export const getWeekRange = (date: Date = new Date(), weekStartsOn = 1): WeekRange => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayOfWeek = start.getDay()
  const offset = (dayOfWeek - weekStartsOn + 7) % 7
  start.setDate(start.getDate() - offset)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return {
    start: formatDateYmd(start),
    end: formatDateYmd(end),
  }
}

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
