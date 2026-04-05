import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

import type { CurriculumDomainMap, CurriculumNode } from '../../../core/curriculum/curriculumMap'
import { SKILL_TIER_ORDER } from '../../../core/curriculum/curriculumMap'
import type { SkillNodeStatus } from '../../../core/curriculum/skillStatus'
import SkillNodeCard from './SkillNodeCard'

const TIER_LABELS: Record<string, string> = {
  foundation: 'Foundation',
  building: 'Building',
  developing: 'Developing',
  applying: 'Applying',
  extending: 'Extending',
  mastering: 'Mastering',
}

const TIER_COLORS: Record<string, string> = {
  foundation: '#8d6e63',
  building: '#ef6c00',
  developing: '#fdd835',
  applying: '#66bb6a',
  extending: '#42a5f5',
  mastering: '#ab47bc',
}

interface DomainSectionProps {
  domainMap: CurriculumDomainMap
  getNodeStatus: (nodeId: string) => SkillNodeStatus | undefined
  onTapNode: (node: CurriculumNode) => void
}

export default function DomainSection({ domainMap, getNodeStatus, onTapNode }: DomainSectionProps) {
  return (
    <Box>
      {SKILL_TIER_ORDER.map((tier) => {
        const tierNodes = domainMap.nodes.filter((n) => n.tier === tier)
        if (tierNodes.length === 0) return null

        return (
          <Box key={tier} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: TIER_COLORS[tier],
                }}
              />
              <Typography variant="overline" sx={{ fontWeight: 700, color: TIER_COLORS[tier] }}>
                {TIER_LABELS[tier]}
              </Typography>
            </Box>
            <Grid container spacing={1}>
              {tierNodes.map((node) => (
                <Grid key={node.id} size={{ xs: 6, sm: 4, md: 3 }}>
                  <SkillNodeCard
                    node={node}
                    status={getNodeStatus(node.id)}
                    onTap={onTapNode}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>
        )
      })}
    </Box>
  )
}
