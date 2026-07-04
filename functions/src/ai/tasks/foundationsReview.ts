/**
 * Task: foundationsReview  (FEAT-51, slice 2a — the Foundations Review Chat)
 *
 * A subject-scoped (reading / math) parent conversation that establishes a
 * child's concept states **by evidence or by testing**, one concept at a time
 * (design §11). It MIRRORS `shellyChat`'s propose → confirm → write shape but is
 * a **separate task** so the existing Shelly chat is untouched: its own system
 * prompt, its own `<action>` grammar, and a client-side write layer that touches
 * only `learnerModels/{childId}`.
 *
 * Context: charter + childProfile (via buildContextForTask). The **review agenda**
 * — the priority-ordered concepts with plain-language names, current state, and
 * evidence — is computed CLIENT-SIDE (deterministically) and rides in the first
 * user message inside a `[FOUNDATIONS_REVIEW]{…}[/FOUNDATIONS_REVIEW]` marker. The
 * LLM *follows* that order; it never invents it (§11.1). The foundations graph is
 * client-only static data, so it is summarized per concept in the agenda, never
 * dumped wholesale.
 *
 * Model: Sonnet. No web search. Vision arrives with slice 2b (FEAT-53): a parent
 * can attach photo(s) + a one-line context; the handler detects `[IMAGE_URL:…]`
 * markers on the last user message and routes to the URL-vision helper.
 */
import type { ChatTaskContext, ChatTaskResult, ChatTaskMessage } from "../chatTypes.js";
import { callClaude, callClaudeWithVisionUrls, logAiUsage } from "../chatTypes.js";
import { buildContextForTask } from "../contextSlices.js";
import { modelForTask } from "../chat.js";

/** Pull leading `[IMAGE_URL:…]` markers (one or more) off a message content. */
const IMAGE_MARKER_RE = /\[IMAGE_URL:(https?:\/\/[^\]]+)\]/g;
export function extractImageUrls(content: string): { urls: string[]; text: string } {
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  IMAGE_MARKER_RE.lastIndex = 0;
  while ((m = IMAGE_MARKER_RE.exec(content)) !== null) urls.push(m[1]);
  const text = content.replace(IMAGE_MARKER_RE, "").trim();
  return { urls, text };
}

// ── The review agenda (client → CF) ─────────────────────────────

interface ReviewAgendaConcept {
  conceptId: string;
  /** kid-word name — plain language, never a band number. */
  name: string;
  /** one-line parent-facing description. */
  description: string;
  /** current stored state: solid | forming | frontier | not-yet. */
  state: string;
  /** human evidence one-liners already on record (may be empty). */
  evidence?: string[];
}

/** A compact external-curriculum bridge, threaded from the client (FEAT-53). */
interface ReviewAgendaBridge {
  source: string;
  version: number;
  units: Array<{ peak: number; phase: number; covers: string[]; depthOnly?: boolean }>;
}

interface ReviewAgenda {
  domain: string;
  subjectLabel: string;
  concepts: ReviewAgendaConcept[];
  /** Bridges for this domain — Fast Phonics for reading; empty for math. */
  bridges?: ReviewAgendaBridge[];
}

const AGENDA_RE = /\[FOUNDATIONS_REVIEW\]([\s\S]*?)\[\/FOUNDATIONS_REVIEW\]/;

/**
 * Pull the review agenda out of the first user message that carries the marker,
 * and return the messages with that marker payload replaced by a short, clean
 * "start the review" line (so the model sees a tidy conversation, and the agenda
 * lives only in the system prompt). Tolerant: a missing/unparseable marker yields
 * a null agenda and the messages pass through untouched.
 */
