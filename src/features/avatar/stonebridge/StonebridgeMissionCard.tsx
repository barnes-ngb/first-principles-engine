import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
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
    stale,
    readError,
    saveError,
    retrying,
    retry,
  } = useStonebridgeProgress(familyId, childId)

  const [villageOpen, setVillageOpen] = useState(false)

  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  /** The one retry door, in both the no-data card and the notice below. */
  const retryButton = (
    <Button
      onClick={retry}
      variant="outlined"
      size="small"
      sx={{
        mt: 1,
        minHeight: 44,
        fontFamily: titleFont,
        fontSize: isLincoln ? '9px' : '13px',
        fontWeight: 700,
        color: isLincoln ? '#F7D774' : '#7a3f67',
        borderColor: isLincoln ? 'rgba(247,215,116,0.6)' : 'rgba(122,63,103,0.5)',
      }}
    >
      Try again
    </Button>
  )

  if (loading || !mission || !active) {
    // Nothing to show. Either it is still arriving (quiet placeholder, keeps the
    // hub layout stable) or a read/persist failed and there is no earlier
    // village to fall back on — which says so and offers the retry, rather than
    // claiming an empty village the child never had.
    const failed = readError || saveError
    const sentence = retrying
      ? 'Trying again…'
      : failed
        ? "Couldn't load your village."
        : 'Loading your mission…'
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
        <Typography
          role={failed ? 'alert' : undefined}
          sx={{ fontFamily: titleFont, fontSize: isLincoln ? '10px' : '13px', opacity: 0.7, mt: 1 }}
        >
          {sentence}
        </Typography>
        {(failed || retrying) && retryButton}
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
          {/* FEAT-186: "reading actions" is a parent's noun for a counter that
              is really book reads + quest completions — so "books read" would
              be untrue and "actions" is above a six-year-old. The bar above it
              already says what is being counted; the number just needs a word
              a kid can read. */}
          {active.current} / {active.target} done
        </Typography>

        {/* Honest notice over last-known or unsaved progress. The bar above is
            the child's real earned village either way — what this says is that
            the numbers are not fresh (stale) or not stored (saveError). It never
            claims a save that was not acknowledged. */}
        {(stale || saveError || retrying) && (
          <Box
            role="status"
            sx={{
              mt: 1.25,
              p: 1,
              borderRadius: isLincoln ? '6px' : '12px',
              border: `1px solid ${isLincoln ? 'rgba(247,215,116,0.5)' : 'rgba(122,63,103,0.35)'}`,
              background: isLincoln ? 'rgba(40,34,12,0.6)' : 'rgba(255,244,230,0.9)',
            }}
          >
            {saveError && (
              <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '9px' : '13px' }}>
                Your village did not save.
              </Typography>
            )}
            {stale && (
              <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '9px' : '13px' }}>
                Showing your last village.
              </Typography>
            )}
            {retrying && (
              <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '9px' : '13px' }}>
                Trying again…
              </Typography>
            )}
            {retryButton}
          </Box>
        )}

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

      {/* The board is a full-screen overlay, so the card's own notice and its
          Try again sit UNDER it — unreachable by tap or by keyboard while the
          board is open. The same honest state and the same door are therefore
          handed to the board rather than assumed to be visible behind it. */}
      <StonebridgeVillage
        open={villageOpen}
        onClose={() => setVillageOpen(false)}
        isLincoln={isLincoln}
        completedMissions={completedMissions}
        raisedBanners={raisedBanners}
        currentMissionId={mission.id}
        active={active}
        stale={stale}
        readError={readError}
        saveError={saveError}
        retrying={retrying}
        onRetry={retry}
      />

      <BannerRaiseCelebration
        missionId={justCompletedMissionId}
        isLincoln={isLincoln}
        onDismiss={clearJustCompleted}
      />
    </>
  )
}
