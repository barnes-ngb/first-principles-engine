import { getFirestore } from "firebase-admin/firestore";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireEmailAuth } from "./authGuard.js";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { claudeApiKey } from "./aiConfig.js";
import { buildContextForTask } from "./contextSlices.js";
import type { SnapshotData } from "./chatTypes.js";
import { sanitizeAndParseJson } from "../shared/sanitizeJson.js";
import { callClaude, logAiUsage } from "./chatTypes.js";
import { modelForTask } from "./chat.js";
import { synthesizeIfStale } from "./learnerSynthesis.js";
import { civilDateObjectInZone } from "./familyClock.js";
import { foldHoursForPrompt, hoursLoggedBlock, type HoursTotals } from "./promptHours.js";
import { deriveChildIdFromDocId } from "../shared/docId.js";
import { ADJUSTMENT_BOTH } from "../shared/hoursContributions.js";
import type {
  RawDayLog,
  RawHoursAdjustment,
  RawHoursEntry,
} from "../shared/hoursContributions.js";

// ── Types ───────────────────────────────────────────────────────

export interface BookCreatedEntry {
  title: string;
  theme?: string;
  pages: number;
  isAiGenerated: boolean;
}

export interface BookReadEntry {
  title: string;
  totalMinutes: number;
}

export interface BooksWeekSummary {
  booksCreated: BookCreatedEntry[];
  booksCompleted: Array<{ title: string }>;
  readingSessions: {
    /** Books touched (updatedAt in week range) with at least one logged minute. */
    count: number;
    /** Cumulative totalMinutes across the touched books — proxy for reading effort. */
    totalMinutes: number;
    booksRead: BookReadEntry[];
  };
}

export interface TeachBackExample {
  subject: string;
  hasAudio: boolean;
  audioUrl?: string;
  excerpt?: string;
  createdAt: string;
}

export interface TeachBacksWeekSummary {
  count: number;
  bySubject: Record<string, number>;
  audioCount: number;
  textCount: number;
  examples: TeachBackExample[];
}

export interface WeekEvidence {
  books: BooksWeekSummary;
  teachBacks: TeachBacksWeekSummary;
}

export interface WeeklyReviewDoc {
  childId: string;
  weekKey: string;
  status: string;
  celebration: string;
  summary: string;
  wins: string[];
  growthAreas: string[];
  paceAdjustments: Array<{
    id: string; area: string; currentPace: string;
    suggestedPace: string; rationale: string; decision: string;
  }>;
  recommendations: string[];
  energyPattern: string;
  evidence?: WeekEvidence;
  /** Workbook positions as they stood when this review was generated (UX-212). */
  curriculumPositions?: CurriculumSnapshotDoc;
  /** The parent's answer to the week's one question (UX-214). Never written
   * here — only carried forward so a regenerate cannot delete it. */
  reflection?: Record<string, unknown>;
  /** The week's counted minutes, folded through the shared rule (UX-409). */
  hoursSummary?: WeekHoursDoc;
  /**
   * Why the narrative is missing or stale, when the model call or its parse
   * failed (UX-409). `null` on a run whose narrative landed — a written `null`
   * rather than a field delete, so the whole write stays a plain merge and this
   * module needs no `FieldValue` (which its tests would then have to mock).
   */
  narrativeError?: NarrativeErrorDoc | null;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  createdAt: string;
}

/** What failed, and when. Never the model's own text — see `narrativeErrorDoc`. */
export interface NarrativeErrorDoc {
  message: string;
  /** Which of the two failures this was — app-owned, like the message. */
  reason: NarrativeFailureReason;
  at: string;
}

/**
 * The three `status` values this Cloud Function writes.
 *
 * `snapshot-only` is new with UX-409 and is what a week reads while its record
 * exists and its narrative does not — either because the model call has not
 * happened yet (the window between this run's two writes) or because it failed.
 * The client mirrors these in `ReviewStatus`; the page reads the field as
 * *"the weekly run wrote this week"* (`reviewWasGenerated`), which all three
 * satisfy, and reads `narrativeError` for the narrower question.
 */
export const REVIEW_STATUS_SNAPSHOT_ONLY = "snapshot-only";
export const REVIEW_STATUS_DRAFT = "draft";
export const REVIEW_STATUS_NO_DATA = "no-data";

/**
 * The statuses an empty-week rerun may write over.
 *
 * Neither of these carries a narrative somebody could lose: `snapshot-only` is a
 * record whose prose never arrived, and `no-data` is the empty-week prose
 * itself. Everything else — `draft`, and the `reviewed` / `applied` the page
 * writes — means a real narrative is on file, and it stands.
 */
const REPLACEABLE_REVIEW_STATUSES = new Set<string>([
  REVIEW_STATUS_SNAPSHOT_ONLY,
  REVIEW_STATUS_NO_DATA,
]);

/**
 * The half of the document that owes the model nothing — written FIRST
 * (UX-409). Every field here comes from a plain Firestore read or a pure fold.
 */
export interface WeeklyReviewRecord {
  childId: string;
  weekKey: string;
  status?: string;
  evidence: WeekEvidence;
  hoursSummary: WeekHoursDoc;
  curriculumPositions?: CurriculumSnapshotDoc;
  reflection?: Record<string, unknown>;
  createdAt: string;
}

