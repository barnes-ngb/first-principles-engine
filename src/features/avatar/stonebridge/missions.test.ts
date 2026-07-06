import { describe, expect, it } from 'vitest'

import {
  FIRST_MISSION_ID,
  getMission,
  getNextMission,
  STONEBRIDGE_MISSIONS,
} from './missions'

// ── STONEBRIDGE_MISSIONS data integrity ───────────────────────

describe('STONEBRIDGE_MISSIONS', () => {
  it('has 7 ordered missions', () => {
    expect(STONEBRIDGE_MISSIONS).toHaveLength(7)
  })

  it('every mission has a unique id', () => {
    const ids = STONEBRIDGE_MISSIONS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('targets escalate monotonically (5 → 6 → 8 → 10 → 12 → 15 → 18)', () => {
    const targets = STONEBRIDGE_MISSIONS.map((m) => m.target)
    expect(targets).toEqual([5, 6, 8, 10, 12, 15, 18])
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i]).toBeGreaterThan(targets[i - 1])
    }
  })

  it('every mission has required fields', () => {
    for (const m of STONEBRIDGE_MISSIONS) {
      expect(m.id).toBeTruthy()
      expect(m.locationName).toBeTruthy()
      expect(m.title).toBeTruthy()
      expect(m.framing).toBeTruthy()
      expect(m.target).toBeGreaterThan(0)
      expect(m.art.emoji).toBeTruthy()
      expect(m.art.bannerEmoji).toBeTruthy()
      expect(m.art.accent).toMatch(/^#/)
      expect(m.thankYou.name).toBeTruthy()
      expect(m.thankYou.line).toBeTruthy()
    }
  })

  it('every mission has a formation beat', () => {
    for (const m of STONEBRIDGE_MISSIONS) {
      expect(m.formationBeat).toBeDefined()
      expect(m.formationBeat!.name).toBeTruthy()
      expect(m.formationBeat!.line).toBeTruthy()
    }
  })

  it('first mission is the Old Bridge, last is Banner Hall', () => {
    expect(STONEBRIDGE_MISSIONS[0].id).toBe('old_bridge')
    expect(STONEBRIDGE_MISSIONS[6].id).toBe('banner_hall')
  })
})

// ── FIRST_MISSION_ID ──────────────────────────────────────────

describe('FIRST_MISSION_ID', () => {
  it('equals the first mission id', () => {
    expect(FIRST_MISSION_ID).toBe('old_bridge')
    expect(FIRST_MISSION_ID).toBe(STONEBRIDGE_MISSIONS[0].id)
  })
})

// ── getMission ────────────────────────────────────────────────

describe('getMission', () => {
  it('returns a mission by id', () => {
    const mission = getMission('old_bridge')
    expect(mission).toBeDefined()
    expect(mission!.locationName).toBe('The Old Bridge')
    expect(mission!.target).toBe(5)
  })

  it('returns the last mission by id', () => {
    const mission = getMission('banner_hall')
    expect(mission).toBeDefined()
    expect(mission!.target).toBe(18)
  })

  it('returns undefined for unknown id', () => {
    expect(getMission('nonexistent')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(getMission('')).toBeUndefined()
  })
})

// ── getNextMission ────────────────────────────────────────────

describe('getNextMission', () => {
  it('returns the next mission in sequence', () => {
    const next = getNextMission('old_bridge')
    expect(next).not.toBeNull()
    expect(next!.id).toBe('watchtower')
  })

  it('walks the full mission chain', () => {
    const ids = STONEBRIDGE_MISSIONS.map((m) => m.id)
    for (let i = 0; i < ids.length - 1; i++) {
      const next = getNextMission(ids[i])
      expect(next).not.toBeNull()
      expect(next!.id).toBe(ids[i + 1])
    }
  })

  it('returns null for the last mission (banner_hall)', () => {
    expect(getNextMission('banner_hall')).toBeNull()
  })

  it('returns null for unknown id', () => {
    expect(getNextMission('nonexistent')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(getNextMission('')).toBeNull()
  })
})
