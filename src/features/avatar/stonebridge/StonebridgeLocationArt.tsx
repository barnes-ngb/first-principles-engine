import Box from '@mui/material/Box'

import OldBridgeScene from './OldBridgeScene'
import { LocationScene } from './LocationScenes'
import { describeArt } from './locationArtDescriptions'
import { DRAWN_LOCATION_IDS } from './villageMapLayout'
import { getMission, type StonebridgeLocationArt as ArtDescriptor } from './missions'

/**
 * The one location that keeps its own dedicated scene.
 *
 * Keyed by **mission id**, never by emoji: `art.emoji` is presentation and two
 * locations may legitimately share one, so matching on it would be a silent
 * mis-identification waiting to happen. `OldBridgeScene` is the drawing the
 * Old Bridge was already recognised by — the gapped deck, the one board laid
 * over the widest gap, the rail that arrives with the repair — so it stays
 * exactly as it is rather than being redrawn in the newer vocabulary.
 */
const SCENE_MISSION_IDS = { oldBridge: 'old_bridge' } as const

interface StonebridgeLocationArtProps {
  /** Mission id — the explicit discriminant for which scene to draw. */
  missionId: string
  art: ArtDescriptor
  /** 'damaged' = the job waiting; 'repaired' = the finished structure + banner. */
  state: 'damaged' | 'repaired'
  isLincoln: boolean
  /** When true, the banner animates up on mount (used by the celebration). */
  animateBanner?: boolean
  height?: number
  /**
   * Overrides the text alternative. The default describes the STRUCTURE on
   * screen; a caller with more room can say more.
   */
  alt?: string
}

/**
 * One location scene in two states.
 *
 * The Old Bridge draws `OldBridgeScene`; every other location draws its
 * `LocationScene` from the shared structural vocabulary. Both hold the same
 * bar: the two states differ by **geometry**, so take all the colour out and
 * they are still obviously different pictures. The styled-emoji treatment this
 * replaced said "broken" with `grayscale(0.85)` and "fixed" with a
 * `drop-shadow` over the same glyph — one picture, twice.
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
  const isOldBridge = missionId === SCENE_MISSION_IDS.oldBridge

  return (
    <Box
      // One accessible name for the whole picture, whichever scene drew it.
      role="img"
      aria-label={alt ?? describeArt(missionId, locationName, repaired)}
      sx={{
        position: 'relative',
        height,
        borderRadius: `${radius}px`,
        overflow: 'hidden',
        // The frame still carries the location's accent once it is repaired —
        // but as the frame, never as the thing that tells you the state.
        border: `1px solid ${repaired ? art.accent : 'rgba(120,120,120,0.4)'}`,
        background: `linear-gradient(180deg, rgba(20,32,48,0.95) 0%, rgba(12,20,30,0.95) 100%)`,
        transition: 'border-color 0.5s ease',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {isOldBridge ? (
        <OldBridgeScene state={state} />
      ) : DRAWN_LOCATION_IDS.includes(missionId) ? (
        <LocationScene missionId={missionId} state={state} animateBanner={animateBanner} />
      ) : null}
    </Box>
  )
}
