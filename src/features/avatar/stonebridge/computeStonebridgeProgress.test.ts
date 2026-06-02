import { describe, expect, it } from 'vitest'

import {
  advanceMissions,
  computeMissionProgress,
  countReadingActions,
  initialStonebridgeProgress,
  type ReadingActivityEvent,
} from './computeStonebridgeProgress'
import { FIRST_MISSION_ID, STONEBRIDGE_MISSIONS, getMission } from './missions'
import type { StonebridgeProgress } from '../../../core/types/stonebridge'

const OLD_BRIDGE = STONEBRIDGE_MISSIONS[0]
const WATCHTOWER = STONEBRIDGE_MISSIONS[1]
const NOW = '2026-06-02T00:00:00.000Z'

describe('countReadingActions', () => {
  it('counts BOOK_READ and QUEST_COMPLETE xp events', () => {
    const events: ReadingActivityEvent[] = [
      { type: 'BOOK_READ', currencyType: 'xp' },
      { type: 'QUEST_COMPLETE', currencyType: 'xp' },
      { type: 'BOOK_READ', currencyType: 'xp' },
    ]
    expect(countReadingActions(events)).toBe(3)
  })

  it('ignores non-reading event types', () => {
    const events: ReadingActivityEvent[] = [
      { type: 'CHECKLIST_ITEM', currencyType: 'xp' },
      { type: 'DAD_LAB_COMPLETE', currencyType: 'xp' },
      { type: 'BOOK_READ', currencyType: 'xp' },
    ]
    expect(countReadingActions(events)).toBe(1)
  })

  it('excludes diamond entries so reads/quests are not double-counted', () => {
    const events: ReadingActivityEvent[] = [
      { type: 'BOOK_READ', currencyType: 'xp' },
      // diamond mirror of the same read carries type MANUAL_AWARD, but guard anyway
      { type: 'BOOK_READ', currencyType: 'diamond' },
      { type: 'QUEST_COMPLETE', currencyType: 'diamond' },
    ]
    expect(countReadingActions(events)).toBe(1)
  })

  it('ignores the cumulative ledger doc (no type field)', () => {
    const events: ReadingActivityEvent[] = [
      { currencyType: 'xp' }, // cumulative doc
      { type: 'QUEST_COMPLETE', currencyType: 'xp' },
    ]
    expect(countReadingActions(events)).toBe(1)
  })
})

describe('computeMissionProgress', () => {
  it('subtracts the baseline and clamps to the target', () => {
    const comp = computeMissionProgress(OLD_BRIDGE, 3, 0)
    expect(comp.current).toBe(3)
    expect(comp.target).toBe(OLD_BRIDGE.target)
    expect(comp.complete).toBe(false)
    expect(comp.percent).toBe(Math.round((3 / OLD_BRIDGE.target) * 100))
  })

  it('starts a mission at zero given a non-zero baseline', () => {
    const comp = computeMissionProgress(OLD_BRIDGE, 10, 10)
    expect(comp.current).toBe(0)
    expect(comp.percent).toBe(0)
  })

  it('marks complete and clamps current at the target', () => {
    const comp = computeMissionProgress(OLD_BRIDGE, OLD_BRIDGE.target + 3, 0)
    expect(comp.complete).toBe(true)
    expect(comp.current).toBe(OLD_BRIDGE.target)
    expect(comp.percent).toBe(100)
  })

  it('never goes negative when count is below baseline', () => {
    const comp = computeMissionProgress(OLD_BRIDGE, 2, 5)
    expect(comp.current).toBe(0)
    expect(comp.percent).toBe(0)
  })
})

describe('initialStonebridgeProgress', () => {
  it('baselines the opening mission at the current count so prior reading does not auto-complete it', () => {
    const init = initialStonebridgeProgress('lincoln', 42, NOW)
    expect(init.currentMissionId).toBe(FIRST_MISSION_ID)
    expect(init.completedMissions).toEqual([])
    expect(init.raisedBanners).toEqual([])
    expect(init.missionBaselines[FIRST_MISSION_ID]).toBe(42)
    // Active progress from this baseline is zero.
    const comp = computeMissionProgress(OLD_BRIDGE, 42, init.missionBaselines[FIRST_MISSION_ID])
    expect(comp.current).toBe(0)
  })
})

