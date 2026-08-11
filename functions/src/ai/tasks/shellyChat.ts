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
 *          + general-branch only (no childId): every child's learnerModel slice
 *            concatenated under per-child headers (FEAT-60) — read-only, for
 *            grounded cross-child comparison; no actions are emitted here
 *          + child-scoped PLANNING-PARTNER MODE addendum in roleSection
 * Voice: parent-neutral — the prompt addresses the user as "you" and never
 *        asserts which parent is typing (FEAT-60; Learning Engine voice, FEAT-53).
 * Model: Sonnet
 */
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, callClaudeWithVisionUrls, logAiUsage } from "../chatTypes.js";

/**
 * Pull leading `[IMAGE_URL:…]` markers (one OR MORE) off a message content
 * (FEAT-59 — brings shellyChat to multi-image parity with foundationsReview).
 * A single marker behaves exactly as the prior single-image path.
 */
const IMAGE_MARKER_RE = /\[IMAGE_URL:(https?:\/\/[^\]]+)\]/g;
export function extractImageUrls(content: string): { urls: string[]; text: string } {
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  IMAGE_MARKER_RE.lastIndex = 0;
  while ((m = IMAGE_MARKER_RE.exec(content)) !== null) urls.push(m[1]);
  const text = content.replace(IMAGE_MARKER_RE, "").trim();
  return { urls, text };
}
import { buildContextForTask, loadLearnerModelContext } from "../contextSlices.js";
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

/**
 * An `activityConfigs` doc as the ACTIVITIES section reads it (FEAT-135).
 *
 * Deliberately a SEPARATE shape from `loadWorkbookPaces`' `WorkbookPace`: that
 * loader feeds pace/coverage reasoning for several tasks and filters to
 * `type == "workbook"`, so widening it to carry doc ids and non-workbook rows
 * would shift context under `plan`/`quest` too. This is the sibling read — it
 * changes nothing existing.
 */
export interface ChatActivityRow {
  id: string;
  name?: string;
  subjectBucket?: string;
  defaultMinutes?: number;
  frequency?: string;
  childId?: string;
  completed?: boolean;
}

/**
 * Format the ACTIVITIES section for a child-scoped chat (FEAT-135).
 *
 * This is what lets the assistant NAME an activity and address a
 * `setActivityMinutes` action at a real doc — without it the model has nothing
 * valid to put in a payload, which is precisely why the capability didn't exist
 * before. Each row carries the doc id, name, subject, current default minutes,
 * and frequency.
 *
 * Shared (`childId: 'both'`) configs are marked plainly with the names of every
 * child they cover, because changing one changes the number for all of them —
 * the parent has to be told that BEFORE she taps confirm, and the model can
 * only tell her if it can see it here.
 *
 * Completed activities are excluded, matching `loadWorkbookPaces`. Returns ""
 * when nothing survives, so the section is omitted rather than rendered empty.
 */
