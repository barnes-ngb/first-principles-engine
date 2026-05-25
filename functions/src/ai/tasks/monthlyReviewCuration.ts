import type { PhotoRef } from "./monthlyReviewData.js";

// ── Curation context ────────────────────────────────────────────

export type EngagementEmoji = "engaged" | "okay" | "struggled" | "refused";

export interface PhotoCurationContext {
  /** Map: dayDate (YYYY-MM-DD) → itemKey → engagement emoji string. */
  dayLogEngagement: Record<string, Record<string, string>>;
  /** Scan quality flags by scan doc id. */
  scanQualityById: Record<string, "good" | "partial" | "unclear">;
  /** Artifact IDs that came from book completion (auto-include). */
  bookArtifactIds: Set<string>;
  /** Artifact IDs that came from sketch flow (auto-include). */
  sketchArtifactIds: Set<string>;
  /** Artifact IDs tied to a Dad Lab session with explanation present (boost). */
  dadLabArtifactIds: Set<string>;
  /** Photo IDs (PhotoRef.id) tied to resolved-blocker evidence (boost). */
  resolvedBlockerEvidenceIds: Set<string>;
  /**
   * Artifact IDs that should be treated as workbook captures (e.g. uploaded
   * with artifact type "Worksheet"). Combined with `source === "scan"` they
   * mark the photo as `isWorkbookScan` for placement policies.
   */
  workbookArtifactIds?: Set<string>;
}

export interface ScoredPhoto extends PhotoRef {
  score: number;
  /** True when this photo is force-included (book/sketch). */
  autoInclude: boolean;
  /**
   * True when this photo represents workbook/curriculum content rather than
   * creative work. Heuristic: `source === "scan"` or the source artifact has
   * type "Worksheet" (tracked via `workbookArtifactIds`). Workbook scans are
   * excluded from the cover and deprioritized on celebration sections.
   */
  isWorkbookScan: boolean;
}

// ── Scoring ─────────────────────────────────────────────────────

const ENGAGEMENT_SCORE: Record<string, number> = {
  engaged: 3,
  okay: 1,
  struggled: 0,
  refused: -2,
};

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Score every photo against the curation context. Pure, no async.
 * The score is the sum of independent signals plus any auto-include sentinel.
 * Spread penalties are NOT applied here — they are applied during selection
 * because they depend on what has already been picked.
 */
export function scorePhotos(
  photos: PhotoRef[],
  context: PhotoCurationContext,
): ScoredPhoto[] {
  const scored: ScoredPhoto[] = [];
  for (const photo of photos) {
    let score = 0;
    let autoInclude = false;

    // Engagement signal — look up the day's items for any matching artifactId
    const day = context.dayLogEngagement[dateKey(photo.capturedAt)];
    if (day) {
      const key = photo.sourceDocId;
      const emoji = day[key];
      if (emoji && emoji in ENGAGEMENT_SCORE) {
        score += ENGAGEMENT_SCORE[emoji];
      }
    }

    // Scan quality
    if (photo.source === "scan") {
      const quality = context.scanQualityById[photo.sourceDocId];
      if (quality === "good") score += 2;
    }

    // Auto-include sentinels
    if (
      photo.source === "artifact" &&
      context.bookArtifactIds.has(photo.sourceDocId)
    ) {
      autoInclude = true;
    }
    if (
      photo.source === "artifact" &&
      context.sketchArtifactIds.has(photo.sourceDocId)
    ) {
      autoInclude = true;
    }

    // Dad Lab boost
    if (
      photo.source === "artifact" &&
      context.dadLabArtifactIds.has(photo.sourceDocId)
    ) {
      score += 2;
    }

    // Resolved blocker evidence boost
    if (context.resolvedBlockerEvidenceIds.has(photo.id)) {
      score += 2;
    }

    const isWorkbookScan =
      photo.source === "scan" ||
      (photo.source === "artifact" &&
        !!context.workbookArtifactIds?.has(photo.sourceDocId));

    scored.push({
      ...photo,
      score: autoInclude ? Number.POSITIVE_INFINITY : score,
      autoInclude,
      isWorkbookScan,
    });
  }

  // Sort descending by score. Stable on capturedAt to keep determinism.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.capturedAt || "").localeCompare(b.capturedAt || "");
  });

  return scored;
}

// ── Selection / placement ───────────────────────────────────────

/**
 * Returns the highest-scored photo that is NOT a workbook scan. If the pool
 * contains only workbook scans, returns `undefined` — the cover should render
 * a text/decorative fallback rather than a worksheet image.
 */
export function pickHeroPhoto(scored: ScoredPhoto[]): PhotoRef | undefined {
  for (const p of scored) {
    if (p.isWorkbookScan) continue;
    return strip(p);
  }
  return undefined;
}

function strip(p: ScoredPhoto): PhotoRef {
  const { autoInclude, isWorkbookScan, ...rest } = p;
  void autoInclude;
  void isWorkbookScan;
  return rest;
}

