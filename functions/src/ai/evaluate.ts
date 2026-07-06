import { getFirestore } from "firebase-admin/firestore";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireEmailAuth } from "./authGuard.js";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { claudeApiKey } from "./aiConfig.js";
import { buildContextForTask } from "./contextSlices.js";
import type { SnapshotData } from "./chatTypes.js";
import { sanitizeAndParseJson } from "./sanitizeJson.js";
import { callClaude, logAiUsage } from "./chatTypes.js";
import { modelForTask } from "./chat.js";
import { synthesizeIfStale } from "./learnerSynthesis.js";

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
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  createdAt: string;
}

interface ChildProfile {
  id: string;
  name: string;
  grade?: string;
}

interface DayLogSummary {
  date: string;
  totalItems: number;
  completedItems: number;
  engagement: Record<string, number>;
  minutesBySubject: Record<string, number>;
  gradeResults: string[];
  evidenceCount: number;
}

interface HoursRecord {
  minutes: number;
  subjectBucket?: string;
  date: string;
}

interface DailyPlanRecord {
  date: string;
  energy: string;
  planType: string;
  sessions: Array<{ streamId: string; ladderId: string }>;
}

// ── Week helpers ────────────────────────────────────────────────

/**
 * Return the Sunday-of-week date string for the most recent completed week.
 * The school week runs Sunday–Saturday. The scheduled review fires Sunday
 * evening, so lastWeekKey returns the previous Sunday (7 days ago on Sunday,
 * dayOfWeek+7 days ago otherwise).
 */
export function lastWeekKey(today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ...
  // Go back to the start of the PREVIOUS Sunday-based week
  // If today is Sunday (0), the previous week started 7 days ago
  // If today is Monday (1), the previous week started 8 days ago
  const offset = dayOfWeek === 0 ? 7 : dayOfWeek + 7;
  d.setDate(d.getDate() - offset);
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
  hours: HoursRecord[];
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

  const dayLogs: DayLogSummary[] = daysSnap.docs
    .map((doc) => {
      const d = doc.data();
      if (d.childId !== childId) return null;
      const checklist = (d.checklist ?? []) as Array<{
        label: string; completed: boolean; engagement?: string;
        subjectBucket?: string; estimatedMinutes?: number;
        plannedMinutes?: number; gradeResult?: string;
        evidenceArtifactId?: string;
      }>;

      const engagement: Record<string, number> = {};
      const minutesBySubject: Record<string, number> = {};
      const gradeResults: string[] = [];
      let evidenceCount = 0;

      for (const item of checklist) {
        if (item.engagement) engagement[item.engagement] = (engagement[item.engagement] ?? 0) + 1;
        if (item.completed) {
          const mins = item.estimatedMinutes ?? item.plannedMinutes ?? 0;
          const bucket = item.subjectBucket ?? "Other";
          minutesBySubject[bucket] = (minutesBySubject[bucket] ?? 0) + mins;
        }
        if (item.gradeResult) gradeResults.push(item.label + ": " + item.gradeResult);
        if (item.evidenceArtifactId) evidenceCount++;
      }

      return {
        date: d.date as string, totalItems: checklist.length,
        completedItems: checklist.filter((i) => i.completed).length,
        engagement, minutesBySubject, gradeResults, evidenceCount,
      } as DayLogSummary;
    })
    .filter((d): d is DayLogSummary => d !== null);

  // Load hours for the week
  const hoursSnap = await familyRef
    .collection("hours")
    .where("childId", "==", childId)
    .where("date", ">=", weekKey)
    .where("date", "<=", weekEnd)
    .get();

  const hours: HoursRecord[] = hoursSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      minutes: d.minutes,
      subjectBucket: d.subjectBucket,
      date: d.date,
    };
  });

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
    hours,
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

