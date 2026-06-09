import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { CHARTER_PREAMBLE, formatChildProfile } from "../contextSlices.js";
import { sanitizeAndParseJson } from "../sanitizeJson.js";

/**
 * Task: lessonVideo
 * Given a lesson topic (and optional objective / subject bucket), finds ONE
 * short, kid-friendly, age-appropriate video that helps teach the lesson. The
 * child's age + interests/motivators are loaded server-side (from childData)
 * and folded into the prompt: the child's interests are a SOFT tiebreaker
 * theme only — relevance, accuracy, and age-appropriateness always win.
 *
 * Used by the in-context Lesson Video dialog on parent Today (FEAT-20). The
 * caller passes only lesson facts + childId; "Find another" re-calls with the
 * previous url added to `exclude`. Web search is enabled with a small budget.
 *
 * Context: CHARTER_PREAMBLE + child profile (age + motivators + interests)
 * Model: Sonnet
 */

interface LessonVideoOutput {
  title: string;
  url: string;
  source?: string;
  why?: string;
  lengthNote?: string;
  themeTieIn?: string;
}

export const handleLessonVideo = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, messages, apiKey } = ctx;
  const model = modelForTask("lessonVideo" as never);

  // Parse input from the user message
  let lessonTopic = "";
  let lessonObjective = "";
  let subjectBucket = "";
  let exclude: string[] = [];
  let refine = "";

  try {
    const userMsg = messages[messages.length - 1]?.content ?? "{}";
    const input = sanitizeAndParseJson<{
      lessonTopic?: string;
      lessonObjective?: string;
      subjectBucket?: string;
      exclude?: string[];
      refine?: string;
    }>(userMsg);
    lessonTopic = (input.lessonTopic ?? "").trim();
    lessonObjective = (input.lessonObjective ?? "").trim();
    subjectBucket = (input.subjectBucket ?? "").trim();
    refine = (input.refine ?? "").trim();
    if (Array.isArray(input.exclude)) {
      exclude = input.exclude.filter((u): u is string => typeof u === "string" && !!u.trim());
    }
  } catch {
    // Fall through — will validate lessonTopic below
  }

  if (!lessonTopic) {
    throw new Error("A lesson topic is required to find a video.");
  }

  console.log(`[lessonVideo] Starting search`, {
    lessonTopic,
    lessonObjective,
    subjectBucket,
    childId,
    excludeCount: exclude.length,
    refine: refine || undefined,
  });

  // Child profile (age + motivators + interests) built server-side from the
  // shared childProfile builder — the client never passes these.
  const childProfileBlock = formatChildProfile({
    name: childData.name,
    birthdate: childData.birthdate,
    grade: childData.grade,
    motivators: childData.motivators,
    interests: childData.interests,
    strengths: childData.strengths,
  });

  const lessonLines = [`Lesson topic: ${lessonTopic}`];
  if (lessonObjective) lessonLines.push(`Lesson objective (what to cover): ${lessonObjective}`);
  if (subjectBucket) lessonLines.push(`Subject: ${subjectBucket}`);
  const excludeLine = exclude.length
    ? `\n\nDo NOT return any of these already-shown videos (pick a different one):\n${exclude.map((u) => `- ${u}`).join("\n")}`
    : "";

  // FEAT-23: parent steer. Strong preference for kind/energy/length — but the
  // lesson topic stays the anchor (relevance/accuracy/age-fit always win).
  const refineBlock = refine
    ? `

REFINEMENT: The parent asked to refine the result: "${refine}". Treat this as a STRONG preference for the kind / energy / length of video — but never at the expense of relevance to the lesson topic, accuracy, or age-appropriateness. The lesson topic stays the anchor: e.g. a "movement / exercise" request means a get-up-and-move video that still teaches THIS topic.`
    : "";

  const systemPrompt = `${CHARTER_PREAMBLE}

${childProfileBlock}

You are helping a homeschooling parent find ONE short, kid-friendly video to
help teach today's lesson to the child profiled above.

Rules:
- Find a SINGLE video that is genuinely on-topic for the lesson objective, and
  is age-appropriate and high-quality for the child's age above.
- Relevance, accuracy, and quality come FIRST. The child's interests/motivators
  above are a SOFT tiebreaker theme only: prefer a video that ties into them
  ONLY when a quality, on-topic, age-appropriate match exists. NEVER sacrifice
  relevance, accuracy, or quality for the theme — fall back to the best plain
  video when no good themed match exists.
- Prefer reputable, kid-safe sources (e.g. well-known educational channels).
  Keep it short — a few minutes is ideal for a young child.
- "title" = the video's actual title. "url" = a direct, working link to watch
  or cast it. "source" = the channel/site (e.g. "YouTube — Khan Academy Kids").
- "why" = 1-2 sentences on why this video fits the lesson and the child.
- "lengthNote" = the approximate length (e.g. "about 4 minutes").
- "themeTieIn" = 1 sentence on the interest tie-in if you used one; OMIT this
  field entirely when the pick is a plain best-fit video with no theme tie-in.${refineBlock}

Return ONLY a single JSON object, no prose, no code fences:
{"title": "...", "url": "...", "source": "...", "why": "...", "lengthNote": "...", "themeTieIn": "..."}`;

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 1024,
    systemPrompt,
    messages: [
      {
        role: "user",
        content: `Find one video for this lesson:\n${lessonLines.join("\n")}${excludeLine}`,
      },
    ],
    webSearch: { maxUses: 2 },
  });

  // Validate the response parses to an object with a title + url.
  try {
    const parsed = sanitizeAndParseJson<LessonVideoOutput>(result.text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Response is not a JSON object");
    }
    if (!parsed.title || !parsed.url) {
      throw new Error("Response missing title or url");
    }
    // Re-serialize to ensure clean JSON in the response
    result.text = JSON.stringify(parsed);
    console.log(`[lessonVideo] Success`, {
      lessonTopic,
      title: parsed.title,
      url: parsed.url,
      source: parsed.source,
      themed: !!parsed.themeTieIn,
    });
  } catch (err) {
    console.error("[lessonVideo] Failed to parse response", {
      lessonTopic,
      childId,
      error: String(err),
      responsePreview: result.text.substring(0, 200),
    });
    throw new Error("Couldn't find a video for this lesson. Please try again.");
  }

  console.log(`[AI] taskType=lessonVideo inputTokens=${result.inputTokens} outputTokens=${result.outputTokens} stopReason=${result.stopReason}`);

  await logAiUsage(db, familyId, {
    childId,
    taskType: "lessonVideo",
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
