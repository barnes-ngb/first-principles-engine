import type { Firestore } from "firebase-admin/firestore";
import type { SnapshotData } from "./chatTypes.js";
import {
  loadWorkbookPaces,
  loadWeekContext,
  loadHoursSummary,
  loadEngagementSummary,
  loadGradeResults,
  loadDraftBookCount,
  loadSightWordSummary,
  loadWordMasterySummary,
} from "./chat.js";
import { loadRecentEvalContext, loadRecentEvalHistoryByDomain, formatEvalHistoryByDomain } from "./chatTypes.js";
import { getGatbProgress } from "./data/gatbCurriculum.js";

// ── Slice definitions ───────────────────────────────────────────

export const ContextSlice = {
  Charter: "charter",
  ChildProfile: "childProfile",
  WorkbookPaces: "workbookPaces", // Activity-config-backed curriculum coverage slice (legacy workbookConfigs fallback remains temporarily).
  WeekFocus: "weekFocus",
  HoursProgress: "hoursProgress",
  Engagement: "engagement",
  GradeResults: "gradeResults",
  BookStatus: "bookStatus",
  SightWords: "sightWords",
  RecentEval: "recentEval",
  WordMastery: "wordMastery",
  GeneratedContent: "generatedContent",
  WorkshopGames: "workshopGames",
  Mastery: "mastery",
  SkillSnapshot: "skillSnapshot",
  RecentScans: "recentScans",
  ActivityConfigs: "activityConfigs",
  RecentHistoryByDomain: "recentHistoryByDomain",
} as const;
export type ContextSlice = (typeof ContextSlice)[keyof typeof ContextSlice];

// ── Task → slice mapping ────────────────────────────────────────

export const TASK_CONTEXT: Record<string, ContextSlice[]> = {
  plan: [
    "charter", "childProfile", "workbookPaces",
    "weekFocus", "hoursProgress", "engagement", "gradeResults",
    "bookStatus", "sightWords", "recentEval", "wordMastery", "generatedContent",
    "workshopGames", "mastery", "skillSnapshot", "recentScans", "activityConfigs",
  ],
  chat: ["charter", "childProfile"],
  generate: ["charter", "childProfile"],
  evaluate: ["charter", "childProfile", "sightWords", "wordMastery"],
  quest: ["childProfile", "sightWords", "recentHistoryByDomain", "wordMastery", "skillSnapshot", "workbookPaces"],
  generateStory: ["childProfile", "sightWords", "wordMastery"],
  analyzePatterns: ["childProfile"],
  workshop: ["charter", "childProfile", "workshopGames"],
  analyzeWorkbook: ["charter", "childProfile"],
  disposition: [
    "charter", "childProfile", "engagement", "gradeResults",
    "recentHistoryByDomain", "skillSnapshot", "wordMastery",
  ],
  scan: ["childProfile", "recentEval", "skillSnapshot", "activityConfigs"],
  shellyChat: [
    "charter", "childProfile", "engagement", "gradeResults",
    "recentEval", "sightWords", "weekFocus", "wordMastery", "workbookPaces",
  ],
};

// ── Charter preamble (shared constant) ──────────────────────────

export const CHARTER_PREAMBLE = `You are an AI assistant for the First Principles Engine, a family homeschool learning platform.

FAMILY: Shelly (parent, fibromyalgia), Nathan (dad, builds the system), Lincoln (10, boy, neurodivergent, speech challenges), London (6, boy, story-driven, creative).

CHARTER VALUES:
- Formation first: character and virtue before academics. Prayer/scripture every day before school.
- Portfolio over grades: no scores, no rankings. Evidence of growth through work samples, audio recordings, and observations.
- No shame: mistakes are feedback. Bad days are data. MVD (Minimum Viable Day) is real school. Rest is by design.
- Engagement > completion: track HOW the child approached the activity, not just IF it got done.
- Lincoln teaches London: the Feynman technique. If he can explain it, he understands it. This is the richest evidence of learning.
- Adventure matters: movement, building, discovery, and creation are core curriculum.
- Narration counts: oral evidence is first-class, especially for Lincoln.
- Small artifacts > perfect documentation: one photo, one audio clip, one sentence. Capture quickly.
- Shelly's direct attention is the primary schedulable resource. Plans must be simple enough for a fibromyalgia flare day.

LEARNING DISPOSITIONS (what we track instead of grades):
- Curiosity (Wonder): Does the child want to know more? Choose to explore?
- Persistence (Build): Does the child push through hard activities?
- Articulation (Explain): Can the child explain what they learned? Teach someone else?
- Self-Awareness (Reflect): Does the child recognize what was hard vs easy?
- Ownership (Share): Does the child take pride in their work?

CONTENT GENERATION: When generating activities, questions, or plans:
- Connect to what the child is currently studying (subjects, books, themes)
- Ask questions with no single right answer when appropriate (conundrums)
- Generate content Shelly can USE — not just describe. Actual questions, actual prompts, actual activities.
- For Lincoln: Minecraft-framed, short instructions, visual, predictable. Narration over writing.
- For London: story-driven, interactive, creative. Voice-first. Drawing counts.
- For Shelly: simple to execute, adaptable to energy level, no prep required beyond what the app provides.

Always align recommendations with these values. Be concise, practical, and encouraging.`;

