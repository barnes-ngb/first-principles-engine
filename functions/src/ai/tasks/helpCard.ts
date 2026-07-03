import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";
import { sanitizeAndParseJson } from "../sanitizeJson.js";

/**
 * Task: helpCard (FEAT-43, slice 1 of FEAT-40)
 *
 * Generates the inline Today Help Card body for ONE checklist item: a playable
 * game ("Play it"), a two-kid variant, a micro-script ("Say this"), an
 * attention-rescue alternative, an MVD ≤5-min version, and a skip signal.
 *
 * Context: charter + child profile + skill snapshot + word mastery + recent
 * scans + recent per-domain history + week focus (via buildContextForTask —
 * passive signals FIRST; manual logs enrich but are never required).
 * Model: Sonnet.
 *
 * The video half is NOT generated here — it is lazy-fetched client-side on
 * first card expand via the existing `lessonVideo` task and cached on the card
 * doc (D3). This handler only authors the text body.
 */

/** Input the client sends for one checklist item. */
export interface HelpCardInput {
  label: string;
  subjectBucket?: string;
  contentGuide?: string;
  skillTags?: string[];
}

interface HelpCardPlayIt {
  title: string;
  howTo: string[];
  minutes: number;
  materials: string[];
}

export interface HelpCardOutput {
  playIt: HelpCardPlayIt;
  twoKid: string;
  sayThis: string[];
  attentionRescue: string;
  mvdVersion: string;
  skipSignal: string;
}

/** Parse the checklist-item input from the last user message (code-fence tolerant). */
export function parseHelpCardInput(raw: string): HelpCardInput {
  const input = sanitizeAndParseJson<HelpCardInput>(raw);
  const label = (input?.label ?? "").trim();
  if (!label) {
    throw new Error("A checklist item label is required to generate a Help Card.");
  }
  return {
    label,
    subjectBucket: (input.subjectBucket ?? "").trim() || undefined,
    contentGuide: (input.contentGuide ?? "").trim() || undefined,
    skillTags: Array.isArray(input.skillTags)
      ? input.skillTags.filter((t): t is string => typeof t === "string" && !!t.trim())
      : undefined,
  };
}

/**
 * Validate + normalize a parsed Help Card body. Throws on a structurally
 * unusable response; clamps `minutes` into the 2-10 band the prompt asks for.
 */
export function parseHelpCardOutput(raw: string): HelpCardOutput {
  const parsed = sanitizeAndParseJson<HelpCardOutput>(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Help Card response is not a JSON object.");
  }
  const play = parsed.playIt;
  if (!play || typeof play !== "object") {
    throw new Error("Help Card response missing playIt.");
  }
  const howTo = Array.isArray(play.howTo)
    ? play.howTo.filter((s): s is string => typeof s === "string" && !!s.trim())
    : [];
  const materials = Array.isArray(play.materials)
    ? play.materials.filter((s): s is string => typeof s === "string" && !!s.trim())
    : [];
  const sayThis = Array.isArray(parsed.sayThis)
    ? parsed.sayThis.filter((s): s is string => typeof s === "string" && !!s.trim())
    : typeof parsed.sayThis === "string" && (parsed.sayThis as string).trim()
      ? [(parsed.sayThis as string).trim()]
      : [];
  if (!play.title || howTo.length === 0 || sayThis.length === 0) {
    throw new Error("Help Card response is missing required fields.");
  }
  const minutesRaw = typeof play.minutes === "number" ? play.minutes : 5;
  const minutes = Math.min(10, Math.max(2, Math.round(minutesRaw)));

  return {
    playIt: { title: play.title.trim(), howTo, minutes, materials },
    twoKid: (parsed.twoKid ?? "").trim(),
    sayThis,
    attentionRescue: (parsed.attentionRescue ?? "").trim(),
    mvdVersion: (parsed.mvdVersion ?? "").trim(),
    skipSignal: (parsed.skipSignal ?? "").trim(),
  };
}

/**
 * Build the Help Card system prompt. `familyContext` is the assembled slice
 * text (charter FIRST, then child profile + passive signals). Pure + exported
 * for unit testing the prompt wiring.
 */
