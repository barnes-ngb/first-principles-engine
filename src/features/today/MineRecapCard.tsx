import { useState } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import type {
  EvaluationRecommendation,
  EvaluationSession,
} from '../../core/types/evaluation'
import { domainLabel, isScoreyFallbackSummary, uniqueSkills } from './mineRecap.logic'

interface MineRecapCardProps {
  session: EvaluationSession
  childName: string
}

function LabeledList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      <Stack component="ul" sx={{ m: 0, mt: 0.25, pl: 2.5 }} spacing={0.25}>
        {items.map((item, i) => (
          <Typography key={i} component="li" variant="body2" color="text.secondary">
            {item}
          </Typography>
        ))}
      </Stack>
    </Box>
  )
}

/**
 * Parent-only, no-shame recap of the child's latest Knowledge Mine session,
 * surfaced on Today so the existing session summary/findings/recommendations
 * land where Shelly actually looks. Read-only — it renders existing data and
 * carries a lightweight local dismiss. Per-child clean (no name/isLincoln
 * gating). Deliberately never shows correct/total, percentages, or a level
 * number as a score (charter: diamonds-not-scores, questions-explored).
 */
export default function MineRecapCard({ session, childName }: MineRecapCardProps) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const findings = session.findings ?? []
  const strengths = uniqueSkills(findings.filter((f) => f.status === 'mastered'))
  const workingOn = uniqueSkills(
    findings.filter((f) => f.status === 'emerging' || f.status === 'not-yet'),
  )
  const suggestions = [...(session.recommendations ?? [])]
    .sort((a: EvaluationRecommendation, b: EvaluationRecommendation) => a.priority - b.priority)
    .map((r) => r.action?.trim())
    .filter((a): a is string => !!a)

  const label = domainLabel(session.domain)
  const whatLine = isScoreyFallbackSummary(session.summary)
    ? `${childName} spent time exploring ${label.toLowerCase()} in the Knowledge Mine.`
    : (session.summary as string)

  return (
    <SectionCard
      title={`${childName} explored the ${label} Mine`}
      action={
        <IconButton size="small" aria-label="Dismiss recap" onClick={() => setDismissed(true)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      }
    >
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          {whatLine}
        </Typography>
        <LabeledList label="Showing strength" items={strengths} />
        <LabeledList label="Working on" items={workingOn} />
        <LabeledList label="Suggestions" items={suggestions} />
      </Stack>
    </SectionCard>
  )
}
