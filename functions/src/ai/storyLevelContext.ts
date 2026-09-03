/**
 * One place that answers "what level is this story written for, and which words
 * are safe in it?" — shared by generateStory, reviseStory and revisePage
 * (FEAT-176).
 *
 * It composes three things that already existed separately:
 *   - `resolveStoryReadingLevel` (FEAT-173) — the child's ASSESSED level, read
 *     off `skillSnapshots.workingLevels`, with its provenance line.
 *   - `effectivePhonicsLevel` — that number, or a careful age-derived floor when
 *     no level is on file (the case the owner reported: *"regardless the words
 *     are too advanced"*).
 *   - `loadStorySafeWords` + `composeSafeWords` — the child's own sight words as
 *     an allowlist, plus the high-frequency core.
 *
 * Two lists come out, and the difference is deliberate:
 *   - `safeWords` is what the PROMPT prints, capped at `SAFE_WORD_CAP` so the
 *     block stays readable.
 *   - `allowedWords` is what the CHECK honours, uncapped — a word the child
 *     genuinely knows should never be reported as too hard just because it fell
 *     off the bottom of a printed list.
 *
 * Reads only. Never throws, never writes a level.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { ReadingLevelBlockInput } from "./chat.js";
import { sentenceTargetFor } from "./chat.js";
import {
  CORE_SIGHT_WORDS,
  composeSafeWords,
  effectivePhonicsLevel,
} from "./storyDecodability.js";
import type { EffectiveLevel } from "./storyDecodability.js";
import { loadStorySafeWords } from "./storySafeWords.js";
import { resolveStoryReadingLevel } from "./storyReadingLevel.js";
import type { StoryReadingLevel, StoryWorkingLevelEntry } from "./storyReadingLevel.js";

export interface StoryLevelContext {
  /** FEAT-173's descriptive level line + its provenance. */
  readingLevel: StoryReadingLevel;
  /** The level the story is written for AND checked against. */
  effective: EffectiveLevel;
  /** The SAFE WORDS the prompt prints (capped). */
  safeWords: string[];
  /** Every word that is fine at any level (uncapped) — what the check honours. */
  allowedWords: string[];
  /** Ready to hand to `buildReadingLevelBlock`. */
  block: ReadingLevelBlockInput;
}

export async function resolveStoryLevelContext(args: {
  db: Firestore;
  familyId: string;
  childId: string;
  childName: string;
  age: number;
  workingLevels?: Record<string, StoryWorkingLevelEntry>;
  /** The words the story was asked to weave in — never dropped from either list. */
  requestedWords?: readonly string[];
}): Promise<StoryLevelContext> {
  const { db, familyId, childId, childName, age, workingLevels, requestedWords = [] } = args;

  const readingLevel = resolveStoryReadingLevel(workingLevels, age);
  const effective = effectivePhonicsLevel(readingLevel.phonics, age);
  const groups = await loadStorySafeWords(db, familyId, childId);

  const safeWords = composeSafeWords({
    core: CORE_SIGHT_WORDS,
    mastered: groups.mastered,
    familiar: groups.familiar,
    practicing: groups.practicing,
    requested: requestedWords,
  });
  // Uncapped, and `justAdded` (`new`) is in here too: a word the child has met
  // is still a word they may meet again, and the point of the check is to catch
  // vocabulary they have never seen.
  const allowedWords = composeSafeWords(
    {
      core: CORE_SIGHT_WORDS,
      mastered: groups.mastered,
      familiar: groups.familiar,
      practicing: [...groups.practicing, ...groups.justAdded],
      requested: requestedWords,
    },
    Number.MAX_SAFE_INTEGER,
  );

  const block: ReadingLevelBlockInput = {
    childName,
    level: effective.level,
    levelSource: effective.source,
    // The descriptive line is FEAT-173's, and only means anything when it came
    // off an assessed level — an age guess would just repeat the estimate note.
    ...(effective.source === "assessed" ? { levelText: readingLevel.text } : {}),
    safeWords,
    sentenceTarget: sentenceTargetFor({
      phonicsLevel: effective.source === "assessed" ? effective.level : null,
      age,
    }),
  };

  return { readingLevel, effective, safeWords, allowedWords, block };
}
