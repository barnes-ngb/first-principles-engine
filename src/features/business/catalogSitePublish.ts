import { deleteObject, getMetadata, ref, uploadBytes } from 'firebase/storage'

import { storage } from '../../core/firebase/storage'
import type { CatalogProduct } from '../../core/types/business'
import { buildPublicCatalogHtml } from './publicCatalogPage'

/**
 * Publish / unpublish the Barnes Bros public catalog site (FEAT-84, design §4
 * Option C shipped as **C1**). The parent taps "Publish site", which renders the
 * `listed` products to a self-contained static page (`publicCatalogPage.ts`) and
 * uploads it to a **world-readable** Storage path. The family opens the returned
 * URL on a phone with no login.
 *
 * This is the only surface that writes to `public/catalog/**`, the single path
 * `storage.rules` exposes publicly. Republish = upload again (same path → same
 * stable URL). Unpublish = delete the object.
 *
 * The authed app and all `families/{familyId}/**` data stay owner-only — nothing
 * else is exposed (design §6).
 */

/** The well-known public path the storefront page lives at. */
export const PUBLIC_CATALOG_PATH = 'public/catalog/index.html'

/**
 * The stable, **token-less** public URL for the published page. It resolves
 * without a download token because `storage.rules` world-reads `public/catalog/**`,
 * so it never changes across republishes (unlike a `getDownloadURL` token URL).
 */
export function publicCatalogUrl(): string {
  const bucket = storage.app.options.storageBucket
  const encoded = encodeURIComponent(PUBLIC_CATALOG_PATH)
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media`
}

export interface PublishedState {
  /** The shareable public URL. */
  url: string
  /** ISO timestamp the page was last uploaded (Storage object `updated` time). */
  publishedAt: string
}

/**
 * Render the `listed` products and upload the page. Returns the shareable URL +
 * publish time. Content type is `text/html` so the URL renders inline in a
 * browser rather than downloading.
 */
export async function publishCatalogSite(products: CatalogProduct[]): Promise<PublishedState> {
  const html = buildPublicCatalogHtml(products)
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
  const objectRef = ref(storage, PUBLIC_CATALOG_PATH)
  await uploadBytes(objectRef, blob, {
    contentType: 'text/html; charset=utf-8',
    // Short cache so a republish is visible within minutes, not stuck for a day.
    cacheControl: 'public, max-age=300',
  })
  const meta = await getMetadata(objectRef)
  return { url: publicCatalogUrl(), publishedAt: meta.updated }
}

/**
 * Read the current published state, or `null` if the site was never published
 * (or was unpublished). Swallows the object-not-found error into `null`.
 */
export async function getPublishedState(): Promise<PublishedState | null> {
  try {
    const meta = await getMetadata(ref(storage, PUBLIC_CATALOG_PATH))
    return { url: publicCatalogUrl(), publishedAt: meta.updated }
  } catch {
    return null
  }
}

/** Take the site down — deletes the published page. Idempotent-ish (callers guard). */
export async function unpublishCatalogSite(): Promise<void> {
  await deleteObject(ref(storage, PUBLIC_CATALOG_PATH))
}
