import Button from '@mui/material/Button'
import StorefrontIcon from '@mui/icons-material/Storefront'

import { useChildren } from '../../core/hooks/useChildren'
import type { Sticker } from '../../core/types'
import CatalogPromoteDialog from '../business/CatalogPromoteDialog'
import { isSourceInCatalog, stickerToCatalogInitial } from '../business/catalogOnramps'
import { useCatalogProducts } from '../business/useCatalogProducts'

/**
 * Catalog on-ramp glue for the sticker surface (FEAT-82). Both pieces below own
 * the catalog hooks (`useChildren` / `useCatalogProducts`) so that
 * `StickerLibraryTab` never takes that dependency at its top level — the kid /
 * Settings-admin render (`canEdit=false`) mounts neither, keeping those
 * surfaces (and their tests) free of the catalog subscription. Pricing /
 * publishing is parent-only (design §6); these only ever appear behind
 * `canEdit`.
 */

interface StickerCatalogButtonProps {
  sticker: Sticker
  /** Called with the sticker when the parent taps "Add to catalog". */
  onPromote: (sticker: Sticker) => void
}

/**
 * The "Add to catalog" action for the sticker preview. Reads the catalog only
 * to dedup — if this sticker is already promoted it shows a disabled "In
 * catalog" instead. Never mutates the sticker.
 */
export function StickerCatalogButton({ sticker, onPromote }: StickerCatalogButtonProps) {
  const { products } = useCatalogProducts()
  const inCatalog = isSourceInCatalog(products, { kind: 'sticker', id: sticker.id ?? '' })
  return (
    <Button
      startIcon={<StorefrontIcon />}
      disabled={inCatalog}
      onClick={() => onPromote(sticker)}
    >
      {inCatalog ? 'In catalog' : 'Add to catalog'}
    </Button>
  )
}

interface StickerCatalogPromoteDialogProps {
  /** Sticker being promoted, or `null` when the dialog is closed. */
  sticker: Sticker | null
  onClose: () => void
}

/**
 * Hosts the shared `CatalogPromoteDialog`, pre-filling it from the sticker via
 * the pure `stickerToCatalogInitial` (title / real image / `StickerSheet` type /
 * `sourceRef`). Read-only of the sticker; the write happens inside
 * `CatalogPromoteDialog` via `useCatalogProducts.createProduct`.
 */
export function StickerCatalogPromoteDialog({ sticker, onClose }: StickerCatalogPromoteDialogProps) {
  const { children } = useChildren()
  return (
    <CatalogPromoteDialog
      initial={sticker ? stickerToCatalogInitial(sticker, children) : null}
      onClose={onClose}
    />
  )
}
