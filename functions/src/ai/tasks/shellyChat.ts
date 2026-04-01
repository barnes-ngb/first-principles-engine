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

  let skillContext = "";
  if (childId) {
    try {
      const snapQuery = await db
        .collection(`families/${familyId}/skillSnapshots`)
        .where("childId", "==", childId)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
      if (!snapQuery.empty) {
        const snapData = snapQuery.docs[0].data() as {
          prioritySkills?: Array<{ tag: string; label: string; level: string }>;
        };
        if (snapData.prioritySkills?.length) {
          const skills = snapData.prioritySkills
            .map((s) => `${s.label} (${s.level})`)
            .join(", ");
          skillContext = `Active child's priority skills: ${skills}`;
        }
      }
    } catch (err) {
      console.warn("[shellyChat] Failed to load skill snapshot:", err);
    }
  }

  // ── Build system prompt ──────────────────────────────────────

  const contextParts: string[] = [];
  if (charterSummary) contextParts.push(`Family charter: ${charterSummary}`);
  if (childrenContext) contextParts.push(childrenContext);
  if (weekContext) contextParts.push(weekContext);
  if (conundrumTitle) contextParts.push(conundrumTitle);
  if (skillContext) contextParts.push(skillContext);

  const dynamicContext = contextParts.length > 0
    ? `\n\nFamily context:\n${contextParts.join("\n")}`
    : "";

  const systemPrompt = `You are a helpful assistant for Shelly Barnes, a homeschool mom.

Shelly has fibromyalgia and homeschools two boys:
- Lincoln (10): neurodivergent, speech challenges, loves Minecraft, learns through hands-on activities
- London (6): loves drawing, stories, and creating games
${dynamicContext}

Guidelines:
- Be warm, practical, and specific. Shelly is busy — respect her time.
- When she asks about teaching ideas, connect them to what Lincoln and London are currently working on.
- When she asks about curriculum, consider Lincoln's skill level and what he's mastered vs. what's emerging.
- If she's frustrated or tired, acknowledge it genuinely. She has chronic pain and does heroic work every day.
- Keep responses concise unless she asks for detail.
- You can reference the week's theme if it's relevant.
- If she asks you to generate an image, tell her to tap the image button.
- For printable activities, format them clearly with sections she can screenshot or print.`;

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
