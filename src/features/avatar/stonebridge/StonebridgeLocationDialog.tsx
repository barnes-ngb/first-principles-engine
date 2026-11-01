import { useId } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'

import StonebridgeLocationArt from './StonebridgeLocationArt'
import StonebridgeRecoveryNotice, { type StonebridgeRecoveryState } from './StonebridgeRecoveryNotice'
import { VillageLocationState, type MissionComputation } from './computeStonebridgeProgress'
import type { StonebridgeMission } from './missions'

/** The one location whose visit offers the armor gallery (the Forge). */
const FORGE_MISSION_ID = 'the_forge'

interface StonebridgeLocationDialogProps extends StonebridgeRecoveryState {
  open: boolean
  /** The location being visited. */
  mission: StonebridgeMission
  /** Repaired / active / upcoming, derived by the caller from progress. */
  state: VillageLocationState
  /** Counters for the active mission — only read when `state` is active. */
  active: MissionComputation | null
  isLincoln: boolean
  /** Skip the open/close transition for someone who asked for less motion. */
  reduceMotion: boolean
  /** Close the visit and stay on the board. */
  onClose: () => void
  /** The transition has finished and this dialog is gone. */
  onExited: () => void
  /** Replay this location's saved thank-you (repaired locations only). */
  onReplayThanks: () => void
  /** Go to the real bookshelf. Offered on the location being repaired now. */
  onOpenBooks?: () => void
  /** Go to the real armor gallery. Offered at the Forge, in any state. */
  onVisitForge?: () => void
}

/**
 * One Stonebridge location, visited.
 *
 * ── What it is allowed to say ────────────────────────────────────────────────
 *
 * Exactly what is true of the location right now, in one of three states:
 *
 *   • **repaired** — the saved appearance is kept (it does not decay, and a
 *     revisit is not a re-earn) and the canon character's thank-you can be
 *     replayed as many times as the child likes;
 *   • **active** — this is the one being repaired now, with the same counters
 *     the card shows, and the one place a real reading destination is offered;
 *   • **upcoming** — honestly not started. **No destination, no call to
 *     action, and nothing that reads as "do this to unlock it"**, because
 *     nothing here is bought, won or unlocked — the rally moves one location at
 *     a time and this one's turn has not come.
 *
 * ── What it never does ───────────────────────────────────────────────────────
 *
 * It holds no progress state, reads nothing and writes nothing: opening,
 * closing and replaying a thank-you are all free. The destinations are the
 * caller's existing navigation (`/books`) and the caller's existing armor
 * gallery; neither is reproduced here, and the Forge visit is deliberately
 * **independent** of armor eligibility — a narrative repair never grants a
 * piece, and the gallery keeps its own rules.
 *
 * Recovery travels with it: a read or save failure while a visit is open shows
 * the same sentences and the same *Try again* here, because this is the topmost
 * view and everything under a modal is unreachable.
 */
