import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import PrintIcon from '@mui/icons-material/Print'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { CatalogProduct } from '../../core/types/business'
import { CatalogProductStatus } from '../../core/types/business'
import CatalogProductCard from './CatalogProductCard'
import CatalogProductForm from './CatalogProductForm'
import { buildCatalogSheetHtml, selectListedProducts } from './catalogSheet'
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
  const listedCount = selectListedProducts(products).length

  const handleSave = async (body: NewCatalogProduct, id?: string) => {
    if (id) {
      await updateProduct(id, body)
    } else {
      await createProduct(body)
    }
    setMode({ kind: 'list' })
  }

  /**
   * Open a print-optimized sheet of the `listed` products in a new window (design
   * §4 Option A). The parent prints / saves-to-PDF and hands it to a family — no
   * hosting, no checkout, read-only. Mirrors the compliance-report print in
   * `RecordsPage`.
   */
  const handleShareSheet = () => {
    const html = buildCatalogSheetHtml(products)
    const sheetWindow = window.open('', '_blank')
    if (sheetWindow) {
      sheetWindow.document.write(html)
      sheetWindow.document.close()
      sheetWindow.focus()
      sheetWindow.print()
    }
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
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ alignSelf: 'flex-start' }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setMode({ kind: 'new' })}>
            Add product
          </Button>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handleShareSheet}
            disabled={listedCount === 0}
          >
            Share / print sheet
          </Button>
        </Stack>
      )}

      {canEdit && listedCount === 0 && (
        <Typography variant="caption" color="text.secondary">
          Mark a product <strong>Listed</strong> to share a family sheet.
        </Typography>
      )}
    </Stack>
  )
}
