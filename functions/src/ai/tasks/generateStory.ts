import { HttpsError } from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { buildStoryPrompt, buildStoryReadabilityFixPrompt, modelForTask } from "../chat.js";
import type { StoryGenInput } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";
import {
  DEFAULT_TARGET_PAGE_COUNT,
  maxTokensForPageCount,
  reconcileStoryPageCount,
} from "../storyPageBudget.js";
import { checkStoryReadability } from "../storyDecodability.js";
import type { StoryReadabilityReport } from "../storyDecodability.js";
import { resolveStoryLevelContext } from "../storyLevelContext.js";
import { sanitizeAndParseJson } from "../../shared/sanitizeJson.js";

// ── Preset themes (server-side mirror of client PRESET_THEMES) ──

const PRESET_THEME_MAP: Record<string, {
  storyTone: string;
  storyWorldDescription: string;
  storyVocabularyLevel: string;
  imageStylePrefix: string;
}> = {
  adventure: {
    storyTone: "adventurous and exciting with brave heroes",
    storyWorldDescription: "a world full of hidden treasures, ancient maps, and daring quests",
    storyVocabularyLevel: "medium complexity with action words",
    imageStylePrefix: "A colorful adventure scene for a children's book.",
  },
  animals: {
    storyTone: "gentle and heartwarming with animal friendships",
    storyWorldDescription: "a forest, farm, or jungle where animals talk and help each other",
    storyVocabularyLevel: "simple sentences with animal vocabulary",
    imageStylePrefix: "A warm, friendly children's book illustration of animals in nature.",
  },
  fantasy: {
    storyTone: "whimsical and magical with wonder and discovery",
    storyWorldDescription: "an enchanted realm with dragons, fairies, magic spells, and glowing forests",
    storyVocabularyLevel: "medium complexity with descriptive fantasy words",
    imageStylePrefix: "A magical fantasy scene for a children's book.",
  },
  minecraft: {
    storyTone: "adventurous with crafting and mining language",
    storyWorldDescription: "a blocky world made of cubes where heroes mine resources, craft tools, and explore caves",
    storyVocabularyLevel: "simple action-oriented sentences",
    imageStylePrefix: "A blocky pixel-art Minecraft-style scene.",
  },
  space: {
    storyTone: "exciting and wonder-filled with space exploration",
    storyWorldDescription: "outer space where astronauts visit planets, discover aliens, and float among the stars",
    storyVocabularyLevel: "medium complexity with space vocabulary",
    imageStylePrefix: "A vivid space scene for a children's book.",
  },
  dinosaurs: {
    storyTone: "exciting and educational with dinosaur facts woven in",
    storyWorldDescription: "a prehistoric world where friendly dinosaurs roam jungles, volcanoes, and swamps",
    storyVocabularyLevel: "medium complexity with dinosaur names and nature words",
    imageStylePrefix: "A prehistoric children's book illustration.",
  },
  ocean: {
    storyTone: "adventurous and curious with ocean exploration",
    storyWorldDescription: "a colorful underwater world with coral reefs, dolphins, whales, and sunken ships",
    storyVocabularyLevel: "medium complexity with ocean and marine vocabulary",
    imageStylePrefix: "An underwater children's book illustration.",
  },
  superheroes: {
    storyTone: "action-packed and inspiring with heroes saving the day",
    storyWorldDescription: "a city where kid superheroes use their powers to help people and stop villains",
    storyVocabularyLevel: "medium complexity with action and hero vocabulary",
    imageStylePrefix: "A bold, colorful superhero scene for a children's book.",
  },
  cooking: {
    storyTone: "fun and sensory-rich with cooking and tasting",
    storyWorldDescription: "a magical kitchen where ingredients come alive and cooking is an adventure",
    storyVocabularyLevel: "simple sentences with food and cooking vocabulary",
    imageStylePrefix: "A warm, cheerful kitchen scene for a children's book.",
  },
  sports: {
    storyTone: "energetic and encouraging with teamwork themes",
    storyWorldDescription: "playgrounds, fields, and courts where kids play sports and learn teamwork",
    storyVocabularyLevel: "simple action words with sports terminology",
    imageStylePrefix: "A bright, energetic children's book illustration of kids playing sports.",
  },
  holidays: {
    storyTone: "warm, festive, and joyful with celebration themes",
    storyWorldDescription: "a world of holiday celebrations — Christmas, Easter, Thanksgiving, birthdays, and seasonal traditions",
    storyVocabularyLevel: "simple sentences with holiday and celebration vocabulary",
    imageStylePrefix: "A festive, joyful children's book illustration. Holiday decorations, seasonal scenes.",
  },
};

