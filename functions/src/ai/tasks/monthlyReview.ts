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
  pickHeroPhoto,
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

interface MonthlyReviewPage {
  id: string;
  sectionType:
    | "cover"
    | "monthInSentence"
    | "whatYouLoved"
    | "workedThrough"
    | "byTheNumbers";
  order: number;
  kidMode: PageContent;
  parentMode: PageContent;
  photoRefs: PhotoRef[];
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
  heroPhotoRef?: PhotoRef;
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
  const hero = pickHeroPhoto(scored);
  const placement = assignPhotosToSections(scored, {
    hasBookCompletions: data.completedBooks.length > 0,
    hasDadLab: data.dadLabReports.length > 0,
    resolvedBlockerEvidenceIds: curationCtx.resolvedBlockerEvidenceIds,
  });

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
  };
}

// ── Prompt construction ───────────────────────────────────────

function buildMonthlyReviewSystemPrompt(childName: string, month: string): string {
  return `${CHARTER_PREAMBLE}

You are writing a monthly review book for ${childName} for ${month}.

VOICE GUIDANCE:
- Kid mode: 2nd person ("you"), present-tense story arc, concrete, celebratory.
  Avoid abstract praise ("you worked so hard"). Prefer specific moments
  ("on April 12 you read 'pin' and 'pen' without mixing them up").
  Lincoln voice: Minecraft-natural where it fits, never forced.
  London voice: storybook-natural, gentle, imaginative.
- Parent mode: 3rd person, analytical but warm, evidence-based, names dates and
  source data, surfaces patterns. Never grades, never ranks. Frame growth as
  observation, not measurement.

NEVER DO:
- Compare children to each other.
- Use percentage-style measurements ("12% improvement").
- Use the words "behind", "ahead", "should be", or anything graded.
- Recommend specific products, curricula, or services the family does not already use.
- Pad sparse data — if a section has little evidence, write something short and honest.

SECTIONS REQUIRED (exact keys, both modes per section):
1. cover — short headline + 1-2 sentence body framing the month.
2. monthInSentence — single sentence per mode that captures the month's shape.
3. whatYouLoved — what engaged the child most. May include highlights[] and captions{}.
4. workedThrough — blockers encountered + what resolved (kid sees story arc,
   parent sees lifecycle data with dates).
5. byTheNumbers — stats framed as celebration (kid) or evidence (parent).

OUTPUT JSON SCHEMA (respond with ONLY this JSON, no markdown, no preamble):
{
  "theme": "short theme word or phrase (1-4 words)",
  "sections": {
    "cover": {
      "kidMode": { "headline": "...", "body": "..." },
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

The "captions" object keys must use photoId values from the photo refs given in
the user message. Only include captions for photos that were placed on that
section — leave captions empty {} if none.

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
  if (placement.whatYouLoved.length) {
    lines.push("whatYouLoved section photos:");
    for (const p of placement.whatYouLoved) {
      lines.push(
        `  - photoId="${p.id}", subject=${p.subjectTag ?? "?"}, captured=${p.capturedAt.slice(0, 10)}`,
      );
    }
  }
  if (placement.workedThrough.length) {
    lines.push("workedThrough section photos:");
    for (const p of placement.workedThrough) {
      lines.push(
        `  - photoId="${p.id}", subject=${p.subjectTag ?? "?"}, captured=${p.capturedAt.slice(0, 10)}`,
      );
    }
  }
  if (!placement.whatYouLoved.length && !placement.workedThrough.length && !hero) {
    lines.push("(no photos available for this month)");
  }
  return lines.join("\n");
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

interface ComposeInput {
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
];

const EMPTY_CONTENT: PageContent = {};

function composeMonthlyReview(input: ComposeInput): MonthlyReviewPayload {
  const { familyId, childId, month, data, hero, scored, placement, parsed } = input;
  const id = `${childId}_${month}`;

  const pages: MonthlyReviewPage[] = SECTION_ORDER.map((sectionType, idx) => {
    const section = parsed.sections[sectionType] ?? {};
    let photoRefs: PhotoRef[] = [];
    if (sectionType === "cover" && hero) photoRefs = [hero];
    if (sectionType === "whatYouLoved") photoRefs = placement.whatYouLoved;
    if (sectionType === "workedThrough") photoRefs = placement.workedThrough;

    return {
      id: `${id}_${sectionType}`,
      sectionType,
      order: idx,
      kidMode: section.kidMode ?? EMPTY_CONTENT,
      parentMode: section.parentMode ?? EMPTY_CONTENT,
      photoRefs,
    };
  });

  const curatedPhotos: PhotoRef[] = scored.slice(0, 30).map((p) => ({
    id: p.id,
    storagePath: p.storagePath,
    source: p.source,
    sourceDocId: p.sourceDocId,
    capturedAt: p.capturedAt,
    score: Number.isFinite(p.score) ? p.score : undefined,
    subjectTag: p.subjectTag,
  }));

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
    heroPhotoRef: hero,
    pages,
    curatedPhotos,
    unplacedPhotos: placement.more,
    stats,
    sourceRefs,
  };
}
