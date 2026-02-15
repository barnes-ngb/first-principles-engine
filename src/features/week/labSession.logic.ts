import { EngineStage } from '../../core/types/enums'
import type { EngineStage as EngineStageType } from '../../core/types/enums'

/**
 * Build a deterministic lab session doc ID.
 * With projectId: `{weekKey}_{childId}_{projectId}` (one session per project per week).
 * Without: `{weekKey}_{childId}` (legacy).
 */
export const buildLabSessionDocId = (weekKey: string, childId: string, projectId?: string): string =>
  projectId ? `${weekKey}_${childId}_${projectId}` : `${weekKey}_${childId}`

/**
 * Default stage for a new lab session.
 */
export const DEFAULT_LAB_STAGE: EngineStageType = EngineStage.Wonder

/**
 * Ordered list of lab stages for stepper / progression UI.
 */
export const LAB_STAGES: EngineStageType[] = [
  EngineStage.Wonder,
  EngineStage.Build,
  EngineStage.Explain,
  EngineStage.Reflect,
  EngineStage.Share,
]

/**
 * Get the index (0-based) of a stage within the ordered list.
 * Returns 0 if not found.
 */
export const labStageIndex = (stage: EngineStageType): number => {
  const idx = LAB_STAGES.indexOf(stage)
  return idx >= 0 ? idx : 0
}
