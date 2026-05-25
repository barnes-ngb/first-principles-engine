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

export interface ModePlacement {
  kid: PhotoRef[];
  parent: PhotoRef[];
}

export interface SectionPlacement {
  /** Up to MAX_PHOTOS_PER_SECTION.whatYouLoved photos for the celebration page. */
  whatYouLoved: ModePlacement;
  /** Up to MAX_PHOTOS_PER_SECTION.workedThrough photos — prefer resolved-blocker evidence. */
  workedThrough: ModePlacement;
  /** Remaining curated photos for the "More Photos" tray, capped at 30 total kept. */
  more: PhotoRef[];
}

/**
 * Photo caps per section per mode. Kid mode aggressively includes creative
 * artifacts (high cap, often won't be hit). Parent mode is the analytical
 * view with a tighter cap.
 */
export const MAX_PHOTOS_PER_SECTION = {
  whatYouLoved: { kid: 8, parent: 6 },
  workedThrough: { kid: 4, parent: 4 },
  cover: 1,
} as const;

/**
 * Workbook-scan placement policy.
 *
 * - Kid mode is celebration only — workbook scans never appear in kid mode.
 *   Even the evidence page reads as creative-work-only for the child.
 * - Parent mode is analytical — workbook scans are real evidence of effort,
 *   but only on the "What He Worked Through" page. Other parent-mode sections
 *   stay creative-work-first.
 *
 * The cover hero is selected separately via `pickHeroPhoto` and excludes
 * workbook scans across both modes.
 */
export const KID_MODE_WORKBOOK_POLICY = "exclude_everywhere" as const;
export const PARENT_MODE_WORKBOOK_POLICY = {
  cover: "exclude",
  monthInSentence: "exclude",
  whatYouLoved: "exclude",
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

  // Kid mode never sees workbook scans anywhere.
  const kidEligible = scored.filter((p) => !p.isWorkbookScan);
  // Parent mode "whatYouLoved" also excludes workbook scans (celebration-first).
  const parentLovedEligible = scored.filter((p) => !p.isWorkbookScan);

  const kidSelected: ScoredPhoto[] = [];
  const parentSelected: ScoredPhoto[] = [];

  const lovedKid = selectTopN(
    kidEligible,
    kidSelected,
    MAX_PHOTOS_PER_SECTION.whatYouLoved.kid,
  );
  kidSelected.push(...lovedKid);

  const lovedParent = selectTopN(
    parentLovedEligible,
    parentSelected,
    MAX_PHOTOS_PER_SECTION.whatYouLoved.parent,
  );
  parentSelected.push(...lovedParent);

  // Worked-through prefers resolved-blocker evidence first.
  // Kid mode: still no workbook scans. Parent mode: workbook scans allowed.
  const workedCapKid = MAX_PHOTOS_PER_SECTION.workedThrough.kid;
  const workedCapParent = MAX_PHOTOS_PER_SECTION.workedThrough.parent;

  const workedKid = pickWorkedThrough({
    eligible: kidEligible,
    alreadySelected: kidSelected,
    excludedIds: new Set(lovedKid.map((p) => p.id)),
    resolvedIds,
    cap: workedCapKid,
  });
  kidSelected.push(...workedKid);

  const workedParent = pickWorkedThrough({
    eligible: scored, // parent worked-through allows workbook scans
    alreadySelected: parentSelected,
    excludedIds: new Set(lovedParent.map((p) => p.id)),
    resolvedIds,
    cap: workedCapParent,
  });
  parentSelected.push(...workedParent);

  // "More" pool: any curated photo not placed in either mode, capped at 30.
  const placedIds = new Set<string>([
    ...kidSelected.map((s) => s.id),
    ...parentSelected.map((s) => s.id),
  ]);
  const remaining = scored.filter((p) => !placedIds.has(p.id)).slice(0, 30);

  return {
    whatYouLoved: {
      kid: lovedKid.map(strip),
      parent: lovedParent.map(strip),
    },
    workedThrough: {
      kid: workedKid.map(strip),
      parent: workedParent.map(strip),
    },
    more: remaining.map(strip),
  };
}

interface PickWorkedThroughInput {
  eligible: ScoredPhoto[];
  alreadySelected: ScoredPhoto[];
  excludedIds: Set<string>;
  resolvedIds: Set<string>;
  cap: number;
}

function pickWorkedThrough(input: PickWorkedThroughInput): ScoredPhoto[] {
  const { eligible, alreadySelected, excludedIds, resolvedIds, cap } = input;
  // Resolved-blocker evidence is allowed to repeat across sections —
  // a photo that resolved a blocker can also be celebrated.
  const priority = eligible.filter((p) => resolvedIds.has(p.id));
  const rest = eligible.filter(
    (p) => !resolvedIds.has(p.id) && !excludedIds.has(p.id),
  );
  const picked = selectTopN(priority, alreadySelected, cap);
  if (picked.length < cap) {
    const filler = selectTopN(
      rest,
      [...alreadySelected, ...picked],
      cap - picked.length,
    );
    picked.push(...filler);
  }
  return picked;
}
