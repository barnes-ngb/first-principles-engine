// ── Feature-request (friction-log) types ─────────────────────────
//
// `featureRequests` is the Shelly portal's silent friction log: when she asks
// for something the app can't do, or voices friction with a workflow, the chat
// records a structured entry here (Build Step 5a). This is **feedback metadata,
// not a child's record**, so the write is silent and unconfirmed — deliberately
// separate from the confirm-gated `applyChatAction` path (see
// docs/SHELLY_PORTAL_FEEDBACK_LOOP.md). Step 5b's scheduled CF consumes the
// `'new'` entries and opens GitHub issues.

/** Lifecycle of a captured feature request. `as const` — no enum (erasableSyntaxOnly). */
export const FeatureRequestStatus = {
  New: 'new',
  Filed: 'filed',
  Done: 'done',
} as const
export type FeatureRequestStatus =
  (typeof FeatureRequestStatus)[keyof typeof FeatureRequestStatus]

export interface FeatureRequest {
  id?: string
  /** Shelly's words, verbatim. */
  quote: string
  /** AI one-line summary of what she wanted. */
  interpretedWant: string
  /** Present when the friction was about a specific child. */
  childId?: string
  /** Page/topic where it surfaced, e.g. 'shelly-chat: sight words'. */
  context: string
  /** ISO timestamp of capture. */
  createdAt: string
  status: FeatureRequestStatus
  /** Hash of normalized `interpretedWant` — dedup key (mirrors xpLedger idempotency). */
  dedupKey: string
  /** Set by Step 5b after the GitHub issue is opened. */
  githubIssueUrl?: string
}
