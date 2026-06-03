import { useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'

import StonebridgeLocationArt from './StonebridgeLocationArt'
import BannerRaiseCelebration from './BannerRaiseCelebration'
import { getMission } from './missions'
import {
  deriveVillageBoard,
  VillageLocationState,
  type MissionComputation,
} from './computeStonebridgeProgress'

interface StonebridgeVillageProps {
  open: boolean
  onClose: () => void
  isLincoln: boolean
  /** Completed (repaired) mission ids, in completion order. */
  completedMissions: string[]
  /** Raised banner location ids — drives the Banner Hall section. */
  raisedBanners: string[]
  /** Id of the in-focus mission (the active tile). */
  currentMissionId: string
  /** Derived counters for the active mission (null if every location is repaired). */
  active: MissionComputation | null
}

/**
 * Full-screen Stonebridge village board, opened from the Hero-Hub mission card.
 *
 * Shows every Bible location with state derived read-only from progress:
 *  • Repaired → lit art + raised banner; tap replays that character's thank-you.
 *  • Active   → highlighted with its progress bar; tap returns to the live card.
 *  • Upcoming → shown muted as anticipation (one active mission at a time).
 *
 * A Banner Hall section tallies the banners raised so far — the "look what you've
 * rebuilt" payoff. Simple styled-emoji art only (no isometric, no heavy deps),
 * and never reads or writes the XP / forge / diamond economy.
 */
export default function StonebridgeVillage({
  open,
  onClose,
  isLincoln,
  completedMissions,
  raisedBanners,
  currentMissionId,
  active,
}: StonebridgeVillageProps) {
  // Mission whose thank-you is being replayed (tapping a repaired tile).
  const [replayMissionId, setReplayMissionId] = useState<string | null>(null)

  if (!open) return null

  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  const board = deriveVillageBoard(completedMissions, currentMissionId)
  const bannerCount = raisedBanners.length

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        overflowY: 'auto',
        bgcolor: isLincoln ? 'rgba(6,10,16,0.97)' : 'rgba(255,247,252,0.98)',
        animation: 'sbVillageIn 0.35s ease-out',
        '@keyframes sbVillageIn': { from: { opacity: 0 }, to: { opacity: 1 } },
      }}
    >
      <Box sx={{ maxWidth: 720, mx: 'auto', px: 2, pt: 2, pb: 6 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
          <Box>
            <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '14px' : '20px', fontWeight: 700 }}>
              🏰 Stonebridge Village
            </Typography>
            <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '9px' : '13px', opacity: 0.72, mt: 0.5 }}>
              {bannerCount > 0
                ? `🚩 ${bannerCount} banner${bannerCount === 1 ? '' : 's'} raised — look what you've rebuilt!`
                : 'Read to repair your first location.'}
            </Typography>
          </Box>
          <IconButton
            onClick={onClose}
            aria-label="Close Stonebridge village"
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '14px' : '18px',
              color: isLincoln ? '#7EFC20' : '#7a3f67',
            }}
          >
            ✕
          </IconButton>
        </Box>

        {/* Location board */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 1.5,
          }}
        >
          {board.map(({ mission, state }) => {
            const repaired = state === VillageLocationState.Repaired
            const isActive = state === VillageLocationState.Active
            const upcoming = state === VillageLocationState.Upcoming
            const accent = mission.art.accent

            const onTap = repaired
              ? () => setReplayMissionId(mission.id)
              : isActive
                ? onClose
                : undefined

            return (
              <Box
                key={mission.id}
                onClick={onTap}
                sx={{
                  p: 1,
                  borderRadius: isLincoln ? '8px' : '16px',
                  border: `1px solid ${isActive ? accent : repaired ? `${accent}66` : 'rgba(120,120,120,0.3)'}`,
                  background: isLincoln ? 'rgba(16,24,32,0.75)' : 'rgba(255,255,255,0.7)',
                  opacity: upcoming ? 0.6 : 1,
                  cursor: onTap ? 'pointer' : 'default',
                  boxShadow: isActive ? `0 0 14px ${accent}55` : 'none',
                  transition: 'opacity 0.3s ease, box-shadow 0.3s ease',
                }}
              >
                <StonebridgeLocationArt
                  art={mission.art}
                  state={repaired ? 'repaired' : 'damaged'}
                  isLincoln={isLincoln}
                  height={96}
                />
                <Typography
                  sx={{
                    fontFamily: titleFont,
                    fontSize: isLincoln ? '9px' : '13px',
                    fontWeight: 700,
                    mt: 0.75,
                    color: isLincoln ? '#F7D774' : '#7a3f67',
                  }}
                >
                  {mission.locationName}
                </Typography>

                {/* State row */}
                {repaired && (
                  <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '8px' : '11px', opacity: 0.8, mt: 0.25 }}>
                    ✓ Repaired · tap to revisit
                  </Typography>
                )}
                {isActive && active && (
                  <Box sx={{ mt: 0.5 }}>
                    <Box
                      sx={{
                        position: 'relative',
                        height: isLincoln ? 8 : 12,
                        borderRadius: isLincoln ? '2px' : '6px',
                        background: isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          width: `${active.percent}%`,
                          background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
                          transition: 'width 0.6s ease',
                        }}
                      />
                    </Box>
                    <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '8px' : '10px', opacity: 0.78, mt: 0.25, textAlign: 'right' }}>
                      {active.current} / {active.target}
                    </Typography>
                  </Box>
                )}
                {upcoming && (
                  <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '8px' : '11px', opacity: 0.7, mt: 0.25 }}>
                    Coming soon
                  </Typography>
                )}
              </Box>
            )
          })}
        </Box>

        {/* ── Banner Hall — your raised colors ─────────────────────── */}
        <Box
          sx={{
            mt: 3,
            p: 2,
            borderRadius: isLincoln ? '8px' : '16px',
            border: `1px solid ${isLincoln ? 'rgba(245,197,66,0.4)' : 'rgba(232,160,191,0.4)'}`,
            background: isLincoln ? 'rgba(20,18,10,0.75)' : 'rgba(255,250,240,0.85)',
          }}
        >
          <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '12px' : '17px', fontWeight: 700 }}>
            🎌 Banner Hall
          </Typography>
          <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '8px' : '12px', opacity: 0.72, mt: 0.5, mb: 1.5 }}>
            Your raised colors — one for every place you've rebuilt.
          </Typography>

          {bannerCount === 0 ? (
            <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '9px' : '13px', opacity: 0.7, fontStyle: 'italic' }}>
              Your first banner is coming — keep reading!
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {raisedBanners.map((id) => {
                const m = getMission(id)
                if (!m) return null
                return (
                  <Box
                    key={id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 1.25,
                      py: 0.75,
                      borderRadius: isLincoln ? '6px' : '12px',
                      border: `1px solid ${m.art.accent}66`,
                      background: isLincoln ? 'rgba(12,20,30,0.85)' : 'rgba(255,255,255,0.8)',
                      boxShadow: `0 0 10px ${m.art.accent}33`,
                    }}
                  >
                    <Box sx={{ fontSize: isLincoln ? '16px' : '20px', lineHeight: 1 }}>{m.art.bannerEmoji}</Box>
                    <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '8px' : '12px', fontWeight: 700 }}>
                      {m.locationName}
                    </Typography>
                  </Box>
                )
              })}
            </Box>
          )}
        </Box>
      </Box>

      {/* Replay a repaired location's character thank-you. */}
      <BannerRaiseCelebration
        missionId={replayMissionId}
        isLincoln={isLincoln}
        onDismiss={() => setReplayMissionId(null)}
      />
    </Box>
  )
}
