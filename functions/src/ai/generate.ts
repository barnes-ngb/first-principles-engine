import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { claudeApiKey } from "./aiConfig.js";
import { requireEmailAuth } from "./authGuard.js";
import { CHARTER_PREAMBLE } from "./contextSlices.js";
import { sanitizeAndParseJson } from "./sanitizeJson.js";
import { callClaude, logAiUsage } from "./chatTypes.js";
import { modelForTask } from "./chat.js";

// ── Request / Response types ────────────────────────────────────

export interface GenerateRequest {
  familyId: string;
  childId: string;
  activityType: string;
  skillTag: string;
  estimatedMinutes: number;
}

export interface GeneratedActivity {
  title: string;
  objective: string;
  materials: string[];
  steps: string[];
  successCriteria: string[];
}

export interface GenerateResponse {
  activity: GeneratedActivity;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

// ── Child context loaded from Firestore ─────────────────────────

interface ChildProfile {
  name: string;
  grade?: string;
}

interface SkillSnapshotData {
  prioritySkills?: Array<{ tag: string; label: string; level: string }>;
  supports?: Array<{ label: string; description: string }>;
  stopRules?: Array<{ label: string; trigger: string; action: string }>;
}

interface LadderDoc {
  title: string;
  domain?: string;
  rungs: Array<{
    id?: string;
    title: string;
    description?: string;
    order: number;
  }>;
}

interface LadderProgressDoc {
  currentRungId: string;
}

// ── Prompt assembly ─────────────────────────────────────────────

const ACTIVITY_OUTPUT_SCHEMA = `{
  "title": "string — short, kid-friendly activity title",
  "objective": "string — one sentence learning objective",
  "materials": ["string — material or supply needed"],
  "steps": ["string — numbered instruction step"],
  "successCriteria": ["string — observable criterion indicating success"]
}`;

interface PromptContext {
  child: ChildProfile;
  activityType: string;
  skillTag: string;
  estimatedMinutes: number;
  snapshot: SkillSnapshotData | undefined;
  currentRung: { title: string; description?: string } | undefined;
  ladderTitle: string | undefined;
  weekTheme: string | undefined;
  weekVirtue: string | undefined;
  weekStoryTitle: string | undefined;
  weekReadAloud: string | undefined;
}

function buildGenerateSystemPrompt(ctx: PromptContext): string {
  const lines: string[] = [
    CHARTER_PREAMBLE,
    "",
    "## Task",
    "",
    `Generate a ${ctx.activityType} activity for ${ctx.child.name}.`,
    `Target skill: ${ctx.skillTag}`,
    `Duration: ~${ctx.estimatedMinutes} minutes`,
  ];

  if (ctx.child.grade) {
    lines.push(`Grade level: ${ctx.child.grade}`);
  }

  // Ladder context
  if (ctx.ladderTitle && ctx.currentRung) {
    lines.push(
      "",
      "## Current Skill Ladder Position",
      "",
      `Ladder: ${ctx.ladderTitle}`,
      `Current rung: ${ctx.currentRung.title}`,
    );
    if (ctx.currentRung.description) {
      lines.push(`Rung description: ${ctx.currentRung.description}`);
    }
  }

  // Skill snapshot
  if (ctx.snapshot) {
    if (ctx.snapshot.prioritySkills?.length) {
      const matching = ctx.snapshot.prioritySkills.filter(
        (s) =>
          ctx.skillTag.startsWith(s.tag) || s.tag.startsWith(ctx.skillTag),
      );
      if (matching.length > 0) {
        lines.push("", "## Matching Priority Skills", "");
        for (const s of matching) {
          lines.push(`- ${s.label} [${s.tag}]: level=${s.level}`);
        }
      }
    }

    if (ctx.snapshot.supports?.length) {
      lines.push("", "## Available Supports", "");
      for (const s of ctx.snapshot.supports) {
        lines.push(`- ${s.label}: ${s.description}`);
      }
    }

    if (ctx.snapshot.stopRules?.length) {
      lines.push("", "## Stop Rules", "");
      for (const r of ctx.snapshot.stopRules) {
        lines.push(`- ${r.label}: when "${r.trigger}" → ${r.action}`);
      }
    }
  }

  // Weekly theme and story context
  if (ctx.weekTheme || ctx.weekVirtue || ctx.weekStoryTitle || ctx.weekReadAloud) {
    lines.push("", "## Weekly Context", "");
    if (ctx.weekTheme) lines.push(`Theme: "${ctx.weekTheme}"`);
    if (ctx.weekVirtue) lines.push(`Virtue: ${ctx.weekVirtue}`);
    if (ctx.weekStoryTitle) lines.push(`Story: ${ctx.weekStoryTitle}`);
    if (ctx.weekReadAloud) lines.push(`Read-aloud book: ${ctx.weekReadAloud}`);
    lines.push(
      "",
      "Tie the activity to this week's theme/story when the connection is natural.",
      "For example, use the story scenario as context for math problems or the virtue as a discussion thread.",
      "Don't force it if the connection is unnatural.",
    );
  }

  // Output schema
  lines.push(
    "",
    "## Output Format",
    "",
    "Respond with ONLY valid JSON matching this schema (no markdown fences, no commentary):",
    "",
    ACTIVITY_OUTPUT_SCHEMA,
  );

  // Activity-type-specific guidance
  lines.push("", "## Activity Guidelines", "");

  switch (ctx.activityType) {
    case "phonics":
      lines.push(
        "- Focus on phonemic awareness and decoding practice.",
        "- Use multi-sensory approaches (say it, trace it, build it).",
        "- Include 3–5 target words appropriate for the current skill level.",
        "- Keep instructions short and clear — suitable for a child with speech challenges.",
      );
      break;
    case "story-prompt":
      lines.push(
        "- Create an open-ended story starter or creative writing prompt.",
        "- Include visual/drawing elements — this child loves making books.",
        "- Keep the prompt imaginative and age-appropriate.",
        "- Encourage narration as an alternative to writing.",
      );
      break;
    case "math":
      lines.push(
        "- Use concrete, hands-on manipulatives where possible.",
        "- Build in a warm-up review before introducing new concepts.",
        "- Include 5–8 practice problems at the appropriate level.",
        "- Allow oral answers or manipulative demonstration as evidence.",
      );
      break;
    case "reading":
      lines.push(
        "- Select or reference a text at the child's independent/instructional level.",
        "- Include pre-reading vocabulary and comprehension questions.",
        "- Allow narration (oral retelling) as the primary response mode.",
        "- Keep the reading passage short and engaging.",
      );
      break;
    default: {
      // Determine a reasonable approach based on the activity type string
      const lowerType = ctx.activityType.toLowerCase();
      if (
        lowerType.includes("formation") ||
        lowerType.includes("prayer") ||
        lowerType.includes("scripture")
      ) {
        lines.push(
          "- Create a short formation/devotional activity.",
          "- Include a brief prayer or scripture reading appropriate for a child.",
          "- Keep it warm, simple, and focused on gratitude or character.",
          "- 5-10 minutes maximum.",
        );
      } else if (
        lowerType.includes("art") ||
        lowerType.includes("draw") ||
        lowerType.includes("creative")
      ) {
        lines.push(
          "- Design a creative/art activity connected to current learning.",
          "- Include specific materials needed.",
          "- Keep instructions open-ended but with a starting point.",
          "- Emphasize process over product.",
        );
      } else if (lowerType.includes("read") && lowerType.includes("aloud")) {
        lines.push(
          "- Plan a read-aloud session with comprehension support.",
          "- Include 2-3 before-reading predictions or vocabulary words.",
          "- Include 2-3 during/after narration prompts.",
          "- The parent reads, the child listens and discusses.",
        );
      } else if (lowerType.includes("speech")) {
        lines.push(
          "- Design a speech practice activity appropriate for the child's targets.",
          "- Focus on clear articulation in context (words, then sentences).",
          "- Keep it conversational and low-pressure.",
          "- Include specific words or sounds to practice.",
        );
      } else if (
        lowerType.includes("science") ||
        lowerType.includes("explore")
      ) {
        lines.push(
          "- Design a hands-on science or exploration activity.",
          "- Include observation and narration components.",
          "- Use household materials when possible.",
          "- Encourage questions and predictions.",
        );
      } else {
        lines.push(
          "- Design a structured, hands-on activity appropriate for the child's level.",
          "- Keep instructions clear and sequential.",
          "- Include success criteria that can be observed or demonstrated.",
          "- Prefer oral demonstration or physical evidence over written work.",
        );
      }
      break;
    }
  }

  return lines.join("\n");
}

function buildGenerateUserMessage(ctx: PromptContext): string {
  return `Generate a ${ctx.estimatedMinutes}-minute ${ctx.activityType} activity for ${ctx.child.name} targeting skill "${ctx.skillTag}". Return JSON only.`;
}

// ── Helpers ─────────────────────────────────────────────────────

function currentWeekKey(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function coerceActivity(parsed: Record<string, unknown>): GeneratedActivity {
  return {
    title: String(parsed.title || "Activity"),
    objective: String(parsed.objective || ""),
    materials: Array.isArray(parsed.materials)
      ? (parsed.materials as string[])
      : [],
    steps: Array.isArray(parsed.steps)
      ? (parsed.steps as string[])
      : [String(parsed.steps || "Complete the activity")],
    successCriteria: Array.isArray(parsed.successCriteria)
      ? (parsed.successCriteria as string[])
      : [],
  };
}

function parseActivityJson(raw: string): GeneratedActivity {
  let parsed: Record<string, unknown>;

  try {
    parsed = sanitizeAndParseJson<Record<string, unknown>>(raw);
  } catch (parseErr) {
    // Fallback: try to find a JSON object in the raw text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        return coerceActivity(parsed);
      } catch {
        // Fall through to error
      }
    }
    throw new Error(
      `Failed to parse activity JSON: ${(parseErr as Error).message}`,
    );
  }