export function formatChatActivities(
  rows: ChatActivityRow[],
  allChildNames: string[],
): string {
  const active = rows.filter((r) => !r.completed);
  if (active.length === 0) return "";

  const names = allChildNames.filter((n) => n.trim().length > 0);
  const sharedLabel =
    names.length >= 2
      ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
      : names[0] || "every child";

  const lines = active.map((r) => {
    const parts = [`- ${r.name || "Untitled activity"}`];
    parts.push(`${r.defaultMinutes ?? 0} min`);
    if (r.frequency) parts.push(r.frequency);
    if (r.subjectBucket) parts.push(r.subjectBucket);
    let line = `${parts[0]} — ${parts.slice(1).join(", ")} (id: ${r.id})`;
    if (r.childId === "both") line += ` — shared: ${sharedLabel}`;
    return line;
  });

  return [
    "ACTIVITIES (the structured activities that build every plan — the minutes below are the DEFAULT each FUTURE plan uses):",
    ...lines,
    "",
    'Use the "id" exactly as written when you propose a setActivityMinutes action. An activity marked "shared" belongs to more than one child — changing its minutes changes it for all of them, so say so before proposing.',
  ].join("\n");
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
/**
 * The navigation-honesty rule (FEAT-135), shared by both role branches.
 *
 * The bug this exists to stop: asked to change how long math takes, the
 * assistant said it couldn't and sent the parent to "the app's schedule/settings
 * screen, usually under the child's subject or time-block settings". No such
 * screen exists. Settings holds account, soft profile, voice input, sticker
 * library, avatar admin and dev tools — nothing about durations. An invented
 * destination is worse than "I can't do that": it sends a parent hunting through
 * an app for something that was never there.
 *
 * So: name only screens listed here, or say it isn't in the app yet. The true
 * map for the thing that triggered this — activity durations — is Progress →
 * Curriculum, and the chat can now change that number directly anyway.
 */
const NAVIGATION_HONESTY_RULE = `
NAVIGATION HONESTY (hard rule): NEVER describe a screen, tab, setting, or menu you have not been told exists. If you can't do something, say so plainly and then either name a REAL screen from the map below or say it isn't in the app yet — those are the only two endings. Inventing a plausible-sounding location ("check the schedule settings screen") is worse than admitting the gap, because the parent will go looking for something that isn't there. If you are not certain a screen exists, do not name it.

The real map, for the things parents most often ask to change:
- Activities and how many minutes each one takes by default: Progress → Curriculum. (You can also change an activity's default minutes yourself, right here — see ACTIVITY TIME ACTIONS below, if that section is present.)
- The weekly plan itself: Plan My Week.
- Today's checklist: Today.
- Hours, compliance records, evaluations and the portfolio: Records.
- Account, profiles, voice input, stickers: Settings. Settings does NOT contain any schedule, subject-duration, or time-block screen — never send anyone there for one.`;

export function buildShellyChatRoleSection(childName: string | undefined): string {
  if (childName) {
    return `ROLE: You are the family's homeschool assistant. The ${childName} tab is selected, so prioritize ${childName}'s data and needs in your responses. Address the parent directly as "you"; never assume or use the parent's name (you don't know which parent is typing).

GUIDELINES:
- Be warm, practical, and specific. Respect the parent's time.
- You DO have access to ${childName}'s records — the data above is current. Never say "I don't have access to records" or "I can't see evaluations." If data is missing, say specifically what's not there yet and how to populate it (e.g., "No evaluations yet — running one from the Progress tab would help me give more specific advice").
- Connect suggestions to ${childName}'s skill snapshot and what's emerging vs. mastered.
- Reference recent evaluation findings when discussing what to work on.
- If engagement data shows frustration or low energy on certain subjects, acknowledge it and suggest alternatives.
- Homeschooling is heroic, tiring work. If you sense the parent is frustrated or tired, acknowledge it genuinely.
- Keep responses concise unless you're asked for detail.
- If you're asked to generate an image, say to tap the image button.
- For printable activities, format them clearly for screenshot or print.
${NAVIGATION_HONESTY_RULE}

PLANNING-PARTNER MODE: You have ${childName}'s recent evaluation history across reading (comprehension), math, fluency, and phonics (see EVALUATION HISTORY BY DOMAIN above), ${childName}'s disposition signals across curiosity, persistence, articulation, self-awareness, and ownership (see DISPOSITION PROFILE), curriculum coverage across the knowledge map — which nodes are mastered, in progress, or not yet started (see CURRICULUM MAP / COVERAGE), the year-to-date instructional-hours total against the reporting target (see HOURS PROGRESS), the week-over-week strip of recent reviews (see RECENT WEEKLY REVIEWS), and recent teach-backs (see RECENT TEACH-BACKS). Ground "where is ${childName} on the map" / "what have we covered" answers in CURRICULUM MAP / COVERAGE, and "are we on track for our hours" answers in HOURS PROGRESS, rather than guessing. For any question about ${childName}'s LEVEL, what to WORK ON next, or what curriculum/materials to BUY, ground the answer in the LEARNER MODEL section and SAY which evidence supports the level claim ("two sources agree — Fast Phonics and his June check"); the Learner Model covers reading & math only, so for any other subject (science, handwriting, etc.) say plainly that the model doesn't cover it rather than guessing. Use them to help the parent see patterns over time — what is shifting, what is steady, what connects across signals they have not linked. When the parent shares an observation about ${childName} mid-conversation, treat it as evidence they have earned the right to add to the picture — don't argue with it, build on it.`;
  }
  return `ROLE: You are the family's homeschool assistant. This is a general conversation — not focused on a specific child. Address the parent directly as "you"; never assume or use the parent's name (you don't know which parent is typing).

GUIDELINES:
- Be warm, practical, and specific. Respect the parent's time.
- When you're asked about teaching ideas, ask which child the parent is thinking about or suggest ideas for both.
- Cross-child comparison is welcome here — this is exactly what the general view is for. When you compare the children or are asked whether something fits both, ground each child's level claim in that child's block under PER-CHILD LEARNER MODELS, name the evidence behind the claim, and say plainly when a domain has no data (same honesty rails as the child tabs — never guess a level). The Learner Model covers reading & math only; for any other subject say the model doesn't cover it rather than guessing.
- Homeschooling is heroic, tiring work. If you sense the parent is frustrated or tired, acknowledge it genuinely.
- Keep responses concise unless you're asked for detail.
- If you're asked to generate an image, say to tap the image button.
- For printable activities, format them clearly for screenshot or print.
${NAVIGATION_HONESTY_RULE}`;
}

/**
 * Build the general-mode cross-child learner-model section (FEAT-60).
 *
 * The child-scoped context slices key on a single childId, so the general
 * (no-child) branch loads none of them — a cross-child curriculum question
 * ("does this cart cover both boys at their levels?") had no foundations to
 * ground on. This concatenates every child's `learnerModel` slice under a
 * clear per-child header so the assistant can compare children at their real
 * levels. Read-only: general mode emits no actions (the action addenda stay
 * child-tab-only), so this is grounding context, not a write surface.
 *
 * Takes pre-built slices (loaded by the caller) so it stays pure + testable.
 * Returns "" when no child has a usable model — omit-on-empty, the same rail
 * as the single-child slice.
 */
export function buildAllChildrenLearnerModels(
  children: Array<{ name: string; slice: string }>,
): string {
  const populated = children.filter((c) => c.slice.trim() !== "");
  if (populated.length === 0) return "";
  const blocks = populated.map((c) => `── ${c.name || "Unknown"} ──\n${c.slice}`);
  return `PER-CHILD LEARNER MODELS (each child's synthesized reading & math read — use these to compare children at their real levels; ground any level claim per child and name the evidence):\n\n${blocks.join("\n\n")}`;
}

/**
 * Build the `<action>` grammar addendum for the shellyChat system prompt
 * (Build Step 3b — sight words; Step 4 — `editProfileField` soft fields).
 *
 * Only emitted on a child-scoped tab (a real `childId`), since these actions
 * bind to a specific child. The model is told the active child's id so it can
 * address the action correctly; the app still performs the write only on the
 * parent's confirm tap. Returns "" on the general (no-child) branch.
 */
export function buildSightWordActionAddendum(
  childId: string | undefined,
  childName: string | undefined,
): string {
  if (!childId) return "";
  const who = childName || "this child";
  return `

SIGHT-WORD ACTIONS: When the parent clearly asks to ADD or REMOVE a sight word for ${who} (e.g. "add 'because' to ${who}'s sight words", "take 'the' off his list"), propose it with a structured action block. Otherwise, respond in normal prose — do NOT emit an action block when the parent is only discussing or asking about words.

Grammar — one trailing line per action, after your prose, using ${who}'s id exactly as given here ("${childId}") and a lowercase word:
<action>{"kind":"addSightWord","childId":"${childId}","word":"because"}</action>
<action>{"kind":"removeSightWord","childId":"${childId}","word":"the"}</action>

Rules:
- One JSON object per <action> block; lowercase the word; always use childId "${childId}".
- NEVER say the change is done. Say you've proposed it and it can be confirmed with a tap — the app performs the write only on confirm.
- Be conservative: if you're unsure whether the parent wants a write versus just talking about words, do NOT emit an action — ask or stay in prose.

PROFILE ACTIONS: When the parent clearly wants to update ${who}'s profile — only the freeform fields motivators, interests, or strengths (e.g. "add Lego to ${who}'s motivators", "he's really into dinosaurs now") — propose an editProfileField action. These are the ONLY editable profile fields: never propose this for grade, supports, priority skills, or anything else.

These are REPLACE writes, not appends: the app overwrites the whole field with your "value". You already have the current value in the CHILD PROFILE section above — compose the FULL intended new text (existing value plus the addition), not just the fragment, so the value is a clean replacement.

Grammar — one trailing line, after your prose, using ${who}'s id exactly ("${childId}"):
<action>{"kind":"editProfileField","childId":"${childId}","field":"motivators","value":"Minecraft, Lego, Art"}</action>

Rules:
- field must be exactly one of: motivators, interests, strengths.
- value is the full new text for that field (merge in the change yourself).
- NEVER say it's done. Say you've proposed it and it's confirmed with a tap — the parent sees a before → after preview first.
- Be conservative: discussion is not a write. Only propose when the parent clearly asks to change the profile.`;
}

/**
 * Build the additive Skill-Snapshot `<action>` grammar addendum (Build Step 6b
 * — Tier C Option 2).
 *
 * Teaches the model to propose ONLY additive snapshot edits — add a priority
 * skill / support / stop rule, or mark a skill the parent says the child has —
 * each confirmed by a tap. Removals, downgrades, and level-lowering are impossible
 * in the app (the future Option 3), so the model must NEVER emit one; if the parent
 * asks to remove/lower something it says that's coming later and offers to note
 * it (which can become a friction-capture entry) rather than emitting an action.
 *
 * Only emitted on a child-scoped tab (a real `childId`), like the other action
 * grammars. Framed as higher-stakes since it edits the authoritative "what to
 * teach next" record. Returns "" on the general (no-child) branch.
 */
export function buildSnapshotActionAddendum(
  childId: string | undefined,
  childName: string | undefined,
): string {
  if (!childId) return "";
  const who = childName || "this child";
  return `

SKILL-SNAPSHOT ACTIONS (higher-stakes — this edits ${who}'s authoritative "what to teach next" record): When the parent clearly wants to ADD a focus to the snapshot — a priority skill, a support, or a stop rule — or to mark a skill they say ${who} has, propose ONE additive action. Examples: "let's add inference to his list", "he needs a movement break every 10 minutes", "stop the lesson if he melts down", "he's solid on CVCe now".

Grammar — one JSON object per <action> block, after your prose, using ${who}'s id exactly ("${childId}"):
<action>{"kind":"addPrioritySkill","childId":"${childId}","skill":"inference from passages"}</action>
<action>{"kind":"addSupport","childId":"${childId}","support":"movement break every 10 min"}</action>
<action>{"kind":"addStopRule","childId":"${childId}","rule":"stop the session if frustration spikes"}</action>
<action>{"kind":"markSkillProgress","childId":"${childId}","skill":"CVCe long vowels","mastered":true}</action>

Rules:
- ADDITIVE ONLY. The app cannot remove, downgrade, or lower a level. If the parent asks to REMOVE a skill, DELETE a support, or LOWER/DOWNGRADE a level, say that capability is coming later and offer to note it for later — do NOT emit any action.
- For markSkillProgress: set "mastered":true only when the parent says the child has fully got it; omit "mastered" (or set it false) to mark a skill as progressing rather than mastered.
- NEVER claim it's done. Say you've proposed it and it's confirmed with a tap; the parent sees a clearly-labeled "Updates the skill snapshot" card first.
- One JSON object per <action> block. Be conservative: only propose when the parent clearly wants to change the snapshot. Discussion is not a write.`;
}

/**
 * Build the `setActivityMinutes` grammar addendum (FEAT-135).
 *
 * The chat's answer to "make math 30 minutes". Taught from the ACTIVITIES
 * section above it: the model picks a REAL doc id off that list and proposes a
 * single-field change to that activity's default duration, which every future
 * plan then reads. Confirmed by a tap, like every other portal write.
 *
 * Kept explicitly distinct from `proposePlanAdjustment`: a standing default for
 * ONE activity is this write; a shape change to next week (drop / repace /
 * reorder a subject) is the handoff. Without that line the model reaches for the
 * bigger tool when the parent just wants a number changed.
 *
 * Only emitted on a child-scoped tab (a real `childId`), like the other action
 * grammars. Returns "" on the general (no-child) branch.
 */
export function buildActivityMinutesActionAddendum(
  childId: string | undefined,
  childName: string | undefined,
): string {
  if (!childId) return "";
  const who = childName || "this child";
  return `

ACTIVITY TIME ACTIONS (you CAN change how long an activity is by default): When the parent says an activity should take a different amount of time from now on — "math should be 30 minutes", "make reading 45 from now on", "we only ever do 20 minutes of handwriting, set it to that" — propose ONE setActivityMinutes action using the real id from the ACTIVITIES section above.

Grammar — one JSON object per <action> block, after your prose, using ${who}'s id exactly ("${childId}") and an activity id copied exactly from the ACTIVITIES list:
<action>{"kind":"setActivityMinutes","childId":"${childId}","activityConfigId":"<id from ACTIVITIES>","minutes":30}</action>

Rules:
- "activityConfigId" MUST be copied exactly from the ACTIVITIES section. NEVER invent, guess, or reconstruct an id. If you can't find the activity the parent means in that list, ask which one they mean — do NOT emit an action.
- "minutes" must be a whole number between 5 and 120. A value outside that range is rejected outright, so don't propose one — say what the limits are instead.
- This sets the DEFAULT for FUTURE plans. It does not change this week's plan, today's checklist, or any hours already recorded. Say that plainly, and never imply that today or a past day changed.
- If the activity is marked "shared" in ACTIVITIES, TELL the parent it changes the time for both boys before you propose it.
- One activity per action. If the parent names two ("30 for math and 20 for reading"), emit two separate action blocks.
- NEVER say it's done. Say you've proposed it and it takes effect once they confirm — they see the activity name and the old → new time on a card first.
- This is for a STANDING default. If what they want is a change to next week's plan SHAPE — drop a subject, repace it, shift toward a lighter week, change the week's focus — use the plan-adjustment handoff below instead. Changing a number = this action; changing the week = the handoff. Discussion is not a write.`;
}

/**
 * Build the `proposePlanAdjustment` HANDOFF grammar addendum (chunk 2A/2).
 *
 * When the parent wants a **next-week plan change** — drop/reduce/repace a
 * subject, shift toward an MVD week, change the focus — the model proposes ONE
 * `proposePlanAdjustment` action instead of a snapshot action. This is a
 * HANDOFF, not a write: on the parent's tap the chat stages a brief and opens
 * Plan My Week, where they review and lock in via the existing flow. The chat
 * never writes the plan. Snapshot-level tweaks (add a priority skill / support /
 * stop rule, mark a skill) still use the additive `add*` actions; silent
 * friction capture is untouched.
 *
 * FEAT-135 widened the TRIGGER only. The original wording scoped this to a
 * parent "voicing frustration", so a calm, specific "can we do 30-45 minutes
 * instead" read as out of scope — and the model, having no in-scope tool,
 * invented a settings screen to send her to. Frustration was never the point:
 * a calm request to repace or resize a subject next week is exactly what this
 * handoff is for. Everything else — the handoff framing, "never claim the plan
 * is changed", the grounding requirement — is unchanged.
 *
 * Only emitted on a child-scoped tab (a real `childId`), like the other action
 * grammars, since the brief binds to a specific child. Returns "" on the
 * general (no-child) branch.
 */
export function buildPlanAdjustmentActionAddendum(
  childId: string | undefined,
  childName: string | undefined,
): string {
  if (!childId) return "";
  const who = childName || "this child";
  return `

PLAN-ADJUSTMENT HANDOFF (next-week plan change — NOT a snapshot edit, NOT a write): When the parent wants ${who}'s NEXT WEEK plan changed — drop or reduce a subject, repace it, shift toward a lighter / Minimum Viable week, or change the week's focus (e.g. "math is melting him down, let's pull way back next week", "reading isn't landing — can we do less and lean on read-alouds", "next week needs to be a survival week", "let's make next week lighter across the board") — propose ONE plan-adjustment action. Ground it in the state you can see above (evaluation history, disposition signals, hours progress, coverage), not a guess.

The parent does NOT have to be upset for this to apply. A calm, specific request to repace or resize a subject next week is exactly what this handoff is for — treat "can we do less math next week" the same as a frustrated version of it.

Grammar — one JSON object per <action> block, after your prose, using ${who}'s id exactly ("${childId}"):
<action>{"kind":"proposePlanAdjustment","childId":"${childId}","summary":"Reduce math to 10 min/day and lead with a hands-on warm-up","rationale":"Frustration is spiking in math and his disposition signals show persistence dropping this week"}</action>

Rules:
- This is a HANDOFF. Confirming it opens Plan My Week with your brief preloaded — the parent reviews and locks in the actual plan there. You do NOT write the plan, and you must NEVER claim the plan is changed or done.
- "summary" is the one-line change the parent will see in the planner; "rationale" is the grounded WHY (cite the signal). You may add "scope" or "targetWeek" as short optional hints, but they're not required.
- Use this for a change to the SHAPE of next week. To change how long ONE activity runs by default from now on, use setActivityMinutes above instead — that's a real write and it sticks. For a priority skill / support / stop rule or marking a skill, use the additive snapshot actions. For an unmet want or workflow friction, keep using silent friction capture. Ordinary discussion is not a handoff — be conservative and only propose when the parent clearly wants the plan to change.`;
}

/**
 * Build the `<friction>` grammar addendum for the shellyChat system prompt
 * (Build Step 5a — silent friction capture).
 *
 * Teaches the model to silently emit a single trailing `<friction>` block when
 * the parent voices an unmet want or friction with a workflow. This is invisible
 * plumbing: the model must NOT mention it, ask permission, or change its prose.
 * The app strips the block (`parseFriction`) and logs it fire-and-forget to the
 * `featureRequests` collection — feedback metadata, never a child's record, and
 * never routed through the confirm-gated action path. Always emitted (friction
 * can surface in general chat too), so it takes no childId argument.
 */
export function buildFrictionCaptureAddendum(): string {
  return `
FRICTION CAPTURE (silent, invisible plumbing): When the parent expresses they want something the app does NOT do, or voices friction/frustration with a workflow — e.g. "I wish I could just see all his missed words in one place" or "it's annoying that I can't reorder the checklist" — emit ONE trailing block capturing it, after everything else in your response:
<friction>{"quote":"<their words, verbatim>","interpretedWant":"<one-line summary of what they wanted>"}</friction>

Rules:
- DO NOT mention this to the parent, DO NOT ask permission, DO NOT change your prose — keep helping normally. The block is invisible; the parent never sees it.
- One <friction> block per turn at most, and ONLY when there is genuine signal.
- Be conservative: ordinary requests the app CAN already handle are not friction — only capture unmet wants or real workflow frustration.`;
}

/**
 * Build the WEB SEARCH guidance addendum for the shellyChat system prompt
 * (FEAT-12 Phase 1).
 *
 * Tells the assistant it may use Anthropic's server-side web search to look up
 * current/local information that helps the parent plan — activities, events,
 * materials, videos, and facts — and to cite what it finds with markdown links.
 * Parent-scoped only (shellyChat is already parent-only; web search is never
 * wired into any kid-facing task). Kept deliberately separate so it does not
 * disturb the role, `<action>`/`<friction>` grammars, or the `[FOLLOWUP]`
 * instruction.
 *
 * When a child is in context (child-scoped tab), an extra teaching-video block
 * (FEAT-20) tells the assistant to pitch any lesson-teaching video to that
 * child's age and to SOFTLY prefer their interests — without over-narrowing the
 * search or asking which child it's for (the chat is already child-scoped). On
 * the general (no-child) branch this block is omitted, so general and non-video
 * web-search behavior is unchanged.
 */
export function buildWebSearchAddendum(childName?: string): string {
  const base = `
WEB SEARCH: You can search the web for current or local information when it would genuinely help the parent plan — local activities and events, where to find materials or curricula, videos to watch or learn from together, and up-to-date facts. Use it when the answer depends on current, local, or specific information you don't already have; don't search for things you already know. When you draw on what you find, cite your sources as markdown links ([title](url)) so the parent can tap through, and keep the answer practical and planning-oriented. Favor recent, reputable sources, and stay within the homeschool-planning context.`;
  if (!childName) return base;
  return `${base}

TEACHING VIDEOS for ${childName}: When you search for a video to teach ${childName} a specific lesson, scope it to ${childName} using the CHILD PROFILE above:
- Pitch to ${childName}'s age and level — simpler, shorter, and gentler for a younger child.
- SOFTLY prefer a video that ties to ${childName}'s interests/motivators (from the profile above) — but only when a quality, on-topic, age-appropriate match exists. Interest fit is a tiebreaker, never a filter: never sacrifice relevance, accuracy, or quality for theme. If no good themed match exists, pick the best plain video on the topic.
- This chat is already about ${childName} — don't ask "which child is this for?". Use the known child.`;
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

  const [allChildrenResult, dispositionResult, reviewResult, conundrumResult, completionResult, conundrumArtifactsResult, chapterResponseResult, teachBacksResult, activityConfigResult] =
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
      // Activity configs (FEAT-135) — the ACTIVITIES section. A sibling read,
      // NOT a widening of loadWorkbookPaces: that loader filters to workbooks
      // and feeds pace reasoning for plan/quest too, so it stays exactly as it
      // is. Child-scoped only; the general branch emits no actions.
      childId
        ? db.collection(`families/${familyId}/activityConfigs`)
            .where("childId", "in", [childId, "both"])
            .get()
        : Promise.resolve(null),
    ]);

  // Format supplemental context
  let supplementalContext = "";
  let childName = ctx.childData?.name || "";
  // Every child's name, so the ACTIVITIES section (FEAT-135) can spell out who
  // a shared ('both') activity actually covers.
  const allChildNames: string[] = [];

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
        if (c.name) allChildNames.push(c.name);
        const parts = [c.name || "Unknown"];
        if (c.age) parts.push(`age ${c.age}`);
        if (c.description) parts.push(`— ${c.description}`);
        if (c.notes) parts.push(`(${c.notes})`);
        lines.push(`- ${parts.join(" ")}`);
      }
      supplementalContext += lines.join("\n");
    }
  }

  // Cross-child learner models — general (no-child) branch only (FEAT-60).
  // Child-scoped tabs already get the single-child `learnerModel` slice via
  // buildContextForTask; the general branch keys on no childId, so it loads
  // none. Load every child's slice so cross-child curriculum questions have
  // foundations to ground on. Read-only — no actions are emitted here.
  if (!childId && allChildrenResult.status === "fulfilled" && allChildrenResult.value) {
    const snap = allChildrenResult.value as { empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const perChild = await Promise.all(
        snap.docs.map(async (doc) => {
          const c = doc.data() as { name?: string };
          const slice = await loadLearnerModelContext(db, familyId, doc.id);
          return { name: c.name || "", slice };
        }),
      );
      const section = buildAllChildrenLearnerModels(perChild);
      if (section) supplementalContext += `\n\n${section}`;
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

  // ACTIVITIES (FEAT-135) — the doc ids + current default minutes the
  // setActivityMinutes action addresses. Without this section the model has no
  // valid id to put in a payload, which is exactly why it previously had to
  // deflect (and invented a settings screen doing so).
  if (activityConfigResult.status === "fulfilled" && activityConfigResult.value) {
    const snap = activityConfigResult.value as { empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> };
    if (!snap.empty) {
      const rows: ChatActivityRow[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<ChatActivityRow, "id">),
        id: d.id,
      }));
      const section = formatChatActivities(rows, allChildNames);
      if (section) supplementalContext += `\n\n${section}`;
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
    supplementalContext += `\n\nTEACHING REFLECTION DATA (use this when the parent asks how things are going):\n${reflectionLines.join("\n")}

When the parent asks about engagement, frustration, or how things are going, use this data.
Don't give generic homeschool advice — give advice based on what's actually happening.
Example: If the parent says "Lincoln seems bored with reading" and the data shows positive engagement but low quest completion, say: "His daily reading engagement looks positive — he might enjoy the workbook but find the quests too easy. Try increasing quest difficulty or switching to comprehension mode."`;
  }

  console.log(
    `[shellyChat] childId=${childId}, childName=${childName}, sharedContextLength=${sharedContext.length}, supplementalLength=${supplementalContext.length}`,
  );

  // ── Step C: Build system prompt with charter alignment ──────────
  const roleSection = buildShellyChatRoleSection(childId && childName ? childName : undefined);
  const sightWordActionAddendum = buildSightWordActionAddendum(childId || undefined, childName || undefined);
  const snapshotActionAddendum = buildSnapshotActionAddendum(childId || undefined, childName || undefined);
  const activityMinutesActionAddendum = buildActivityMinutesActionAddendum(childId || undefined, childName || undefined);
  const planAdjustmentActionAddendum = buildPlanAdjustmentActionAddendum(childId || undefined, childName || undefined);
  const frictionCaptureAddendum = buildFrictionCaptureAddendum();
  const webSearchAddendum = buildWebSearchAddendum(childId && childName ? childName : undefined);

  const systemPrompt = `${sharedContext}

${supplementalContext}

${roleSection}
${sightWordActionAddendum}
${snapshotActionAddendum}
${activityMinutesActionAddendum}
${planAdjustmentActionAddendum}
${frictionCaptureAddendum}
${webSearchAddendum}

After your response, suggest 2-3 brief follow-up questions the parent might want to ask. Format them on new lines at the very end of your response, each prefixed with "[FOLLOWUP] ". Keep each under 50 characters. These should be specific to what you just discussed, not generic.

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
  const imaged = lastUserMsg
    ? extractImageUrls(lastUserMsg.content)
    : { urls: [], text: "" };

  let result: { text: string; inputTokens: number; outputTokens: number };

  if (imaged.urls.length > 0) {
    // Vision path: one OR MORE URL-based images (FEAT-59 multi-image parity).
    console.log(
      `[shellyChat] Vision path — ${imaged.urls.length} image URL(s) detected:`,
      imaged.urls[0]?.slice(0, 60),
    );
    const textContent = imaged.text || "What can you tell me about this image?";

    // Prior messages (everything except the last image message)
    const priorMessages = recentMessages
      .filter((m) => m !== lastUserMsg)
      .map((m) => ({ role: m.role, content: m.content }));

    result = await callClaudeWithVisionUrls({
      apiKey,
      model,
      maxTokens: 2000,
      systemPrompt,
      imageUrls: imaged.urls,
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
      // FEAT-12 Phase 1: parent-facing web search, capped per turn. Vision path
      // (above) intentionally stays search-free for Phase 1.
      webSearch: { maxUses: 4 },
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
