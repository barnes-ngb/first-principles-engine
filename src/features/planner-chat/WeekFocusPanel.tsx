import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { WeekPlan } from '../../core/types'

interface WeekFocusPanelProps {
  weekPlan: WeekPlan
  onUpdateField: (field: keyof WeekPlan, value: string) => void
}

export default function WeekFocusPanel({ weekPlan, onUpdateField }: WeekFocusPanelProps) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Stack spacing={2}>
        <Typography variant="subtitle2">This Week in Stonebridge</Typography>

        {weekPlan.theme && (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={weekPlan.theme} color="primary" />
              {weekPlan.virtue && <Chip label={weekPlan.virtue} color="secondary" variant="outlined" />}
            </Stack>
            {weekPlan.scriptureRef && (
              <Typography variant="body2">
                <strong>{weekPlan.scriptureRef}</strong>
                {weekPlan.scriptureText && (
                  <Typography component="span" variant="body2" sx={{ fontStyle: 'italic' }}>
                    {' — "'}{weekPlan.scriptureText}{'"'}
                  </Typography>
                )}
              </Typography>
            )}
            {weekPlan.heartQuestion && <Typography variant="body2" color="text.secondary">{weekPlan.heartQuestion}</Typography>}
            {weekPlan.formationPrompt && <Typography variant="body2" color="text.secondary">{weekPlan.formationPrompt}</Typography>}
          </Stack>
        )}

        {weekPlan.conundrum && (
          <Stack spacing={1.5} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{weekPlan.conundrum.title}</Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.8, whiteSpace: 'pre-line' }}>{weekPlan.conundrum.scenario}</Typography>
            <Typography variant="body1" fontWeight={700} sx={{ mt: 1 }}>{weekPlan.conundrum.question}</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              <Chip label={`Lincoln: ${weekPlan.conundrum.lincolnPrompt?.slice(0, 40)}...`} size="small" variant="outlined" color="primary" />
              <Chip label={`London: ${weekPlan.conundrum.londonPrompt?.slice(0, 40)}...`} size="small" variant="outlined" color="secondary" />
              {weekPlan.conundrum.readingTieIn && <Chip label="Reading" size="small" variant="outlined" />}
              {weekPlan.conundrum.mathContext && <Chip label="Math" size="small" variant="outlined" />}
              {weekPlan.conundrum.londonDrawingPrompt && <Chip label="Drawing" size="small" variant="outlined" />}
            </Stack>
          </Stack>
        )}

        {weekPlan.theme && (
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="caption" color="text.secondary">Edit fields manually</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                <TextField size="small" label="Theme" value={weekPlan.theme} onChange={(e) => onUpdateField('theme', e.target.value)} />
                <TextField size="small" label="Virtue" value={weekPlan.virtue} onChange={(e) => onUpdateField('virtue', e.target.value)} />
                <TextField size="small" label="Scripture Ref" value={weekPlan.scriptureRef} onChange={(e) => onUpdateField('scriptureRef', e.target.value)} />
                <TextField size="small" label="Scripture Text" value={weekPlan.scriptureText ?? ''} onChange={(e) => onUpdateField('scriptureText', e.target.value)} multiline />
                <TextField size="small" label="Heart Question" value={weekPlan.heartQuestion} onChange={(e) => onUpdateField('heartQuestion', e.target.value)} multiline />
                <TextField size="small" label="Formation Prompt" value={weekPlan.formationPrompt ?? ''} onChange={(e) => onUpdateField('formationPrompt', e.target.value)} multiline />
              </Stack>
            </AccordionDetails>
          </Accordion>
        )}
      </Stack>
    </Box>
  )
}
