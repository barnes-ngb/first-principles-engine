import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import { STORY_LENGTH_OPTIONS } from './storyPageTargets'

interface Props {
  /** Currently selected target page count. */
  value: number
  /** Called with the newly selected target page count. */
  onChange: (pages: number) => void
  disabled?: boolean
}

/**
 * Kid-friendly "How long is your book?" length picker (FEAT-97). Short / Normal /
 * Long, with the actual page numbers shown so the choice is concrete. Shared by
 * the Story Guide and Generate Chat generation entry points; the target it emits
 * is threaded straight into the `generateStory` task input.
 */
export default function StoryLengthSelector({ value, onChange, disabled }: Props) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        How long is your book?
      </Typography>
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={(_, val) => {
          if (typeof val === 'number') onChange(val)
        }}
        size="small"
        disabled={disabled}
        aria-label="Story length"
        sx={{ flexWrap: 'wrap' }}
      >
        {STORY_LENGTH_OPTIONS.map((opt) => (
          <ToggleButton
            key={opt.pages}
            value={opt.pages}
            aria-label={`${opt.label} — ${opt.pages} pages`}
            sx={{ textTransform: 'none', px: 1.75, flexDirection: 'column', lineHeight: 1.2 }}
          >
            <span style={{ fontWeight: 700 }}>{opt.label}</span>
            <span style={{ fontSize: '0.7rem', opacity: 0.75 }}>{opt.pages} pages</span>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  )
}
