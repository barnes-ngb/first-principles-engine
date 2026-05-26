import type { Firestore } from "firebase-admin/firestore";
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import type { SnapshotData } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { CHARTER_PREAMBLE } from "../contextSlices.js";
import { sanitizeAndParseJson } from "../sanitizeJson.js";
import {
  aggregateMonthData,
  type MonthAggregate,
  type PhotoRef,
} from "./monthlyReviewData.js";
import {
  assignPhotosToSections,
  scorePhotos,
  type PhotoCurationContext,
  type ScoredPhoto,
  type SectionPlacement,
} from "./monthlyReviewCuration.js";

// ── Output schema (mirror of MonthlyReview from src/core/types) ──

interface PageContent {
  headline?: string;
  body?: string;
  highlights?: string[];
  captions?: Record<string, string>;
  audioRef?: string;
}

interface PageModePhotos {
  kid: PhotoRef[];
  parent: PhotoRef[];
}

interface MonthlyReviewPage {
  id: string;
  sectionType:
    | "cover"
    | "monthInSentence"
    | "whatYouLoved"
    | "workedThrough"
    | "byTheNumbers"
    | "moreFromMonth";
  order: number;
  kidMode: PageContent;
  parentMode: PageContent;
  photoRefs: PageModePhotos;
  hidden?: boolean;
}

interface MonthStats {
  daysWithActivity: number;
  totalHours: number;
  hoursBySubject: Record<string, number>;
  booksCompleted: number;
  booksRead: number;
  quests: number;
  blockersResolved: number;
  blockersActive: number;
  teachBackCount: number;
  dadLabCount: number;
  totalDiamonds: number;
}

interface SourceRefs {
  weeklyReviewIds: string[];
  dispositionProfileSnapshotAt?: string;
  blockerSnapshotAt?: string;
}

export interface MonthlyReviewPayload {
  id: string;
  familyId: string;
  childId: string;
  month: string;
  status: "draft";
  generatedAt: string;
  theme: string;
  /** `null` when no qualifying photo — Firestore rejects `undefined`. */
  heroPhotoRef: PhotoRef | null;
  pages: MonthlyReviewPage[];
  curatedPhotos: PhotoRef[];
  unplacedPhotos: PhotoRef[];
  stats: MonthStats;
  sourceRefs: SourceRefs;
}

// ── Direct entry point (used by Cloud Functions) ───────────────

export interface RunMonthlyReviewParams {
  db: Firestore;
  familyId: string;
  childId: string;
  childData: { name: string; grade?: string };
  snapshotData: SnapshotData | undefined;
  apiKey: string;
  month: string;
}

export interface RunMonthlyReviewResult {
  payload: MonthlyReviewPayload;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export async function runMonthlyReview(
  params: RunMonthlyReviewParams,
): Promise<RunMonthlyReviewResult> {
  const { db, familyId, childId, childData, apiKey, month } = params;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`month must be in YYYY-MM format, got: ${month}`);
  }

  const model = modelForTask("monthlyReview" as never);

  // 1. Aggregate the month's data
  const data = await aggregateMonthData(db, familyId, childId, month);

  // 2. Build curation context + score photos
  const curationCtx = buildCurationContext(data);
  const scored = scorePhotos(data.photos, curationCtx);
  const placement = assignPhotosToSections(scored, {
    ...curationCtx,
    hasBookCompletions: data.completedBooks.length > 0,
    hasDadLab: data.dadLabReports.length > 0,
  });
  // Top-level hero falls back from kid → parent. The cover layout
  // re-derives per-mode photos from `placement.cover`.
  const hero = placement.cover.kid[0] ?? placement.cover.parent[0];

  // 3. Compose prompts
  const systemPrompt = buildMonthlyReviewSystemPrompt(childData.name, month);
  const userPrompt = buildMonthlyReviewUserPrompt({
    childName: childData.name,
    month,
    data,
    hero,
    placement,
  });

  // 4. Call Sonnet
  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 6000,
    systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  // 5. Parse JSON
  const parsed = parseMonthlyReviewJson(result.text);

  // 6. Compose final document
  const payload = composeMonthlyReview({
    familyId,
    childId,
    month,
    data,
    hero,
    scored,
    placement,
    parsed,
  });

  // 7. Log usage
  await logAiUsage(db, familyId, {
    childId,
    taskType: "monthlyReview",
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return {
    payload,
    model,
    usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
  };
}

// ── Chat task handler (registered in CHAT_TASKS) ──────────────

/**
 * Chat-task adapter for monthlyReview. Expects the first user message to be
 * a JSON object like `{"month":"2026-04"}`. The handler returns the composed
 * MonthlyReview payload serialized as JSON.
 *
 * In MVP this handler is not invoked from any UI — the scheduled and callable
 * Cloud Functions in `functions/src/ai/monthlyReview.ts` call `runMonthlyReview`
 * directly. The registration exists so the dispatch path is valid.
 */
export const handleMonthlyReview = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, apiKey, messages } = ctx;

  let month = "";
  try {
    const first = messages[0]?.content ?? "";
    const parsed = JSON.parse(first) as { month?: string };
    if (parsed.month) month = parsed.month;
  } catch {
    // Fall through — will throw below
  }
  if (!month) {
    throw new Error(
      'monthlyReview requires first message content to be JSON like {"month":"YYYY-MM"}',
    );
  }

  const run = await runMonthlyReview({
    db,
    familyId,
    childId,
    childData,
    snapshotData,
    apiKey,
    month,
  });

  return {
    message: JSON.stringify(run.payload),
    model: run.model,
    usage: run.usage,
  };
};

