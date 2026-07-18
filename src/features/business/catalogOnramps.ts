import type { Book, Sticker } from '../../core/types'
import type { CatalogProduct, CatalogSourceRef } from '../../core/types/business'
import { BusinessItemType } from '../../core/types/business'
import type { NewCatalogProduct } from './useCatalogProducts'

/**
 * Catalog on-ramps (FEAT-82) — pure pre-fill + gating helpers that turn a
 * finished Book or a sticker into the initial values for `CatalogProductForm`,
 * mirroring FEAT-81's roster promote. **Read-only of the source**: every helper
 * only *reads* the Book/Sticker to build a plain object — it never mutates it,
 * and the surfaces only ever call `useCatalogProducts.createProduct` (design
 * §5/§6). Kept pure so the pre-fill + dedup + gating are unit-testable without
 * rendering the heavy Books / sticker surfaces.
 */

/** Minimal child shape needed to resolve `madeBy` credits from ids/profiles. */
export interface NamedChild {
  id: string
  name: string
}

/**
 * Pre-fill a catalog product from a **finished** Book. Title from the book,
 * `images[0]` = the real cover URL (falling back to the first page image so the
 * card shows actual art, never a placeholder — the win of this on-ramp), type
 * `Book`, `madeBy` from the book's child (or all contributors on a Together
 * book), `sourceRef {kind:'book', id}`. Price + status are left for the parent
 * to set in the form (§6). Never mutates `book`.
 */
export function bookToCatalogInitial(book: Book, children: NamedChild[]): Partial<NewCatalogProduct> {
  const nameById: Record<string, string> = {}
  for (const c of children) nameById[c.id] = c.name

  const makers =
    book.isTogetherBook && book.contributorIds?.length
      ? book.contributorIds.map((id) => nameById[id]).filter(Boolean)
      : [nameById[book.childId]].filter(Boolean)

  // Real cover first; fall back to the first page image (same resolution the
  // bookshelf card uses). Empty only when the book genuinely has no art.
  const cover = book.coverImageUrl ?? book.pages.find((p) => p.images.length > 0)?.images[0]?.url

  return {
    title: book.title.trim() || 'Untitled book',
    type: BusinessItemType.Book,
    madeBy: makers,
    images: cover ? [{ url: cover, alt: book.title }] : [],
    sourceRef: { kind: 'book', id: book.id ?? '' },
  }
}

/**
 * Pre-fill a catalog product from a single sticker. Stickers are individual —
 * there is no "set" concept in `stickerLibrary` today (a `sourceDrawingId`
 * groups *versions of one drawing*, not a sellable set), so a promote lists one
 * sticker as a `StickerSheet` product with its one image; set-grouping is a
 * future decision, not invented here. Title from the label, `images[0]` = the
 * real sticker URL, `madeBy` from the sticker's child profile when it names one.
 * Never mutates `sticker`.
 */
export function stickerToCatalogInitial(
  sticker: Sticker,
  children: NamedChild[],
): Partial<NewCatalogProduct> {
  const profile = sticker.childProfile
  const maker =
    profile && profile !== 'both'
      ? children.find((c) => c.name.toLowerCase() === profile)?.name
      : undefined

  return {
    title: sticker.label.trim() || 'Sticker',
    type: BusinessItemType.StickerSheet,
    madeBy: maker ? [maker] : [],
    images: [{ url: sticker.url, alt: sticker.label }],
    sourceRef: { kind: 'sticker', id: sticker.id ?? '' },
  }
}

/** Stable key for a source reference, used to dedup already-promoted sources. */
export function catalogSourceKey(ref: CatalogSourceRef): string {
  return `${ref.kind}:${ref.id}`
}

/**
 * True when a product promoted from this exact source already exists — the cheap
 * dedup nicety so the affordance can say "In catalog" instead of re-adding.
 */
export function isSourceInCatalog(products: CatalogProduct[], ref: CatalogSourceRef): boolean {
  const key = catalogSourceKey(ref)
  return products.some((p) => p.sourceRef && catalogSourceKey(p.sourceRef) === key)
}

/**
 * Gate for the Book → catalog affordance: parent-only (pricing/publishing is
 * parent-only — §6) **and** the book is finished. A kid profile (`canEdit`
 * false) never sees it.
 */
export function canPromoteBook(book: Book, canEdit: boolean): boolean {
  return canEdit && book.status === 'complete' && !!book.id
}

/**
 * Gate for the Sticker → catalog affordance: parent-only (§6). A kid profile
 * (`canEdit` false) never sees it.
 */
export function canPromoteSticker(sticker: Sticker, canEdit: boolean): boolean {
  return canEdit && !!sticker.id
}
