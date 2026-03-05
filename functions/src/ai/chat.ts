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
      return "claude-sonnet-4-20250514";
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

interface EnrichedContext {
  sessions: SessionSummary[];
  workbookPaces: WorkbookPace[];
  week: WeekContext | null;
  hoursTotalMinutes: number;
  hoursTarget: number;
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

/** Load all enriched context in parallel. Only called for plan/evaluate. */
export async function loadEnrichedContext(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<EnrichedContext> {
  const [sessions, workbookPaces, week, hours] = await Promise.all([
    loadRecentSessions(db, familyId, childId),
    loadWorkbookPaces(db, familyId, childId),
    loadWeekContext(db, familyId),
    loadHoursSummary(db, familyId, childId),
  ]);

  return {
    sessions,
    workbookPaces,
    week,
    hoursTotalMinutes: hours.totalMinutes,
    hoursTarget: 1000, // MO target hours
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
  }

  // ── Plan output format (always last) ──────────────────────────
  if (taskType === TaskType.Plan) {
    lines.push("", PLAN_OUTPUT_INSTRUCTIONS);
  }

  // ── Evaluation diagnostic prompt ──────────────────────────────
  if (taskType === TaskType.Evaluate) {
    lines.push("", buildEvaluationPrompt(domain || "reading"));
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
- "skipSuggestions" is an array of { "action": "skip"|"modify", "reason": "string", "replacement": "string", "evidence": "string" }.

When the user is chatting, asking questions, or providing context (NOT asking for a plan), respond in normal conversational text. Only switch to JSON output when they explicitly request plan generation.`;

// ── Evaluation diagnostic prompt ─────────────────────────────

function buildEvaluationPrompt(domain: string): string {
  const reading = `ROLE: You are a diagnostic reading specialist guiding a homeschool parent through a structured assessment of their child's reading skills.

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
  "nextEvalDate": "YYYY-MM-DD"
}
</complete>

Do NOT output the <complete> block until you are confident you've mapped the child's frontier. Ask at least 3-4 probing steps.`;

  if (domain === "reading") return reading;
  return `Evaluate the child's ${domain} skills using a structured diagnostic approach. Walk the parent through ONE step at a time. After each parent response, include a <finding> block with JSON containing skill, status (mastered/emerging/not-yet/not-tested), evidence, and notes. When done, output a <complete> block with summary, recommendations array, and nextEvalDate.`;
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
      taskType === TaskType.Plan || taskType === TaskType.Evaluate;
    const enriched = needsEnrichedContext
      ? await loadEnrichedContext(db, familyId, childId)
      : undefined;

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
    );

    // ── Call Claude ─────────────────────────────────────────────
    const model = modelForTask(taskType);
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: claudeApiKey.value() });

    const completion = await client.messages.create({
      model,
      max_tokens: taskType === TaskType.Plan || taskType === TaskType.Evaluate ? 4096 : 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const responseText =
      completion.content[0].type === "text" ? completion.content[0].text : "";

    const usage = {
      inputTokens: completion.usage.input_tokens,
      outputTokens: completion.usage.output_tokens,
    };

    // ── Log usage to Firestore ─────────────────────────────────
    await db.collection(`families/${familyId}/aiUsage`).add({
      childId,
      taskType,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      createdAt: new Date().toISOString(),
    });

    return { message: responseText, model, usage };
  },
);