// ── Curation context assembly ─────────────────────────────────

function buildCurationContext(data: MonthAggregate): PhotoCurationContext {
  const dayLogEngagement: Record<string, Record<string, string>> = {};
  for (const d of data.dayLogs) {
    dayLogEngagement[d.date] = d.itemEngagement;
  }

  const bookArtifactIds = new Set<string>();
  for (const b of data.completedBooks) {
    bookArtifactIds.add(b.id);
  }

  const dadLabArtifactIds = new Set<string>();
  for (const lab of data.dadLabReports) {
    if (lab.hasExplanation) dadLabArtifactIds.add(lab.id);
  }

  // MVP: no scan-quality flags wired from scans; resolved blocker evidence
  // ids come from blockers that include an `evidence` artifact pointer if any.
  const resolvedBlockerEvidenceIds = new Set<string>();
  for (const b of data.resolvedBlockers) {
    if (b.evidence) resolvedBlockerEvidenceIds.add(`artifact:${b.evidence}`);
  }

  return {
    dayLogEngagement,
    scanQualityById: {},
    bookArtifactIds,
    sketchArtifactIds: new Set(),
    dadLabArtifactIds,
    resolvedBlockerEvidenceIds,
    workbookArtifactIds: data.workbookArtifactIds,
    classifiedScanIds: data.classifiedScanIds,
    allArtifactIds: data.allArtifactIds,
  };
}

// ── Prompt construction ───────────────────────────────────────

