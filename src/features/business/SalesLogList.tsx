import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { BusinessItemTypeLabel } from '../../core/types/business'
import type { BusinessLogEntry } from '../../core/types/business'
import { formatDateShort } from '../../core/utils/dateKey'
import { formatMoney } from './businessTotal'

interface SalesLogListProps {
  entries: BusinessLogEntry[]
  /** Confirmed money-in total (FEAT-30 chunk 4) — the honest headline figure. */
  confirmedTotal: number
  /** Full money-in total (confirmed + pending), for the neutral pending hint. */
  total: number
  loading: boolean
  /**
   * Parent mode (FEAT-30 chunk 4). When true the per-entry confirm / unconfirm /
   * remove controls render. In kid mode the controls are absent — pending sales
   * are still visible (so Lincoln sees what he logged) but not confirmable.
   */
  canConfirm: boolean
  onConfirm: (id: string) => void
  onUnconfirm: (id: string) => void
  onRemove: (id: string) => void
}

/**
 * Sales/earnings log + the confirmed running total (FEAT-30 chunk 4).
 *
 * Entries are most-recent-first (the hook orders by date desc). The headline is
 * the CONFIRMED total — the meter only climbs on parent-OK'd money. Each entry
 * carries a neutral status badge (Confirmed ✓ / Waiting to be confirmed);
 * pending is framed as "not yet counted," never a loss — the meter never drops.
 */
export default function SalesLogList({
  entries,
  confirmedTotal,
  total,
  loading,
  canConfirm,
  onConfirm,
  onUnconfirm,
  onRemove,
}: SalesLogListProps) {
  const pendingTotal = Math.max(0, total - confirmedTotal)

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
          {formatMoney(confirmedTotal)}
        </Typography>
        <Typography variant="body2">earned so far</Typography>
      </Box>

      {pendingTotal > 0 && (
        <Typography variant="body2" color="text.secondary" textAlign="center">
          {formatMoney(pendingTotal)} logged and waiting to be confirmed — it counts as soon as
          a parent OKs it.
        </Typography>
      )}

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
          {entries.map((entry) => {
            const confirmed = entry.confirmed === true
            return (
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
                  <Typography variant="caption" color="text.secondary" display="block">
                    {formatDateShort(entry.date)}
                  </Typography>
                  {entry.note && (
                    <Typography variant="body2" color="text.secondary">
                      {entry.note}
                    </Typography>
                  )}
                  <Box sx={{ mt: 0.5 }}>
                    {confirmed ? (
                      <Chip
                        size="small"
                        color="success"
                        icon={<CheckCircleIcon />}
                        label="Confirmed"
                      />
                    ) : (
                      <Chip
                        size="small"
                        variant="outlined"
                        icon={<HourglassEmptyIcon />}
                        label="Waiting to be confirmed"
                      />
                    )}
                  </Box>
                  {canConfirm && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      {confirmed ? (
                        <Button size="small" variant="text" onClick={() => onUnconfirm(entry.id)}>
                          Unconfirm
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={() => onConfirm(entry.id)}
                        >
                          Confirm
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="text"
                        color="error"
                        onClick={() => onRemove(entry.id)}
                      >
                        Remove
                      </Button>
                    </Stack>
                  )}
                </Box>
                <Typography variant="body1" fontWeight={700} whiteSpace="nowrap">
                  {formatMoney(entry.amount)}
                </Typography>
              </Stack>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}
