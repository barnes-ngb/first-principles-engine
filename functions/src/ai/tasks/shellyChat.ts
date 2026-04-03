/**
 * Task: shellyChat
 * Context: charter + childProfile + engagement + gradeResults + recentEval
 *          + sightWords + weekFocus + wordMastery (via buildContextForTask)
 *          + supplemental: all children, disposition profile, weekly review, conundrum
 * Model: Sonnet
 */
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, callClaudeWithVisionUrl, logAiUsage } from "../chatTypes.js";
import { buildContextForTask } from "../contextSlices.js";
import { modelForTask, getWeekMonday } from "../chat.js";

export const handleShellyChat = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, messages, apiKey } = ctx;

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

  const [allChildrenResult, dispositionResult, reviewResult, conundrumResult] =
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

  // Disposition profile
  if (dispositionResult.status === "fulfilled" && dispositionResult.value) {
    const snap = dispositionResult.value as { exists: boolean; data: () => Record<string, unknown> | undefined };
    if (snap.exists) {
      const cd = snap.data();
      if (cd?.dispositionProfile) {
        const lines: string[] = [`\n\nDISPOSITION PROFILE for ${childName}:`];
        const dp = cd.dispositionProfile as Record<string, unknown>;
        for (const [key, value] of Object.entries(dp)) {
          if (value) lines.push(`${key}: ${value}`);
        }
        supplementalContext += lines.join("\n");
      }
    }
  }

  // Weekly review narrative
  if (reviewResult.status === "fulfilled" && reviewResult.value) {
    const snap = reviewResult.value as { empty: boolean; docs: Array<{ data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const sorted = snap.docs
        .map((d: { data: () => Record<string, unknown> }) => d.data())
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          ((b.createdAt as string) || "").localeCompare(
            (a.createdAt as string) || "",
          ),
        );
      const review = sorted[0];
      if (review?.dispositionNarrative) {
        supplementalContext += `\n\nRECENT GROWTH NARRATIVE: ${review.dispositionNarrative}`;
      }
    }
  }

  // Conundrum title
  if (conundrumResult.status === "fulfilled" && conundrumResult.value) {
    const snap = conundrumResult.value as { exists: boolean; data: () => Record<string, unknown> | undefined };
    if (snap.exists) {
      const data = snap.data() as { conundrumTitle?: string } | undefined;
      if (data?.conundrumTitle) {
        supplementalContext += `\n\nCONUNDRUM THIS WEEK: ${data.conundrumTitle}`;
      }
    }
  }

  console.log(
    `[shellyChat] childId=${childId}, childName=${childName}, sharedContextLength=${sharedContext.length}, supplementalLength=${supplementalContext.length}`,
  );

  // ── Step C: Build system prompt with charter alignment ──────────

  let roleSection: string;

  if (childId && childName) {
    roleSection = `ROLE: You are Shelly's homeschool assistant. She selected ${childName}'s tab, so prioritize ${childName}'s data and needs in your responses.

SHELLY-SPECIFIC GUIDELINES:
- Be warm, practical, and specific. Shelly is busy — respect her time.
- You DO have access to ${childName}'s records — the data above is current. Never say "I don't have access to records" or "I can't see evaluations." If data is missing, tell her specifically what's not there yet and how to populate it (e.g., "No evaluations yet — running one from the Progress tab would help me give more specific advice").
- Connect suggestions to ${childName}'s skill snapshot and what's emerging vs. mastered.
- Reference recent evaluation findings when discussing what to work on.
- If engagement data shows frustration or low energy on certain subjects, acknowledge it and suggest alternatives.
- She has chronic pain and does heroic work every day. If she's frustrated or tired, acknowledge it genuinely.
- Keep responses concise unless she asks for detail.
- If she asks you to generate an image, tell her to tap the image button.
- For printable activities, format them clearly for screenshot or print.`;
  } else {
    roleSection = `ROLE: You are Shelly's homeschool assistant. This is a general conversation — not focused on a specific child.

SHELLY-SPECIFIC GUIDELINES:
- Be warm, practical, and specific. Shelly is busy — respect her time.
- When she asks about teaching ideas, ask which child she's thinking about or suggest ideas for both.
- She has chronic pain and does heroic work every day. If she's frustrated or tired, acknowledge it genuinely.
- Keep responses concise unless she asks for detail.
- If she asks you to generate an image, tell her to tap the image button.
- For printable activities, format them clearly for screenshot or print.`;
  }

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
