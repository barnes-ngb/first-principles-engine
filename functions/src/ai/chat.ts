import type { Firestore } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { claudeApiKey } from "./aiConfig.js";

// ── Request / Response types ────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Task types determine model selection.
 *  - "plan" / "evaluate" → Sonnet (complex reasoning)
 *  - "generate" / "chat"  → Haiku  (routine generation)
 */
const TaskType = {
  Plan: "plan",
  Evaluate: "evaluate",
  Generate: "generate",
  Chat: "chat",
  Quest: "quest",
  GenerateStory: "generateStory",
} as const;
type TaskType = (typeof TaskType)[keyof typeof TaskType];

const TASK_TYPES = new Set<string>(Object.values(TaskType));

interface ChatRequest {
  familyId: string;
  childId: string;
  taskType: TaskType;
  messages: ChatMessage[];
  /** Evaluation domain (only used when taskType === 'evaluate') */
  domain?: string;
}

interface ChatResponse {
  message: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

// ── Model mapping ───────────────────────────────────────────────

function modelForTask(taskType: TaskType): string {
  switch (taskType) {
    case TaskType.Plan:
    case TaskType.Evaluate:
    case TaskType.Quest:
    case TaskType.GenerateStory:
      return "claude-sonnet-4-5-20250929";
    case TaskType.Generate:
    case TaskType.Chat:
    default:
      return "claude-haiku-4-5-20251001";
  }
}

// ── Enriched context types ──────────────────────────────────────

interface SessionSummary {
  streamId: string;
  hits: number;
  nears: number;
  misses: number;
}

interface WorkbookPace {
  name: string;
  unitLabel: string;
  currentPosition: number;
  totalUnits: number;
  unitsPerDayNeeded: number;
  targetFinishDate: string;
  status: "ahead" | "on-track" | "behind";
}

interface WeekContext {
  theme: string;
  virtue: string;
  scriptureRef: string;
  heartQuestion?: string;
}

interface EngagementSummary {
  activity: string;
  counts: Record<string, number>;
}

/** A grade/review result from a captured worksheet or activity. */
interface GradeResult {
  activity: string;
  result: string;
  date: string;
}

interface EnrichedContext {
  sessions: SessionSummary[];
  workbookPaces: WorkbookPace[];
  week: WeekContext | null;
  hoursTotalMinutes: number;
  hoursTarget: number;
  engagementSummaries: EngagementSummary[];
  gradeResults: GradeResult[];
  draftBookCount: number;
}

// ── Date helpers ────────────────────────────────────────────────

/** Returns YYYY-MM-DD string for a Date. */
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns the Monday of the ISO week containing the given date. */
export function getWeekMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Returns school year start (Aug 1) for the given date. */
function schoolYearStart(d: Date): string {
  const year = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}-08-01`;
}

// ── Enriched context loaders ────────────────────────────────────

/** Load recent sessions (last 14 days) and summarize by stream. */
export async function loadRecentSessions(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<SessionSummary[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = toDateString(cutoff);

  const snap = await db
    .collection(`families/${familyId}/sessions`)
    .where("childId", "==", childId)
    .where("date", ">=", cutoffStr)
    .get();

  const byStream = new Map<
    string,
    { hits: number; nears: number; misses: number }
  >();

  for (const doc of snap.docs) {
    const data = doc.data() as {
      streamId: string;
      result: string;
    };
    if (!byStream.has(data.streamId)) {
      byStream.set(data.streamId, { hits: 0, nears: 0, misses: 0 });
    }
    const counts = byStream.get(data.streamId)!;
    if (data.result === "hit") counts.hits++;
    else if (data.result === "near") counts.nears++;
    else if (data.result === "miss") counts.misses++;
  }

  return [...byStream.entries()].map(([streamId, counts]) => ({
    streamId,
    ...counts,
  }));
}

/** Load workbook configs and calculate pace for each. */
export async function loadWorkbookPaces(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<WorkbookPace[]> {
  const snap = await db
    .collection(`families/${familyId}/workbookConfigs`)
    .where("childId", "==", childId)
    .get();

  const today = new Date();
  const paces: WorkbookPace[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as {
      name: string;
      unitLabel: string;
      currentPosition: number;
      totalUnits: number;
      targetFinishDate: string;
      schoolDaysPerWeek: number;
    };

    const remaining = data.totalUnits - data.currentPosition;
    const targetDate = new Date(data.targetFinishDate + "T00:00:00");
    const msPerDay = 86_400_000;
    const calendarDaysLeft = Math.max(
      1,
      Math.ceil((targetDate.getTime() - today.getTime()) / msPerDay),
    );
    // Approximate school days: (calendarDays / 7) * schoolDaysPerWeek
    const schoolDaysLeft = Math.max(
      1,
      Math.round((calendarDaysLeft / 7) * (data.schoolDaysPerWeek || 5)),
    );
    const unitsPerDay = remaining / schoolDaysLeft;

    let status: WorkbookPace["status"];
    if (unitsPerDay <= 0.8) status = "ahead";
    else if (unitsPerDay <= 1.2) status = "on-track";
    else status = "behind";

    paces.push({
      name: data.name,
      unitLabel: data.unitLabel || "lesson",
      currentPosition: data.currentPosition,
      totalUnits: data.totalUnits,
      unitsPerDayNeeded: Math.round(unitsPerDay * 10) / 10,
      targetFinishDate: data.targetFinishDate,
      status,
    });
  }

  return paces;
}

/** Load current week's plan (theme, virtue, scripture). */
export async function loadWeekContext(
  db: Firestore,
  familyId: string,
): Promise<WeekContext | null> {
  const monday = getWeekMonday(new Date());
  const weekId = toDateString(monday);

  const snap = await db.doc(`families/${familyId}/weeks/${weekId}`).get();

  if (!snap.exists) return null;

  const data = snap.data() as {
    theme?: string;
    virtue?: string;
    scriptureRef?: string;
    heartQuestion?: string;
  };

  if (!data.theme && !data.virtue && !data.scriptureRef) return null;

  return {
    theme: data.theme || "",
    virtue: data.virtue || "",
    scriptureRef: data.scriptureRef || "",
    heartQuestion: data.heartQuestion,
  };
}

/** Load hours logged since school year start and sum total minutes. */
export async function loadHoursSummary(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<{ totalMinutes: number }> {
  const startDate = schoolYearStart(new Date());

  const snap = await db
    .collection(`families/${familyId}/hours`)
    .where("childId", "==", childId)
    .where("date", ">=", startDate)
    .get();

  let totalMinutes = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as { minutes?: number; hours?: number };
    totalMinutes += data.minutes || 0;
    if (data.hours) totalMinutes += data.hours * 60;
  }

  return { totalMinutes };
}

/** Load engagement data from recent day logs (last 14 days). */
export async function loadEngagementSummary(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<EngagementSummary[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = toDateString(cutoff);

  const snap = await db
    .collection(`families/${familyId}/days`)
    .where("childId", "==", childId)
    .where("date", ">=", cutoffStr)
    .get();

  const byActivity = new Map<string, Record<string, number>>();

  for (const doc of snap.docs) {
    const data = doc.data() as {
      checklist?: Array<{ label?: string; engagement?: string }>;
    };
    if (!data.checklist) continue;
    for (const item of data.checklist) {
      if (!item.engagement || !item.label) continue;
      const activity = item.label.replace(/\s*\(\d+m\)\s*$/, "");
      if (!byActivity.has(activity)) {
        byActivity.set(activity, { engaged: 0, okay: 0, struggled: 0, refused: 0 });
      }
      const counts = byActivity.get(activity)!;
      if (counts[item.engagement] !== undefined) {
        counts[item.engagement]++;
      }
    }
  }

  return [...byActivity.entries()].map(([activity, counts]) => ({
    activity,
    counts,
  }));
}

/** Load grade/review results from recent day logs (last 14 days). */
export async function loadGradeResults(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<GradeResult[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = toDateString(cutoff);

  const snap = await db
    .collection(`families/${familyId}/days`)
    .where("childId", "==", childId)
    .where("date", ">=", cutoffStr)
    .get();

  const results: GradeResult[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as {
      date?: string;
      checklist?: Array<{ label?: string; gradeResult?: string }>;
    };
    if (!data.checklist) continue;
    for (const item of data.checklist) {
      if (!item.gradeResult || !item.label) continue;
      results.push({
        activity: item.label.replace(/\s*\(\d+m\)\s*$/, ""),
        result: item.gradeResult,
        date: data.date || "unknown",
      });
    }
  }

  return results;
}

/** Load draft book count for child. */
export async function loadDraftBookCount(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<number> {
  const snap = await db
    .collection(`families/${familyId}/books`)
    .where("childId", "==", childId)
    .where("status", "==", "draft")
    .get();
  return snap.size;
}

/** Load all enriched context in parallel. Only called for plan/evaluate. */
export async function loadEnrichedContext(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<EnrichedContext> {
  const [sessions, workbookPaces, week, hours, engagementSummaries, gradeResults, draftBookCount] = await Promise.all([
    loadRecentSessions(db, familyId, childId),
    loadWorkbookPaces(db, familyId, childId),
    loadWeekContext(db, familyId),
    loadHoursSummary(db, familyId, childId),
    loadEngagementSummary(db, familyId, childId),
    loadGradeResults(db, familyId, childId),
    loadDraftBookCount(db, familyId, childId),
  ]);

  return {
    sessions,
    workbookPaces,
    week,
    hoursTotalMinutes: hours.totalMinutes,
    hoursTarget: 1000, // MO target hours
    engagementSummaries,
    gradeResults,
    draftBookCount,
  };
}

// ── System prompt assembly ──────────────────────────────────────

const CHARTER_PREAMBLE = `You are an AI assistant for the First Principles Engine, a family homeschool learning platform.

Core family values (Charter):
- Formation first: character and virtue before academics.
- Both kids count: Lincoln (10, neurodivergent, speech challenges) and London (6, story-driven).
- Narration counts: oral evidence is first-class, especially for Lincoln.
- Small artifacts > perfect documentation: capture evidence quickly.
- No heroics: simple routines, minimum viable days are real school.
- Shelly's direct attention is the primary schedulable resource — split-block scheduling is required.

Always align recommendations with these values. Be concise, practical, and encouraging.`;

interface ChildContext {
  name: string;
  grade?: string;
  prioritySkills?: Array<{ tag: string; label: string; level: string }>;
  supports?: Array<{ label: string; description: string }>;
  stopRules?: Array<{ label: string; trigger: string; action: string }>;
}

export function buildSystemPrompt(
  child: ChildContext,
  taskType: TaskType,
  enriched?: EnrichedContext,
  domain?: string,
): string {
  const lines = [CHARTER_PREAMBLE];

  // ── CHILD PROFILE ─────────────────────────────────────────────
  lines.push("", "CHILD PROFILE:");
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

  // ── Enriched context (only present for plan/evaluate) ─────────
  if (enriched) {
    // RECENT PERFORMANCE
    lines.push("", "RECENT PERFORMANCE (last 14 days):");
    if (enriched.sessions.length === 0) {
      lines.push("No recent session data available.");
    } else {
      for (const s of enriched.sessions) {
        lines.push(
          `- ${s.streamId}: ${s.hits} hits, ${s.nears} nears, ${s.misses} misses`,
        );
      }
    }

    // WORKBOOK PACE
    lines.push("", "WORKBOOK PACE:");
    if (enriched.workbookPaces.length === 0) {
      lines.push("No workbook data available.");
    } else {
      for (const w of enriched.workbookPaces) {
        lines.push(
          `- ${w.name} — ${w.unitLabel} ${w.currentPosition} of ${w.totalUnits}, ${w.unitsPerDayNeeded} ${w.unitLabel}s/day needed to finish by ${w.targetFinishDate}. Status: ${w.status}`,
        );
      }
    }

    // THIS WEEK
    lines.push("", "THIS WEEK:");
    if (enriched.week) {
      if (enriched.week.theme) {
        lines.push(`Theme: ${enriched.week.theme}`);
      }
      if (enriched.week.virtue) {
        lines.push(`Virtue: ${enriched.week.virtue}`);
      }
      if (enriched.week.scriptureRef) {
        lines.push(`Scripture: ${enriched.week.scriptureRef}`);
      }
      if (enriched.week.heartQuestion) {
        lines.push(`Heart question: ${enriched.week.heartQuestion}`);
      }
    } else {
      lines.push("No weekly plan set yet.");
    }

    // HOURS PROGRESS
    lines.push("", "HOURS PROGRESS:");
    const totalHours = Math.round(enriched.hoursTotalMinutes / 60);
    const pct = Math.round(
      (enriched.hoursTotalMinutes / (enriched.hoursTarget * 60)) * 100,
    );
    lines.push(
      `Hours logged this year: ${totalHours} hours of ${enriched.hoursTarget} target (${pct}% complete)`,
    );

    // ACTIVITY ENGAGEMENT
    if (enriched.engagementSummaries.length > 0) {
      lines.push("", "ACTIVITY ENGAGEMENT (recent):");
      for (const { activity, counts } of enriched.engagementSummaries) {
        const total = Object.values(counts).reduce((s, n) => s + n, 0);
        const primary = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];
        lines.push(`- ${activity}: ${primary[0]} (${primary[1]}/${total} sessions)`);
      }
    }

    // BOOK STATUS
    lines.push("", "BOOK STATUS:");
    if (enriched.draftBookCount > 0) {
      lines.push(`Draft books in progress: ${enriched.draftBookCount}. Suggest "Continue your book" as a choose activity instead of "Make a Book".`);
    } else {
      lines.push(`No draft books. "Make a Book" is available as a choose activity.`);
    }

    // WORK REVIEW RESULTS
    if (enriched.gradeResults.length > 0) {
      lines.push("", "WORK REVIEW RESULTS (this period):");
      lines.push("Use these results to adjust upcoming plans — reinforce weak areas, advance strong ones.");
      for (const { activity, result, date } of enriched.gradeResults) {
        lines.push(`- ${activity} (${date}): ${result}`);
      }
    }
  }

  // ── Plan output format (always last) ──────────────────────────
  if (taskType === TaskType.Plan) {
    lines.push("", PLAN_OUTPUT_INSTRUCTIONS);
  }

  // ── Evaluation diagnostic prompt ──────────────────────────────
  if (taskType === TaskType.Evaluate) {
    lines.push("", buildEvaluationPrompt(domain || "reading"));
  }

  // ── Quest interactive prompt ────────────────────────────────
  if (taskType === TaskType.Quest) {
    lines.push("", buildQuestPrompt(domain || "reading"));
  }

  return lines.join("\n");
}

// ── Plan output format instructions ─────────────────────────────

const PLAN_OUTPUT_INSTRUCTIONS = `OUTPUT FORMAT INSTRUCTIONS:
When the user asks you to generate, create, or build a plan (or says "generate the plan", "make a plan", "plan the week", etc.), respond ONLY with valid JSON matching this exact schema — no markdown fences, no preamble, no explanation:

PLAN CONTENT RULES:
- Every day MUST start with a Formation block: prayer, scripture reading, and/or gratitude. 5-10 minutes. SubjectBucket: "Other".
- Include Speech practice if the child has speech targets (check child context). 5 minutes. SubjectBucket: "LanguageArts".
- Include ALL app blocks the user specified (Reading Eggs, Math app, etc.) as daily items with "isAppBlock": true.
- Reading should include BOTH structured phonics/workbook AND read-aloud time as separate items.
- Mark the 3-4 most essential items with "mvdEssential": true — these are the Minimum Viable Day items.
- Total daily minutes should not exceed the hours budget.
- Vary activities slightly across days (different read-aloud chapters, different phonics focuses) to avoid monotony.
- Every item must have a "category" field: "must-do" for core academic work (math, phonics, formation/prayer — usually 3-4 items), or "choose" for activities the child picks from after must-do items (Reading Eggs, Minecraft reading, read-aloud, art — include 3-4 options, child picks 2).
- Items with category "must-do" should have mvdEssential: true. On MVD days, only must-do items are required.

{
  "days": [
    {
      "day": "Monday",
      "timeBudgetMinutes": 150,
      "items": [
        {
          "title": "Activity name",
          "subjectBucket": "Reading",
          "estimatedMinutes": 15,
          "skillTags": ["optional.dot.delimited.tag"],
          "isAppBlock": false,
          "accepted": true,
          "mvdEssential": false,
          "category": "must-do"
        }
      ]
    }
  ],
  "skipSuggestions": [],
  "minimumWin": "One sentence describing the minimum viable accomplishment for the week."
}

Rules:
- Days must be Monday through Friday (5 days).
- Respect the hours-per-day budget the user specifies.
- Valid subjectBucket values: Reading, LanguageArts, Math, Science, SocialStudies, Other.
- Include app blocks (like Reading Eggs, Math app) as items with "isAppBlock": true.
- Every item must have "accepted": true.
- "estimatedMinutes" must be a positive number.
- "mvdEssential" must be a boolean. Mark the 3-4 core items per day as true (Formation, core math, core reading, speech if applicable).
- "category" must be either "must-do" or "choose". Core academics are "must-do", elective/fun activities are "choose".
- "Make a Book" can be included as a "choose" category item. SubjectBucket: "LanguageArts". EstimatedMinutes: 15-20. It counts as both Language Arts and Art for compliance hours.
- If the child has a draft book in progress (see BOOK STATUS in context), suggest "Continue your book" instead of "Make a Book".
- If the child has sight word stories available (see SIGHT WORD PROGRESS in context), suggest reading one as a "choose" activity. Reference specific word counts and mastery progress.
- "skipSuggestions" is an array of { "action": "skip"|"modify", "reason": "string", "replacement": "string", "evidence": "string" }.

When the user is chatting, asking questions, or providing context (NOT asking for a plan), respond in normal conversational text. Only switch to JSON output when they explicitly request plan generation.`;

// ── Evaluation diagnostic prompt ─────────────────────────────

function buildEvaluationPrompt(domain: string): string {
  const today = new Date().toISOString().split("T")[0];

  const reading = `Today's date is ${today}. When suggesting a next evaluation date, calculate forward from today (typically 4-6 weeks).

ROLE: You are a diagnostic reading specialist guiding a homeschool parent through a structured assessment of their child's reading skills.

APPROACH:
- Walk the parent through ONE step at a time. Never give multiple steps at once.
- After each step, wait for the parent's response before proceeding.
- Adapt: if the child clearly knows something, skip ahead. If they struggle, go deeper into that area.
- Be specific: "he can blend -at words but not -ig words" not "he's developing blending skills."
- Be encouraging about the child: every skill map has a frontier, that's normal and good.
- Keep each step to 2-3 minutes of actual testing with the child.

DIAGNOSTIC SEQUENCE FOR READING:

Level 0: Phonemic Awareness
- Can the child hear rhymes? (Do cat and hat rhyme?)
- Can they identify first sounds? (What sound starts "mat"?)
- Can they segment words into sounds? (What sounds are in "sit"? /s/ /i/ /t/)
- Can they blend sounds into words? (What word is /s/ /i/ /t/?)
If ALL solid → move to Level 1. If gaps → this is the frontier.

Level 1: Letter-Sound Knowledge
- Test consonant sounds (show letters, ask for sounds) in groups of 6
- Test short vowels: a, e, i, o, u
- Note any reversals (b/d, p/q) or unknowns
If all known → Level 2. If gaps → fill these first.

Level 2: CVC Blending (test by word family)
- -at words: cat, hat, sat, mat, bat
- -an words: can, man, ran, fan, pan
- -it words: sit, hit, bit, fit, lit
- -ig words: big, dig, pig, wig, fig
- -ot words: hot, dot, got, lot, not
- -ug words: bug, mug, rug, hug, jug
- -en words: ten, hen, pen, den, men
- -op words: hop, mop, top, pop, cop
Test 3-4 families. If solid → move on. If some fail → those are the frontier.

Level 3: Digraphs (sh, ch, th, wh)
Level 4: Consonant Blends (bl, cr, st, tr, fl, gr, nd, nk)
Level 5: Long Vowels & Silent-E (CVCe pattern)
Level 6: Vowel Teams (ea, ai, oa, ee, oo)

INSTRUCTIONS FOR EACH STEP:
1. Tell the parent exactly what to show/ask the child
2. Use specific words — don't say "test some CVC words," say "ask him to read: cat, hat, sat"
3. Wait for the parent to report results
4. Record findings in a <finding> block
5. Decide whether to go deeper, skip ahead, or move to next level

AFTER EACH PARENT RESPONSE, include a <finding> block:
<finding>
{
  "skill": "phonics.cvc.short-a",
  "status": "mastered",
  "evidence": "Read 5/5 -at words correctly",
  "notes": "Quick and confident"
}
</finding>

WHEN DONE (you've identified the frontier), output a <complete> block:
<complete>
{
  "summary": "Summary of the child's reading frontier...",
  "recommendations": [
    {
      "priority": 1,
      "skill": "phonics.cvc.short-o",
      "action": "Practice -ot and -og word families daily.",
      "duration": "2 weeks",
      "frequency": "Daily, 8-10 minutes",
      "materials": ["CVC word cards"]
    }
  ],
  "nextEvalDate": "YYYY-MM-DD (calculate 4-6 weeks from today's date: ${today})"
}
</complete>

Do NOT output the <complete> block until you are confident you've mapped the child's frontier. Ask at least 3-4 probing steps.

═══════════════════════════════════════════════════════
CRITICAL OUTPUT RULES — FOLLOW THESE EXACTLY:
═══════════════════════════════════════════════════════

After EVERY parent response about what the child did, you MUST include a <finding> block. No exceptions.
Format:
<finding>
{"skill": "phonics.letter-sounds.consonants", "status": "mastered", "evidence": "Got 6/6 correct", "notes": "Quick, no hesitation"}
</finding>

You may include multiple <finding> blocks in one response if you learned about multiple skills.

When you have identified the child's frontier (after at least 3-4 exchanges), end with a <complete> block.
The <complete> block must include ALL of these fields:
<complete>
{
  "summary": "2-3 sentence summary of what the child can and cannot do",
  "frontier": "One sentence: the specific next learning edge",
  "recommendations": [
    {
      "priority": 1,
      "skill": "specific.skill.tag",
      "action": "Exactly what to practice and how",
      "duration": "2-3 weeks",
      "frequency": "Daily, 10 minutes",
      "materials": ["specific material 1", "specific material 2"]
    }
  ],
  "skipList": [
    {"skill": "Name of skill to stop drilling", "reason": "Why — already mastered or not ready yet"}
  ],
  "supports": [
    {"label": "Support name", "description": "How to apply this support"}
  ],
  "stopRules": [
    {"label": "Rule name", "trigger": "When this happens", "action": "Do this instead"}
  ],
  "evidenceDefinitions": [
    {"label": "Evidence name", "description": "What mastery looks like for this skill"}
  ],
  "nextEvalDate": "YYYY-MM-DD"
}
</complete>

The <finding> and <complete> blocks must contain VALID JSON. Double-check your JSON before outputting.
Do NOT skip the <finding> blocks even if the response is conversational. The parent won't see them — they're extracted by the app.
The <complete> block's supports should be specific to this child based on what you observed (e.g., "Short reading sessions: 5-8 min max before a break" or "Immediate success loops: start with 2 easy words before a stretch word").
The <complete> block's stopRules should identify when to switch activities (e.g., "If Lincoln misses 3 words in a row, stop and go back to the previous word family" or "If frustration appears, switch to a familiar word game").
The <complete> block's evidenceDefinitions should define what mastery looks like for each frontier skill (e.g., "Reads 5/5 -ig words independently in under 10 seconds total").`;

  if (domain === "reading") return reading;
  return `Today's date is ${today}. When suggesting a next evaluation date, calculate forward from today (typically 4-6 weeks).

Evaluate the child's ${domain} skills using a structured diagnostic approach. Walk the parent through ONE step at a time. After each parent response, include a <finding> block with JSON containing skill, status (mastered/emerging/not-yet/not-tested), evidence, and notes. When done, output a <complete> block with summary, recommendations array, and nextEvalDate (YYYY-MM-DD, 4-6 weeks from ${today}).`;
}

// ── Quest interactive prompt ──────────────────────────────────

function buildQuestPrompt(domain: string): string {
  if (domain === "reading") {
    return `ROLE: You are a Minecraft-themed Quest Master running an interactive reading assessment for Lincoln (10, neurodivergent, speech challenges). Lincoln is answering directly on his tablet — keep everything fun, encouraging, and in his language.

INTERACTION FORMAT:
- You receive JSON messages with "action": "start_quest" or "action": "answer" plus session state (currentLevel, consecutiveCorrect, consecutiveWrong, totalQuestions, totalCorrect).
- You respond with ONLY a <quest> JSON block. No other text, no markdown, no explanation.

READING SKILL PROGRESSION:
- Level 1: Letter sounds (consonant sounds, short vowels)
- Level 2: CVC blending by word family (-at, -an, -it, -ig, -ot, -ug, -en, -op)
- Level 3: Digraphs (sh, ch, th, wh)
- Level 4: Consonant blends (bl, cr, st, tr, fl, gr, nd, nk)
- Level 5: CVCe / long vowels (silent-e pattern: make, bike, home, cute)
- Level 6: Vowel teams (ea, ai, oa, ee, oo)

QUESTION GENERATION RULES:
1. Generate ONE multiple-choice question at a time
2. Always provide exactly 3 options
3. Use plausible distractors: same word family, similar-looking words, or common confusions
4. Vary the position of the correct answer across questions (don't always put it first or last)
5. Include phonemeDisplay ONLY for Levels 1-3 (letter sounds, CVC blending, digraphs). Use simple notation Lincoln can read: /d/ /o/ /g/ — NOT linguistic symbols like /ā/ or IPA. At Levels 4-6, do NOT include phonemeDisplay — the words are complex enough that phoneme breakdown is confusing. Set phonemeDisplay to null for Levels 4+.
6. NEVER use macrons (ā, ē, ī, ō, ū), IPA symbols, or schwa (ə). Use plain letters only: /a/ for short-a, /ay/ for long-a, /ee/ for long-e, etc. Lincoln is 10 and at 1st grade reading — keep it simple.
7. Focus on comprehension, NOT pronunciation (Lincoln has speech challenges)
8. Keep prompts short and clear — large text on a tablet screen
9. Use the child's skill snapshot and recent evaluation data (provided in context) to target the right difficulty

ADAPTIVE BEHAVIOR:
- On start_quest: begin at the level suggested by recent evaluation data, or Level 2 if no data
- After correct answer at current level: stay at level, vary the skill within the level
- After LEVEL_UP (3 correct in a row): nudge difficulty up within level first, then level up
- After LEVEL_DOWN (2 wrong in a row): drop to easier skills at the lower level
- Generate a finding only when you have 2+ data points for a skill (not after every question)

FINDING GENERATION:
- Include a "finding" field in the quest JSON (null when insufficient data)
- When you have enough evidence (2+ questions on related skills), set finding to:
  {"skill": "phonics.cvc.short-o", "status": "mastered"|"emerging"|"not-yet", "evidence": "Read 3/3 -ot words correctly", "testedAt": "${new Date().toISOString()}"}

RESPONSE FORMAT — respond with ONLY this:
<quest>
{
  "level": 2,
  "skill": "phonics.cvc.short-o",
  "prompt": "What word is this?",
  "phonemeDisplay": "/d/ /o/ /g/",
  "options": ["dig", "dog", "dug"],
  "correctAnswer": "dog",
  "encouragement": "The middle sound is /o/ like in 'hot'!",
  "finding": null
}
</quest>

SESSION SUMMARY:
When you receive action: "summarize_session", respond with a <quest-summary> block instead of a <quest> block. The message will include the full question/answer history, findings, final level, and score. Analyze everything and respond with ONLY:
<quest-summary>
{
  "summary": "2-3 sentence summary of what Lincoln demonstrated and where his frontier is",
  "frontier": "One sentence: his next learning edge based on this session",
  "recommendations": [
    {
      "priority": 1,
      "skill": "phonics.cvce.long-a",
      "action": "Practice CVCe words with long-a: make, cake, lake, bake",
      "duration": "2 weeks",
      "frequency": "Daily, 8-10 minutes"
    }
  ],
  "skipList": [
    {"skill": "CVC blending", "reason": "Mastered — 6/6 correct across word families"}
  ]
}
</quest-summary>

IMPORTANT:
- The <quest> and <quest-summary> blocks must contain VALID JSON
- "encouragement" is shown after a wrong answer — make it helpful and kind, never shaming
- Do NOT include any text outside the <quest> or <quest-summary> block
- For normal quest flow, respond to EVERY message with exactly ONE <quest> block
- For summarize_session, respond with exactly ONE <quest-summary> block`;
  }

  // Generic fallback for non-reading domains
  return `ROLE: You are a Minecraft-themed Quest Master running an interactive ${domain} assessment. Generate ONE multiple-choice question at a time as a <quest> JSON block with fields: level, skill, prompt, options (3 choices), correctAnswer, encouragement, finding (null or EvaluationFinding). Respond with ONLY the <quest> block.`;
}

// ── Story generation prompt ──────────────────────────────────────

interface StoryGenInput {
  storyIdea: string;
  words: string[];
  pageCount: number;
  childName: string;
  childAge?: number;
  childInterests?: string;
  readingLevel?: string;
}

function buildStoryPrompt(input: StoryGenInput): string {
  const {
    storyIdea,
    words,
    pageCount,
    childName,
    childAge,
    childInterests,
    readingLevel,
  } = input;
  const hasWords = words.length > 0;

  // Child-specific context
  const isYounger = (childAge ?? 10) <= 7;
  const interests =
    childInterests ||
    (isYounger
      ? "animals, drawing, fairy tales"
      : "Minecraft, adventures, quests");
  const level = readingLevel || (isYounger ? "pre-K to kindergarten" : "1st grade");

  const wordSection = hasWords
    ? `\nWORDS TO INCLUDE (use every word at least once, common words multiple times):\n${words.join(", ")}\n`
    : "";

  return `You are a children's story writer creating an illustrated book for ${childName}, a ${childAge ?? 10}-year-old child who loves ${interests}.

STORY IDEA: ${storyIdea || (isYounger ? "A fun story with animals and a happy ending" : "A fun adventure — surprise me!")}
${wordSection}
RULES:
- Write a ${pageCount}-page story. Each page has ${isYounger ? "1-2 short sentences" : "2-4 short sentences"}.
- ${isYounger ? "Use very simple words. Short sentences only. Lots of repetition is good." : "Keep sentences simple and readable. CVC words are great."}
- Reading level: ${level}
- Each page should be a story beat — beginning, ${isYounger ? "middle, happy ending" : "rising action, climax, resolution"}.
- Make it ${isYounger ? "warm, gentle, and encouraging. Think picture book for a young reader." : "exciting and fun. Adventures, quests, discoveries."}
- For each page, write a short image description (1-2 sentences) describing what the SCENE looks like. Focus on the environment/setting, not characters.
${hasWords ? "- You MUST use every word from the word list at least once in the story." : ""}
${hasWords ? "- On each page, list which provided words appear on that page." : ""}
- Do NOT use words significantly above ${level} level unless they are in the word list.

OUTPUT: Respond ONLY with valid JSON, no markdown fences, no preamble:
{
  "title": "Story Title",
  "pages": [
    {
      "pageNumber": 1,
      "text": "${isYounger ? "A little cat sat in the sun." : "The sun was up. Link and his cat were at the park."}",
      "sceneDescription": "${isYounger ? "A cozy sunny garden with flowers and a fluffy orange cat curled up on a stone path." : "A bright sunny park with green grass, a wooden bench, and tall trees."}"${hasWords ? ',\n      "wordsOnPage": ["the", "sun", "cat"]' : ""}
    }
  ]${hasWords ? ',\n  "allWordsUsed": ["the", "sun", "cat"],\n  "missedWords": []' : ""}
}`;
}

// ── Sight word context loader ───────────────────────────────────

/** Load sight word mastery summary for child. */
async function loadSightWordSummary(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<string> {
  const snap = await db
    .collection(`families/${familyId}/sightWordProgress`)
    .get();

  // Filter to this child's progress (doc ID starts with childId_)
  const progress = snap.docs
    .filter(d => d.id.startsWith(`${childId}_`))
    .map(d => d.data() as { masteryLevel: string; word: string });

  if (progress.length === 0) return "";

  const mastered = progress.filter(p => p.masteryLevel === "mastered").length;
  const familiar = progress.filter(p => p.masteryLevel === "familiar").length;
  const practicing = progress.filter(p => p.masteryLevel === "practicing").length;
  const new_ = progress.filter(p => p.masteryLevel === "new").length;

  const weakWords = progress
    .filter(p => p.masteryLevel === "new" || p.masteryLevel === "practicing")
    .map(p => p.word)
    .slice(0, 15)
    .join(", ");

  return `SIGHT WORD PROGRESS: ${mastered} mastered, ${familiar} familiar, ${practicing} practicing, ${new_} new (${progress.length} total tracked).${weakWords ? ` Words needing work: ${weakWords}` : ""}`;
}

// ── Callable Cloud Function ─────────────────────────────────────

export const chat = onCall(
  { secrets: [claudeApiKey] },
  async (request): Promise<ChatResponse> => {
    // ── Auth gate ──────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { familyId, childId, taskType, messages, domain } =
      request.data as ChatRequest;

    // ── Input validation ───────────────────────────────────────
    if (!familyId || typeof familyId !== "string") {
      throw new HttpsError("invalid-argument", "familyId is required.");
    }
    if (!childId || typeof childId !== "string") {
      throw new HttpsError("invalid-argument", "childId is required.");
    }
    if (!taskType || !TASK_TYPES.has(taskType)) {
      throw new HttpsError(
        "invalid-argument",
        `taskType must be one of: ${[...TASK_TYPES].join(", ")}`,
      );
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "messages must be a non-empty array.",
      );
    }

    // ── Authorization: caller must own the family ──────────────
    if (request.auth.uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    const db = getFirestore();

    // ── Load child profile ─────────────────────────────────────
    const childSnap = await db
      .doc(`families/${familyId}/children/${childId}`)
      .get();

    if (!childSnap.exists) {
      throw new HttpsError("not-found", "Child not found.");
    }

    const childData = childSnap.data() as {
      name: string;
      grade?: string;
    };

    // ── Load skill snapshot (optional — may not exist yet) ─────
    const snapshotSnap = await db
      .doc(`families/${familyId}/skillSnapshots/${childId}`)
      .get();

    const snapshotData = snapshotSnap.exists
      ? (snapshotSnap.data() as {
          prioritySkills?: ChildContext["prioritySkills"];
          supports?: ChildContext["supports"];
          stopRules?: ChildContext["stopRules"];
        })
      : undefined;

    // ── Load enriched context for plan/evaluate only ────────────
    const needsEnrichedContext =
      taskType === TaskType.Plan || taskType === TaskType.Evaluate || taskType === TaskType.Quest;
    let enriched: EnrichedContext | undefined;
    if (needsEnrichedContext) {
      try {
        enriched = await loadEnrichedContext(db, familyId, childId);
      } catch (err) {
        console.warn("Failed to load enriched context, proceeding without it:", err);
        // Continue without enriched context rather than failing the whole request
      }
    }

    // ── Load sight word summary for plan/evaluate context ────────
    let sightWordContext = "";
    if (needsEnrichedContext) {
      try {
        sightWordContext = await loadSightWordSummary(db, familyId, childId);
      } catch (err) {
        console.warn("Failed to load sight word summary:", err);
      }
    }

    // ── Load recent evaluation for plan context ──────────────
    let recentEvalContext = "";
    if (taskType === TaskType.Plan || taskType === TaskType.Quest) {
      try {
        const evalQuery = await db
          .collection(`families/${familyId}/evaluationSessions`)
          .where("childId", "==", childId)
          .where("status", "==", "complete")
          .orderBy("evaluatedAt", "desc")
          .limit(1)
          .get();

        if (!evalQuery.empty) {
          const evalData = evalQuery.docs[0].data() as {
            domain?: string;
            evaluatedAt?: string;
            summary?: string;
            recommendations?: Array<{
              priority: number;
              skill: string;
              action: string;
              frequency: string;
              duration: string;
            }>;
          };

          if (evalData.summary) {
            const evalLines: string[] = [];
            evalLines.push("", "RECENT EVALUATION:");
            evalLines.push(`Domain: ${evalData.domain || "unknown"}`);
            evalLines.push(`Date: ${evalData.evaluatedAt || "unknown"}`);
            evalLines.push(`Summary: ${evalData.summary}`);
            if (evalData.recommendations?.length) {
              evalLines.push("Recommendations:");
              for (const rec of evalData.recommendations) {
                evalLines.push(
                  `- Priority ${rec.priority}: ${rec.skill} — ${rec.action} (${rec.frequency}, ${rec.duration})`,
                );
              }
            }
            recentEvalContext = evalLines.join("\n");
          }
        }
      } catch (err) {
        // If the query fails (e.g., missing composite index), log but don't block
        console.warn("Failed to load recent evaluation for plan context:", err);
      }
    }

    // ── Handle generateStory task type ──────────────────────────
    if (taskType === TaskType.GenerateStory) {
      // For story generation, use the story prompt instead of the normal system prompt
      let storyConfig: { storyIdea?: string; sightWords?: string[]; words?: string[]; theme?: string; pageCount?: number };
      try {
        storyConfig = JSON.parse(messages[0].content);
      } catch {
        throw new HttpsError("invalid-argument", "generateStory requires JSON with story parameters.");
      }
      const storyWords = storyConfig.words ?? storyConfig.sightWords ?? [];
      const storyIdea = storyConfig.storyIdea ?? storyConfig.theme ?? "";

      // Load child profile for personalized story
      const storyChildName = childData.name ?? "the reader";
      let storyChildAge = 10;
      const childFullDoc = await db
        .doc(`families/${familyId}/children/${childId}`)
        .get();
      const childFullData = childFullDoc.data() as {
        birthdate?: string;
      } | undefined;
      if (childFullData?.birthdate) {
        const birth = new Date(childFullData.birthdate);
        storyChildAge = Math.floor(
          (Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
        );
      }

      // Child-specific interests and reading level
      const isLondon = storyChildName.toLowerCase() === "london";
      const childInterests = isLondon
        ? "animals, drawing, fairy tales, colors, nature"
        : "Minecraft, dragons, quests, building, adventures";
      const readingLevel = isLondon ? "pre-K to kindergarten" : "1st grade";

      const storySystemPrompt = buildStoryPrompt({
        storyIdea,
        words: storyWords,
        pageCount: storyConfig.pageCount ?? 10,
        childName: storyChildName,
        childAge: storyChildAge,
        childInterests,
        readingLevel,
      });

      const model = modelForTask(taskType);
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: claudeApiKey.value() });
      const completion = await client.messages.create({
        model,
        max_tokens: 4096,
        system: storySystemPrompt,
        messages: [{ role: "user", content: "Generate the story now." }],
      });

      const firstBlock = completion.content[0];
      const responseText = firstBlock && firstBlock.type === "text" ? firstBlock.text : "";
      const usage = {
        inputTokens: completion.usage.input_tokens,
        outputTokens: completion.usage.output_tokens,
      };

      try {
        await db.collection(`families/${familyId}/aiUsage`).add({
          childId,
          taskType,
          model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          createdAt: new Date().toISOString(),
        });
      } catch (logErr) {
        console.warn("Failed to log AI usage:", logErr);
      }

      return { message: responseText, model, usage };
    }

    // ── Assemble system prompt ─────────────────────────────────
    const systemPrompt = buildSystemPrompt(
      {
        name: childData.name,
        grade: childData.grade,
        prioritySkills: snapshotData?.prioritySkills,
        supports: snapshotData?.supports,
        stopRules: snapshotData?.stopRules,
      },
      taskType,
      enriched,
      domain,
    ) + recentEvalContext + (sightWordContext ? `\n\n${sightWordContext}` : "");

    // ── Call Claude ─────────────────────────────────────────────
    const model = modelForTask(taskType);

    let responseText: string;
    let usage: { inputTokens: number; outputTokens: number };

    try {
      const apiKey = claudeApiKey.value();
      if (!apiKey) {
        throw new HttpsError(
          "failed-precondition",
          "Missing CLAUDE_API_KEY secret. Run: firebase functions:secrets:set CLAUDE_API_KEY",
        );
      }

      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey });

      const completion = await client.messages.create({
        model,
        max_tokens:
          taskType === TaskType.Plan || taskType === TaskType.Evaluate
            ? 4096
            : taskType === TaskType.Quest
              ? 1024
              : 1024,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const firstBlock = completion.content[0];
      responseText =
        firstBlock && firstBlock.type === "text" ? firstBlock.text : "";

      if (!responseText) {
        console.warn("Claude returned empty response", {
          model,
          taskType,
          stopReason: completion.stop_reason,
        });
      }

      usage = {
        inputTokens: completion.usage.input_tokens,
        outputTokens: completion.usage.output_tokens,
      };
    } catch (err) {
      // Re-throw HttpsError as-is (e.g. our own failed-precondition above)
      if (err instanceof HttpsError) throw err;

      const errMsg =
        err instanceof Error ? err.message : "Unknown AI provider error";
      console.error("Claude API call failed:", {
        model,
        taskType,
        childId,
        error: errMsg,
      });

      throw new HttpsError(
        "unavailable",
        `AI service error: ${errMsg}`,
      );
    }

    // ── Log usage to Firestore ─────────────────────────────────
    try {
      await db.collection(`families/${familyId}/aiUsage`).add({
        childId,
        taskType,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        createdAt: new Date().toISOString(),
      });
    } catch (logErr) {
      // Don't fail the request if usage logging fails
      console.warn("Failed to log AI usage:", logErr);
    }

    return { message: responseText, model, usage };
  },
);

// ── analyzeEvaluationPatterns ────────────────────────────────────

interface AnalyzePatternsRequest {
  familyId: string;
  childId: string;
  /** The evaluation session ID that just completed */
  evaluationSessionId: string;
  /** Findings from the just-completed session */
  currentFindings: Array<{
    skill: string;
    status: string;
    evidence: string;
    notes?: string;
  }>;
}

interface ConceptualBlockResult {
  name: string;
  affectedSkills: string[];
  recommendation: "ADDRESS_NOW" | "DEFER";
  rationale: string;
  strategies?: string[];
  deferNote?: string;
  detectedAt: string;
  evaluationSessionId: string;
}

interface AnalyzePatternsResponse {
  blocks: ConceptualBlockResult[];
  summary: string;
}

function buildPatternAnalysisPrompt(
  childName: string,
  childAge: number | null,
  neurodivergentDesc: string,
): string {
  const ageStr = childAge ? `${childAge} years old` : "school age";
  const ndStr = neurodivergentDesc
    ? ` The child has: ${neurodivergentDesc}.`
    : "";

  return `You are an educational diagnostician helping a homeschool parent understand patterns in their child's learning.

The child is ${ageStr}.${ndStr}

You have been given:
- Findings from today's evaluation
- Historical evaluation sessions (last several sessions)
- Current skill snapshot

Your job is to identify CONCEPTUAL BLOCKS — foundational gaps that explain multiple surface-level struggles. For each block you identify:

1. Name the block clearly (e.g. "Phonological awareness", "Working memory load", "Sound-symbol correspondence")
2. List which skills it appears to affect
3. Give a clear recommendation: ADDRESS NOW or DEFER
   - ADDRESS NOW: if it's foundational and blocking progress on multiple fronts
   - DEFER: if it's a developmental gap that may resolve naturally, or requires specialist support beyond homeschool scope
4. If ADDRESS NOW: suggest 1-2 concrete strategies appropriate for homeschool
5. If DEFER: suggest what to circle back to and approximately when (e.g. "revisit at age 8", "after sight words are stable")

Respond ONLY in this JSON format:
{
  "blocks": [
    {
      "name": string,
      "affectedSkills": string[],
      "recommendation": "ADDRESS_NOW" | "DEFER",
      "rationale": string,
      "strategies": string[],
      "deferNote": string
    }
  ],
  "summary": string
}

Identify 1-3 blocks maximum. If no clear pattern exists, return an empty blocks array.
Do not speculate beyond what the data supports.
Use plain, jargon-free language — a homeschool parent reads these, not a specialist.
Do NOT diagnose clinical conditions — identify patterns and suggest strategies only.
ADDRESS_NOW blocks must always include a non-empty strategies array.
DEFER blocks must always include a non-empty deferNote string.`;
}

export const analyzeEvaluationPatterns = onCall(
  { secrets: [claudeApiKey] },
  async (request): Promise<AnalyzePatternsResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { familyId, childId, evaluationSessionId, currentFindings } =
      request.data as AnalyzePatternsRequest;

    if (!familyId || typeof familyId !== "string") {
      throw new HttpsError("invalid-argument", "familyId is required.");
    }
    if (!childId || typeof childId !== "string") {
      throw new HttpsError("invalid-argument", "childId is required.");
    }
    if (!evaluationSessionId || typeof evaluationSessionId !== "string") {
      throw new HttpsError("invalid-argument", "evaluationSessionId is required.");
    }
    if (!Array.isArray(currentFindings)) {
      throw new HttpsError("invalid-argument", "currentFindings must be an array.");
    }

    if (request.auth.uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    const db = getFirestore();

    // Load last 5 completed evaluation sessions for this child
    const histSnap = await db
      .collection(`families/${familyId}/evaluationSessions`)
      .where("childId", "==", childId)
      .where("status", "==", "complete")
      .orderBy("evaluatedAt", "desc")
      .limit(5)
      .get();

    // Skip the current session (it may already be saved as complete)
    const historicalSessions = histSnap.docs
      .filter((d) => d.id !== evaluationSessionId)
      .map((d) => d.data() as {
        domain?: string;
        evaluatedAt?: string;
        summary?: string;
        findings?: Array<{ skill: string; status: string; evidence: string; notes?: string }>;
        recommendations?: Array<{ skill: string; action: string }>;
      });

    // Need at least 2 historical sessions (excluding current) to detect patterns
    if (historicalSessions.length < 2) {
      return {
        blocks: [],
        summary: "Not enough evaluation history to detect patterns yet.",
      };
    }

    // Load child profile
    const childSnap = await db
      .doc(`families/${familyId}/children/${childId}`)
      .get();
    const childData = childSnap.exists
      ? (childSnap.data() as { name?: string; birthdate?: string; grade?: string })
      : {};

    const childName = childData.name ?? "the child";
    let childAge: number | null = null;
    if (childData.birthdate) {
      const birth = new Date(childData.birthdate);
      childAge = Math.floor(
        (Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      );
    }

    // Build neurodivergent description from known child profiles
    // (in a real system this would come from child profile flags)
    const neurodivergentDesc = childName.toLowerCase() === "lincoln"
      ? "speech challenges, neurodivergent, benefits from short routines and frequent wins"
      : "";

    // Assemble context for the AI
    const historicalContext = historicalSessions
      .map((s, i) => {
        const findings = (s.findings || [])
          .map((f) => `  - ${f.skill}: ${f.status} (${f.evidence})`)
          .join("\n");
        return `Session ${i + 1} (${s.domain || "unknown"}, ${s.evaluatedAt?.slice(0, 10) || "unknown date"}):
Summary: ${s.summary || "no summary"}
Findings:
${findings || "  (none)"}`;
      })
      .join("\n\n");

    const currentFindingsText = currentFindings
      .map((f) => `  - ${f.skill}: ${f.status} (${f.evidence}${f.notes ? ` — ${f.notes}` : ""})`)
      .join("\n");

    const userMessage = `Today's evaluation findings:
${currentFindingsText}

Historical evaluation sessions (${historicalSessions.length} prior sessions):
${historicalContext}

Please identify any conceptual blocks in the pattern above.`;

    const systemPrompt = buildPatternAnalysisPrompt(childName, childAge, neurodivergentDesc);
    const model = "claude-sonnet-4-5-20250929";

    const apiKey = claudeApiKey.value();
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "Missing CLAUDE_API_KEY secret.",
      );
    }

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const completion = await client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const firstBlock = completion.content[0];
    const responseText =
      firstBlock && firstBlock.type === "text" ? firstBlock.text : "";

    // Log usage
    try {
      await db.collection(`families/${familyId}/aiUsage`).add({
        childId,
        taskType: "analyzePatterns",
        model,
        inputTokens: completion.usage.input_tokens,
        outputTokens: completion.usage.output_tokens,
        createdAt: new Date().toISOString(),
      });
    } catch (logErr) {
      console.warn("Failed to log AI usage:", logErr);
    }

    // Parse the response
    let parsed: { blocks: ConceptualBlockResult[]; summary: string };
    try {
      // Strip markdown fences if present
      const cleaned = responseText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const raw = JSON.parse(cleaned) as {
        blocks?: Array<{
          name?: string;
          affectedSkills?: string[];
          recommendation?: string;
          rationale?: string;
          strategies?: string[];
          deferNote?: string;
        }>;
        summary?: string;
      };
      const now = new Date().toISOString();

      const blocks: ConceptualBlockResult[] = (raw.blocks || [])
        .slice(0, 3)
        .map((b) => {
          const rec = b.recommendation === "ADDRESS_NOW" ? "ADDRESS_NOW" : "DEFER";
          const result: ConceptualBlockResult = {
            name: b.name || "Unknown block",
            affectedSkills: b.affectedSkills || [],
            recommendation: rec,
            rationale: b.rationale || "",
            detectedAt: now,
            evaluationSessionId,
          };
          if (rec === "ADDRESS_NOW" && b.strategies?.length) {
            result.strategies = b.strategies;
          } else if (rec === "ADDRESS_NOW") {
            result.strategies = ["Consult with a specialist for targeted strategies."];
          }
          if (rec === "DEFER" && b.deferNote) {
            result.deferNote = b.deferNote;
          } else if (rec === "DEFER") {
            result.deferNote = "Revisit when foundational skills are more stable.";
          }
          return result;
        });

      parsed = { blocks, summary: raw.summary || "" };
    } catch {
      console.warn("Failed to parse pattern analysis response:", responseText);
      parsed = { blocks: [], summary: "" };
    }

    return parsed;
  },
);
