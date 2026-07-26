import type { SubjectBucket } from './enums'

/**
 * Lifecycle of a curated video (FEAT-129).
 *
 * There is deliberately **no delete**. A planned watch item carries only a
 * `watchVideoId` reference (FEAT-104), and Today resolves the playable video by
 * that id — so hard-deleting a library entry would orphan every past week that
 * planned it. Retiring keeps the entry resolvable forever while removing it
 * from the planner picker, so it can never be planned again. Mirrors
 * `CatalogProductStatus`'s retire-don't-delete convention.
 */
export const WatchVideoStatus = {
  Active: 'active',
  Retired: 'retired',
} as const
export type WatchVideoStatus = (typeof WatchVideoStatus)[keyof typeof WatchVideoStatus]

/**
 * Watch Vehicle (FEAT-100 / design FEAT-86, slice 1).
 *
 * One Shelly-vetted, child-safe video, added to the curated library — the ONLY
 * thing ever watchable in the vehicle. A library entry: parent-curated, not
 * AI-authored, and business/curriculum-agnostic (it carries a coarse
 * `subjectBucket`, never `skillTags`, and never enters the concept graph).
 *
 * The library stores a **validated 11-char YouTube id**, never a free-form URL
 * (design §4) — the any-domain `lessonVideo` `url` field is deliberately not
 * reused. Additive shape; no existing type changes.
 */
export interface WatchVideo {
  id: string
  /** Validated 11-char YouTube id (`[A-Za-z0-9_-]{11}`) — NEVER a free-form url (§4). */
  youtubeId: string
  /** Kid-facing title, parent-authored (not the raw YouTube title, D4). */
  title: string
  /** Planned watch length in minutes — the time that logs on completion (decision #1). */
  plannedMinutes: number
  /** Coarse compliance subject — History → 'SocialStudies', nature → 'Science', etc. */
  subjectBucket: SubjectBucket
  /** Who this is for; 'both' allowed like other family-shared configs (D7). */
  childId: string | 'both'
  /** Optional one-line "why we're watching" (parent framing, surfaced on the item). */
  why?: string
  /** Provenance: who vetted it in. Curated-only audit trail. */
  addedBy: string
  /** When it was vetted in (ISO). */
  vettedAt: string
  /** Optional: the candidate url this was promoted from, if the lessonVideo finder suggested it. */
  suggestedFromUrl?: string
  /**
   * Lifecycle (FEAT-129). **Optional, and absent means `active`** — every video
   * vetted in before FEAT-129 predates the field, so an absent value must read
   * as active rather than needing a backfill. Read it through
   * `watchLibraryStatus.ts`, never by comparing the raw field.
   */
  status?: WatchVideoStatus
  createdAt: string
  updatedAt: string
}
