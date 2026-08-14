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
  /** Kept for backward compatibility with already-generated reviews. */
  totalHours: number;
  /** Canonical: integer minutes. Display layer converts to "Xh Ym". */
  totalMinutes: number;
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

interface MonthlyReviewReadingBook {
  title: string;
  totalChapters: number;
  chaptersAnswered: number;
  questionsAnswered: number;
  questionsSkipped: number;
}

interface MonthlyReviewReading {
  books: MonthlyReviewReadingBook[];
  totalChaptersAnswered: number;
  totalQuestionsAnswered: number;
  totalQuestionsSkipped: number;
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
  /** Read-aloud reading recap. Omitted when no reading happened this month. */
  reading?: MonthlyReviewReading;
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
  const data = await aggregateMonthData(
    db,
    familyId,
    childId,
    month,
    childData.name,
  );

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

  // 4 + 5. Call Sonnet and parse, with one automatic retry on a malformed or
  // truncated response (FEAT-146).
  //
  // Every attempt that returns is charged, so its usage is accumulated as it
  // happens rather than read off the result — on the throw path there is no
  // result to read, and an unlogged charge is an unhonest cost total.
  const charged = { inputTokens: 0, outputTokens: 0 };
  let result: BookJsonResult;
  try {
    result = await generateBookJsonWithRetry(
      (prompt) =>
        callClaude({
          apiKey,
          model,
          maxTokens: MONTHLY_REVIEW_MAX_TOKENS,
          systemPrompt,
          messages: [{ role: "user", content: prompt }],
        }),
      userPrompt,
      (usage) => {
        charged.inputTokens += usage.inputTokens;
        charged.outputTokens += usage.outputTokens;
      },
    );
  } catch (err) {
    if (charged.inputTokens > 0 || charged.outputTokens > 0) {
      // `logAiUsage` never throws, so this cannot mask the real failure.
      await logAiUsage(db, familyId, {
        childId,
        taskType: "monthlyReview",
        model,
        inputTokens: charged.inputTokens,
        outputTokens: charged.outputTokens,
        outcome: "failed",
      });
    }
    throw err;
  }
  const parsed = result.parsed;

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

/**
 * FEAT-141 (Codex P1, PR #1666): every artifact that is really a workbook page.
 *
 * The "Worksheet" artifact type is not the only way a curriculum page reaches
 * the `artifacts` collection — in fact it is the rare one. The workbook capture
 * path writes the page as a plain `Photo` artifact AND as a scan, so excluding
 * only the scan left an identical twin eligible for the cover and every content
 * section: the book would still print the page this policy exists to keep out.
 *
 * Two retroactive joins through the day log, so this works on months captured
 * long before the policy existed (July included):
 *  1. the artifact is the evidence of a workbook-linked checklist item, and
 *  2. the artifact's `tags.planItem` names a workbook-linked item that month —
 *     which is how batch pages 2..N are caught (they are saved with no
 *     checklist link at all).
 *
 * Over-inclusion here is the safe direction: a photo taken against a workbook
 * activity is exactly what Nathan does not want printed.
 */
export function collectWorkbookArtifactIds(data: MonthAggregate): Set<string> {
  const ids = new Set<string>(data.workbookArtifactIds);

  const workbookLabels = new Set<string>();
  for (const day of data.dayLogs) {
    for (const id of day.workbookEvidenceIds ?? []) ids.add(id);
    for (const label of day.workbookItemLabels ?? []) {
      if (label) workbookLabels.add(label);
    }
  }

  if (workbookLabels.size > 0) {
    for (const [artifactId, planItem] of Object.entries(
      data.artifactPlanItems ?? {},
    )) {
      if (workbookLabels.has(planItem)) ids.add(artifactId);
    }
  }

  return ids;
}

function buildCurationContext(data: MonthAggregate): PhotoCurationContext {
  const dayLogEngagement: Record<string, Record<string, string>> = {};
  for (const d of data.dayLogs) {
    dayLogEngagement[d.date] = d.itemEngagement;
  }

  const bookArtifactIds = new Set<string>();
  for (const b of data.completedBooks) {
    bookArtifactIds.add(b.id);
  }

  // `dadLabArtifactIds` is keyed by ARTIFACT doc id (matched against
  // `photo.sourceDocId` in `scorePhotos`). Photos tagged by the loader with
  // `sourceMetadata.type === "dadLab"` are the source of truth; the previous
  // implementation mistakenly added Dad Lab REPORT ids here, which never
  // matched and silently dropped the Dad Lab score boost.
  const dadLabArtifactIds = new Set<string>();
  for (const p of data.photos) {
    if (p.sourceMetadata?.type === "dadLab") {
      dadLabArtifactIds.add(p.sourceDocId);
    }
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
    // FEAT-141: not just `type: "Worksheet"` — see collectWorkbookArtifactIds.
    workbookArtifactIds: collectWorkbookArtifactIds(data),
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
  parentMode: 2-3 sentences body, plus a reading-review beat when reading data
    is present (see below). Can reference total hours, books, blockers.
    Closing observation about the month's shape.

READING REVIEW (parentMode of byTheNumbers ONLY)
  When the user message has a "Read-aloud reading this month" section with at
  least one book listed, add ONE short reading-review beat to the byTheNumbers
  parentMode body: how read-aloud reading went this month — engagement,
  comprehension, growth. Name the book(s) and what was discussed. Frame it as
  coverage, never pace: skipped chapters are a parent choice, never "behind"
  or a failure, and never graded. If the reading section says "(no read-aloud
  chapters discussed this month)", omit this entirely — do not invent reading.
  This beat lives only in parentMode; kidMode byTheNumbers stays per its rule.

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
    .map((l) => {
      const date = l.completedAt ? ` (${l.completedAt.slice(0, 10)})` : "";
      const tags =
        `${l.hasPrediction ? " [predicted]" : ""}${l.hasExplanation ? " [explained]" : ""}` +
        (l.artifactIds.length ? ` [${l.artifactIds.length} artifact${l.artifactIds.length === 1 ? "" : "s"}]` : "");
      return `- ${l.title}${date}${tags}`;
    })
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

  const readingLines = data.reading.books
    .map(
      (b) =>
        `- "${b.title}": ${b.chaptersAnswered} chapter${b.chaptersAnswered === 1 ? "" : "s"} discussed` +
        `, ${b.questionsAnswered} question${b.questionsAnswered === 1 ? "" : "s"} answered` +
        (b.questionsSkipped
          ? `, ${b.questionsSkipped} skipped`
          : "") +
        (b.totalChapters ? ` (of ${b.totalChapters} chapters total)` : ""),
    )
    .join("\n");

  // FEAT-141: placement refs are stripped of their content notes (the composed
  // book document must not carry parent-side metadata), so the notes are looked
  // up here from the loaded photos, by photoId.
  const photoSection = formatPhotoSection(hero, placement, buildNoteIndex(data.photos));

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

## Read-aloud reading this month
${readingLines || "(no read-aloud chapters discussed this month)"}

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
values listed above when adding captions; do not invent photo IDs.

Where a photo line carries \`shows="…"\`, that is a short note recorded when the
photo was taken, describing what is actually in it. Use it to write a caption
that names the real thing in the picture. It is a parent-side note, not kid
copy — never paste it in verbatim, and never quote it in a kid-mode caption.
Photos with no \`shows="…"\` were captured before notes existed; caption those
from the surrounding month data as before.`;
}

/**
 * FEAT-141: photoId → the short content note captured with that image, for the
 * photos that have one. Photos without a note are simply absent from the index
 * and their prompt lines read exactly as they did before this feature.
 */
export function buildNoteIndex(photos: PhotoRef[]): Record<string, string> {
  const index: Record<string, string> = {};
  for (const p of photos) {
    if (p.contentNote) index[p.id] = p.contentNote;
  }
  return index;
}

/** One photo's prompt line, with its content note appended when it has one. */
function photoLine(p: PhotoRef, notes: Record<string, string>): string {
  const note = notes[p.id];
  return (
    `  - photoId="${p.id}", subject=${p.subjectTag ?? "?"}, captured=${p.capturedAt.slice(0, 10)}` +
    (note ? `, shows="${note.replace(/"/g, "'")}"` : "")
  );
}

/**
 * Exported for test (FEAT-141): the notes-present / notes-absent split is the
 * whole of Step 3, and the absent case must stay byte-identical to the prompt
 * the generator has been reading all along.
 */
export function formatPhotoSection(
  hero: PhotoRef | undefined,
  placement: SectionPlacement,
  notes: Record<string, string> = {},
): string {
  const lines: string[] = ["## Photos placed in sections"];
  if (hero) {
    const heroNote = notes[hero.id];
    lines.push(
      `Hero (cover): photoId="${hero.id}"` +
        (heroNote ? `, shows="${heroNote.replace(/"/g, "'")}"` : ""),
    );
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
      lines.push(photoLine(p, notes));
    }
  }
  if (worked.length) {
    lines.push("workedThrough section photos:");
    for (const p of worked) {
      lines.push(photoLine(p, notes));
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

/** Output ceiling for the book call. One place, so diagnostics can name it. */
export const MONTHLY_REVIEW_MAX_TOKENS = 6000;

/**
 * Half-width, in characters, of the raw-text window logged around a parse
 * failure. The whole window is at most `2 * RADIUS + 1` characters — enough to
 * see what broke, never the whole payload. The payload is a child's month.
 */
export const DIAGNOSTIC_WINDOW_RADIUS = 200;

/**
 * The one strictness line appended to the user prompt on the single retry.
 * Deliberately terse — this is a reminder, not a prompt redesign.
 */
export const STRICT_JSON_RETRY_REMINDER = `RETRY — the previous response could not be parsed. Respond with ONLY the JSON object from the schema: no markdown fences, no preamble, no commentary. Escape every interior quote as \\" and every newline inside a string as \\n. Keep every section within its length guide so the response finishes.`;

/** Pull the character offset out of a V8 JSON.parse error message. */
export function parsePositionFromError(err: unknown): number | undefined {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/position (\d+)/);
  if (!match) return undefined;
  const position = Number(match[1]);
  return Number.isFinite(position) ? position : undefined;
}

/**
 * A bounded slice of the raw model text around `position`. When the error
 * carries no position (some engines omit it), the tail is returned instead —
 * a response that died inside a string usually died at its end.
 */
export function rawTextWindow(
  text: string,
  position: number | undefined,
  radius: number = DIAGNOSTIC_WINDOW_RADIUS,
): { window: string; from: number; to: number } {
  if (position === undefined) {
    const from = Math.max(0, text.length - radius * 2);
    return { window: text.slice(from), from, to: text.length };
  }
  const from = Math.max(0, position - radius);
  const to = Math.min(text.length, position + radius + 1);
  return { window: text.slice(from, to), from, to };
}

/** Parent-facing message when the model ran out of output budget. */
export const TRUNCATED_MESSAGE =
  "The book came back too long and was cut off, so it could not be saved. Nothing was written — try generating it again.";

/** Parent-facing message when the model wrote JSON we could not read. */
export const MALFORMED_MESSAGE =
  "The book came back malformed and could not be read, so it could not be saved. Nothing was written — try generating it again.";

export interface ParseFailureDiagnostics {
  /** Whether the model ran out of output budget rather than writing bad JSON. */
  truncated: boolean;
  /** Parent-facing message. Carries no raw model text. */
  userMessage: string;
  /** Labeled, bounded console line. Never the whole payload. */
  logLine: string;
  /** The bounded raw window, exposed for tests and for the log line. */
  window: string;
}

/**
 * Everything a future run needs to diagnose a book that failed to parse,
 * without ever putting a child's month whole into the logs.
 *
 * Two roots present almost identically to `JSON.parse`, so they are named
 * apart here: a `max_tokens` stop means the book was cut off mid-sentence;
 * anything else means the model wrote JSON we could not read.
 */
export function buildParseFailureDiagnostics(input: {
  stopReason: string;
  text: string;
  err: unknown;
  attempt: number;
}): ParseFailureDiagnostics {
  const { stopReason, text, err, attempt } = input;
  const truncated = stopReason === "max_tokens";
  const position = parsePositionFromError(err);
  const { window, from, to } = rawTextWindow(text, position);
  const parseError = err instanceof Error ? err.message : String(err);

  const userMessage = truncated ? TRUNCATED_MESSAGE : MALFORMED_MESSAGE;

  const logLine = [
    `[monthlyReview] book JSON parse failed (attempt ${attempt})`,
    `stop_reason=${stopReason}`,
    `maxTokens=${MONTHLY_REVIEW_MAX_TOKENS}`,
    `responseLength=${text.length}`,
    `failurePosition=${position ?? "unknown"}`,
    `parseError=${parseError}`,
    // Bounded and labeled on purpose: this is a child's month, and only the
    // characters around the break belong in a log.
    `rawWindow[${from}..${to}]=${JSON.stringify(window)}`,
  ].join(" | ");

  return { truncated, userMessage, logLine, window };
}

/** One call to the model, as `generateBookJsonWithRetry` needs it. */
export type BookJsonCall = (userPrompt: string) => Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}>;

export interface BookJsonResult {
  parsed: ParsedMonthlyReview;
  /** Summed across every attempt, so usage logging stays honest. */
  inputTokens: number;
  outputTokens: number;
  retried: boolean;
}

/**
 * Call the model for the book JSON, retrying ONCE on a malformed or truncated
 * response (FEAT-146).
 *
 * A stochastic generator producing one bad response is usually a one-off, so a
 * single retry — with a terse strictness reminder appended — is the cheapest
 * real fix. Two attempts is the whole budget: the callable has 540s and the
 * parent has less patience than that, so there is no third attempt and no loop.
 *
 * A parsed result is never thrown away. If the retry fails but the first
 * attempt parsed (a book cut off right at its closing brace, say), the first
 * attempt's book is returned rather than failing a generation we already have
 * — and that holds whether the retry came back unreadable or never came back
 * at all (timeout, rate limit, transient provider error).
 *
 * `onAttemptUsage` fires once per attempt that actually returned, the moment it
 * returns. Every attempt is charged whether or not its text parses, so the
 * caller can record the real cost even on the paths that end in a throw.
 */
export async function generateBookJsonWithRetry(
  call: BookJsonCall,
  userPrompt: string,
  onAttemptUsage?: (usage: {
    inputTokens: number;
    outputTokens: number;
  }) => void,
): Promise<BookJsonResult> {
  const first = await call(userPrompt);
  onAttemptUsage?.({
    inputTokens: first.inputTokens,
    outputTokens: first.outputTokens,
  });
  let firstParsed: ParsedMonthlyReview | undefined;
  let firstDiagnostics: ParseFailureDiagnostics | undefined;

  try {
    firstParsed = parseMonthlyReviewJson(first.text);
  } catch (err) {
    firstDiagnostics = buildParseFailureDiagnostics({
      stopReason: first.stopReason,
      text: first.text,
      err,
      attempt: 1,
    });
    console.error(firstDiagnostics.logLine);
  }

  const firstWasClean = firstParsed !== undefined && first.stopReason !== "max_tokens";
  if (firstWasClean) {
    return {
      parsed: firstParsed as ParsedMonthlyReview,
      inputTokens: first.inputTokens,
      outputTokens: first.outputTokens,
      retried: false,
    };
  }

  console.warn(
    `[monthlyReview] retrying book generation once (stop_reason=${first.stopReason}, parsed=${firstParsed !== undefined})`,
  );

  let second: Awaited<ReturnType<BookJsonCall>>;
  try {
    second = await call(`${userPrompt}\n\n${STRICT_JSON_RETRY_REMINDER}`);
  } catch (err) {
    // The retry never came back (timeout, rate limit, transient provider
    // error). If attempt 1 gave us a readable book, that book is still good —
    // losing it to a failed *retry* would be worse than the truncation the
    // retry was trying to improve on.
    if (firstParsed !== undefined) {
      console.warn(
        "[monthlyReview] retry call failed; keeping the first attempt's book",
        err,
      );
      return {
        parsed: firstParsed,
        inputTokens: first.inputTokens,
        outputTokens: first.outputTokens,
        retried: true,
      };
    }
    throw err;
  }
  onAttemptUsage?.({
    inputTokens: second.inputTokens,
    outputTokens: second.outputTokens,
  });
  const inputTokens = first.inputTokens + second.inputTokens;
  const outputTokens = first.outputTokens + second.outputTokens;

  try {
    return {
      parsed: parseMonthlyReviewJson(second.text),
      inputTokens,
      outputTokens,
      retried: true,
    };
  } catch (err) {
    const diagnostics = buildParseFailureDiagnostics({
      stopReason: second.stopReason,
      text: second.text,
      err,
      attempt: 2,
    });
    console.error(diagnostics.logLine);

    // The retry failed, but attempt 1 gave us a readable book — use it.
    if (firstParsed !== undefined) {
      console.warn(
        "[monthlyReview] retry failed to parse; keeping the first attempt's book",
      );
      return { parsed: firstParsed, inputTokens, outputTokens, retried: true };
    }

    // Both attempts failed. The parent sees which root it was; the raw text
    // stays in the logs above, never in the message that crosses the wire.
    // "Cut off" wins when either attempt ran out of budget — a length problem
    // is the more actionable of the two, and it does not go away on a retry.
    const truncated = diagnostics.truncated || firstDiagnostics?.truncated === true;
    throw new Error(
      truncated
        ? TRUNCATED_MESSAGE
        : diagnostics.userMessage,
    );
  }
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
    if (p.sourceMetadata) ref.sourceMetadata = p.sourceMetadata;
    return ref;
  });

  const stats: MonthStats = {
    daysWithActivity: data.dayLogs.length,
    totalHours: Math.round((data.hours.totalMinutes / 60) * 10) / 10,
    totalMinutes: data.hours.totalMinutes,
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

  // Reading recap is additive and optional. Only set it when there was reading
  // this month — Firestore rejects `undefined`, so omit the key otherwise.
  const reading: MonthlyReviewReading | undefined = data.reading.books.length
    ? {
        books: data.reading.books.map((b) => ({
          title: b.title,
          totalChapters: b.totalChapters,
          chaptersAnswered: b.chaptersAnswered,
          questionsAnswered: b.questionsAnswered,
          questionsSkipped: b.questionsSkipped,
        })),
        totalChaptersAnswered: data.reading.totalChaptersAnswered,
        totalQuestionsAnswered: data.reading.totalQuestionsAnswered,
        totalQuestionsSkipped: data.reading.totalQuestionsSkipped,
      }
    : undefined;

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
    ...(reading ? { reading } : {}),
    sourceRefs,
  };
}
