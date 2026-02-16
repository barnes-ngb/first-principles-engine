import AccessAlarmIcon from '@mui/icons-material/AccessAlarm'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import PeopleIcon from '@mui/icons-material/People'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { StartAnywayScript } from '../../core/types/domain'

interface StartAnywayCardProps {
  script: StartAnywayScript
  onChoiceSelected?: (choiceIndex: number) => void
}

export default function StartAnywayCard({ script, onChoiceSelected }: StartAnywayCardProps) {
  return (
    <Box
      sx={{
        p: 1.5,
        border: '2px solid',
        borderColor: 'warning.main',
        borderRadius: 2,
        bgcolor: 'warning.50',
      }}
    >
      <Stack spacing={1.5}>
        {/* Header */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'warning.dark' }}>
            Start-Anyway Protocol
          </Typography>
          <Chip
            icon={<AccessAlarmIcon />}
            label={`${script.timerMinutes} min`}
            size="small"
            color="warning"
            variant="outlined"
          />
        </Stack>

        {/* Trigger */}
        <Alert severity="warning" variant="outlined" sx={{ py: 0.5 }}>
          <Typography variant="body2">
            Trigger: {script.trigger}
          </Typography>
        </Alert>

        {/* Choices */}
        <Typography variant="caption" color="text.secondary">
          Offer 2 choices (same skill, different modality):
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {script.choices.map((choice, idx) => (
            <Button
              key={idx}
              variant="outlined"
              size="small"
              onClick={() => onChoiceSelected?.(idx)}
              sx={{
                textTransform: 'none',
                flex: 1,
                minWidth: 120,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                py: 1,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {choice.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {choice.description}
              </Typography>
            </Button>
          ))}
        </Stack>

        {/* Protocol steps */}
        <Stack spacing={0.5}>
          {script.firstRepTogether && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <PeopleIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                First rep together (adult models)
              </Typography>
            </Stack>
          )}
          <Stack direction="row" spacing={0.5} alignItems="center">
            <EmojiEventsIcon sx={{ fontSize: 16, color: 'warning.main' }} />
            <Typography variant="caption" color="text.secondary">
              Win: {script.winReward}
            </Typography>
          </Stack>
        </Stack>
      </Stack>
    </Box>
  )
}
