import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { BusinessItemTypeLabel } from '../../core/types/business'
import type { BusinessLogEntry } from '../../core/types/business'
import { formatDateShort } from '../../core/utils/dateKey'
import { formatMoney } from './businessTotal'

interface SalesLogListProps {
  entries: BusinessLogEntry[]
  /** Derived money-in total (additive — only ever climbs). */
  total: number
  loading: boolean
}

/**
 * Sales/earnings log + the prominent running total (FEAT-30 chunk 2).
 *
 * Entries are most-recent-first (the hook orders by date desc). The total is
 * the derived, additive money-in figure the chunk-3 thermometer climbs on.
 */
export default function SalesLogList({ entries, total, loading }: SalesLogListProps) {
  return (
    <Stack spacing={2}>
      <Box
        sx={{
          borderRadius: 2,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          p: 2,
          textAlign: 'center',
        }}
      >
        <Typography variant="h4" component="p" fontWeight={700}>
          {formatMoney(total)}
        </Typography>
        <Typography variant="body2">earned so far</Typography>
      </Box>

      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading your sales…
        </Typography>
      ) : entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No sales logged yet — log your first one!
        </Typography>
      ) : (
        <Stack divider={<Divider flexItem />} spacing={1}>
          {entries.map((entry) => (
            <Stack
              key={entry.id}
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
              spacing={2}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body1" fontWeight={600}>
                  {BusinessItemTypeLabel[entry.itemType] ?? entry.itemType}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDateShort(entry.date)}
                </Typography>
                {entry.note && (
                  <Typography variant="body2" color="text.secondary">
                    {entry.note}
                  </Typography>
                )}
              </Box>
              <Typography variant="body1" fontWeight={700} whiteSpace="nowrap">
                {formatMoney(entry.amount)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
