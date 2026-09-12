import { useId } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

export interface SectionDisclosure {
  expanded: boolean
  onChange: (expanded: boolean) => void
  summary?: string
}

interface SectionCardProps {
  title: string
  action?: ReactNode
  disclosure?: SectionDisclosure
  children: ReactNode
}

export default function SectionCard({ title, action, children, disclosure }: SectionCardProps) {
  const id = useId()
  if (disclosure) {
    return (
      <Accordion
        expanded={disclosure.expanded}
        onChange={(_, expanded) => disclosure.onChange(expanded)}
        disableGutters
        slots={{ heading: 'h2' }}
        slotProps={{ heading: { style: { all: 'unset' } }, transition: { unmountOnExit: false } }}
        sx={{ '&::before': { display: 'none' } }}
      >
        <AccordionSummary id={`${id}-heading`} aria-controls={`${id}-content`} expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 56 }}>
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            <Typography component="span" variant="subtitle1" sx={{ fontWeight: 600 }}>{title}</Typography>
            {disclosure.summary && <Typography component="span" variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{disclosure.summary}</Typography>}
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          {/* Keep drafts and in-flight saves mounted while only hiding their UI. */}
          <Stack spacing={2}>{action}{children}</Stack>
        </AccordionDetails>
      </Accordion>
    )
  }
  return (
    <Card elevation={2}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography component="h2" variant="h6">
              {title}
            </Typography>
            {action}
          </Stack>
          {children}
        </Stack>
      </CardContent>
    </Card>
  )
}