async function resolveThemeGuidance(
  db: Firestore,
  familyId: string,
  themeId: string | undefined,
): Promise<StoryGenInput["themeGuidance"]> {
  if (!themeId) return undefined;

  // Check presets first
  const preset = PRESET_THEME_MAP[themeId];
  if (preset) return preset;

  // Check custom themes in Firestore
  try {
    const customDoc = await db.doc(`families/${familyId}/bookThemes/${themeId}`).get();
    if (customDoc.exists) {
      const data = customDoc.data() as Record<string, unknown>;
      return {
        storyTone: data.storyTone as string | undefined,
        storyWorldDescription: data.storyWorldDescription as string | undefined,
        storyVocabularyLevel: data.storyVocabularyLevel as string | undefined,
        imageStylePrefix: data.imageStylePrefix as string | undefined,
      };
    }
  } catch {
    // Ignore — fall through to no guidance
  }

  return undefined;
}

/**
 * Best-effort page-count reconciliation from the raw model text (FEAT-97).
 * Parses the story JSON only to count `pages` for telemetry — never throws and
 * never blocks the raw return; a story we can't parse here still flows to the
 * client untouched (returns `null`).
 */
export function reconcilePagesFromStory(
  target: number,
  rawText: string,
): ReturnType<typeof reconcileStoryPageCount> | null {
  try {
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { pages?: unknown };
    if (!Array.isArray(parsed.pages)) return null;
    return reconcileStoryPageCount(target, parsed.pages.length);
  } catch {
    return null;
  }
}

/**
 * Model stop reason that means the output budget ran out before the story did.
 * `callClaude` reports it as the raw API value.
 */
export const MAX_TOKENS_STOP_REASON = "max_tokens";

export interface StoryStopDiagnosis {
  /** True when the budget ended the reply — the story JSON is almost certainly incomplete. */
  cutShort: boolean;
  /** True when the model emitted no visible text at all (the whole budget went to reasoning). */
  noVisibleText: boolean;
  /** One-line, log-ready description; empty for a clean `end_turn`. */
  note: string;
}

/**
 * Name the shape of a generateStory reply so the log line — and the client, via
 * `stopReason` — can say *which* failure happened (FEAT-169). Before this, a
 * budget-truncated story and an API error reached the client as the same
 * "I had trouble writing that", and the CF log carried no `stop_reason` at all,
 * so neither Shelly's screenshot nor the log could say which one it was.
 *
 * Pure: no I/O, never throws. `generateStory` runs adaptive thinking at the API
 * default (HIGH) effort with `max_tokens` = `maxTokensForPageCount(pages)`, and
 * on the Sonnet-5 generation thinking tokens count against that same budget —
 * so a `max_tokens` stop with little or no visible text is the FEAT-77/78
 * signature (reasoning ate the budget), and a `max_tokens` stop with a long
 * text is a story that ran past its per-page allotment.
 */
export function describeStoryStop(
  stopReason: string | undefined,
  text: string,
  outputTokens: number,
): StoryStopDiagnosis {
  const cutShort = stopReason === MAX_TOKENS_STOP_REASON;
  const noVisibleText = text.trim().length === 0;
  if (!cutShort && !noVisibleText) return { cutShort: false, noVisibleText: false, note: "" };
  const parts: string[] = [];
  if (cutShort) {
    parts.push(
      `output budget exhausted (stop_reason=${MAX_TOKENS_STOP_REASON}, ${outputTokens} output/thinking tokens, ${text.length} chars of visible text)`,
    );
  }
  if (noVisibleText) {
    parts.push(
      cutShort
        ? "no visible text — reasoning consumed the whole budget (FEAT-77/78 shape)"
        : `no visible text (stop_reason=${stopReason ?? "unknown"}, ${outputTokens} output tokens)`,
    );
  }
  return { cutShort, noVisibleText, note: parts.join("; ") };
}

