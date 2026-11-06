/**
 * The hero's entrance — its phases, its durations and the pose each one draws.
 *
 * Pure data and pure functions: no React, no timers, no DOM. The component owns
 * the clock; this owns what the clock means, so the sequence can be asserted
 * without rendering and the component cannot invent a fifth phase or an
 * unbounded one.
 *
 * ── The shape of the motion, and its limits ──────────────────────────────────
 *
 * One **brief entrance walk** along the Square-to-bridge road, then **one
 * wave**, then a **stable standing pose**. It is finite by construction:
 * `nextHeroPhase` ends at `settled` and `settled` has no successor, so there is
 * no idle loop, no repeat and nothing to turn off. It is decorative — the
 * village's buildings, places, visits and doors do not wait for it, are not
 * delayed by it and are not covered by it.
 *
 * What it is NOT: it is not travel to a building. Tapping a place opens that
 * place's dialog immediately, which covers the map — so there is no visible
 * walk to a building and this module deliberately provides no path to one.
 */
import { HERO_ROAD } from './villageMapLayout'

export const HeroPhase = {
  /** Exposed, not started. Drawn at the start of the road for a frame. */
  Armed: 'armed',
  /** Walking in: the one translation, over {@link HERO_MOTION_MS}`.enter`. */
  Entering: 'entering',
  /** Standing at the stop and waving once. */
  Waving: 'waving',
  /** Standing still. The end of the sequence, and the pose everything falls back to. */
  Settled: 'settled',
} as const
export type HeroPhase = (typeof HeroPhase)[keyof typeof HeroPhase]

/**
 * How long each phase lasts, in milliseconds.
 *
 * Short on purpose: the whole sequence is {@link HERO_MOTION_TOTAL_MS}, which is
 * under two seconds, and nothing a child can tap is held for any of it.
 */
export const HERO_MOTION_MS = {
  /** The walk. Also the CSS transition duration for the figure's x. */
  enter: 1200,
  /** The wave — two passes of a 350ms arm swing. */
  wave: 700,
} as const

/** The bound: one entrance is at most this long, start to standing still. */
export const HERO_MOTION_TOTAL_MS = HERO_MOTION_MS.enter + HERO_MOTION_MS.wave

/** The next phase, or `null` where the sequence is over. */
export function nextHeroPhase(phase: HeroPhase): HeroPhase | null {
  switch (phase) {
    case HeroPhase.Armed:
      return HeroPhase.Entering
    case HeroPhase.Entering:
      return HeroPhase.Waving
    case HeroPhase.Waving:
      return HeroPhase.Settled
    case HeroPhase.Settled:
      return null
  }
}

/** How long to wait before {@link nextHeroPhase}, or `null` for "never". */
export function heroPhaseDurationMs(phase: HeroPhase): number | null {
  switch (phase) {
    // Armed advances on the next tick: the figure is placed at the start of the
    // road and the walk begins from there, so the walk is a real transition
    // rather than a jump the browser coalesces into nothing.
    case HeroPhase.Armed:
      return 0
    case HeroPhase.Entering:
      return HERO_MOTION_MS.enter
    case HeroPhase.Waving:
      return HERO_MOTION_MS.wave
    case HeroPhase.Settled:
      return null
  }
}

/** Where the figure is drawn, and how it gets there. */
export interface HeroPose {
  /** Map-x of the figure's centre. */
  x: number
  /** CSS transition duration for that x, in ms. `0` is "no movement". */
  travelMs: number
  /** Draw the one wave. */
  waving: boolean
}

/**
 * The pose for a phase — the ONE place "what is drawn" is decided.
 *
 * `running` is the exposure gate the component feeds in: the map is on screen,
 * nothing covers it, the read is healthy. When it is false — hidden tab, the
 * map scrolled out of view, the Places list, an open location visit, a replay,
 * a celebration, a loading or failed read, an unsettled scope — the pose is the
 * **stable standing pose** with no movement and no wave, which is the same thing
 * a reduced-motion preference asks for. The component additionally runs no
 * timer in that state, so nothing ticks out of sight.
 */
export function heroPoseFor(
  phase: HeroPhase,
  options: { running: boolean; reducedMotion: boolean },
): HeroPose {
  const stable: HeroPose = { x: HERO_ROAD.stopX, travelMs: 0, waving: false }
  if (!options.running || options.reducedMotion) return stable
  switch (phase) {
    case HeroPhase.Armed:
      return { x: HERO_ROAD.startX, travelMs: 0, waving: false }
    case HeroPhase.Entering:
      return { x: HERO_ROAD.stopX, travelMs: HERO_MOTION_MS.enter, waving: false }
    case HeroPhase.Waving:
      return { x: HERO_ROAD.stopX, travelMs: 0, waving: true }
    case HeroPhase.Settled:
      return stable
  }
}