// ── Mastery summary ─────────────────────────────────────────────

export interface MasterySummary {
  activity: string;
  subjectBucket: string;
  gotIt: number;
  working: number;
  stuck: number;
  lastSeen: string;
}

export function buildMasterySummary(
  dayLogs: Array<{
    date: string;
    checklist: Array<{
      label: string;
      subjectBucket?: string;
      mastery?: string;
      completed?: boolean;
    }>;
  }>,
): MasterySummary[] {
  const map = new Map<string, MasterySummary>();

  for (const day of dayLogs) {
    for (const item of day.checklist ?? []) {
      if (!item.completed || !item.mastery) continue;
      const key = item.label.replace(/\s*\(\d+m\)/, "").trim();
      const existing = map.get(key) ?? {
        activity: key,
        subjectBucket: item.subjectBucket ?? "Other",
        gotIt: 0,
        working: 0,
        stuck: 0,
        lastSeen: day.date,
      };
      if (item.mastery === "got-it") existing.gotIt++;
      else if (item.mastery === "working") existing.working++;
      else if (item.mastery === "stuck") existing.stuck++;
      if (day.date > existing.lastSeen) existing.lastSeen = day.date;
      map.set(key, existing);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const scoreA = a.stuck * 3 + a.working * 2 + a.gotIt;
    const scoreB = b.stuck * 3 + b.working * 2 + b.gotIt;
    return scoreB - scoreA;
  });
}

export function formatMasterySummary(summaries: MasterySummary[]): string {
  if (summaries.length === 0) return "";
  const lines: string[] = [
    "MASTERY OBSERVATIONS (parent feedback, last 4 weeks):",
  ];
  const mastered = summaries.filter(
    (s) => s.gotIt >= 2 && s.stuck === 0 && s.working === 0,
  );
  const developing = summaries.filter(
    (s) => s.working > 0 || (s.gotIt > 0 && s.stuck > 0),
  );
  const struggling = summaries.filter((s) => s.stuck >= 2);

  if (mastered.length > 0)
    lines.push(`CAN SKIP: ${mastered.map((s) => s.activity).join(", ")}`);
  if (developing.length > 0)
    lines.push(`CONTINUE: ${developing.map((s) => s.activity).join(", ")}`);
  if (struggling.length > 0)
    lines.push(`FOCUS HERE: ${struggling.map((s) => s.activity).join(", ")}`);
  return lines.join("\n");
}

// ── Engagement summary compression ──────────────────────────────

interface EngagementEntry {
  activity: string;
  counts: Record<string, number>;
}

/**
 * Compress raw engagement data into a concise summary.
 * Groups activities by dominant engagement pattern and highlights
 * best/lowest engagement activities.
 */
export function compressEngagement(summaries: EngagementEntry[]): string {
  if (summaries.length === 0) return "";

  const lines: string[] = ["ACTIVITY ENGAGEMENT SUMMARY (last 14 days):"];

  // Categorize activities by dominant engagement
  const categories: Record<string, { emoji: Record<string, number>; activities: string[] }> = {};

  for (const { activity, counts } of summaries) {
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    if (total === 0) continue;

    const dominant = Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0];
    if (!categories[dominant]) {
      categories[dominant] = { emoji: { engaged: 0, okay: 0, struggled: 0, refused: 0 }, activities: [] };
    }
    categories[dominant].activities.push(activity);
    for (const [key, val] of Object.entries(counts)) {
      categories[dominant].emoji[key] = (categories[dominant].emoji[key] || 0) + val;
    }
  }

  // Format each category
  const engagementLabel: Record<string, string> = {
    engaged: "mostly positive",
    okay: "mixed",
    struggled: "challenging",
    refused: "resistant",
  };

  for (const [dominant, data] of Object.entries(categories)) {
    const total = Object.values(data.emoji).reduce((s, n) => s + n, 0);
    const label = engagementLabel[dominant] || dominant;
    const emojiStr = Object.entries(data.emoji)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    lines.push(`- ${data.activities.join(", ")}: ${label} (${emojiStr}, ${total} total sessions)`);
  }

  // Highlight best and lowest
  const ranked = summaries
    .map(({ activity, counts }) => {
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      const engagedRatio = total > 0 ? (counts.engaged || 0) / total : 0;
      return { activity, engagedRatio, total };
    })
    .filter((r) => r.total >= 2)
    .sort((a, b) => b.engagedRatio - a.engagedRatio);

  if (ranked.length >= 2) {
    const best = ranked.slice(0, 2).map((r) => r.activity);
    const lowest = ranked.slice(-2).map((r) => r.activity);
    lines.push(`- Best engagement: ${best.join(", ")}`);
    if (lowest[0] !== best[0]) {
      lines.push(`- Lowest engagement: ${lowest.join(", ")}`);
    }
  }

  return lines.join("\n");
}

