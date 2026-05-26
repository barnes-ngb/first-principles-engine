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
  /**
   * Source-doc IDs of every artifact that is NOT a workbook scan. Used for
   * artifact-default placement: anything in here qualifies for kid-mode
   * placement without requiring engagement signal. `bookArtifactIds`,
   * `sketchArtifactIds`, and `dadLabArtifactIds` are subsets.
   */
  allArtifactIds?: Set<string>;
  /** Photo IDs (PhotoRef.id) tied to resolved-blocker evidence (boost). */
  resolvedBlockerEvidenceIds: Set<string>;
  /**
   * Artifact IDs that should be treated as workbook captures (e.g. uploaded
   * with artifact type "Worksheet"). Combined with `source === "scan"` they
   * mark the photo as `isWorkbookScan` for placement policies.
   */
  workbookArtifactIds?: Set<string>;
  /**
   * Scan doc IDs where the AI recognized real curriculum content (e.g.
   * `results.subject` was set). Used to qualify scans for kid-mode placement
   * and the cover-hero allowlist; an unclassified incidental photo never
   * shows up to the kid.
   */
  classifiedScanIds?: Set<string>;
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

    // A scan is treated as a workbook capture unless it was successfully
    // classified by the scan pipeline (subject recognized). Classified scans
    // are real curriculum evidence — they pass the kid-mode filter and can
    // qualify as cover heroes. An artifact uploaded with type "Worksheet"
    // is always a workbook capture.
    const isWorkbookScan =
      (photo.source === "scan" &&
        !context.classifiedScanIds?.has(photo.sourceDocId)) ||
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

// ── Positive kid-mode signal ────────────────────────────────────

/**
 * Returns true if `photo` has at least one positive signal: engagement, a
 * creative-artifact tag, a classified scan, or resolved-blocker evidence.
 *
 * As of the v1.4 artifact-default policy this no longer gates kid-mode
 * placement — any non-workbook photo qualifies. The helper is kept as a
 * ranking heuristic for callers that want to surface photos with explicit
 * positive signal first (existing score-based sorting already favors them).
 */
export function hasPositiveKidModeSignal(
  photo: PhotoRef,
  context: PhotoCurationContext,
): boolean {
  // Engagement signal — 😊 (engaged) or 😐 (okay) both count as real signal.
  const day = context.dayLogEngagement[dateKey(photo.capturedAt)];
  if (day) {
    const emoji = day[photo.sourceDocId];
    if (emoji === "engaged" || emoji === "okay") return true;
  }

  // Creative artifact tags
  if (
    photo.source === "artifact" &&
    context.bookArtifactIds.has(photo.sourceDocId)
  )
    return true;
  if (
    photo.source === "artifact" &&
    context.sketchArtifactIds.has(photo.sourceDocId)
  )
    return true;
  if (
    photo.source === "artifact" &&
    context.dadLabArtifactIds.has(photo.sourceDocId)
  )
    return true;

  // Classified scan (the AI recognized real curriculum content)
  if (
    photo.source === "scan" &&
    context.classifiedScanIds?.has(photo.sourceDocId)
  )
    return true;

  // Resolved-blocker evidence
  if (context.resolvedBlockerEvidenceIds.has(photo.id)) return true;

  return false;
}

// ── Selection / placement ───────────────────────────────────────

/**
 * Predicates that qualify a photo for cover-hero placement. The cover is for
 * celebration — a scan of a triangle exercise documents what was done, but a
 * photo of a finished book or a sketch celebrates who the kid became. Scans
 * (even classified ones) are evidence and belong on the workedThrough page,
 * not on the cover. The hero pool is therefore artifacts only.
 */
const COVER_HERO_ALLOWED = [
  // Broad artifact allowlist — covers books, sketches, Dad Lab, and any other
  // non-workbook artifact (family activities, finished work, etc.).
  (p: ScoredPhoto, c: PhotoCurationContext) =>
    p.source === "artifact" &&
    !p.isWorkbookScan &&
    !!c.allArtifactIds?.has(p.sourceDocId),
  // Legacy fallback: when allArtifactIds isn't populated, fall back to the
  // narrow creative-artifact subsets so older callers still work.
  (p: ScoredPhoto, c: PhotoCurationContext) =>
    p.source === "artifact" && c.bookArtifactIds.has(p.sourceDocId),
  (p: ScoredPhoto, c: PhotoCurationContext) =>
    p.source === "artifact" && c.sketchArtifactIds.has(p.sourceDocId),
  (p: ScoredPhoto, c: PhotoCurationContext) =>
    p.source === "artifact" && c.dadLabArtifactIds.has(p.sourceDocId),
];

