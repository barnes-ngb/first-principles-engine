import type { Book } from '../../core/types'
import type { CatalogProduct } from '../../core/types/business'

/**
 * Opt-in book preview (FEAT-85, design §4) — pure helpers shared by the product
 * form (which offers the toggle) and the public-page builder (which renders it).
 *
 * A preview is **partial and parent-gated**: cover + the first N inside pages of
 * a Book product, never the whole book (the book IS the product). It is only
 * meaningful for a `status:'listed'` product promoted from a Book
 * (`sourceRef.kind === 'book'`) with `includePreview` set. Everything here is a
 * read of already-generated data — page image URLs are the SAME tokenized
 * Storage URLs FEAT-84 hotlinks; nothing is regenerated, uploaded, or written.
 */

/** Default number of inside pages a preview shows — a taste, not the book. */
export const PREVIEW_DEFAULT_PAGES = 3
/** Hard cap on preview pages (§4): never more than a peek. */
export const PREVIEW_MAX_PAGES = 5

/**
 * Clamp a requested page count into `[1, PREVIEW_MAX_PAGES]`, defaulting to
 * {@link PREVIEW_DEFAULT_PAGES} when unset/invalid. Both the form and the
 * builder route through this so the cap can never be exceeded by a stale or
 * hand-edited value.
 */
export function clampPreviewPageCount(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return PREVIEW_DEFAULT_PAGES
  return Math.min(PREVIEW_MAX_PAGES, Math.max(1, Math.floor(n)))
}

/** True when a product is eligible for a book preview — listed, opted-in, book-sourced. */
export function productWantsPreview(p: CatalogProduct): boolean {
  return !!p.includePreview && p.sourceRef?.kind === 'book'
}

/** One inside page of a preview — an image and/or its story text. */
export interface CatalogPreviewPage {
  /** Tokenized Storage URL of the page's first image (hotlinked, never copied). */
  imageUrl?: string
  /** Page story text, if the page carries any. */
  text?: string
}

/** The resolved, render-ready preview for one product. */
export interface CatalogPreview {
  /** Cover image URL (falls back to the first page image, as the bookshelf does). */
  coverUrl?: string
  /** The first N inside pages, in order. */
  pages: CatalogPreviewPage[]
}

/**
 * Project a Book into a **partial** preview: cover + the first `count` inside
 * pages (clamped ≤ {@link PREVIEW_MAX_PAGES}). Pure and read-only — it never
 * mutates the book, and pulls only existing image URLs + text. A page with
 * neither an image nor text is dropped, so an empty preview can be skipped.
 */
export function buildBookPreview(book: Book, count: number | undefined): CatalogPreview {
  const n = clampPreviewPageCount(count)
  const coverUrl =
    book.coverImageUrl ?? book.pages.find((p) => p.images.length > 0)?.images[0]?.url

  const pages: CatalogPreviewPage[] = []
  for (const page of [...book.pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    if (pages.length >= n) break
    const imageUrl = page.images[0]?.url
    const text = page.text?.trim() || undefined
    if (!imageUrl && !text) continue
    pages.push({ imageUrl, text })
  }

  return { coverUrl, pages }
}