export function buildHelpCardSystemPrompt(
  familyContext: string,
  childName: string,
): string {
  return `${familyContext}

You are writing an inline "Help Card" for ${childName}'s homeschool parent (Shelly)
for ONE item on today's checklist. This is the help she sees the moment she taps
the item — a playable game, exactly what to say, and a rescue plan when it isn't
landing. It is HELP, not assessment.

GROUND IT IN WHAT YOU KNOW (passive signals FIRST):
- The child's working levels, recent quest/eval findings, sight-word mastery, and
  most-recent scan above are the durable evidence base — they are current even on
  a week with no manual logs. Build the card on THOSE.
- The snapshot's supports + stop rules are your source for "Say this" and the
  skip signal. Do NOT invent new stop rules — surface the ones that exist; if
  none exist, write a single gentle "stop while it's still okay" line.
- NEVER reference a logging gap. NEVER imply Shelly should have logged more, done
  more, or that the child is behind. Gaps are normal, not failure. No shame.
- NO scores, NO percentages, NO grades anywhere in the text. "Growing", not
  "passing".

WRITE FOR THIS FAMILY'S REALITY:
- Two kids in the room by default. Every card carries a two-kid variant: either
  "London plays too" or "Lincoln teaches London" (the teach-back / Feynman
  mechanic — prefer this when the skill supports being explained aloud).
- Materials must be things already in a normal house (paper, tiles, LEGO,
  index cards, a whiteboard) — never a purchase or a printout.
- "attentionRescue" is the most important field: a GENUINELY DIFFERENT approach
  for when the first isn't landing or attention is gone — a movement version, a
  game swap, or a change of modality. It must NOT be a reword of "Play it".
- "mvdVersion" is a ≤5-minute floor version of the game for a flare / low-energy
  day. Still real school.
- Charter voice: warm, concrete, no prep, Lincoln = Minecraft-framed / short /
  visual / narration-over-writing when it fits.

OUTPUT FORMAT (JSON only, no markdown, no code fences):
{
  "playIt": {
    "title": "Short game name",
    "howTo": ["step 1", "step 2", "step 3"],
    "minutes": 5,
    "materials": ["things already in the house"]
  },
  "twoKid": "One line: London plays too OR Lincoln teaches London.",
  "sayThis": [
    "How to open it in one line.",
    "One line to say when the child stalls (drawn from the supports above).",
    "What 'good for today' looks like (level-specific, not a generic rubric)."
  ],
  "attentionRescue": "A genuinely different approach when it isn't landing — movement / game / modality swap. Not a reword of Play it.",
  "mvdVersion": "A <=5-minute version of the game for a low-energy day.",
  "skipSignal": "When to stop — from the existing stop rules, or one gentle 'stop while it's still okay' line."
}

- "minutes" is a number between 2 and 10.
- "howTo" is 2-4 steps.
- "sayThis" is 3-5 short lines.

Respond ONLY with valid JSON.`;
}

/** Build the user message describing the checklist item to help with. */
export function buildHelpCardUserMessage(input: HelpCardInput): string {
  const lines = [`Checklist item: ${input.label}`];
  if (input.subjectBucket) lines.push(`Subject: ${input.subjectBucket}`);
  if (input.contentGuide) lines.push(`What to cover today: ${input.contentGuide}`);
  if (input.skillTags?.length) lines.push(`Skill tags: ${input.skillTags.join(", ")}`);
  return `Write the Help Card for this item.\n\n${lines.join("\n")}`;
}

export const handleHelpCard = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, messages, apiKey } = ctx;
  const model = modelForTask("helpCard" as never);

  const input = parseHelpCardInput(messages[messages.length - 1]?.content ?? "{}");

  const contextSections = await buildContextForTask("helpCard", {
    db,
    familyId,
    childId,
    childData,
    snapshotData: ctx.snapshotData,
    domain: ctx.domain,
  });
  const familyContext = contextSections.join("\n\n");

  const systemPrompt = buildHelpCardSystemPrompt(familyContext, childData.name);
  const userMessage = buildHelpCardUserMessage(input);

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 2048,
    systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  // Validate the body parses before returning (throws → surfaced as task error).
  const parsed = parseHelpCardOutput(result.text);
  const clean = JSON.stringify(parsed);

  console.log(
    `[AI] taskType=helpCard inputTokens=${result.inputTokens} outputTokens=${result.outputTokens} stopReason=${result.stopReason}`,
  );

  await logAiUsage(db, familyId, {
    childId,
    taskType: "helpCard",
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return {
    message: clean,
    model,
    usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
  };
};