export default function StonebridgeLocationDialog({
  open,
  mission,
  state,
  active,
  isLincoln,
  reduceMotion,
  onClose,
  onExited,
  onReplayThanks,
  onOpenBooks,
  onVisitForge,
  stale,
  readError,
  saveError,
  retrying,
  onRetry,
}: StonebridgeLocationDialogProps) {
  const titleId = useId()
  const isPhone = useMediaQuery('(max-width:599.95px)')

  /** Short headings keep the pixel theme… */
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  /** …and everything a child has to READ is plain, at 14px or more. */
  const bodyFont = isLincoln ? undefined : '"Fredoka", cursive'
  const repaired = state === VillageLocationState.Repaired
  const isActive = state === VillageLocationState.Active
  const accent = mission.art.accent
  const bodyColor = isLincoln ? 'rgba(255,255,255,0.92)' : 'rgba(32,16,24,0.88)'
  /** One shape for every control in the footer. */
  const actionSx = {
    minHeight: 44,
    px: 2,
    fontFamily: bodyFont,
    fontSize: '14px',
    fontWeight: 700,
    textTransform: 'none',
  } as const

  const conditionLine = repaired
    ? 'You fixed this place.'
    : isActive
      ? 'You are fixing this now.'
      : 'This place waits its turn.'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isPhone}
      fullWidth
      maxWidth="sm"
      scroll="paper"
      aria-labelledby={titleId}
      // Focus is returned to the tile by the board once this has finished
      // leaving, so MUI must not also restore it: two things moving the focus
      // is how a destination loses it (see StonebridgeVillage).
      disableRestoreFocus
      transitionDuration={reduceMotion ? 0 : undefined}
      TransitionProps={{ onExited }}
      // The board is a Dialog too, so these sit at the same z-index and stack
      // by mount order — which happens to favour this one. Saying so removes
      // the reliance on that (the `ArtHelpSheet` precedent).
      sx={{ zIndex: (t) => t.zIndex.modal + 1 }}
      slotProps={{
        paper: {
          sx: {
            bgcolor: isLincoln ? 'rgba(10,16,24,0.98)' : 'rgba(255,250,253,0.99)',
            backgroundImage: 'none',
            border: `1px solid ${accent}55`,
            borderRadius: isPhone ? 0 : isLincoln ? '10px' : '18px',
          },
        },
      }}
    >
      <DialogTitle
        id={titleId}
        sx={{
          fontFamily: titleFont,
          fontSize: isLincoln ? '13px' : '19px',
          fontWeight: 700,
          color: isLincoln ? '#F7D774' : '#7a3f67',
          pb: 1,
        }}
      >
        {mission.locationName}
      </DialogTitle>

      <DialogContent dividers>
        {/* Topmost view, so the one recovery door lives here too. */}
        <StonebridgeRecoveryNotice
          isLincoln={isLincoln}
          stale={stale}
          readError={readError}
          saveError={saveError}
          retrying={retrying}
          onRetry={onRetry}
        />

        {/* The bigger look at the place. Repaired state comes from the caller's
            completed-mission list — never from anything on this screen. */}
        <StonebridgeLocationArt
          missionId={mission.id}
          art={mission.art}
          state={repaired ? 'repaired' : 'damaged'}
          isLincoln={isLincoln}
          height={200}
        />

        <Typography
          sx={{
            fontFamily: bodyFont,
            fontSize: '16px',
            fontWeight: 700,
            lineHeight: 1.4,
            color: bodyColor,
            mt: 1.5,
          }}
        >
          {conditionLine}
        </Typography>

        {/* The location being repaired now: the same counters as the card, and
            the same framing. Nothing new is counted by opening this. */}
        {isActive && active && (
          <>
            <Typography
              sx={{
                fontFamily: bodyFont,
                fontSize: '14px',
                lineHeight: 1.45,
                color: bodyColor,
                opacity: 0.88,
                mt: 1,
              }}
            >
              {mission.framing}
            </Typography>
            <Typography
              sx={{
                fontFamily: bodyFont,
                fontSize: '14px',
                fontWeight: 700,
                color: bodyColor,
                opacity: 0.78,
                mt: 0.5,
              }}
            >
              {active.current} / {active.target} done
            </Typography>
          </>
        )}

        {/* A repaired location keeps its thank-you, and it can be heard again. */}
        {repaired && (
          <Box
            sx={{
              mt: 1.5,
              p: 1.5,
              borderRadius: isLincoln ? '8px' : '16px',
              border: `1px solid ${accent}66`,
              background: isLincoln ? 'rgba(12,20,30,0.9)' : 'rgba(255,255,255,0.85)',
            }}
          >
            <Typography sx={{ fontFamily: bodyFont, fontSize: '14px', fontWeight: 700, color: accent, mb: 0.5 }}>
              {mission.thankYou.name}
            </Typography>
            <Typography
              sx={{
                fontFamily: bodyFont,
                fontSize: '15px',
                lineHeight: 1.55,
                color: bodyColor,
              }}
            >
              “{mission.thankYou.line}”
            </Typography>
          </Box>
        )}

        {/* Upcoming: anticipation, and nothing that sounds like a price. */}
        {!repaired && !isActive && (
          <Typography
            sx={{
              fontFamily: bodyFont,
              fontSize: '14px',
              lineHeight: 1.45,
              color: bodyColor,
              opacity: 0.78,
              mt: 1,
            }}
          >
            One place at a time.
          </Typography>
        )}

        {/* The Forge is a workshop that already exists on this page. Said
            plainly, so nobody reads the armor door as a story reward. */}
        {mission.id === FORGE_MISSION_ID && onVisitForge && (
          <Typography
            sx={{
              fontFamily: bodyFont,
              fontSize: '14px',
              lineHeight: 1.45,
              color: bodyColor,
              opacity: 0.78,
              mt: 1.5,
            }}
          >
            This opens your armor.
          </Typography>
        )}
      </DialogContent>

      {/* Every control: a plain 14px label, a 44px target, and allowed to wrap
          onto its own row on a narrow phone rather than squeezing. */}
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 2, py: 1.5 }}>
        {repaired && (
          <Button
            onClick={onReplayThanks}
            variant="outlined"
            sx={{ ...actionSx, color: isLincoln ? '#F7D774' : '#7a3f67', borderColor: `${accent}88` }}
          >
            Hear the thank you
          </Button>
        )}
        {isActive && onOpenBooks && (
          <Button
            onClick={onOpenBooks}
            variant="contained"
            sx={{ ...actionSx, bgcolor: accent, color: '#1b1208', '&:hover': { bgcolor: accent } }}
          >
            Open My Books
          </Button>
        )}
        {mission.id === FORGE_MISSION_ID && onVisitForge && (
          <Button
            onClick={onVisitForge}
            variant="outlined"
            sx={{ ...actionSx, color: isLincoln ? '#F7D774' : '#7a3f67', borderColor: `${accent}88` }}
          >
            See your armor
          </Button>
        )}
        <Button onClick={onClose} sx={{ ...actionSx, color: isLincoln ? '#F7D774' : '#7a3f67' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
