/**
 * scanImageFormat — the ONE answer to "can the scanner read this picture?"
 * (UX-278).
 *
 * The vision call accepts exactly four image formats — the same four
 * `callClaudeWithVision` declares in `functions/src/ai/chatTypes.ts`. Anything
 * else has to be refused, **by name**, before an upload or a paid API call.
 *
 * The bug this replaces: `useScan.inferMediaType` returned `'image/jpeg'` for
 * every type it did not recognise, so a HEIC (or an AVIF, or a file the picker
 * handed over with no type at all) was declared JPEG and sent anyway. That
 * turns *"we can't read this format"* into *"corrupt payload"* — which is why
 * the failure read like an AI outage instead of a file problem.
 *
 * Pure and dependency-free: no DOM, no Firestore, no network.
 */

/** The image formats the vision API accepts. */
export const SCAN_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const
export type ScanMediaType = (typeof SCAN_MEDIA_TYPES)[number]

export function isScanMediaType(type: string | null | undefined): type is ScanMediaType {
  return (SCAN_MEDIA_TYPES as readonly string[]).includes((type ?? '').toLowerCase())
}

/**
 * A short human label for a format, for the refusal sentence — "HEIC", "AVIF",
 * "SVG". Falls back to the file's own extension when the picker handed over no
 * type, and to nothing at all when neither is usable (the copy then says so
 * rather than printing an empty pair of brackets).
 */
export function describeImageFormat(
  type: string | null | undefined,
  fileName?: string | null,
): string | null {
  const mime = (type ?? '').trim().toLowerCase()
  if (mime.startsWith('image/')) {
    // "image/svg+xml" → "SVG"; "image/heic-sequence" → "HEIC"
    const sub = mime.slice('image/'.length).split(/[+;-]/)[0]
    if (/^[a-z0-9.]{1,12}$/.test(sub)) return sub.replace(/^x\./, '').toUpperCase()
  }
  const ext = (fileName ?? '').split('.').pop() ?? ''
  if (ext && ext !== fileName && /^[A-Za-z0-9]{1,5}$/.test(ext)) return ext.toUpperCase()
  return null
}

/**
 * What the parent reads when a picture can't be sent. Names the format, names
 * what would work, and gives one thing to do — never "please try again", which
 * is what the app said when it had no idea what had gone wrong.
 */
export function unsupportedFormatMessage(
  type: string | null | undefined,
  fileName?: string | null,
): string {
  const label = describeImageFormat(type, fileName)
  const named = label ? `a ${label} file` : 'a format the scanner does not recognise'
  return (
    `Can't read this picture — it's ${named}, and the scanner needs a JPEG, PNG, GIF or WebP. ` +
    `Taking the photo with the camera instead of picking it from your gallery usually fixes it.`
  )
}
