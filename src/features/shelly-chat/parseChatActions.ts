// ── <action> block parser ───────────────────────────────────────
//
// The Shelly portal has the AI emit `<action>{...json...}</action>` blocks that
// propose a write to a child's record. This pure helper extracts those blocks
// from an assistant message: it parses each payload, validates it against the
// `ChatAction` allowlist, and returns the surviving typed actions plus the
// message text with all `<action>` blocks stripped for clean rendering.
//
// Mirrors EvaluateChatPage's `extractFindings` (tag-detect + JSON-parse +
// skip-on-failure) and `parseFollowUps` (extract a structured block, render the
// rest clean). Extracted to a sibling module so it is unit-testable without the
// component. See docs/SHELLY_PORTAL_CONTEXT.md §4.
//
// 3a is pure plumbing: nothing wires this into `sendToAI` yet, and there is no
// write path — `applyChatAction` lands in 3b.

import type { ChatAction } from '../../core/types/shellyChat'
import { sanitizeAndParseJson } from '../../core/utils/sanitizeJson'

export interface ParsedChatActions {
  actions: ChatAction[]
  cleanText: string
}

/**
 * Validate an arbitrary parsed payload against the `ChatAction` allowlist.
 *
 * Returns a typed `ChatAction` only for the two sight-word kinds with a string
 * `childId` and a non-empty string `word`. Everything else — including a
 * well-formed JSON object carrying an unknown or Tier-C `kind` — returns null.
 * This is the structural guarantee that the portal can never touch Tier-C
 * paths (see docs/SHELLY_PORTAL_CONTEXT.md §3).
 */
function toChatAction(payload: unknown): ChatAction | null {
  if (typeof payload !== 'object' || payload === null) return null
  const obj = payload as Record<string, unknown>

  if (obj.kind !== 'addSightWord' && obj.kind !== 'removeSightWord') return null
  if (typeof obj.childId !== 'string' || obj.childId.length === 0) return null
  if (typeof obj.word !== 'string' || obj.word.trim().length === 0) return null

  return { kind: obj.kind, childId: obj.childId, word: obj.word }
}

/**
 * Extract all `<action>...</action>` blocks from an assistant message.
 *
 * - Parses each payload with `sanitizeAndParseJson`; on parse failure the block
 *   is skipped (never throws), matching `extractFindings`' tolerance.
 * - Validates each parsed payload against the `ChatAction` allowlist; anything
 *   that fails validation is dropped.
 * - `cleanText` is the original message with every `<action>...</action>` block
 *   removed (and surrounding whitespace tidied), mirroring `stripTags`.
 */
export function parseChatActions(raw: string): ParsedChatActions {
  const actions: ChatAction[] = []
  const regex = /<action>([\s\S]*?)<\/action>/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(raw)) !== null) {
    let payload: unknown
    try {
      payload = sanitizeAndParseJson(match[1])
    } catch {
      /* skip unparseable */
      continue
    }
    const action = toChatAction(payload)
    if (action) actions.push(action)
  }

  const cleanText = raw.replace(/<action>[\s\S]*?<\/action>/g, '').trim()

  return { actions, cleanText }
}
