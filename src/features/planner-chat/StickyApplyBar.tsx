import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

interface StickyApplyBarProps {
  /** True when the draft has unsaved edits since generation/apply (FEAT-111 P3). */
  planDirty: boolean
  onApply: () => void
  /**
   * The button's label, naming the week it writes to — "Apply to Sep 7–11"
   * (FEAT-196). Built by `planningWeekSelection.applyButtonLabel` from the same
   * week the page hands Apply, never composed here: a label assembled next to
   * the button is a second claim about the target, and the whole point is that
   * there is one.
   */
  applyLabel: string
}

/**
 * Sticky/floating Apply bar (FEAT-111 P3). Rendered right after the seven day
 * cards; `position: sticky; bottom` keeps it pinned to the viewport bottom while
 * the cards scroll above it, so Apply is reachable on a phone without scrolling
 * past every card. The inline "Plan changed — apply to save" hint keeps the
 * pending state visible in context right after an edit (e.g. "Add a video").
 *
 * FEAT-196 put the dates ON the button. It used to read "Apply This Week's
 * Plan" — a possessive standing in for a target, on the biggest write in the
 * app, at exactly the moment a parent most needs to check which week they are
 * about to reshape.
 */
export default function StickyApplyBar({ planDirty, onApply, applyLabel }: StickyApplyBarProps) {
  return (
    <Box
      data-testid="sticky-apply-bar"
      sx={{
        position: 'sticky',
        bottom: (theme) => theme.spacing(1),
        zIndex: 5,
        pt: 1,
      }}
    >
      <Paper
        elevation={6}
        sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        {planDirty && (
          <Typography
            variant="caption"
            sx={{ display: 'block', mb: 0.75, fontWeight: 600, color: 'warning.main' }}
          >
            Plan changed — apply to save.
          </Typography>
        )}
        <Button
          variant="contained"
          color="success"
          size="large"
          onClick={onApply}
          fullWidth
        >
          {applyLabel}
        </Button>
      </Paper>
    </Box>
  )
}
