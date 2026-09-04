import type { ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { ArtHelpAudience } from './artHelpContent'
import {
  ALTERNATIVES_HEADING,
  ALTERNATIVE_COST_NOTE,
  BLOCKED_TIPS,
  FREE_EXITS_HEADING,
  ImageGenerationFailure,
  imageFailureMessage,
  offersAlternatives,
} from './imageGenerationFailure'

/** One free way out of a refusal — a drawing of their own, a photo, an upload. */
export interface ImageRetryExit {
  /** Named exactly as it reads on screen. */
  label: string
  icon?: ReactNode
  onClick: () => void
}

export interface ImageRetryCardProps {
  /** From `classifyImageGenerationFailure` — never a raw error. */
  failure: ImageGenerationFailure
  /** The host's `useActiveChild().isChildProfile` — capability, never a name. */
  audience: ArtHelpAudience
  /**
   * The server's rewordings of what was asked for, from
   * `imageFailureAlternatives`. Rendered as taps only on a refusal AND only
   * when {@link onUseAlternative} is given; otherwise the static tips show.
   */
  alternatives?: string[]
  /** Re-run the generation with this text. Omitted by a door with no single prompt. */
  onUseAlternative?: (text: string) => void
  /** Go back to the words and try again. Omitted where there is nothing to go back to. */
  onRetry?: () => void
  /** The retry control's words, as they read on this surface. */
  retryLabel?: string
  /** Free alternatives to a paid picture, where the surface has them. */
  exits?: ImageRetryExit[]
}

/**
 * The one card every paid picture door shows when a picture doesn't come back
 * (FEAT-195).
 *
 * **Why one component.** Six doors had six behaviours, and only the Book Editor's
 * had anything useful in it — two written suggestions and two free exits, as
 * static prose the parent then had to retype. The other doors had a single line
 * and no way forward at all. The owner's ask was that a refusal "shouldn't just
 * say no": so the suggestions became the server's own rewordings, and tapping
 * one *is* the retry.
 *
 * **Purely presentational.** It holds no state, reads no Firestore, spends
 * nothing and cannot start a generation on its own — every tap calls a handler
 * the host supplied, so the host's existing cap guard and counter stay the one
 * place a generation is decided and counted. Same posture as `ArtHelpSheet`.
 *
 * **Honest about cost and about guesses.** The heading is "Try one of these",
 * never "this will work" — the alternatives are a model's guesses. And the cost
 * note says a tap is a new picture that counts as one, *before* it is spent.
 */
export default function ImageRetryCard({
  failure,
  audience,
  alternatives = [],
  onUseAlternative,
  onRetry,
  retryLabel = 'Try again',
  exits = [],
}: ImageRetryCardProps) {
  // Only a refusal can be answered with different words (see `offersAlternatives`).
  const wantsAlternatives = offersAlternatives(failure)
  const tappable = wantsAlternatives && !!onUseAlternative ? alternatives : []
  // The Book Editor's two written suggestions, shown when the suggester gave us
  // nothing to tap. Advice, not prompts — so never rendered as a tap.
  const showTips = wantsAlternatives && tappable.length === 0

  return (
    <Alert severity="warning" sx={{ mt: 1 }} data-testid="image-retry-card">
      <Stack spacing={1.5}>
        <Typography variant="body2">{imageFailureMessage(failure, audience)}</Typography>

        {tappable.length > 0 && (
          <>
            <Typography variant="body2">
              <strong>{ALTERNATIVES_HEADING[audience]}</strong>
            </Typography>
            <Stack spacing={1}>
              {tappable.map((text) => (
                <ButtonBase
                  key={text}
                  onClick={() => onUseAlternative?.(text)}
                  sx={{
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    p: 1.25,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    width: '100%',
                  }}
                >
                  <Typography variant="body2">{text}</Typography>
                </ButtonBase>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {ALTERNATIVE_COST_NOTE[audience]}
            </Typography>
          </>
        )}

        {showTips && (
          <>
            <Typography variant="body2">
              <strong>{ALTERNATIVES_HEADING[audience]}</strong>
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {BLOCKED_TIPS[audience].map((tip) => (
                <li key={tip}>
                  <Typography variant="body2">{tip}</Typography>
                </li>
              ))}
            </Box>
          </>
        )}

        {exits.length > 0 && (
          <>
            <Divider />
            <Typography variant="body2" color="text.secondary">
              {FREE_EXITS_HEADING[audience]}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {exits.map((exit) => (
                <Button
                  key={exit.label}
                  size="small"
                  variant="outlined"
                  startIcon={exit.icon}
                  onClick={exit.onClick}
                >
                  {exit.label}
                </Button>
              ))}
            </Stack>
          </>
        )}

        {onRetry && (
          <Box>
            <Button size="small" variant="outlined" onClick={onRetry}>
              {retryLabel}
            </Button>
          </Box>
        )}
      </Stack>
    </Alert>
  )
}

export { ImageGenerationFailure }