export function extractReviewAgenda(messages: ChatTaskMessage[]): {
  agenda: ReviewAgenda | null;
  messages: ChatTaskMessage[];
} {
  let agenda: ReviewAgenda | null = null;
  const out = messages.map((m) => {
    if (m.role !== "user") return m;
    const match = m.content.match(AGENDA_RE);
    if (!match) return m;
    if (!agenda) {
      try {
        agenda = JSON.parse(match[1].trim()) as ReviewAgenda;
      } catch {
        agenda = null;
      }
    }
    const stripped = m.content.replace(AGENDA_RE, "").trim();
    return {
      role: m.role,
      content: stripped || `Let's start the ${agenda?.subjectLabel ?? "reading"} review.`,
    };
  });
  return { agenda, messages: out };
}

/** Render the agenda as the ordered walk list the model must follow verbatim. */
export function formatAgenda(agenda: ReviewAgenda | null): string {
  if (!agenda || agenda.concepts.length === 0) {
    return "THE REVIEW AGENDA is empty — thank the parent and let them know there's nothing uncertain to review in this subject right now.";
  }
  const lines = agenda.concepts.map((c, i) => {
    const ev = c.evidence && c.evidence.length ? ` — on record: ${c.evidence.join("; ")}` : " — nothing on record yet";
    return `${i + 1}. [${c.conceptId}] "${c.name}" — ${c.description} (currently: ${c.state})${ev}`;
  });
  return `THE REVIEW AGENDA — walk these concepts in THIS EXACT ORDER, one per turn (do not reorder, do not skip ahead, do not invent concepts not on this list):\n${lines.join("\n")}`;
}

/**
 * Render the curriculum bridge table(s) as a peak → concept reference the model
 * uses to map an extracted position to reading-graph conceptIds. The CLIENT
 * re-grounds every proposal against this same table, so the model's mapping is a
 * proposal, not the final word — but a well-formed proposal saves a round-trip.
 */
export function formatBridges(agenda: ReviewAgenda | null): string {
  const bridges = agenda?.bridges ?? [];
  if (bridges.length === 0) return "";
  const blocks = bridges.map((b) => {
    const rows = b.units.map((u) => {
      const depth = u.depthOnly ? " (depth only — no new concept)" : "";
      return `  Peak ${u.peak} (phase ${u.phase}): ${u.covers.join(", ")}${depth}`;
    });
    return `BRIDGE for source "${b.source}" (v${b.version}) — a completed peak covers Peaks 1..N cumulatively:\n${rows.join("\n")}`;
  });
  return blocks.join("\n\n");
}

/**
 * The role + rules section. Encodes §11.1–11.2 and the §14 locked display rules.
 * `childId` is threaded into the `<action>` grammar so the model addresses the
 * right child; the app performs the write only on a confirm tap.
 */
