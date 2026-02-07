import type { Artifact, MilestoneProgress, Rung } from '../../core/types/domain'

export type RungStatus = 'locked' | 'active' | 'achieved'
export type ProgressByRungId = Record<string, MilestoneProgress | undefined>

const isRungAchieved = (
  rung: Rung,
  progressByRungId: ProgressByRungId,
): boolean => {
  if (!rung.id) {
    return false
  }
  return Boolean(progressByRungId[rung.id]?.achieved)
}

export const getActiveRungId = (
  rungs: Rung[],
  progressByRungId: ProgressByRungId,
): string | undefined => {
  const sortedRungs = [...rungs].sort((a, b) => a.order - b.order)
  const activeRung = sortedRungs.find((rung) => !isRungAchieved(rung, progressByRungId))
  return activeRung?.id
}

export const getRungStatus = (
  rung: Rung,
  progressByRungId: ProgressByRungId,
  activeRungId: string | undefined,
): RungStatus => {
  if (isRungAchieved(rung, progressByRungId)) {
    return 'achieved'
  }

  if (rung.id && rung.id === activeRungId) {
    return 'active'
  }

  return 'locked'
}

export const canMarkAchieved = (linkedArtifacts: Artifact[] | undefined): boolean => {
  return Boolean(linkedArtifacts && linkedArtifacts.length > 0)
}
