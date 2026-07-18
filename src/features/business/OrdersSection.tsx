import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { CatalogOrder } from '../../core/types/business'
import {
  CATALOG_ORDER_STATUS_FLOW,
  CatalogOrderStatus,
  CatalogOrderStatusLabel,
  nextOrderStatus,
} from '../../core/types/business'
import { useCatalogOrders } from './useCatalogOrders'

/** MUI Chip color per status — a warm progression, never alarming. */
const STATUS_COLOR: Record<
  CatalogOrder['status'],
  'default' | 'info' | 'warning' | 'success'
> = {
  [CatalogOrderStatus.New]: 'info',
  [CatalogOrderStatus.Making]: 'warning',
  [CatalogOrderStatus.Ready]: 'success',
  [CatalogOrderStatus.Delivered]: 'default',
}

/**
 * The forward-only status stepper for one order. Renders the flow as chips with
 * the current step highlighted, plus a single "advance" button. There is no back
 * button by design — the mechanic only ever moves forward (design §6).
 */
function StatusStepper({
  order,
  onAdvance,
}: {
  order: CatalogOrder
  onAdvance: () => void
}) {
  const next = nextOrderStatus(order.status)
  const currentIndex = CATALOG_ORDER_STATUS_FLOW.indexOf(order.status)

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
        {CATALOG_ORDER_STATUS_FLOW.map((status, i) => {
          const isCurrent = status === order.status
          const isPast = i < currentIndex
          return (
            <Chip
              key={status}
              size="small"
              label={CatalogOrderStatusLabel[status]}
              color={isCurrent ? STATUS_COLOR[status] : 'default'}
              variant={isCurrent || isPast ? 'filled' : 'outlined'}
              sx={{ opacity: isCurrent || isPast ? 1 : 0.55 }}
            />
          )
        })}
      </Stack>
      {next ? (
        <Button
          size="small"
          variant="contained"
          endIcon={<ArrowForwardIcon />}
          onClick={onAdvance}
          sx={{ alignSelf: 'flex-start' }}
        >
          Mark {CatalogOrderStatusLabel[next]}
        </Button>
      ) : (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'success.main' }}>
          <CheckCircleIcon fontSize="small" />
          <Typography variant="caption">Delivered — nice work! 🎉</Typography>
        </Stack>
      )}
    </Stack>
  )
}

/** One order card — customer name, picks, note, contact, and the stepper. */
function OrderCard({
  order,
  onAdvance,
}: {
  order: CatalogOrder
  onAdvance: () => void
}) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: order.status === CatalogOrderStatus.New ? 'info.main' : 'divider',
        borderRadius: 2,
        p: 1.5,
        bgcolor: 'background.paper',
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="baseline" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight="bold">
            {order.customerName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {new Date(order.createdAt).toLocaleDateString()}
          </Typography>
        </Stack>

        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {order.items.map((item, i) => (
            <Typography key={`${item.productId}-${i}`} component="li" variant="body2">
              {item.title}
            </Typography>
          ))}
        </Box>

        {order.note && (
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            “{order.note}”
          </Typography>
        )}

        {order.contact && (
          <Typography variant="caption" color="text.secondary">
            Contact: {order.contact}
          </Typography>
        )}

        <StatusStepper order={order} onAdvance={onAdvance} />
      </Stack>
    </Box>
  )
}

/**
 * The Barnes Bros order queue (FEAT-89) — a sibling region on `BusinessPage`. A
 * family picks products on the public catalog site and says who they are; each
 * order lands here for the kids to fulfill and track. Newest first; a "🎉 New
 * order!" affordance whenever an unstarted order is waiting. Advancing status is
 * NOT parent-gated — the making is the kids' work (design §6).
 */
export default function OrdersSection() {
  const { orders, loading, advanceStatus } = useCatalogOrders()

  const newCount = orders.filter((o) => o.status === CatalogOrderStatus.New).length

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Orders from families who picked their favorites on your catalog. Step each one forward as you
        make and deliver it.
      </Typography>

      {newCount > 0 && (
        <Box
          sx={{
            bgcolor: 'info.main',
            color: 'info.contrastText',
            borderRadius: 999,
            px: 2,
            py: 0.75,
            alignSelf: 'flex-start',
            fontWeight: 'bold',
          }}
        >
          🎉 New order{newCount > 1 ? `s (${newCount})` : ''}!
        </Box>
      )}

      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      ) : orders.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No orders yet — share your catalog link and they’ll show up here. 🌱
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onAdvance={() => advanceStatus(order.id, order.status)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  )
}
