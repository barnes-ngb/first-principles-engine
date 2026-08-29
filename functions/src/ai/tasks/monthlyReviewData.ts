import type { Firestore } from "firebase-admin/firestore";

import {
  beatTextForChild,
  labBeatsHaveContent,
  reportArtifactIds,
} from "./dadLabReportArtifacts.js";
import {
  computeMonthHours,
  type RawDayLog,
  type RawHoursAdjustment,
  type RawHoursEntry,
} from "./monthlyHours.js";

/**
 * Firestore composite indexes required by this module.
 *
 * Each query that combines an equality filter with a range filter (or two
 * equalities + a range) needs a composite index. Without an explicit
 * `orderBy`, Firestore implicitly orders by the range field in ASCENDING
 * order, so the inequality field in the index must be ASC even though some
 * collections also have a DESC variant used elsewhere in the app.
 *
 * Single-field range filters (e.g. `where('date', '>=', s).where('date', '<=', e)`)
 * are served by Firestore's default single-field indexes and need no entry.
 *
 *   weeklyReviews:
 *     (childId ASC, weekKey ASC)
 *       — loadWeeklyReviewsForMonth (childId equality + weekKey range)
 *
 *   books:
 *     (childId ASC, status ASC, updatedAt ASC)
 *       — loadCompletedBooksInMonth (childId + status equalities + updatedAt range)
 *
 *   scans:
 *     (childId ASC, createdAt ASC)
 *       — loadPhotosForMonth/scans (childId equality + createdAt range)
 *
 *   artifacts:
 *     (childId ASC, createdAt ASC)
 *       — loadPhotosForMonth/artifacts (childId equality + createdAt range)
 *
 *   xpLedger:
 *     (childId ASC, awardedAt ASC)
 *       — loadDiamondsForMonth (childId equality + awardedAt range)
 *
 *   evaluationSessions:
 *     (childId ASC, status ASC, evaluatedAt ASC)
 *       — loadQuestCountForMonth (childId + status equalities + evaluatedAt range)
 *
 *   dadLabReports:
 *     `date` single-field (auto) — loadDadLabReportsInMonth (range only).
 *     The legacy (status ASC, date ASC) composite still exists for other
 *     callers but is no longer required by this loader.
 *   hours:
 *     (childId ASC, date ASC) — loadHoursForMonth — already present
 *   hoursAdjustments:
 *     `date` single-field (fieldOverride) — loadHoursForMonth (FEAT-164 reads
 *     the adjustments source; range only, the DATA-09 child/'both' attribution
 *     runs in memory) — already present
 *   days:
 *     date single-field (fieldOverride) — loadRawDayLogsForMonth — already present
 *   weeks:
 *     startDate single-field (auto) — loadConundrumsForMonth — no entry needed
 *   skillSnapshots:
 *     direct doc fetch — loadBlockers — no index needed
 *   bookProgress:
 *     (childId ASC) single-field (auto) — loadReadingForMonth (childId equality
 *     only; the month filter runs in memory over each doc's questionPool).
 *
 * All indexes are defined in `firestore.indexes.json`. If you add a new query
 * here, also add the index there and update this list.
 */

// ── Types (mirror src/core/types/monthlyReview.ts but kept local to functions) ──

export interface PhotoSourceMetadata {
  /** Origin tag for downstream curation (e.g. "dadLab"). */
  type?: string;
  /** Source Dad Lab report doc id when type === "dadLab". */
  reportId?: string;
  /** Source Dad Lab report title when type === "dadLab". */
  reportTitle?: string;
}

export interface PhotoRef {
  id: string;
  storagePath: string;
  source: "scan" | "artifact";
  sourceDocId: string;
  capturedAt: string;
  score?: number;
  subjectTag?: string;
  /**
   * Tags photos whose origin is not directly inferable from the source
   * collection — e.g. Dad Lab photos stored in `artifacts` but referenced
   * via a `dadLabReports` doc, from either `childReports[*].artifacts` or
   * `beats[*].items[].artifactId` (FEAT-163 — see `reportArtifactIds`).
   */
  sourceMetadata?: PhotoSourceMetadata;
  /**
   * FEAT-141: the short content note written on the source doc at capture time,
   * when it has one. Read-only grounding for the generator (it tells the model
   * what a photo actually shows before it writes a caption). Absent on every
   * pre-FEAT-141 photo, and stripped before the ref reaches the composed book
   * document — see `strip()` in monthlyReviewCuration.ts.
   */
  contentNote?: string;
}

export interface DayLogEntry {
  date: string;
  totalItems: number;
  completedItems: number;
  /** itemId → engagement emoji ("engaged"/"okay"/"struggled"/"refused") */
  itemEngagement: Record<string, string>;
  engagementCounts: Record<string, number>;
  minutesBySubject: Record<string, number>;
  evidenceCount: number;
  /** Artifact IDs linked to checklist items on this day. */
  evidenceArtifactIds: string[];
  /**
   * FEAT-141: evidence doc IDs belonging to WORKBOOK-linked checklist items
   * (the item carries a `workbookConfigId` or a scan registration). The
   * workbook capture path saves the page as a plain `Photo` artifact as well
   * as a scan, and nothing on that artifact doc says "workbook" — this is the
   * retroactive join that marks it as a curriculum image.
   */
  workbookEvidenceIds: string[];
  /**
   * FEAT-141: labels of those same workbook-linked items. Batch pages 2..N are
   * saved as artifacts with no checklist link at all, carrying only
   * `tags.planItem` — this is how those are recognized.
   */
  workbookItemLabels: string[];
  hasTeachBack: boolean;
}