function buildMonthlyReviewSystemPrompt(childName: string, month: string): string {
  return `${CHARTER_PREAMBLE}

You are writing a monthly review book for ${childName} for ${month}.

VOICE GUIDANCE — READ CAREFULLY

Kid mode and parent mode MUST read like two different documents that happen
to share photos. If both versions say similar things in similar lengths,
the toggle is broken.

KID MODE — for a 10-year-old (Lincoln) or a 6-year-old (London) reading with
or without help. Lincoln has speech challenges and reading is still effortful.
London is just learning to read.

  Rules:
  - 2nd person present tense ("you read", "you finished")
  - Body text: 2-3 sentences MAXIMUM per section
  - Highlights: 3 MAXIMUM, each one short sentence
  - Photo captions: 4-8 words MAXIMUM each
  - Specific moments, never abstract praise. "You finished Papa Hut all 14
    pages" beats "You worked hard on reading."
  - Never reference dates in date format. ("April 12" is parent voice.) Kid
    voice says "one Friday" or "the day you read pin and pen."
  - Never use analytical framing words: "pattern", "data", "information",
    "tracking", "tracked", "measurement", "compared to", "consistent",
    "carry-over", "lifecycle", "evidence", "signal".
  - Never quote stats inside body text. ("you finished 2 books this month"
    is fine. "You spent 5.2 hours" is not — that's a stat tile, not prose.)
  - For Lincoln: Minecraft-natural where it fits, not forced. He'd say
    "mined" before "earned" for diamonds. He'd say "built" before "created".
  - For London: storybook-natural. Gentle, imaginative, present tense fairy-
    tale voice.

PARENT MODE — for Shelly (mom) and Nathan (dad) reading on the couch or
phone. Analytical but warm. Evidence-based. Charter-aligned (no grading, no
shame, no comparisons between children).

  Rules:
  - 3rd person about the child ("Lincoln finished", "London drew")
  - Body text: 2-4 sentences per section, can go to 5 for "What You Worked
    Through"
  - Highlights: 3-5, can be longer and reference dates and source data
  - References dates, week numbers, sources where useful ("April 12 guided
    eval", "the week of April 19")
  - Surfaces patterns Shelly might miss without this artifact
  - Frames growth as observation, not measurement
  - Never grades, never says "ahead" or "behind" or "should be"

PARENT MODE — TONE CORRECTION

Parent mode is analytical AND warm. It is NOT a business analyst's report.
Specific anti-patterns to avoid:

  - Jargon-y abstractions: "ambient rather than acute", "the thinness of",
    "engagement feedback", "developmental shift worth naming",
    "concentration was driven by", "logged minutes"
  - Hedging analyst language: "which means", "suggests that", "indicates",
    "reflects a pattern of"
  - Quarterly-review verbs: "claimed", "demonstrated", "exhibited", "produced"
  - Abstract noun phrases where a concrete observation would work better

Instead:

  - Talk like a parent who reads a lot and pays attention. Not like a clinician.
  - Specific moments and direct observations: "Lincoln finished 'Papa Hut'
    on April 8 — fourteen pages, no help." (not: "Reading endurance demonstrated
    notable extension this period.")
  - Reference dates and source data, but in context: "The week of April 19
    he didn't open the checklist once — but he wrote 12 pages of his own
    book that week, so something was clearly working."
  - When data points are interesting, name what's interesting in plain words.
    "Language arts took 154 minutes this month — more than any other subject
    because that's where he wanted to be."

The test: would Shelly read this and feel like the AI saw her son, or would
she feel like she's reading a curriculum vendor's PDF? If the latter, the
voice is wrong.

HARD RULE: If the kid mode for a section is more than 80% of the parent
mode length, you're doing it wrong. Kid mode should be roughly half the
words of parent mode, with bigger ideas in shorter sentences.

PHRASES NEVER USED IN KID MODE:
  - "real information, not a problem"
  - "that's okay" / "and that's okay"
  - "the day(s) near the end of the week"
  - "consistent"
  - "data" / "tracking" / "tracked"
  - "carry-over" / "resolved" (use "you figured out", "you got it")
  - Any sentence that starts with "By the week of"
  - Any sentence that starts with "Some days the"
  - Any reference to specific date format like "April 12"

These phrases will appear in parent mode where appropriate. They DO NOT
appear in kid mode under any circumstances.

NEVER DO (both modes):
- Compare children to each other.
- Use percentage-style measurements ("12% improvement").
- Use the words "behind", "ahead", "should be", or anything graded.
- Recommend specific products, curricula, or services the family does not already use.
- Pad sparse data — if a section has little evidence, write something short and honest.

SECTION LENGTH GUIDE

cover
  kidMode: headline only, no body text. Theme word in headline. Voiced in
    2nd person ("Stories You Built").
  parentMode: headline in 3rd person ("Stories He Built"), short subtitle
    body line that names the month and the theme.

monthInSentence
  kidMode: 1-2 sentences total. Specific moment that captures the month.
  parentMode: 2-3 sentences. Analytical synthesis of the month's shape.

whatYouLoved
  kidMode: 2 sentences body. 2-3 highlights. Photo captions are 4-8 words.
  parentMode: 3-4 sentences body. 3-4 highlights with engagement signal
    references where appropriate.

workedThrough
  kidMode: 2-3 sentences body, story-arc framing ("you used to find X
    tricky, then one day..."). 2-3 highlights, each a specific moment.
  parentMode: 3-5 sentences body. Lifecycle dates, evidence sources, what
    resolved and what's active. 3-5 highlights with dates.

byTheNumbers
  kidMode: 1 sentence body, warm and short. No mention of specific numbers
    (the tiles show numbers). Body is closing thought, not stat recap.
  parentMode: 2-3 sentences body. Can reference total hours, books, blockers.
    Closing observation about the month's shape.

SECTIONS REQUIRED (exact keys, both modes per section):
1. cover — headline only (per length guide). Kid mode body is empty string.
2. monthInSentence — single body field per mode.
3. whatYouLoved — what engaged the child most. May include highlights[] and captions{}.
4. workedThrough — blockers encountered + what resolved (kid sees story arc,
   parent sees lifecycle data with dates).
5. byTheNumbers — stats framed as celebration (kid) or evidence (parent).

OUTPUT JSON SCHEMA (respond with ONLY this JSON, no markdown, no preamble):
{
  "theme": "short theme word or phrase (1-4 words)",
  "sections": {
    "cover": {
      "kidMode": { "headline": "...", "body": "" },
      "parentMode": { "headline": "...", "body": "..." }
    },
    "monthInSentence": {
      "kidMode": { "body": "..." },
      "parentMode": { "body": "..." }
    },
    "whatYouLoved": {
      "kidMode": { "headline": "...", "body": "...", "highlights": ["..."], "captions": { "photoId": "caption text" } },
      "parentMode": { "headline": "...", "body": "...", "highlights": ["..."], "captions": { "photoId": "caption text" } }
    },
    "workedThrough": {
      "kidMode": { "headline": "...", "body": "...", "highlights": ["..."] },
      "parentMode": { "headline": "...", "body": "...", "highlights": ["..."] }
    },
    "byTheNumbers": {
      "kidMode": { "headline": "...", "body": "...", "highlights": ["..."] },
      "parentMode": { "headline": "...", "body": "...", "highlights": ["..."] }
    }
  }
}

The cover headline must differ between kid and parent mode (2nd person vs
3rd person). The "captions" object keys must use photoId values from the
photo refs given in the user message. Only include captions for photos that
were placed on that section — leave captions empty {} if none.

If data for a section is thin, keep that section short and write honestly —
do not invent moments. The Charter wants "rest by design" — sparse months are
real months too.`;
}

