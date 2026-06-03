import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import { useStonebridgeProgress } from './useStonebridgeProgress'
import StonebridgeLocationArt from './StonebridgeLocationArt'
import BannerRaiseCelebration from './BannerRaiseCelebration'
import StonebridgeVillage from './StonebridgeVillage'

interface StonebridgeMissionCardProps {
  familyId: string
  childId: string
  isLincoln: boolean
}

/**
 * Live Banner Rally mission card on the Hero Hub (replaces the old "coming soon"
 * preview). Reading activity Lincoln already generates fills the bar; completion
 * heals the location, raises its banner, and a canon character thanks him, then
 * the next mission queues automatically.
 *
 * Read-only on the XP / forge / diamond economy — progress is derived, never minted.
 */
export default function StonebridgeMissionCard({ familyId, childId, isLincoln }: StonebridgeMissionCardProps) {
  const {
    mission,
    active,
    completedMissions,
    raisedBanners,
    justCompletedMissionId,
    clearJustCompleted,
    loading,
  } = useStonebridgeProgress(familyId, childId)

  const [villageOpen, setVillageOpen] = useState(false)

  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  if (loading || !mission || !active) {
    // Quiet placeholder while progress loads — keeps the hub layout stable.
    return (
      <Box
        sx={{
          mx: 1,
          mt: 1,
          p: 2,
          borderRadius: isLincoln ? '8px' : '16px',
          border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.22)' : 'rgba(232,160,191,0.28)'}`,
          background: isLincoln ? 'rgba(18,30,24,0.82)' : 'rgba(255,249,253,0.95)',
        }}
      >
        <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '12px' : '16px', fontWeight: 700 }}>
          🏰 Stonebridge
        </Typography>
        <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '10px' : '13px', opacity: 0.7, mt: 1 }}>
          Loading your mission…
        </Typography>
      </Box>
    )
  }

  const accent = mission.art.accent
  const pct = active.percent

  return (
    <>
      <Box
        sx={{
          mx: 1,
          mt: 1,
          p: 2,
          borderRadius: isLincoln ? '8px' : '16px',
          border: `1px solid ${accent}55`,
          background: isLincoln ? 'rgba(18,30,24,0.82)' : 'rgba(255,249,253,0.95)',
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '12px' : '16px', fontWeight: 700 }}>
            🏰 Stonebridge
          </Typography>
          {raisedBanners.length > 0 && (
            <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '9px' : '13px', opacity: 0.85 }}>
              🚩 {raisedBanners.length} banner{raisedBanners.length === 1 ? '' : 's'} raised
            </Typography>
          )}
        </Box>

        {/* Mission title + framing */}
        <Typography
          sx={{
            fontFamily: titleFont,
            fontSize: isLincoln ? '11px' : '15px',
            fontWeight: 700,
            color: isLincoln ? '#F7D774' : '#7a3f67',
            mb: 0.75,
          }}
        >
          {mission.title}
        </Typography>

        {/* Two-state location art (damaged until repaired) */}
        <Box sx={{ mb: 1 }}>
          <StonebridgeLocationArt art={mission.art} state="damaged" isLincoln={isLincoln} height={110} />
        </Box>

        <Typography
          sx={{
            fontFamily: titleFont,
            fontSize: isLincoln ? '10px' : '14px',
            lineHeight: 1.45,
            opacity: 0.88,
            mb: 1.25,
          }}
        >
          {mission.framing}
        </Typography>

        {/* Progress bar */}
        <Box
          sx={{
            position: 'relative',
            height: isLincoln ? 14 : 18,
            borderRadius: isLincoln ? '3px' : '9px',
            background: isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
            overflow: 'hidden',
            border: `1px solid ${accent}44`,
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
              transition: 'width 0.6s ease',
              boxShadow: `0 0 8px ${accent}88`,
            }}
          />
        </Box>
        <Typography
          sx={{
            fontFamily: titleFont,
            fontSize: isLincoln ? '9px' : '12px',
            opacity: 0.78,
            mt: 0.5,
            textAlign: 'right',
          }}
        >
          {active.current} / {active.target} reading actions
        </Typography>

        {/* Open the full village board (all locations + Banner Hall) */}
        <Box
          onClick={() => setVillageOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setVillageOpen(true)
          }}
          sx={{
            mt: 1.25,
            py: 0.75,
            textAlign: 'center',
            borderRadius: isLincoln ? '6px' : '12px',
            border: `1px solid ${accent}66`,
            background: `${accent}1a`,
            cursor: 'pointer',
            fontFamily: titleFont,
            fontSize: isLincoln ? '9px' : '13px',
            fontWeight: 700,
            color: isLincoln ? '#F7D774' : '#7a3f67',
            transition: 'background 0.2s ease',
            '&:hover': { background: `${accent}2e` },
          }}
        >
          🏰 Open Stonebridge
        </Box>
      </Box>

      <StonebridgeVillage
        open={villageOpen}
        onClose={() => setVillageOpen(false)}
        isLincoln={isLincoln}
        completedMissions={completedMissions}
        raisedBanners={raisedBanners}
        currentMissionId={mission.id}
        active={active}
      />

      <BannerRaiseCelebration
        missionId={justCompletedMissionId}
        isLincoln={isLincoln}
        onDismiss={clearJustCompleted}
      />
    </>
  )
}