/** The half that comes from the model — merged on afterwards, if it lands. */
export interface WeeklyReviewNarrative {
  status: string;
  celebration: string;
  summary: string;
  wins: string[];
  growthAreas: string[];
  paceAdjustments: WeeklyReviewDoc["paceAdjustments"];
  recommendations: string[];
  energyPattern: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * One workbook's position at review time (UX-212).
 *
 * `ActivityConfig.currentPosition` is a single mutable field and the repo has no
 * position history anywhere, so a rate of coverage cannot be computed
 * retroactively — recording the positions each week is what makes one possible
 * from the *next* week onward. Nothing is ever back-filled or estimated.
 *
 * Recorded here, on **generate**, rather than when a parent opens or answers the
 * review, and deliberately: the scheduled Sunday run fires whether or not
 * anyone looks, so the series survives exactly the month-goes-by case the rate
 * exists to make visible. Recording on open would be a write on read; recording
 * on answer would go blind precisely on the weeks nobody reviewed.
 *
 * Structurally parallel to the app's `CurriculumPositionRecord` /
 * `CurriculumSnapshot` in `src/core/types/planning.ts`, the same way
 * `WeeklyReviewDoc` already parallels `WeeklyReview`. The reader narrows what it
 * finds (`normalizeCurriculumSnapshot`), so a drift here degrades to "unknown"
 * rather than to a wrong number.
 */
export interface CurriculumPositionDoc {
  configId: string;
  name: string;
  currentPosition: number;
  totalUnits?: number;
  unitLabel?: string;
  completed?: boolean;
}

export interface CurriculumSnapshotDoc {
  /** ISO timestamp of the moment the positions were actually read. */
  recordedAt: string;
  weekKey: string;
  positions: CurriculumPositionDoc[];
}

interface ChildProfile {
  id: string;
  name: string;
  grade?: string;
}

/**
 * What the prompt says about one day: how much of it was done, how it went, and
 * what was captured.
 *
 * It carried a `minutesBySubject` until UX-410 — completed checklist items at
 * their planned minutes, with no block-actuals rule — which made it the third of
 * the three AI-side readers counting hours their own way. Minutes are now stated
 * ONCE for the week, folded through the shared rule; this summary answers about
 * completion and engagement, which is a different question and the one the
 * per-day breakdown is for.
 */
interface DayLogSummary {
  date: string;
  totalItems: number;
  completedItems: number;
  engagement: Record<string, number>;
  gradeResults: string[];
  evidenceCount: number;
}

interface DailyPlanRecord {
  date: string;
  energy: string;
  planType: string;
  sessions: Array<{ streamId: string; ladderId: string }>;
}

// ── Week helpers ────────────────────────────────────────────────

/**
 * Return the Sunday-of-week date string for the week the review covers.
 *
 * **One rule, not a table of offsets (UX-263):** step back to the Sunday that
 * starts the Sun–Sat week containing `today`, then — on every day but Saturday —
 * back one more week, because on those days that week's school body is still
 * ahead or in progress. Saturday is the only day on which the containing week's
 * Mon–Fri is entirely behind us.
 *
 * | Called on          | Returns   | School week it names |
 * |--------------------|-----------|----------------------|
 * | Sat Sep 5          | Aug 30    | Aug 31 – Sep 4       |
 * | Sun Sep 6          | Aug 30    | Aug 31 – Sep 4       |
 * | Mon Sep 7 – Fri 11 | Aug 30    | Aug 31 – Sep 4       |
 * | Sat Sep 12         | Sep 6     | Sep 7 – Sep 11       |
 *
 * **This is the same rule as the page's `lastCompletedSchoolWeekKey`**
 * (`src/core/utils/time.ts`), deliberately and by necessity: the page reads the
 * document this key names, so if the two disagree on any day the page shows a
 * document nobody wrote. They are pinned to each other from both sides — see the
 * agreement tests in `evaluate.test.ts` and `time.test.ts`.
 *
 * **Why the Saturday branch exists even though the cron fires on a Sunday
 * (UX-263).** The old body was `offset = dayOfWeek === 0 ? 7 : dayOfWeek + 7`,
 * which on a Saturday returned the Sunday **two** weeks back. That was
 * unobservable only because nothing ever called it on a Saturday — and the first
 * cut of UX-263 did exactly that, moving the cron to Saturday evening, at which
 * point it would have written the wrong week's document. (That schedule was then
 * withdrawn for an unrelated reason — see the note on `weeklyReview` — so this
 * branch is no longer on the cron's path.)
 *
 * It stays, and is pinned, because the **page** reads this rule on a Saturday
 * every week: `lastCompletedSchoolWeekKey` names the just-finished school week
 * from Saturday onward, and a `lastWeekKey` that disagreed there would leave the
 * two neighbouring rules divergent again on exactly the day that has already
 * produced one bug (UX-218). One rule, agreeing on all seven days, is the fix;
 * agreeing only on whichever day the schedule currently names is what got us
 * here.
 *
 * **This reads its argument's LOCAL fields, and that makes the caller
 * responsible for the zone (UX-266).** Reading local getters is deliberate — it
 * is the page's arithmetic, written the same way — but a Cloud Function's
 * `new Date()` is UTC, a different clock from the one the schedule fires on. So
 * `weeklyReview` hands in `civilDateObjectInZone(new Date(), …)` rather than the
 * raw instant. On the current schedule both readings name the same week, which
 * is a coincidence of the hour and not a property of this rule: the answer
 * changes at the Fri→Sat boundary, and a Friday-evening firing is UTC Saturday.
 * Correct by cancellation is not correct.
 */
export function lastWeekKey(today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, … 6=Sat
  d.setDate(d.getDate() - dayOfWeek); // → the Sunday of the containing week
  if (dayOfWeek !== 6) d.setDate(d.getDate() - 7);
  return formatDate(d);
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

// ── Context assembly ────────────────────────────────────────────

interface BookActivity {
  title: string;
  childId: string;
  status: string;
  pageCount: number;
  bookType: string;
  theme?: string;
  completedThisWeek: boolean;
  /** 'parent' if Mom/Dad made it, otherwise the childId of the kid author. Absent on legacy books. */
  createdBy?: string;
  /** The childId this book was themed for / intended for. */
  createdFor?: string;
}

export interface WeekContext {
  child: ChildProfile;
  weekKey: string;
  dayLogs: DayLogSummary[];
  /**
   * The same day documents, raw, so the week's minutes can be folded through
   * the shared counting rule rather than re-derived here (UX-410). The summary
   * above answers about completion; this is what answers about time.
   */
  dayLogDocs: RawDayLog[];
  hours: RawHoursEntry[];
  /**
   * The week's `hoursAdjustments` — the third additive source, which this cron
   * had never read at all (UX-410). Every correction and every *Log watch time*
   * row was invisible to the prompt, and therefore to the monthly book built
   * from it.
   */
  hoursAdjustments: RawHoursAdjustment[];
  dailyPlans: DailyPlanRecord[];
  missedDays: number;
  bookActivity: BookActivity[];
  books: BooksWeekSummary;
  teachBacks: TeachBacksWeekSummary;
}

export async function assembleWeekContext(
  familyId: string,
  childId: string,
  weekKey: string,
): Promise<WeekContext> {
  const db = getFirestore();
  const familyRef = db.collection("families").doc(familyId);

  const weekEnd = addDays(weekKey, 6);

  // Load child profile
  const childSnap = await familyRef.collection("children").doc(childId).get();
  if (!childSnap.exists) {
    throw new Error(`Child ${childId} not found in family ${familyId}`);
  }
  const childData = childSnap.data() as { name: string; grade?: string };
  const child: ChildProfile = {
    id: childId,
    name: childData.name,
    grade: childData.grade,
  };

  // Load day logs for the week
  const daysSnap = await familyRef
    .collection("days")
    .where("date", ">=", weekKey)
    .where("date", "<=", weekEnd)
    .get();

  // The child's raw day documents, kept whole (UX-410): the hours fold reads
  // blocks and checklist items together under the DATA-14 partial-day rule, and
  // a summary narrowed for the prompt cannot be folded back into minutes.
  //
  // **Legacy day logs carry no `childId` field** — the child is encoded only in
  // the document id — so the id is resolved before the filter, exactly as
  // `loadRawDayLogsForMonth` and both Records read paths do (Codex round 3, P2,
  // on this row's sibling in `chat.ts`). Filtering on the raw field alone
  // dropped those documents, which mattered nowhere while this was a per-day
  // engagement summary and matters now that the same array is folded into the
  // week's minutes.
  const dayLogDocs: RawDayLog[] = daysSnap.docs
    .map((doc) => {
      const raw = doc.data() as RawDayLog;
      return { ...raw, childId: raw.childId ?? deriveChildIdFromDocId(doc.id) };
    })
    .filter((d) => d.childId === childId);

  const dayLogs: DayLogSummary[] = dayLogDocs.map((d) => {
    const checklist = (Array.isArray(d.checklist) ? d.checklist : []) as Array<{
      label: string; completed: boolean; engagement?: string;
      gradeResult?: string; evidenceArtifactId?: string;
    }>;

    const engagement: Record<string, number> = {};
    const gradeResults: string[] = [];
    let evidenceCount = 0;

    for (const item of checklist) {
      if (item.engagement) engagement[item.engagement] = (engagement[item.engagement] ?? 0) + 1;
      if (item.gradeResult) gradeResults.push(item.label + ": " + item.gradeResult);
      if (item.evidenceArtifactId) evidenceCount++;
    }

    return {
      date: (d.date as string) ?? "", totalItems: checklist.length,
      completedItems: checklist.filter((i) => i.completed).length,
      engagement, gradeResults, evidenceCount,
    } as DayLogSummary;
  });

  // Load hours for the week
  const hoursSnap = await familyRef
    .collection("hours")
    .where("childId", "==", childId)
    .where("date", ">=", weekKey)
    .where("date", "<=", weekEnd)
    .get();

  // Raw, not narrowed to `{minutes, subjectBucket, date}` as it used to be: the
  // shared rule takes `minutes` ELSE `hours * 60`, and a mapping that dropped
  // `hours` silently counted a timer-written row as zero (UX-410).
  const hours: RawHoursEntry[] = hoursSnap.docs.map((doc) => doc.data() as RawHoursEntry);

  // The third additive source, which this cron had never read (UX-410).
  // Deliberately NOT filtered by `childId` in the query: DATA-09 counts an
  // adjustment for this child when it is tagged to them *or to `'both'`*, and
  // that is the fold's rule to apply, not a query's.
  const adjSnap = await familyRef
    .collection("hoursAdjustments")
    .where("date", ">=", weekKey)
    .where("date", "<=", weekEnd)
    .get();

  const hoursAdjustments: RawHoursAdjustment[] = adjSnap.docs.map(
    (doc) => doc.data() as RawHoursAdjustment,
  );

  // Load daily plans for the week
  const plansSnap = await familyRef
    .collection("dailyPlans")
    .where("childId", "==", childId)
    .where("date", ">=", weekKey)
    .where("date", "<=", weekEnd)
    .get();

  const dailyPlans: DailyPlanRecord[] = plansSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      date: d.date,
      energy: d.energy,
      planType: d.planType,
      sessions: d.sessions ?? [],
    };
  });

  // Load book activity for the week
  const booksSnap = await familyRef
    .collection("books")
    .where("updatedAt", ">=", weekKey)
    .where("updatedAt", "<=", weekEnd + "T23:59:59")
    .get();

  const weekEndIso = weekEnd + "T23:59:59";
  const bookDocs = booksSnap.docs
    .map((d) => d.data() as Record<string, unknown>)
    // Include books owned by this child OR made FOR this child from parent profile
    .filter((b) => b.childId === childId || b.createdFor === childId);

  const bookActivity: BookActivity[] = bookDocs.map((b) => {
    const activity: BookActivity = {
      title: b.title as string,
      childId: b.childId as string,
      status: b.status as string,
      pageCount: (b.pages as unknown[])?.length ?? 0,
      bookType: (b.bookType as string) ?? "creative",
      completedThisWeek:
        b.status === "complete" &&
        (b.updatedAt as string) >= weekKey,
    };
    if (b.theme) activity.theme = b.theme as string;
    if (b.createdBy) activity.createdBy = b.createdBy as string;
    if (b.createdFor) activity.createdFor = b.createdFor as string;
    return activity;
  });

  // Structured books summary (created / completed / reading sessions)
  const books = summarizeBooksWeek(bookDocs, weekKey, weekEndIso);

  // Teach-back artifacts for the week (Explain engineStage)
  const teachBacks = await loadTeachBacksForWeek(
    familyRef,
    childId,
    weekKey,
    weekEndIso,
  );

  // Count school days (Sun–Thu) with no day logs and no daily plan
  const activeDates = new Set([
    ...dayLogs.map((d) => d.date),
    ...dailyPlans.map((p) => p.date),
  ]);
  let missedDays = 0;
  for (let i = 0; i < 5; i++) {
    const dateStr = addDays(weekKey, i);
    if (!activeDates.has(dateStr)) {
      missedDays++;
    }
  }

  return {
    child,
    weekKey,
    dayLogs,
    dayLogDocs,
    hours,
    hoursAdjustments,
    dailyPlans,
    missedDays,
    bookActivity,
    books,
    teachBacks,
  };
}

