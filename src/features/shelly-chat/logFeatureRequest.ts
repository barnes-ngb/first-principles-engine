// ── Silent friction-capture write (Build Step 5a) ─────────────────
//
// This is a SEPARATE write path from `applyChatAction` (the confirm-gated,
// child-record-only portal writer). `featureRequests` is feedback metadata, not
// a child's record, so this write is intentionally silent and unconfirmed —
// fire-and-forget, never surfaced to Shelly, never blocking the chat turn.
//
// Dedup mirrors the `xpLedger` idempotency pattern: a deterministic `dedupKey`
// (hash of the normalized `interpretedWant`) collapses repeated phrasings of the
// same want so Step 5b opens at most one GitHub issue per want.

import { addDoc, getDocs, limit, query, where } from 'firebase/firestore'

import { featureRequestsCollection } from '../../core/firebase/firestore'
import { FeatureRequestStatus } from '../../core/types'

export interface LogFeatureRequestInput {
  /** Shelly's words, verbatim. */
  quote: string
  /** AI one-line summary of what she wanted. */
  interpretedWant: string
  /** Present when the friction was about a specific child. */
  childId?: string
  /** Page/topic where it surfaced, e.g. 'shelly-chat: sight words'. */
  context: string
}

/**
 * Normalize a want for dedup: lowercase, trim, collapse internal whitespace.
 */
function normalizeWant(want: string): string {
  return want.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Tiny stable string hash (djb2). Deterministic across runs so the same
 * normalized want always produces the same `dedupKey`. Returned as a base-36
 * string for compact, doc-id-safe keys.
 */
export function hashWant(want: string): string {
  const normalized = normalizeWant(want)
  let hash = 5381
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) | 0
  }
  // >>> 0 to get an unsigned int before base-36 encoding.
  return (hash >>> 0).toString(36)
}

/**
 * Silently log a feature request, deduped by `dedupKey`. Fire-and-forget: any
 * failure (including the dedup read) is swallowed so a friction capture can
 * never break the chat turn.
 *
 * @returns true when a new doc was written, false when skipped (duplicate or error).
 */
export async function logFeatureRequest(
  familyId: string,
  input: LogFeatureRequestInput,
): Promise<boolean> {
  try {
    const dedupKey = hashWant(input.interpretedWant)
    const col = featureRequestsCollection(familyId)

    // Dedup: skip if a request with this dedupKey already exists.
    const existing = await getDocs(
      query(col, where('dedupKey', '==', dedupKey), limit(1)),
    )
    if (!existing.empty) return false

    await addDoc(col, {
      quote: input.quote,
      interpretedWant: input.interpretedWant,
      ...(input.childId ? { childId: input.childId } : {}),
      context: input.context,
      createdAt: new Date().toISOString(),
      status: FeatureRequestStatus.New,
      dedupKey,
    })
    return true
  } catch (err) {
    console.warn('[shellyChat] failed to log feature request (non-fatal):', err)
    return false
  }
}
