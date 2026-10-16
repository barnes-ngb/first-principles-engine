import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaudeWithVision, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";

/**
 * Task: scan
 * Context: childProfile + recentEval (via buildContextForTask)
 * Model: Sonnet (vision)
 */

/**
 * FEAT-141: what the app already knew at the moment the photo was taken. Passed
 * through the SAME scan call (never a second round-trip) so the one-line
 * `contentNote` is grounded in the day's context — which checklist item, which
 * subject — instead of guessed from pixels alone. Absent for scan callers that
 * have no checklist item (Progress per-card scan, certificate upload).
 */
export interface ScanCaptureContext {
  itemLabel?: string;
  subjectBucket?: string;
}

/*
 * ── The before-work page check does not run through this file's HANDLER ──────
 *
 * It is its own task (`pageCheck`) with its own handler in
 * `tasks/pageCheck.ts`. Nothing below branches on a declared purpose: a `scan`
 * request behaves exactly as it did before that feature existed, even if it
 * carries a `checkPurpose` field. That is what makes the split fail-closed in
 * both directions — a forged purpose cannot turn a scan prospective, and a
 * missing one cannot turn a page check retrospective.
 *
 * What DOES live here is the prospective PROMPT builder, next to the
 * retrospective one it must not resemble, so the two can be read — and tested —
 * against each other. It is called only by `handlePageCheck`.
 */

/**
 * The prospective prompt — its own prompt, its own schema, nothing inherited.
 *
 * It is NOT a section bolted onto {@link buildScanSystemPrompt}. The first
 * attempt did exactly that, and the result contradicted itself: the retrospective
 * prompt also instructs the model on CERTIFICATE detection (returning
 * `suggestedSnapshotUpdate.masteredSkills` and a `recommendedStartLevel`) and on
 * COVER PAGE handling (*"use this to set up workbook tracking"*), both of which
 * are instructions to propose exactly the record changes this check promises
 * never to make. A prompt that forbids mastery claims in one paragraph and asks
 * for a `masteredSkills` array in another is a prompt that will sometimes return
 * the array.
 *
 * So this is a separate, smaller question with a separate, smaller answer:
 * what is on the page, does it look workable today, why, what would you change,
 * and what could you not tell. No certificates, no cover setup, no skill
 * alignment, no snapshot suggestion.
 *
 * `pageType` is kept, and kept to the same vocabulary, because the client's
 * shared reply reader (`readScanAnalysis`) uses it to tell an analysis from a
 * refusal or an error envelope. Everything else here is this door's own.
 */
