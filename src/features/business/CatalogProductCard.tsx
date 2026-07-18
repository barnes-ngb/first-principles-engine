import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { CatalogProduct } from '../../core/types/business'
import { BusinessItemTypeLabel, CatalogProductStatus } from '../../core/types/business'
import { productWantsPreview } from './catalogPreview'
import { formatPriceCents } from './catalogPrice'

interface CatalogProductCardProps {
  product: CatalogProduct
  /** Tap-to-edit — only wired for a parent (`canEdit`). */
  onClick?: () => void
}

/**
 * One catalog product card (FEAT-81) — image-or-placeholder, title, type, price,
 * "made by", and a status chip. A promoted kit with no image yet shows the
 * placeholder (design §3): the card is a pride-wall tile even before art exists.
 */
export default function CatalogProductCard({ product, onClick }: CatalogProductCardProps) {
  const cover = product.images[0]
  const isDraft = product.status === CatalogProductStatus.Draft

  return (
    <Box
      onClick={onClick}
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        ...(onClick ? { '&:hover': { borderColor: 'primary.main' } } : {}),
      }}
    >
      <Box
        sx={{
          height: 120,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {cover ? (
          <Box
            component="img"
            src={cover.url}
            alt={cover.alt ?? product.title}
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <ImageOutlinedIcon color="disabled" fontSize="large" aria-label="No image yet" />
        )}
      </Box>

      <Stack spacing={0.5} sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" noWrap sx={{ minWidth: 0 }}>
            {product.title}
          </Typography>
          {isDraft && <Chip size="small" label="Draft" variant="outlined" />}
          {product.status === CatalogProductStatus.Listed && (
            <Chip size="small" label="Listed" color="success" />
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {BusinessItemTypeLabel[product.type]} · {formatPriceCents(product.priceCents)}
        </Typography>
        {product.madeBy.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            Made by {product.madeBy.join(', ')}
          </Typography>
        )}
        {productWantsPreview(product) && (
          <Chip
            size="small"
            label="📖 Preview on"
            variant="outlined"
            sx={{ alignSelf: 'flex-start' }}
          />
        )}
      </Stack>
    </Box>
  )
}
