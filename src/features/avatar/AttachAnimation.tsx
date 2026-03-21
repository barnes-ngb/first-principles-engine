import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import type { ArmorPiece } from '../../core/types'
import type { ArmorTierColor } from './icons/ArmorIcons'

export interface AttachAnimState {
  pieceId: ArmorPiece
  tier: ArmorTierColor
  /** Bounding rect of the body region on the character display */
  regionRect: DOMRect
  /** Landing center point in viewport coords */
  landingCenter: { x: number; y: number }
}

interface AttachAnimationProps extends AttachAnimState {
  onComplete: () => void
}

/**
 * Materialize-inward animation: particles converge from outside the region
 * boundary toward the center, while the piece overlay fades in.
 */
export default function AttachAnimation({
  pieceId,
  tier,
  regionRect,
  landingCenter,
  onComplete,
}: AttachAnimationProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const centerX = regionRect.left + regionRect.width / 2
  const centerY = regionRect.top + regionRect.height / 2
  const particleCount = 24

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Generate particles around the perimeter converging inward
    const particles = Array.from({ length: particleCount }, (_, i) => {
      const angle = (i / particleCount) * Math.PI * 2
      const radius = Math.max(regionRect.width, regionRect.height) * 0.8
      return {
        startX: Math.cos(angle) * radius,
        startY: Math.sin(angle) * radius,
        endX: (Math.random() - 0.5) * regionRect.width * 0.3,
        endY: (Math.random() - 0.5) * regionRect.height * 0.3,
      }
    })

    // Determine particle color by tier
    const getColor = (idx: number): string => {
      if (tier === 'diamond') return idx % 2 === 0 ? '#4FC3F7' : '#FFD700'
      if (tier === 'netherite') return idx % 2 === 0 ? '#9C27B0' : '#CE93D8'
      if (tier === 'basic') return '#FF9EBC'
      if (tier === 'powerup') return '#B39DDB'
      if (tier === 'champion') return '#FFD700'
      // stone default
      return idx % 2 === 0 ? '#8B7355' : '#C4A46B'
    }

    // Determine particle shape by tier
    const getShape = (): string => {
      if (tier === 'diamond') return 'rotateZ(45deg)'
      if (tier === 'netherite') return 'rotateZ(30deg)'
      return ''
    }

    const svgs = container.querySelectorAll<HTMLElement>('.mat-particle')
    const animations: Animation[] = []

    svgs.forEach((el, i) => {
      const p = particles[i]
      el.style.backgroundColor = getColor(i)
      if (getShape()) el.style.transform = getShape()

      const anim = el.animate(
        [
          {
            transform: `translate(${p.startX}px, ${p.startY}px) scale(1.2)`,
            opacity: '1',
          },
          {
            transform: `translate(${p.endX}px, ${p.endY}px) scale(0.3)`,
            opacity: '0',
          },
        ],
        {
          duration: 600,
          delay: Math.random() * 100,
          easing: 'ease-in',
          fill: 'forwards',
        },
      )
      animations.push(anim)
    })

    // Simultaneously fade in the piece overlay on the character
    const overlayEl = document.querySelector(`[data-piece-id="${pieceId}"]`) as HTMLElement
    if (overlayEl) {
      overlayEl.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 600, easing: 'ease-in', fill: 'forwards' },
      )
    }

    // Complete after animation
    const timer = setTimeout(onComplete, 700)

    return () => {
      clearTimeout(timer)
      animations.forEach((a) => a.cancel())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Particle size
  const pSize = tier === 'diamond' || tier === 'netherite' ? 5 : 4

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: centerX,
        top: centerY,
        pointerEvents: 'none',
        zIndex: 9998,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {Array.from({ length: particleCount }, (_, i) => (
        <div
          key={i}
          className="mat-particle"
          style={{
            position: 'absolute',
            width: pSize,
            height: pSize,
            borderRadius: tier === 'diamond' ? 0 : 1,
          }}
        />
      ))}
    </div>,
    document.body,
  )
}
