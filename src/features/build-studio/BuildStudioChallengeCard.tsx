/**
 * The optional challenge invitation in the ready editor (LOCAL-VISION-007).
 *
 * Presentational and stateless: it holds no attempt, reads no editor and cannot
 * save, speak or send a message on its own. The editor owns the attempt and
 * passes the handlers, so "swapping a challenge never touches MakeCode" is a
 * property of this file having no bridge to touch.
 *
 * It is an invitation, not a task: *Not now* hides it, *A different one* swaps
 * it, and the game can be made and saved without ever opening it. Nothing here
 * is scored, and the words never claim the child learned anything.
 */

import { useEffect, useRef } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { BUILD_STUDIO_CHALLENGE_OUTCOMES } from '../../core/types/buildStudio'
import {
  canPredict,
  canReportOutcome,
  outcomeWaitingForSave,
  type ChallengeAttemptState,
} from './buildStudioChallengeAttempt'
import { OUTCOME_LABELS, type BuildChallenge } from './buildStudioChallenges'

export interface BuildStudioChallengeCardProps {
  challenge: BuildChallenge
  attempt: ChallengeAttemptState
  /** Hidden by *Not now*. Only a small way back is drawn. */
  dismissed: boolean
  hintShown: boolean
  /** In Play mode: keep the card short so the game stays easy to reach. */
  compact?: boolean
  /** A Save that did not finish is waiting, with whatever it was frozen with. */
  pendingSaveLacksOutcome: boolean
  onPredict: (optionId: string) => void
  onOutcome: (result: (typeof BUILD_STUDIO_CHALLENGE_OUTCOMES)[number]) => void
  onHear: () => void
  onHint: () => void
  onSwap: () => void
  onDismiss: () => void
  onShow: () => void
}

const TAP = { textTransform: 'none', minHeight: 48, fontWeight: 600 } as const

export default function BuildStudioChallengeCard({
  challenge,
  attempt,
  dismissed,
  hintShown,
  compact = false,
  pendingSaveLacksOutcome,
  onPredict,
  onOutcome,
  onHear,
  onHint,
  onSwap,
  onDismiss,
  onShow,
}: BuildStudioChallengeCardProps) {
  /**
   * Keyboard focus follows the control that was just used. *Not now* removes
   * the button that was pressed, so the way back takes focus; showing the card
   * again puts focus on its heading rather than on the page's start.
   */
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const showRef = useRef<HTMLButtonElement | null>(null)
  const wasDismissed = useRef(dismissed)
  useEffect(() => {
    // Only on a CHANGE made here — never on first paint or a remount.
    if (wasDismissed.current && !dismissed) headingRef.current?.focus()
    if (!wasDismissed.current && dismissed) showRef.current?.focus()
    wasDismissed.current = dismissed
  }, [dismissed])

  if (dismissed) {
    return (
      <Stack direction="row">
        <Button ref={showRef} variant="text" onClick={onShow} sx={TAP}>
          💭 Show me something to try
        </Button>
      </Stack>
    )
  }

  const predicting = canPredict(attempt)
  const chosen = attempt.prediction?.optionId ?? null
  const chosenLabel =
    challenge.prediction.options.find((o) => o.id === chosen)?.label ?? null
  const asksOutcome = canReportOutcome(attempt)
  const waiting = outcomeWaitingForSave(attempt)

  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby="build-challenge-title"
      sx={{ p: compact ? 1 : 2, borderRadius: 2 }}
    >
      <Stack spacing={compact ? 0.75 : 1.5}>
        <Typography variant="overline" color="text.secondary">
          Something to try (only if you want)
        </Typography>
        <Stack spacing={0.5}>
          <Typography
            id="build-challenge-title"
            ref={headingRef}
            tabIndex={-1}
            variant="h6"
            component="h2"
            sx={{ fontWeight: 800, outline: 'none' }}
          >
            {challenge.goal}
          </Typography>
          <Typography variant="body1">{challenge.question}</Typography>
          {!compact && (
            <Typography variant="body2" color="text.secondary">
              {challenge.why}
            </Typography>
          )}
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
          <Button variant="outlined" onClick={onHear} sx={TAP}>
            🔊 Read this to me
          </Button>
          <Button variant="outlined" onClick={onHint} sx={TAP}>
            💡 Where to look
          </Button>
          <Button variant="outlined" onClick={onSwap} sx={TAP}>
            🔀 A different one
          </Button>
          <Button variant="text" onClick={onDismiss} sx={TAP}>
            Not now
          </Button>
        </Stack>

        {hintShown && (
          <Alert severity="info" icon={false}>
            {challenge.hint}
          </Alert>
        )}

        {/* The guess comes BEFORE the Play request, and is optional: Play is
            the editor's own button above and works the same without it. */}
        {/* In Play mode a locked guess is just a line; the buttons are not needed. */}
        {compact && !predicting ? (
          chosenLabel && (
            <Typography variant="caption" color="text.secondary">
              {`Your guess is locked in: ${chosenLabel}.`}
            </Typography>
          )
        ) : (
          <Stack spacing={1} role="group" aria-label="Your guess">
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {challenge.prediction.prompt}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
              {challenge.prediction.options.map((option) => (
                <Button
                  key={option.id}
                  variant={chosen === option.id ? 'contained' : 'outlined'}
                  aria-pressed={chosen === option.id}
                  disabled={!predicting}
                  onClick={() => onPredict(option.id)}
                  sx={TAP}
                >
                  {option.label}
                </Button>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {chosenLabel && !predicting
                ? `Your guess is locked in: ${chosenLabel}.`
                : chosenLabel
                  ? 'You can change your guess until you press Play.'
                  : 'Guessing is optional. You can just press Play.'}
            </Typography>
          </Stack>
        )}

        {asksOutcome && (
          <Stack spacing={1} role="group" aria-label="How it went">
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Did it match your guess?
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
              {BUILD_STUDIO_CHALLENGE_OUTCOMES.map((result) => (
                <Button
                  key={result}
                  variant={attempt.reportedOutcome?.result === result ? 'contained' : 'outlined'}
                  aria-pressed={attempt.reportedOutcome?.result === result}
                  onClick={() => onOutcome(result)}
                  sx={TAP}
                >
                  {OUTCOME_LABELS[result]}
                </Button>
              ))}
            </Stack>
          </Stack>
        )}

        {/* The outcome is never written back onto a version that is already on
            the shelf. Said plainly, so the next step is clear. */}
        {waiting && (
          <Typography variant="caption" color="text.primary">
            {pendingSaveLacksOutcome
              ? 'The save that did not finish keeps what it had. Your answer goes with your next Save my version.'
              : 'Your answer is not on a saved game yet. It goes with your next Save my version.'}
          </Typography>
        )}
        {attempt.closed && (
          <Typography variant="caption" color="text.primary">
            Your answer is saved with your game. Pick a different one if you like.
          </Typography>
        )}
      </Stack>
    </Paper>
  )
}
