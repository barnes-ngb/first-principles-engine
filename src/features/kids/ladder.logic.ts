import type { Artifact, MilestoneProgress, Rung } from '../../core/types/domain'

export type RungStatus = 'locked' | 'active' | 'achieved'

export type ProgressByRungId = Record<string, MilestoneProgress | undefined>

export const rungIdFor = (rung: Rung) => rung.id ?? `order-${rung.order}`

const isAchieved = (progress?: MilestoneProgress) =>
  progress?.status === 'achieved' || progress?.achieved

export const getActiveRungId = (
  rungs: Rung[],
  progressByRungId: ProgressByRungId,
): string | undefined => {
  const orderedRungs = [...rungs].sort((a, b) => a.order - b.order)
  const firstUnachieved = orderedRungs.find((rung) => {
    const progress = progressByRungId[rungIdFor(rung)]
    return !isAchieved(progress)
  })

  return firstUnachieved ? rungIdFor(firstUnachieved) : undefined
}

export const getRungStatus = (
  rung: Rung,
  progressByRungId: ProgressByRungId,
  activeRungId?: string,
): RungStatus => {
  const rungId = rungIdFor(rung)
  const progress = progressByRungId[rungId]

  if (isAchieved(progress)) return 'achieved'
  if (activeRungId && rungId === activeRungId) return 'active'
  return 'locked'
}

export const canMarkAchieved = (linkedArtifacts: Artifact[]): boolean =>
  linkedArtifacts.length > 0
