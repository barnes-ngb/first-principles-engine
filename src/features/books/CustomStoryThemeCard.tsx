import { useState } from 'react'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import {
  CUSTOM_STORY_THEME_HINT,
  CUSTOM_STORY_THEME_MAX_LENGTH,
  CUSTOM_STORY_THEME_PLACEHOLDER,
  CUSTOM_STORY_THEME_PROMPT,
  CUSTOM_STORY_THEME_TITLE,
  customStoryThemeChipLabel,
  normalizeCustomStoryTheme,
} from './customStoryTheme'

interface CustomStoryThemeCardProps {
  /** The note the book currently carries — `''`/absent when it has none. */
  value: string | undefined
  /** Called with the normalized note, or `''` to clear it. */
  onChange: (note: string) => void
  disabled?: boolean
}

/**
 * The one-off custom-theme control (FEAT-194): a chip at the end of a theme row
 * that opens a single short field.
 *
 * Presentational — it reads no Firestore, holds nothing but the draft text while
 * the dialog is open, and cannot start a generation. Two hosts render it (the
 * Book Editor's Finish dialog and the Generate chat's setup), which is why the
 * copy lives in `customStoryTheme.ts` rather than here.
 *
 * Parent-only at every host, gated on capability and never on a name — a kid
 * never sees it. Asking a kid to describe a feeling in free text is a different
 * design, and the readability bar has nothing to say about a text field.
 */
export default function CustomStoryThemeCard({
  value,
  onChange,
  disabled,
}: CustomStoryThemeCardProps) {
  const saved = normalizeCustomStoryTheme(value)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(saved)

  /**
   * Opening seeds the field from what the book carries — not from the last
   * thing typed and abandoned, and not from a stale render. Done here rather
   * than in an effect so nothing sets state during a render pass.
   */
  const handleOpen = () => {
    setDraft(saved)
    setOpen(true)
  }

  const handleSave = () => {
    onChange(normalizeCustomStoryTheme(draft))
    setOpen(false)
  }

  return (
    <>
      <Chip
        label={customStoryThemeChipLabel(saved)}
        size="small"
        variant={saved ? 'filled' : 'outlined'}
        disabled={disabled}
        onClick={handleOpen}
      />
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{CUSTOM_STORY_THEME_TITLE}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              label={CUSTOM_STORY_THEME_PROMPT}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={CUSTOM_STORY_THEME_PLACEHOLDER}
              fullWidth
              multiline
              minRows={2}
              maxRows={4}
              inputProps={{ maxLength: CUSTOM_STORY_THEME_MAX_LENGTH }}
              helperText={`${normalizeCustomStoryTheme(draft).length}/${CUSTOM_STORY_THEME_MAX_LENGTH}`}
            />
            <Typography variant="caption" color="text.secondary">
              {CUSTOM_STORY_THEME_HINT}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          {saved && (
            <Button
              color="inherit"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              Clear
            </Button>
          )}
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
