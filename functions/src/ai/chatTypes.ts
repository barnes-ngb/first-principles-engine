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

/** Load recent evaluation context string for plan/quest tasks. */
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
        return evalLines.join("\n");
      }
    }
  } catch (err) {
    console.warn("Failed to load recent evaluation for plan context:", err);
  }
  return "";
}