export function buildProspectiveCheckPrompt(
  childGrade: string | undefined,
  contextSections: string[],
  captureContext?: ScanCaptureContext,
): string {
  const gradeLine = childGrade ? `The student is in grade ${childGrade}.` : "";
  const captureSection = formatProspectiveCaptureContext(captureContext);
  const context = contextSections.filter((section) => section.trim().length > 0);

  return `You are helping a homeschool parent decide whether to use a page of work TODAY.

THE SITUATION: the parent is holding up a page the student has **NOT done yet** and asking one question — does this look about right for this student today, and what would you change if we used it?
${gradeLine ? `\n${gradeLine}\n` : ""}
WHAT THIS PHOTO IS AND IS NOT EVIDENCE OF:
- It is evidence about the PAGE: what it asks for, how much of it there is, how it is laid out.
- It is NOT evidence about the STUDENT. The student has not touched it. Do not state or imply what they know, have mastered, have already learned, are proficient in, or are ready to move past.
- The page's existence and its lesson/page number say NOTHING about whether earlier lessons, pages or levels were done. Never infer prior completion.
- Nothing you return changes any learning or progress record: no level, plan, workbook position, skill map, snapshot, hour or reward is written from this answer. Do not propose such an update or describe one as though it will happen.
- Do not claim to identify the student and do not use any name in any field.

WHAT YOU KNOW ABOUT THE STUDENT is only what appears below. If it contains no recorded level, skill or history evidence for this student, then you CANNOT judge fit: say so in "limits" and return "unclear" for both "estimatedDifficulty" and "recommendation". An honest "I cannot tell" is the correct answer and is always better than a confident guess.

${context.length > 0 ? context.join("\n\n") : "(No recorded level, skill or history evidence was supplied for this student.)"}${captureSection ? `\n\n${captureSection}` : ""}

Respond ONLY with valid JSON (no markdown fences, no commentary), in exactly this shape:

{
  "pageType": "worksheet|textbook|test|activity|other",
  "readable": true,
  "subject": "math|reading|writing|spelling|phonics|science|other|unknown",
  "specificTopic": "string — what the page actually asks for, e.g. 'two-digit addition with regrouping'. 120 characters MAX. Empty string if you cannot tell.",
  "estimatedDifficulty": "easy|appropriate|challenging|too-hard|unclear",
  "recommendation": "do|quick-review|modify|skip|unclear",
  "recommendationReason": "string — 240 characters MAX, ONE or TWO plain sentences about the PAGE's demands against the recorded evidence above. Hedge where you are unsure ('looks', 'may'). No claim about what the student knows.",
  "teacherNotes": "string — 240 characters MAX. The practical change you would make if they use it today: fewer problems, read it aloud, split it over two days, scaffold the first one. Empty string if you have none.",
  "limits": "string — 160 characters MAX. What you could NOT tell from this photo or from the evidence above. Empty string only if there is genuinely nothing.",
  "curriculumDetected": {
    "name": "string — the curriculum/workbook name if it is printed on the page, else null",
    "lessonNumber": "number — the lesson number if visible, else null",
    "pageNumber": "number — the page number if visible, else null"
  }
}

FIELD RULES:
- "readable": false when the photo is blank, cut off, blurred, upside-down or not a page of work. When it is false, set pageType "other", subject "unknown", specificTopic "", and "unclear" for difficulty and recommendation, and say what went wrong in "limits".
- "recommendation" is what the PARENT might do with this page today, never a verdict on the student:
  - "do" = looks usable as it is;
  - "quick-review" = looks easy for them, a little of it would do;
  - "modify" = usable with the change you name in "teacherNotes";
  - "skip" = it looks BELOW where the recorded evidence says they are working right now. This is a statement about the page's level, NOT a mastery claim, and it does not mean the student has finished anything;
  - "unclear" = you cannot responsibly say.
- Keep every string short, plain and specific. No praise, no diagnosis, no grade, no reading level, no prediction about what the student will achieve.
- For a neurodivergent learner, density matters: too many problems on one page, dense text, or crowded layout belongs in "teacherNotes".`;
}

/** The bullet lines both prompts share. */
function captureContextLines(ctx: ScanCaptureContext | undefined): string[] {
  const lines: string[] = [];
  if (ctx?.itemLabel) lines.push(`- Planned activity: ${ctx.itemLabel}`);
  if (ctx?.subjectBucket) lines.push(`- Subject: ${ctx.subjectBucket}`);
  return lines;
}

export function formatCaptureContext(ctx: ScanCaptureContext | undefined): string {
  if (!ctx) return "";
  const lines = captureContextLines(ctx);
  if (!lines.length) return "";
  return `CAPTURE CONTEXT (what the app knows about this photo — use it to ground contentNote):\n${lines.join("\n")}`;
}

/**
 * The same context, for the prospective prompt — which has no `contentNote`
 * field, so it must not be told to ground one. (The retrospective header above
 * is left exactly as it was.)
 */
function formatProspectiveCaptureContext(ctx: ScanCaptureContext | undefined): string {
  const lines = captureContextLines(ctx);
  if (!lines.length) return "";
  return `CAPTURE CONTEXT (what the app was told this photo is for — use it to help name the page, and ignore it where the image plainly disagrees):\n${lines.join("\n")}`;
}

