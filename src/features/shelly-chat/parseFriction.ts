// ── <friction> block parser ──────────────────────────────────────
//
// The Shelly portal has the model silently emit a single trailing
// `<friction>{...json...}</friction>` block when Shelly voices an unmet want or
// friction with a workflow. This pure helper extracts that block from an
// assistant message: it parses the payload, validates `quote` + `interpretedWant`,
// and returns the typed friction plus the message text with the block stripped.
//
// Mirrors `parseChatActions` (tag-detect + `sanitizeAndParseJson` + skip-on-
// failure + strip) but is a SEPARATE path: friction is feedback metadata, not a
// child's record, so it is never routed through `applyChatAction`. The capture
// write (`logFeatureRequest`) is silent and unconfirmed by design.
// See docs/SHELLY_PORTAL_FEEDBACK_LOOP.md.

import { sanitizeAndParseJson } from '../../core/utils/sanitizeJson'

export interface ParsedFriction {
  /** The extracted friction signal, or null when absent/invalid. */
  friction: { quote: string; interpretedWant: string } | null
  /** The message text with any `<friction>` block removed. */
  cleanText: string
}

/**
 * Extract a single `<friction>...</friction>` block from an assistant message.
 *
 * - Matches the first block only (the grammar says one per turn).
 * - Parses with `sanitizeAndParseJson`; on any parse failure returns
 *   `{ friction: null }` (never throws), matching `parseChatActions`' tolerance.
 * - Requires non-empty string `quote` and `interpretedWant`; otherwise null.
 * - `cleanText` always has every `<friction>` block stripped, even when the
 *   payload is invalid, so the tag never reaches the rendered/persisted message.
 */
export function parseFriction(raw: string): ParsedFriction {
  const cleanText = raw.replace(/<friction>[\s\S]*?<\/friction>/g, '').trim()

  const match = raw.match(/<friction>([\s\S]*?)<\/friction>/)
  if (!match) return { friction: null, cleanText }

  let payload: unknown
  try {
    payload = sanitizeAndParseJson(match[1])
  } catch {
    return { friction: null, cleanText }
  }

  if (typeof payload !== 'object' || payload === null) {
    return { friction: null, cleanText }
  }
  const obj = payload as Record<string, unknown>
  if (typeof obj.quote !== 'string' || obj.quote.trim().length === 0) {
    return { friction: null, cleanText }
  }
  if (typeof obj.interpretedWant !== 'string' || obj.interpretedWant.trim().length === 0) {
    return { friction: null, cleanText }
  }

  return {
    friction: { quote: obj.quote, interpretedWant: obj.interpretedWant },
    cleanText,
  }
}
