import type { Artifact, DayLog, WatchVideo } from '../../core/types'
import { EngineStage, EvidenceType } from '../../core/types/enums'
import { itemMatchesBlock } from '../../core/utils/itemBlockMatch'

/**
 * Watch Vehicle — completion capture (FEAT-104 / design FEAT-86, slice 3).
 *
 * Pure, side-effect-free logic for completing a *planned* watch checklist item.
 * Two responsibilities, both deliberately narrow:
 *
 *  1. `applyWatchCompletion` — mark the checklist item done and credit its
 *     planned minutes to the matching `DayBlock.actualMinutes` (D3: planned =
 *     actual). It rides the SAME item→block hours path a workbook or routine
 *     item already uses (`itemMatchesBlock`), so no compliance-counting internal
 *     is touched. Idempotent: a no-op once the item is complete, so completing
 *     twice never double-credits. Awards **no XP/diamonds** (D6) and writes **no
 *     learner-model concept state** (C2) — by construction it only returns a
 *     `DayLog`.
 *  2. `buildWatchArtifact` — the portfolio artifact ("Watched {title}") a
 *     completion leaves, tagged with the video's `subjectBucket` (History →
 *     SocialStudies). A video has no photo, so there is no upload step — the
 *     optional parent/kid "what we saw" note lands in `content`.
 *
 * Watching is NOT a calibrated assessment, so nothing here feeds the concept
 * graph or the XP ledger — same rule as Story Guide / Kit Builder (§7/C2).
 */

/** Artifact tag domain for a watch-vehicle capture. */
export const WATCH_ARTIFACT_DOMAIN = 'watch-vehicle'

/**
 * Mark the watch checklist item at `index` complete and credit `plannedMinutes`
 * to its matching day block (planned = actual, D3). Returns a new `DayLog`;
 * never mutates the input.
 *
 * Idempotent by design: if the item is missing or already `completed`, the
 * original `DayLog` is returned unchanged — so a second completion (e.g. the
 * player's "Mark it done" tapped twice, or after the checkbox) never
 * double-credits. The block credit is additionally guarded on
 * `actualMinutes == null || 0`, matching the shared TodayChecklist rule.
 */
export function applyWatchCompletion(
  dayLog: DayLog,
  index: number,
  plannedMinutes: number,
): DayLog {
  const checklist = dayLog.checklist ?? []
  const item = checklist[index]
  // Idempotent guard — nothing to do if the item is gone or already done.
  if (!item || item.completed) return dayLog

  const minutes = item.estimatedMinutes ?? item.plannedMinutes ?? plannedMinutes ?? 0

  const updatedChecklist = checklist.map((ci, i) =>
    i === index ? { ...ci, completed: true } : ci,
  )

  const updatedBlocks = (dayLog.blocks ?? []).map((block) =>
    itemMatchesBlock(item, block) && (block.actualMinutes == null || block.actualMinutes === 0)
      ? { ...block, actualMinutes: minutes }
      : block,
  )

  return { ...dayLog, checklist: updatedChecklist, blocks: updatedBlocks }
}

/**
 * Build the portfolio artifact for a completed watch item. No file/upload (a
 * video has no photo) — the optional "what we saw" note lands in `content`.
 * All required artifact tags are present (`engineStage`, `domain`,
 * `subjectBucket`, `location`); `skillTags` are absent by design (a watch item
 * is non-curriculum). Since FEAT-139 the tags also carry `watchVideoId`, so the
 * artifact joins back to the library entry by id rather than by a mutable title.
 * Returns an artifact WITHOUT `id` — the caller `addDoc`s it.
 */
export function buildWatchArtifact(params: {
  childId: string
  video: WatchVideo
  createdAt: string
  note?: string
  dayLogId?: string
}): Omit<Artifact, 'id'> {
  const { childId, video, createdAt, note, dayLogId } = params
  const trimmed = note?.trim()
  return {
    childId,
    ...(dayLogId ? { dayLogId } : {}),
    title: `Watched ${video.title}`,
    type: EvidenceType.Video,
    createdAt,
    ...(trimmed ? { content: trimmed } : {}),
    tags: {
      engineStage: EngineStage.Build,
      domain: WATCH_ARTIFACT_DOMAIN,
      subjectBucket: video.subjectBucket,
      location: 'Home',
      planItem: `Watch: ${video.title}`,
      // FEAT-139: stamp the library id so the portfolio artifact is *joinable*
      // to the library entry. `planItem` carries a copy of the title taken at
      // capture time, and FEAT-129 lets a parent edit a title afterwards — so
      // matching on it was always brittle. Additive: readers that don't know
      // the field are unaffected, and artifacts written before this have only
      // the title.
      watchVideoId: video.id,
    },
  }
}
