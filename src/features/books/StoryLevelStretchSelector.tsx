import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import {
  LEVEL_STRETCH_CAPTION,
  LEVEL_STRETCH_FOOTNOTE,
  levelStretchHint,
  levelStretchOptions,
  normalizeLevelStretch,
} from './storyLevelStretch'
import type { LevelStretch } from './storyLevelStretch'

interface Props {
  /** Currently selected stretch (0-2). */
  value: number
  onChange: (stretch: LevelStretch) => void
  /** The active child, for the "<name>'s level" option. */
  childName: string
  disabled?: boolean
}

/**
 * The per-story "one step up" picker (FEAT-191) — a **parent** control, mounted
 * only for a parent profile by its host, on **capability**, never on a name.
 *
 * Mirrors `StoryLengthSelector`'s shape: caption, a toggle strip, and the choice
 * locked once a draft exists. It carries one extra line the length picker does
 * not need — that this is only ever this book, and the lasting change is the
 * assessed level on the Skill Snapshot.
 */
export default function StoryLevelStretchSelector({
  value,
  onChange,
  childName,
  disabled,
}: Props) {
  const selected = normalizeLevelStretch(value)
  const options = levelStretchOptions(childName)
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {LEVEL_STRETCH_CAPTION}
      </Typography>
      <ToggleButtonGroup
        value={selected}
        exclusive
        onChange={(_, val) => {
          if (typeof val === 'number') onChange(normalizeLevelStretch(val))
        }}
        size="small"
        disabled={disabled}
        aria-label="Story reading level"
        sx={{ flexWrap: 'wrap' }}
      >
        {options.map((opt) => (
          <ToggleButton
            key={opt.value}
            value={opt.value}
            aria-label={opt.label}
            sx={{ textTransform: 'none', px: 1.75 }}
          >
            {opt.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {levelStretchHint(selected, childName)} {LEVEL_STRETCH_FOOTNOTE}
      </Typography>
    </Box>
  )
}