function freshState(count: number): StonebridgeProgress {
  return initialStonebridgeProgress('lincoln', count, NOW)
}

describe('advanceMissions', () => {
  it('reports no change while the mission is incomplete', () => {
    const state = freshState(0)
    const r = advanceMissions(state, OLD_BRIDGE.target - 1, NOW)
    expect(r.newlyCompleted).toEqual([])
    expect(r.active?.complete).toBe(false)
    expect(r.state.currentMissionId).toBe(OLD_BRIDGE.id)
  })

  it('completes the Old Bridge, raises its banner, and queues the Watchtower', () => {
    const state = freshState(0)
    const r = advanceMissions(state, OLD_BRIDGE.target, NOW)
    expect(r.changed).toBe(true)
    expect(r.newlyCompleted).toEqual([OLD_BRIDGE.id])
    expect(r.state.completedMissions).toEqual([OLD_BRIDGE.id])
    expect(r.state.raisedBanners).toEqual([OLD_BRIDGE.id])
    expect(r.state.currentMissionId).toBe(WATCHTOWER.id)
    // Watchtower baseline carries surplus: baseline + target of old bridge.
    expect(r.state.missionBaselines[WATCHTOWER.id]).toBe(OLD_BRIDGE.target)
    expect(r.active?.missionId).toBe(WATCHTOWER.id)
    expect(r.active?.current).toBe(0)
  })

  it('carries surplus reading actions into the next mission additively', () => {
    const state = freshState(0)
    // 2 actions beyond the Old Bridge target should count toward the Watchtower.
    const r = advanceMissions(state, OLD_BRIDGE.target + 2, NOW)
    expect(r.state.currentMissionId).toBe(WATCHTOWER.id)
    expect(r.active?.current).toBe(2)
  })

  it('cascades through multiple completions when enough surplus exists', () => {
    const state = freshState(0)
    const total = OLD_BRIDGE.target + WATCHTOWER.target
    const r = advanceMissions(state, total, NOW)
    expect(r.newlyCompleted).toEqual([OLD_BRIDGE.id, WATCHTOWER.id])
    expect(r.state.completedMissions).toEqual([OLD_BRIDGE.id, WATCHTOWER.id])
    expect(r.state.raisedBanners).toEqual([OLD_BRIDGE.id, WATCHTOWER.id])
    // Parks on the last defined mission (no further missions in Slice 1).
    expect(r.state.currentMissionId).toBe(WATCHTOWER.id)
  })

  it('is idempotent: re-running on an already-advanced state reports no change', () => {
    const state = freshState(0)
    const first = advanceMissions(state, OLD_BRIDGE.target, NOW)
    const second = advanceMissions(first.state, OLD_BRIDGE.target, NOW)
    expect(second.changed).toBe(false)
    expect(second.newlyCompleted).toEqual([])
    expect(second.state.completedMissions).toEqual([OLD_BRIDGE.id])
  })

  it('does not mutate the input state', () => {
    const state = freshState(0)
    const snapshot = JSON.stringify(state)
    advanceMissions(state, OLD_BRIDGE.target, NOW)
    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('persists NO xp/diamond fields — mission progress only', () => {
    const state = freshState(0)
    const r = advanceMissions(state, OLD_BRIDGE.target, NOW)
    const keys = Object.keys(r.state)
    const banned = ['totalXp', 'xp', 'diamond', 'diamonds', 'diamondBalance', 'sources', 'xpLedger']
    for (const k of keys) {
      expect(banned).not.toContain(k)
    }
    // Spot-check the serialized doc contains no economy words.
    const serialized = JSON.stringify(r.state).toLowerCase()
    expect(serialized).not.toContain('diamond')
    expect(serialized).not.toContain('xp')
  })
})

describe('canon fidelity', () => {
  it('reuses Bible location names verbatim', () => {
    expect(getMission('old_bridge')?.locationName).toBe('The Old Bridge')
    expect(getMission('watchtower')?.locationName).toBe('The Watchtower')
  })

  it('thanks the hero in a canon character voice', () => {
    expect(getMission('old_bridge')?.thankYou.name).toBe('Mara the Builder')
    expect(getMission('watchtower')?.thankYou.name).toBe('Captain Wren')
  })
})
