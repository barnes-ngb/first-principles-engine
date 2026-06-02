import Box from '@mui/material/Box'
import type { StonebridgeLocationArt as ArtDescriptor } from './missions'

interface StonebridgeLocationArtProps {
  art: ArtDescriptor
  /** 'damaged' = pre-repair (dim, no banner); 'repaired' = healed art + raised banner. */
  state: 'damaged' | 'repaired'
  isLincoln: boolean
  /** When true, the banner animates up on mount (used by the celebration). */
  animateBanner?: boolean
  height?: number
}

/**
 * Lightweight two-state location scene (styled emoji + CSS) — deliberately NOT a
 * 2.5D isometric map (that's a later slice). Damaged = desaturated/dim with a
 * crack mark; repaired = full-color glow with a raised banner.
 */
export default function StonebridgeLocationArt({
  art,
  state,
  isLincoln,
  animateBanner = false,
  height = 120,
}: StonebridgeLocationArtProps) {
  const repaired = state === 'repaired'
  const radius = isLincoln ? 6 : 14

  return (
    <Box
      sx={{
        position: 'relative',
        height,
        borderRadius: `${radius}px`,
        overflow: 'hidden',
        border: `1px solid ${repaired ? art.accent : 'rgba(120,120,120,0.4)'}`,
        background: repaired
          ? `linear-gradient(180deg, rgba(20,32,48,0.95) 0%, rgba(12,20,30,0.95) 100%)`
          : `linear-gradient(180deg, rgba(26,26,30,0.95) 0%, rgba(16,16,18,0.95) 100%)`,
        boxShadow: repaired ? `0 0 18px ${art.accent}55 inset` : 'none',
        transition: 'border-color 0.5s ease, box-shadow 0.5s ease',
      }}
    >
      {/* Ground line */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '22%',
          background: repaired
            ? 'linear-gradient(180deg, rgba(90,70,40,0.6), rgba(60,46,26,0.85))'
            : 'linear-gradient(180deg, rgba(50,50,52,0.6), rgba(34,34,36,0.85))',
        }}
      />

      {/* Location motif */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: '52%',
          transform: 'translate(-50%, -50%)',
          fontSize: Math.round(height * 0.42),
          lineHeight: 1,
          filter: repaired ? `drop-shadow(0 0 10px ${art.accent})` : 'grayscale(0.85) brightness(0.6)',
          opacity: repaired ? 1 : 0.7,
          transition: 'filter 0.6s ease, opacity 0.6s ease',
        }}
      >
        {art.emoji}
      </Box>

      {/* Crack / damage mark (damaged only) */}
      {!repaired && (
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: Math.round(height * 0.3),
            opacity: 0.85,
            pointerEvents: 'none',
          }}
        >
          ⚠️
        </Box>
      )}

      {/* Banner pole + banner (repaired only) */}
      {repaired && (
        <Box
          sx={{
            position: 'absolute',
            right: '14%',
            bottom: '22%',
            width: 3,
            height: '52%',
            background: 'rgba(180,180,180,0.85)',
            borderRadius: 1,
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 3,
              fontSize: Math.round(height * 0.22),
              lineHeight: 1,
              transformOrigin: 'bottom left',
              animation: animateBanner ? 'bannerRaise 0.9s cubic-bezier(0.34,1.56,0.64,1) forwards' : undefined,
              '@keyframes bannerRaise': {
                '0%': { transform: 'translateY(120%) scale(0.4)', opacity: 0 },
                '60%': { opacity: 1 },
                '100%': { transform: 'translateY(0) scale(1)', opacity: 1 },
              },
            }}
          >
            {art.bannerEmoji}
          </Box>
        </Box>
      )}
    </Box>
  )
}
