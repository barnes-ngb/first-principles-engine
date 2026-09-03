/**
 * The child's REAL reading level for the story writer (FEAT-173).
 *
 * `generateStory` used to hand the prompt a reading level *guessed from age*
 * (`isYoungReader ? "pre-K to kindergarten" : "1st grade"`) — a binary derived
 * from a birthdate, not from anything the app knows about how the child reads.
 * Lincoln (10, decoding around 1st grade) got "1st grade" by luck of the age
 * split; a 10-year-old reading at grade level would get the same string.
 *
 * The app already holds the assessed number: `skillSnapshots/{childId}.workingLevels`
 * (`src/core/types/evaluation.ts` — `WorkingLevels`), written by the Knowledge
 * Mine quests, guided evaluations, curriculum scans and parent overrides, and
 * already loaded into every chat task as `ctx.snapshotData.workingLevels`. Its
 * `phonics` entry is the decoding level (1–8) and `comprehension` the
 * passage-comprehension level (1–6). This module turns those into the one line
 * the story prompt reads, and falls back to the age-derived string ONLY when no
 * assessed level exists. No new level vocabulary: the number and the "Level N"
 * wording are the app's own (Knowledge Mine, Skill Snapshot page, the
 * `skillSnapshot` context slice all say "Level N"), and the band descriptors
 * are the meaning the repo's two phonics ladders (`buildQuestPrompt`'s READING
 * SKILL PROGRESSION and `core/curriculum/skillLevelMaps.PHONICS_SKILL_LEVEL_MAP`)
 * agree on — they disagree on the ORDER of digraphs/blends (3 vs 4) and on the
 * top two rungs, so levels 3–4 and 7–8 are described by both members of the
 * pair rather than by picking a side here.
 *
 * Pure: no I/O, never throws. Reads only; nothing here writes a level.
 */

/** The mode keys of `WorkingLevels` this surface reads. */
export const PHONICS_LEVEL_CAP = 8;
export const COMPREHENSION_LEVEL_CAP = 6;

/**
 * What a phonics working level means for the words a story may lean on. Keyed
 * by level; the two repo ladders agree at 1, 2, 5 and 6 and are merged at 3–4
 * and 7–8 (see the module header).
 */
export const PHONICS_LEVEL_BANDS: Readonly<Record<number, string>> = {
  1: "letter sounds and short vowels (single letters, not yet blending)",
  2: "CVC words by word family (cat, sun, hop, big)",
  3: "consonant digraphs and blends (sh/ch/th/wh, bl/st/tr/nd)",
  4: "consonant digraphs and blends (sh/ch/th/wh, bl/st/tr/nd), reading them fluently",
  5: "CVCe / long vowels (silent-e: make, bike, home, cute)",
  6: "vowel teams (ea, ai, oa, ee, oo)",
  7: "multi-syllable words, diphthongs and r-controlled vowels (rabbit, basket, coin, farm)",
  8: "multi-syllable words with prefixes and suffixes (unkind, replay, jumping, helpful)",
};

/** The raw Firestore shape of one `workingLevels` entry (as `SnapshotData` carries it). */
export interface StoryWorkingLevelEntry {
  level: number;
  updatedAt?: string;
  source?: string;
  evidence?: string;
}

export interface StoryReadingLevel {
  /** The text the prompt prints after "Reading level". */
  text: string;
  /** `assessed` when it came from `workingLevels`; `age` for the fallback guess. */
  source: "assessed" | "age";
  /**
   * The assessed DECODING level as a number (1-8), or `null` when
   * `workingLevels.phonics` carries none — additive (FEAT-176) so the
   * decodability check and the READING LEVEL prompt block can read the number
   * instead of re-parsing `text`. Note this is `null` even when `source` is
   * `"assessed"`, in the case where only `comprehension` was on file: a
   * comprehension level says nothing about which patterns the child can decode.
   */
  phonics: number | null;
}

/** The pre-FEAT-173 guess, kept as the fallback only. */
export function readingLevelFromAge(age: number): string {
  return age <= 7 ? "pre-K to kindergarten" : "1st grade";
}

function validLevel(entry: StoryWorkingLevelEntry | undefined, cap: number): number | null {
  if (!entry || typeof entry.level !== "number" || !Number.isFinite(entry.level)) return null;
  const level = Math.round(entry.level);
  if (level < 1) return null;
  return Math.min(level, cap);
}

function whenAndHow(entry: StoryWorkingLevelEntry): string {
  const parts: string[] = [];
  if (entry.source) parts.push(`by ${entry.source}`);
  if (entry.updatedAt) {
    const d = new Date(entry.updatedAt);
    if (!Number.isNaN(d.getTime())) {
      parts.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
    }
  }
  return parts.length > 0 ? ` (assessed ${parts.join(", ")})` : "";
}

/**
 * The reading level the story prompt should calibrate to.
 *
 * - `phonics` present → decoding level with its band, plus `comprehension` when
 *   it exists too. This is the primary: the story is decoded, so the phonics
 *   level is what bounds the word patterns it may use.
 * - only `comprehension` present → that level, and a plain note that decoding
 *   has not been assessed (the model then leans on WORD MASTERY, as before).
 * - neither → the age-derived guess, marked `source: "age"` so the prompt can
 *   say it is a guess.
 */
export function resolveStoryReadingLevel(
  workingLevels: Record<string, StoryWorkingLevelEntry> | undefined,
  age: number,
): StoryReadingLevel {
  const phonicsEntry = workingLevels?.phonics;
  const comprehensionEntry = workingLevels?.comprehension;
  const phonics = validLevel(phonicsEntry, PHONICS_LEVEL_CAP);
  const comprehension = validLevel(comprehensionEntry, COMPREHENSION_LEVEL_CAP);

  if (phonics === null && comprehension === null) {
    return { text: readingLevelFromAge(age), source: "age", phonics: null };
  }

  const parts: string[] = [];
  if (phonics !== null && phonicsEntry) {
    parts.push(
      `decoding at phonics Level ${phonics} of ${PHONICS_LEVEL_CAP} — ${PHONICS_LEVEL_BANDS[phonics]}${whenAndHow(phonicsEntry)}`,
    );
  } else {
    parts.push("decoding level not yet assessed — lean on WORD MASTERY for word choice");
  }
  if (comprehension !== null && comprehensionEntry) {
    parts.push(
      `comprehension Level ${comprehension} of ${COMPREHENSION_LEVEL_CAP}${whenAndHow(comprehensionEntry)}`,
    );
  }
  return { text: parts.join("; "), source: "assessed", phonics };
}