interface PromptInputs {
  childName: string;
  month: string;
  data: MonthAggregate;
  hero: PhotoRef | undefined;
  placement: SectionPlacement;
}

function buildMonthlyReviewUserPrompt(input: PromptInputs): string {
  const { childName, month, data, hero, placement } = input;

  const totalEngagement: Record<string, number> = {};
  for (const d of data.dayLogs) {
    for (const [k, v] of Object.entries(d.engagementCounts)) {
      totalEngagement[k] = (totalEngagement[k] ?? 0) + v;
    }
  }
  const engStr = Object.entries(totalEngagement)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const subjectStr = Object.entries(data.hours.minutesBySubject)
    .map(([k, v]) => `${k}: ${v}min`)
    .join(", ");

  const weeklyReviewLines = data.weeklyReviews
    .map(
      (w) =>
        `- ${w.weekKey}: ${w.celebration}` +
        (w.wins.length ? ` | wins: ${w.wins.slice(0, 3).join("; ")}` : "") +
        (w.growthAreas.length
          ? ` | growth: ${w.growthAreas.slice(0, 2).join("; ")}`
          : ""),
    )
    .join("\n");

  const resolvedBlockerLines = data.resolvedBlockers
    .map(
      (b) =>
        `- ${b.name} (resolved ${b.resolvedAt?.slice(0, 10) ?? "this month"})` +
        (b.evidence ? ` — evidence: ${b.evidence}` : "") +
        (b.specificWords?.length
          ? ` — words: ${b.specificWords.slice(0, 6).join(", ")}`
          : ""),
    )
    .join("\n");

  const activeBlockerLines = data.activeBlockers
    .map((b) => `- ${b.name} (${b.status})`)
    .join("\n");

  const booksLines = data.completedBooks
    .slice(0, 8)
    .map(
      (b) =>
        `- "${b.title}" (${b.bookType}, ${b.pageCount} pages, completed ${b.completedAt.slice(0, 10)})`,
    )
    .join("\n");

  const dadLabLines = data.dadLabReports
    .slice(0, 6)
    .map(
      (l) =>
        `- ${l.title}${l.hasPrediction ? " [predicted]" : ""}${l.hasExplanation ? " [explained]" : ""}`,
    )
    .join("\n");

  const teachBackStr = data.teachBacks.length
    ? `${data.teachBacks.length} teach-back moments (subjects: ${Array.from(
        new Set(data.teachBacks.map((t) => t.subject)),
      ).join(", ")})`
    : "none";

  const conundrumLines = data.conundrums
    .slice(0, 4)
    .map((c) => `- ${c.weekKey}: ${c.question.slice(0, 140)}`)
    .join("\n");

  const photoSection = formatPhotoSection(hero, placement);

  const totalHours = Math.round((data.hours.totalMinutes / 60) * 10) / 10;
  const daysWithActivity = data.dayLogs.length;

  return `Generate the monthly review book for ${childName} for ${month}.

## Month at a glance
- Days with activity: ${daysWithActivity}
- Total hours: ${totalHours} (${data.hours.totalMinutes} min)
- Hours by subject: ${subjectStr || "(none)"}
- Engagement counts across the month: ${engStr || "(none)"}
- Books completed: ${data.completedBooks.length}
- Dad Lab sessions completed: ${data.dadLabReports.length}
- Quests / interactive sessions: ${data.questCount}
- Teach-backs: ${teachBackStr}
- Diamonds earned (xpLedger): ${data.diamonds.totalDiamonds}
- Blockers resolved this month: ${data.resolvedBlockers.length}
- Blockers still active: ${data.activeBlockers.length}

## Weekly reviews this month
${weeklyReviewLines || "(no weekly reviews recorded for this month)"}

## Blockers resolved this month
${resolvedBlockerLines || "(none resolved this month)"}

## Active blockers (still in flight)
${activeBlockerLines || "(none active)"}

## Books completed
${booksLines || "(none)"}

## Dad Lab sessions
${dadLabLines || "(none)"}

## Conundrums posed this month
${conundrumLines || "(none)"}

${photoSection}

## Example of correct shape (for whatYouLoved — illustrative only, do NOT copy content)

{
  "whatYouLoved": {
    "kidMode": {
      "headline": "What You Loved",
      "body": "You loved stories this month. Every time a new one started, you kept going.",
      "highlights": [
        "Papa Hut and the Witch — all 14 pages",
        "You wrote The Block World Vacation yourself",
        "The dragon egg story — read it twice"
      ],
      "captions": {
        "photo_abc": "Deep in the book",
        "photo_def": "Your own Minecraft world",
        "photo_ghi": "Art at the museum"
      }
    },
    "parentMode": {
      "headline": "What He Engaged With Most",
      "body": "Lincoln's strongest engagement signal this month was around story narrative — both reading other people's stories and writing his own. Reading sessions averaged 18 minutes (up from 12 in March), and he completed 3 multi-chapter books including one he authored. The Block World Vacation (12 pages, original) was the longest creative writing piece he's produced.",
      "highlights": [
        "Papa Hut and the Witch (14 pages) — completed Apr 8",
        "The Block World Vacation — original, 12 pages, completed Apr 23",
        "Dragon egg story — re-read twice, strong engagement signal",
        "Reading session length up 50% from March average"
      ],
      "captions": {
        "photo_abc": "Reading session, April 12",
        "photo_def": "Block World Vacation page 4",
        "photo_ghi": "Nelson-Atkins field trip, April 17"
      }
    }
  }
}

Notice the length ratio: parent body is 3x the words of kid body. Parent
highlights carry dates and source references; kid highlights are short and
specific. Captions follow the same length pattern. Apply this ratio across
every section.

Generate the JSON exactly per the schema in the system prompt. Use the photoId
values listed above when adding captions; do not invent photo IDs.`;
}

