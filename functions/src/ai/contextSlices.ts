import type { Firestore } from "firebase-admin/firestore";
import type { SnapshotData } from "./chatTypes.js";
import {
  loadRecentSessions,
  loadWorkbookPaces,
  loadWeekContext,
  loadHoursSummary,
  loadEngagementSummary,
  loadGradeResults,
  loadDraftBookCount,
  loadSightWordSummary,
  loadWordMasterySummary,
} from "./chat.js";
import { loadRecentEvalContext } from "./chatTypes.js";

// ── Slice definitions ───────────────────────────────────────────

export const ContextSlice = {
  Charter: "charter",
  ChildProfile: "childProfile",
  RecentSessions: "recentSessions",
  WorkbookPaces: "workbookPaces",
  WeekFocus: "weekFocus",
  HoursProgress: "hoursProgress",
  Engagement: "engagement",
  GradeResults: "gradeResults",
  BookStatus: "bookStatus",
  SightWords: "sightWords",
  RecentEval: "recentEval",
  WordMastery: "wordMastery",
} as const;
export type ContextSlice = (typeof ContextSlice)[keyof typeof ContextSlice];

// ── Task → slice mapping ────────────────────────────────────────

export const TASK_CONTEXT: Record<string, ContextSlice[]> = {
  plan: [
    "charter", "childProfile", "recentSessions", "workbookPaces",
    "weekFocus", "hoursProgress", "engagement", "gradeResults",
    "bookStatus", "sightWords", "recentEval", "wordMastery",
  ],
  chat: ["charter", "childProfile"],
  generate: ["charter", "childProfile"],
  evaluate: ["charter", "childProfile", "sightWords", "wordMastery"],
  quest: ["childProfile", "sightWords", "recentEval", "wordMastery"],
  generateStory: ["childProfile", "wordMastery"],
  analyzePatterns: ["childProfile"],
};

// ── Charter preamble (shared constant) ──────────────────────────

export const CHARTER_PREAMBLE = `You are an AI assistant for the First Principles Engine, a family homeschool learning platform.

Core family values (Charter):
- Formation first: character and virtue before academics.
- Both kids count: Lincoln (10, neurodivergent, speech challenges) and London (6, story-driven).
- Narration counts: oral evidence is first-class, especially for Lincoln.
- Small artifacts > perfect documentation: capture evidence quickly.
- No heroics: simple routines, minimum viable days are real school.
- Shelly's direct attention is the primary schedulable resource — split-block scheduling is required.

Always align recommendations with these values. Be concise, practical, and encouraging.`;

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

  if (slices.includes("recentSessions")) {
    fetches.push({ slice: "recentSessions", promise: loadRecentSessions(db, familyId, childId) });
  }
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
  if (slices.includes("wordMastery")) {
    fetches.push({ slice: "wordMastery", promise: loadWordMasterySummary(db, familyId, childId) });
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

  // Recent sessions
  if (sliceData.has("recentSessions")) {
    const sessions = sliceData.get("recentSessions") as Array<{ streamId: string; hits: number; nears: number; misses: number }>;
    const lines = ["RECENT PERFORMANCE (last 14 days):"];
    if (sessions.length === 0) {
      lines.push("No recent session data available.");
    } else {
      for (const s of sessions) {
        lines.push(`- ${s.streamId}: ${s.hits} hits, ${s.nears} nears, ${s.misses} misses`);
      }
    }
    sections.push(lines.join("\n"));
  }

  // Workbook paces
  if (sliceData.has("workbookPaces")) {
    const paces = sliceData.get("workbookPaces") as Array<{ name: string; unitLabel: string; currentPosition: number; totalUnits: number; unitsPerDayNeeded: number; targetFinishDate: string; status: string }>;
    const lines = ["WORKBOOK PACE:"];
    if (paces.length === 0) {
      lines.push("No workbook data available.");
    } else {
      for (const w of paces) {
        lines.push(`- ${w.name} — ${w.unitLabel} ${w.currentPosition} of ${w.totalUnits}, ${w.unitsPerDayNeeded} ${w.unitLabel}s/day needed to finish by ${w.targetFinishDate}. Status: ${w.status}`);
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

  // Recent eval
  if (sliceData.has("recentEval")) {
    const evalContext = sliceData.get("recentEval") as string;
    if (evalContext) sections.push(evalContext);
  }

  // Word mastery (quest word progress)
  if (sliceData.has("wordMastery")) {
    const wordMasteryContext = sliceData.get("wordMastery") as string;
    if (wordMasteryContext) sections.push(wordMasteryContext);
  }

  return sections;
}
