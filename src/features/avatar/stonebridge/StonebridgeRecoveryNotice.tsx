import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

export interface StonebridgeRecoveryState {
  /**
   * What is on screen is the child's **last known** village, not a current
   * read. The banners are earned and stay; the numbers are not fresh.
   */
  stale?: boolean
  /** A read for this child came back as an error. */
  readError?: boolean
  /** A persist for this child was rejected — what is shown is NOT saved. */
  saveError?: boolean
  /** A Retry has re-subscribed and neither read has settled yet. */
  retrying?: boolean
  /** Re-subscribe. The one door, rendered wherever this notice is. */
  onRetry?: () => void
}

interface StonebridgeRecoveryNoticeProps extends StonebridgeRecoveryState {
  isLincoln: boolean
}

/**
 * The honest read/save notice, and its one door.
 *
 * Extracted from the village board because the board is no longer the topmost
 * thing on screen: a location visit opens a dialog **over** it, and a modal
 * marks everything behind it `aria-hidden` and traps the focus. A recovery
 * control that is covered is a recovery control that does not exist — the
 * defect `UX-474`'s round 1 found when the board covered the card's *Try
 * again*, one layer down. So the same sentences and the same button are
 * rendered by whichever view is on top, from one definition rather than two
 * copies that would drift apart.
 *
 * Renders nothing at all when there is nothing wrong.
 */
export default function StonebridgeRecoveryNotice({
  isLincoln,
  stale = false,
  readError = false,
  saveError = false,
  retrying = false,
  onRetry,
}: StonebridgeRecoveryNoticeProps) {
  if (!stale && !readError && !saveError && !retrying) return null

  /**
   * Plain and readable at 14px, in both themes.
   *
   * These four sentences are the ones a child reads when something has gone
   * wrong, and the button under them is the only way out — so they are the last
   * place to spend legibility on a pixel face at 9px. Short headings elsewhere
   * keep the theme; this does not have one.
   */
  const bodyFont = isLincoln ? undefined : '"Fredoka", cursive'
  const lineSx = {
    fontFamily: bodyFont,
    fontSize: '14px',
    lineHeight: 1.45,
    color: isLincoln ? 'rgba(255,255,255,0.92)' : 'rgba(32,16,24,0.88)',
  } as const

  return (
    <Box
      role="status"
      sx={{
        mb: 1.5,
        p: 1.5,
        width: '100%',
        borderRadius: isLincoln ? '8px' : '16px',
        border: `1px solid ${isLincoln ? 'rgba(247,215,116,0.5)' : 'rgba(122,63,103,0.35)'}`,
        background: isLincoln ? 'rgba(40,34,12,0.6)' : 'rgba(255,244,230,0.92)',
      }}
    >
      {saveError && <Typography sx={lineSx}>Your village did not save.</Typography>}
      {stale && <Typography sx={lineSx}>Showing your last village.</Typography>}
      {retrying && <Typography sx={lineSx}>Trying again…</Typography>}
      {!stale && !saveError && !retrying && readError && (
        <Typography sx={lineSx}>Couldn't load your village.</Typography>
      )}
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outlined"
          sx={{
            mt: 1,
            minHeight: 44,
            px: 2.5,
            fontFamily: bodyFont,
            fontSize: '14px',
            fontWeight: 700,
            textTransform: 'none',
            color: isLincoln ? '#F7D774' : '#7a3f67',
            borderColor: isLincoln ? 'rgba(247,215,116,0.6)' : 'rgba(122,63,103,0.5)',
          }}
        >
          Try again
        </Button>
      )}
    </Box>
  )
}
