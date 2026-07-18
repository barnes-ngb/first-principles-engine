import { doc, getDoc } from 'firebase/firestore'
import { deleteObject, getMetadata, ref, uploadBytes } from 'firebase/storage'

import { booksCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import type { Book } from '../../core/types'
import type { CatalogProduct } from '../../core/types/business'
import type { CatalogPreview } from './catalogPreview'
import { buildBookPreview, productWantsPreview } from './catalogPreview'
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
 * The dedicated **short** catalog address (FEAT-86): its own Firebase Hosting
 * site (`shop` deploy target) whose single page (`shop-site/index.html`)
 * `location.replace`s to the stable {@link publicCatalogUrl}. This is the
 * shortest, most sayable address — the one to text or say aloud.
 *
 * Non-empty here means the redirect target is baked and the site is expected
 * live, so the in-app "live" panel promotes THIS as the primary Copy-link
 * address (Codex P1 rule from FEAT-85: only promote a link that will actually
 * work) and keeps the long Storage URL as a labeled direct link. Empty string
 * would fall back to FEAT-85's `/shop`-note behavior.
 *
 * If the create-shop-site workflow lands a **fallback** name (not `barnesbro`),
 * update this constant AND `.firebaserc`'s `shop` target together.
 */
export const PUBLIC_CATALOG_SHORT_URL = 'https://barnesbro.web.app'

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

/**
 * The public order endpoint the baked form POSTs to (FEAT-88). The
 * `submitCatalogOrder` v2 `onRequest` function has no region override, so it
 * lives at the default `us-central1` and is reachable at the deterministic
 * `cloudfunctions.net` alias. Baked into the published page at publish time —
 * the SAME "bake it at publish, not build" pattern as the catalog URL (the
 * familyId is the parent's runtime UID, unknowable at build time).
 */
export function catalogOrderEndpoint(projectId: string): string {
  return `https://us-central1-${projectId}.cloudfunctions.net/submitCatalogOrder`
}

export interface PublishedState {
  /** The shareable public URL. */
  url: string
  /** ISO timestamp the page was last uploaded (Storage object `updated` time). */
  publishedAt: string
}

/**
 * Resolve the opt-in book previews (FEAT-85) for the LISTED products that asked
 * for one. For each `status:'listed'` product with `includePreview` and a
 * `sourceRef.kind === 'book'`, fetch the source Book and project its cover +
 * first N pages via the pure `buildBookPreview`. Read-only + additive:
 * per-product fetch failures (or an empty preview) are swallowed so a missing /
 * deleted book never blocks publish — that product simply publishes without a
 * peek. Products without the flag are never fetched.
 */
async function resolveBookPreviews(
  familyId: string,
  products: CatalogProduct[],
): Promise<Record<string, CatalogPreview>> {
  const wanted = products.filter(
    (p) => p.status === 'listed' && productWantsPreview(p) && p.sourceRef?.id,
  )
  const entries = await Promise.all(
    wanted.map(async (p): Promise<[string, CatalogPreview] | null> => {
      try {
        const snap = await getDoc(doc(booksCollection(familyId), p.sourceRef!.id))
        if (!snap.exists()) return null
        const book = { ...(snap.data() as Book), id: snap.id }
        const preview = buildBookPreview(book, p.previewPageCount)
        return preview.pages.length > 0 ? [p.id, preview] : null
      } catch {
        return null
      }
    }),
  )
  return Object.fromEntries(entries.filter((e): e is [string, CatalogPreview] => e !== null))
}

/**
 * Render the `listed` products and upload the page. Returns the shareable URL +
 * publish time. Content type is `text/html` so the URL renders inline in a
 * browser rather than downloading.
 *
 * Opt-in book previews (FEAT-85) are resolved first and baked inline into the
 * page — the peek pages hotlink the same tokenized Storage URLs as the covers,
 * so publish stays a single-file upload with no new Storage objects or rules.
 */
export async function publishCatalogSite(
  familyId: string,
  products: CatalogProduct[],
): Promise<PublishedState> {
  const previews = await resolveBookPreviews(familyId, products)
  // Bake the order endpoint + familyId so the published form can POST (FEAT-88).
  // projectId is a runtime firebase-app option, same source as the bucket above.
  const projectId = storage.app.options.projectId
  const orderConfig = projectId
    ? { endpoint: catalogOrderEndpoint(projectId), familyId }
    : undefined
  const html = buildPublicCatalogHtml(products, previews, orderConfig)
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