// ── Child profile formatter ─────────────────────────────────────

interface ChildContext {
  name: string;
  grade?: string;
  prioritySkills?: Array<{ tag: string; label: string; level: string }>;
  supports?: Array<{ label: string; description: string }>;
  stopRules?: Array<{ label: string; trigger: string; action: string }>;
}

export function formatChildProfile(child: ChildContext): string {
  const lines: string[] = ["CHILD PROFILE:"];
  lines.push(`Name: ${child.name}`);
  if (child.grade) {
    lines.push(`Grade: ${child.grade}`);
  }
  if (child.prioritySkills?.length) {
    lines.push("Priority skills:");
    for (const s of child.prioritySkills) {
      lines.push(`- ${s.label} (${s.tag}): ${s.level}`);
    }
  }
  if (child.supports?.length) {
    lines.push("Available supports:");
    for (const s of child.supports) {
      lines.push(`- ${s.label}: ${s.description}`);
    }
  }
  if (child.stopRules?.length) {
    lines.push("Stop rules:");
    for (const r of child.stopRules) {
      lines.push(`- ${r.label}: when "${r.trigger}" → ${r.action}`);
    }
  }
  return lines.join("\n");
}

// ── Composable context assembler ────────────────────────────────

export interface SliceContext {
  db: Firestore;
  familyId: string;
  childId: string;
  childData: { name: string; grade?: string };
  snapshotData: SnapshotData | undefined;
  /** Optional domain hint for domain-scoped slices (e.g. quest mode). */
  domain?: string;
}

/**
 * Build only the context sections needed for a given task type.
 * Returns an array of prompt sections (strings) that the caller
 * joins into the final system prompt.
 */
