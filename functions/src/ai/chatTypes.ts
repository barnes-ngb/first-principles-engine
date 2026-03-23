import type { Firestore } from "firebase-admin/firestore";

// ── Task handler types ──────────────────────────────────────────

export interface ChatTaskMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SnapshotData {
  prioritySkills?: Array<{ tag: string; label: string; level: string }>;
  supports?: Array<{ label: string; description: string }>;
  stopRules?: Array<{ label: string; trigger: string; action: string }>;
}

/** Context passed to every chat task handler. */
export interface ChatTaskContext {
  db: Firestore;
  familyId: string;
  childId: string;
  childData: { name: string; grade?: string };
  snapshotData: SnapshotData | undefined;
  messages: ChatTaskMessage[];
  domain: string | undefined;
  apiKey: string;
}

/** Result returned by a chat task handler. */
export interface ChatTaskResult {
  message: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** A function that handles a specific chat task type. */
export type ChatTaskHandler = (ctx: ChatTaskContext) => Promise<ChatTaskResult>;

// ── Shared helpers ──────────────────────────────────────────────

/** Call Claude API and return response text and usage. */
export async function callClaude(opts: {
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: opts.apiKey });

  const completion = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.systemPrompt,
    messages: opts.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const firstBlock = completion.content[0];
  const text =
    firstBlock && firstBlock.type === "text" ? firstBlock.text : "";

  return {
    text,
    inputTokens: completion.usage.input_tokens,
    outputTokens: completion.usage.output_tokens,
  };
}

/** Call Claude API with vision (image + text) and return response text and usage. */
export async function callClaudeWithVision(opts: {
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  textPrompt: string;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: opts.apiKey });

  const completion = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: opts.mediaType,
              data: opts.imageBase64,
            },
          },
          {
            type: "text",
            text: opts.textPrompt,
          },
        ],
      },
    ],
  });

  const firstBlock = completion.content[0];
  const text =
    firstBlock && firstBlock.type === "text" ? firstBlock.text : "";

  return {
    text,
    inputTokens: completion.usage.input_tokens,
    outputTokens: completion.usage.output_tokens,
  };
}

/** Log AI usage to Firestore (non-throwing). */
export async function logAiUsage(
  db: Firestore,
  familyId: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await db.collection(`families/${familyId}/aiUsage`).add({
      ...data,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Failed to log AI usage:", err);
  }
}

/** Load recent evaluation context string for plan/quest tasks.
 * Reads the most recent complete evaluation session (guided or interactive).
 */
export async function loadRecentEvalContext(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<string> {
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
        sessionType?: string;
        finalLevel?: number;
        totalCorrect?: number;
        totalQuestions?: number;
        recommendations?: Array<{
          priority: number;
          skill: string;
          action: string;
          frequency: string;
          duration: string;
        }>;
        findings?: Array<{
          skill: string;
          status: string;
          evidence: string;
        }>;
      };

      if (evalData.summary) {
        const evalLines: string[] = [];
        const sessionLabel = evalData.sessionType === "interactive"
          ? "RECENT INTERACTIVE EVALUATION (Knowledge Mine Quest)"
          : "RECENT EVALUATION";
        evalLines.push("", `${sessionLabel}:`);
        evalLines.push(`Domain: ${evalData.domain || "unknown"}`);
        evalLines.push(`Date: ${evalData.evaluatedAt || "unknown"}`);
        if (evalData.sessionType === "interactive" && evalData.finalLevel) {
          evalLines.push(`Final Level: ${evalData.finalLevel}, Score: ${evalData.totalCorrect}/${evalData.totalQuestions}`);
        }
        evalLines.push(`Summary: ${evalData.summary}`);
        if (evalData.findings?.length) {
          evalLines.push("Findings:");
          for (const f of evalData.findings) {
            evalLines.push(`- ${f.skill}: ${f.status} — ${f.evidence}`);
          }
        }
        if (evalData.recommendations?.length) {
          evalLines.push("Recommendations:");
          for (const rec of evalData.recommendations) {
            evalLines.push(
              `- Priority ${rec.priority}: ${rec.skill} — ${rec.action} (${rec.frequency}, ${rec.duration})`,
            );
          }
        }
        return evalLines.join("\n");
      }
    }
  } catch (err) {
    console.warn("Failed to load recent evaluation for plan context:", err);
  }
  return "";
}