function formatPhotoSection(
  hero: PhotoRef | undefined,
  placement: SectionPlacement,
): string {
  const lines: string[] = ["## Photos placed in sections"];
  if (hero) {
    lines.push(`Hero (cover): photoId="${hero.id}"`);
  } else {
    lines.push("Hero (cover): none — write a text-only cover.");
  }

  // Captions can target any photoId the AI sees — union the modes so the
  // prompt lists every photo exactly once and the AI can caption all of them.
  const loved = unionByPhotoId(
    placement.whatYouLoved.kid,
    placement.whatYouLoved.parent,
  );
  const worked = unionByPhotoId(
    placement.workedThrough.kid,
    placement.workedThrough.parent,
  );

  if (loved.length) {
    lines.push("whatYouLoved section photos:");
    for (const p of loved) {
      lines.push(
        `  - photoId="${p.id}", subject=${p.subjectTag ?? "?"}, captured=${p.capturedAt.slice(0, 10)}`,
      );
    }
  }
  if (worked.length) {
    lines.push("workedThrough section photos:");
    for (const p of worked) {
      lines.push(
        `  - photoId="${p.id}", subject=${p.subjectTag ?? "?"}, captured=${p.capturedAt.slice(0, 10)}`,
      );
    }
  }
  if (!loved.length && !worked.length && !hero) {
    lines.push("(no photos available for this month)");
  }
  return lines.join("\n");
}