// ── Books summary (pure) ────────────────────────────────────────

/**
 * Summarize the books fetched for the week into created / completed / reading
 * session buckets. Pure function — easy to test without Firestore.
 *
 * Inputs are raw Firestore doc data already filtered to books that touched
 * the week (updatedAt in range) AND belong to / are made-for the child.
 */
export function summarizeBooksWeek(
  bookDocs: Array<Record<string, unknown>>,
  weekStart: string,
  weekEndIso: string,
): BooksWeekSummary {
  const booksCreated: BookCreatedEntry[] = [];
  const booksCompleted: Array<{ title: string }> = [];
  const booksRead: BookReadEntry[] = [];
  let readingTotalMinutes = 0;

  for (const b of bookDocs) {
    const title = (b.title as string) ?? "Untitled";
    const pages = (b.pages as unknown[])?.length ?? 0;
    const createdAt = b.createdAt as string | undefined;
    const updatedAt = b.updatedAt as string | undefined;
    const status = b.status as string | undefined;
    const totalMinutes = (b.totalMinutes as number | undefined) ?? 0;

    // Created this week — createdAt falls inside the week range
    if (createdAt && createdAt >= weekStart && createdAt <= weekEndIso) {
      const entry: BookCreatedEntry = {
        title,
        pages,
        isAiGenerated:
          b.source === "ai-generated" || b.bookType === "generated",
      };
      if (b.theme) entry.theme = b.theme as string;
      booksCreated.push(entry);
    }

    // Completed this week — status is complete AND updated in week range
    if (
      status === "complete" &&
      updatedAt &&
      updatedAt >= weekStart &&
      updatedAt <= weekEndIso
    ) {
      booksCompleted.push({ title });
    }

    // Reading sessions — book was touched this week with logged minutes
    if (totalMinutes > 0) {
      booksRead.push({ title, totalMinutes });
      readingTotalMinutes += totalMinutes;
    }
  }

  return {
    booksCreated,
    booksCompleted,
    readingSessions: {
      count: booksRead.length,
      totalMinutes: readingTotalMinutes,
      booksRead,
    },
  };
}

// ── Teach-backs loader ─────────────────────────────────────────

/**
 * Load teach-back artifacts for the child for the week. Teach-backs are
 * stored in `families/{familyId}/artifacts` with engineStage === 'Explain'
 * and a title prefixed "Teach-back" (per KidTeachBack.tsx + TeachBackSection.tsx).
 */
async function loadTeachBacksForWeek(
  familyRef: DocumentReference,
  childId: string,
  weekStart: string,
  weekEndIso: string,
): Promise<TeachBacksWeekSummary> {
  try {
    const artifactsSnap = await familyRef
      .collection("artifacts")
      .where("childId", "==", childId)
      .where("tags.engineStage", "==", "Explain")
      .where("createdAt", ">=", weekStart)
      .where("createdAt", "<=", weekEndIso)
      .get();

    const teachBackArtifacts = artifactsSnap.docs
      .map((d) => d.data() as Record<string, unknown>)
      .filter((a) =>
        ((a.title as string | undefined) ?? "").toLowerCase().startsWith("teach-back"),
      )
      .map((a) => ({
        title: a.title as string | undefined,
        type: a.type as string | undefined,
        notes: a.notes as string | undefined,
        content: a.content as string | undefined,
        createdAt: a.createdAt as string | undefined,
        mediaUrl: a.mediaUrl as string | undefined,
        uri: a.uri as string | undefined,
        tags: a.tags as { subjectBucket?: string; engineStage?: string } | undefined,
      }));

    return summarizeTeachBacks(teachBackArtifacts);
  } catch (err) {
    console.warn("Failed to load teach-back artifacts:", err);
    return emptyTeachBacksSummary();
  }
}

function emptyTeachBacksSummary(): TeachBacksWeekSummary {
  return { count: 0, bySubject: {}, audioCount: 0, textCount: 0, examples: [] };
}

/**
 * Compress teach-back artifacts into a summary. Pure function — easy to test.
 *
 * The example excerpts are deliberately short (subject + first line of notes)
 * to keep AI context cost bounded.
 */
export function summarizeTeachBacks(
  artifacts: Array<{
    title?: string;
    type?: string;
    notes?: string;
    content?: string;
    createdAt?: string;
    mediaUrl?: string;
    uri?: string;
    tags?: { subjectBucket?: string; engineStage?: string };
  }>,
): TeachBacksWeekSummary {
  const bySubject: Record<string, number> = {};
  let audioCount = 0;
  let textCount = 0;
  const examples: TeachBackExample[] = [];

  // Newest first so examples come from the most recent moments
  const sorted = [...artifacts].sort((a, b) => {
    const aT = a.createdAt ?? "";
    const bT = b.createdAt ?? "";
    return bT.localeCompare(aT);
  });

  for (const a of sorted) {
    const subject = a.tags?.subjectBucket ?? extractSubjectFromTitle(a.title) ?? "Other";
    bySubject[subject] = (bySubject[subject] ?? 0) + 1;

    const audioUrl = a.mediaUrl ?? a.uri;
    const isAudio = a.type === "Audio" || !!audioUrl;
    if (isAudio) audioCount++;
    else textCount++;

    if (examples.length < 3) {
      const excerptSource = a.content ?? a.notes ?? "";
      const excerpt = excerptSource
        ? excerptSource.replace(/^Teach-back:\s*/i, "").slice(0, 80).trim()
        : undefined;
      const example: TeachBackExample = {
        subject,
        hasAudio: isAudio,
        createdAt: a.createdAt ?? "",
      };
      if (audioUrl) example.audioUrl = audioUrl;
      if (excerpt) example.excerpt = excerpt;
      examples.push(example);
    }
  }

  return {
    count: artifacts.length,
    bySubject,
    audioCount,
    textCount,
    examples,
  };
}

