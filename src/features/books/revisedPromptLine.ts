/**
 * Say what the picture maker was actually asked to draw, when that is not what
 * the person typed (FEAT-195).
 *
 * `rewriteForCopyright` runs before *every* image call and silently replaces
 * named characters with descriptions of how they look — "Mario" becomes "a
 * cheerful stocky cartoon man in red overalls with a big bushy mustache". That
 * is the right thing to send, but it was never said out loud: the response has
 * carried a `revisedPrompt` field since the beginning and no surface has ever
 * rendered it. So a child asked for one thing, got a picture of something else,
 * and was told nothing. That is its own small dishonesty, and the data to fix it
 * was already on the wire.
 *
 * **Parent audience only**, deliberately. "Drawn as: …" is an explanation of a
 * rule a six-year-old did not ask about and cannot act on; for a kid the picture
 * is just the picture. Gated on capability by the host, never on a name.
 *
 * Pure, and quiet by default: `null` whenever there is nothing worth saying, so
 * a caller renders nothing rather than a line restating the words on screen.
 */
import type { ArtHelpAudience } from './artHelpContent'

/** The label. One word plus a colon — this is a footnote, not a section. */
export const DRAWN_AS_LABEL = 'Drawn as:'

/** Long enough to read as a sentence, short enough not to become the page. */
const MAX_LENGTH = 160

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * The quiet line under a successful picture, or `null`.
 *
 * `null` when: the audience is a kid; the server sent no `revisedPrompt` (an
 * older deploy, or an unchanged ask); or the revision says the same thing the
 * person typed once whitespace and case are set aside — reporting a reformat as
 * a rewrite would train people to ignore the line that matters.
 *
 * A very long revision is trimmed to a readable sentence with an ellipsis: it is
 * a footnote under a picture, not the prompt log.
 */
export function drawnAsLine(
  originalPrompt: string | undefined,
  revisedPrompt: string | undefined,
  audience: ArtHelpAudience,
): string | null {
  if (audience !== 'parent') return null
  const revised = (revisedPrompt ?? '').trim()
  if (!revised) return null
  if (normalize(revised) === normalize(originalPrompt ?? '')) return null
  const shown =
    revised.length > MAX_LENGTH ? `${revised.slice(0, MAX_LENGTH).trimEnd()}…` : revised
  return `${DRAWN_AS_LABEL} ${shown}`
}