export interface WeeklyReviewSummary {
  id: string;
  weekKey: string;
  celebration: string;
  summary: string;
  wins: string[];
  growthAreas: string[];
  recommendations: string[];
  energyPattern?: string;
}

export interface BlockerEntry {
  id: string;
  name: string;
  affectedSkills: string[];
  status: string;
  rationale: string;
  detectedAt?: string;
  resolvedAt?: string;
  evidence?: string;
  specificWords?: string[];
}

export interface CompletedBookEntry {
  id: string;
  title: string;
  bookType: string;
  theme?: string;
  pageCount: number;
  completedAt: string;
  createdBy?: string;
}

export interface DadLabEntry {
  id: string;
  title: string;
  question: string;
  completedAt: string;
  hasPrediction: boolean;
  hasExplanation: boolean;
  /**
   * Every artifact doc ID this session owns (photos + audio recordings), from
   * the UNION of `childReports[*].artifacts` and `beats[*].items[].artifactId`,
   * de-duped by id — see `reportArtifactIds` in `dadLabReportArtifacts.ts`.
   *
   * Used by `loadPhotosForMonth` to surface Dad Lab photos the artifacts query
   * cannot see. It misses them two ways: the KidLabView writer keys artifacts
   * by lowercase child name rather than the Firestore child doc id, and the
   * FEAT-56 beat capture writes `childId: 'both'` (BEAT_BOTH) by design — so
   * a `childId == X` filter matches neither.
   *
   * NOT filtered to the queried child (FEAT-163): a lab is a whole-family
   * activity (DATA-04) whose evidence is written as `'both'`, which is why the
   * portfolio shows it on every child's page (`DAD_LAB_FAMILY_SCOPE_NOTE`).
   */
  artifactIds: string[];
}

export interface ConundrumEntry {
  weekKey: string;
  question: string;
  childResponse?: string;
}

export interface TeachBackEntry {
  date: string;
  subject: string;
  hasAudio: boolean;
  excerpt?: string;
}

export interface HoursSummary {
  totalMinutes: number;
  minutesBySubject: Record<string, number>;
}

export interface DiamondSummary {
  totalDiamonds: number;
  questEvents: number;
  routineEvents: number;
}

/** One read-aloud book that had a question answered this month. */
export interface ReadingBookSummary {
  bookId: string;
  title: string;
  totalChapters: number;
  /** Distinct chapters with a question answered this month. */
  chaptersAnswered: number;
  /** Pool questions answered this month (answeredDate within range). */
  questionsAnswered: number;
  /**
   * Parent-skipped questions on this book. Skips carry no date, so this is the
   * book's running skip count — only surfaced for books active this month.
   */
  questionsSkipped: number;
}

/** Read-aloud reading activity for the month, derived from `bookProgress`. */
export interface ReadingSummary {
  books: ReadingBookSummary[];
  totalChaptersAnswered: number;
  totalQuestionsAnswered: number;
  totalQuestionsSkipped: number;
}

export interface MonthAggregate {
  month: string;
  monthStart: string;
  monthEnd: string;
  dayLogs: DayLogEntry[];
  weeklyReviews: WeeklyReviewSummary[];
  activeBlockers: BlockerEntry[];
  resolvedBlockers: BlockerEntry[];
  completedBooks: CompletedBookEntry[];
  dadLabReports: DadLabEntry[];
  photos: PhotoRef[];
  /**
   * Source-doc IDs of artifacts whose original type is "Worksheet". These are
   * curriculum captures uploaded as artifacts (not scans), and are treated as
   * workbook scans by the curation policy.
   */
  workbookArtifactIds: Set<string>;
  /**
   * Scan doc IDs where the AI recognized curriculum content (`results.subject`
   * or similar). Incidental scans without analysis fall out of kid-mode
   * placement and cover-hero selection.
   */
  classifiedScanIds: Set<string>;
  /**
   * Source-doc IDs of every artifact that is NOT a workbook scan. Drives the
   * artifact-default placement policy (v1.4): any photo in this set qualifies
   * for kid-mode placement without requiring engagement signal. Strict subset
   * of the `artifacts` collection for this child/month.
   */
  allArtifactIds: Set<string>;
  /**
   * FEAT-141: artifact doc id → `tags.planItem`. Joined with each day log's
   * `workbookItemLabels` in `buildCurationContext` to catch workbook photos
   * that carry no checklist link and no "Worksheet" type.
   */
  artifactPlanItems: Record<string, string>;
  conundrums: ConundrumEntry[];
  teachBacks: TeachBackEntry[];
  hours: HoursSummary;
  diamonds: DiamondSummary;
  questCount: number;
  reading: ReadingSummary;
}

// ── Date helpers ──────────────────────────────────────────────

