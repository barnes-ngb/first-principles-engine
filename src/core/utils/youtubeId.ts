/**
 * YouTube id extraction + validation for the Watch Vehicle (FEAT-100, design §4).
 *
 * The curated library stores a **validated 11-char YouTube id**, never a
 * free-form URL. A parent pastes either a bare id or a full YouTube URL at
 * vet-in; this pure function extracts and validates the id, rejecting anything
 * that doesn't yield exactly the canonical 11-char form. This is the validation
 * the existing (any-domain, unvalidated) Lesson Video `url` field never had.
 */

/** Canonical YouTube video id: exactly 11 chars of `[A-Za-z0-9_-]`. */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/

/** Host suffixes we accept a video URL from. */
const YOUTUBE_HOSTS = [
  'youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
  'm.youtube.com',
]

/** True iff `value` is exactly the canonical 11-char YouTube id form. */
export function isValidYouTubeId(value: string): boolean {
  return YOUTUBE_ID_RE.test(value)
}

function hostMatches(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '')
  return YOUTUBE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
}

/**
 * Extract a validated 11-char YouTube id from a pasted id or URL.
 *
 * Accepts:
 *  - a bare id (`dQw4w9WgXcQ`)
 *  - `https://www.youtube.com/watch?v=<id>` (with any extra query params)
 *  - `https://youtu.be/<id>`
 *  - `https://www.youtube.com/embed/<id>` and `/shorts/<id>` and `/live/<id>`
 *  - `youtube-nocookie.com` variants of the above
 *
 * Returns the id, or `null` for anything that doesn't resolve to a valid
 * 11-char id on a YouTube host (a non-YouTube URL is always rejected, even if
 * it happens to contain an 11-char-looking segment).
 */
export function extractYouTubeId(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // Bare id (no scheme, no slashes, no dots) — the shortest happy path.
  if (isValidYouTubeId(trimmed) && !/[\s/.?]/.test(trimmed)) {
    return trimmed
  }

  // Anything with a slash/dot we treat as a URL. Add a scheme if absent so the
  // URL parser can read the host (`youtu.be/xxxx` has no scheme).
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }

  if (!hostMatches(url.hostname)) return null

  const host = url.hostname.toLowerCase().replace(/^www\./, '')

  // youtu.be/<id> — id is the first path segment.
  if (host === 'youtu.be') {
    const seg = url.pathname.split('/').filter(Boolean)[0]
    return seg && isValidYouTubeId(seg) ? seg : null
  }

  // youtube.com/watch?v=<id> — the `v` query param.
  const v = url.searchParams.get('v')
  if (v && isValidYouTubeId(v)) return v

  // youtube.com/embed/<id>, /shorts/<id>, /live/<id>, /v/<id>.
  const segs = url.pathname.split('/').filter(Boolean)
  const prefixed = segs.findIndex((s) =>
    s === 'embed' || s === 'shorts' || s === 'live' || s === 'v',
  )
  if (prefixed !== -1) {
    const seg = segs[prefixed + 1]
    return seg && isValidYouTubeId(seg) ? seg : null
  }

  return null
}