const WEEKLY_REVIEW_ADDENDUM = `
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
- Use the Skill Snapshot, Evaluation History, and Recent Scans sections to ground wins, growth areas, and pace adjustments in concrete skill progression — not just completion counts.
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

export function buildEvaluationPrompt(ctx: WeekContext): string {
  // Compute week totals from dayLogs
  let totalItems = 0;
  let completedItems = 0;
  let totalEvidence = 0;
  const engagementTotals: Record<string, number> = {};
  const subjectMinutes: Record<string, number> = {};
  const allGradeResults: string[] = [];

  const perDayBreakdown: string[] = [];
  for (const day of ctx.dayLogs) {
    totalItems += day.totalItems;
    completedItems += day.completedItems;
    totalEvidence += day.evidenceCount;
    for (const [eng, count] of Object.entries(day.engagement)) {
      engagementTotals[eng] = (engagementTotals[eng] ?? 0) + count;
    }
    for (const [subj, mins] of Object.entries(day.minutesBySubject)) {
      subjectMinutes[subj] = (subjectMinutes[subj] ?? 0) + mins;
    }
    allGradeResults.push(...day.gradeResults);

    const completionPct = day.totalItems > 0
      ? Math.round((day.completedItems / day.totalItems) * 100) : 0;
    const engStr = Object.entries(day.engagement).map(([k, v]) => `${k}:${v}`).join(", ");
    perDayBreakdown.push(
      `  ${day.date}: ${day.completedItems}/${day.totalItems} items (${completionPct}%)${engStr ? `, engagement: ${engStr}` : ""}${day.evidenceCount > 0 ? `, ${day.evidenceCount} evidence` : ""}`
    );
  }

  // Summarize hours by subject
  const hoursBySubject: Record<string, number> = {};
  let totalMinutes = 0;
  for (const h of ctx.hours) {
    const key = h.subjectBucket ?? "Other";
    hoursBySubject[key] = (hoursBySubject[key] ?? 0) + h.minutes;
    totalMinutes += h.minutes;
  }
  const hoursSummary = Object.entries(hoursBySubject)
    .map(([subject, mins]) => `  - ${subject}: ${mins} min`)
    .join("\n");

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

  const subjectSummary = Object.entries(subjectMinutes)
    .map(([subj, mins]) => `  - ${subj}: ${mins} min`)
    .join("\n");

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
- Subject time from checklists:
${subjectSummary || "  (none)"}
- Engagement feedback: ${engagementSummary || "no data"}
${allGradeResults.length > 0 ? `- Grade results:\n${allGradeResults.map((r) => `  - ${r}`).join("\n")}` : ""}
- Hours logged: ${Math.round(totalMinutes / 60 * 10) / 10} hours (${totalMinutes} min)
${hoursSummary || "  (none)"}
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
 * Has-any-evidence check for the empty-week guard.
 *
 * Books and teach-backs count as evidence even when no checklist items
 * were completed — a week of creative output + teach-back moments still
 * warrants a review.
 */
export function hasAnyEvidence(ctx: WeekContext): boolean {
  if (ctx.dayLogs.length > 0) return true;
  if (ctx.hours.length > 0) return true;
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

export async function generateReviewForChild(
  familyId: string,
  ctx: WeekContext,
  apiKey: string,
): Promise<WeeklyReviewDoc> {
  // Skip AI call if there's no data for the week
  if (!hasAnyEvidence(ctx)) {
    const db = getFirestore();
    const emptyReview: WeeklyReviewDoc = {
      childId: ctx.child.id,
      weekKey: ctx.weekKey,
      status: "no-data",
      celebration: `No activities were logged for ${ctx.child.name} this week. That's okay — every week is different.`,
      summary: "No day logs, hours, books, or teach-backs were recorded. Use the Today page during the week to build up data for next week's review.",
      wins: [],
      growthAreas: [],
      paceAdjustments: [],
      recommendations: ["Try logging at least 3 days on the Today page this week for a more useful review."],
      energyPattern: "No energy data recorded.",
      evidence: { books: ctx.books, teachBacks: ctx.teachBacks },
      model: "none",
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: new Date().toISOString(),
    };
    const reviewDocId = `${ctx.weekKey}_${ctx.child.id}`;
    await db
      .collection(`families/${familyId}/weeklyReviews`)
      .doc(reviewDocId)
      .set(emptyReview);
    return emptyReview;
  }

  const model = modelForTask("weeklyReview");

  const db = getFirestore();
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

  const systemPrompt = [...sharedSections, WEEKLY_REVIEW_ADDENDUM].join("\n\n");

  const userPrompt = buildEvaluationPrompt(ctx);

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 2048,
    systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const payload = parseReviewResponse(result.text);

  const usage = {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };

  // Store review in Firestore
  const reviewData: WeeklyReviewDoc = {
    childId: ctx.child.id,
    weekKey: ctx.weekKey,
    status: "draft",
    celebration: payload.celebration,
    summary: payload.summary,
    wins: payload.wins,
    growthAreas: payload.growthAreas,
    paceAdjustments: payload.paceAdjustments.map((a, i) => ({
      ...a, id: a.id || `adj-${i}`, decision: "pending",
    })),
    recommendations: payload.recommendations,
    energyPattern: payload.energyPattern,
    evidence: { books: ctx.books, teachBacks: ctx.teachBacks },
    model,
    usage,
    createdAt: new Date().toISOString(),
  };

  const reviewDocId = `${ctx.weekKey}_${ctx.child.id}`;
  await db
    .collection(`families/${familyId}/weeklyReviews`)
    .doc(reviewDocId)
    .set(reviewData);

  // Log AI usage
  await logAiUsage(db, familyId, {
    childId: ctx.child.id,
    taskType: "weeklyReview",
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });

  return reviewData;
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

// ── Scheduled Cloud Function ────────────────────────────────────

export const weeklyReview = onSchedule(
  {
    schedule: "every sunday 19:00",
    timeZone: "America/Chicago",
    secrets: [claudeApiKey],
  },
  async () => {
    const db = getFirestore();
    const weekKey = lastWeekKey(new Date());
    const apiKey = claudeApiKey.value();

    // Get all families
    const familiesSnap = await db.collection("families").get();

    for (const familyDoc of familiesSnap.docs) {
      const familyId = familyDoc.id;

      // Get all children in this family
      const childrenSnap = await familyDoc.ref.collection("children").get();

      for (const childDoc of childrenSnap.docs) {
        const childId = childDoc.id;

        try {
          const ctx = await assembleWeekContext(familyId, childId, weekKey);
          await generateReviewForChild(familyId, ctx, apiKey);
        } catch (err) {
          console.error(
            `Failed to generate weekly review for family=${familyId} child=${childId}:`,
            err,
          );
        }

        // FEAT-57 (Phase 3a): piggyback the Learner Model synthesis beat on the
        // Sunday loop (D4 — no new scheduled function). Guarded inside: skips
        // children with no model, and regenerates only when the synthesis is stale
        // (a writer marked it, or it has none yet). Failures never block the loop.
        try {
          const childName = (childDoc.data()?.name as string) || "";
          await synthesizeIfStale(db, familyId, childId, childName, apiKey);
        } catch (err) {
          console.error(
            `Failed to synthesize learner model for family=${familyId} child=${childId}:`,
            err,
          );
        }
      }
    }
  },
);