function extractSubjectFromTitle(title?: string): string | null {
  if (!title) return null;
  // "Teach-back: Reading" → "Reading"; "Teach-back 2026-05-17" → null
  const m = title.match(/^Teach-back:\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

// ── Prompt building ─────────────────────────────────────────────

export const WEEKLY_REVIEW_ADDENDUM = `
WEEKLY REVIEW ROLE:
You are generating a weekly review for the Barnes family homeschool. Analyze the week's data and provide actionable feedback.

REVIEW-SPECIFIC GUIDANCE:
- Never pressure Lincoln about reading aloud — celebrate willingness, not volume.
- London is attention-seeking; note when activities successfully engaged him vs when he disengaged.
- Look for disposition evidence in the engagement data and grade notes.
- When suggesting changes, explain the "why" briefly.
- Default to "both modes count as real school" framing.
- Warm, encouraging, practical tone. Never clinical or condescending.
- Speak as a knowledgeable partner, not an authority figure.
- Include disposition observations in the weekly summary alongside completion data.
- Use the Skill Snapshot, Evaluation History, Recent Scans, and the LEARNER MODEL section (Working edge / What matters next) to ground wins, growth areas, and pace adjustments in concrete skill progression — not just completion counts.
- When the LEARNER MODEL names a "What matters next" move, your recommendations and pace adjustments should point toward that frontier, not away from it. If you deliberately suggest something different, say why in the rationale. Treat "Working edge" concepts as this child's current focus.
- Ground pace adjustments in skill progression (snapshot stop-rules/supports + the model's frontier), not completion counts.
- If quest or evaluation sessions happened this week, cite them by domain (phonics / comprehension / math / fluency) and reference the working level.
- If recent scans recommend skip or quick-review, surface that as a pace adjustment rationale.
- If activity configs show a "daily" or "3x" frequency and this week's dayLogs didn't match, call it out gently as a growth area (not a failure).
- Acknowledge book activity when it's meaningful — especially when a child has been highly creative (multiple books created/completed) or read deeply (reading sessions). For Lincoln, completing a chapter is significant; for London, generating a story is significant.
- Teach-back moments are the richest learning signal per the charter. Surface specific subjects taught and any patterns ("Lincoln taught Reading three times this week, building confidence in his strongest area"). Don't ignore the count just because none made the wins list.`;

/** Load the child's skill snapshot (used for prioritySkills/supports/stopRules/workingLevels). */
async function loadSnapshotData(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<SnapshotData | undefined> {
  const snap = await db.doc(`families/${familyId}/skillSnapshots/${childId}`).get();
  if (!snap.exists) return undefined;
  return snap.data() as SnapshotData;
}

/**
 * Turn raw `activityConfigs` documents into the week's position records
 * (UX-212). Pure — no Firestore, no clock.
 *
 * Only configs that actually carry a position are recorded. A routine or
 * formation config has none, and a config whose stored `currentPosition` is not
 * a finite number is DROPPED rather than coerced to zero: zero is a claim ("no
 * lessons covered") the rate line would then make on no evidence.
 *
 * Finished programs ARE recorded, flagged `completed`, so the week a program was
 * finished still has its final position on file; the reader hides them, because
 * a finished program's position stops moving and "no lessons covered in three
 * weeks" would be a false alarm.
 */
export function toCurriculumPositions(
  configs: Array<{ id: string; data: Record<string, unknown> }>,
): CurriculumPositionDoc[] {
  const positions: CurriculumPositionDoc[] = [];
  for (const { id, data } of configs) {
    const pos = data.currentPosition;
    if (typeof pos !== "number" || !Number.isFinite(pos) || pos < 0) continue;
    const record: CurriculumPositionDoc = {
      configId: id,
      name: typeof data.name === "string" && data.name ? data.name : "Workbook",
      currentPosition: pos,
    };
    const total = data.totalUnits;
    if (typeof total === "number" && Number.isFinite(total) && total > 0) {
      record.totalUnits = total;
    }
    if (typeof data.unitLabel === "string" && data.unitLabel) {
      record.unitLabel = data.unitLabel;
    }
    // Completion has TWO supported shapes, and the workbook loader in
    // `chat.ts` (`data.completed || data.curriculumMeta?.completed`) already
    // honours both. Reading only the top-level flag would record a legacy
    // finished program as active, and two snapshots later the review would
    // report "no lessons covered" about a program that is done.
    const meta = data.curriculumMeta;
    const metaCompleted =
      !!meta &&
      typeof meta === "object" &&
      (meta as { completed?: unknown }).completed === true;
    if (data.completed === true || metaCompleted) record.completed = true;
    positions.push(record);
  }
  return positions;
}

/**
 * Read the child's workbook positions for the snapshot (UX-212).
 *
 * Same `childId in [child, 'both']` audience filter every other
 * `activityConfigs` reader uses. Never throws — a snapshot is additive evidence,
 * and failing to record one must not stop a review being written.
 */
async function loadCurriculumSnapshot(
  db: Firestore,
  familyId: string,
  childId: string,
  weekKey: string,
): Promise<CurriculumSnapshotDoc | undefined> {
  try {
    const snap = await db
      .collection(`families/${familyId}/activityConfigs`)
      .where("childId", "in", [childId, "both"])
      .get();
    const positions = toCurriculumPositions(
      snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })),
    );
    if (positions.length === 0) return undefined;
    return { recordedAt: new Date().toISOString(), weekKey, positions };
  } catch (err) {
    console.warn("[UX-212] Failed to record curriculum positions", err);
    return undefined;
  }
}

/**
 * The week's counted minutes, as recorded on the review document (UX-409).
 *
 * Stamped like {@link CurriculumSnapshotDoc}, and for the same reason: it is a
 * reading taken at a moment, not a live answer. **No client reads it** — the
 * Review page folds the hours live from `days` / `hours` / `hoursAdjustments`
 * and always will, because a stored total and a live fold that disagree is a
 * records surface lying to a parent (UX-211 / UX-219). What it is for is the
 * server: it is what the narrative was written from, and — with the positions
 * beside it — it is what makes "did the weekly run happen for this week" a
 * question this repository can answer, which census §2 records that it could
 * not.
 */
export interface WeekHoursDoc {
  /** ISO timestamp of the moment the hours were folded. */
  recordedAt: string;
  weekKey: string;
  totalMinutes: number;
  minutesBySubject: Record<string, number>;
}

/**
 * The week's minutes through the shared counting rule (UX-410) — the one answer
 * both the prompt and the recorded summary read, so they cannot disagree.
 */
export function foldWeekHours(ctx: WeekContext): HoursTotals {
  return foldHoursForPrompt(
    ctx.dayLogDocs,
    ctx.hours,
    ctx.hoursAdjustments,
    ctx.child.id,
  );
}

/** {@link foldWeekHours}, stamped for the document. */
function weekHoursDoc(ctx: WeekContext): WeekHoursDoc {
  return {
    recordedAt: new Date().toISOString(),
    weekKey: ctx.weekKey,
    ...foldWeekHours(ctx),
  };
}

