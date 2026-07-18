import { HttpsError } from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { buildStoryPrompt, modelForTask } from "../chat.js";
import type { StoryGenInput } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";
import {
  DEFAULT_TARGET_PAGE_COUNT,
  maxTokensForPageCount,
  reconcileStoryPageCount,
} from "../storyPageBudget.js";

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
  // seed defaults, never gate). Reading level is seeded from age, not name.
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
  const readingLevel = isYoungReader ? "pre-K to kindergarten" : "1st grade";

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
    readingLevel,
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

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: maxTokensForPageCount(targetPageCount),
    temperature: 0.7,
    systemPrompt: storySystemPrompt,
    messages: [{ role: "user", content: "Generate the story now." }],
  });

  // Validate on parse (FEAT-97): the model may return a different count. Accept a
  // good story regardless (the client derives the book from pages.length) — just
  // report the delta as telemetry, and warn only when it's wildly off (>±3).
  const pageMeta = reconcilePagesFromStory(targetPageCount, result.text);
  console.log(
    `[AI] taskType=generateStory inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}` +
      (pageMeta
        ? ` targetPages=${pageMeta.target} actualPages=${pageMeta.actual} pageDelta=${pageMeta.delta}`
        : ` targetPages=${targetPageCount} actualPages=?`),
  );
  if (pageMeta?.wildlyOff) {
    console.warn(
      `[AI] generateStory page count wildly off: target=${pageMeta.target} actual=${pageMeta.actual} (delta=${pageMeta.delta})`,
    );
  }

  await logAiUsage(db, familyId, {
    childId,
    taskType: "generateStory",
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
