import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import type { ArmorPiece } from '../../core/types/domain'
import type { ArmorTierColor } from './icons/ArmorIcons'
import { ArmorIcon } from './icons/ArmorIcons'

export interface AttachAnimState {
  pieceId: ArmorPiece
  tier: ArmorTierColor
  launchRect: DOMRect
  /** Landing center point in viewport coords */
  landingCenter: { x: number; y: number }
}

interface AttachAnimationProps extends AttachAnimState {
  onComplete: () => void
}

export default function AttachAnimation({
  pieceId,
  tier,
  launchRect,
  landingCenter,
  onComplete,
}: AttachAnimationProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Compute start position: center of launch rect
  const startX = launchRect.left + launchRect.width / 2
  const startY = launchRect.top + launchRect.height / 2

  // Arc height proportional to distance
  const dy = landingCenter.y - startY
  const dx = landingCenter.x - startX
  const dist = Math.sqrt(dx * dx + dy * dy)
  const arcHeight = dist * 0.5 + 60

  // Midpoint
  const midX = (startX + landingCenter.x) / 2
  const midY = Math.min(startY, landingCenter.y) - arcHeight

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Translate: keyframes are relative to the container which is positioned at startX, startY
    const kf: Keyframe[] = [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: '1', offset: 0 },
      {
        transform: `translate(calc(-50% + ${midX - startX}px), calc(-50% + ${midY - startY}px)) scale(1.2)`,
        opacity: '1',
        offset: 0.45,
      },
      {
        transform: `translate(calc(-50% + ${landingCenter.x - startX}px), calc(-50% + ${landingCenter.y - startY}px)) scale(0.8)`,
        opacity: '0.9',
        offset: 1,
      },
    ]

    const anim = container.animate(kf, {
      duration: 600,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      fill: 'forwards',
    })

    anim.onfinish = () => {
      onComplete()
    }

    return () => { anim.cancel() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: startX,
        top: startY,
        width: 48,
        height: 48,
        pointerEvents: 'none',
        zIndex: 9998,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <ArmorIcon pieceId={pieceId} tier={tier} size={48} />
    </div>,
    document.body,
  )
}
