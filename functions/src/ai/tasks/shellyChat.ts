/**
 * Task: shellyChat
 * Context: charter + childProfile + engagement + gradeResults + recentEval
 *          + sightWords + weekFocus + wordMastery + workbookPaces
 *          + skillSnapshot + recentHistoryByDomain (cross-domain)
 *          + recentScans + dayToday + dadLabReports (via buildContextForTask)
 *          + supplemental: all children, disposition profile (dispositionCache
 *            with overrides), recent weekly reviews (5-row strip), conundrum
 *            title, completion patterns, conundrum response count, chapter
 *            responses, recent teach-backs (14d, limit 10)
 *          + child-scoped PLANNING-PARTNER MODE addendum in roleSection
 * Model: Sonnet
 */
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, callClaudeWithVisionUrl, logAiUsage } from "../chatTypes.js";
import { buildContextForTask } from "../contextSlices.js";
import { modelForTask, getWeekMonday } from "../chat.js";
import { summarizeTeachBacks } from "../evaluate.js";

// ── Pure formatters (exported for testability) ────────────────────

/** Shape of the cached AI disposition stored on a child doc. */
export interface DispositionCacheDoc {
  result?: {
    profileDate?: string;
    dispositions?: Record<string, { level?: string; narrative?: string; trend?: string } | undefined>;
    celebration?: string;
    nudge?: string;
  };
  generatedAt?: string;
}

/** Per-disposition parent overrides stored on a child doc. */
export type DispositionOverridesDoc = Record<string, { text?: string } | undefined>;

/** A single weekly-review doc row consumed by the trajectory formatter. */
export interface WeeklyReviewRow {
  weekKey?: string;
  status?: string;
  summary?: string;
  celebration?: string;
  growthAreas?: string[];
  createdAt?: string;
}

/** Raw artifact shape consumed by the teach-backs formatter. */
export interface TeachBackArtifactInput {
  title?: string;
  type?: string;
  notes?: string;
  content?: string;
  createdAt?: string;
  mediaUrl?: string;
  uri?: string;
  tags?: { subjectBucket?: string; engineStage?: string };
}

const DISPOSITION_ORDER = ["curiosity", "persistence", "articulation", "selfAwareness", "ownership"];
const DISPOSITION_LABELS: Record<string, string> = {
  curiosity: "Curiosity",
  persistence: "Persistence",
  articulation: "Articulation",
  selfAwareness: "Self-Awareness",
  ownership: "Ownership",
};

/**
 * Format the disposition profile block for a child.
 *
 * Reads `dispositionCache.result.dispositions` and applies
 * `dispositionOverrides[key].text` over the AI narrative per the UI's
 * `effectiveDispositionText` helper. Emits the five dimensions in fixed
 * order. Returns "" (and the caller appends nothing) when no cache exists
 * or no disposition has any usable text — omit-on-empty per Phase 1's
 * "don't explain absence" rule.
 */