function unionByPhotoId(a: PhotoRef[], b: PhotoRef[]): PhotoRef[] {
  const seen = new Set<string>();
  const out: PhotoRef[] = [];
  for (const p of [...a, ...b]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

// ── JSON parsing ──────────────────────────────────────────────

interface ParsedSection {
  kidMode?: PageContent;
  parentMode?: PageContent;
}

interface ParsedMonthlyReview {
  theme: string;
  sections: Record<string, ParsedSection>;
}

export function parseMonthlyReviewJson(text: string): ParsedMonthlyReview {
  const parsed = sanitizeAndParseJson<Record<string, unknown>>(text);
  const sectionsRaw = (parsed.sections ?? {}) as Record<string, unknown>;
  const sections: Record<string, ParsedSection> = {};
  for (const [key, value] of Object.entries(sectionsRaw)) {
    if (!value || typeof value !== "object") continue;
    const section = value as Record<string, unknown>;
    sections[key] = {
      kidMode: normalizeContent(section.kidMode),
      parentMode: normalizeContent(section.parentMode),
    };
  }
  return {
    theme: String(parsed.theme ?? "This Month"),
    sections,
  };
}

function normalizeContent(raw: unknown): PageContent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const content: PageContent = {};
  if (typeof r.headline === "string") content.headline = r.headline;
  if (typeof r.body === "string") content.body = r.body;
  if (Array.isArray(r.highlights)) {
    content.highlights = r.highlights.map(String);
  }
  if (r.captions && typeof r.captions === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.captions as Record<string, unknown>)) {
      out[k] = String(v ?? "");
    }
    content.captions = out;
  }
  if (typeof r.audioRef === "string") content.audioRef = r.audioRef;
  return content;
}

// ── Compose final document ────────────────────────────────────

export interface ComposeInput {
  familyId: string;
  childId: string;
  month: string;
  data: MonthAggregate;
  hero: PhotoRef | undefined;
  scored: ScoredPhoto[];
  placement: SectionPlacement;
  parsed: ParsedMonthlyReview;
}

const SECTION_ORDER: MonthlyReviewPage["sectionType"][] = [
  "cover",
  "monthInSentence",
  "whatYouLoved",
  "workedThrough",
  "byTheNumbers",
  "moreFromMonth",
];

const EMPTY_CONTENT: PageContent = {};

/**
 * Minimum overflow photos required before the moreFromMonth gallery is added.
 * A 1-photo gallery feels lonely; 2 reads as intentional.
 */
const MIN_OVERFLOW_TO_SHOW_GALLERY = 2;