export async function buildContextForTask(
  taskType: string,
  ctx: SliceContext,
): Promise<string[]> {
  const slices = TASK_CONTEXT[taskType] || TASK_CONTEXT["chat"];
  const { db, familyId, childId, childData, snapshotData } = ctx;

  const sections: string[] = [];

  // Charter — static text, no fetch needed
  if (slices.includes("charter")) {
    sections.push(CHARTER_PREAMBLE);
  }

  // Child profile — assembled from already-loaded data
  if (slices.includes("childProfile")) {
    sections.push(formatChildProfile({
      name: childData.name,
      grade: childData.grade,
      prioritySkills: snapshotData?.prioritySkills,
      supports: snapshotData?.supports,
      stopRules: snapshotData?.stopRules,
    }));
  }

  // ── Firestore slices (fetched in parallel) ────────────────────
  const fetches: Array<{ slice: ContextSlice; promise: Promise<unknown> }> = [];

  if (slices.includes("workbookPaces")) {
    fetches.push({ slice: "workbookPaces", promise: loadWorkbookPaces(db, familyId, childId) });
  }
  if (slices.includes("weekFocus")) {
    fetches.push({ slice: "weekFocus", promise: loadWeekContext(db, familyId) });
  }
  if (slices.includes("hoursProgress")) {
    fetches.push({ slice: "hoursProgress", promise: loadHoursSummary(db, familyId, childId) });
  }
  if (slices.includes("engagement")) {
    fetches.push({ slice: "engagement", promise: loadEngagementSummary(db, familyId, childId) });
  }
  if (slices.includes("gradeResults")) {
    fetches.push({ slice: "gradeResults", promise: loadGradeResults(db, familyId, childId) });
  }
  if (slices.includes("bookStatus")) {
    fetches.push({ slice: "bookStatus", promise: loadDraftBookCount(db, familyId, childId) });
  }
  if (slices.includes("sightWords")) {
    fetches.push({ slice: "sightWords", promise: loadSightWordSummary(db, familyId, childId) });
  }
  if (slices.includes("recentEval")) {
    fetches.push({ slice: "recentEval", promise: loadRecentEvalContext(db, familyId, childId) });
  }
  if (slices.includes("recentHistoryByDomain")) {
    fetches.push({
      slice: "recentHistoryByDomain",
      promise: loadRecentEvalHistoryByDomain(db, familyId, childId, {
        filterDomain: ctx.domain,
      }),
    });
  }
  if (slices.includes("wordMastery")) {
    fetches.push({ slice: "wordMastery", promise: loadWordMasterySummary(db, familyId, childId) });
  }
  if (slices.includes("generatedContent")) {
    fetches.push({ slice: "generatedContent", promise: loadGeneratedContent(db, familyId, childId) });
  }
  if (slices.includes("workshopGames")) {
    fetches.push({ slice: "workshopGames", promise: loadWorkshopGames(db, familyId, childId) });
  }
  if (slices.includes("mastery")) {
    fetches.push({ slice: "mastery", promise: loadMasterySummary(db, familyId, childId) });
  }
  if (slices.includes("skillSnapshot")) {
    fetches.push({ slice: "skillSnapshot", promise: loadSkillSnapshotContext(db, familyId, childId) });
  }
  if (slices.includes("recentScans")) {
    fetches.push({ slice: "recentScans", promise: loadRecentScansContext(db, familyId, childId) });
  }
  if (slices.includes("activityConfigs")) {
    fetches.push({ slice: "activityConfigs", promise: loadActivityConfigsContext(db, familyId, childId) });
  }

  // Await all in parallel
  const results = await Promise.allSettled(fetches.map((f) => f.promise));

  // Map results back to slices
  const sliceData = new Map<string, unknown>();
  for (let i = 0; i < fetches.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      sliceData.set(fetches[i].slice, r.value);
    } else {
      console.warn(`Failed to load context slice "${fetches[i].slice}":`, r.reason);
    }
  }

  // ── Format each slice into prompt text ────────────────────────

  // Load completed programs from skill snapshot for filtering
  const completedPrograms: string[] = snapshotData?.completedPrograms ?? [];

  // Curriculum coverage (was "WORKBOOK PACE")
  if (sliceData.has("workbookPaces")) {
    const rawPaces = sliceData.get("workbookPaces") as Array<{ name: string; unitLabel: string; currentPosition: number; totalUnits: number; subjectBucket?: string; curriculum?: { provider: string; level?: string; lastMilestone?: string; milestoneDate?: string; completed?: boolean; masteredSkills?: string[]; activeSkills?: string[] } }>;

    // Filter out workbooks whose curriculum is marked completed OR whose name matches a completed program
    const paces = rawPaces.filter((w) => {
      if (w.curriculum?.completed) return false;
      const wbName = w.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return !completedPrograms.some((prog) => {
        const progName = prog.toLowerCase().replace(/[^a-z0-9]/g, "");
        return wbName.includes(progName) || progName.includes(wbName);
      });
    });

    const lines = ["CURRICULUM COVERAGE:"];
    if (paces.length === 0) {
      lines.push("No curriculum data available.");
    } else {
      for (const w of paces) {
        // Coverage summary — no pace/deadline language
        if (w.totalUnits > 0) {
          lines.push(`- ${w.name}: ${w.unitLabel} ${w.currentPosition} of ${w.totalUnits} covered`);
        } else {
          lines.push(`- ${w.name}: position ${w.currentPosition}`);
        }

        // Curriculum metadata
        if (w.curriculum) {
          const c = w.curriculum;
          if (c.completed) {
            lines.push(`  ✅ COMPLETED — ${c.provider} ${c.level || ""} (${c.milestoneDate || ""})`);
          } else if (c.lastMilestone) {
            lines.push(`  📍 ${c.provider} ${c.level || ""} — ${c.lastMilestone} (${c.milestoneDate || "date unknown"})`);
          }
          if (c.masteredSkills?.length) {
            lines.push(`  Skills covered: ${c.masteredSkills.join(", ")}`);
          }
          if (c.activeSkills?.length) {
            lines.push(`  Currently working on: ${c.activeSkills.join(", ")}`);
          }
        }

        // GATB scope-and-sequence enrichment
        if (w.name.match(/good.*beautiful|gatb/i) && w.currentPosition) {
          const subjectKey = w.subjectBucket === "Math" ? "math" : "la";
          const levelMatch = w.curriculum?.level?.match(/\d+/);
          const levelKey = levelMatch ? levelMatch[0] : "k";
          const key = `gatb-${subjectKey}-${levelKey}`.toLowerCase();
          const progress = getGatbProgress(key, w.currentPosition);
          if (progress) {
            lines.push(`  Covered skills: ${progress.coveredSkills.join(", ")}`);
            lines.push(`  Current unit: ${progress.currentUnit?.topic ?? "unknown"}`);
            if (progress.upcomingUnits.length > 0) {
              lines.push(`  Upcoming: ${progress.upcomingUnits.slice(0, 2).map(u => u.topic).join(", ")}`);
            }
          }
        }
      }
    }
    sections.push(lines.join("\n"));
  }

  // Week focus
  if (sliceData.has("weekFocus")) {
    const week = sliceData.get("weekFocus") as { theme: string; virtue: string; scriptureRef: string; heartQuestion?: string } | null;
    const lines = ["THIS WEEK:"];
    if (week) {
      if (week.theme) lines.push(`Theme: ${week.theme}`);
      if (week.virtue) lines.push(`Virtue: ${week.virtue}`);
      if (week.scriptureRef) lines.push(`Scripture: ${week.scriptureRef}`);
      if (week.heartQuestion) lines.push(`Heart question: ${week.heartQuestion}`);
    } else {
      lines.push("No weekly plan set yet.");
    }
    sections.push(lines.join("\n"));
  }

  // Hours progress
  if (sliceData.has("hoursProgress")) {
    const { totalMinutes } = sliceData.get("hoursProgress") as { totalMinutes: number };
    const hoursTarget = 1000;
    const totalHours = Math.round(totalMinutes / 60);
    const pct = Math.round((totalMinutes / (hoursTarget * 60)) * 100);
    sections.push(`HOURS PROGRESS:\nHours logged this year: ${totalHours} hours of ${hoursTarget} target (${pct}% complete)`);
  }

  // Engagement — use compressed summary for non-chat tasks
  if (sliceData.has("engagement")) {
    const engagementSummaries = sliceData.get("engagement") as EngagementEntry[];
    if (engagementSummaries.length > 0) {
      // Use compressed summary — significantly reduces token count
      const compressed = compressEngagement(engagementSummaries);
      if (compressed) sections.push(compressed);
    }
  }

  // Book status
  if (sliceData.has("bookStatus")) {
    const draftBookCount = sliceData.get("bookStatus") as number;
    const lines = ["BOOK STATUS:"];
    if (draftBookCount > 0) {
      lines.push(`Draft books in progress: ${draftBookCount}. Suggest "Continue your book" as a choose activity instead of "Make a Book".`);
    } else {
      lines.push(`No draft books. "Make a Book" is available as a choose activity.`);
    }
    sections.push(lines.join("\n"));
  }

  // Grade results
  if (sliceData.has("gradeResults")) {
    const gradeResults = sliceData.get("gradeResults") as Array<{ activity: string; result: string; date: string }>;
    if (gradeResults.length > 0) {
      const lines = [
        "WORK REVIEW RESULTS (this period):",
        "Use these results to adjust upcoming plans — reinforce weak areas, advance strong ones.",
      ];
      for (const { activity, result, date } of gradeResults) {
        lines.push(`- ${activity} (${date}): ${result}`);
      }
      sections.push(lines.join("\n"));
    }
  }

  // Sight words
  if (sliceData.has("sightWords")) {
    const sightWordContext = sliceData.get("sightWords") as string;
    if (sightWordContext) sections.push(sightWordContext);
  }

  // Recent eval (cross-domain most-recent — kept for plan/scan/shellyChat backward compat)
  if (sliceData.has("recentEval")) {
    const evalContext = sliceData.get("recentEval") as string;
    if (evalContext) sections.push(evalContext);
  }

  // Recent eval history by domain (per-domain depth — used by quest)
  if (sliceData.has("recentHistoryByDomain")) {
    const historyText = sliceData.get("recentHistoryByDomain") as string;
    const formatted = formatEvalHistoryByDomain(historyText);
    if (formatted) sections.push(formatted);
  }

  // Word mastery (quest word progress)
  if (sliceData.has("wordMastery")) {
    const wordMasteryContext = sliceData.get("wordMastery") as string;
    if (wordMasteryContext) sections.push(wordMasteryContext);
  }

  // Generated content (books, stories available for plan activities)
  if (sliceData.has("generatedContent")) {
    const generatedContent = sliceData.get("generatedContent") as string;
    if (generatedContent) sections.push(generatedContent);
  }

  // Workshop games (available for plan activities)
  if (sliceData.has("workshopGames")) {
    const workshopGames = sliceData.get("workshopGames") as string;
    if (workshopGames) sections.push(workshopGames);
  }

  // Mastery observations (parent feedback on skill mastery)
  if (sliceData.has("mastery")) {
    const masteryText = sliceData.get("mastery") as string;
    if (masteryText) sections.push(masteryText);
  }

  // Skill snapshot (evaluation-derived skill priorities, supports, stop rules, conceptual blocks)
  if (sliceData.has("skillSnapshot")) {
    const snapshotText = sliceData.get("skillSnapshot") as string;
    if (snapshotText) sections.push(snapshotText);
  }

  // Recent scans (where the child left off in each workbook)
  if (sliceData.has("recentScans")) {
    const scansText = sliceData.get("recentScans") as string;
    if (scansText) sections.push(scansText);
  }

  // Activity configs (structured routine + workbook replacement)
  if (sliceData.has("activityConfigs")) {
    const activityConfigsText = sliceData.get("activityConfigs") as string;
    if (activityConfigsText) sections.push(activityConfigsText);
  }

  return sections;
}