export function formatDispositionProfile(
  childName: string,
  cache: DispositionCacheDoc | undefined,
  overrides: DispositionOverridesDoc,
): string {
  const dispositions = cache?.result?.dispositions;
  if (!dispositions) return "";

  const generatedDate = cache?.generatedAt
    ? new Date(cache.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : (cache?.result?.profileDate || "unknown");
  const lines: string[] = [`\n\nDISPOSITION PROFILE for ${childName} (generated ${generatedDate}):`];

  let hasAnyEntry = false;
  for (const key of DISPOSITION_ORDER) {
    const entry = dispositions[key];
    if (!entry) continue;
    const effective = overrides[key]?.text ?? entry.narrative ?? "";
    if (!effective) continue;
    hasAnyEntry = true;
    const level = entry.level || "unknown";
    const trend = entry.trend || "unknown";
    lines.push(`- ${DISPOSITION_LABELS[key]}: ${level}, trend ${trend} — ${effective}`);
  }
  if (cache?.result?.celebration) lines.push(`Celebration: ${cache.result.celebration}`);
  if (cache?.result?.nudge) lines.push(`Nudge: ${cache.result.nudge}`);

  return hasAnyEntry ? lines.join("\n") : "";
}

/**
 * Format up to 5 recent weekly reviews as a compact trajectory strip.
 *
 * Skips status="no-data" rows. Truncates summary to ≤140 chars. Attaches
 * celebration + top 2 growth areas to the most-recent row only (avoid
 * prompt bloat). Returns "" when there are no surfaceable reviews.
 */
export function formatRecentWeeklyReviews(
  childName: string,
  rawReviews: WeeklyReviewRow[],
): string {
  const reviews = rawReviews
    .filter((r) => r.status !== "no-data" && r.summary)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  if (reviews.length === 0) return "";

  const lines: string[] = [`\n\nRECENT WEEKLY REVIEWS for ${childName} (most recent first):`];
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    const rawSummary = r.summary ?? "";
    const summary = rawSummary.length > 140 ? rawSummary.slice(0, 140).trim() + "…" : rawSummary;
    let line = `- ${r.weekKey ?? "unknown week"}: ${summary}`;
    if (i === 0) {
      const extras: string[] = [];
      if (r.celebration) extras.push(`celebration: ${r.celebration}`);
      if (r.growthAreas?.length) {
        extras.push(`growth areas: ${r.growthAreas.slice(0, 2).join("; ")}`);
      }
      if (extras.length > 0) line += ` [${extras.join("; ")}]`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/** Format the current week's conundrum title line. Returns "" when absent. */
export function formatConundrumTitle(
  weekData: { conundrum?: { title?: string } } | undefined,
): string {
  if (!weekData?.conundrum?.title) return "";
  return `\n\nCONUNDRUM THIS WEEK: ${weekData.conundrum.title}`;
}

/**
 * Format the recent teach-backs block.
 *
 * Filters the input artifacts in-memory to those whose title starts with
 * "teach-back" (case-insensitive — not every engineStage=Explain artifact
 * is a teach-back). Summarizes via the shared `summarizeTeachBacks`
 * reducer and renders count + audio/text breakdown + by-subject + up to
 * 3 short example excerpts. Returns "" when zero teach-backs match.
 */
export function formatRecentTeachBacks(rawArtifacts: TeachBackArtifactInput[]): string {
  const artifacts = rawArtifacts.filter((a) => (a.title ?? "").toLowerCase().startsWith("teach-back"));
  if (artifacts.length === 0) return "";

  const summary = summarizeTeachBacks(artifacts);
  const lines: string[] = [
    `\n\nRECENT TEACH-BACKS (last 14 days): ${summary.count} total (audio: ${summary.audioCount}, text: ${summary.textCount}).`,
  ];
  const bySubject = Object.entries(summary.bySubject);
  if (bySubject.length > 0) {
    lines.push(`By subject: ${bySubject.map(([s, n]) => `${s} ${n}`).join(", ")}.`);
  }
  if (summary.examples.length > 0) {
    lines.push("Examples:");
    for (const ex of summary.examples) {
      const excerpt = ex.excerpt ? `"${ex.excerpt}"` : "(no excerpt)";
      const medium = ex.hasAudio ? "audio" : "text";
      lines.push(`- ${ex.subject} — ${excerpt} (${medium})`);
    }
  }
  return lines.join("\n");
}

/**
 * Build the role-section text for the shellyChat system prompt.
 *
 * Two branches:
 *   - childName truthy → child-scoped guidelines + PLANNING-PARTNER MODE addendum.
 *   - childName absent → general-conversation guidelines, no addendum.
 *
 * The addendum names the four upstream section headers (EVALUATION HISTORY
 * BY DOMAIN, DISPOSITION PROFILE, RECENT WEEKLY REVIEWS, RECENT TEACH-BACKS)
 * so the model can ground claims rather than confabulate.
 */
export function buildShellyChatRoleSection(childName: string | undefined): string {
  if (childName) {
    return `ROLE: You are Shelly's homeschool assistant. She selected ${childName}'s tab, so prioritize ${childName}'s data and needs in your responses.

SHELLY-SPECIFIC GUIDELINES:
- Be warm, practical, and specific. Shelly is busy — respect her time.
- You DO have access to ${childName}'s records — the data above is current. Never say "I don't have access to records" or "I can't see evaluations." If data is missing, tell her specifically what's not there yet and how to populate it (e.g., "No evaluations yet — running one from the Progress tab would help me give more specific advice").
- Connect suggestions to ${childName}'s skill snapshot and what's emerging vs. mastered.
- Reference recent evaluation findings when discussing what to work on.
- If engagement data shows frustration or low energy on certain subjects, acknowledge it and suggest alternatives.
- She has chronic pain and does heroic work every day. If she's frustrated or tired, acknowledge it genuinely.
- Keep responses concise unless she asks for detail.
- If she asks you to generate an image, tell her to tap the image button.
- For printable activities, format them clearly for screenshot or print.

PLANNING-PARTNER MODE: You have ${childName}'s recent evaluation history across reading (comprehension), math, fluency, and phonics (see EVALUATION HISTORY BY DOMAIN above), ${childName}'s disposition signals across curiosity, persistence, articulation, self-awareness, and ownership (see DISPOSITION PROFILE), the week-over-week strip of recent reviews (see RECENT WEEKLY REVIEWS), and recent teach-backs (see RECENT TEACH-BACKS). Use them to help Shelly see patterns over time — what is shifting, what is steady, what connects across signals she has not linked. When she shares an observation about ${childName} mid-conversation, treat it as evidence she has earned the right to add to the picture — don't argue with it, build on it.`;
  }
  return `ROLE: You are Shelly's homeschool assistant. This is a general conversation — not focused on a specific child.

SHELLY-SPECIFIC GUIDELINES:
- Be warm, practical, and specific. Shelly is busy — respect her time.
- When she asks about teaching ideas, ask which child she's thinking about or suggest ideas for both.
- She has chronic pain and does heroic work every day. If she's frustrated or tired, acknowledge it genuinely.
- Keep responses concise unless she asks for detail.
- If she asks you to generate an image, tell her to tap the image button.
- For printable activities, format them clearly for screenshot or print.`;
}

export const handleShellyChat = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, messages, apiKey } = ctx;

  const lastMsg = messages[messages.length - 1];
  console.log("[shellyChat] Messages received:", messages.length, {
    lastRole: lastMsg?.role,
    contentLength: lastMsg?.content?.length,
    contentPreview: lastMsg?.content?.slice(0, 80),
  });

  // ── Step A: Shared context via buildContextForTask (parallel) ──
  const contextSections = await buildContextForTask("shellyChat", {
    db,
    familyId,
    childId: childId || "",
    childData: ctx.childData ?? { name: "" },
    snapshotData: ctx.snapshotData,
  });
  const sharedContext = contextSections.join("\n\n");

  // ── Step B: Supplemental shellyChat-specific queries (parallel) ──
  const monday = getWeekMonday(new Date());
  const weekId = monday.toISOString().slice(0, 10);

  // Date range for teaching reflection data (14 days)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const reflectionStartDate = fourteenDaysAgo.toISOString().slice(0, 10);

  const [allChildrenResult, dispositionResult, reviewResult, conundrumResult, completionResult, conundrumArtifactsResult, chapterResponseResult, teachBacksResult] =
    await Promise.allSettled([
      db.collection(`families/${familyId}/children`).get(),
      childId
        ? db.doc(`families/${familyId}/children/${childId}`).get()
        : Promise.resolve(null),
      childId
        ? db
            .collection(`families/${familyId}/weeklyReviews`)
            .where("childId", "==", childId)
            .limit(5)
            .get()
        : Promise.resolve(null),
      db.doc(`families/${familyId}/weeks/${weekId}`).get(),
      // Completion patterns — day logs from last 14 days
      childId
        ? db.collection(`families/${familyId}/days`)
            .where("childId", "==", childId)
            .where("date", ">=", reflectionStartDate)
            .limit(50)
            .get()
        : Promise.resolve(null),
      // Conundrum artifacts — how many conundrum responses recorded
      childId
        ? db.collection(`families/${familyId}/artifacts`)
            .where("childId", "==", childId)
            .where("tags.domain", "==", "conundrum")
            .limit(20)
            .get()
        : Promise.resolve(null),
      // Chapter responses — recent read-aloud discussion responses
      childId
        ? db.collection(`families/${familyId}/chapterResponses`)
            .where("childId", "==", childId)
            .where("date", ">=", reflectionStartDate)
            .limit(20)
            .get()
        : Promise.resolve(null),
      // Recent teach-backs — "Explain" artifacts last 14 days, title filter applied in-memory
      childId
        ? db.collection(`families/${familyId}/artifacts`)
            .where("childId", "==", childId)
            .where("tags.engineStage", "==", "Explain")
            .where("createdAt", ">=", reflectionStartDate)
            .limit(10)
            .get()
        : Promise.resolve(null),
    ]);

  // Format supplemental context
  let supplementalContext = "";
  let childName = ctx.childData?.name || "";

  // All children list
  if (allChildrenResult.status === "fulfilled" && allChildrenResult.value) {
    const snap = allChildrenResult.value as { empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const lines: string[] = ["ALL CHILDREN:"];
      for (const doc of snap.docs) {
        const c = doc.data() as {
          name?: string;
          age?: number;
          description?: string;
          notes?: string;
        };
        if (childId && doc.id === childId && !childName) {
          childName = c.name || "";
        }
        const parts = [c.name || "Unknown"];
        if (c.age) parts.push(`age ${c.age}`);
        if (c.description) parts.push(`— ${c.description}`);
        if (c.notes) parts.push(`(${c.notes})`);
        lines.push(`- ${parts.join(" ")}`);
      }
      supplementalContext += lines.join("\n");
    }
  }

  // Disposition profile (Phase 1: uses dispositionCache + overrides — see formatter)
  if (dispositionResult.status === "fulfilled" && dispositionResult.value) {
    const snap = dispositionResult.value as { exists: boolean; data: () => Record<string, unknown> | undefined };
    if (snap.exists) {
      const cd = snap.data();
      const cache = cd?.dispositionCache as DispositionCacheDoc | undefined;
      const overrides = (cd?.dispositionOverrides ?? {}) as DispositionOverridesDoc;
      supplementalContext += formatDispositionProfile(childName, cache, overrides);
    }
  }

  // Recent weekly reviews — 5-row strip (Phase 1: replaces dead dispositionNarrative read)
  if (reviewResult.status === "fulfilled" && reviewResult.value) {
    const snap = reviewResult.value as { empty: boolean; docs: Array<{ data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const rows = snap.docs.map((d) => d.data() as WeeklyReviewRow);
      supplementalContext += formatRecentWeeklyReviews(childName, rows);
    }
  }

  // Conundrum title (Phase 1: drills into nested conundrum.title — see formatter)
  if (conundrumResult.status === "fulfilled" && conundrumResult.value) {
    const snap = conundrumResult.value as { exists: boolean; data: () => Record<string, unknown> | undefined };
    if (snap.exists) {
      const data = snap.data() as { conundrum?: { title?: string } } | undefined;
      supplementalContext += formatConundrumTitle(data);
    }
  }

  // Recent teach-backs — Phase 1 addition (14d, limit 10, in-memory title filter)
  if (teachBacksResult.status === "fulfilled" && teachBacksResult.value) {
    const snap = teachBacksResult.value as { empty: boolean; docs: Array<{ data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const rows = snap.docs.map((d) => d.data() as TeachBackArtifactInput);
      supplementalContext += formatRecentTeachBacks(rows);
    }
  }

  // ── Teaching Reflection Data ──────────────────────────────────
  const reflectionLines: string[] = [];

  // Completion patterns by day of week
  if (completionResult.status === "fulfilled" && completionResult.value) {
    const snap = completionResult.value as { empty: boolean; docs: Array<{ data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayCompletionRates: Record<string, { total: number; completed: number }> = {};
      const skippedActivities: Record<string, number> = {};

      for (const d of snap.docs) {
        const data = d.data() as { date?: string; checklist?: Array<{ label?: string; completed?: boolean; skipped?: boolean; engagement?: string }> };
        if (!data.date || !data.checklist) continue;
        const dayOfWeek = dayNames[new Date(data.date + "T12:00:00").getDay()];
        if (!dayCompletionRates[dayOfWeek]) dayCompletionRates[dayOfWeek] = { total: 0, completed: 0 };

        for (const item of data.checklist) {
          dayCompletionRates[dayOfWeek].total++;
          if (item.completed) dayCompletionRates[dayOfWeek].completed++;
          if (item.skipped && item.label) {
            skippedActivities[item.label] = (skippedActivities[item.label] ?? 0) + 1;
          }
        }
      }

      const completionByDay = Object.entries(dayCompletionRates)
        .filter(([, v]) => v.total > 0)
        .map(([day, v]) => `${day}: ${Math.round((v.completed / v.total) * 100)}%`)
        .join(", ");

      if (completionByDay) {
        reflectionLines.push(`Completion by day: ${completionByDay}`);
      }

      const topSkipped = Object.entries(skippedActivities)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([label, count]) => `${label} (${count}x)`)
        .join(", ");
      if (topSkipped) {
        reflectionLines.push(`Most skipped: ${topSkipped}`);
      }
    }
  }

  // Conundrum engagement
  if (conundrumArtifactsResult.status === "fulfilled" && conundrumArtifactsResult.value) {
    const snap = conundrumArtifactsResult.value as { empty: boolean; size: number };
    const count = snap.empty ? 0 : snap.size;
    reflectionLines.push(`Conundrum responses recorded: ${count}`);
  }

  // Chapter response data
  if (chapterResponseResult.status === "fulfilled" && chapterResponseResult.value) {
    const snap = chapterResponseResult.value as { empty: boolean; size: number; docs: Array<{ data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const count = snap.size;
      const books = new Set<string>();
      for (const d of snap.docs) {
        const data = d.data() as { bookTitle?: string };
        if (data.bookTitle) books.add(data.bookTitle);
      }
      reflectionLines.push(`Chapter responses (last 2 weeks): ${count} responses across ${books.size} book(s)${books.size > 0 ? ` (${Array.from(books).join(", ")})` : ""}`);
    }
  }

  if (reflectionLines.length > 0) {
    supplementalContext += `\n\nTEACHING REFLECTION DATA (use this when Shelly asks how things are going):\n${reflectionLines.join("\n")}

When Shelly asks about engagement, frustration, or how things are going, use this data.
Don't give generic homeschool advice — give advice based on what's actually happening.
Example: If she says "Lincoln seems bored with reading" and the data shows positive engagement but low quest completion, tell her: "His daily reading engagement looks positive — he might enjoy the workbook but find the quests too easy. Try increasing quest difficulty or switching to comprehension mode."`;
  }

  console.log(
    `[shellyChat] childId=${childId}, childName=${childName}, sharedContextLength=${sharedContext.length}, supplementalLength=${supplementalContext.length}`,
  );

  // ── Step C: Build system prompt with charter alignment ──────────
  const roleSection = buildShellyChatRoleSection(childId && childName ? childName : undefined);

  const systemPrompt = `${sharedContext}

${supplementalContext}

${roleSection}

After your response, suggest 2-3 brief follow-up questions Shelly might want to ask. Format them on new lines at the very end of your response, each prefixed with "[FOLLOWUP] ". Keep each under 50 characters. These should be specific to what you just discussed, not generic.

Example:
[FOLLOWUP] How do I adapt this for London?
[FOLLOWUP] What materials do I need?
[FOLLOWUP] Can you make this a printable?`;

  const model = modelForTask("shellyChat" as never);

  // Send only last 20 messages
  const recentMessages = messages.slice(-20);

  // Check if the last user message contains an image URL for vision analysis
  const lastUserMsg = [...recentMessages]
    .reverse()
    .find((m) => m.role === "user");
  const imageUrlMatch = lastUserMsg?.content.match(
    /^\[IMAGE_URL:(https?:\/\/[^\]]+)\]\n?([\s\S]*)$/,
  );

  let result: { text: string; inputTokens: number; outputTokens: number };

  if (imageUrlMatch) {
    // Vision path: use shared helper for URL-based images
    console.log("[shellyChat] Vision path — image URL detected:", imageUrlMatch[1]?.slice(0, 60));
    const imageUrl = imageUrlMatch[1];
    const textContent =
      imageUrlMatch[2] || "What can you tell me about this image?";

    // Prior messages (everything except the last image message)
    const priorMessages = recentMessages
      .filter((m) => m !== lastUserMsg)
      .map((m) => ({ role: m.role, content: m.content }));

    result = await callClaudeWithVisionUrl({
      apiKey,
      model,
      maxTokens: 2000,
      systemPrompt,
      imageUrl,
      textPrompt: textContent,
      messages: priorMessages,
    });
  } else {
    console.log("[shellyChat] Text path — no image URL detected");
    result = await callClaude({
      apiKey,
      model,
      maxTokens: 2000,
      systemPrompt,
      messages: recentMessages,
    });
  }

  if (!result.text) {
    console.warn("Claude returned empty response", {
      model,
      taskType: "shellyChat",
    });
  }

  console.log(
    `[AI] taskType=shellyChat inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`,
  );

  await logAiUsage(db, familyId, {
    childId: childId || null,
    taskType: "shellyChat",
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return {
    message: result.text,
    model,
    usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
  };
};
