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

  return lines.join("\n");
}

// ── Plan output format instructions ─────────────────────────────

const PLAN_OUTPUT_INSTRUCTIONS = `OUTPUT FORMAT INSTRUCTIONS:
When the user asks you to generate, create, or build a plan (or says "generate the plan", "make a plan", "plan the week", etc.), respond ONLY with valid JSON matching this exact schema — no markdown fences, no preamble, no explanation:

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
          "accepted": true
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
- "skipSuggestions" is an array of { "action": "skip"|"modify", "reason": "string", "replacement": "string", "evidence": "string" }.

When the user is chatting, asking questions, or providing context (NOT asking for a plan), respond in normal conversational text. Only switch to JSON output when they explicitly request plan generation.`;

// ── Callable Cloud Function ─────────────────────────────────────

export const chat = onCall(
  { secrets: [claudeApiKey] },
  async (request): Promise<ChatResponse> => {
    // ── Auth gate ──────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { familyId, childId, taskType, messages } =
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
    );

    // ── Call Claude ─────────────────────────────────────────────
    const model = modelForTask(taskType);
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: claudeApiKey.value() });

    const completion = await client.messages.create({
      model,
      max_tokens: taskType === TaskType.Plan ? 4096 : 1024,
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
