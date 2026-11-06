/**
 * The hero's layer on the map, and the one owner of its motion.
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 *
 * Draws the child's saved hero on the village picture and plays ONE entrance per
 * exposure: a brief walk along the Square-to-bridge road, one wave, then a
 * stable standing pose. `heroEntranceMotion.ts` owns the sequence and the
 * durations; this owns the clock, the exposure gate and the layer.
 *
 * ── It is decorative, and that is structural ─────────────────────────────────
 *
 * The layer is a SIBLING of the drawing and of the tap-target layer, is
 * `aria-hidden`, carries `pointer-events: none`, holds no control, no focus
 * target and no live region, and is drawn on a stretch of road that is not any
 * place's target (`villageMapLayout`'s `HERO_ROAD` / `heroFigureBox`, asserted
 * against every target rect by the geometry test). So:
 *
 *   • tapping a building opens that place's dialog **immediately** — the motion
 *     neither delays it nor is waited for, and because the dialog covers the map
 *     there is no visible travel to a building and none is claimed;
 *   • the 44px native targets, the Places list, the one-active-control-set rule
 *     and the focus registry are untouched;
 *   • nothing here announces anything, so there is no repeated announcement.
 *
 * ── What stops it ────────────────────────────────────────────────────────────
 *
 * `exposed` is the caller's gate — the map is the live view, no location visit,
 * replay or celebration is open, the scope is settled and the read is healthy.
 * On top of that this component watches the **document's visibility** and its
 * own **intersection with the viewport**. Any of those going false:
 *
 *   • puts the figure in the stable pose with no transition and no wave
 *     (`heroPoseFor`), which is also exactly what a reduced-motion preference
 *     gets; and
 *   • **clears the timer**, so nothing ticks while the map is hidden, scrolled
 *     away, behind a dialog or showing the places list. No RAF is used at all.
 *
 * A completion that belongs to a previous exposure is refused by the setter's
 * own key check, so a child switch, a retry or a scope movement can never be
 * walked into by the exposure before it. One entrance is at most
 * `HERO_MOTION_TOTAL_MS`; the sequence ends at `settled` and has no successor,
 * so there is no idle loop and no second movement control.
 */
import { useEffect, useState } from 'react'
import useMediaQuery from '@mui/material/useMediaQuery'

import StonebridgeHero from './StonebridgeHero'
import type { HeroAppearance } from './heroAppearance'
import { HeroPhase, heroPhaseDurationMs, heroPoseFor, nextHeroPhase } from './heroEntranceMotion'
import { HERO_ROAD, MAP_HEIGHT, MAP_WIDTH } from './villageMapLayout'

interface StonebridgeHeroStageProps {
  appearance: HeroAppearance
  /**
   * One exposure of one child's read.
   *
   * A change is a fresh entrance; the same value re-rendered is not. It comes
   * from the town's own profile read, which deliberately does not move it when a
   * new snapshot of the same document arrives — so an incidental write cannot
   * make the hero walk in again.
   */
  exposureKey: string
  /** The map is live and healthy, and nothing is covering it. */
  exposed: boolean
}

export default function StonebridgeHeroStage({
  appearance,
  exposureKey,
  exposed,
}: StonebridgeHeroStageProps) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  /** The layer's own node, so the observer below has something to watch. */
  const [stage, setStage] = useState<SVGSVGElement | null>(null)

  /** Is the tab in front of the child at all? */
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  )
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onChange = () => setDocumentVisible(!document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  /**
   * Is the map actually on screen?
   *
   * `null` is "not known yet", and it draws nothing: a hero that appeared in
   * the stable pose and then jumped back to walk in would be a flicker. Where
   * the browser has no `IntersectionObserver` the answer is `true` — the
   * fallback is "visible", because the alternative is a feature that never
   * appears at all.
   */
  const [onScreen, setOnScreen] = useState<boolean | null>(() =>
    typeof IntersectionObserver === 'undefined' ? true : null,
  )
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    if (!stage) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (entry) setOnScreen(entry.isIntersecting)
      },
      // A sliver is enough to count as "the child can see the village".
      { threshold: 0.2 },
    )
    observer.observe(stage)
    return () => observer.disconnect()
  }, [stage])

  const [phase, setPhase] = useState<{ key: string; value: HeroPhase }>(() => ({
    key: exposureKey,
    value: HeroPhase.Armed,
  }))
  // Render-phase, conditional, converging: a fresh exposure starts from the
  // beginning and no frame of it is drawn with the previous one's phase.
  if (phase.key !== exposureKey) setPhase({ key: exposureKey, value: HeroPhase.Armed })
  const current = phase.key === exposureKey ? phase.value : HeroPhase.Armed

  const running = exposed && documentVisible && onScreen === true

  useEffect(() => {
    // Nothing ticks unless the hero is on screen and the child asked for motion.
    if (!running || reduceMotion) return
    const next = nextHeroPhase(current)
    const delay = heroPhaseDurationMs(current)
    if (next === null || delay === null) return
    const key = exposureKey
    const timer = window.setTimeout(() => {
      // The completion names the exposure that scheduled it. A timer that
      // somehow outlives its exposure advances nothing.
      setPhase((prev) => (prev.key === key ? { key, value: next } : prev))
    }, delay)
    return () => window.clearTimeout(timer)
  }, [running, reduceMotion, current, exposureKey])

  const pose = heroPoseFor(current, { running, reducedMotion: reduceMotion })
  /** Not known yet whether the map is on screen: the layer mounts, empty. */
  const drawable = onScreen !== null

  return (
    <svg
      ref={setStage}
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      // Decorative, and unable to take a tap meant for a place.
      aria-hidden="true"
      focusable="false"
      data-testid="hero-stage"
      data-hero-phase={current}
      data-hero-running={running ? 'true' : 'false'}
      data-hero-x={pose.x}
      data-hero-travel-ms={pose.travelMs}
      data-hero-waving={pose.waving ? 'true' : 'false'}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'block',
        // The one line that makes the hero unable to intercept a tap: every
        // place's target is a sibling button underneath this layer.
        pointerEvents: 'none',
      }}
    >
      {drawable && (
        <g
          data-testid="hero-walker"
          style={{
            transform: `translate(${pose.x}px, ${HERO_ROAD.ground}px)`,
            transition: pose.travelMs > 0 ? `transform ${pose.travelMs}ms linear` : 'none',
          }}
        >
          <StonebridgeHero appearance={appearance} waving={pose.waving} />
        </g>
      )}
    </svg>
  )
}