/**
 * Pick a cover-hero photo for the given mode. The cover allowlist is strict
 * and artifact-only: any non-workbook artifact (books, sketches, Dad Lab,
 * family activities, etc.) qualifies. Scans — even classified ones — are
 * never cover heroes because the cover is for celebration, not evidence. If
 * no photo qualifies, returns `undefined` and the Cover layout renders the
 * theme word on a gradient background instead.
 *
 * The chosen photo is added to `alreadyPlaced` so the same photo can't be
 * placed again in another section of the same mode.
 */
export function pickHeroForMode(
  _mode: "kid" | "parent",
  pool: ScoredPhoto[],
  alreadyPlaced: Set<string>,
  context: PhotoCurationContext,
): PhotoRef | undefined {
  const qualified = pool
    .filter((p) => !alreadyPlaced.has(p.id))
    .filter((p) => COVER_HERO_ALLOWED.some((check) => check(p, context)));
  if (qualified.length === 0) return undefined;
  const hero = qualified[0]; // pool is already sorted by score desc
  alreadyPlaced.add(hero.id);
  return strip(hero);
}

/**
 * @deprecated Prefer `pickHeroForMode` — strict allowlist + dedup tracking.
 * Kept for the legacy callsite. Returns the highest-scored non-workbook
 * photo, regardless of whether it's an "incidental" capture.
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
  /** Cover hero per mode (strict allowlist; may be empty). */
  cover: ModePlacement;
  /** Up to MAX_PHOTOS_PER_SECTION.whatYouLoved photos for the celebration page. */
  whatYouLoved: ModePlacement;
  /** Up to MAX_PHOTOS_PER_SECTION.workedThrough photos — prefer resolved-blocker evidence. */
  workedThrough: ModePlacement;
  /**
   * Overflow gallery — every kid-eligible photo that didn't land in cover /
   * whatYouLoved / workedThrough. Kid mode only; parent is always empty.
   */
  moreFromMonth: ModePlacement;
  /** Remaining curated photos for the "More Photos" tray, capped at 30 total kept. */
  more: PhotoRef[];
}

/**
 * Photo caps per section per mode. Kid mode aggressively includes creative
 * artifacts (high cap, often won't be hit). Parent mode is the analytical
 * view with a tighter cap.
 */
export const MAX_PHOTOS_PER_SECTION = {
  // Kid cap lowered from 8 to 6 so overflow actually reaches the
  // moreFromMonth gallery — the photo-dominant section kids love.
  whatYouLoved: { kid: 6, parent: 6 },
  workedThrough: { kid: 4, parent: 4 },
  moreFromMonth: { kid: 20, parent: 0 },
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
  moreFromMonth: "exclude",
} as const;