export function buildScanSystemPrompt(
  childName: string,
  childGrade: string | undefined,
  contextSections: string[],
  captureContext?: ScanCaptureContext,
): string {
  const childLine = `Student: ${childName}${childGrade ? `, grade ${childGrade}` : ""}`;
  const captureSection = formatCaptureContext(captureContext);

  return `You are analyzing a photo of a workbook page, worksheet, certificate, or progress document for a homeschool student.

${childLine}

${contextSections.join("\n\n")}${captureSection ? `\n\n${captureSection}` : ""}

Analyze this page and respond ONLY with valid JSON (no markdown fences, no commentary):

{
  "pageType": "worksheet|textbook|test|activity|other",
  "subject": "math|reading|writing|spelling|phonics|science|other",
  "specificTopic": "string — e.g. 'two-digit addition with regrouping'",
  "skillsTargeted": [
    {
      "skill": "string — specific skill name",
      "level": "introductory|practice|mastery|review",
      "alignsWithSnapshot": "ahead|at-level|behind|unknown"
    }
  ],
  "estimatedDifficulty": "easy|appropriate|challenging|too-hard",
  "recommendation": "do|skip|quick-review|modify",
  "recommendationReason": "string — why this recommendation based on student's current level",
  "estimatedMinutes": number,
  "teacherNotes": "string — tips for the parent on how to present this page",
  "contentNote": "string — ONE line, 140 characters MAX, plainly describing what is actually in this photo",
  "curriculumDetected": {
    "provider": "gatb|reading-eggs|other|null",
    "name": "string — full curriculum name if identifiable (e.g., 'The Good and the Beautiful Language Arts Level 1'), or null",
    "lessonNumber": "number — the lesson number if visible, or null",
    "pageNumber": "number — the page number if visible, or null",
    "levelDesignation": "string — e.g., 'Level 1', 'Level K', 'Level 4', or null"
  }
}

COVER PAGE / TABLE OF CONTENTS DETECTION:
If the scanned image is a workbook COVER page or TABLE OF CONTENTS (not a lesson page):
- Extract the full curriculum name (e.g., "The Good and the Beautiful — Language Arts Level 2")
- Identify the subject area
- Count total lessons/units if a table of contents is visible
- Note the grade level if stated
Return the standard worksheet JSON but with these additions:
{
  "pageType": "textbook",
  "isCover": true,
  "totalUnits": <number of lessons/units if visible, or 0>,
  "gradeLevel": "<grade level if stated, or null>",
  "skillsTargeted": [],
  "recommendation": "do",
  "recommendationReason": "Cover page scanned — use this to set up workbook tracking.",
  "estimatedMinutes": 0,
  "teacherNotes": "",
  "curriculumDetected": {
    "provider": "<gatb|reading-eggs|other>",
    "name": "<full curriculum name>",
    "lessonNumber": null,
    "pageNumber": null,
    "levelDesignation": "<e.g. Level 2>"
  }
}

CERTIFICATE / PROGRESS DOCUMENT DETECTION:
If the image is NOT a workbook page but IS a curriculum certificate, progress report, or completion document, respond with this alternative JSON format:

{
  "pageType": "certificate",
  "curriculum": "reading-eggs|gatb|other",
  "curriculumName": "string — full name (e.g., 'Reading Eggs', 'The Good and the Beautiful Language Arts Level 1')",
  "level": "string — level designation (e.g., 'Level 4', 'Level 1')",
  "milestone": "string — what was achieved (e.g., 'Map 13 complete — 100% Gold')",
  "lessonRange": "string — lesson numbers if visible (e.g., 'Lessons 121-130')",
  "skillsCovered": [
    "string — each skill or phonics pattern visible on the certificate"
  ],
  "wordsRead": ["string — any specific words listed"],
  "date": "string — date on the certificate if visible (e.g., '2026-03-11'), or empty string if not visible",
  "childName": "string — child name on the certificate, or empty string if not visible",
  "suggestedSnapshotUpdate": {
    "masteredSkills": ["string — skills to mark as mastered based on this certificate"],
    "recommendedStartLevel": number | null,
    "notes": "string — what this means for the child's current level"
  },
  "contentNote": "string — ONE line, 140 characters MAX, plainly describing what is in this photo",
  "curriculumDetected": {
    "provider": "gatb|reading-eggs|other|null",
    "name": "string — full curriculum name, or null",
    "lessonNumber": "number — the last lesson number from the range, or null",
    "pageNumber": null,
    "levelDesignation": "string — e.g., 'Level 1', or null"
  }
}

Look for indicators like: award logos, "is awarded to", "for achieving", level/map/lesson numbers, skills lists, completion dates, curriculum branding (Reading Eggs mascot, GATB nature imagery).

CURRICULUM IDENTIFICATION:
When analyzing a workbook page, also try to identify which curriculum it belongs to.
Look for:
- "The Good and the Beautiful" or TGTB branding, level indicators, lesson numbers in headers/footers
- "Reading Eggs" branding, map/lesson numbers
- Any other curriculum branding with identifiable lesson/page numbers

If you can identify the curriculum, fill in the curriculumDetected object.
The lessonNumber is the most important field — look for "Lesson 47", "L47", page headers with lesson numbers, etc.
If you can only identify the curriculum but not the exact lesson, set lessonNumber to null.
If you cannot identify any curriculum, set all curriculumDetected fields to null.

CONTENT NOTE (always include it):
Every image gets a "contentNote" — one short line saying what the photo actually
shows, so a parent scrolling months later knows what they are looking at.
- 140 characters MAX. One line. No sentence-final period needed.
- Describe what IS there, not what it means. "Lego castle with a working
  drawbridge" — not "shows persistence and spatial reasoning."
- Many photos are NOT workbook pages: a finished build, a drawing, a science
  setup, a kid holding a book. Describe those on their own terms and set
  pageType to "other" — do not force them into curriculum language.
- Where a capture-context block appears above, use it to help name what you
  see; do not repeat it back when the image plainly disagrees with it.
- No praise, no evaluation, no grade, no child's name. This line is parent-side
  metadata and is never shown to the child.

RULES:
- Be specific about skills. Don't say "math" — say "two-digit addition with regrouping" or "consonant blends: bl, cl, fl."
- Compare against the student's skill snapshot to determine if this is review, at-level, or advancement work.
- If the image is blurry, upside-down, or not a workbook page or certificate, set pageType to "other" and explain in recommendationReason.
- For neurodivergent learners, note if the page has too many problems, dense text, or other potential barriers in teacherNotes.`;
}

