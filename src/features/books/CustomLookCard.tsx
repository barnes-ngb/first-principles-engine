import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { ArtHelpAudience } from './artHelpContent'
import {
  CUSTOM_PICTURE_NOTE_CLEAR_LABEL,
  CUSTOM_PICTURE_NOTE_HINT,
  CUSTOM_PICTURE_NOTE_MAX_LENGTH,
  CUSTOM_PICTURE_NOTE_ONE_OFF,
  CUSTOM_PICTURE_NOTE_PLACEHOLDER,
  CUSTOM_PICTURE_NOTE_PROMPT,
  customPictureNoteChipLabel,
  hasCustomPictureNote,
} from './customPictureNote'

export interface CustomLookCardProps {
  /** The note the host holds. `''` when there is none. */
  value: string
  onChange: (next: string) => void
  /** The host's `useActiveChild().isChildProfile`, as an audience — capability, never a name. */
  audience: ArtHelpAudience
  /** Closed while a generation is in flight, like the style chips beside it. */
  disabled?: boolean
}

/**
 * The one card behind "+ My own look", shown at the end of the look row on every
 * sticker door (FEAT-197 / UX-177).
 *
 * **Why it sits beside the looks and not among them.** The chip is deliberately
 * *after* the style chips and does not deselect one: the note is a second axis,
 * not a fourteenth look. Picking Storybook and typing "put her in a space suit"
 * gets a watercolor girl in a space suit, and the hint says so — a card that read
 * like a style field would be a second art direction reaching the same prompt,
 * which is the failure FEAT-189 measured.
 *
 * **Purely presentational.** It holds one piece of state — whether the field is
 * open — and nothing else. It reads no Firestore, spends nothing, and cannot
 * start a generation: the host owns the note, the cap guard and the button.
 * Same posture as `ArtHelpSheet` and `ImageRetryCard`.
 *
 * **Both audiences.** Unlike FEAT-194's parent-only story note, this is on the
 * boys' own surface and a kid typing "give her a cape" is the feature working.
 * So the kid copy is held to the shared readability bar
 * (`src/test/kidReadability.ts`), and the field itself is the same field.
 */
export default function CustomLookCard({
  value,
  onChange,
  audience,
  disabled = false,
}: CustomLookCardProps) {
  const [open, setOpen] = useState(() => hasCustomPictureNote(value))

  return (
    <Box sx={{ width: '100%' }} data-testid="custom-look-card">
      <Chip
        label={customPictureNoteChipLabel(value)}
        size="small"
        variant={hasCustomPictureNote(value) ? 'filled' : 'outlined'}
        color={hasCustomPictureNote(value) ? 'primary' : 'default'}
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
      />
      <Collapse in={open} unmountOnExit>
        <Stack spacing={0.75} sx={{ pt: 1 }}>
          <TextField
            label={CUSTOM_PICTURE_NOTE_PROMPT[audience]}
            placeholder={CUSTOM_PICTURE_NOTE_PLACEHOLDER[audience]}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            fullWidth
            size="small"
            disabled={disabled}
            slotProps={{ htmlInput: { maxLength: CUSTOM_PICTURE_NOTE_MAX_LENGTH } }}
          />
          <Typography variant="caption" color="text.secondary">
            {CUSTOM_PICTURE_NOTE_HINT[audience]}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {CUSTOM_PICTURE_NOTE_ONE_OFF[audience]}
          </Typography>
          {hasCustomPictureNote(value) && (
            <Box>
              <Button size="small" onClick={() => onChange('')} disabled={disabled}>
                {CUSTOM_PICTURE_NOTE_CLEAR_LABEL}
              </Button>
            </Box>
          )}
        </Stack>
      </Collapse>
    </Box>
  )
}