  // Validate required fields
  if (typeof parsed.title !== "string" || !parsed.title) {
    throw new Error("Missing or invalid 'title' in AI response");
  }
  if (typeof parsed.objective !== "string" || !parsed.objective) {
    throw new Error("Missing or invalid 'objective' in AI response");
  }
  if (!Array.isArray(parsed.materials)) {
    throw new Error("Missing or invalid 'materials' in AI response");
  }
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("Missing or invalid 'steps' in AI response");
  }
  if (!Array.isArray(parsed.successCriteria)) {
    throw new Error("Missing or invalid 'successCriteria' in AI response");
  }

  return {
    title: parsed.title,
    objective: parsed.objective,
    materials: parsed.materials as string[],
    steps: parsed.steps as string[],
    successCriteria: parsed.successCriteria as string[],
  };
}

// ── Callable Cloud Function ─────────────────────────────────────

export const generateActivity = onCall(
  { secrets: [claudeApiKey] },
  async (request): Promise<GenerateResponse> => {
    // ── Auth gate ──────────────────────────────────────────────
    const { uid } = requireEmailAuth(request);

    const { familyId, childId, activityType, skillTag, estimatedMinutes } =
      request.data as GenerateRequest;

    // ── Input validation ───────────────────────────────────────
    if (!familyId || typeof familyId !== "string") {
      throw new HttpsError("invalid-argument", "familyId is required.");
    }
    if (!childId || typeof childId !== "string") {
      throw new HttpsError("invalid-argument", "childId is required.");
    }
    if (!activityType || typeof activityType !== "string") {
      throw new HttpsError("invalid-argument", "activityType is required.");
    }
    if (!skillTag || typeof skillTag !== "string") {
      throw new HttpsError("invalid-argument", "skillTag is required.");
    }
    if (
      typeof estimatedMinutes !== "number" ||
      estimatedMinutes < 1 ||
      estimatedMinutes > 120
    ) {
      throw new HttpsError(
        "invalid-argument",
        "estimatedMinutes must be a number between 1 and 120.",
      );
    }

    // ── Authorization: caller must own the family ──────────────
    if (uid !== familyId) {
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

    const childData = childSnap.data() as ChildProfile;

    // ── Load skill snapshot (optional) ─────────────────────────
    const snapshotSnap = await db
      .doc(`families/${familyId}/skillSnapshots/${childId}`)
      .get();

    const snapshotData = snapshotSnap.exists
      ? (snapshotSnap.data() as SkillSnapshotData)
      : undefined;

    // ── Load ladder + current rung (optional) ──────────────────
    // Try to find a ladder matching the skill tag domain
    const domain = skillTag.split(".")[0];
    let currentRung: { title: string; description?: string } | undefined;
    let ladderTitle: string | undefined;

    const ladderQuery = await db
      .collection(`families/${familyId}/ladders`)
      .where("domain", "==", domain)
      .limit(1)
      .get();

    if (!ladderQuery.empty) {
      const ladderDoc = ladderQuery.docs[0];
      const ladder = ladderDoc.data() as LadderDoc;
      ladderTitle = ladder.title;

      // Check ladder progress for this child
      const progressSnap = await db
        .doc(
          `families/${familyId}/ladderProgress/${childId}_${ladderDoc.id}`,
        )
        .get();

      if (progressSnap.exists) {
        const progress = progressSnap.data() as LadderProgressDoc;
        const rung = ladder.rungs.find((r) => r.id === progress.currentRungId);
        if (rung) {
          currentRung = { title: rung.title, description: rung.description };
        }
      }

      // Fallback: use first rung if no progress exists
      if (!currentRung && ladder.rungs.length > 0) {
        const sorted = [...ladder.rungs].sort((a, b) => a.order - b.order);
        currentRung = {
          title: sorted[0].title,
          description: sorted[0].description,
        };
      }
    }

    // ── Load current week context (optional) ────────────────────
    let weekTheme: string | undefined;
    let weekVirtue: string | undefined;
    let weekStoryTitle: string | undefined;
    let weekReadAloud: string | undefined;
    const weekKey = currentWeekKey();
    const weekSnap = await db
      .doc(`families/${familyId}/weeks/${weekKey}`)
      .get();

    if (weekSnap.exists) {
      const weekData = weekSnap.data() as {
        theme?: string;
        virtue?: string;
        conundrum?: { title?: string };
        readAloudBook?: string;
      };
      weekTheme = weekData.theme;
      weekVirtue = weekData.virtue;
      weekStoryTitle = weekData.conundrum?.title;
      weekReadAloud = weekData.readAloudBook;
    }

    // ── Assemble prompt ────────────────────────────────────────
    const ctx: PromptContext = {
      child: childData,
      activityType,
      skillTag,
      estimatedMinutes,
      snapshot: snapshotData,
      currentRung,
      ladderTitle,
      weekTheme,
      weekVirtue,
      weekStoryTitle,
      weekReadAloud,
    };

    const systemPrompt = buildGenerateSystemPrompt(ctx);
    const userMessage = buildGenerateUserMessage(ctx);

    // ── Call Claude (Haiku for routine generation) ──────────────
    const model = modelForTask("generate");

    let responseText: string;
    let usage: { inputTokens: number; outputTokens: number };

    try {
      const result = await callClaude({
        apiKey: claudeApiKey.value(),
        model,
        maxTokens: 1024,
        systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      responseText = result.text;
      usage = {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Unknown AI provider error";
      console.error("generateActivity: Claude API call failed:", msg);
      throw new HttpsError("internal", `AI provider error: ${msg}`);
    }

    // ── Parse structured response ──────────────────────────────
    let activity: GeneratedActivity;
    try {
      activity = parseActivityJson(responseText);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "parse error";
      console.error(
        "generateActivity: Failed to parse AI response:",
        msg,
        "Raw response:",
        responseText.slice(0, 500),
      );
      throw new HttpsError(
        "internal",
        `Failed to parse AI response: ${msg}`,
      );
    }

    // ── Log usage to Firestore ─────────────────────────────────
    await logAiUsage(db, familyId, {
      childId,
      taskType: "generate",
      activityType,
      skillTag,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    return { activity, model, usage };
  },
);

// ── Exported for testing ────────────────────────────────────────

export { buildGenerateSystemPrompt, buildGenerateUserMessage, parseActivityJson };
export type { PromptContext };
