import { describe, it, expect } from 'vitest'

import {
  HeroPhase,
  nextHeroPhase,
  heroPhaseDurationMs,
  heroPoseFor,
  HERO_MOTION_MS,
  HERO_MOTION_TOTAL_MS,
} from './heroEntranceMotion'
import { HERO_ROAD } from './villageMapLayout'

// ── HeroPhase state machine ──────────────────────────────────────

describe('nextHeroPhase', () => {
  it('transitions armed → entering → waving → settled', () => {
    expect(nextHeroPhase(HeroPhase.Armed)).toBe(HeroPhase.Entering)
    expect(nextHeroPhase(HeroPhase.Entering)).toBe(HeroPhase.Waving)
    expect(nextHeroPhase(HeroPhase.Waving)).toBe(HeroPhase.Settled)
  })

  it('returns null at settled — the sequence is finite', () => {
    expect(nextHeroPhase(HeroPhase.Settled)).toBeNull()
  })

  it('visits every phase exactly once from armed to settled', () => {
    const visited: string[] = []
    let phase: HeroPhase | null = HeroPhase.Armed
    while (phase !== null) {
      visited.push(phase)
      phase = nextHeroPhase(phase)
    }
    expect(visited).toEqual([
      HeroPhase.Armed,
      HeroPhase.Entering,
      HeroPhase.Waving,
      HeroPhase.Settled,
    ])
  })
})

// ── heroPhaseDurationMs ──────────────────────────────────────────

describe('heroPhaseDurationMs', () => {
  it('armed has 0 delay (immediate transition)', () => {
    expect(heroPhaseDurationMs(HeroPhase.Armed)).toBe(0)
  })

  it('entering lasts the walk duration', () => {
    expect(heroPhaseDurationMs(HeroPhase.Entering)).toBe(HERO_MOTION_MS.enter)
  })

  it('waving lasts the wave duration', () => {
    expect(heroPhaseDurationMs(HeroPhase.Waving)).toBe(HERO_MOTION_MS.wave)
  })

  it('settled has no duration (terminal)', () => {
    expect(heroPhaseDurationMs(HeroPhase.Settled)).toBeNull()
  })
})

// ── HERO_MOTION_TOTAL_MS ─────────────────────────────────────────

describe('HERO_MOTION_TOTAL_MS', () => {
  it('is the sum of the two timed phases', () => {
    expect(HERO_MOTION_TOTAL_MS).toBe(HERO_MOTION_MS.enter + HERO_MOTION_MS.wave)
  })

  it('is under 2 seconds (brief entrance)', () => {
    expect(HERO_MOTION_TOTAL_MS).toBeLessThan(2000)
  })
})

// ── heroPoseFor ──────────────────────────────────────────────────

describe('heroPoseFor', () => {
  const running = { running: true, reducedMotion: false }
  const stopped = { running: false, reducedMotion: false }
  const reducedMotion = { running: true, reducedMotion: true }
  const stable = { x: HERO_ROAD.stopX, y: HERO_ROAD.ground, travelMs: 0, waving: false }

  it('settled always returns the stable pose', () => {
    expect(heroPoseFor(HeroPhase.Settled, running)).toEqual(stable)
  })

  it('armed starts at the road start with no travel', () => {
    const pose = heroPoseFor(HeroPhase.Armed, running)
    expect(pose.x).toBe(HERO_ROAD.startX)
    expect(pose.y).toBe(HERO_ROAD.startGround)
    expect(pose.travelMs).toBe(0)
    expect(pose.waving).toBe(false)
  })

  it('entering moves to the stop with a travel duration', () => {
    const pose = heroPoseFor(HeroPhase.Entering, running)
    expect(pose.x).toBe(HERO_ROAD.stopX)
    expect(pose.y).toBe(HERO_ROAD.ground)
    expect(pose.travelMs).toBe(HERO_MOTION_MS.enter)
    expect(pose.waving).toBe(false)
  })

  it('waving is at the stop with waving=true', () => {
    const pose = heroPoseFor(HeroPhase.Waving, running)
    expect(pose.x).toBe(HERO_ROAD.stopX)
    expect(pose.y).toBe(HERO_ROAD.ground)
    expect(pose.travelMs).toBe(0)
    expect(pose.waving).toBe(true)
  })

  it('returns stable pose when not running', () => {
    expect(heroPoseFor(HeroPhase.Armed, stopped)).toEqual(stable)
    expect(heroPoseFor(HeroPhase.Entering, stopped)).toEqual(stable)
    expect(heroPoseFor(HeroPhase.Waving, stopped)).toEqual(stable)
  })

  it('returns stable pose under reduced motion', () => {
    expect(heroPoseFor(HeroPhase.Armed, reducedMotion)).toEqual(stable)
    expect(heroPoseFor(HeroPhase.Entering, reducedMotion)).toEqual(stable)
    expect(heroPoseFor(HeroPhase.Waving, reducedMotion)).toEqual(stable)
  })
})
