// ── Shelly chat image-marker transport (FEAT-59) ─────────────────────────
//
// Mirrors foundations-review's `uploadImageMessage.ts`: a batch of uploaded
// images becomes leading `[IMAGE_URL:…]` markers on the user message content,
// followed by the human text. The shellyChat CF parses the markers (one OR MORE)
// and routes to the multi-image vision helper. No new transport infra — the same
// Storage → `[IMAGE_URL:…]` path shellyChat already used, extended to N images.

/** Cap on images per message (matches the owner "a few Fast Phonics pages" need). */
export const MAX_UPLOAD_FILES = 6

/** N image URLs → N leading `[IMAGE_URL:…]` markers (empty string for none). */
export function buildImageMarkers(urls: string[]): string {
  return urls.map((u) => `[IMAGE_URL:${u}]`).join('')
}

/**
 * Build the user message content for an upload turn: every image URL as a leading
 * marker, then the text. With no URLs it is just the text (identical to today).
 */
export function buildImageMessageContent(urls: string[], text: string): string {
  return urls.length ? `${buildImageMarkers(urls)}\n${text}` : text
}
