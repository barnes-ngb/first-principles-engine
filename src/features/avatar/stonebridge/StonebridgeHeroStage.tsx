/** One finite, decorative entrance on the visible road. No building action waits for it. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import useMediaQuery from '@mui/material/useMediaQuery'

import StonebridgeHero from './StonebridgeHero'
import type { HeroAppearance } from './heroAppearance'
import { HeroPhase, heroPhaseDurationMs, heroPoseFor, nextHeroPhase } from './heroEntranceMotion'
import { HERO_FIGURE, HERO_ROAD, MAP_HEIGHT, MAP_WIDTH } from './villageMapLayout'

interface StonebridgeHeroStageProps {
  appearance: HeroAppearance
  /** Stable through incidental snapshots, fresh on identity/read movement. */
  exposureKey: string
  exposed: boolean
}

export default function StonebridgeHeroStage({ appearance, exposureKey, exposed }: StonebridgeHeroStageProps) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [corridor, setCorridor] = useState<SVGRectElement | null>(null)
  const [visibility, setVisibility] = useState<{ node: SVGRectElement; visible: boolean } | null>(null)
  const [documentVisible, setDocumentVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const onChange = () => setDocumentVisible(!document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  // Observe the painted travel corridor: the map's top being visible says
  // nothing about the hero near its bottom.
  useEffect(() => {
    if (!corridor || typeof IntersectionObserver === 'undefined') return
    let live = true
    const observer = new IntersectionObserver((entries) => {
      if (!live || !corridor.isConnected) return
      const entry = entries.find((candidate) => candidate.target === corridor)
      if (entry) setVisibility({ node: corridor, visible: entry.isIntersecting && entry.intersectionRatio >= 0.99 })
    }, { threshold: [0, 0.99, 1] })
    observer.observe(corridor)
    return () => { live = false; observer.disconnect() }
  }, [corridor])
  const onScreen = typeof IntersectionObserver === 'undefined'
    || (visibility?.node === corridor && visibility?.visible === true)
  const running = exposed && documentVisible && onScreen && !reduceMotion

  const [phase, setPhase] = useState<{ key: string; value: HeroPhase }>(() => ({ key: exposureKey, value: HeroPhase.Armed }))
  if (phase.key !== exposureKey) setPhase({ key: exposureKey, value: HeroPhase.Armed })
  // An interrupted entrance is consumed, with no replay on opening a modal/tab.
  else if (!running && (phase.value === HeroPhase.Entering || phase.value === HeroPhase.Waving)) {
    setPhase({ key: exposureKey, value: HeroPhase.Settled })
  }
  const current = phase.key === exposureKey ? phase.value : HeroPhase.Armed
  const generation = useRef(0)

  useLayoutEffect(() => {
    const run = ++generation.current
    if (!running) return
    const next = nextHeroPhase(current)
    const delay = heroPhaseDurationMs(current)
    if (next === null || delay === null) return
    let live = true
    let timer: number | undefined
    let frame: number | undefined
    const advance = () => {
      if (!live || generation.current !== run || document.hidden) return
      setPhase((previous) => previous.key === exposureKey && previous.value === current
        ? { key: exposureKey, value: next } : previous)
    }
    if (current === HeroPhase.Armed) {
      // Allow the start pose to paint before changing its transform.
      frame = requestAnimationFrame(() => {
        if (!live || generation.current !== run) return
        frame = requestAnimationFrame(advance)
      })
    } else {
      timer = window.setTimeout(advance, delay)
    }
    return () => {
      live = false
      generation.current += 1
      if (timer !== undefined) window.clearTimeout(timer)
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [running, current, exposureKey])

  const pose = heroPoseFor(current, { running, reducedMotion: reduceMotion })
  return (
    <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} preserveAspectRatio="xMidYMid meet"
      width="100%" height="100%" aria-hidden="true" focusable="false"
      data-testid="hero-stage" data-hero-phase={current} data-hero-running={running ? 'true' : 'false'}
      data-hero-x={pose.x} data-hero-y={pose.y} data-hero-travel-ms={pose.travelMs} data-hero-waving={pose.waving ? 'true' : 'false'}
      style={{ position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' }}>
      <rect ref={setCorridor} data-testid="hero-corridor" x={HERO_ROAD.startX - HERO_FIGURE.width / 2}
        y={HERO_ROAD.startGround - HERO_FIGURE.height}
        width={HERO_ROAD.stopX - HERO_ROAD.startX + HERO_FIGURE.width}
        height={HERO_ROAD.ground - HERO_ROAD.startGround + HERO_FIGURE.height + HERO_FIGURE.belowFeet} fill="transparent" />
      <g data-testid="hero-walker" style={{
        visibility: onScreen || reduceMotion ? 'visible' : 'hidden',
        transform: `translate(${pose.x}px, ${pose.y}px)`,
        transition: pose.travelMs > 0 ? `transform ${pose.travelMs}ms linear` : 'none',
      }}>
        <StonebridgeHero appearance={appearance} waving={pose.waving}
          walking={running && current === HeroPhase.Entering} />
      </g>
    </svg>
  )
}