export function buildFoundationsReviewRole(
  childId: string,
  childName: string,
  subjectLabel: string,
): string {
  const name = childName || "your child";
  return `You are the LEARNING ENGINE, the family's foundations review guide — not a person. You are running a FOUNDATIONS REVIEW for ${name}: a warm, ~10-minute conversation to figure out where ${name} really is in ${subjectLabel}. Address the parent directly as "you"; never assume or use the parent's name (you don't know which parent is typing). Be warm, but honest about being the engine. You and the parent are figuring this out together.

HOW THE REVIEW WORKS:
- Walk the concepts in THE REVIEW AGENDA in the given order, ONE concept per turn. Never batch several concepts into one message.
- For each concept, use PLAIN LANGUAGE only: the everyday name and the one-line description from the agenda. This is the single most important rule of tone.
- Briefly say what the concept is (in kid-words), then ask the parent which of these fits, offering the four paths conversationally (don't list them robotically):
  1. "I've seen ${name} do this" → you'll record that you've confirmed it.
  2. "We've covered it in a curriculum/program" (ask which one) → you'll note it as covered — a step forward, but you'll suggest a quick check to be sure.
  3. "Let's test it" → you'll queue a short, kid-facing quest so ${name} shows it directly.
  4. "Not yet / skip" → totally fine, you move on, nothing is recorded.
- Skip any concept the agenda marks with strong recent evidence — don't re-litigate something already well established.
- When the parent answers, THEN (and only then) emit the matching action block (see below). If they're just chatting or unsure, ask a gentle follow-up — discussion is NOT a write.
- End whenever the parent wants. Ending early is not a failure.

WHEN YOU ASK FOR DETAIL — ALWAYS OFFER THE OUTS IN THE SAME BREATH:
- Fine-grained recall is hard and stressful. Any time you ask a detail question ("does he catch the beginning sound but lose the middle?"), offer these three outs in the SAME message so the parent never feels cornered:
  1. "Or snap a photo of some recent work and I'll read it" (uploads are available — this is often the easiest path).
  2. "Or we can just test it" (queues a short, kid-facing quest so ${name} shows it directly).
  3. "Or 'not sure' is a perfectly good answer — we'll skip it and can come back later" (no shame, revisit anytime).
- If the parent's answer signals uncertainty ("I think so", "not sure", "hard to say", "maybe"), do NOT press with a second recall-detail follow-up. Move straight to the outs — offer the photo, the test, or the skip — and go to the next concept.

TONE — NO SHAME, EVER:
- Gaps are normal and expected; "not yet" means "we haven't seen it," never "can't."
- NEVER imply the parent should have logged more, tracked more, or done more. A sparse record is fine — that's exactly why you're talking.
- "frontier" is a positive: it's the edge you're working at. Celebrate progress; there are no grades here.

DISPLAY RULES (LOCKED — never break these):
- NEVER show band numbers, grade levels, or "level N" to the parent. Use the plain names only.
- NEVER show percentages or raw counts framed as scores (no "3 of 350", no "1%"). If you mention how something is known, name the source in plain words ("from the June check", "you told me", "Fast Phonics").

WHEN THE PARENT PICKS A PATH, append the matching action AFTER your prose, one JSON object per <action> block, using ${name}'s id "${childId}" and the exact conceptId from the agenda:
- Path 1 (they've seen it): <action>{"kind":"attest","childId":"${childId}","conceptId":"<id from agenda>","state":"solid","note":"<what they described, brief>"}</action>
    Use "state":"solid" only if they're confident he does it well; use "forming" if it's emerging, "frontier" if it's the current working edge.
- Path 2 (covered in a program): <action>{"kind":"covered","childId":"${childId}","conceptId":"<id>","source":"<program name they gave>","unit":"<peak/lesson/page if they said one>","detail":"<counts/scores if given, plain>"}</action>
    Coverage is a step forward but not proof of mastery — always pair it with a friendly "want to do a quick check to be sure?".
- Path 3 (test it): <action>{"kind":"queueTest","childId":"${childId}","conceptId":"<id>","reason":"<why, brief>"}</action>
- Path 4 (not yet / skip): emit NOTHING. Just acknowledge kindly and move to the next concept.

IF THE PARENT UPLOADS A PHOTO (with a one-line context) — extract into a SINGLE batch of action blocks. There are TWO kinds of photo; the parent's context tells you which:

A) A CURRICULUM-APP SCREENSHOT (e.g. "these are Fast Phonics" — a progress page, peak/lesson list, quiz results):
   - Extract the structured POSITION you can actually see: the highest completed peak/lesson number, words-known counts, completion dates, quiz scores.
   - Map that position through the BRIDGE for the named source (shown below in "CURRICULUM BRIDGES"). A completed peak covers Peaks 1..N cumulatively — propose one \`covered\` action PER concept the bridge lists for the completed position, each with "source":"<bridge source>" and "unit":"Peak N" (N = the highest completed peak, on EVERY covered action so the app can ground the batch). Do NOT invent concepts the bridge doesn't list for that position, and do NOT propose anything ahead of the completed peak.
   - Words-known counts (e.g. "548 words known", "100% quizzes") are decodable-words-read milestones, NOT sight-word mastery. Attach them as the plain "detail" on the sightWords \`covered\` action ("548 words known · 100% end-of-peak quizzes") — NEVER as an \`attest\`/mastery claim.
   - If the named source has NO bridge below, extract what you can and propose AT MOST a single generic \`covered\` with the source name and no invented position.
   - (These \`covered\` proposals are all coverage, not proof — the app caps them and queues a quick check.)

B) A PHOTO OF ${name}'s ACTUAL WORK (e.g. "a spelling page he did", a worksheet):
   - This is a real observation of ${name}'s work — propose \`attest\` actions grounded ONLY in what is visibly demonstrated. Describe the evidence plainly in "note", dated: e.g. "work sample: spelled CVC and digraph words correctly, pattern words partial".
   - Choose the state honestly from what the work shows: "solid" if clearly demonstrated well, "forming" if emerging, "frontier" if it's the working edge. A work sample is a parent-confirmed observation, so it MAY reach "solid" for what it clearly shows — unlike curriculum coverage.
   - Only attest concepts the work actually evidences. If the work is ambiguous, prefer "forming" or ask.

CRITICAL: NEVER say a change is saved or done. Say you've PROPOSED it and the parent confirms it with a tap. Be conservative — only emit an action when the parent has clearly indicated a path for THAT concept (a photo counts as indicating the concepts it shows). One concept, one turn in conversation; a photo may propose several at once.`;
}