// ── Readability check + the one fix (FEAT-176) ───────────────────

/**
 * The parsed story. `pages` is the typed view the readability pass measures;
 * `raw` is the **whole** parsed object, kept because the story JSON carries
 * top-level fields this module has no business knowing about — `allWordsUsed`
 * and `missedWords` among them — and the readability pass must not be the
 * reason one goes missing (Codex P1 on PR #1737). `CreateSightWordBook` reads
 * `preview.missedWords.length` unguarded off a raw `JSON.parse`
 * (`useStoryGenerator`), so dropping the field is a client-side TypeError, not
 * a cosmetic loss.
 */
export interface ParsedStory {
  title: string;
  pages: Array<{ pageNumber?: number; text?: string }>;
  /** The complete parsed object, exactly as the model returned it. */
  raw: Record<string, unknown>;
}

/**
 * Parse a story reply into pages, or `null` if it isn't one. Never throws — an
 * unparseable reply is returned to the client exactly as it is today, with no
 * readability report attached, so every FEAT-169 failure path is unchanged.
 */
export function parseStoryForReadability(rawText: string): ParsedStory | null {
  try {
    const parsed = sanitizeAndParseJson<{ title?: unknown; pages?: unknown }>(rawText);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) return null;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      pages: parsed.pages as ParsedStory["pages"],
      raw: parsed as unknown as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/**
 * The story to return after an accepted fix: the fixed story, with any
 * top-level field the ORIGINAL carried and the fix dropped filled back in.
 *
 * The fix prompt asks for the same JSON shape and is now handed the complete
 * original, but a model that quietly omits `missedWords` must not be able to
 * crash the sight-word-book preview — so this is the belt to that braces.
 * Fixed fields always win; only genuinely absent keys are restored, and
 * `pages` is never taken from the original.
 */
export function mergeFixedStory(
  original: Record<string, unknown>,
  fixed: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...fixed };
  for (const [key, value] of Object.entries(original)) {
    if (key === "pages") continue;
    if (!(key in merged) || merged[key] === undefined) merged[key] = value;
  }
  return merged;
}

/** The hard words the fix prompt is handed, grouped by page in page order. */
export function hardWordsByPage(
  report: StoryReadabilityReport,
): Array<{ page: number; words: string[] }> {
  return report.pages
    .filter((p) => p.hardWords.length > 0)
    .map((p) => ({ page: p.pageNumber, words: p.hardWords.map((h) => h.word) }));
}

/**
 * Is the fixed story the one to keep?
 *
 * Three conditions, all of them about not making things worse. It must have
 * parsed, and it must still be the same book (same page count — the fix prompt
 * says so, and a fix that dropped pages is a different failure wearing this
 * one's clothes).
 *
 * Then the readability outcome is compared **whole** (Codex P2 on PR #1737).
 * Counting only distinct hard words was gameable in the wrong direction: a fix
 * that replaces three distinct above-level words with ONE above-level word
 * repeated a dozen times lowers `totalHardWords` while making the page denser
 * and the story harder to read. So a fix that does not itself pass must improve
 * the distinct count **and** worsen neither the hard-word density nor the worst
 * page. A fix that passes the tolerance is kept outright — passing is the goal.
 *
 * A tie keeps the original, because the original is the story the beats and the
 * theme were written for and the fix prompt saw neither.
 *
 * Pure so the decision is testable without a model.
 */
export function shouldKeepFixedStory(
  original: StoryReadabilityReport,
  fixed: StoryReadabilityReport | null,
  originalPageCount: number,
  fixedPageCount: number,
): boolean {
  if (!fixed) return false;
  if (fixedPageCount !== originalPageCount) return false;
  // Passing the tolerance is the whole point of the fix.
  if (fixed.passed) return true;
  if (fixed.totalHardWords >= original.totalHardWords) return false;
  if (hardWordRatio(fixed) > hardWordRatio(original)) return false;
  return worstPageHardWords(fixed) <= worstPageHardWords(original);
}

