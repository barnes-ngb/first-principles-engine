import { useState } from 'react'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import type { ConceptualBlock } from '../../core/types'

interface FoundationsSectionProps {
  blocks: ConceptualBlock[]
  summary?: string
  loading?: boolean
}

function BlockCard({ block }: { block: ConceptualBlock }) {
  const [expanded, setExpanded] = useState(false)
  const isAddressNow = block.recommendation === 'ADDRESS_NOW'

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: isAddressNow ? 'warning.light' : 'info.light',
        borderRadius: 2,
        p: 2,
        bgcolor: isAddressNow ? 'warning.50' : 'info.50',
      }}
    >
      <Stack spacing={1}>
        {/* Header row: name + recommendation badge */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Typography variant="subtitle1" fontWeight={700}>
            {block.name}
          </Typography>
          <Chip
            label={isAddressNow ? 'Address Now' : 'Defer'}
            size="small"
            color={isAddressNow ? 'warning' : 'info'}
            sx={{ flexShrink: 0 }}
          />
        </Stack>

        {/* Affected skills chips */}
        {block.affectedSkills.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={0.5}>
            {block.affectedSkills.map((skill) => (
              <Chip key={skill} label={skill} size="small" variant="outlined" />
            ))}
          </Stack>
        )}

        {/* Rationale */}
        <Typography variant="body2" color="text.secondary">
          {block.rationale}
        </Typography>

        {/* Expandable strategies / defer note */}
        {(isAddressNow && block.strategies?.length) || (!isAddressNow && block.deferNote) ? (
          <Accordion
            expanded={expanded}
            onChange={() => setExpanded(!expanded)}
            disableGutters
            elevation={0}
            sx={{ bgcolor: 'transparent', '&:before': { display: 'none' } }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon fontSize="small" />}
              sx={{ p: 0, minHeight: 'unset', '& .MuiAccordionSummary-content': { m: 0 } }}
            >
              <Typography variant="body2" color="primary" sx={{ fontWeight: 500 }}>
                {isAddressNow ? 'What to try' : 'When to revisit'}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0, pt: 1 }}>
              {isAddressNow && block.strategies ? (
                <Stack spacing={0.5}>
                  {block.strategies.map((strategy, i) => (
                    <Typography key={i} variant="body2">
                      • {strategy}
                    </Typography>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2">{block.deferNote}</Typography>
              )}
            </AccordionDetails>
          </Accordion>
        ) : null}
      </Stack>
    </Box>
  )
}

function SkeletonCard() {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between">
          <Skeleton variant="text" width="40%" height={24} />
          <Skeleton variant="rectangular" width={80} height={24} sx={{ borderRadius: 4 }} />
        </Stack>
        <Stack direction="row" gap={0.5}>
          <Skeleton variant="rectangular" width={100} height={20} sx={{ borderRadius: 4 }} />
          <Skeleton variant="rectangular" width={80} height={20} sx={{ borderRadius: 4 }} />
        </Stack>
        <Skeleton variant="text" width="90%" />
        <Skeleton variant="text" width="70%" />
      </Stack>
    </Box>
  )
}

export default function FoundationsSection({ blocks, summary, loading }: FoundationsSectionProps) {
  if (!loading && blocks.length === 0) {
    // If explicitly loaded and empty, show the "no patterns" message
    if (summary !== undefined) {
      return (
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="h6" component="h2">
              Conceptual Foundations
            </Typography>
            <Tooltip title="Patterns across multiple skills that may point to an underlying gap">
              <InfoOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            </Tooltip>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {summary || 'No clear foundational patterns detected in this evaluation. This is a good sign — struggles appear skill-specific rather than conceptual.'}
          </Typography>
        </Stack>
      )
    }
    return null
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography variant="h6" component="h2">
          Conceptual Foundations
        </Typography>
        <Tooltip title="Patterns across multiple skills that may point to an underlying gap">
          <InfoOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        </Tooltip>
        {loading && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            Analyzing patterns...
          </Typography>
        )}
      </Stack>

      {loading ? (
        <Stack spacing={1.5}>
          <SkeletonCard />
          <SkeletonCard />
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          {blocks.map((block, i) => (
            <BlockCard key={`${block.name}-${i}`} block={block} />
          ))}
        </Stack>
      )}
    </Stack>
  )
}
