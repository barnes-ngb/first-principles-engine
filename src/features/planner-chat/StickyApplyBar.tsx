import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

interface StickyApplyBarProps {
  /** True when the draft has unsaved edits since generation/apply (FEAT-111 P3). */
  planDirty: boolean
  onApply: () => void
}

/**
 * Sticky/floating "Apply This Week's Plan" bar (FEAT-111 P3). Rendered right
 * after the seven day cards; `position: sticky; bottom` keeps it pinned to the
 * viewport bottom while the cards scroll above it, so Apply is reachable on a
 * phone without scrolling past every card. The inline "Plan changed — apply to
 * save" hint keeps the pending state visible in context right after an edit
 * (e.g. "Add a video").
 */
export default function StickyApplyBar({ planDirty, onApply }: StickyApplyBarProps) {
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
          Apply This Week&apos;s Plan
        </Button>
      </Paper>
    </Box>
  )
}
