// ── Sticker art export — production downloads (FEAT-93) ────────────────
//
// The missing production link: the owner needs to DOWNLOAD sticker art with
// clean, print-ready names to (a) print on home sticker paper for orders and
// (b) upload to a die-cut sticker service for batches. Everything here is
// read-only — pure name-builders + a thin fetch→blob→download side-effect layer.
// No writes anywhere (no roster / product / learner-model / hours / XP touch).
//
// Two art sources this slice serves (design §Step 1):
//   1. A `KitRoster`'s per-character `art` refs (FEAT-88) — every generated
//      character sticker, named kit-scoped: `neptune-hero-link.png`.
//   2. A `CatalogProduct`'s `images[]` (FEAT-81) — the product's art, named
//      `{product-title-slug}-{n}.png`.
//
// **Cross-origin note.** Storage download URLs are a different origin than the
// app, so the anchor `download` attribute is ignored on a direct link. We fetch
// each image to a Blob first (Storage CORS allows `GET` from any origin —
// `storage-cors.json`), then download the Blob. Multi-file downloads zip via
// JSZip (already a dep, used by the compliance pack); a single image downloads
// directly. **No manifest file this slice** (a future upgrade).

import JSZip from 'jszip'

import type { CatalogProduct, KitRoster } from '../../core/types/business'
import { rosterCharacters } from './kitArt'

/** One art file to download: a Storage URL + the production filename it lands as. */
export interface ArtDownload {
  /** Firebase Storage download URL of the already-generated image. */
  url: string
  /** Production filename, e.g. `neptune-hero-link.png` (includes the extension). */
  filename: string
}

// ── Naming ────────────────────────────────────────────────────────────

/** Cap on a single filename segment — keeps a runaway kid paste from a giant name. */
export const NAME_SEGMENT_CAP = 40

/**
 * Kebab slug of a verbatim kid/product string, safe for a filename segment:
 * lowercase, non-alphanumerics → single `-`, trimmed, length-capped. Returns
 * `''` for an all-symbol / empty input (callers supply a fallback). Deliberately
 * does NOT preserve case or spelling — this is a filename, not the kid's words.
 */
export function slugifySegment(text: string, cap = NAME_SEGMENT_CAP): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, cap)
    .replace(/-+$/g, '')
}

/**
 * Number any colliding stems so a set of filenames is unique: the first
 * occurrence keeps its stem, later duplicates get `-2`, `-3`, … Pure — the input
 * order is preserved. (Kit character labels already carry an index, so this is
 * belt-and-suspenders for e.g. two identically-named invaders.)
 */
export function dedupeStems<T extends { stem: string }>(items: T[]): Array<T & { unique: string }> {
  const counts = new Map<string, number>()
  return items.map((it) => {
    const n = (counts.get(it.stem) ?? 0) + 1
    counts.set(it.stem, n)
    return { ...it, unique: n === 1 ? it.stem : `${it.stem}-${n}` }
  })
}

/**
 * Build the ordered, collision-safe download list for a roster's generated art
 * (FEAT-88). Kit-scoped, kebab-cased from the kid's verbatim names, hero → first:
 *   - hero "Link" in kit "Neptune" → `neptune-hero-link.png`
 *   - defender 1 "Fender"          → `neptune-defender-1-fender.png`
 *   - invader 2 "Super Smart Zombie" → `neptune-invader-2-super-smart-zombie.png`
 * Only characters that actually have art are included; a nameless-but-drawn
 * character falls back to its role label (`neptune-defender-2.png`). Pure.
 */
export function buildKitArtDownloads(roster: KitRoster): ArtDownload[] {
  const art = roster.art ?? {}
  const kit = slugifySegment(roster.vaultName) || 'kit'
  const withArt = rosterCharacters(roster).filter((c) => art[c.key]?.url)
  const stems = withArt.map((c) => {
    const role = slugifySegment(c.label) // "Defender 1" → "defender-1"
    const name = slugifySegment(c.name)
    const stem = name ? `${kit}-${role}-${name}` : `${kit}-${role}`
    return { url: art[c.key]!.url, stem }
  })
  return dedupeStems(stems).map((s) => ({ url: s.url, filename: `${s.unique}.png` }))
}

/**
 * Build the download list for a catalog product's images (FEAT-81), named
 * `{product-title-slug}-{n}.png` (1-based). Empty-URL refs are skipped; the
 * position index keeps names unique without a dedupe pass. `title` is passed in
 * so the surface can use the parent's live (unsaved) title. Pure.
 */
export function buildProductImageDownloads(
  product: Pick<CatalogProduct, 'images'>,
  title: string,
): ArtDownload[] {
  const slug = slugifySegment(title) || 'product'
  return product.images
    .filter((img) => img.url)
    .map((img, i) => ({ url: img.url, filename: `${slug}-${i + 1}.png` }))
}

/** Zip filename for a roster's art bundle. */
export function kitArtZipName(roster: KitRoster): string {
  return `${slugifySegment(roster.vaultName) || 'kit'}-stickers.zip`
}

/** Zip filename for a product's image bundle. */
export function productImagesZipName(title: string): string {
  return `${slugifySegment(title) || 'product'}-stickers.zip`
}

// ── Download side-effects (thin) ──────────────────────────────────────

/** Fetch a Storage image to a Blob. Throws on a non-OK response. */
export async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch image (${res.status})`)
  return res.blob()
}

/** Trigger a client-side Blob download (objectURL + anchor). Thin, side-effecting. */
export function triggerBlobDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Download a set of art files: one image downloads directly, many zip into
 * `zipName` (JSZip). No-op on an empty list. Fetches every URL to a Blob first
 * (the cross-origin `download` attr is ignored on a raw Storage link). Reads
 * only — writes nothing anywhere.
 */
export async function downloadArtFiles(files: ArtDownload[], zipName: string): Promise<void> {
  if (files.length === 0) return
  if (files.length === 1) {
    const blob = await fetchImageBlob(files[0].url)
    triggerBlobDownload(files[0].filename, blob)
    return
  }
  const zip = new JSZip()
  const blobs = await Promise.all(files.map((f) => fetchImageBlob(f.url)))
  blobs.forEach((blob, i) => zip.file(files[i].filename, blob))
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  triggerBlobDownload(zipName, zipBlob)
}
