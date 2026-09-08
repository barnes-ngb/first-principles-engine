/**
 * scanFailureNote — the diagnostic prefix carried on a reported scan failure
 * (UX-276).
 *
 * The owner asked for these to be logged so they can be grabbed. What makes a
 * scan failure diagnosable is the SHAPE of the picture — its declared type, its
 * size, whether compression ran, what type we ended up declaring, and which
 * door it came from. What must never leave the device is the picture itself or
 * anything naming a child: no bytes, no file name, no storage path, no URL.
 *
 * The note is written to survive `redactText` intact — no quotes, no URLs, no
 * runs of four or more digits — so what lands in Diagnostics is what was meant.
 * Pure: no DOM, no Firestore, no `File`.
 */

/**
 * Which scan door a failure came from. A static developer label — one per
 * surface that holds a `useScan`, which is why the Curriculum tab has one value
 * and not two: its batch and its per-card cameras share a single hook instance,
 * and a label that claimed to tell them apart would be guessing.
 */
export const ScanDoor = {
  /** Progress → Curriculum ("Scan N pages", and each card's own camera). */
  Curriculum: 'scan-curriculum',
  /** Scan Certificate or Progress Report. */
  Certificate: 'scan-certificate',
  /** Today's unified capture. */
  Capture: 'scan-capture',
  /** The planner's workbook-page analysis. */
  Planner: 'scan-planner',
  /** A caller that named no door. */
  Unknown: 'scan',
} as const
export type ScanDoor = (typeof ScanDoor)[keyof typeof ScanDoor]

export interface ScanFailureShape {
  /** The type the picker declared for the file, or '' when it declared none. */
  inputType?: string | null
  /** File size in bytes. */
  sizeBytes?: number | null
  /** Whether the bytes were re-encoded before sending. */
  converted?: boolean
  /** The media type we ended up declaring, when we got that far. */
  sentType?: string | null
}

/**
 * Bytes → a short size token with no four-digit run for `redactText` to eat.
 *
 * The unit is chosen from the ROUNDED value, not the raw one (Codex round 3):
 * picking it first let 1000–1023 B print as `1023B` and 999.5 KiB round up to
 * `1000KB`, both of which `redactText` correctly eats as `[num]` — losing the
 * size on exactly the boundary cases, in a helper whose whole contract is that
 * it survives the scrubber.
 */
function sizeToken(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return 'unknown'
  const b = Math.round(bytes)
  if (b < 1000) return `${b}B`
  const kb = Math.round(bytes / 1024)
  if (kb < 1000) return `${kb}KB`
  const mb = bytes / (1024 * 1024)
  // A phone cannot produce a terabyte-scale photo, but the contract is the
  // contract: no token this function returns may carry a four-digit run.
  return mb >= 1000 ? '999+MB' : `${mb.toFixed(2)}MB`
}

function typeToken(type: string | null | undefined): string {
  const t = (type ?? '').trim().toLowerCase()
  if (!t) return 'none'
  // Only ever a MIME type from the platform; anything odd is reduced to shape.
  return /^[a-z0-9.+/-]{1,40}$/.test(t) ? t : 'other'
}

/**
 * `[scan door=scan-curriculum-batch in=image/heic 2.10MB converted=no sent=none]`
 * — prepended to the scrubbed failure message.
 */
export function scanFailureNote(door: ScanDoor, shape: ScanFailureShape): string {
  return [
    `[scan door=${door}`,
    `in=${typeToken(shape.inputType)}`,
    sizeToken(shape.sizeBytes),
    `converted=${shape.converted ? 'yes' : 'no'}`,
    `sent=${typeToken(shape.sentType)}]`,
  ].join(' ')
}
