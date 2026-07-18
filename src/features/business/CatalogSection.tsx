import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { CatalogProduct } from '../../core/types/business'
import { CatalogProductStatus } from '../../core/types/business'
import CatalogProductCard from './CatalogProductCard'
import CatalogProductForm from './CatalogProductForm'
import type { NewCatalogProduct } from './useCatalogProducts'
import { useCatalogProducts } from './useCatalogProducts'

/** List, or the form (new product / editing an existing one). */
type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; product: CatalogProduct }

interface CatalogSectionProps {
  /** Parent gate — only a parent authors, prices, and sets status (§6). */
  canEdit: boolean
}

/**
 * The Barnes Bros catalog — the "show" surface (FEAT-81, design §3). A sibling
 * region on `BusinessPage`: a pride wall of the boys' products, each an
 * image-or-placeholder card. Parent-curated — the add/edit form and status are
 * `canEdit`-gated. Family-scoped (a catalog is the family's storefront).
 *
 * `retired` products are hidden from this default view (design §3).
 */
export default function CatalogSection({ canEdit }: CatalogSectionProps) {
  const { products, loading, createProduct, updateProduct } = useCatalogProducts()
  const [mode, setMode] = useState<Mode>({ kind: 'list' })

  const shown = products.filter((p) => p.status !== CatalogProductStatus.Retired)

  const handleSave = async (body: NewCatalogProduct, id?: string) => {
    if (id) {
      await updateProduct(id, body)
    } else {
      await createProduct(body)
    }
    setMode({ kind: 'list' })
  }

  if (mode.kind === 'new' || mode.kind === 'edit') {
    const editing = mode.kind === 'edit' ? mode.product : undefined
    return (
      <CatalogProductForm
        initial={editing}
        onSave={(body) => handleSave(body, editing?.id)}
        onCancel={() => setMode({ kind: 'list' })}
      />
    )
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Your catalog — everything the Barnes Bros make. Promote a kit or add a product to show it
        here.
      </Typography>

      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      ) : shown.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No products yet — promote a kit or add one.
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
            gap: 1.5,
          }}
        >
          {shown.map((p) => (
            <CatalogProductCard
              key={p.id}
              product={p}
              onClick={canEdit ? () => setMode({ kind: 'edit', product: p }) : undefined}
            />
          ))}
        </Box>
      )}

      {canEdit && (
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setMode({ kind: 'new' })}
          sx={{ alignSelf: 'flex-start' }}
        >
          Add product
        </Button>
      )}
    </Stack>
  )
}
