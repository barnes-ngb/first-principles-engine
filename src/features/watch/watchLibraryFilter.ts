import { SubjectBucket, SubjectBucketLabel } from '../../core/types/enums'
import type { WatchVideo } from '../../core/types'

/**
 * Watch-library find-ability (FEAT-139) — search, filter, and grouping, as pure
 * functions over an already-loaded list.
 *
 * Presentation only. Nothing here reads or writes Firestore, and nothing here
 * interprets `status` — the active/retired split stays the sole job of
 * `watchLibraryStatus.ts`, and the caller applies it *before* handing a list in.
 * Keeping the two separate is deliberate: FEAT-129's "a retired video is never
 * plannable" invariant lives in exactly one file, and a filter bug can never
 * quietly resurrect a retired entry into the picker.
 */

/** Sentinel for "no filter on this axis". Not a `SubjectBucket` or a child id. */
export const ANY_FILTER = 'all'
export type AnyFilter = typeof ANY_FILTER

export interface WatchLibraryFilters {
  /** Free text, matched against title and `why`. Trimmed + case-insensitive. */
  search: string
  subjectBucket: SubjectBucket | AnyFilter
  /** A specific child id, or `ANY_FILTER`. Never `'both'` — see {@link matchesChild}. */
  childId: string | AnyFilter
}

export const EMPTY_WATCH_FILTERS: WatchLibraryFilters = {
  search: '',
  subjectBucket: ANY_FILTER,
  childId: ANY_FILTER,
}

/** `true` when at least one axis is narrowing the list. */
export function hasActiveFilters(filters: WatchLibraryFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.subjectBucket !== ANY_FILTER ||
    filters.childId !== ANY_FILTER
  )
}

/**
 * Title-or-`why` substring match, case-insensitive. An empty/whitespace query
 * matches everything (an empty search box is not a filter).
 */
export function matchesSearch(video: Pick<WatchVideo, 'title' | 'why'>, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  const haystack = `${video.title} ${video.why ?? ''}`.toLowerCase()
  return haystack.includes(needle)
}

/**
 * Child-scope match, reusing the library's established `'both'` semantic
 * (`useWatchLibrary`'s `where('childId','in',[childId,'both'])`, D7).
 *
 * A `'both'` video is **shared, not a third bucket** — filtering to either boy
 * must still show it, exactly as the Firestore query does for a child-scoped
 * consumer. Getting this wrong would hide most of the library behind either
 * child filter, so it is asserted directly.
 */
export function matchesChild(video: Pick<WatchVideo, 'childId'>, childId: string | AnyFilter): boolean {
  if (childId === ANY_FILTER) return true
  return video.childId === childId || video.childId === 'both'
}

/** Subject match (exact bucket, or everything when unfiltered). */
export function matchesSubject(
  video: Pick<WatchVideo, 'subjectBucket'>,
  subjectBucket: SubjectBucket | AnyFilter,
): boolean {
  return subjectBucket === ANY_FILTER || video.subjectBucket === subjectBucket
}

/** Apply every axis. The three compose — each one narrows what the others left. */
export function filterWatchVideos<T extends Pick<WatchVideo, 'title' | 'why' | 'childId' | 'subjectBucket'>>(
  videos: T[],
  filters: WatchLibraryFilters,
): T[] {
  return videos.filter(
    (v) =>
      matchesSearch(v, filters.search) &&
      matchesSubject(v, filters.subjectBucket) &&
      matchesChild(v, filters.childId),
  )
}

export interface WatchSubjectGroup<T> {
  bucket: SubjectBucket
  /** Display label from the shared `SubjectBucketLabel` table — never re-spelled here. */
  label: string
  videos: T[]
  /** Convenience mirror of `videos.length`, so a header can't drift from its list. */
  count: number
}

/**
 * Declaration order of `SubjectBucket`, used as the group order so the shelf
 * reads the same way every time rather than reshuffling as counts change.
 */
const BUCKET_ORDER = Object.values(SubjectBucket)

/**
 * Group into per-subject sections, dropping empty buckets. Order is the shared
 * enum's declaration order; within a group the incoming order is preserved
 * (`useWatchLibrary` already sorts most-recently-updated first).
 */
export function groupBySubject<T extends Pick<WatchVideo, 'subjectBucket'>>(
  videos: T[],
): WatchSubjectGroup<T>[] {
  return BUCKET_ORDER.map((bucket) => {
    const inBucket = videos.filter((v) => v.subjectBucket === bucket)
    return { bucket, label: SubjectBucketLabel[bucket], videos: inBucket, count: inBucket.length }
  }).filter((g) => g.count > 0)
}

/**
 * Plain-language description of what is currently hiding rows, for the empty
 * state. A parent who has filtered the shelf down to nothing must be told *that*
 * — "no videos yet" when the library is full is the confusing case this exists
 * to prevent. Returns `null` when nothing is filtered.
 */
export function describeActiveFilters(
  filters: WatchLibraryFilters,
  childName: (id: string) => string,
): string | null {
  if (!hasActiveFilters(filters)) return null
  const parts: string[] = []
  const search = filters.search.trim()
  if (search) parts.push(`matching “${search}”`)
  if (filters.subjectBucket !== ANY_FILTER) parts.push(`in ${SubjectBucketLabel[filters.subjectBucket]}`)
  if (filters.childId !== ANY_FILTER) parts.push(`for ${childName(filters.childId)}`)
  return parts.join(' ')
}