/**
 * The week's RECORD — written before the model is called, and the whole of
 * UX-409 (owner decision, 2026-09-13: *write the snapshot first, narrative
 * second*).
 *
 * ── What went wrong ─────────────────────────────────────────────────────────
 * `generateReviewForChild` used to call Claude FIRST and write the document
 * only after that call returned. `runWeeklyReviewCycleForChild` catches the
 * throw and logs it — so a rate limit, a missing secret, a parse failure or an
 * outage wrote **nothing at all**, and lost two things of very different weight:
 *
 *   • the **narrative**, which is regenerable from the records and is only the
 *     monthly book's raw material (UX-219); and
 *   • the **`curriculumPositions` snapshot** (UX-212), which is not.
 *     `ActivityConfig.currentPosition` is one mutable field with no history
 *     anywhere in this repository, so once a week is gone nobody can ever say
 *     where the workbooks stood on that date and UX-213's observed rate loses a
 *     baseline permanently.
 *
 * It also made the audit's own question unanswerable: an absent document was
 * consistent with *"the cron never fired"* and with *"it fired and failed"*
 * (census §2). A record written before the risky step distinguishes them.
 *
 * ── The rules this write keeps ──────────────────────────────────────────────
 * **1. It MERGES.** Every write from this module is now field-scoped, so the
 * narrative already on a document survives a regenerate that fails — a
 * whole-document `set` before the flaky step is UX-409's own class of defect,
 * one step earlier. The parent's `reflection` is therefore safe by
 * construction; the transactional carry-forward below is kept anyway, because a
 * guard that is now redundant is not a guard worth deleting, and it is what
 * makes the write correct if a whole-document payload is ever reintroduced.
 *
 * **2. The snapshot is create-only.** A manual regenerate months later must
 * re-run the narrative WITHOUT re-stamping positions that have moved since: the
 * snapshot is the record of that week, not of today. So a `curriculumPositions`
 * already on file is left exactly as it is. The check and the write are one
 * transaction, which is also what makes a second runner safe. The
 * `activityConfigs` query stays OUTSIDE it — a Firestore transaction cannot run
 * a collection query (the UX-231 / `bootstrapLearnerModel` precedent).
 *
 * **3. It never downgrades `status`.** A document that already carries one
 * keeps it, so a failed regenerate leaves a previously generated week reading
 * `draft` — which is true, the narrative is still there — with a
 * `narrativeError` beside it saying the newer attempt failed.
 *
 * ── The fallback, and its one residual ──────────────────────────────────────
 * If the transaction cannot complete at all, the payload is merged without a
 * read. Three consequences, stated rather than hidden: a `curriculumPositions`
 * already on file is overwritten by this run's reading (it carries its own
 * `recordedAt`, and every consumer measures elapsed time from that stamp),
 * `status` may be set to `snapshot-only` over a `draft` the narrative write then
 * restores, and — because the never-downgrade check below reads the document —
 * an empty-week rerun on that path can write the no-data prose over a generated
 * week. All three are the same trade the previous fallback made and in the same
 * direction (that path replaced the WHOLE document unconditionally): where we
 * cannot read, record the reading we have rather than none.
 */
async function writeWeekRecord(
  db: Firestore,
  familyId: string,
  reviewDocId: string,
  record: WeeklyReviewRecord,
  narrative?: WeeklyReviewNarrative,
): Promise<void> {
  const ref = db
    .collection(`families/${familyId}/weeklyReviews`)
    .doc(reviewDocId);

  const build = (existing: Record<string, unknown> | undefined): Record<string, unknown> => {
    const existingStatus =
      typeof existing?.status === "string" && existing.status
        ? existing.status
        : undefined;
    // A week that already generated a real narrative keeps it, and the
    // empty-week prose never lands on top of it (Codex round 1, P2). The
    // no-data path is reached whenever THIS run's queries found nothing, and
    // those queries move: `summarizeBooksWeek` keys on `updatedAt`, so a week
    // whose only evidence was one book stops reporting that book the moment
    // somebody touches it again. Rerunning such a week used to merge
    // `status: 'no-data'` and *"No activities were logged"* over prose written
    // when the evidence was still visible — a downgrade in fact as well as in
    // status, which is exactly what rule 3 says cannot happen.
    const standingNarrative =
      existingStatus !== undefined && !REPLACEABLE_REVIEW_STATUSES.has(existingStatus);

    const payload: Record<string, unknown> = { ...record };
    if (narrative && !standingNarrative) {
      Object.assign(payload, narrative);
      // A narrative accepted here is a narrative that landed, so the previous
      // run's explanation of why one did not must go with it (Codex round 2,
      // P2) — every write from this module is a merge, so a `narrativeError`
      // left standing would have the page telling a parent that generation
      // failed about a week this run successfully summarised. `writeNarrative`
      // clears it on the model path for exactly the same reason.
      payload.narrativeError = null;
    }
    if (existing?.curriculumPositions !== undefined) {
      delete payload.curriculumPositions;
    }
    // `snapshot-only` is stamped only where there is no status at all. A
    // narrative brings its own, and it may raise `snapshot-only` → `no-data`;
    // nothing here ever lowers one.
    if (payload.status === undefined && existingStatus === undefined) {
      payload.status = REVIEW_STATUS_SNAPSHOT_ONLY;
    }
    const reflection = existing?.reflection;
    if (reflection && typeof reflection === "object") payload.reflection = reflection;
    return payload;
  };

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() ?? {}) : undefined;
      tx.set(ref, build(existing), { merge: true });
    });
  } catch (err) {
    console.warn(
      "[UX-409] Transactional week-record write failed; merging without a read",
      err,
    );
    await ref.set(build(undefined), { merge: true });
  }
}

/**
 * Merge the narrative onto the record the run already wrote (UX-409).
 *
 * Field-scoped, so the snapshot, the hours summary and the parent's answer are
 * not in the payload and cannot be touched. `narrativeError` is cleared to
 * `null` on success rather than left standing — a stale explanation of a failure
 * that has since been fixed is its own small lie.
 */
async function writeNarrative(
  db: Firestore,
  familyId: string,
  reviewDocId: string,
  narrative: WeeklyReviewNarrative,
): Promise<void> {
  await db
    .collection(`families/${familyId}/weeklyReviews`)
    .doc(reviewDocId)
    .set({ ...narrative, narrativeError: null }, { merge: true });
}

/**
 * Record that the narrative did not land, on the document that already holds
 * this week's record (UX-409).
 *
 * It never throws: the run is already failing, and a failure to write the
 * explanation must not replace the failure being explained. The thrown error is
 * re-thrown by the caller and reaches the function's logs unchanged — that is
 * where an operator diagnoses one.
 */
async function writeNarrativeFailure(
  db: Firestore,
  familyId: string,
  reviewDocId: string,
  reason: NarrativeFailureReason,
): Promise<void> {
  try {
    await db
      .collection(`families/${familyId}/weeklyReviews`)
      .doc(reviewDocId)
      .set({ narrativeError: narrativeErrorDoc(reason) }, { merge: true });
  } catch (writeErr) {
    console.warn("[UX-409] Could not record the narrative failure", writeErr);
  }
}

/**
 * Why a narrative did not land — the app's OWN words, chosen from this table and
 * never copied off an exception (Codex round 1, P2).
 *
 * The first cut stored `err.message`, clamped, which looked safe and was not:
 * `parseReviewResponse` lets a `JSON.parse` `SyntaxError` propagate, and current
 * Node builds quote an excerpt of the rejected input in that message. The
 * rejected input is the MODEL'S REPLY — unbounded, and capable of echoing the
 * child's own page, which is precisely why `scanAnalysis` (UX-311) keeps model
 * text on the scan record and off every screen and sink. So the field's contract
 * ("never the model's text") is now structural rather than a promise: the only
 * strings this module can write into it are the two below.
 *
 * `reason` rides along because it is app-owned too, and it makes the operator's
 * question answerable from the record rather than only from the logs.
 */
export const NARRATIVE_FAILURE_MESSAGES = {
  "call-failed":
    "The weekly review could not be generated. The function's logs have the cause.",
  "unreadable-reply":
    "The weekly review reply could not be read as a review.",
} as const;
export type NarrativeFailureReason = keyof typeof NARRATIVE_FAILURE_MESSAGES;

/** The stored shape of a narrative failure. Never model text, by construction. */
export function narrativeErrorDoc(reason: NarrativeFailureReason): NarrativeErrorDoc {
  return {
    message: NARRATIVE_FAILURE_MESSAGES[reason],
    reason,
    at: new Date().toISOString(),
  };
}

