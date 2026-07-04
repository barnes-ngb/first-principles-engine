// ── Mid-chat upload message encoding (FEAT-53, slice 2b) ─────────────────
//
// A parent can attach photo(s) + a required one-line context ("these are Fast
// Phonics") to a review turn. The transport MIRRORS shellyChat exactly: each image
// is uploaded to Storage and its download URL is embedded as an `[IMAGE_URL:…]`
// marker at the start of the user message content, followed by the context text.
// The `foundationsReview` CF task detects the markers on the last user message and
// routes to the vision helper — no new transport infrastructure (the run's HARD
// STOP #2 check). The only extension over shellyChat's single-image regex is
// support for MULTIPLE leading markers (a parent can attach a few pages at once).

/** Matches one leading `[IMAGE_URL:https://…]` marker. */
const IMAGE_MARKER_RE = /\[IMAGE_URL:(https?:\/\/[^\]]+)\]/g

/**
 * Build the message content for an upload turn: every image URL as a leading
 * marker, then the human context. The CF splits these back apart.
 */
export function buildUploadMessageContent(urls: string[], context: string): string {
  const markers = urls.map((u) => `[IMAGE_URL:${u}]`).join('')
  return `${markers}\n${context.trim()}`
}

/** Pull the image URLs (if any) out of a message content string. */
export function parseImageMarkers(content: string): { urls: string[]; text: string } {
  const urls: string[] = []
  let m: RegExpExecArray | null
  IMAGE_MARKER_RE.lastIndex = 0
  while ((m = IMAGE_MARKER_RE.exec(content)) !== null) urls.push(m[1])
  return { urls, text: stripImageMarkers(content) }
}

/** The message text with every `[IMAGE_URL:…]` marker removed (for rendering). */
export function stripImageMarkers(content: string): string {
  return content.replace(IMAGE_MARKER_RE, '').trim()
}