/** Returns the first and last day (inclusive) of the given `YYYY-MM` month. */
export function getMonthBounds(month: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Invalid month format: ${month} (expected YYYY-MM)`);
  }
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const m = Number(monthStr); // 1-based
  const start = `${month}-01`;
  // Day 0 of next month = last day of this month
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/** Returns previous calendar month as `YYYY-MM`. */
export function getPreviousMonth(today: Date): string {
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-based
  // Move to the 1st of this month, subtract a day → in previous month
  const prev = new Date(year, month, 0);
  const py = prev.getFullYear();
  const pm = String(prev.getMonth() + 1).padStart(2, "0");
  return `${py}-${pm}`;
}

// ── Loaders ───────────────────────────────────────────────────

/**
 * The raw `days` docs for one child and month — the SINGLE `days` read for the
 * whole aggregate (FEAT-164). Two consumers want different slices of the same
 * documents and neither should re-query for them:
 *  - `projectDayLogEntries` (the engagement / evidence / curation projection);
 *  - `loadHoursForMonth`, which needs the `blocks` array that projection drops.
 */
export async function loadRawDayLogsForMonth(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
): Promise<RawDayLog[]> {
  const snap = await db
    .collection(`families/${familyId}/days`)
    .where("date", ">=", start)
    .where("date", "<=", end)
    .get();

  return snap.docs
    .map((doc) => doc.data() as RawDayLog)
    .filter((d) => d.childId === childId);
}

export async function loadDayLogsForMonth(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
): Promise<DayLogEntry[]> {
  return projectDayLogEntries(
    await loadRawDayLogsForMonth(db, familyId, childId, start, end),
  );
}

/** Pure projection of raw `days` docs into the curation-facing `DayLogEntry`.
 *  Note its `minutesBySubject` is a completed-checklist rollup for narrative
 *  colour (`dominantSubject`) — it is NOT the counted-hours figure, which comes
 *  from `loadHoursForMonth` / the ported `collectHoursContributions`. */
export function projectDayLogEntries(rawLogs: RawDayLog[]): DayLogEntry[] {
  const logs: DayLogEntry[] = [];
  for (const raw of rawLogs) {
    const d = raw as Record<string, unknown>;
    const checklist = (d.checklist ?? []) as Array<{
      id?: string;
      label: string;
      completed: boolean;
      engagement?: string;
      subjectBucket?: string;
      estimatedMinutes?: number;
      plannedMinutes?: number;
      evidenceArtifactId?: string;
      teachBackDone?: boolean;
      workbookConfigId?: string;
      workbookScanRegistration?: unknown;
    }>;

    const itemEngagement: Record<string, string> = {};
    const engagementCounts: Record<string, number> = {};
    const minutesBySubject: Record<string, number> = {};
    const evidenceArtifactIds: string[] = [];
    const workbookEvidenceIds: string[] = [];
    const workbookItemLabels: string[] = [];
    let evidenceCount = 0;
    let hasTeachBack = false;

    for (const item of checklist) {
      if (item.engagement) {
        engagementCounts[item.engagement] =
          (engagementCounts[item.engagement] ?? 0) + 1;
        const key = item.id ?? item.label;
        if (key) itemEngagement[key] = item.engagement;
        // FEAT-141 (Codex P2, PR #1666): curation matches a PHOTO to its item
        // by the photo's source doc id — a scan id or an artifact id — so an
        // engagement indexed only by item id/label never matched a photo and
        // the signal was silently dead. Index the evidence id too, which is
        // exactly the key `scorePhotos` and the big-step gate look up.
        if (item.evidenceArtifactId) {
          itemEngagement[item.evidenceArtifactId] = item.engagement;
        }
      }

      // FEAT-141 (Codex P1, PR #1666): a workbook-routed capture writes the
      // page BOTH as a scan and as a plain `Photo` artifact, so the artifact
      // twin escaped the curriculum-image predicate (which only knew the
      // "Worksheet" type) and the same page could still be printed. The day
      // log is the authoritative, RETROACTIVE link — it works on months that
      // were captured long before this policy existed.
      if (item.workbookConfigId || item.workbookScanRegistration) {
        if (item.evidenceArtifactId) workbookEvidenceIds.push(item.evidenceArtifactId);
        if (item.label) workbookItemLabels.push(item.label);
      }
      if (item.completed) {
        const mins = item.estimatedMinutes ?? item.plannedMinutes ?? 0;
        const bucket = item.subjectBucket ?? "Other";
        minutesBySubject[bucket] = (minutesBySubject[bucket] ?? 0) + mins;
      }
      if (item.evidenceArtifactId) {
        evidenceArtifactIds.push(item.evidenceArtifactId);
        evidenceCount++;
      }
      if (item.teachBackDone) hasTeachBack = true;
    }

    logs.push({
      date: d.date as string,
      totalItems: checklist.length,
      completedItems: checklist.filter((i) => i.completed).length,
      itemEngagement,
      engagementCounts,
      minutesBySubject,
      evidenceCount,
      evidenceArtifactIds,
      workbookEvidenceIds,
      workbookItemLabels,
      hasTeachBack,
    });
  }

  return logs;
}

export async function loadWeeklyReviewsForMonth(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
): Promise<WeeklyReviewSummary[]> {
  // Week keys are Sunday-based YYYY-MM-DD strings. A week is in this month
  // if its weekKey (Sunday) is between start and end, OR if its weekKey
  // is in the prior month but its Saturday falls in this month. To keep
  // queries simple and bounded, we read reviews whose weekKey is roughly
  // within ±7 days of the month and filter by overlap.
  const startDate = new Date(start + "T00:00:00Z");
  const earlyBound = new Date(startDate);
  earlyBound.setUTCDate(earlyBound.getUTCDate() - 7);
  const earlyKey = earlyBound.toISOString().slice(0, 10);

  const snap = await db
    .collection(`families/${familyId}/weeklyReviews`)
    .where("childId", "==", childId)
    .where("weekKey", ">=", earlyKey)
    .where("weekKey", "<=", end)
    .get();

  const reviews: WeeklyReviewSummary[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const weekKey = d.weekKey as string;
    if (!weekKey) continue;

    // Confirm the week overlaps the month (weekKey..weekKey+6 intersects [start, end])
    const weekEnd = addDays(weekKey, 6);
    if (weekEnd < start || weekKey > end) continue;

    reviews.push({
      id: doc.id,
      weekKey,
      celebration: String(d.celebration ?? ""),
      summary: String(d.summary ?? ""),
      wins: Array.isArray(d.wins) ? d.wins.map(String) : [],
      growthAreas: Array.isArray(d.growthAreas) ? d.growthAreas.map(String) : [],
      recommendations: Array.isArray(d.recommendations)
        ? d.recommendations.map(String)
        : [],
      energyPattern: d.energyPattern ? String(d.energyPattern) : undefined,
    });
  }

  reviews.sort((a, b) => a.weekKey.localeCompare(b.weekKey));
  return reviews;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface SnapshotBlockData {
  id?: string;
  name: string;
  affectedSkills?: string[];
  status?: string;
  recommendation?: string;
  rationale: string;
  firstDetectedAt?: string;
  detectedAt?: string;
  resolvedAt?: string;
  evidence?: string;
  specificWords?: string[];
}

function mapBlock(b: SnapshotBlockData): BlockerEntry {
  return {
    id: b.id ?? b.name,
    name: b.name,
    affectedSkills: b.affectedSkills ?? [],
    status: b.status ?? b.recommendation ?? "UNKNOWN",
    rationale: b.rationale,
    detectedAt: b.firstDetectedAt ?? b.detectedAt,
    resolvedAt: b.resolvedAt,
    evidence: b.evidence,
    specificWords: b.specificWords,
  };
}

export async function loadBlockers(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
): Promise<{ active: BlockerEntry[]; resolved: BlockerEntry[] }> {
  const snap = await db
    .doc(`families/${familyId}/skillSnapshots/${childId}`)
    .get();
  if (!snap.exists) return { active: [], resolved: [] };

  const data = snap.data() as {
    conceptualBlocks?: SnapshotBlockData[];
  };
  const blocks = data.conceptualBlocks ?? [];

  const active: BlockerEntry[] = [];
  const resolved: BlockerEntry[] = [];

  for (const b of blocks) {
    const mapped = mapBlock(b);
    if (mapped.status === "ADDRESS_NOW" || mapped.status === "RESOLVING") {
      active.push(mapped);
    }
    if (mapped.status === "RESOLVED" && mapped.resolvedAt) {
      const day = mapped.resolvedAt.slice(0, 10);
      if (day >= start && day <= end) resolved.push(mapped);
    }
  }

  return { active, resolved };
}

export async function loadCompletedBooksInMonth(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
): Promise<CompletedBookEntry[]> {
  const endIso = end + "T23:59:59";
  const snap = await db
    .collection(`families/${familyId}/books`)
    .where("childId", "==", childId)
    .where("status", "==", "complete")
    .where("updatedAt", ">=", start)
    .where("updatedAt", "<=", endIso)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      title: (d.title as string) ?? "Untitled",
      bookType: (d.bookType as string) ?? "creative",
      theme: d.theme as string | undefined,
      pageCount: Array.isArray(d.pages) ? d.pages.length : 0,
      completedAt: (d.updatedAt as string) ?? "",
      createdBy: d.createdBy as string | undefined,
    };
  });
}

export async function loadDadLabReportsInMonth(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
  childName?: string,
): Promise<DadLabEntry[]> {
  // No `status` filter: the lifecycle is planned → active → complete, but
  // families don't always mark a session 'complete' even after the kid did
  // the work. What runs below instead is a "did this lab happen?" test, so a
  // never-run backlog entry (FEAT-157 lets the chat create `Planned` labs)
  // still stays out of the book.
  //
  // FEAT-163 — the THIRD occurrence of the UX-85 bug. That test used to be
  // `childReports` alone, and a beat-era lab can carry no `childReports` key
  // at all, so it was dropped whole: August's book counted 1 of Nathan's 3
  // labs (only the pre-beats one) and reported "no photos" for the section,
  // because `loadPhotosForMonth` resolves lab photos through `artifactIds`
  // below. A lab expresses that it happened in TWO shapes now:
  //
  //   - legacy: a `childReports` entry — a per-child signal, kept as-is, so a
  //     legacy lab naming only the other child stays out of this child's book;
  //   - FEAT-56 beats: a writing line or a captured item in any beat. This
  //     shape carries NO per-child participation signal to filter on, and that
  //     is by design, not an omission — `beats[*].items[].child` defaults to
  //     the `BEAT_BOTH` sentinel, the artifacts are written `childId: 'both'`,
  //     `DadLabReport` has no `childId`/`childIds` field at all (FEAT-157's
  //     `planLab` carries none either), and `useDadLabReports` credits hours,
  //     XP and diamonds to EVERY child on completion. So a beat-era lab counts
  //     for both children, exactly as the portfolio already treats it
  //     (`DAD_LAB_FAMILY_SCOPE_NOTE`). All three are DATA-04.
  //
  // Key shape: the writer (LabReportForm + KidLabView) keys `childReports`
  // by `childName.toLowerCase()` ("lincoln" / "london"), not by Firestore
  // child doc id. Check the lowercase-name key first, then fall back to
  // the child doc id for any historical reports written under that shape.
  const snap = await db
    .collection(`families/${familyId}/dadLabReports`)
    .where("date", ">=", start)
    .where("date", "<=", end)
    .get();

  const nameKey = childName?.toLowerCase();

  const reports: DadLabEntry[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const childReports = (d.childReports ?? {}) as Record<
      string,
      { prediction?: string; explanation?: string; artifacts?: string[] }
    >;
    const childContrib =
      (nameKey ? childReports[nameKey] : undefined) ?? childReports[childId];
    const hasBeatContent = labBeatsHaveContent(d.beats);
    if (!childContrib && !hasBeatContent) continue;

    reports.push({
      id: doc.id,
      title: (d.title as string) ?? "Untitled lab",
      question: (d.question as string) ?? "",
      completedAt: (d.updatedAt as string) ?? (d.date as string) ?? "",
      // The beat-era counterparts of the legacy fields: "Predict" is the
      // prediction, "What we saw" is where the family says what happened.
      // Without this a fully-written three-beat lab reads as [not predicted,
      // not explained] in the prompt, which is the opposite of the truth.
      //
      // Attribution-gated, unlike participation above: `textChild` credits a
      // writing line to 'both' or to one child, and these flags become a
      // per-child `[predicted]`/`[explained]` claim in the prompt (Codex P2).
      hasPrediction:
        !!childContrib?.prediction || !!beatTextForChild(d.beats, "predict", childId),
      hasExplanation:
        !!childContrib?.explanation || !!beatTextForChild(d.beats, "saw", childId),
      artifactIds: reportArtifactIds(d),
    });
  }

  return reports;
}

export async function loadPhotosForMonth(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
  dadLabReports: DadLabEntry[] = [],
): Promise<{
  photos: PhotoRef[];
  workbookArtifactIds: Set<string>;
  classifiedScanIds: Set<string>;
  allArtifactIds: Set<string>;
  /**
   * FEAT-141: artifact doc id → its `tags.planItem`, for the artifacts that
   * carry one. Joined against each day log's `workbookItemLabels` so a photo
   * saved against a workbook activity is recognized as a curriculum image even
   * when nothing links it to a checklist row (batch pages 2..N).
   */
  artifactPlanItems: Record<string, string>;
}> {
  const endIso = end + "T23:59:59";
  const photos: PhotoRef[] = [];
  const workbookArtifactIds = new Set<string>();
  const classifiedScanIds = new Set<string>();
  const allArtifactIds = new Set<string>();
  const artifactPlanItems: Record<string, string> = {};

  // Scans
  try {
    const scansSnap = await db
      .collection(`families/${familyId}/scans`)
      .where("childId", "==", childId)
      .where("createdAt", ">=", start)
      .where("createdAt", "<=", endIso)
      .get();

    for (const doc of scansSnap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const storagePath = (d.storagePath as string) ?? "";
      if (!storagePath) continue;
      if (scanHasClassifiedContent(d)) classifiedScanIds.add(doc.id);
      const subjectTag = extractScanSubject(d);
      const ref: PhotoRef = {
        id: `scan:${doc.id}`,
        storagePath,
        source: "scan",
        sourceDocId: doc.id,
        capturedAt: (d.createdAt as string) ?? "",
      };
      const contentNote = readContentNote(d);
      if (contentNote) ref.contentNote = contentNote;
      if (subjectTag) ref.subjectTag = subjectTag;
      photos.push(ref);
    }
  } catch (err) {
    console.warn("[monthlyReview] loadPhotosForMonth scans failed:", err);
  }

  // Artifacts
  const seenArtifactIds = new Set<string>();
  try {
    const artifactsSnap = await db
      .collection(`families/${familyId}/artifacts`)
      .where("childId", "==", childId)
      .where("createdAt", ">=", start)
      .where("createdAt", "<=", endIso)
      .get();

    for (const doc of artifactsSnap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const storagePath = (d.storagePath as string) ?? (d.uri as string) ?? "";
      if (!storagePath) continue;
      const type = (d.type as string) ?? "";
      // Only image-bearing artifacts (Photo, Worksheet); skip Audio/Note
      if (type !== "Photo" && type !== "Worksheet" && type !== "Video") continue;
      const tags = (d.tags ?? {}) as { subjectBucket?: string; planItem?: string };
      if (typeof tags.planItem === "string" && tags.planItem.trim()) {
        artifactPlanItems[doc.id] = tags.planItem.trim();
      }
      if (type === "Worksheet") {
        workbookArtifactIds.add(doc.id);
      } else {
        // Any artifact that's not a workbook capture qualifies as a creative
        // artifact for artifact-default kid-mode placement.
        allArtifactIds.add(doc.id);
      }
      const ref: PhotoRef = {
        id: `artifact:${doc.id}`,
        storagePath,
        source: "artifact",
        sourceDocId: doc.id,
        capturedAt: (d.createdAt as string) ?? "",
      };
      const contentNote = readContentNote(d);
      if (contentNote) ref.contentNote = contentNote;
      if (tags.subjectBucket) ref.subjectTag = tags.subjectBucket;
      photos.push(ref);
      seenArtifactIds.add(doc.id);
    }
  } catch (err) {
    console.warn("[monthlyReview] loadPhotosForMonth artifacts failed:", err);
  }

  // Dad Lab photos
  //
  // Dad Lab photo writes go to the `artifacts` collection, but nothing there
  // carries the queried child's doc id, so the childId-filtered artifact query
  // above misses them twice over: `KidLabView` sets `childId` to
  // `childName.toLowerCase()` (LabReportForm's legacy path uses the doc id),
  // and the FEAT-56 beat capture writes `childId: BEAT_BOTH` ('both') by
  // design — every modern lab photo. The report doc is therefore the ONLY
  // route these photos have into the book; `DadLabEntry.artifactIds` is the
  // authoritative list (both sources, de-duped — FEAT-163), and we fetch those
  // artifact docs directly by id and add the ones we haven't already seen.
  try {
    const dadLabArtifactRefs: Array<{ reportId: string; reportTitle: string; reportDate: string; artifactId: string }> = [];
    for (const report of dadLabReports) {
      for (const artifactId of report.artifactIds) {
        if (seenArtifactIds.has(artifactId)) continue;
        dadLabArtifactRefs.push({
          reportId: report.id,
          reportTitle: report.title,
          reportDate: report.completedAt,
          artifactId,
        });
      }
    }

    if (dadLabArtifactRefs.length > 0) {
      const docRefs = dadLabArtifactRefs.map(({ artifactId }) =>
        db.doc(`families/${familyId}/artifacts/${artifactId}`),
      );
      const snaps = await db.getAll(...docRefs);
      for (let i = 0; i < snaps.length; i++) {
        const snap = snaps[i];
        const meta = dadLabArtifactRefs[i];
        if (!snap.exists) continue;
        const d = snap.data() as Record<string, unknown> | undefined;
        if (!d) continue;
        const storagePath = (d.storagePath as string) ?? (d.uri as string) ?? "";
        if (!storagePath) continue;
        const type = (d.type as string) ?? "";
        // Image-bearing artifacts only — skip audio recordings attached to the lab.
        if (type !== "Photo" && type !== "Video") continue;
        const tags = (d.tags ?? {}) as { subjectBucket?: string };
        allArtifactIds.add(meta.artifactId);
        seenArtifactIds.add(meta.artifactId);
        const ref: PhotoRef = {
          id: `artifact:${meta.artifactId}`,
          storagePath,
          source: "artifact",
          sourceDocId: meta.artifactId,
          capturedAt: (d.createdAt as string) ?? meta.reportDate ?? "",
          sourceMetadata: {
            type: "dadLab",
            reportId: meta.reportId,
            reportTitle: meta.reportTitle,
          },
        };
        const contentNote = readContentNote(d);
        if (contentNote) ref.contentNote = contentNote;
        if (tags.subjectBucket) ref.subjectTag = tags.subjectBucket;
        photos.push(ref);
      }
    }
  } catch (err) {
    console.warn("[monthlyReview] loadPhotosForMonth dadLab failed:", err);
  }

  return {
    photos,
    workbookArtifactIds,
    classifiedScanIds,
    allArtifactIds,
    artifactPlanItems,
  };
}

/**
 * FEAT-141: read the capture-time content note off a scan or artifact doc.
 * Defensive — the field is optional, never backfilled, and this loader must
 * treat a missing or non-string value exactly like a photo that has none.
 * The 140-char cap is enforced at WRITE; this trims only, so an older
 * over-long value still reads rather than being silently dropped.
 */
function readContentNote(d: Record<string, unknown>): string | undefined {
  const raw = d.contentNote;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function extractScanSubject(d: Record<string, unknown>): string | undefined {
  const results = d.results as { subject?: string; subjectBucket?: string } | null | undefined;
  return results?.subject ?? results?.subjectBucket;
}

/**
 * True when the scan has any meaningful AI analysis attached — meaning the
 * scan pipeline actually recognized curriculum content rather than the user
 * snapping a random photo. Used to qualify scans for kid-mode placement and
 * the cover-hero allowlist.
 */
function scanHasClassifiedContent(d: Record<string, unknown>): boolean {
  const results = d.results as
    | {
        subject?: string;
        subjectBucket?: string;
        pageType?: string;
        specificTopic?: string;
        curriculumDetected?: { name?: string };
        skillsAssessed?: unknown;
      }
    | null
    | undefined;
  if (!results) return false;
  if (results.subject && results.subject.trim()) return true;
  if (results.subjectBucket && results.subjectBucket.trim()) return true;
  if (results.specificTopic && results.specificTopic.trim()) return true;
  if (results.curriculumDetected?.name) return true;
  if (Array.isArray(results.skillsAssessed) && results.skillsAssessed.length)
    return true;
  return false;
}

export async function loadConundrumsForMonth(
  db: Firestore,
  familyId: string,
  start: string,
  end: string,
): Promise<ConundrumEntry[]> {
  // Conundrums live on weekly week plans, but the canonical store varies.
  // We read the `weeks` collection where startDate is in the month range
  // and pull `conundrum.question` (when present). Kid responses are tracked
  // separately; in MVP we only surface the question.
  const out: ConundrumEntry[] = [];
  try {
    const snap = await db
      .collection(`families/${familyId}/weeks`)
      .where("startDate", ">=", start)
      .where("startDate", "<=", end)
      .get();

    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const con = (d.conundrum ?? d.conundrumScenario) as
        | { question?: string; scenario?: string }
        | string
        | undefined;
      if (!con) continue;
      const question =
        typeof con === "string"
          ? con
          : con.question || con.scenario || "";
      if (!question) continue;
      out.push({
        weekKey: (d.startDate as string) ?? doc.id,
        question,
      });
    }
  } catch (err) {
    console.warn("[monthlyReview] loadConundrumsForMonth failed:", err);
  }
  return out;
}

export function extractTeachBacksFromDayLogs(
  dayLogs: DayLogEntry[],
): TeachBackEntry[] {
  return dayLogs
    .filter((d) => d.hasTeachBack)
    .map((d) => ({
      date: d.date,
      subject: dominantSubject(d.minutesBySubject) ?? "Other",
      hasAudio: false,
    }));
}

function dominantSubject(byBucket: Record<string, number>): string | undefined {
  let max = 0;
  let best: string | undefined;
  for (const [k, v] of Object.entries(byBucket)) {
    if (v > max) {
      max = v;
      best = k;
    }
  }
  return best;
}

/**
 * The month's counted hours, by the SAME rule the Records page uses (FEAT-164).
 *
 * This used to sum the `hours` collection alone, so the book narrated a smaller
 * month than the record it belongs to — and, because the shortfall is
 * per-subject, it could name the wrong subject as the month's biggest. All
 * three additive sources now flow through the ported counting path
 * (`monthlyHours.ts` → `collectHoursContributions`), which owns the DATA-09
 * attribution filter and the DATA-14 partial-day rule. The rule itself is not
 * re-implemented here; do not add arithmetic to this loader.
 *
 * `rawDayLogs` lets the caller hand over the `days` docs it has already read
 * (`loadRawDayLogsForMonth`); when omitted they are loaded here, so the
 * signature stays a drop-in for `auditMonthlyReviewSources`.
 */
export async function loadHoursForMonth(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
  rawDayLogs?: RawDayLog[],
): Promise<HoursSummary> {
  const [entriesSnap, adjustmentsSnap, dayLogs] = await Promise.all([
    db
      .collection(`families/${familyId}/hours`)
      .where("childId", "==", childId)
      .where("date", ">=", start)
      .where("date", "<=", end)
      .get(),
    // DATA-09: an adjustment counts for this child when it is tagged to them
    // OR to 'both'. That disjunction is applied in memory by the ported
    // counting path, so this query stays a plain date range (no new index).
    db
      .collection(`families/${familyId}/hoursAdjustments`)
      .where("date", ">=", start)
      .where("date", "<=", end)
      .get(),
    rawDayLogs ?? loadRawDayLogsForMonth(db, familyId, childId, start, end),
  ]);

  const entries = entriesSnap.docs.map((doc) => doc.data() as RawHoursEntry);
  const adjustments = adjustmentsSnap.docs.map(
    (doc) => doc.data() as RawHoursAdjustment,
  );

  return computeMonthHours(dayLogs, entries, adjustments, childId);
}

export async function loadDiamondsForMonth(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
): Promise<DiamondSummary> {
  const startIso = start + "T00:00:00";
  const endIso = end + "T23:59:59";
  const snap = await db
    .collection(`families/${familyId}/xpLedger`)
    .where("childId", "==", childId)
    .where("awardedAt", ">=", startIso)
    .where("awardedAt", "<=", endIso)
    .get();

  let totalDiamonds = 0;
  let questEvents = 0;
  let routineEvents = 0;
  for (const doc of snap.docs) {
    const d = doc.data() as {
      amount?: number;
      currencyType?: string;
      type?: string;
      category?: string;
    };
    // Only count diamond entries; skip XP and aggregate docs (no amount).
    if (!d.amount || d.currencyType !== "diamond") continue;
    if (d.amount < 0) continue; // skip deductions
    totalDiamonds += d.amount;
    if (d.type?.startsWith("QUEST_") || d.category === "quest") questEvents++;
    if (d.type?.startsWith("ROUTINE_") || d.category === "routine") routineEvents++;
  }

  return { totalDiamonds, questEvents, routineEvents };
}

export async function loadQuestCountForMonth(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
): Promise<number> {
  try {
    const snap = await db
      .collection(`families/${familyId}/evaluationSessions`)
      .where("childId", "==", childId)
      .where("status", "==", "complete")
      .where("evaluatedAt", ">=", start)
      .where("evaluatedAt", "<=", end + "T23:59:59")
      .get();
    return snap.docs.filter((doc) => {
      const d = doc.data() as { sessionType?: string };
      return d.sessionType === "interactive";
    }).length;
  } catch (err) {
    console.warn("[monthlyReview] loadQuestCountForMonth failed:", err);
    return 0;
  }
}

/**
 * Read-aloud reading for the month, derived from per-child `bookProgress` docs.
 *
 * A book counts as "read this month" only when at least one question pool item
 * was answered this month (`answered === true` and `answeredDate` within the
 * range). Skips carry no date, so a book with only skips is not attributed to
 * any month; skip counts are surfaced only for books that were actively read
 * this month. Coverage, not pace — no "behind"/"ahead" framing downstream.
 */
export async function loadReadingForMonth(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
): Promise<ReadingSummary> {
  const empty: ReadingSummary = {
    books: [],
    totalChaptersAnswered: 0,
    totalQuestionsAnswered: 0,
    totalQuestionsSkipped: 0,
  };

  try {
    const snap = await db
      .collection(`families/${familyId}/bookProgress`)
      .where("childId", "==", childId)
      .get();

    const books: ReadingBookSummary[] = [];
    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const pool = Array.isArray(d.questionPool)
        ? (d.questionPool as Array<{
            chapter?: number;
            answered?: boolean;
            answeredDate?: string;
            skipped?: boolean;
          }>)
        : [];

      const chaptersThisMonth = new Set<number>();
      let questionsAnswered = 0;
      let questionsSkipped = 0;
      for (const item of pool) {
        const day = item.answeredDate?.slice(0, 10);
        if (item.answered && day && day >= start && day <= end) {
          questionsAnswered++;
          if (typeof item.chapter === "number") {
            chaptersThisMonth.add(item.chapter);
          }
        }
        if (item.skipped) questionsSkipped++;
      }

      // No dated answer this month → not this month's reading.
      if (questionsAnswered === 0) continue;

      books.push({
        bookId: (d.bookId as string) ?? doc.id,
        title: (d.bookTitle as string) ?? "Untitled book",
        totalChapters: typeof d.totalChapters === "number" ? d.totalChapters : 0,
        chaptersAnswered: chaptersThisMonth.size,
        questionsAnswered,
        questionsSkipped,
      });
    }

    books.sort((a, b) => b.questionsAnswered - a.questionsAnswered);

    return {
      books,
      totalChaptersAnswered: books.reduce((s, b) => s + b.chaptersAnswered, 0),
      totalQuestionsAnswered: books.reduce((s, b) => s + b.questionsAnswered, 0),
      totalQuestionsSkipped: books.reduce((s, b) => s + b.questionsSkipped, 0),
    };
  } catch (err) {
    console.warn("[monthlyReview] loadReadingForMonth failed:", err);
    return empty;
  }
}

// ── Top-level aggregator ──────────────────────────────────────

export async function aggregateMonthData(
  db: Firestore,
  familyId: string,
  childId: string,
  month: string,
  childName?: string,
): Promise<MonthAggregate> {
  const { start, end } = getMonthBounds(month);

  // FEAT-164: ONE `days` read feeds both consumers — the curation projection
  // and the hours total, which needs the `blocks` the projection drops.
  const rawDayLogs = await loadRawDayLogsForMonth(
    db,
    familyId,
    childId,
    start,
    end,
  );
  const dayLogs = projectDayLogEntries(rawDayLogs);

  // dadLabReports must resolve before loadPhotosForMonth so the photo loader
  // can extract Dad Lab artifact IDs from `childReports[name].artifacts`.
  const [
    weeklyReviews,
    blockers,
    completedBooks,
    dadLabReports,
    conundrums,
    hours,
    diamonds,
    questCount,
    reading,
  ] = await Promise.all([
    loadWeeklyReviewsForMonth(db, familyId, childId, start, end),
    loadBlockers(db, familyId, childId, start, end),
    loadCompletedBooksInMonth(db, familyId, childId, start, end),
    loadDadLabReportsInMonth(db, familyId, childId, start, end, childName),
    loadConundrumsForMonth(db, familyId, start, end),
    loadHoursForMonth(db, familyId, childId, start, end, rawDayLogs),
    loadDiamondsForMonth(db, familyId, childId, start, end),
    loadQuestCountForMonth(db, familyId, childId, start, end),
    loadReadingForMonth(db, familyId, childId, start, end),
  ]);

  const photosResult = await loadPhotosForMonth(
    db,
    familyId,
    childId,
    start,
    end,
    dadLabReports,
  );

  const teachBacks = extractTeachBacksFromDayLogs(dayLogs);

  return {
    month,
    monthStart: start,
    monthEnd: end,
    dayLogs,
    weeklyReviews,
    activeBlockers: blockers.active,
    resolvedBlockers: blockers.resolved,
    completedBooks,
    dadLabReports,
    photos: photosResult.photos,
    workbookArtifactIds: photosResult.workbookArtifactIds,
    classifiedScanIds: photosResult.classifiedScanIds,
    allArtifactIds: photosResult.allArtifactIds,
    artifactPlanItems: photosResult.artifactPlanItems,
    conundrums,
    teachBacks,
    hours,
    diamonds,
    questCount,
    reading,
  };
}