function isoToWeekKey(iso: string): string {
  // Sunday-based week, but for spread penalties we only need a per-week bucket.
  const d = new Date((iso || "").slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/**
 * Apply selection-time penalties (subject diversity + recency spread) and
 * choose top N photos for a section.
 *
 * - Same-subject penalty: −1 per same-subject photo above the 3rd in the
 *   accumulated selection across all sections.
 * - Same-week penalty: −1 per photo already selected in the same week.
 */
function selectTopN(
  candidates: ScoredPhoto[],
  selected: ScoredPhoto[],
  n: number,
): ScoredPhoto[] {
  const result: ScoredPhoto[] = [];
  const pool = [...candidates];
  while (result.length < n && pool.length > 0) {
    // Recompute effective scores against the current "selected ∪ result" set.
    const reference = [...selected, ...result];
    let bestIdx = -1;
    let bestEffective = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i];
      const eff = effectiveScore(cand, reference);
      if (eff > bestEffective) {
        bestEffective = eff;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    result.push(pool[bestIdx]);
    pool.splice(bestIdx, 1);
  }
  return result;
}

function effectiveScore(
  candidate: ScoredPhoto,
  reference: ScoredPhoto[],
): number {
  if (candidate.autoInclude) return Number.POSITIVE_INFINITY;
  let score = candidate.score;

  if (candidate.subjectTag) {
    const sameSubject = reference.filter(
      (r) => r.subjectTag === candidate.subjectTag,
    ).length;
    if (sameSubject >= 3) {
      score -= sameSubject - 2;
    }
  }

  const week = isoToWeekKey(candidate.capturedAt);
  const sameWeek = reference.filter(
    (r) => isoToWeekKey(r.capturedAt) === week,
  ).length;
  score -= sameWeek;

  return score;
}

export interface SectionPlacement {
  /** Up to MAX_PHOTOS_PER_SECTION.whatYouLoved photos for the celebration page. */
  whatYouLoved: PhotoRef[];
  /** Up to MAX_PHOTOS_PER_SECTION.workedThrough photos — prefer resolved-blocker evidence. */
  workedThrough: PhotoRef[];
  /** Remaining curated photos for the "More Photos" tray, capped at 30 total kept. */
  more: PhotoRef[];
}

/**
 * Photo caps per section. Tuned upward from the original PR 1 values after
 * real-use feedback that sections looked text-dominant; "What You Loved" is
 * the photo-dominant page and benefits most from a higher cap.
 */
export const MAX_PHOTOS_PER_SECTION = {
  whatYouLoved: 6,
  workedThrough: 3,
  cover: 1,
} as const;

/**
 * Workbook-scan policy per section. Cover excludes them entirely (worksheet
 * pages should never be the artifact's first impression). "What You Loved" is
 * a celebration page so creative work wins ties. "Worked Through" allows them
 * — workbook captures are real evidence of effort.
 */
export const SECTION_WORKBOOK_POLICY = {
  cover: "exclude",
  whatYouLoved: "deprioritize",
  workedThrough: "allow",
  byTheNumbers: "exclude",
} as const;

export function assignPhotosToSections(
  scored: ScoredPhoto[],
  context: {
    hasBookCompletions: boolean;
    hasDadLab: boolean;
    resolvedBlockerEvidenceIds?: Set<string>;
  },
): SectionPlacement {
  const resolvedIds = context.resolvedBlockerEvidenceIds ?? new Set<string>();
  const selected: ScoredPhoto[] = [];

  // "What You Loved" deprioritizes workbook scans: prefer non-workbook photos,
  // and only fall back to workbook scans if the non-workbook pool is empty.
  const lovedNonWorkbook = scored.filter((p) => !p.isWorkbookScan);
  const whatYouLoved = selectTopN(
    lovedNonWorkbook,
    selected,
    MAX_PHOTOS_PER_SECTION.whatYouLoved,
  );
  selected.push(...whatYouLoved);

  // Worked-through prefers resolved-blocker evidence first.
  const workedPriority = scored.filter((p) => resolvedIds.has(p.id));
  const workedRest = scored.filter(
    (p) =>
      !resolvedIds.has(p.id) && !whatYouLoved.some((w) => w.id === p.id),
  );
  const workedCap = MAX_PHOTOS_PER_SECTION.workedThrough;
  const workedPicked = selectTopN(workedPriority, selected, workedCap);
  selected.push(...workedPicked);
  if (workedPicked.length < workedCap) {
    const filler = selectTopN(
      workedRest,
      selected,
      workedCap - workedPicked.length,
    );
    selected.push(...filler);
    workedPicked.push(...filler);
  }

  const placedIds = new Set(selected.map((s) => s.id));
  const remaining = scored.filter((p) => !placedIds.has(p.id)).slice(0, 30);

  return {
    whatYouLoved: whatYouLoved.map(strip),
    workedThrough: workedPicked.map(strip),
    more: remaining.map(strip),
  };
}