export const handleFoundationsReview = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, messages, apiKey } = ctx;

  const { agenda, messages: cleanMessages } = extractReviewAgenda(messages);
  const subjectLabel = agenda?.subjectLabel || ctx.domain || "reading";

  // Shared context: charter (no-shame rails) + childProfile (name/age for tone).
  const contextSections = await buildContextForTask("foundationsReview", {
    db,
    familyId,
    childId: childId || "",
    childData: ctx.childData ?? { name: "" },
    snapshotData: ctx.snapshotData,
  });
  const sharedContext = contextSections.join("\n\n");

  const childName = ctx.childData?.name || "";
  const roleSection = buildFoundationsReviewRole(childId, childName, subjectLabel);
  const agendaSection = formatAgenda(agenda);
  const bridgeSection = formatBridges(agenda);

  const systemPrompt = `${sharedContext}

${roleSection}

${agendaSection}${bridgeSection ? `\n\nCURRICULUM BRIDGES (for reading positions from uploaded screenshots):\n${bridgeSection}` : ""}`;

  const model = modelForTask("foundationsReview" as never);
  const recentMessages = cleanMessages.slice(-20);

  // Vision path: if the last user message carries image markers (a mid-chat
  // upload, slice 2b), route to the URL-vision helper so the model can read the
  // photo(s). Transport mirrors shellyChat; the extraction instructions live in
  // the system prompt. Otherwise, the plain text path (unchanged from 2a).
  const lastUserMsg = [...recentMessages].reverse().find((m) => m.role === "user");
  const imaged = lastUserMsg ? extractImageUrls(lastUserMsg.content) : { urls: [], text: "" };

  let result: { text: string; inputTokens: number; outputTokens: number };
  if (lastUserMsg && imaged.urls.length > 0) {
    console.log(`[foundationsReview] Vision path — ${imaged.urls.length} image(s)`);
    const priorMessages = recentMessages
      .filter((m) => m !== lastUserMsg)
      .map((m) => ({ role: m.role, content: m.content }));
    result = await callClaudeWithVisionUrls({
      apiKey,
      model,
      maxTokens: 1500,
      systemPrompt,
      imageUrls: imaged.urls,
      textPrompt: imaged.text || "Here is a photo — extract what you can and propose it.",
      messages: priorMessages,
    });
  } else {
    result = await callClaude({
      apiKey,
      model,
      maxTokens: 1500,
      systemPrompt,
      messages: recentMessages,
    });
  }

  if (!result.text) {
    console.warn("Claude returned empty response", { model, taskType: "foundationsReview" });
  }

  console.log(
    `[AI] taskType=foundationsReview inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`,
  );

  await logAiUsage(db, familyId, {
    childId: childId || null,
    taskType: "foundationsReview",
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
