import { WatchVideoStatus } from '../../core/types/watch'
import type { WatchVideo } from '../../core/types'

/**
 * Watch-library lifecycle predicates (FEAT-129).
 *
 * The library has **no delete** — removal is a retire (see `WatchVideoStatus`).
 * These are the single place the `status` field is interpreted, so the
 * "absent ⇒ active" back-compat rule is stated once instead of being re-derived
 * at every call site.
 *
 * The split matters because the two readers of the library want different
 * lists:
 *  - the **planner picker** offers only {@link activeVideos} — a retired video
 *    must never be plannable again;
 *  - **Today** (`KidTodayView` / `TodayPage`) resolves an already-planned item
 *    against the FULL list, so a video retired after it was planned still
 *    plays. Filtering there would break a past week's plan, which is exactly
 *    what retire-don't-delete exists to prevent.
 */

/** `true` when the video has been retired out of the pickable library. */
export function isRetired(video: Pick<WatchVideo, 'status'>): boolean {
  return video.status === WatchVideoStatus.Retired
}

/** `true` for a live video. Absent `status` reads as active (pre-FEAT-129 docs). */
export function isActive(video: Pick<WatchVideo, 'status'>): boolean {
  return !isRetired(video)
}

/** The plannable subset — what the planner picker is allowed to offer. */
export function activeVideos<T extends Pick<WatchVideo, 'status'>>(videos: T[]): T[] {
  return videos.filter(isActive)
}

/** The retired subset — shown only in the parent library, behind a toggle. */
export function retiredVideos<T extends Pick<WatchVideo, 'status'>>(videos: T[]): T[] {
  return videos.filter(isRetired)
}