export const handleScan = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, apiKey } = ctx;

  const firstMsg = messages[0];
  if (!firstMsg) {
    return {
      message: JSON.stringify({ error: "No message provided" }),
      model: "none",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  let imageBase64: string;
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
  let captureContext: ScanCaptureContext | undefined;

  try {
    const parsed = JSON.parse(firstMsg.content) as {
      imageBase64?: string;
      mediaType?: string;
      captureContext?: ScanCaptureContext;
    };
    if (!parsed.imageBase64) {
      return {
        message: JSON.stringify({ error: "imageBase64 is required" }),
        model: "none",
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
    imageBase64 = parsed.imageBase64;
    if (parsed.mediaType) {
      mediaType = parsed.mediaType as typeof mediaType;
    }
    // FEAT-141: optional, additive. A caller that sends none gets exactly the
    // pre-FEAT-141 prompt.
    if (parsed.captureContext && typeof parsed.captureContext === "object") {
      captureContext = {
        ...(typeof parsed.captureContext.itemLabel === "string"
          ? { itemLabel: parsed.captureContext.itemLabel }
          : {}),
        ...(typeof parsed.captureContext.subjectBucket === "string"
          ? { subjectBucket: parsed.captureContext.subjectBucket }
          : {}),
      };
    }
  } catch {
    return {
      message: JSON.stringify({ error: "Expected JSON with imageBase64 field" }),
      model: "none",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  // Build context sections (child profile + skill snapshot)
  const contextSections = await buildContextForTask("scan", {
    db,
    familyId,
    childId,
    childData,
    snapshotData,
  });

  const model = modelForTask("plan"); // Sonnet for vision analysis
  const systemPrompt = buildScanSystemPrompt(
    childData.name,
    childData.grade,
    contextSections,
    captureContext,
  );

  const result = await callClaudeWithVision({
    apiKey,
    model,
    maxTokens: 1536,
    systemPrompt,
    imageBase64,
    mediaType,
    textPrompt: "Analyze this image. It may be a workbook page, certificate, or progress document. Identify the skills it targets or certifies and compare against the student's current skill levels.",
  });

  console.log(
    `[AI] taskType=scan childId=${childId} inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`,
  );

  await logAiUsage(db, familyId, {
    childId,
    taskType: "scan",
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return {
    message: result.text,
    model,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
    // UX-311: a scan whose reply was truncated by `max_tokens` and one the app
    // simply could not parse are different failures with different advice, and
    // without this they reached the client identically. Additive — a client on
    // an older build ignores it.
    stopReason: result.stopReason,
  };
};