export function buildEvaluationPrompt(ctx: WeekContext): string {
  // Compute week totals from dayLogs
  let totalItems = 0;
  let completedItems = 0;
  let totalEvidence = 0;
  const engagementTotals: Record<string, number> = {};
  const allGradeResults: string[] = [];

  const perDayBreakdown: string[] = [];
  for (const day of ctx.dayLogs) {
    totalItems += day.totalItems;
    completedItems += day.completedItems;
    totalEvidence += day.evidenceCount;
    for (const [eng, count] of Object.entries(day.engagement)) {
      engagementTotals[eng] = (engagementTotals[eng] ?? 0) + count;
    }
    allGradeResults.push(...day.gradeResults);

    const completionPct = day.totalItems > 0
      ? Math.round((day.completedItems / day.totalItems) * 100) : 0;
    const engStr = Object.entries(day.engagement).map(([k, v]) => `${k}:${v}`).join(", ");
    perDayBreakdown.push(
      `  ${day.date}: ${day.completedItems}/${day.totalItems} items (${completionPct}%)${engStr ? `, engagement: ${engStr}` : ""}${day.evidenceCount > 0 ? `, ${day.evidenceCount} evidence` : ""}`
    );
  }

  // The week's minutes, ONCE, through the shared counting rule (UX-410).
  //
  // This used to be two separate claims, each with its own arithmetic: a
  // `HOURS BY SUBJECT` block summing `ctx.hours` alone (no day logs, no
  // adjustments — the cron never read that collection) and a *Subject time from
  // checklists* block summing completed items at their planned minutes with no
  // block-actuals rule. A day tracked on blocks therefore appeared in one, the
  // other, or both, and the model was left to reconcile two numbers that were
  // each wrong in a different direction. It writes the prose the monthly review
  // book is built from (UX-219), so the error did not stop at the prompt.
  const hoursBlock = hoursLoggedBlock(
    "HOURS THIS WEEK",
    "this week",
    foldWeekHours(ctx),
  );

  // Energy data from daily plans
  const energyCounts: Record<string, number> = {};
  const planTypeCounts: Record<string, number> = {};
  for (const p of ctx.dailyPlans) {
    energyCounts[p.energy] = (energyCounts[p.energy] ?? 0) + 1;
    planTypeCounts[p.planType] = (planTypeCounts[p.planType] ?? 0) + 1;
  }
  const energySummary = Object.entries(energyCounts)
    .map(([level, count]) => `${level}: ${count} days`)
    .join(", ");
  const planTypeSummary = Object.entries(planTypeCounts)
    .map(([pt, count]) => `${pt}: ${count} days`)
    .join(", ");

  const engagementSummary = Object.entries(engagementTotals)
    .map(([eng, count]) => `${eng}: ${count}`)
    .join(", ");

  return `Generate a weekly review for ${ctx.child.name} for the week of ${ctx.weekKey}.

The week-scoped data below shows what actually happened during the reviewed week.
The system prompt additionally includes the child's skill snapshot, recent evaluation
history by domain, recent curriculum scans, activity configs, word mastery, and recent
Dad Lab reports — use those sections to ground wins, growth areas, and pace
adjustments in concrete skill progression rather than completion counts alone.

DATA PROVIDED:
- Day logs recorded: ${ctx.dayLogs.length}
- Checklist completion: ${completedItems}/${totalItems} items
- Evidence artifacts captured: ${totalEvidence}
- Engagement feedback: ${engagementSummary || "no data"}
${allGradeResults.length > 0 ? `- Grade results:\n${allGradeResults.map((r) => `  - ${r}`).join("\n")}` : ""}
${hoursBlock}
- Energy states: ${energySummary || "no data"}
- Plan types: ${planTypeSummary || "no data"}
- Missed school days (Sun–Thu): ${ctx.missedDays}

## Book Activity This Week
${(ctx.bookActivity ?? []).length === 0 ? "No book activity this week." :
  (ctx.bookActivity ?? []).map((b) => {
    // Attribution: 'parent' means Mom/Dad made the book (teaching material); absent = legacy (treat as parent-made)
    const createdBy = b.createdBy ?? "parent";
    const authorTag = createdBy === "parent"
      ? ` [made by Mom/Dad for ${ctx.child.name}]`
      : createdBy === ctx.child.name.toLowerCase() || createdBy === ctx.child.id
        ? ` [made by ${ctx.child.name}]`
        : ` [made by sibling]`;
    return `- "${b.title}" (${b.bookType}, ${b.pageCount} pages, ${b.status}${b.completedThisWeek ? " — FINISHED THIS WEEK!" : ""})${authorTag}`;
  }).join("\n")}

${formatBooksEvidence(ctx.child.name, ctx.books)}

${formatTeachBacksEvidence(ctx.child.name, ctx.teachBacks)}

Per-day breakdown:
${perDayBreakdown.join("\n") || "  (no day logs)"}

GENERATE a JSON object with EXACTLY these fields:
{
  "celebration": "one specific thing to celebrate with ${ctx.child.name} this week",
  "summary": "2-3 sentence narrative of the week (warm, encouraging tone). Be specific about what ${ctx.child.name} actually did.",
  "wins": ["array of 2-4 specific wins from the data"],
  "growthAreas": ["array of 1-3 areas where gentle growth is emerging"],
  "paceAdjustments": [{"id": "unique-id", "area": "subject or skill area", "currentPace": "what's happening now", "suggestedPace": "what we might try", "rationale": "why this change makes sense"}],
  "recommendations": ["array of 1-3 practical next-week suggestions"],
  "energyPattern": "one sentence noting energy trends and proactive suggestions"
}

TONE:
- Warm partner, not authority. "We might try..." not "You should..."
- No shame. Rest by design. MVD is real school.
- Portfolio over grades — evidence of growth matters more than scores.
- If data is thin, say so honestly and keep recommendations light.
- Celebrate any books created or completed — they represent significant creative effort.
- Mention reading sessions and book creation as evidence of language arts engagement.
- ATTRIBUTION: Only attribute book authorship to ${ctx.child.name} when the book tag reads "made by ${ctx.child.name}". If the tag reads "made by Mom/Dad" or "made by sibling", that book is NOT ${ctx.child.name}'s creative work — reference it as a reading/learning resource, not a creative win.

Respond ONLY with valid JSON. No markdown, no preamble, no explanation outside the JSON structure.`;
}

// ── Evidence formatters (books + teach-backs) ──────────────────

/**
 * Format the books summary for the AI prompt. Compressed counts + a short
 * list of titles. No full page contents — keeps per-child cost < ~120 tokens.
 */
export function formatBooksEvidence(
  childName: string,
  books: BooksWeekSummary,
): string {
  const created = books.booksCreated;
  const completed = books.booksCompleted;
  const sessions = books.readingSessions;

  if (
    created.length === 0 &&
    completed.length === 0 &&
    sessions.count === 0
  ) {
    return `## Books for ${childName} this week\nNo book activity captured this week.`;
  }

  const lines = [`## Books for ${childName} this week`];

  if (created.length > 0) {
    const aiCount = created.filter((b) => b.isAiGenerated).length;
    const handCount = created.length - aiCount;
    const themes = Array.from(
      new Set(created.map((b) => b.theme).filter((t): t is string => !!t)),
    );
    const parts: string[] = [
      `${created.length} created (${aiCount} AI-generated, ${handCount} hand-built)`,
    ];
    if (themes.length > 0) parts.push(`themes: ${themes.join(", ")}`);
    lines.push(`- ${parts.join(", ")}.`);
    for (const b of created.slice(0, 4)) {
      lines.push(`  • "${b.title}" (${b.pages} pages)`);
    }
  } else {
    lines.push("- 0 created this week.");
  }

  if (completed.length > 0) {
    lines.push(
      `- ${completed.length} completed: ${completed
        .slice(0, 4)
        .map((b) => `"${b.title}"`)
        .join(", ")}.`,
    );
  }

  if (sessions.count > 0) {
    const titles = sessions.booksRead
      .slice(0, 4)
      .map((b) => `"${b.title}"`)
      .join(", ");
    lines.push(
      `- ${sessions.count} reading session${sessions.count === 1 ? "" : "s"} totaling ${sessions.totalMinutes} cumulative min on ${titles}.`,
    );
  }

  return lines.join("\n");
}

/**
 * Format the teach-backs summary for the AI prompt. Counts + subject
 * breakdown + up to 3 brief excerpts. Targets < ~100 tokens per child.
 */
export function formatTeachBacksEvidence(
  childName: string,
  teachBacks: TeachBacksWeekSummary,
): string {
  if (teachBacks.count === 0) {
    return `## Teach-backs by ${childName} this week\nNo teach-back moments captured this week.`;
  }

  const lines = [`## Teach-backs by ${childName} this week`];
  lines.push(
    `- ${teachBacks.count} total teach-back moment${teachBacks.count === 1 ? "" : "s"} captured.`,
  );

  const subjects = Object.entries(teachBacks.bySubject);
  if (subjects.length > 0) {
    const subjectStr = subjects.map(([s, n]) => `${s}: ${n}`).join(", ");
    lines.push(`- Subjects taught: ${subjectStr}.`);
  }

  lines.push(
    `- ${teachBacks.audioCount} with audio recording${teachBacks.audioCount === 1 ? "" : "s"}, ${teachBacks.textCount} text-only.`,
  );

  if (teachBacks.examples.length > 0) {
    lines.push("- Highlights:");
    for (const ex of teachBacks.examples) {
      const excerpt = ex.excerpt ? ` — "${ex.excerpt}"` : "";
      lines.push(`  • ${ex.subject}${ex.hasAudio ? " (audio)" : ""}${excerpt}`);
    }
  }

  return lines.join("\n");
}