// ── Mastery summary loader ───────────────────────────────────

/** Load mastery feedback from recent day logs (last 28 days) and format for AI context. */
async function loadMasterySummary(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<string> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 28);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const snap = await db
    .collection(`families/${familyId}/days`)
    .where("childId", "==", childId)
    .where("date", ">=", cutoffStr)
    .get();

  const dayLogs = snap.docs.map((doc) => {
    const data = doc.data() as {
      date?: string;
      checklist?: Array<{
        label: string;
        subjectBucket?: string;
        mastery?: string;
        completed?: boolean;
      }>;
    };
    return {
      date: data.date ?? "",
      checklist: data.checklist ?? [],
    };
  });

  const summaries = buildMasterySummary(dayLogs);
  return formatMasterySummary(summaries);
}

// ── Generated content loader ──────────────────────────────────

/** Load recently generated books/stories that can be included as plan activities. */
async function loadGeneratedContent(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<string> {
  const snap = await db
    .collection(`families/${familyId}/books`)
    .where("childId", "==", childId)
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();

  if (snap.empty) return "";

  const lines = ["AVAILABLE GENERATED CONTENT:"];
  for (const bookDoc of snap.docs) {
    const book = bookDoc.data() as {
      title?: string;
      skillTags?: string[];
      status?: string;
    };
    const tags = book.skillTags?.join(", ") || "general reading";
    lines.push(`- Reading book: "${book.title}" (targets: ${tags}${book.status === "draft" ? ", in progress" : ""})`);
  }
  lines.push('Include 1-2 of these as "choose" activities in the plan, like "Read: [title]".');

  return lines.join("\n");
}

// ── Workshop games loader ─────────────────────────────────────

/** Load skill snapshot (evaluation-derived priorities, supports, stop rules, conceptual blocks). */
async function loadSkillSnapshotContext(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<string> {
  const snap = await db
    .collection(`families/${familyId}/skillSnapshots`)
    .doc(childId)
    .get();

  if (!snap.exists) return "";

  const data = snap.data() as {
    prioritySkills?: Array<{ tag: string; label: string; level: string; notes?: string; masteryGate?: number }>;
    supports?: Array<{ label: string; description: string }>;
    stopRules?: Array<{ label: string; trigger: string; action: string }>;
    conceptualBlocks?: Array<{
      name: string;
      affectedSkills: string[];
      recommendation: string;
      rationale: string;
      strategies?: string[];
    }>;
    completedPrograms?: string[];
    workingLevels?: Record<string, { level: number; updatedAt: string; source: string; evidence?: string }>;
  };

  const lines: string[] = ["SKILL SNAPSHOT (from evaluations):"];

  // Priority skills
  const skills = data.prioritySkills || [];
  if (skills.length > 0) {
    lines.push("Priority Skills:");
    for (const s of skills) {
      lines.push(`- ${s.label} (${s.tag}): ${s.level}${s.notes ? ` — ${s.notes}` : ""}`);
    }
  }

  // Stop rules
  const stops = data.stopRules || [];
  if (stops.length > 0) {
    lines.push("Stop Rules (DO NOT include these in plans):");
    for (const r of stops) {
      lines.push(`- ${r.label}: when "${r.trigger}" → ${r.action}`);
    }
  }

  // Supports
  const supports = data.supports || [];
  if (supports.length > 0) {
    lines.push("Supports (how this child learns best):");
    for (const s of supports) {
      lines.push(`- ${s.label}: ${s.description}`);
    }
  }

  // Conceptual blocks
  const blocks = data.conceptualBlocks || [];
  const addressNow = blocks.filter((b) => b.recommendation === "ADDRESS_NOW");
  if (addressNow.length > 0) {
    lines.push("Conceptual Blocks (ADDRESS NOW):");
    for (const b of addressNow) {
      const strategies = b.strategies?.length ? ` — Strategies: ${b.strategies.join("; ")}` : "";
      lines.push(`- ${b.name} (affects: ${b.affectedSkills.join(", ")}): ${b.rationale}${strategies}`);
    }
  }

  // Working levels (quest progression)
  const wl = data.workingLevels;
  if (wl && Object.keys(wl).length > 0) {
    lines.push("Working levels (updated when quest/eval completes):");
    for (const [mode, entry] of Object.entries(wl)) {
      const dateStr = entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "unknown";
      const evidenceStr = entry.evidence ? ` — ${entry.evidence}` : "";
      const label = mode.charAt(0).toUpperCase() + mode.slice(1);
      lines.push(`- ${label}: Level ${entry.level} (source: ${entry.source}, ${dateStr}${evidenceStr})`);
    }
  }

  // Completed programs
  const snapshotCompletedPrograms = data.completedPrograms || [];
  if (snapshotCompletedPrograms.length > 0) {
    lines.push(`COMPLETED PROGRAMS: ${snapshotCompletedPrograms.join(", ")}`);
    lines.push("These programs are FINISHED. Do NOT include them as checklist items in the weekly plan.");
    lines.push("Do not schedule time for completed programs. The child has moved past this material.");
    lines.push("→ Foundational phonics is mastered. Do not test basic letter sounds, CVC, blends, or digraphs.");
    lines.push("→ For reading quests, focus on comprehension and fluency.");
    lines.push("→ Recommend Comprehension Quest and Fluency Practice modes.");
  }

  // Planning guidance
  if (skills.length > 0 || stops.length > 0 || addressNow.length > 0) {
    lines.push("");
    lines.push("Use the Skill Snapshot to calibrate plans and questions:");
    lines.push("- Skills at 'Secure' level → SKIP. Do not create activities for these.");
    lines.push("- Skills at 'Emerging' → include short daily practice (5-10 min)");
    lines.push("- Skills at 'Not Yet' → include direct instruction blocks");
    lines.push("- Stop Rules → never include these topics");
    lines.push("- Conceptual Blocks marked ADDRESS_NOW → create targeted activities");
  }

  return lines.length > 1 ? lines.join("\n") : "";
}

/** Load recently created workshop games that can be included as plan activities. */
async function loadWorkshopGames(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<string> {
  const snap = await db
    .collection(`families/${familyId}/storyGames`)
    .where("childId", "==", childId)
    .where("status", "in", ["ready", "played"])
    .orderBy("updatedAt", "desc")
    .limit(5)
    .get();

  if (snap.empty) return "";

  const gameTypeLabel: Record<string, string> = {
    board: "Board game",
    adventure: "Choose-your-adventure",
    cards: "Card game",
  };

  const lines = ["AVAILABLE WORKSHOP GAMES:"];
  for (const gameDoc of snap.docs) {
    const game = gameDoc.data() as {
      gameType?: string;
      generatedGame?: { title?: string; challengeCards?: Array<{ type: string }> };
      adventureTree?: { totalNodes?: number; challengeCount?: number };
      cardGame?: { mechanic?: string; metadata?: { deckSize?: number } };
      storyInputs?: { theme?: string };
      playSessions?: unknown[];
      status?: string;
    };

    const type = gameTypeLabel[game.gameType ?? "board"] ?? "Game";
    const theme = game.storyInputs?.theme ?? "unknown theme";
    const playCount = game.playSessions?.length ?? 0;
    const title = game.generatedGame?.title ?? `${theme} game`;

    // Summarize challenge types for the planner
    let challengeInfo = "";
    if (game.generatedGame?.challengeCards?.length) {
      const types = new Set(game.generatedGame.challengeCards.map((c) => c.type));
      challengeInfo = ` (${[...types].join(", ")} challenges)`;
    } else if (game.adventureTree?.challengeCount) {
      challengeInfo = ` (${game.adventureTree.challengeCount} embedded challenges)`;
    } else if (game.cardGame?.metadata?.deckSize) {
      challengeInfo = ` (${game.cardGame.metadata.deckSize} cards, ${game.cardGame.mechanic})`;
    }

    const played = playCount > 0 ? `, played ${playCount}x` : ", not yet played";
    lines.push(`- ${type}: "${title}" — ${theme}${challengeInfo}${played}`);
  }
  lines.push('Include 1-2 of these as "choose" activities in the plan, like "Play: [title]" or "Workshop: create a new game".');

  return lines.join("\n");
}

// ── Recent scans loader ─────────────────────────────────────

// ── Activity configs loader ──────────────────────────────────

/** Activity config shape as stored in Firestore. */
interface ActivityConfigDoc {
  name: string;
  type: string;
  subjectBucket: string;
  defaultMinutes: number;
  frequency: string;
  childId: string | "both";
  sortOrder: number;
  curriculum?: string;
  totalUnits?: number;
  currentPosition?: number;
  unitLabel?: string;
  completed: boolean;
  completedDate?: string;
  scannable: boolean;
  notes?: string;
}

/**
 * Load structured activity configs for a child.
 * These replace the old routine text + workbook configs with one source of truth.
 * Completed activities are filtered out so the planner never schedules them.
 */
async function loadActivityConfigsContext(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<string> {
  const snap = await db
    .collection(`families/${familyId}/activityConfigs`)
    .where("childId", "in", [childId, "both"])
    .get();

  if (snap.empty) return "";

  const configs = snap.docs
    .map((doc) => doc.data() as ActivityConfigDoc)
    .filter((c) => !c.completed)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (configs.length === 0) return "";

  const lines = configs.map((c) => {
    let line = `- ${c.name}: ${c.defaultMinutes}m, ${c.frequency}, ${c.subjectBucket}`;
    if (c.currentPosition && c.totalUnits) {
      line += ` (currently at ${c.unitLabel || "lesson"} ${c.currentPosition} of ${c.totalUnits})`;
    }
    if (c.type === "evaluation") {
      line += " [AUTO-SCHEDULED — must include in plan]";
    }
    return line;
  });

  return [
    "ACTIVITY CONFIGS (structured — use these instead of any routine text):",
    ...lines,
    "",
    "SCHEDULING RULES:",
    '- "daily" items appear every day',
    '- "3x" items appear on 3 different days (e.g., MWF)',
    '- "2x" items appear on 2 different days (e.g., TTh)',
    '- "1x" items appear on 1 day',
    '- "as-needed" items are optional — include if time allows',
    "- Items are listed in priority order (formation first, core academics next, support skills, then apps)",
    "- Respect the sortOrder — earlier items come first in each day's checklist",
    "- COMPLETED items are already filtered out — everything listed here should be in the plan",
  ].join("\n");
}

// ── Recent scans loader ─────────────────────────────────────

/** Load recent curriculum scans to tell the planner where the child left off in each workbook. */
async function loadRecentScansContext(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<string> {
  const snap = await db
    .collection(`families/${familyId}/scans`)
    .where("childId", "==", childId)
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  if (snap.empty) return "";

  // Group by workbook, keep most recent per workbook
  const byWorkbook = new Map<string, { topics: string; lesson: string; date: string }>();
  for (const scanDoc of snap.docs) {
    const scan = scanDoc.data() as {
      createdAt?: string;
      results?: {
        pageType?: string;
        specificTopic?: string;
        curriculumDetected?: { name?: string; lessonNumber?: number; pageNumber?: number };
      } | null;
    };
    if (!scan.results || scan.results.pageType === "certificate") continue;
    const detected = scan.results.curriculumDetected;
    const wb = detected?.name || "Unknown";
    if (byWorkbook.has(wb)) continue; // already have a more recent one

    const topics = scan.results.specificTopic || "unknown content";
    const lesson = String(detected?.lessonNumber ?? detected?.pageNumber ?? "?");
    const date = scan.createdAt ? new Date(scan.createdAt).toLocaleDateString() : "unknown date";
    byWorkbook.set(wb, { topics, lesson, date });
  }

  if (byWorkbook.size === 0) return "";

  const lines = ["RECENT WORKBOOK SCANS (where the child left off):"];
  for (const [wb, info] of byWorkbook) {
    lines.push(`- ${wb}: Last at lesson/page ${info.lesson} (${info.topics}) on ${info.date}`);
  }
  lines.push("Use this to know what lesson to assign next. Cross-reference with Skill Snapshot to determine skip guidance.");

  return lines.join("\n");
}
