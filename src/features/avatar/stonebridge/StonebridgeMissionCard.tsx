import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { useStonebridgeProgress } from './useStonebridgeProgress'
import StonebridgeLocationArt from './StonebridgeLocationArt'
import BannerRaiseCelebration from './BannerRaiseCelebration'
import StonebridgeVillage from './StonebridgeVillage'
import type { StonebridgeDestinations } from './stonebridgeDestinations'

interface StonebridgeMissionCardProps extends StonebridgeDestinations {
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
export default function StonebridgeMissionCard({
  familyId,
  childId,
  isLincoln,
  onOpenBooks,
  onVisitForge,
}: StonebridgeMissionCardProps) {
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

  /**
   * Whose board is open.
   *
   * Stamped with the child, and reset in the same render the child changes, so
   * a switch cannot leave the previous child's board (or anything open on it)
   * standing over the new child's hub for a frame. One conditional
   * render-phase update, matching `useStonebridgeProgress`.
   */
  const scopeKey = `${familyId}_${childId}`
  const [board, setBoard] = useState<{ scopeKey: string; open: boolean }>(() => ({
    scopeKey,
    open: false,
  }))
  if (board.scopeKey !== scopeKey) setBoard({ scopeKey, open: false })
  const villageOpen = board.scopeKey === scopeKey && board.open

  /**
   * The control that opens the board.
   *
   * The board turns MUI's focus restore off because it owns the hand-off on
   * every path — to a tile, to a destination, or back to here. This is the
   * "back to here" half, and the board calls it once it has finished closing
   * (focusing during the tap is taken back by the dialog's own focus trap).
   */
  const openButtonRef = useRef<HTMLElement | null>(null)

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
  /**
   * The rally is finished.
   *
   * The last mission stays `currentMissionId` once it completes (the rally
   * parks there), so "every location is repaired" is exactly "the mission on
   * screen is in the completed list" — derived from data that is already
   * stored, with no new flag and nothing written. While it holds, the card
   * shows the repaired location and a warm done state instead of a bar and a
   * framing that still has somewhere to go.
   */
  const finished = completedMissions.includes(mission.id)

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
          {finished ? mission.locationName : mission.title}
        </Typography>

        {/* Two-state location art. Repaired state comes from the completed
            list — the art never decides it, and a finished rally keeps the
            repaired picture rather than falling back to the damaged one. */}
        <Box sx={{ mb: 1 }}>
          <StonebridgeLocationArt
            missionId={mission.id}
            art={mission.art}
            state={finished ? 'repaired' : 'damaged'}
            isLincoln={isLincoln}
            height={110}
          />
        </Box>

        {finished ? (
          /* The warm done state: no framing that asks for more, no bar with
             somewhere left to go, and no repair call to action. */
          <>
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '10px' : '14px',
                lineHeight: 1.45,
                opacity: 0.88,
                mb: 0.5,
              }}
            >
              You fixed each place.
            </Typography>
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '9px' : '13px',
                opacity: 0.78,
                mb: 0.5,
              }}
            >
              Your banners are all up.
            </Typography>
          </>
        ) : (
          <>
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
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
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
          </>
        )}

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

        {/* Open the full village board (all locations + Banner Hall). A real
            <button>: the hand-rolled `role="button"` + `tabIndex` + keydown
            pair it replaces had to re-implement Enter and Space by hand, and
            the board now gives the focus back here on close. */}
        <Box
          component="button"
          type="button"
          ref={(el: HTMLElement | null) => {
            openButtonRef.current = el
          }}
          onClick={() => setBoard({ scopeKey, open: true })}
          sx={{
            display: 'block',
            width: '100%',
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
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        >
          🏰 Open Stonebridge
        </Box>
      </Box>

      {/* The board covers the card, so the card's own notice and its Try again
          sit UNDER it — unreachable by tap or by keyboard while the board is
          open. The same honest state and the same door are therefore handed to
          the board rather than assumed to be visible behind it.

          The destinations are handed down the same way: the village offers
          them, this card forwards them, and the page performs them. A village
          that navigated by itself would be a second place that decides where
          Books lives. */}
      <StonebridgeVillage
        open={villageOpen}
        onClose={() => setBoard({ scopeKey, open: false })}
        onReturnFocus={() => openButtonRef.current?.focus()}
        scopeKey={scopeKey}
        onOpenBooks={onOpenBooks}
        onVisitForge={onVisitForge}
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

      {/* The celebration covers everything, including the notice and the Try
          again on the card under it — so, like the board and the location
          visit, it is handed the same honest state and the same one door. */}
      <BannerRaiseCelebration
        missionId={justCompletedMissionId}
        isLincoln={isLincoln}
        onDismiss={clearJustCompleted}
        stale={stale}
        readError={readError}
        saveError={saveError}
        retrying={retrying}
        onRetry={retry}
      />
    </>
  )
}
