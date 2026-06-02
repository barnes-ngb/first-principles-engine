// ── Banner Rally — pure progress computation ──────────────────────
//
// All functions here are PURE and read-only. They derive mission progress from
// a lifetime count of reading actions and the persisted progress doc. They
// never read or write XP / diamonds / forge state — by construction this module
// cannot touch the economy (it has no Firestore access at all).

import type { StonebridgeProgress } from '../../../core/types/stonebridge'
import {
  FIRST_MISSION_ID,
  STONEBRIDGE_MISSIONS,
  getMission,
  getNextMission,
  type StonebridgeMission,
} from './missions'

/** Reading-activity event types counted toward Banner Rally missions. */
export const READING_ACTION_TYPES = ['BOOK_READ', 'QUEST_COMPLETE'] as const

/** A minimal read-only view of an xpLedger per-event doc. */
export interface ReadingActivityEvent {
  type?: string
  currencyType?: string
}

/**
 * Count lifetime reading actions from xpLedger per-event docs.
 *
 * Counts only XP events of type BOOK_READ or QUEST_COMPLETE. Diamond entries
 * (currencyType === 'diamond', which carry type MANUAL_AWARD/MANUAL_DEDUCT) are
 * excluded so a single read/quest is never double-counted.
 */
export function countReadingActions(events: ReadingActivityEvent[]): number {
  const types = new Set<string>(READING_ACTION_TYPES)
  return events.filter(
    (e) => e.currencyType !== 'diamond' && typeof e.type === 'string' && types.has(e.type),
  ).length
}

/** Derived view of a single mission's progress. */
export interface MissionComputation {
  missionId: string
  /** Reading actions credited to this mission, clamped to [0, target]. */
  current: number
  target: number
  /** Whole-number percent in [0, 100]. */
  percent: number
  complete: boolean
}

/**
 * Compute one mission's progress from the lifetime reading-action count and the
 * baseline snapshotted when the mission became active. Surplus beyond the target
 * is clamped here (it carries to the next mission via {@link advanceMissions}).
 */
export function computeMissionProgress(
  mission: StonebridgeMission,
  totalReadingActions: number,
  baseline: number,
): MissionComputation {
  const raw = Math.max(0, totalReadingActions - baseline)
  const current = Math.min(raw, mission.target)
  const percent = mission.target > 0 ? Math.round((current / mission.target) * 100) : 100
  return {
    missionId: mission.id,
    current,
    target: mission.target,
    percent,
    complete: raw >= mission.target,
  }
}

/** Build the initial progress doc for a child who has none yet. */
export function initialStonebridgeProgress(
  childId: string,
  totalReadingActions: number,
  now: string,
): StonebridgeProgress {
  return {
    childId,
    currentMissionId: FIRST_MISSION_ID,
    activeProgress: null,
    completedMissions: [],
    raisedBanners: [],
    // Baseline at first sight so existing lifetime reading doesn't auto-complete
    // the opening mission — progress starts from "now".
    missionBaselines: { [FIRST_MISSION_ID]: totalReadingActions },
    updatedAt: now,
  }
}

/** Result of reconciling a progress doc against the current reading-action count. */
export interface AdvanceResult {
  /** The (possibly unchanged) next state to persist. */
  state: StonebridgeProgress
  /** True if any field changed and the doc should be written. */
  changed: boolean
  /** Mission ids that became complete during this reconcile (in order). */
  newlyCompleted: string[]
  /** Derived view of the now-active mission, or null if all missions are done. */
  active: MissionComputation | null
}

/**
 * Reconcile a persisted progress doc against the current lifetime reading-action
 * count: advance through any newly-completed missions (surplus carries forward
 * additively), raise their banners, queue the next mission, and recompute the
 * active mission's counters.
 *
 * Pure: returns a new state object; never mutates the input. Never touches XP.
 */
export function advanceMissions(
  prev: StonebridgeProgress,
  totalReadingActions: number,
  now: string,
): AdvanceResult {
  const completedMissions = [...prev.completedMissions]
  const raisedBanners = [...prev.raisedBanners]
  const missionBaselines = { ...prev.missionBaselines }
  const newlyCompleted: string[] = []

  let currentMissionId = prev.currentMissionId
  let guard = 0

  // Walk forward while the active mission is complete and a next mission exists.
  // The guard bounds the loop to the number of defined missions.
  while (guard <= STONEBRIDGE_MISSIONS.length) {
    guard += 1
    const mission = getMission(currentMissionId)
    if (!mission) break

    const baseline = missionBaselines[currentMissionId] ?? totalReadingActions
    if (missionBaselines[currentMissionId] === undefined) {
      missionBaselines[currentMissionId] = baseline
    }

    const comp = computeMissionProgress(mission, totalReadingActions, baseline)
    if (!comp.complete) break

    // Mission complete → record it, raise its banner.
    if (!completedMissions.includes(mission.id)) {
      completedMissions.push(mission.id)
      newlyCompleted.push(mission.id)
    }
    if (!raisedBanners.includes(mission.id)) {
      raisedBanners.push(mission.id)
    }

    const next = getNextMission(mission.id)
    if (!next) {
      // No further missions — stay parked on the last (completed) one.
      currentMissionId = mission.id
      break
    }
    // Carry surplus forward: next mission's baseline = this baseline + target.
    if (missionBaselines[next.id] === undefined) {
      missionBaselines[next.id] = baseline + mission.target
    }
    currentMissionId = next.id
  }

  const activeMission = getMission(currentMissionId)
  const active = activeMission
    ? computeMissionProgress(
        activeMission,
        totalReadingActions,
        missionBaselines[currentMissionId] ?? totalReadingActions,
      )
    : null

  const activeProgress = active
    ? { missionId: active.missionId, current: active.current, target: active.target }
    : null

  const nextState: StonebridgeProgress = {
    ...prev,
    currentMissionId,
    activeProgress,
    completedMissions,
    raisedBanners,
    missionBaselines,
    updatedAt: now,
  }

  const changed =
    prev.currentMissionId !== currentMissionId ||
    prev.completedMissions.length !== completedMissions.length ||
    prev.raisedBanners.length !== raisedBanners.length ||
    JSON.stringify(prev.missionBaselines) !== JSON.stringify(missionBaselines) ||
    JSON.stringify(prev.activeProgress ?? null) !== JSON.stringify(activeProgress)

  return { state: nextState, changed, newlyCompleted, active }
}
