import type { Firestore } from "firebase-admin/firestore";

// ── Task handler types ──────────────────────────────────────────

export interface ChatTaskMessage {
  role: "user" | "assistant";
  content: string;
}

export interface WorkingLevelEntry {
  level: number;
  updatedAt: string;
  source: string;
  evidence?: string;
}

export interface SnapshotConceptualBlock {
  id?: string;
  name: string;
  affectedSkills: string[];
  recommendation?: string;
  status?: string;
  rationale: string;
  strategies?: string[];
  deferNote?: string;
  specificWords?: string[];
}

export interface SnapshotData {
  prioritySkills?: Array<{ tag: string; label: string; level: string }>;
  supports?: Array<{ label: string; description: string }>;
  stopRules?: Array<{ label: string; trigger: string; action: string }>;
  completedPrograms?: string[];
  workingLevels?: Record<string, WorkingLevelEntry>;
  conceptualBlocks?: SnapshotConceptualBlock[];
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
}): Promise<{ text: string; inputTokens: number; outputTokens: number; stopReason: string }> {
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
    stopReason: completion.stop_reason ?? "unknown",
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

/** Call Claude API with a URL-based image and return response text and usage. */
export async function callClaudeWithVisionUrl(opts: {
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  imageUrl: string;
  textPrompt: string;
  messages?: Array<{ role: string; content: string }>;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: opts.apiKey });

  // Prior messages (everything except the last, which becomes the image message)
  const priorMessages = (opts.messages || []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const completion = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.systemPrompt,
    messages: [
      ...priorMessages,
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: opts.imageUrl } },
          { type: "text", text: opts.textPrompt },
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

/** Domains supported by the per-domain eval history loader. */
const EVAL_DOMAINS = ["phonics", "comprehension", "math", "fluency"] as const;

/** Shape of a single eval session summary used by loadRecentEvalHistoryByDomain. */
interface EvalSessionSummary {
  domain: string;
  date: string;
  sessionType: string;
  finalLevel?: number;
  totalCorrect?: number;
  totalQuestions?: number;
  summary?: string;
  findings?: Array<{ skill: string; status: string; evidence: string }>;
}

/**
 * Load recent evaluation history grouped by domain.
 *
 * Returns one text block per domain that has history, formatted for AI context.
 * Each domain gets up to `sessionsPerDomain` most-recent complete sessions
 * (default 3), giving the AI enough depth to spot multi-session trends.
 *
 * The optional `filterDomain` parameter restricts output to a single domain
 * (e.g. for quest tasks that only need their own domain's history).
 */
export async function loadRecentEvalHistoryByDomain(
  db: Firestore,
  familyId: string,
  childId: string,
  opts?: { sessionsPerDomain?: number; filterDomain?: string },
): Promise<string> {
  const sessionsPerDomain = opts?.sessionsPerDomain ?? 3;
  const domainsToQuery = opts?.filterDomain
    ? [opts.filterDomain]
    : [...EVAL_DOMAINS];

  try {
    // Fire all per-domain queries in parallel
    const queries = domainsToQuery.map(async (domain) => {
      const snap = await db
        .collection(`families/${familyId}/evaluationSessions`)
        .where("childId", "==", childId)
        .where("status", "==", "complete")
        .where("domain", "==", domain)
        .orderBy("evaluatedAt", "desc")
        .limit(sessionsPerDomain)
        .get();

      const sessions: EvalSessionSummary[] = snap.docs.map((doc) => {
        const d = doc.data() as {
          domain?: string;
          evaluatedAt?: string;
          sessionType?: string;
          finalLevel?: number;
          totalCorrect?: number;
          totalQuestions?: number;
          summary?: string;
          findings?: Array<{ skill: string; status: string; evidence: string }>;
        };
        return {
          domain: d.domain ?? domain,
          date: d.evaluatedAt ?? "unknown",
          sessionType: d.sessionType ?? "guided",
          finalLevel: d.finalLevel,
          totalCorrect: d.totalCorrect,
          totalQuestions: d.totalQuestions,
          summary: d.summary,
          findings: d.findings,
        };
      });

      return { domain, sessions };
    });

    const results = await Promise.all(queries);

    const blocks: string[] = [];
    for (const { domain, sessions } of results) {
      if (sessions.length === 0) continue;

      const domainLabel = domain.charAt(0).toUpperCase() + domain.slice(1);
      const lines: string[] = [
        `Recent ${domainLabel} history (last ${sessions.length} session${sessions.length > 1 ? "s" : ""}):`,
      ];

      for (const s of sessions) {
        const dateStr = s.date !== "unknown"
          ? new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "unknown";
        const typeLabel = s.sessionType === "interactive" ? "quest" : "eval, guided";

        if (s.sessionType === "interactive" && s.finalLevel != null) {
          lines.push(
            `- ${dateStr} (${typeLabel}, L${s.finalLevel}): ${s.totalCorrect}/${s.totalQuestions} correct, ended at L${s.finalLevel}`,
          );
        } else if (s.summary) {
          lines.push(`- ${dateStr} (${typeLabel}): ${s.summary}`);
        } else {
          lines.push(`- ${dateStr} (${typeLabel}): session completed`);
        }

        // Include findings for the most recent session only (avoid prompt bloat)
        if (s === sessions[0] && s.findings?.length) {
          for (const f of s.findings) {
            lines.push(`    ${f.skill}: ${f.status} — ${f.evidence}`);
          }
        }
      }

      blocks.push(lines.join("\n"));
    }

    return blocks.join("\n\n");
  } catch (err) {
    console.warn("Failed to load per-domain eval history:", err);
  }
  return "";
}

/** Format a per-domain eval history result for the AI prompt context. */
export function formatEvalHistoryByDomain(historyText: string): string {
  if (!historyText) return "";
  return `EVALUATION HISTORY BY DOMAIN:\n${historyText}`;
}

/** Load recent evaluation context string for plan/quest tasks.
 * Reads the most recent complete evaluation session (guided or interactive).
 * @deprecated Prefer loadRecentEvalHistoryByDomain for domain-aware history.
 * Kept for backward compatibility with tasks that rely on cross-domain most-recent.
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
