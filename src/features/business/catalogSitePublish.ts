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
 * tree `storage.rules` exposes publicly. The page is **scoped per family**
 * (`public/catalog/{familyId}/index.html`) so one family never clobbers another
 * and writes gate on `isOwner(familyId)`. Republish = upload again (same path →
 * same stable URL). Unpublish = delete the object.
 *
 * The authed app and all `families/{familyId}/**` data stay owner-only — nothing
 * else is exposed (design §6).
 */

/**
 * The well-known public path the storefront page lives at, **scoped per family**
 * (`public/catalog/{familyId}/index.html`). Namespacing by family mirrors the
 * per-`families/{familyId}` scoping used everywhere else, so one family's
 * Publish/Unpublish can never overwrite or take down another's, and the Storage
 * rule can gate writes on `isOwner(familyId)` (not merely "any authed user").
 */
export function publicCatalogPath(familyId: string): string {
  return `public/catalog/${familyId}/index.html`
}

/**
 * The clean, human-sayable address (FEAT-85). A **thin one-time redirect** —
 * `public/shop/index.html` in the app bundle, served at `/shop` on the app's
 * Hosting site (static files win over the SPA catch-all rewrite), which
 * `location.replace`s to the stable {@link publicCatalogUrl}. This is the
 * address to text or say aloud; the long Storage URL stays the direct link.
 *
 * It never needs redeploying on republish: the redirect points at the
 * token-less, **stable** Storage URL, so republish (a Storage upload) stays one
 * tap. Single-family for now — the redirect bakes one target (see the file's
 * header comment); a multi-family app would resolve `/shop` per user.
 */
export const PUBLIC_CATALOG_CLEAN_URL = 'https://first-principles-engine.web.app/shop'

/**
 * The stable, **token-less** public URL for the published page. It resolves
 * without a download token because `storage.rules` world-reads `public/catalog/**`,
 * so it never changes across republishes (unlike a `getDownloadURL` token URL).
 */
export function publicCatalogUrl(familyId: string): string {
  const bucket = storage.app.options.storageBucket
  const encoded = encodeURIComponent(publicCatalogPath(familyId))
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
export async function publishCatalogSite(
  familyId: string,
  products: CatalogProduct[],
): Promise<PublishedState> {
  const html = buildPublicCatalogHtml(products)
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
  const objectRef = ref(storage, publicCatalogPath(familyId))
  await uploadBytes(objectRef, blob, {
    contentType: 'text/html; charset=utf-8',
    // Short cache so a republish is visible within minutes, not stuck for a day.
    cacheControl: 'public, max-age=300',
  })
  const meta = await getMetadata(objectRef)
  return { url: publicCatalogUrl(familyId), publishedAt: meta.updated }
}

/**
 * Read the current published state, or `null` if the site was never published
 * (or was unpublished). Swallows the object-not-found error into `null`.
 */
export async function getPublishedState(familyId: string): Promise<PublishedState | null> {
  try {
    const meta = await getMetadata(ref(storage, publicCatalogPath(familyId)))
    return { url: publicCatalogUrl(familyId), publishedAt: meta.updated }
  } catch {
    return null
  }
}

/** Take the site down — deletes the published page. Idempotent-ish (callers guard). */
export async function unpublishCatalogSite(familyId: string): Promise<void> {
  await deleteObject(ref(storage, publicCatalogPath(familyId)))
}
