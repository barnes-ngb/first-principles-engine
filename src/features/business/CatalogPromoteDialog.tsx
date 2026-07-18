import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'

import CatalogProductForm from './CatalogProductForm'
import type { NewCatalogProduct } from './useCatalogProducts'
import { useCatalogProducts } from './useCatalogProducts'

interface CatalogPromoteDialogProps {
  /** Pre-filled product values from the source (Book / sticker). `null` ⇒ closed. */
  initial: Partial<NewCatalogProduct> | null
  onClose: () => void
}

/**
 * Shared "Add to catalog" dialog (FEAT-82). Wraps `CatalogProductForm`
 * pre-filled from a source artifact and writes **only** via
 * `useCatalogProducts.createProduct` — the promote is read-only of the Book /
 * sticker it came from (design §5/§6). Reused by the Books and sticker
 * on-ramps so both share one write path and one parent-confirm step.
 */
export default function CatalogPromoteDialog({ initial, onClose }: CatalogPromoteDialogProps) {
  const { createProduct } = useCatalogProducts()

  const handleSave = async (body: NewCatalogProduct) => {
    await createProduct(body)
    onClose()
  }

  return (
    <Dialog open={!!initial} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add to catalog</DialogTitle>
      <DialogContent>
        {initial && (
          <CatalogProductForm initial={initial} onSave={handleSave} onCancel={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}
