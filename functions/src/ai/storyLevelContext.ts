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
  applyLevelStretch,
  composeSafeWords,
  effectivePhonicsLevel,
  normalizeLevelStretch,
} from "./storyDecodability.js";
import type { StretchedLevel } from "./storyDecodability.js";
import { loadStorySafeWords } from "./storySafeWords.js";
import { resolveStoryReadingLevel } from "./storyReadingLevel.js";
import type { StoryReadingLevel, StoryWorkingLevelEntry } from "./storyReadingLevel.js";

export interface StoryLevelContext {
  /** FEAT-173's descriptive level line + its provenance. */
  readingLevel: StoryReadingLevel;
  /**
   * The level the story is written for AND checked against — the child's own
   * level plus the parent's per-story stretch (FEAT-191), which is one number
   * precisely so the prompt and the check can never be calibrated differently.
   */
  effective: StretchedLevel;
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
  /**
   * The parent's per-story "one step up" (FEAT-191), 0-2 — clamped here, so a
   * caller may pass whatever the client sent. It never writes a level: the
   * child's assessed number on the Skill Snapshot is untouched, and the next
   * story with no stretch is written at it again.
   */
  levelStretch?: unknown;
}): Promise<StoryLevelContext> {
  const {
    db,
    familyId,
    childId,
    childName,
    age,
    workingLevels,
    requestedWords = [],
    levelStretch,
  } = args;

  const readingLevel = resolveStoryReadingLevel(workingLevels, age);
  const effective = applyLevelStretch(
    effectivePhonicsLevel(readingLevel.phonics, age),
    levelStretch,
  );
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
      // Sentence shape follows the level the story is written AT (FEAT-191): a
      // book one step up in vocabulary but held to the shorter sentence row
      // would be a stretch in words only. The age row still applies where the
      // level is a pure age estimate AND the parent asked for no stretch — a
      // stretch is an explicit choice about level, so it earns the level row.
      phonicsLevel:
        effective.source === "assessed" || effective.stretch > 0 ? effective.level : null,
      age,
    }),
    stretch: effective.stretch,
    baseLevel: effective.baseLevel,
  };

  return { readingLevel, effective, safeWords, allowedWords, block };
}

/**
 * The stretch a book was GENERATED with, read back off its own record
 * (FEAT-191).
 *
 * `reviseStory` and `revisePage` inject the READING LEVEL block server-side
 * precisely so a revise cannot walk the vocabulary back up (FEAT-176). The same
 * reasoning says a revise must not walk it back *down*: a book the parent asked
 * for one step up would, on the first "make it more exciting", be re-levelled at
 * the child's base level and every word the stretch had licensed would come back
 * flagged. So the number comes off `books/{bookId}.generationConfig.levelStretch`
 * — the book's own record of what it was written as — never off the revise
 * payload, which is the client asserting a level.
 *
 * Degrades to 0 (the child's own level) on anything unexpected: no id, a
 * missing book, an unreadable field, a failed read. Reads only.
 */
export async function loadBookLevelStretch(
  db: Firestore,
  familyId: string,
  bookId: string | undefined,
): Promise<number> {
  // A client-supplied id reaches a document path, so it is one path SEGMENT or
  // nothing. `a/b` would still land inside this family, but a path built out of
  // untrusted text is not a thing to leave to the shape of the collection.
  if (typeof bookId !== "string" || !bookId || /[/.]/.test(bookId)) return 0;
  try {
    const snap = await db.doc(`families/${familyId}/books/${bookId}`).get();
    const config = (
      snap.data() as { generationConfig?: { levelStretch?: unknown } } | undefined
    )?.generationConfig;
    return normalizeLevelStretch(config?.levelStretch);
  } catch (err) {
    console.warn("[AI] loadBookLevelStretch failed", { bookId, error: String(err) });
    return 0;
  }
}
