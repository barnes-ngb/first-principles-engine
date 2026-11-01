import Box from '@mui/material/Box'

import OldBridgeScene from './OldBridgeScene'
import { getMission, type StonebridgeLocationArt as ArtDescriptor } from './missions'

/**
 * Locations that have their own drawn scene instead of the styled-emoji motif.
 *
 * Keyed by **mission id**, never by emoji: `art.emoji` is presentation and two
 * locations may legitimately share one, so matching on it would be a silent
 * mis-identification waiting to happen. One entry today — the Old Bridge is the
 * one location in this slice's visual pass; every other location keeps the
 * existing art until its own bounded pass.
 */
const SCENE_MISSION_IDS = { oldBridge: 'old_bridge' } as const

interface StonebridgeLocationArtProps {
  /** Mission id — the explicit discriminant for which scene to draw. */
  missionId: string
  art: ArtDescriptor
  /** 'damaged' = pre-repair (dim, no banner); 'repaired' = healed art + raised banner. */
  state: 'damaged' | 'repaired'
  isLincoln: boolean
  /** When true, the banner animates up on mount (used by the celebration). */
  animateBanner?: boolean
  height?: number
  /**
   * Overrides the text alternative. The default names the location and says
   * which of the two states is on screen; a larger view can describe the
   * structure instead.
   */
  alt?: string
}

/**
 * Default text alternative: what the picture SHOWS, not what it means.
 *
 * The Old Bridge gets a structural sentence because its two states differ
 * structurally and that is the whole point of the drawing — a screen-reader
 * user is told about the gaps and the rails, not just "fixed" or "broken".
 */
function describeArt(missionId: string, locationName: string, repaired: boolean): string {
  if (missionId === SCENE_MISSION_IDS.oldBridge) {
    return repaired
      ? `${locationName}: a full deck with rails all the way across, and the banner flying.`
      : `${locationName}: planks missing from the deck, no rails, one board laid across the gap.`
  }
  return repaired
    ? `${locationName}: fixed, with its banner raised.`
    : `${locationName}: still waiting to be fixed.`
}

/**
 * One location scene in two states.
 *
 * Locations in {@link SCENE_MISSION_IDS} draw an original SVG scene whose two
 * states differ by **geometry** (see `OldBridgeScene`). Everything else keeps
 * the original lightweight styled-emoji treatment — dim with a damage mark, or
 * full-colour with a raised banner — until its own visual pass.
 *
 * Presentational only: `state` is handed down by the caller from existing
 * completed-mission state. This component reads nothing and writes nothing.
 */
export default function StonebridgeLocationArt({
  missionId,
  art,
  state,
  isLincoln,
  animateBanner = false,
  height = 120,
  alt,
}: StonebridgeLocationArtProps) {
  const repaired = state === 'repaired'
  const radius = isLincoln ? 6 : 14
  const locationName = getMission(missionId)?.locationName ?? 'This place'
  const hasScene = missionId === SCENE_MISSION_IDS.oldBridge

  return (
    <Box
      // One accessible name for the whole picture, whichever treatment drew it.
      role="img"
      aria-label={alt ?? describeArt(missionId, locationName, repaired)}
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
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {hasScene ? (
        <OldBridgeScene state={state} />
      ) : (
        <>
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
            aria-hidden="true"
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
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          >
            {art.emoji}
          </Box>

          {/* Crack / damage mark (damaged only) */}
          {!repaired && (
            <Box
              aria-hidden="true"
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
              aria-hidden="true"
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
                  // A banner that flies up is the celebration's one flourish; a
                  // person who asked for less motion still gets the banner, it
                  // is simply already there.
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }}
              >
                {art.bannerEmoji}
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
