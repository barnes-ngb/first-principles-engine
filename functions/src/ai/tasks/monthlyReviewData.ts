import type { Firestore } from "firebase-admin/firestore";

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
 *   days:
 *     date single-field (fieldOverride) — loadDayLogsForMonth — already present
 *   weeks:
 *     startDate single-field (auto) — loadConundrumsForMonth — no entry needed
 *   skillSnapshots:
 *     direct doc fetch — loadBlockers — no index needed
 *
 * All indexes are defined in `firestore.indexes.json`. If you add a new query
 * here, also add the index there and update this list.
 */

// ── Types (mirror src/core/types/monthlyReview.ts but kept local to functions) ──

export interface PhotoRef {
  id: string;
  storagePath: string;
  source: "scan" | "artifact";
  sourceDocId: string;
  capturedAt: string;
  score?: number;
  subjectTag?: string;
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
  conundrums: ConundrumEntry[];
  teachBacks: TeachBackEntry[];
  hours: HoursSummary;
  diamonds: DiamondSummary;
  questCount: number;
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

export async function loadDayLogsForMonth(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
): Promise<DayLogEntry[]> {
  const snap = await db
    .collection(`families/${familyId}/days`)
    .where("date", ">=", start)
    .where("date", "<=", end)
    .get();

  const logs: DayLogEntry[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.childId !== childId) continue;
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
    }>;

    const itemEngagement: Record<string, string> = {};
    const engagementCounts: Record<string, number> = {};
    const minutesBySubject: Record<string, number> = {};
    const evidenceArtifactIds: string[] = [];
    let evidenceCount = 0;
    let hasTeachBack = false;

    for (const item of checklist) {
      if (item.engagement) {
        engagementCounts[item.engagement] =
          (engagementCounts[item.engagement] ?? 0) + 1;
        const key = item.id ?? item.label;
        if (key) itemEngagement[key] = item.engagement;
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
  // the work. The child's contribution in `childReports` is the real
  // participation signal — that filter runs below.
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
      { prediction?: string; explanation?: string }
    >;
    const childContrib =
      (nameKey ? childReports[nameKey] : undefined) ?? childReports[childId];
    if (!childContrib) continue;

    reports.push({
      id: doc.id,
      title: (d.title as string) ?? "Untitled lab",
      question: (d.question as string) ?? "",
      completedAt: (d.updatedAt as string) ?? (d.date as string) ?? "",
      hasPrediction: !!childContrib.prediction,
      hasExplanation: !!childContrib.explanation,
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
): Promise<{
  photos: PhotoRef[];
  workbookArtifactIds: Set<string>;
  classifiedScanIds: Set<string>;
  allArtifactIds: Set<string>;
}> {
  const endIso = end + "T23:59:59";
  const photos: PhotoRef[] = [];
  const workbookArtifactIds = new Set<string>();
  const classifiedScanIds = new Set<string>();
  const allArtifactIds = new Set<string>();

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
      if (subjectTag) ref.subjectTag = subjectTag;
      photos.push(ref);
    }
  } catch (err) {
    console.warn("[monthlyReview] loadPhotosForMonth scans failed:", err);
  }

  // Artifacts
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
      const tags = (d.tags ?? {}) as { subjectBucket?: string };
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
      if (tags.subjectBucket) ref.subjectTag = tags.subjectBucket;
      photos.push(ref);
    }
  } catch (err) {
    console.warn("[monthlyReview] loadPhotosForMonth artifacts failed:", err);
  }

  return { photos, workbookArtifactIds, classifiedScanIds, allArtifactIds };
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

export async function loadHoursForMonth(
  db: Firestore,
  familyId: string,
  childId: string,
  start: string,
  end: string,
): Promise<HoursSummary> {
  const snap = await db
    .collection(`families/${familyId}/hours`)
    .where("childId", "==", childId)
    .where("date", ">=", start)
    .where("date", "<=", end)
    .get();

  let totalMinutes = 0;
  const minutesBySubject: Record<string, number> = {};
  for (const doc of snap.docs) {
    const d = doc.data() as { minutes?: number; subjectBucket?: string };
    const mins = d.minutes ?? 0;
    totalMinutes += mins;
    const bucket = d.subjectBucket ?? "Other";
    minutesBySubject[bucket] = (minutesBySubject[bucket] ?? 0) + mins;
  }

  return { totalMinutes, minutesBySubject };
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

// ── Top-level aggregator ──────────────────────────────────────

export async function aggregateMonthData(
  db: Firestore,
  familyId: string,
  childId: string,
  month: string,
  childName?: string,
): Promise<MonthAggregate> {
  const { start, end } = getMonthBounds(month);

  const [
    dayLogs,
    weeklyReviews,
    blockers,
    completedBooks,
    dadLabReports,
    photosResult,
    conundrums,
    hours,
    diamonds,
    questCount,
  ] = await Promise.all([
    loadDayLogsForMonth(db, familyId, childId, start, end),
    loadWeeklyReviewsForMonth(db, familyId, childId, start, end),
    loadBlockers(db, familyId, childId, start, end),
    loadCompletedBooksInMonth(db, familyId, childId, start, end),
    loadDadLabReportsInMonth(db, familyId, childId, start, end, childName),
    loadPhotosForMonth(db, familyId, childId, start, end),
    loadConundrumsForMonth(db, familyId, start, end),
    loadHoursForMonth(db, familyId, childId, start, end),
    loadDiamondsForMonth(db, familyId, childId, start, end),
    loadQuestCountForMonth(db, familyId, childId, start, end),
  ]);

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
    conundrums,
    teachBacks,
    hours,
    diamonds,
    questCount,
  };
}
