import { forwardRef, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

import type { ArmorPiece, AvatarProfile } from '../../core/types/domain'
import { ARMOR_PIECES } from '../../core/types/domain'
import { isPieceEarned, PIECE_OVERLAY_POSITIONS } from './armorUtils'

// ── Helpers ───────────────────────────────────────────────────────

function getPieceImageUrl(
  profile: AvatarProfile,
  pieceId: ArmorPiece,
): string | undefined {
  const entry = profile.pieces.find((p) => p.pieceId === pieceId)
  if (!entry) return undefined
  const tier = profile.currentTier
  return (entry.generatedImageUrls as Record<string, string | undefined>)[tier]
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

// Progressive glow by piece count
function getGlowFilter(count: number, isLincoln: boolean): string {
  if (count === 0) return 'none'
  const baseColor = isLincoln ? '255, 220, 100' : '232, 160, 191'
  if (count === 6) {
    return isLincoln
      ? 'drop-shadow(0 0 12px gold) drop-shadow(0 0 28px rgba(255,200,50,0.55))'
      : 'drop-shadow(0 0 12px #E8A0BF) drop-shadow(0 0 28px rgba(232,160,191,0.6))'
  }
  const spread = 4 + count * 3
  const alpha = 0.15 + count * 0.12
  return `drop-shadow(0 0 ${spread}px rgba(${baseColor},${alpha}))`
}

// Pose shift per piece
const POSE_SHIFT: Record<ArmorPiece, string> = {
  helmet_of_salvation:          'weightNudgeDown',
  breastplate_of_righteousness: 'weightNudgeUp',
  belt_of_truth:                'weightNudgeUp',
  shield_of_faith:              'weightNudgeLeft',
  sword_of_the_spirit:          'weightNudgeRight',
  shoes_of_peace:               'weightNudgeDrop',
}

// ── Component ─────────────────────────────────────────────────────

interface CharacterDisplayProps {
  profile: AvatarProfile
  appliedPieces: ArmorPiece[]
  height?: string | number
  /** When set, triggers landing bounce + pose shift for this piece */
  lastAppliedPiece?: ArmorPiece | null
}

const CharacterDisplay = forwardRef<HTMLDivElement, CharacterDisplayProps>(
  function CharacterDisplay(
    { profile, appliedPieces, height = '55vw', lastAppliedPiece },
    ref,
  ) {
    const isLincoln = profile.themeStyle === 'minecraft'
    const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
    const reducedMotion = useReducedMotion()

    const appliedCount = appliedPieces.length
    const earnedCount = ARMOR_PIECES.filter((p) => isPieceEarned(profile, p.id)).length
    const allApplied = earnedCount > 0 && appliedCount >= earnedCount

    // ── Animation state ──────────────────────────────────────────
    const [bouncingPiece, setBouncingPiece] = useState<ArmorPiece | null>(null)
    const [flashActive, setFlashActive] = useState(false)
    const [poseAnim, setPoseAnim] = useState<string | null>(null)

    useEffect(() => {
      if (!lastAppliedPiece || reducedMotion) return

      const t0 = setTimeout(() => {
        setBouncingPiece(lastAppliedPiece)
        setFlashActive(true)
      }, 0)

      const t1 = setTimeout(() => {
        setFlashActive(false)
        setPoseAnim(POSE_SHIFT[lastAppliedPiece])
      }, 100)

      const t2 = setTimeout(() => {
        setBouncingPiece(null)
      }, 500)

      const t3 = setTimeout(() => {
        setPoseAnim(null)
      }, 700)

      return () => {
        clearTimeout(t0)
        clearTimeout(t1)
        clearTimeout(t2)
        clearTimeout(t3)
      }
    }, [lastAppliedPiece, reducedMotion])

    const glowFilter = getGlowFilter(appliedCount, isLincoln)

    return (
      <Box
        ref={ref}
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 320,
          mx: 'auto',
          height,
          maxHeight: 380,
          borderRadius: isLincoln ? 0 : 3,
          border: `2px solid ${accentColor}`,
          overflow: 'hidden',
          bgcolor: isLincoln ? '#0d1117' : '#f0f7ff',
          // Full armor glow on the container border
          ...(allApplied && !reducedMotion
            ? { boxShadow: `0 0 20px 4px ${isLincoln ? 'rgba(255,220,100,0.5)' : 'rgba(232,160,191,0.5)'}` }
            : {}),
          transition: 'box-shadow 800ms ease-out',
          // Pose shift animations
          ...(poseAnim && !reducedMotion
            ? {
                animation: `${poseAnim} 500ms ease-in-out`,
                [`@keyframes weightNudgeDown`]: {
                  '0%':   { transform: 'translateY(0) rotate(0deg)' },
                  '25%':  { transform: 'translateY(3px) rotate(0.3deg)' },
                  '60%':  { transform: 'translateY(-1px) rotate(-0.2deg)' },
                  '100%': { transform: 'translateY(0) rotate(0deg)' },
                },
                [`@keyframes weightNudgeUp`]: {
                  '0%':   { transform: 'scaleY(1)' },
                  '25%':  { transform: 'scaleY(0.97)' },
                  '60%':  { transform: 'scaleY(1.01)' },
                  '100%': { transform: 'scaleY(1)' },
                },
                [`@keyframes weightNudgeLeft`]: {
                  '0%':   { transform: 'translateX(0) rotate(0deg)' },
                  '25%':  { transform: 'translateX(-4px) rotate(-0.5deg)' },
                  '60%':  { transform: 'translateX(2px) rotate(0.3deg)' },
                  '100%': { transform: 'translateX(0) rotate(0deg)' },
                },
                [`@keyframes weightNudgeRight`]: {
                  '0%':   { transform: 'translateX(0) rotate(0deg)' },
                  '25%':  { transform: 'translateX(4px) rotate(0.5deg)' },
                  '60%':  { transform: 'translateX(-2px) rotate(-0.3deg)' },
                  '100%': { transform: 'translateX(0) rotate(0deg)' },
                },
                [`@keyframes weightNudgeDrop`]: {
                  '0%':   { transform: 'translateY(0)' },
                  '25%':  { transform: 'translateY(2px)' },
                  '60%':  { transform: 'translateY(-1px)' },
                  '100%': { transform: 'translateY(0)' },
                },
              }
            : {}),
          // All-applied idle sway
          ...(allApplied && !reducedMotion
            ? {
                '@keyframes idleSway': {
                  '0%':   { transform: 'translateX(0)' },
                  '50%':  { transform: 'translateX(1px)' },
                  '100%': { transform: 'translateX(0)' },
                },
                // Only apply when no pose animation is active
                ...(poseAnim ? {} : { animation: 'idleSway 3s ease-in-out infinite' }),
              }
            : {}),
        }}
      >
        {/* Base character layer — photo transform takes priority */}
        {(profile.photoTransformUrl ?? profile.baseCharacterUrl) ? (
          <Box
            component="img"
            src={profile.photoTransformUrl ?? profile.baseCharacterUrl}
            alt="Your character"
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              imageRendering: isLincoln ? 'pixelated' : 'auto',
              // Progressive glow on image silhouette
              filter: !reducedMotion ? glowFilter : 'none',
              transition: 'filter 800ms ease-out',
              // Flash on landing
              ...(flashActive && !reducedMotion
                ? {
                    animation: 'charFlash 300ms ease-out',
                    '@keyframes charFlash': {
                      '0%':   { filter: `brightness(2.5) saturate(0)` },
                      '100%': { filter: glowFilter },
                    },
                  }
                : {}),
              // Shimmer when all applied
              ...(allApplied && !reducedMotion
                ? {
                    '@keyframes shimmer': {
                      '0%':   { filter: `${glowFilter} brightness(1)` },
                      '50%':  { filter: `${glowFilter} brightness(1.12)` },
                      '100%': { filter: `${glowFilter} brightness(1)` },
                    },
                    ...(flashActive ? {} : { animation: 'shimmer 2s ease-in-out infinite' }),
                  }
                : {}),
            }}
          />
        ) : (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
            }}
          >
            <CircularProgress size={28} sx={{ color: accentColor }} />
            <Typography
              variant="caption"
              sx={{
                color: isLincoln ? '#aaa' : '#999',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                fontSize: isLincoln ? '0.32rem' : '0.6rem',
                textAlign: 'center',
                px: 2,
              }}
            >
              Creating your character...
            </Typography>
          </Box>
        )}

        {/* Piece overlay layers */}
        {ARMOR_PIECES.map((pieceDef) => {
          const pos = PIECE_OVERLAY_POSITIONS[pieceDef.id]
          const earned = isPieceEarned(profile, pieceDef.id)
          const applied = appliedPieces.includes(pieceDef.id)
          const imageUrl = getPieceImageUrl(profile, pieceDef.id)
          const isBouncing = bouncingPiece === pieceDef.id

          if (!earned) return null

          const baseTransform = pos.transform ?? 'none'

          return (
            <Box
              key={pieceDef.id}
              component={imageUrl ? 'img' : 'div'}
              {...(imageUrl ? { src: imageUrl, alt: pieceDef.name } : {})}
              sx={{
                position: 'absolute',
                width: pos.width,
                top: pos.top,
                ...(pos.left ? { left: pos.left } : {}),
                ...(pos.right ? { right: pos.right } : {}),
                ...(pos.transform ? { transform: pos.transform } : {}),
                opacity: applied ? 1 : 0.18,
                imageRendering: isLincoln ? 'pixelated' : 'auto',
                // Landing bounce animation
                ...(isBouncing && applied && !reducedMotion
                  ? {
                      animation: `pieceAttach_${pieceDef.id} 0.4s ease-out`,
                      [`@keyframes pieceAttach_${pieceDef.id}`]: {
                        '0%':   { transform: `${baseTransform} scale(0)`, opacity: 0 },
                        '60%':  { transform: `${baseTransform} scale(1.25)`, opacity: 1 },
                        '80%':  { transform: `${baseTransform} scale(0.9)` },
                        '100%': { transform: baseTransform },
                      },
                    }
                  : {}),
                // Initial slide-in when first applied (no fly animation)
                ...(!isBouncing && applied && imageUrl && !reducedMotion
                  ? {
                      animation: `pieceSlideIn_${pieceDef.id} 0.4s ease-out`,
                      [`@keyframes pieceSlideIn_${pieceDef.id}`]: {
                        from: { opacity: 0, transform: `${baseTransform} scale(0.5)` },
                        to:   { opacity: 1, transform: baseTransform },
                      },
                    }
                  : {}),
              }}
            />
          )
        })}
      </Box>
    )
  },
)

export default CharacterDisplay
