/**
 * Coverage Engine (was Pace Gauge)
 *
 * Calculates curriculum coverage status — what's been covered, what's current,
 * and what's upcoming. No pace pressure, no deadline math.
 */

import type { PaceGaugeResult, WorkbookConfig } from '../../core/types'
import { PaceStatus } from '../../core/types/enums'

/**
 * Calculate coverage status for a single workbook.
 */
export function calculatePace(
  config: WorkbookConfig,
): PaceGaugeResult {
  const { totalUnits, currentPosition, unitLabel, name } = config
  const unit = unitLabel || 'lesson'

  // Determine coverage status
  let status: PaceStatus
  if (totalUnits <= 0) {
    // No total known — just track position
    status = currentPosition > 0 ? PaceStatus.Current : PaceStatus.NotStarted
  } else if (currentPosition >= totalUnits) {
    status = PaceStatus.Explored
  } else if (currentPosition > 0) {
    status = PaceStatus.Current
  } else {
    status = PaceStatus.NotStarted
  }

  // Build coverage text
  let coverageText: string
  if (totalUnits > 0 && currentPosition >= totalUnits) {
    coverageText = 'Complete!'
  } else if (currentPosition <= 0) {
    coverageText = 'Not started'
  } else if (totalUnits > 0) {
    coverageText = `${unit.charAt(0).toUpperCase() + unit.slice(1)} ${currentPosition} of ${totalUnits} covered`
  } else {
    coverageText = `${unit.charAt(0).toUpperCase() + unit.slice(1)} ${currentPosition} reached`
  }

  return {
    workbookName: name,
    currentPosition,
    totalUnits,
    unitLabel: unit,
    status,
    coverageText,
  }
}

/**
 * Build a human-readable coverage suggestion.
 */
export function buildPaceSuggestion(
  status: PaceStatus,
  _requiredPerWeek: number,
  _plannedPerWeek: number,
  unitLabel: string,
): string {
  switch (status) {
    case PaceStatus.Explored:
      return `All ${unitLabel}s covered. Ready for the next level or deeper practice.`
    case PaceStatus.Current:
      return `Currently working through ${unitLabel}s. Keep going at a comfortable pace.`
    case PaceStatus.Upcoming:
      return `More ${unitLabel}s ahead. No rush — cover what's ready.`
    case PaceStatus.NotStarted:
      return `Not yet started. Jump in when ready.`
  }
}

/**
 * Calculate coverage for multiple workbooks.
 */
export function calculateAllPaces(
  configs: WorkbookConfig[],
): PaceGaugeResult[] {
  return configs.map((config) => calculatePace(config))
}

/**
 * Default weekly structure that creates buffer days.
 * Mon/Tue = new instruction + hardest skill
 * Wed = light day (appointments default here)
 * Thu = reinforce + short test
 * Fri = catch-up / project / review
 */
export const DEFAULT_WEEK_STRUCTURE = {
  Monday: { focus: 'new-instruction', intensity: 'high' },
  Tuesday: { focus: 'new-instruction', intensity: 'high' },
  Wednesday: { focus: 'light-day', intensity: 'low' },
  Thursday: { focus: 'reinforce', intensity: 'medium' },
  Friday: { focus: 'catch-up', intensity: 'low' },
} as const