// ── Parse AI response ───────────────────────────────────────────

interface ReviewPayload {
  celebration: string;
  summary: string;
  wins: string[];
  growthAreas: string[];
  paceAdjustments: Array<{
    id: string; area: string; currentPace: string;
    suggestedPace: string; rationale: string;
  }>;
  recommendations: string[];
  energyPattern: string;
}

export function parseReviewResponse(text: string): ReviewPayload {
  const parsed = sanitizeAndParseJson<Record<string, unknown>>(text);

  return {
    celebration: String(parsed.celebration ?? ""),
    summary: String(parsed.summary ?? parsed.progressSummary ?? ""),
    wins: Array.isArray(parsed.wins)
      ? parsed.wins.map((w: unknown) => String(w))
      : [],
    growthAreas: Array.isArray(parsed.growthAreas)
      ? parsed.growthAreas.map((g: unknown) => String(g))
      : [],
    paceAdjustments: Array.isArray(parsed.paceAdjustments)
      ? parsed.paceAdjustments.map((a: Record<string, unknown>, i: number) => ({
          id: String(a.id ?? `adj-${i}`),
          area: String(a.area ?? a.subject ?? ""),
          currentPace: String(a.currentPace ?? ""),
          suggestedPace: String(a.suggestedPace ?? a.suggestedChange ?? ""),
          rationale: String(a.rationale ?? ""),
        }))
      : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((r: unknown) => String(r))
      : [],
    energyPattern: String(parsed.energyPattern ?? ""),
  };
}

// ── Generate review for one child ───────────────────────────────

/**
 * The child's `hoursAdjustments` for this week, under DATA-09 attribution.
 *
 * Tagged to them, or to `'both'` — the fold's own rule, read from the fold's own
 * constant rather than restated, so the evidence check and the counting rule can
 * never disagree about whose week this is.
 */
function attributedAdjustments(ctx: WeekContext): RawHoursAdjustment[] {
  return ctx.hoursAdjustments.filter(
    (a) => a?.childId === ctx.child.id || a?.childId === ADJUSTMENT_BOTH,
  );
}

/**
 * Has-any-evidence check for the empty-week guard.
 *
 * Books and teach-backs count as evidence even when no checklist items
 * were completed — a week of creative output + teach-back moments still
 * warrants a review.
 *
 * **`hoursAdjustments` counts too, since UX-410 (Codex round 1, P1).** The week
 * context had never carried that collection, so the question could not be asked;
 * now that it does, a week whose only record is an adjustment — a correction, or
 * the *Log watch time* row, which is a real hour of a child's week — would
 * otherwise have stored a POSITIVE `hoursSummary` beside a narrative reading
 * *"No day logs, hours, books, or teach-backs were recorded"*, a document
 * contradicting itself on the same write. The adjustment also never reached the
 * model, so the month's book would not have mentioned it either.
 *
 * A zero-minute adjustment still counts, exactly as a zero-minute `hours` entry
 * always has on the line above: the question here is whether anything happened
 * that week, not how much.
 */
export function hasAnyEvidence(ctx: WeekContext): boolean {
  if (ctx.dayLogs.length > 0) return true;
  if (ctx.hours.length > 0) return true;
  if (attributedAdjustments(ctx).length > 0) return true;
  const b = ctx.books;
  if (
    b.booksCreated.length > 0 ||
    b.booksCompleted.length > 0 ||
    b.readingSessions.count > 0
  ) {
    return true;
  }
  if (ctx.teachBacks.count > 0) return true;
  return false;
}

/**
 * Write this week's record, then ask the model for the narrative — **in that
 * order** (UX-409, owner decision 2026-09-13).
 *
 * The order is the fix and it is asserted as an order: everything that owes the
 * model nothing is read and written first, so a failure in the one flaky
 * dependency costs only the one regenerable thing. See {@link writeWeekRecord}
 * for what the first write guarantees.
 *
 * Still throws on a model failure, exactly as before — `runWeeklyReviewCycleForChild`
 * logs it and `generateWeeklyReviewNow` turns it into an `HttpsError`. What has
 * changed is that the week's record is on file by the time it does, and the
 * document says why the narrative is missing.
 */
