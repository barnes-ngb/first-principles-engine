import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask, getWeekMonday, loadWeekContext } from "../chat.js";

/**
 * Task: shellyChat
 * A general-purpose AI chat for Shelly (parent user) with full family context.
 * Model: Sonnet (complex reasoning + contextual family advice)
 */
export const handleShellyChat = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, messages, apiKey } = ctx;

  // ── Load family context (each wrapped in try/catch) ──────────

  let charterSummary = "";
  try {
    const familySnap = await db.doc(`families/${familyId}`).get();
    if (familySnap.exists) {
      const data = familySnap.data() as { charterSummary?: string };
      charterSummary = data.charterSummary || "";
    }
  } catch (err) {
    console.warn("[shellyChat] Failed to load family doc:", err);
  }

  let childrenContext = "";
  let childName = "";
  try {
    const childrenSnap = await db
      .collection(`families/${familyId}/children`)
      .get();
    if (!childrenSnap.empty) {
      const lines: string[] = ["Children:"];
      for (const doc of childrenSnap.docs) {
        const c = doc.data() as {
          name?: string;
          age?: number;
          description?: string;
          notes?: string;
        };
        if (childId && doc.id === childId) {
          childName = c.name || "";
        }
        const parts = [c.name || "Unknown"];
        if (c.age) parts.push(`age ${c.age}`);
        if (c.description) parts.push(`— ${c.description}`);
        if (c.notes) parts.push(`(${c.notes})`);
        lines.push(`- ${parts.join(" ")}`);
      }
      childrenContext = lines.join("\n");
    }
  } catch (err) {
    console.warn("[shellyChat] Failed to load children:", err);
  }

  let weekContext = "";
  try {
    const week = await loadWeekContext(db, familyId);
    if (week) {
      const parts: string[] = [];
      if (week.theme) parts.push(`Theme: ${week.theme}`);
      if (week.virtue) parts.push(`Virtue: ${week.virtue}`);
      weekContext = `This week: ${parts.join(", ")}`;
    }
  } catch (err) {
    console.warn("[shellyChat] Failed to load week context:", err);
  }

  // If we also got a conundrum from the week, append it
  let conundrumTitle = "";
  try {
    const monday = getWeekMonday(new Date());
    const weekId = monday.toISOString().slice(0, 10);
    const weekSnap = await db.doc(`families/${familyId}/weeks/${weekId}`).get();
    if (weekSnap.exists) {
      const data = weekSnap.data() as { conundrumTitle?: string };
      if (data.conundrumTitle) conundrumTitle = `Conundrum this week: ${data.conundrumTitle}`;
    }
  } catch (err) {
    console.warn("[shellyChat] Failed to load conundrum:", err);
  }

  // ── Build family-level context ────────────────────────────────

  const contextParts: string[] = [];
  if (charterSummary) contextParts.push(`Family charter: ${charterSummary}`);
  if (childrenContext) contextParts.push(childrenContext);
  if (weekContext) contextParts.push(weekContext);
  if (conundrumTitle) contextParts.push(conundrumTitle);

  const familyContext = contextParts.length > 0
    ? `\n\nFamily context:\n${contextParts.join("\n")}`
    : "";

  // ── Load deep child context when childId is provided ──────────

  let childContext = "";

  if (childId) {
    // 1. Skill Snapshot
    try {
      const snapshots = await db
        .collection(`families/${familyId}/skillSnapshots`)
        .where("childId", "==", childId)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
      if (!snapshots.empty) {
        const ss = snapshots.docs[0].data();
        if (ss.prioritySkills?.length) {
          childContext += `\n\nSkill Snapshot for ${childName}:`;
          childContext += `\nPriority skills: ${ss.prioritySkills.map((s: { skill?: string; label?: string; status?: string; level?: string }) => `${s.label || s.skill} (${s.status || s.level})`).join(", ")}`;
        }
        if (ss.supports?.length) {
          childContext += `\nSupports needed: ${ss.supports.join(", ")}`;
        }
        if (ss.stopRules?.length) {
          childContext += `\nStop rules (skip these): ${ss.stopRules.join(", ")}`;
        }
        if (ss.conceptualBlocks?.length) {
          childContext += `\nConceptual blocks: ${ss.conceptualBlocks.map((b: { skill?: string; rationale?: string; priority?: string }) => `${b.skill}: ${b.rationale} (${b.priority})`).join("; ")}`;
        }
      }
    } catch (err) {
      console.warn("[shellyChat] Skill snapshot load error:", err);
    }

    // 2. Recent Evaluation Findings (last 2)
    try {
      const evals = await db
        .collection(`families/${familyId}/evaluationSessions`)
        .where("childId", "==", childId)
        .orderBy("createdAt", "desc")
        .limit(2)
        .get();
      if (!evals.empty) {
        childContext += `\n\nRecent Evaluations for ${childName}:`;
        for (const evalDoc of evals.docs) {
          const e = evalDoc.data();
          const date = e.createdAt?.slice?.(0, 10) || "unknown date";
          childContext += `\n- ${e.sessionType || "guided"} eval (${date}):`;
          if (e.findings?.length) {
            childContext += ` Findings: ${e.findings.map((f: { text?: string; finding?: string }) => f.text || f.finding || String(f)).join("; ")}`;
          }
          if (e.recommendations?.length) {
            childContext += ` Recommendations: ${e.recommendations.join("; ")}`;
          }
        }
      }
    } catch (err) {
      console.warn("[shellyChat] Evaluation load error:", err);
    }

    // 3. Current Week Plan Items
    try {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      const weekId = weekStart.toISOString().slice(0, 10);

      const daysSnap = await db
        .collection(`families/${familyId}/days`)
        .where("weekId", "==", weekId)
        .where("childId", "==", childId)
        .orderBy("date", "desc")
        .limit(5)
        .get();

      if (!daysSnap.empty) {
        childContext += `\n\nThis Week's Activity for ${childName}:`;
        for (const dayDoc of daysSnap.docs) {
          const d = dayDoc.data();
          const items = d.items || d.checklist || [];
          if (items.length) {
            const completed = items.filter((i: { completed?: boolean; done?: boolean }) => i.completed || i.done).length;
            childContext += `\n- ${d.date}: ${completed}/${items.length} items completed`;
            const engaged = items
              .filter((i: { engagement?: string }) => i.engagement)
              .map((i: { title?: string; engagement?: string }) => `${i.title}: ${i.engagement}`)
              .join(", ");
            if (engaged) childContext += ` (engagement: ${engaged})`;
          }
        }
      }
    } catch (err) {
      console.warn("[shellyChat] Week plan load error:", err);
    }

    // 4. Disposition Profile
    try {
      const childDoc = await db.doc(`families/${familyId}/children/${childId}`).get();
      const cd = childDoc.data();
      if (cd?.dispositionProfile) {
        childContext += `\n\nDisposition Profile for ${childName}:`;
        const dp = cd.dispositionProfile as Record<string, unknown>;
        for (const [key, value] of Object.entries(dp)) {
          if (value) childContext += `\n${key}: ${value}`;
        }
      }

      const reviews = await db
        .collection(`families/${familyId}/weeklyReviews`)
        .where("childId", "==", childId)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
      if (!reviews.empty) {
        const review = reviews.docs[0].data();
        if (review.dispositionNarrative) {
          childContext += `\nRecent growth narrative: ${review.dispositionNarrative}`;
        }
      }
    } catch (err) {
      console.warn("[shellyChat] Disposition load error:", err);
    }

    // 5. Sight Word Progress (Lincoln only)
    if (childName?.toLowerCase() === "lincoln") {
      try {
        const wordProgress = await db
          .collection(`families/${familyId}/children/${childId}/wordProgress`)
          .orderBy("updatedAt", "desc")
          .limit(50)
          .get();
        if (!wordProgress.empty) {
          interface WpEntry { status?: string; word?: string; id: string }
          const wpData: WpEntry[] = wordProgress.docs.map((d: { data: () => Record<string, unknown>; id: string }) => ({ ...d.data() as { status?: string; word?: string }, id: d.id }));
          const mastered = wpData.filter((w: WpEntry) => w.status === "mastered").length;
          const practicing = wpData.filter((w: WpEntry) => w.status === "practicing").length;
          const newWords = wpData.filter((w: WpEntry) => w.status === "new").length;
          childContext += `\n\nSight Word Progress: ${mastered} mastered, ${practicing} practicing, ${newWords} new`;
          const practicingWords = wpData
            .filter((w: WpEntry) => w.status === "practicing")
            .map((w: WpEntry) => w.word || w.id);
          if (practicingWords.length) {
            childContext += `\nCurrently practicing: ${practicingWords.join(", ")}`;
          }
        }
      } catch (err) {
        console.warn("[shellyChat] Sight word load error:", err);
      }
    }
  }

  // ── Build system prompt ──────────────────────────────────────

  let systemPrompt = `You are a helpful assistant for Shelly Barnes, a homeschool mom.

Shelly has fibromyalgia and homeschools two boys:
- Lincoln (10): neurodivergent, speech challenges, loves Minecraft, learns through hands-on activities
- London (6): loves drawing, stories, and creating games
${familyContext}`;

  if (childId && childContext) {
    systemPrompt += `

You are currently focused on ${childName}. Shelly selected ${childName}'s tab, so prioritize ${childName}'s data and needs in your responses. Reference ${childName}'s specific skills, recent progress, and evaluation findings when relevant.

${childContext}

Guidelines:
- Be warm, practical, and specific. Shelly is busy — respect her time.
- You have detailed context about ${childName}'s current skills, evaluations, and weekly progress. Use this data to give specific, personalized advice.
- When suggesting activities, connect them directly to ${childName}'s skill snapshot and what's emerging vs. mastered.
- Reference recent evaluation findings when discussing what to work on.
- If engagement data shows frustration or low energy on certain subjects, acknowledge that and suggest alternatives.
- If she's frustrated or tired, acknowledge it genuinely. She has chronic pain and does heroic work every day.
- Keep responses concise unless she asks for detail.
- If she asks you to generate an image, tell her to tap the image button.
- For printable activities, format them clearly with sections she can screenshot or print.`;
  } else {
    systemPrompt += `

This is a general conversation — not focused on a specific child. Shelly may ask about curriculum, scheduling, family activities, or anything else.

Guidelines:
- Be warm, practical, and specific. Shelly is busy — respect her time.
- When she asks about teaching ideas, ask which child she's thinking about or suggest ideas for both.
- If she's frustrated or tired, acknowledge it genuinely. She has chronic pain and does heroic work every day.
- Keep responses concise unless she asks for detail.
- If she asks you to generate an image, tell her to tap the image button.
- For printable activities, format them clearly with sections she can screenshot or print.`;
  }

  systemPrompt += `

After your response, suggest 2-3 brief follow-up questions Shelly might want to ask. Format them on new lines at the very end of your response, each prefixed with "[FOLLOWUP] ". Keep each under 50 characters. These should be specific to what you just discussed, not generic.

Example:
[FOLLOWUP] How do I adapt this for London?
[FOLLOWUP] What materials do I need?
[FOLLOWUP] Can you make this a printable?`;

  const model = modelForTask("shellyChat" as never);

  // Send only last 20 messages
  const recentMessages = messages.slice(-20);

  // Check if the last user message contains an image URL for vision analysis
  const lastUserMsg = [...recentMessages].reverse().find((m) => m.role === "user");
  const imageUrlMatch = lastUserMsg?.content.match(/^\[IMAGE_URL:(https?:\/\/[^\]]+)\]\n?([\s\S]*)$/);

  let result: { text: string; inputTokens: number; outputTokens: number };

  if (imageUrlMatch) {
    // Vision path: use multi-part content for the last user message
    const imageUrl = imageUrlMatch[1];
    const textContent = imageUrlMatch[2] || "What can you tell me about this image?";

    // Build messages, replacing the last user message with multi-part content
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const claudeMessages: Array<{
      role: "user" | "assistant";
      content: string | Array<{ type: "image"; source: { type: "url"; url: string } } | { type: "text"; text: string }>;
    }> = recentMessages.map((m) => {
      if (m === lastUserMsg) {
        return {
          role: "user" as const,
          content: [
            { type: "image" as const, source: { type: "url" as const, url: imageUrl } },
            { type: "text" as const, text: textContent },
          ],
        };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });

    const completion = await client.messages.create({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const firstBlock = completion.content[0];
    const text = firstBlock && firstBlock.type === "text" ? firstBlock.text : "";
    result = { text, inputTokens: completion.usage.input_tokens, outputTokens: completion.usage.output_tokens };
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
    console.warn("Claude returned empty response", { model, taskType: "shellyChat" });
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
