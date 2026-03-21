import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ParticleDef {
  angle: number
  distance: number
  delay: number
  size: number
  shape: 'square' | 'diamond' | 'star' | 'spark'
  color: string
}

interface ParticlesProps {
  /** Center X (viewport coords) */
  x: number
  /** Center Y (viewport coords) */
  y: number
  themeStyle: 'minecraft' | 'platformer'
  tier: string
  onDone?: () => void
}

function generateParticles(themeStyle: 'minecraft' | 'platformer', tier: string): ParticleDef[] {
  const count = 7
  const particles: ParticleDef[] = []

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    const distance = 24 + (i % 3) * 10
    const delay = (i % 4) * 20

    let shape: ParticleDef['shape']
    let color: string

    if (themeStyle === 'minecraft') {
      if (tier === 'diamond') {
        shape = 'diamond'
        color = i % 2 === 0 ? '#4FC3F7' : '#FFD700'
      } else if (tier === 'netherite') {
        shape = 'spark'
        color = i % 2 === 0 ? '#9C27B0' : '#CE93D8'
      } else {
        shape = 'square'
        color = i % 2 === 0 ? '#8B7355' : '#C4A46B'
      }
    } else {
      // platformer — stars in pastel colors
      shape = 'star'
      const pastels = ['#FF9EBC', '#FFD700', '#B39DDB', '#80DEEA', '#FFAB91']
      color = pastels[i % pastels.length]
    }

    particles.push({ angle, distance, delay, size: themeStyle === 'platformer' ? 6 : 4, shape, color })
  }
  return particles
}

function getShapePath(shape: ParticleDef['shape'], size: number): string {
  const h = size / 2
  switch (shape) {
    case 'square':
      return `M${-h},${-h} h${size} v${size} h${-size} Z`
    case 'diamond':
      return `M0,${-h} L${h},0 L0,${h} L${-h},0 Z`
    case 'star': {
      // 5-point star
      const pts: string[] = []
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? h : h * 0.45
        const a = (i * Math.PI) / 5 - Math.PI / 2
        pts.push(`${r * Math.cos(a)},${r * Math.sin(a)}`)
      }
      return `M${pts.join('L')}Z`
    }
    case 'spark':
      return `M0,${-h * 2} L${h * 0.4},0 L0,${h * 2} L${-h * 0.4},0 Z`
  }
}

export default function Particles({ x, y, themeStyle, tier, onDone }: ParticlesProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const particles = generateParticles(themeStyle, tier)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const svgs = container.querySelectorAll<SVGElement>('.particle-shape')
    const animations: Animation[] = []

    svgs.forEach((el, i) => {
      const p = particles[i]
      const dx = Math.cos(p.angle) * p.distance
      const dy = Math.sin(p.angle) * p.distance

      const anim = el.animate(
        [
          { transform: 'translate(0,0)', opacity: '1' },
          { transform: `translate(${dx}px,${dy}px)`, opacity: '0' },
        ],
        {
          duration: 420,
          delay: p.delay,
          easing: 'ease-out',
          fill: 'forwards',
        },
      )
      animations.push(anim)
    })

    const last = animations[animations.length - 1]
    if (last) {
      last.onfinish = () => { onDone?.() }
    }

    return () => { animations.forEach((a) => a.cancel()) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <svg width="1" height="1" overflow="visible" style={{ position: 'absolute', top: 0, left: 0 }}>
        {particles.map((p, i) => (
          <path
            key={i}
            className="particle-shape"
            d={getShapePath(p.shape, p.size)}
            fill={p.color}
          />
        ))}
      </svg>
    </div>,
    document.body,
  )
}
