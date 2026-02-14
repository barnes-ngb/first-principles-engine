import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import type { DailyPlanTemplate } from './dailyPlanTemplates'

interface HelperPanelProps {
  template: DailyPlanTemplate | undefined
  onApplyMinimumViableDay?: () => void
}

export default function HelperPanel({ template, onApplyMinimumViableDay }: HelperPanelProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        px: 2,
        py: 1,
        bgcolor: 'background.paper',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Button
          size="small"
          startIcon={<HelpOutlineIcon />}
          onClick={() => setExpanded((prev) => !prev)}
          sx={{ textTransform: 'none', fontWeight: 500 }}
        >
          {expanded ? 'Hide help' : 'What counts as done?'}
        </Button>
        {template && onApplyMinimumViableDay && (
          <Button
            size="small"
            variant="outlined"
            onClick={onApplyMinimumViableDay}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
          >
            Minimum Viable Day
          </Button>
        )}
      </Stack>
      <Collapse in={expanded}>
        <Stack spacing={1.5} sx={{ mt: 1.5, pb: 0.5 }}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              What counts as done?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Check off each routine item as you complete it. The XP chip updates
              automatically. A block is &ldquo;Logged&rdquo; once at least one
              item in it is checked.
            </Typography>
          </Box>
          {template && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Minimum Viable Day ({template.label})
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {template.minimumViableDay.map((item, i) => (
                  <Typography
                    key={i}
                    component="li"
                    variant="body2"
                    color="text.secondary"
                  >
                    {item}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
        </Stack>
      </Collapse>
    </Box>
  )
}
