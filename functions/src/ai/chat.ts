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

function buildSystemPrompt(child: ChildContext, taskType: TaskType): string {
  const lines = [CHARTER_PREAMBLE, "", `Current child: ${child.name}`];

  if (child.grade) {
    lines.push(`Grade: ${child.grade}`);
  }

  if (child.prioritySkills?.length) {
    lines.push("", "Priority skills:");
    for (const s of child.prioritySkills) {
      lines.push(`- ${s.label} (${s.tag}): ${s.level}`);
    }
  }

  if (child.supports?.length) {
    lines.push("", "Available supports:");
    for (const s of child.supports) {
      lines.push(`- ${s.label}: ${s.description}`);
    }
  }

  if (child.stopRules?.length) {
    lines.push("", "Stop rules:");
    for (const r of child.stopRules) {
      lines.push(`- ${r.label}: when "${r.trigger}" → ${r.action}`);
    }
  }

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