export function assignPhotosToSections(
  scored: ScoredPhoto[],
  context: PhotoCurationContext & {
    hasBookCompletions: boolean;
    hasDadLab: boolean;
    /** Override on top of context.resolvedBlockerEvidenceIds (legacy callers). */
    resolvedBlockerEvidenceIds?: Set<string>;
  },
): SectionPlacement {
  const resolvedIds =
    context.resolvedBlockerEvidenceIds ?? new Set<string>();

  // Artifact-default policy (v1.4): every photo that's not a workbook scan
  // qualifies for kid-mode placement. Engagement signal still affects ranking
  // via score, but no longer gates inclusion. Workbook scans are still
  // excluded from kid mode everywhere.
  const kidEligible = scored.filter((p) => !p.isWorkbookScan);
  const parentLovedEligible = scored.filter((p) => !p.isWorkbookScan);

  // Resolved-blocker evidence is reserved for workedThrough — it's the
  // evidence-of-effort photo, not the celebration photo. Keeping it out of
  // whatYouLoved means dedup won't steal it before workedThrough runs.
  const kidLovedEligible = kidEligible.filter((p) => !resolvedIds.has(p.id));
  const parentLovedEligibleFinal = parentLovedEligible.filter(
    (p) => !resolvedIds.has(p.id),
  );

  // Track placed IDs per mode so a photo placed as cover never reappears in
  // whatYouLoved/workedThrough within that mode.
  const kidPlacedIds = new Set<string>();
  const parentPlacedIds = new Set<string>();

  // 1. Cover heroes first (highest precedence; strict allowlist).
  const kidHero = pickHeroForMode("kid", kidEligible, kidPlacedIds, context);
  const parentHero = pickHeroForMode(
    "parent",
    parentLovedEligible,
    parentPlacedIds,
    context,
  );

  // 2. whatYouLoved — celebration page, dedup against cover.
  const kidSelected: ScoredPhoto[] = scored.filter((s) =>
    kidPlacedIds.has(s.id),
  );
  const parentSelected: ScoredPhoto[] = scored.filter((s) =>
    parentPlacedIds.has(s.id),
  );

  const lovedKid = selectTopNWithDedup(
    kidLovedEligible,
    kidSelected,
    kidPlacedIds,
    MAX_PHOTOS_PER_SECTION.whatYouLoved.kid,
  );
  kidSelected.push(...lovedKid);

  const lovedParent = selectTopNWithDedup(
    parentLovedEligibleFinal,
    parentSelected,
    parentPlacedIds,
    MAX_PHOTOS_PER_SECTION.whatYouLoved.parent,
  );
  parentSelected.push(...lovedParent);

  // 3. workedThrough — prefer resolved-blocker evidence, dedup against
  // whatever's been placed so far.
  const workedCapKid = MAX_PHOTOS_PER_SECTION.workedThrough.kid;
  const workedCapParent = MAX_PHOTOS_PER_SECTION.workedThrough.parent;

  const workedKid = pickWorkedThrough({
    eligible: kidEligible,
    alreadySelected: kidSelected,
    alreadyPlacedIds: kidPlacedIds,
    resolvedIds,
    cap: workedCapKid,
  });
  kidSelected.push(...workedKid);

  const workedParent = pickWorkedThrough({
    eligible: scored, // parent worked-through allows workbook scans
    alreadySelected: parentSelected,
    alreadyPlacedIds: parentPlacedIds,
    resolvedIds,
    cap: workedCapParent,
  });
  parentSelected.push(...workedParent);

  // 4. moreFromMonth — overflow gallery for kid mode. Any kid-eligible photo
  // that didn't land in cover / whatYouLoved / workedThrough goes here, up
  // to the cap. Score order is preserved so the strongest leftovers lead.
  const moreFromMonthCap = MAX_PHOTOS_PER_SECTION.moreFromMonth.kid;
  const moreFromMonthKid = kidEligible
    .filter((p) => !kidPlacedIds.has(p.id))
    .slice(0, moreFromMonthCap);
  for (const p of moreFromMonthKid) kidPlacedIds.add(p.id);

  // "More" pool: any curated photo not placed in either mode, capped at 30.
  const allPlaced = new Set<string>([...kidPlacedIds, ...parentPlacedIds]);
  const remaining = scored.filter((p) => !allPlaced.has(p.id)).slice(0, 30);

  return {
    cover: {
      kid: kidHero ? [kidHero] : [],
      parent: parentHero ? [parentHero] : [],
    },
    whatYouLoved: {
      kid: lovedKid.map(strip),
      parent: lovedParent.map(strip),
    },
    workedThrough: {
      kid: workedKid.map(strip),
      parent: workedParent.map(strip),
    },
    moreFromMonth: {
      kid: moreFromMonthKid.map(strip),
      parent: [],
    },
    more: remaining.map(strip),
  };
}

/**
 * Like selectTopN but skips any candidate already in `placedIds` and adds
 * each chosen photo to `placedIds` so subsequent sections in the same mode
 * don't pick it up again.
 */
function selectTopNWithDedup(
  candidates: ScoredPhoto[],
  selected: ScoredPhoto[],
  placedIds: Set<string>,
  n: number,
): ScoredPhoto[] {
  const filtered = candidates.filter((p) => !placedIds.has(p.id));
  const chosen = selectTopN(filtered, selected, n);
  for (const p of chosen) placedIds.add(p.id);
  return chosen;
}

interface PickWorkedThroughInput {
  eligible: ScoredPhoto[];
  alreadySelected: ScoredPhoto[];
  alreadyPlacedIds: Set<string>;
  resolvedIds: Set<string>;
  cap: number;
}

function pickWorkedThrough(input: PickWorkedThroughInput): ScoredPhoto[] {
  const { eligible, alreadySelected, alreadyPlacedIds, resolvedIds, cap } =
    input;
  // Resolved-blocker evidence wins priority. Dedup against alreadyPlacedIds
  // so the photo placed in cover or whatYouLoved within this mode doesn't
  // reappear here. (Cross-mode duplication is fine: a kid hero may show up
  // as parent-mode evidence in workedThrough.)
  const priority = eligible.filter(
    (p) => resolvedIds.has(p.id) && !alreadyPlacedIds.has(p.id),
  );
  const rest = eligible.filter(
    (p) => !resolvedIds.has(p.id) && !alreadyPlacedIds.has(p.id),
  );
  const picked = selectTopN(priority, alreadySelected, cap);
  for (const p of picked) alreadyPlacedIds.add(p.id);
  if (picked.length < cap) {
    const filler = selectTopN(
      rest,
      [...alreadySelected, ...picked],
      cap - picked.length,
    );
    for (const p of filler) alreadyPlacedIds.add(p.id);
    picked.push(...filler);
  }
  return picked;
}