/** Hard-word occurrences as a share of all tokens; 0 for an empty story. */
function hardWordRatio(report: StoryReadabilityReport): number {
  return report.totalTokens === 0 ? 0 : report.totalHardOccurrences / report.totalTokens;
}

/** The most distinct hard words on any one page — the per-page rule's high-water mark. */
function worstPageHardWords(report: StoryReadabilityReport): number {
  return report.pages.reduce((max, p) => Math.max(max, p.hardWords.length), 0);
}

/**
 * What the client is told about how readable the story actually is (FEAT-176
 * Part 4). Additive on the response next to `stopReason`; a client that doesn't
 * read it is unchanged, and `undefined` means "not measured", never "fine".
 */
export interface StoryReadabilityInfo {
  phonicsLevel: number;
  levelSource: "assessed" | "age";
  passed: boolean;
  /**
   * A capped SAMPLE of the words above the level, page-tagged — examples for
   * the parent-facing line, not the tally.
   */
  hardWords: Array<{ page: number; word: string }>;
  /**
   * The TRUE number of distinct words above the level across the whole story,
   * never truncated (Codex P2 on PR #1737). `hardWords` is capped at
   * `MAX_REPORTED_HARD_WORDS`, so a client that counted that array would tell a
   * parent "12 words" about a story with 30 — the one thing this feature exists
   * not to do.
   */
  hardWordCount: number;
  /** True when the one fix attempt ran AND its result was the one returned. */
  revised: boolean;
}

/** How many hard words the honest line will name — the rest are counted, not listed. */
export const MAX_REPORTED_HARD_WORDS = 12;

export function toReadabilityInfo(
  report: StoryReadabilityReport,
  revised: boolean,
): StoryReadabilityInfo {
  return {
    phonicsLevel: report.phonicsLevel,
    levelSource: report.levelSource,
    passed: report.passed,
    hardWords: report.hardWords
      .slice(0, MAX_REPORTED_HARD_WORDS)
      .map((h) => ({ page: h.page, word: h.word })),
    hardWordCount: report.distinctHardWords.length,
    revised,
  };
}

/**
 * Task: generateStory
 * Context: childProfile + sightWords + wordMastery (via buildContextForTask)
 * Model: Sonnet
 */

