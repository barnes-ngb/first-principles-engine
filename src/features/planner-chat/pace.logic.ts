/**
 * Pace Gauge Engine (Slice E)
 *
 * Calculates whether a workbook is on track, behind, or ahead
 * based on current position, target finish date, and planned pace.
 */

import type { PaceGaugeResult, WorkbookConfig } from '../../core/types/domain'
import { PaceStatus } from '../../core/types/enums'

/**
 * Calculate the number of school weeks remaining between today and the target date.
 */
export function weeksRemaining(today: string, targetDate: string): number {
  const t = new Date(today)
  const target = new Date(targetDate)
  const diffMs = target.getTime() - t.getTime()
  const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  return Math.max(0, diffDays / 7)
}

/**
 * Calculate pace gauge for a single workbook.
 */
export function calculatePace(
  config: WorkbookConfig,
  today: string,
  plannedUnitsPerWeek?: number,
): PaceGaugeResult {
  const unitsRemaining = Math.max(0, config.totalUnits - config.currentPosition)
  const weeks = weeksRemaining(today, config.targetFinishDate)

  // Required units per week
  const requiredPerWeek = weeks > 0 ? unitsRemaining / weeks : unitsRemaining
  const planned = plannedUnitsPerWeek ?? requiredPerWeek

  // Delta: positive = ahead, negative = behind
  const delta = planned - requiredPerWeek

  // Status thresholds
  let status: PaceStatus
  if (weeks <= 0) {
    status = unitsRemaining <= 0 ? PaceStatus.OnTrack : PaceStatus.Critical
  } else if (delta >= requiredPerWeek * 0.2) {
    status = PaceStatus.Ahead
  } else if (delta >= -requiredPerWeek * 0.1) {
    status = PaceStatus.OnTrack
  } else if (delta >= -requiredPerWeek * 0.3) {
    status = PaceStatus.Behind
  } else {
    status = PaceStatus.Critical
  }

  // Projected finish date at current planned pace
  const weeksToFinish = planned > 0 ? unitsRemaining / planned : Infinity
  const projectedDate = new Date(today)
  projectedDate.setDate(projectedDate.getDate() + Math.ceil(weeksToFinish * 7))
  const projectedFinishDate = isFinite(weeksToFinish)
    ? projectedDate.toISOString().slice(0, 10)
    : 'N/A'

  // Buffer days = extra days available beyond required pace
  const daysNeeded = requiredPerWeek > 0
    ? (unitsRemaining / planned) * 7
    : 0
  const daysAvailable = weeks * 7
  const bufferDays = Math.max(0, Math.floor(daysAvailable - daysNeeded))

  const suggestion = buildPaceSuggestion(status, requiredPerWeek, planned, config.unitLabel)

  return {
    workbookName: config.name,
    requiredPerWeek: Math.round(requiredPerWeek * 10) / 10,
    plannedPerWeek: Math.round(planned * 10) / 10,
    delta: Math.round(delta * 10) / 10,
    status,
    suggestion,
    projectedFinishDate,
    bufferDays,
  }
}

/**
 * Build a human-readable pace suggestion.
 */
export function buildPaceSuggestion(
  status: PaceStatus,
  requiredPerWeek: number,
  plannedPerWeek: number,
  unitLabel: string,
): string {
  const unit = unitLabel + (requiredPerWeek !== 1 ? 's' : '')

  switch (status) {
    case PaceStatus.Ahead:
      return `On track with buffer. Current pace allows light days or deeper practice.`
    case PaceStatus.OnTrack:
      return `On target at ${Math.round(plannedPerWeek)} ${unit}/week. Keep steady.`
    case PaceStatus.Behind:
      return `Behind by ~${Math.round(Math.abs(plannedPerWeek - requiredPerWeek))} ${unit}/week. Sprint Mon/Tue or skip review sets.`
    case PaceStatus.Critical:
      return `Significantly behind. Need ${Math.round(requiredPerWeek)} ${unit}/week. Consider skipping mastered content or extending target date.`
  }
}

/**
 * Calculate pace for multiple workbooks.
 */
export function calculateAllPaces(
  configs: WorkbookConfig[],
  today: string,
  plannedPerWeekMap?: Map<string, number>,
): PaceGaugeResult[] {
  return configs.map((config) => {
    const planned = plannedPerWeekMap?.get(config.name)
    return calculatePace(config, today, planned)
  })
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