export async function generateReviewForChild(
  familyId: string,
  ctx: WeekContext,
  apiKey: string,
): Promise<WeeklyReviewDoc> {
  const db = getFirestore();
  const reviewDocId = `${ctx.weekKey}_${ctx.child.id}`;

  // ── 1. The record: the week's own facts, before anything can fail ─────────
  //
  // `loadCurriculumSnapshot` never throws (a snapshot is additive evidence and
  // must not stop a review being written) and the hours are a pure fold, so this
  // half has no failure mode of its own. A week with nothing logged is recorded
  // exactly like any other — it is precisely the week UX-213's rate exists to
  // make visible.
  const curriculumPositions = await loadCurriculumSnapshot(
    db, familyId, ctx.child.id, ctx.weekKey,
  );
  const record: WeeklyReviewRecord = {
    childId: ctx.child.id,
    weekKey: ctx.weekKey,
    evidence: { books: ctx.books, teachBacks: ctx.teachBacks },
    hoursSummary: weekHoursDoc(ctx),
    createdAt: new Date().toISOString(),
  };
  if (curriculumPositions) record.curriculumPositions = curriculumPositions;

  // A week with no evidence needs no model call, so its narrative is known now
  // and rides the record's own write — one document, one write, as before.
  if (!hasAnyEvidence(ctx)) {
    const narrative = noDataNarrative(ctx);
    await writeWeekRecord(db, familyId, reviewDocId, record, narrative);
    return { ...record, ...narrative } as WeeklyReviewDoc;
  }

  await writeWeekRecord(db, familyId, reviewDocId, record);

  // ── 2. The narrative: the half that can fail ──────────────────────────────
  const model = modelForTask("weeklyReview");

  // The call and the PARSE are separated so the document can say which failed
  // in the app's own words, and — the reason it matters — so a `SyntaxError`
  // carrying an excerpt of the model's reply never reaches a stored field
  // (Codex round 1, P2).
  let result: Awaited<ReturnType<typeof callClaude>>;
  try {
    const snapshotData = await loadSnapshotData(db, familyId, ctx.child.id);

    // Shared context slices (skillSnapshot, recentHistoryByDomain, recentScans,
    // activityConfigs, wordMastery, dadLabReports) — augments the week-scoped
    // dayLog/hours/plans data from assembleWeekContext with the child-level
    // skill/progression context the review previously lacked.
    const sharedSections = await buildContextForTask("weeklyReview", {
      db,
      familyId,
      childId: ctx.child.id,
      childData: { name: ctx.child.name, grade: ctx.child.grade },
      snapshotData,
    });

    result = await callClaude({
      apiKey,
      model,
      maxTokens: 2048,
      systemPrompt: [...sharedSections, WEEKLY_REVIEW_ADDENDUM].join("\n\n"),
      messages: [{ role: "user", content: buildEvaluationPrompt(ctx) }],
    });
  } catch (err) {
    // The record stands; say on it why the narrative does not.
    await writeNarrativeFailure(db, familyId, reviewDocId, "call-failed");
    throw err;
  }

  let narrative: WeeklyReviewNarrative;
  try {
    const payload = parseReviewResponse(result.text);

    narrative = {
      status: REVIEW_STATUS_DRAFT,
      celebration: payload.celebration,
      summary: payload.summary,
      wins: payload.wins,
      growthAreas: payload.growthAreas,
      paceAdjustments: payload.paceAdjustments.map((a, i) => ({
        ...a, id: a.id || `adj-${i}`, decision: "pending",
      })),
      recommendations: payload.recommendations,
      energyPattern: payload.energyPattern,
      model,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  } catch (err) {
    await writeNarrativeFailure(db, familyId, reviewDocId, "unreadable-reply");
    throw err;
  }

  await writeNarrative(db, familyId, reviewDocId, narrative);

  // Log AI usage
  await logAiUsage(db, familyId, {
    childId: ctx.child.id,
    taskType: "weeklyReview",
    model,
    inputTokens: narrative.usage.inputTokens,
    outputTokens: narrative.usage.outputTokens,
  });

  return { ...record, ...narrative } as WeeklyReviewDoc;
}

/** The narrative for a week with nothing logged — no model call, no cost. */
function noDataNarrative(ctx: WeekContext): WeeklyReviewNarrative {
  return {
    status: REVIEW_STATUS_NO_DATA,
    celebration: `No activities were logged for ${ctx.child.name} this week. That's okay — every week is different.`,
    summary: "No day logs, hours, books, or teach-backs were recorded. Use the Today page during the week to build up data for next week's review.",
    wins: [],
    growthAreas: [],
    paceAdjustments: [],
    recommendations: ["Try logging at least 3 days on the Today page this week for a more useful review."],
    energyPattern: "No energy data recorded.",
    model: "none",
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

// ── On-demand callable (Generate Now) ───────────────────────────

export const generateWeeklyReviewNow = onCall(
  { secrets: [claudeApiKey] },
  async (request) => {
    const { uid } = requireEmailAuth(request);

    const { familyId, childId, weekKey } = request.data as {
      familyId?: string;
      childId?: string;
      weekKey?: string;
    };

    if (!familyId || !childId || !weekKey) {
      throw new HttpsError(
        "invalid-argument",
        "familyId, childId, and weekKey are required.",
      );
    }

    if (uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    const apiKey = claudeApiKey.value();
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "Missing CLAUDE_API_KEY secret.",
      );
    }

    try {
      const ctx = await assembleWeekContext(familyId, childId, weekKey);

      // FEAT-74 (G4): synthesize-if-stale BEFORE generating, mirroring the Sunday
      // cron ordering, so the manual review also grounds on a fresh model frontier.
      // Isolated in its own try/catch — a synthesis failure must never block the
      // review (it falls back to whatever synthesis is stored).
      try {
        const db = getFirestore();
        await synthesizeIfStale(db, familyId, childId, ctx.child.name, apiKey);
      } catch (synthErr) {
        console.error(
          `generateWeeklyReviewNow: synthesizeIfStale failed for family=${familyId} child=${childId}:`,
          synthErr,
        );
      }

      await generateReviewForChild(familyId, ctx, apiKey);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("generateWeeklyReviewNow failed:", {
        familyId,
        childId,
        weekKey,
        error: errMsg,
      });
      throw new HttpsError("internal", `Weekly review failed: ${errMsg}`);
    }

    return { success: true };
  },
);

// ── Per-child weekly cycle (synthesize → review) ────────────────

/**
 * Run one child's weekly cycle: FEAT-74 (G4) synthesize-if-stale FIRST so the
 * review reads a fresh learner-model frontier, THEN generate the review. Each
 * step is isolated in its own try/catch — a synthesis failure must NEVER block
 * the review (the review then reads whatever synthesis is stored, served-stale),
 * and a review failure never leaks out of the loop.
 *
 * Deps are injectable so the ordering + failure-isolation are unit-testable
 * without a live Firestore (see evaluate.test.ts).
 */
export async function runWeeklyReviewCycleForChild(
  db: Firestore,
  familyId: string,
  childId: string,
  childName: string,
  weekKey: string,
  apiKey: string,
  deps: {
    synthesizeIfStale: typeof synthesizeIfStale;
    assembleWeekContext: typeof assembleWeekContext;
    generateReviewForChild: typeof generateReviewForChild;
  } = { synthesizeIfStale, assembleWeekContext, generateReviewForChild },
): Promise<void> {
  // 1) Refresh the learner model FIRST (FEAT-57 beat, reordered for FEAT-74).
  try {
    await deps.synthesizeIfStale(db, familyId, childId, childName, apiKey);
  } catch (err) {
    console.error(
      `Failed to synthesize learner model for family=${familyId} child=${childId}:`,
      err,
    );
  }

  // 2) Generate the review — now grounded on the fresh frontier.
  try {
    const ctx = await deps.assembleWeekContext(familyId, childId, weekKey);
    await deps.generateReviewForChild(familyId, ctx, apiKey);
  } catch (err) {
    console.error(
      `Failed to generate weekly review for family=${familyId} child=${childId}:`,
      err,
    );
  }
}

// ── Scheduled Cloud Function ────────────────────────────────────

/**
 * **Just after midnight, so the review is ready all day Sunday (UX-263).**
 *
 * Owner, 2026-09-06 (a Sunday, 8:23am): *"I also think the review should be
 * ready all day Sunday."* It fired Sunday 19:00 CT, so the week that ended
 * Saturday did not exist as a document until Sunday **night** — after the one
 * morning a parent sits down to look at the week and plan the next.
 *
 * **Why 00:15 Sunday and not Saturday evening (Codex round 1, P2).** The first
 * cut of this fix fired at Saturday 21:00, which reads early: a week is
 * assembled once and **never revisited**, and `assembleWeekContext` takes
 * `weekKey + 6` as the *inclusive* Saturday end and reads records through
 * `T23:59:59`. Anything logged in the last three hours of Saturday — hours, day
 * logs, books, teach-backs, workbook positions — would have been permanently
 * absent from the narrative, the evidence summary **and** the UX-212 position
 * snapshot, which is the repo's only record of where a program stood on a date.
 * On a records surface that is silent data loss, and it would have been
 * indistinguishable from a quiet week. Firing a quarter-hour into Sunday closes
 * the whole Saturday window first and still has the document waiting before
 * anyone is awake on Sunday, which is the thing that was actually asked for.
 * (00:15, not 00:00, so a late Saturday write and the read are not racing; and
 * it is safely clear of the 02:00 DST switch, which also lands on a Sunday.)
 *
 * The hour is deliberate, so it is asserted rather than left as a literal —
 * see `evaluate.test.ts`. The **day** is still what moved {@link lastWeekKey}
 * onto one rule shared with the page; that note stands.
 */
export const WEEKLY_REVIEW_SCHEDULE = {
  schedule: "every sunday 00:15",
  timeZone: "America/Chicago",
} as const;

export const weeklyReview = onSchedule(
  {
    ...WEEKLY_REVIEW_SCHEDULE,
    secrets: [claudeApiKey],
  },
  async () => {
    const db = getFirestore();
    // The family's civil date, not the runtime's (UX-266).
    //
    // The schedule fires on `America/Chicago`; the runtime executes in UTC. So
    // `new Date()` here is a different clock from the one the cron was set by,
    // and `lastWeekKey` reads its LOCAL fields. On the current schedule the two
    // readings agree on every firing — 00:15 CT is 05:15/06:15 UTC, still the
    // same Sunday — but that is a coincidence of the hour, not a property of the
    // code: `lastWeekKey` changes answer at the Fri→Sat boundary, so any move to
    // a Friday evening (which is UTC Saturday) would have this write the week
    // that has not ended yet, silently. Resolving the civil date in the family's
    // zone first makes the key independent of the hour the schedule names.
    //
    // This changes no document on the current schedule — asserted in
    // `evaluate.test.ts` across every firing of a year, not reasoned about.
    const weekKey = lastWeekKey(civilDateObjectInZone(new Date(), WEEKLY_REVIEW_SCHEDULE.timeZone));
    const apiKey = claudeApiKey.value();

    // Get all families
    const familiesSnap = await db.collection("families").get();

    for (const familyDoc of familiesSnap.docs) {
      const familyId = familyDoc.id;

      // Get all children in this family
      const childrenSnap = await familyDoc.ref.collection("children").get();

      for (const childDoc of childrenSnap.docs) {
        const childId = childDoc.id;
        const childName = (childDoc.data()?.name as string) || "";

        // FEAT-57 / FEAT-74: synthesize-if-stale FIRST, then generate the review
        // on the fresh frontier. Failure isolation lives inside the helper.
        await runWeeklyReviewCycleForChild(
          db, familyId, childId, childName, weekKey, apiKey,
        );
      }
    }
  },
);