export const handleGenerateStory = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, messages, apiKey } = ctx;

  // Parse story config from first message
  let storyConfig: {
    storyIdea?: string;
    sightWords?: string[];
    words?: string[];
    theme?: string;
    pageCount?: number;
  };
  try {
    storyConfig = JSON.parse(messages[0].content);
  } catch {
    throw new HttpsError(
      "invalid-argument",
      "generateStory requires JSON with story parameters.",
    );
  }

  const storyWords = storyConfig.words ?? storyConfig.sightWords ?? [];
  const storyIdea = storyConfig.storyIdea ?? storyConfig.theme ?? "";

  // Load child profile for personalized story
  const storyChildName = childData.name ?? "the reader";
  let storyChildAge = 10;
  const childFullDoc = await db
    .doc(`families/${familyId}/children/${childId}`)
    .get();
  const childFullData = childFullDoc.data() as
    | { birthdate?: string; interests?: string; motivators?: string }
    | undefined;
  if (childFullData?.birthdate) {
    const birth = new Date(childFullData.birthdate);
    storyChildAge = Math.floor(
      (Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    );
  }

  // Interests come from the child's profile, never their name (ARCH-15). When
  // no interests are recorded yet, seed a sensible default by age (data may
  // seed defaults, never gate).
  const isYoungReader = storyChildAge <= 7;
  const profileInterests =
    childData.interests?.trim() ||
    childFullData?.interests?.trim() ||
    childData.motivators?.trim() ||
    childFullData?.motivators?.trim() ||
    "";
  const childInterests =
    profileInterests ||
    (isYoungReader
      ? "animals, drawing, fairy tales, colors, nature"
      : "dragons, quests, building, adventures");
  // The reading level is READ, not guessed (FEAT-173): the child's assessed
  // `workingLevels` (phonics = decoding, comprehension) off the skill snapshot
  // the dispatcher already loaded into `ctx.snapshotData`. The age-derived
  // string is the fallback only — used when no assessed level exists yet.
  // FEAT-176 turns that level into a CONCRETE prompt block (allowed patterns,
  // a banned list, the child's own words as an allowlist, a sentence shape and
  // a worked page) plus the allowlist the finished story is measured against.
  const levelContext = await resolveStoryLevelContext({
    db,
    familyId,
    childId,
    childName: storyChildName,
    age: storyChildAge,
    workingLevels: ctx.snapshotData?.workingLevels,
    requestedWords: storyWords,
  });
  const readingLevel = levelContext.readingLevel;

  // Resolve theme guidance from preset or custom Firestore theme
  const themeGuidance = await resolveThemeGuidance(db, familyId, storyConfig.theme);

  // Target page count is a product decision (FEAT-97). Default to the priced
  // product size when the client sends no target, and scale the output budget
  // with it so a long book doesn't truncate (the FEAT-77/78 lesson).
  const targetPageCount = storyConfig.pageCount ?? DEFAULT_TARGET_PAGE_COUNT;

  const storyPrompt = buildStoryPrompt({
    storyIdea,
    words: storyWords,
    pageCount: targetPageCount,
    childName: storyChildName,
    childAge: storyChildAge,
    childInterests,
    readingLevel: readingLevel.text,
    readingLevelAssessed: readingLevel.source === "assessed",
    readingLevelBlock: levelContext.block,
    themeGuidance,
  });

  // Load shared context (child profile + sight words + word mastery)
  const contextSections = await buildContextForTask("generateStory", {
    db,
    familyId,
    childId,
    childData,
    snapshotData: ctx.snapshotData,
  });
  const familyContext = contextSections.join("\n\n");
  const storySystemPrompt = `${familyContext}\n\n${storyPrompt}`;

  const model = modelForTask("generateStory");

  // The budget scales with the page count AND the word list (FEAT-173): every
  // word asked for is one more constraint to reason over and one more candidate
  // for each page's listing, and FEAT-169's diagnostic confirmed a 10-page book
  // with a list ran out of room at the page-only budget.
  const maxTokens = maxTokensForPageCount(targetPageCount, storyWords.length);

  const result = await callClaude({
    apiKey,
    model,
    maxTokens,
    temperature: 0.7,
    systemPrompt: storySystemPrompt,
    messages: [{ role: "user", content: "Generate the story now." }],
  });

  // ── Measure, fix once, then be honest (FEAT-176) ──────────────
  //
  // FEAT-173 asked the model to stay at the level; nothing checked that it had.
  // Here the drafted story is measured against the same level the prompt block
  // named, and a failure buys exactly ONE focused revise call — never a loop —
  // after which whichever version has fewer hard words is returned and the
  // client says plainly what is still above the level.
  let finalText = result.text;
  let readabilityInfo: StoryReadabilityInfo | undefined;
  let fixTokens: { inputTokens: number; outputTokens: number } | null = null;

  const drafted = parseStoryForReadability(result.text);
  if (drafted) {
    const checkOptions = {
      phonicsLevel: levelContext.effective.level,
      levelSource: levelContext.effective.source,
      allowedWords: levelContext.allowedWords,
    };
    const firstReport = checkStoryReadability(drafted.pages, checkOptions);
    let finalReport = firstReport;
    let revised = false;

    if (!firstReport.passed) {
      try {
        const fix = await callClaude({
          apiKey,
          model,
          // The fix rewrites at most a handful of words across the same pages,
          // so it needs no more room than the generation did.
          maxTokens,
          temperature: 0.7,
          systemPrompt: buildStoryReadabilityFixPrompt({
            childName: storyChildName,
            // The COMPLETE story, not the reduced view: the model has to see
            // `allWordsUsed` / `missedWords` to return them (Codex P1).
            storyJson: JSON.stringify(drafted.raw),
            hardWordsByPage: hardWordsByPage(firstReport),
            readingLevelBlock: levelContext.block,
            pageCount: drafted.pages.length,
          }),
          messages: [{ role: "user", content: "Return the fixed story now." }],
        });
        fixTokens = { inputTokens: fix.inputTokens, outputTokens: fix.outputTokens };
        const fixedStory = parseStoryForReadability(fix.text);
        const fixedReport = fixedStory
          ? checkStoryReadability(fixedStory.pages, checkOptions)
          : null;
        if (
          fixedStory &&
          shouldKeepFixedStory(
            firstReport,
            fixedReport,
            drafted.pages.length,
            fixedStory.pages.length,
          )
        ) {
          // Re-serialize from the MERGE, not from `fix.text`: a fix that
          // silently dropped a top-level field would otherwise reach the client
          // without it, and `CreateSightWordBook` dereferences `missedWords`
          // unguarded (Codex P1).
          finalText = JSON.stringify(mergeFixedStory(drafted.raw, fixedStory.raw));
          finalReport = fixedReport!;
          revised = true;
        }
      } catch (err) {
        // A failed fix must never cost the parent the story they already have.
        console.warn("[AI] generateStory readability fix failed", { childId, error: String(err) });
      }
    }

    readabilityInfo = toReadabilityInfo(finalReport, revised);
  }

  // Validate on parse (FEAT-97): the model may return a different count. Accept a
  // good story regardless (the client derives the book from pages.length) — just
  // report the delta as telemetry, and warn only when it's wildly off (>±3).
  const pageMeta = reconcilePagesFromStory(targetPageCount, finalText);
  console.log(
    `[AI] taskType=generateStory inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}` +
      ` maxTokens=${maxTokens} stopReason=${result.stopReason}` +
      ` words=${storyWords.length} readingLevel=${readingLevel.source}` +
      ` readabilityLevel=${levelContext.effective.level}` +
      (readabilityInfo
        ? ` readability=${readabilityInfo.passed ? "pass" : "fail"}` +
          ` hard=${readabilityInfo.hardWords.length} revised=${readabilityInfo.revised ? "yes" : "no"}`
        : " readability=unmeasured") +
      (pageMeta
        ? ` targetPages=${pageMeta.target} actualPages=${pageMeta.actual} pageDelta=${pageMeta.delta}`
        : ` targetPages=${targetPageCount} actualPages=?`),
  );
  if (pageMeta?.wildlyOff) {
    console.warn(
      `[AI] generateStory page count wildly off: target=${pageMeta.target} actual=${pageMeta.actual} (delta=${pageMeta.delta})`,
    );
  }
  // Say which failure it was, in the log (FEAT-169): a story the client can't
  // parse is either cut short by the budget or malformed, and only the server
  // can see `stop_reason`. The client gets the same signal via `stopReason`.
  const stop = describeStoryStop(result.stopReason, result.text, result.outputTokens);
  if (stop.note) {
    console.warn(`[AI] generateStory reply incomplete: ${stop.note}`);
  }

  // Both calls are billed, so both are logged (FEAT-176). The readability fix is
  // a second paid call and the usage record must say so.
  const totalInputTokens = result.inputTokens + (fixTokens?.inputTokens ?? 0);
  const totalOutputTokens = result.outputTokens + (fixTokens?.outputTokens ?? 0);
  await logAiUsage(db, familyId, {
    childId,
    taskType: "generateStory",
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });
  if (fixTokens) {
    await logAiUsage(db, familyId, {
      childId,
      taskType: "generateStory",
      model,
      inputTokens: fixTokens.inputTokens,
      outputTokens: fixTokens.outputTokens,
    });
  }

  return {
    message: finalText,
    model,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    // The GENERATION's stop reason, deliberately — it is what says whether the
    // story itself came back whole, and the readability fix is only ever adopted
    // when it parsed into the same number of pages.
    stopReason: result.stopReason,
    ...(readabilityInfo ? { readability: readabilityInfo } : {}),
  };
};