/**
 * Auto-generated content for the moreFromMonth gallery. No AI call — the
 * section is a photo grid with a fixed headline + soft body line. Kid mode
 * only; parent mode is filtered out at the renderer.
 */
const MORE_FROM_MONTH_KID_CONTENT: PageContent = {
  headline: "More from this month",
  body: "Look at everything you made.",
  highlights: [],
  captions: {},
};

export function composeMonthlyReview(input: ComposeInput): MonthlyReviewPayload {
  const { familyId, childId, month, data, hero, scored, placement, parsed } = input;
  const id = `${childId}_${month}`;

  const pages: MonthlyReviewPage[] = [];
  let order = 0;
  for (const sectionType of SECTION_ORDER) {
    // moreFromMonth is a photo-gallery overflow section — only included when
    // kid mode has overflow photos to show. No AI content; fixed headline +
    // body. Filtered out entirely in parent mode at the renderer.
    if (sectionType === "moreFromMonth") {
      if (placement.moreFromMonth.kid.length < MIN_OVERFLOW_TO_SHOW_GALLERY) continue;
      pages.push({
        id: `${id}_${sectionType}`,
        sectionType,
        order: order++,
        kidMode: MORE_FROM_MONTH_KID_CONTENT,
        parentMode: EMPTY_CONTENT,
        photoRefs: {
          kid: placement.moreFromMonth.kid,
          parent: placement.moreFromMonth.parent,
        },
      });
      continue;
    }

    const section = parsed.sections[sectionType] ?? {};
    let photoRefs: PageModePhotos = { kid: [], parent: [] };
    if (sectionType === "cover") {
      photoRefs = {
        kid: placement.cover.kid,
        parent: placement.cover.parent,
      };
    }
    if (sectionType === "whatYouLoved") {
      photoRefs = {
        kid: placement.whatYouLoved.kid,
        parent: placement.whatYouLoved.parent,
      };
    }
    if (sectionType === "workedThrough") {
      photoRefs = {
        kid: placement.workedThrough.kid,
        parent: placement.workedThrough.parent,
      };
    }

    pages.push({
      id: `${id}_${sectionType}`,
      sectionType,
      order: order++,
      kidMode: section.kidMode ?? EMPTY_CONTENT,
      parentMode: section.parentMode ?? EMPTY_CONTENT,
      photoRefs,
    });
  }

  // Build PhotoRefs without explicit `undefined` fields — Firestore rejects
  // undefined values, so optional fields are only set when defined.
  const curatedPhotos: PhotoRef[] = scored.slice(0, 30).map((p) => {
    const ref: PhotoRef = {
      id: p.id,
      storagePath: p.storagePath,
      source: p.source,
      sourceDocId: p.sourceDocId,
      capturedAt: p.capturedAt,
    };
    if (Number.isFinite(p.score)) ref.score = p.score;
    if (p.subjectTag) ref.subjectTag = p.subjectTag;
    return ref;
  });

  const stats: MonthStats = {
    daysWithActivity: data.dayLogs.length,
    totalHours: Math.round((data.hours.totalMinutes / 60) * 10) / 10,
    hoursBySubject: data.hours.minutesBySubject,
    booksCompleted: data.completedBooks.length,
    booksRead: data.completedBooks.length,
    quests: data.questCount,
    blockersResolved: data.resolvedBlockers.length,
    blockersActive: data.activeBlockers.length,
    teachBackCount: data.teachBacks.length,
    dadLabCount: data.dadLabReports.length,
    totalDiamonds: data.diamonds.totalDiamonds,
  };

  const sourceRefs: SourceRefs = {
    weeklyReviewIds: data.weeklyReviews.map((w) => w.id),
    blockerSnapshotAt: new Date().toISOString(),
  };

  return {
    id,
    familyId,
    childId,
    month,
    status: "draft",
    generatedAt: new Date().toISOString(),
    theme: parsed.theme,
    // Coerce undefined → null at the Firestore write boundary. The picker
    // returns `undefined` ("no qualifying photo"); Firestore rejects undefined.
    heroPhotoRef: hero ?? null,
    pages,
    curatedPhotos,
    unplacedPhotos: placement.more,
    stats,
    sourceRefs,
  };
}
