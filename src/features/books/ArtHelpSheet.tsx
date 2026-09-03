import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CloseIcon from '@mui/icons-material/Close'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'

import {
  artBudgetLines,
  artHelp,
  artHelpStyles,
  generateHint,
  styleBlurb,
} from './artHelpContent'
import type {
  ArtBudgetState,
  ArtHelpAudience,
  ArtHelpDoor,
  ArtHelpSurface,
} from './artHelpContent'

/**
 * The "How this works" sheet for a surface that spends paid image calls
 * (FEAT-178) — a bottom sheet on a phone, a dialog on a wide screen.
 *
 * **Purely presentational.** It reads no Firestore, holds no state and cannot
 * start a generation: the audience and the live budget are handed in by the
 * host, which already knows both. That is what lets it sit inside surfaces
 * whose tests never mounted a provider (the Kit Builder form, the sticker
 * dialogs) without dragging a hook tree in behind it.
 *
 * Every word it renders comes from `artHelpContent.ts` — there is no inline
 * copy here, and the style list is derived from the pickers themselves, so a
 * look added to a picker appears in the help with its own label.
 */

interface ArtHelpSheetProps {
  surface: ArtHelpSurface
  open: boolean
  onClose: () => void
  /** From the host's `useActiveChild().isChildProfile` — capability, never a name. */
  audience: ArtHelpAudience
  /** The host's live quota numbers. `remaining` may be `Infinity` for a parent. */
  budget: ArtBudgetState
}

export default function ArtHelpSheet({
  surface,
  open,
  onClose,
  audience,
  budget,
}: ArtHelpSheetProps) {
  const theme = useTheme()
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'))

  const content = artHelp(surface, audience)
  const styles = artHelpStyles(surface)
  const liveBudget = artBudgetLines(audience, budget)

  const body = (
    <Box sx={{ p: 2.5, pb: 3 }}>
      <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 1.5 }}>
        <Typography variant="h6" component="h2" sx={{ flex: 1, fontWeight: 700 }}>
          {content.title}
        </Typography>
        <IconButton onClick={onClose} aria-label="Close" size="small" sx={{ mt: -0.5 }}>
          <CloseIcon />
        </IconButton>
      </Stack>

      <Stack spacing={2.5} divider={<Divider flexItem />}>
        {content.sections.map((section) => (
          <Box key={section.id}>
            <Typography
              variant="subtitle2"
              component="h3"
              sx={{ fontWeight: 700, mb: 0.75 }}
            >
              {section.heading}
            </Typography>

            {/* The style list is the one body the copy module does not spell
                out — it comes from the pickers themselves. */}
            {section.id === 'styles' ? (
              <Stack spacing={1}>
                {styles.map((style) => (
                  <Box key={style.id}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {style.emoji ? `${style.emoji} ` : ''}
                      {style.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {styleBlurb(style.id, audience)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Stack spacing={0.75}>
                {section.lines.map((line) => (
                  <Typography key={line} variant="body2" color="text.secondary">
                    {line}
                  </Typography>
                ))}
                {/* The only live numbers on the sheet — read off the surface's
                    own quota hook, never baked into copy. */}
                {section.id === 'budget' &&
                  liveBudget.map((line) => (
                    <Typography key={line} variant="body2" sx={{ fontWeight: 600 }}>
                      {line}
                    </Typography>
                  ))}
              </Stack>
            )}
          </Box>
        ))}
      </Stack>

      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Button onClick={onClose} variant="outlined" sx={{ minHeight: 44, textTransform: 'none' }}>
          Got it
        </Button>
      </Box>
    </Box>
  )

  if (isPhone) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        // **The sheet opens from inside an open Dialog on two of its five
        // surfaces** — SketchScanner and the Book Editor's Make a Scene dialog
        // (Codex P1, PR #1739). A temporary Drawer sits at
        // `theme.zIndex.drawer` (1200) and a Dialog's modal at
        // `theme.zIndex.modal` (1300), so on a phone — the primary device here
        // — the help rendered *behind* the dialog and its backdrop and could
        // not be tapped at all. Lifting the nested drawer above modal level
        // fixes it without closing the host dialog, which would lose whatever
        // the parent had typed into the scene box.
        sx={{ zIndex: (t) => t.zIndex.modal + 1 }}
        slotProps={{
          paper: {
            sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85vh' },
          },
        }}
      >
        {body}
      </Drawer>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      scroll="paper"
      // Two Dialogs at the same z-index stack by DOM order, which happens to
      // favour this one today. Stating it removes the reliance on mount order.
      sx={{ zIndex: (t) => t.zIndex.modal + 1 }}
    >
      {body}
    </Dialog>
  )
}

/**
 * The small "?" that opens the sheet, next to a surface's primary generate
 * control. One per surface — not one per door (UX-98 notes "Make a Sticker"
 * renders twice on the Stickers page; the help does not).
 */
export function ArtHelpButton({
  onClick,
  label = 'How this works',
}: {
  onClick: () => void
  label?: string
}) {
  return (
    <Tooltip title={label}>
      <IconButton
        onClick={onClick}
        aria-label={label}
        size="small"
        sx={{ color: 'text.secondary' }}
      >
        <HelpOutlineIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  )
}

/**
 * The one-line caption under a paid generate button: what this tap makes, and
 * what it spends.
 *
 * At the cap the host shows `ART_QUOTA_MESSAGE` **instead of** this, never both
 * — a kid who cannot generate does not need to be told the price.
 */
export function GenerateHint({
  door,
  audience,
  count = 1,
  atMost = false,
}: {
  door: ArtHelpDoor
  audience: ArtHelpAudience
  count?: number
  /** FEAT-184: `count` is a ceiling sized by a step that has not run yet. */
  atMost?: boolean
}) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
      {generateHint(door, audience, count, { atMost })}
    </Typography>
  )
}
