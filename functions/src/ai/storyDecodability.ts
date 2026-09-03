/**
 * Is the story the model just wrote actually readable BY this child? (FEAT-176)
 *
 * FEAT-173 made the reading level **real** — read off `skillSnapshots.workingLevels`
 * rather than guessed from a birthdate (`storyReadingLevel.ts`). It left it
 * **abstract**: the prompt carried one RULES line ("keep the decoding demands of
 * the text at or below it") and nothing ever measured the result. An LLM honours
 * a line like that about as well as it honours "be concise", and the owner report
 * (Nathan, 2026-09-03) is the proof: *"it makes books not readable by London who
 * is 6 … regardless the words are too advanced."*
 *
 * This module is the measurement. It is deliberately **orthographic**, not
 * frequency-based: it asks "what phonics patterns does decoding this word
 * require?", which is the same question the child's `workingLevels.phonics`
 * number answers. A word the child has simply MEMORISED is out of its reach by
 * construction — that is what `allowedWords` is for, and the caller composes
 * that list (`CORE_SIGHT_WORDS` + the child's own sight words + whatever the
 * parent typed) rather than this module guessing at it.
 *
 * ## The ladder question FEAT-173 flagged is closed here by construction
 *
 * FEAT-173 found the repo's two phonics ladders disagree on the ORDER of
 * digraphs and blends (`buildQuestPrompt`: 3 = digraphs, 4 = blends;
 * `PHONICS_SKILL_LEVEL_MAP`: 3 = blends, 4 = digraphs) and on the top two rungs,
 * so a stored "Level 3" means something slightly different depending on its
 * `source`. This classifier **unlocks digraphs and blends together at 3**, which
 * makes levels 3 and 4 identical in what they permit. That is not picking a
 * side — it is refusing to: under either ladder, a child at Level 3 or 4 has one
 * of the two and is working on the other, and both readings agree that by 4 both
 * are in hand. The same merge is applied at 7/8 (r-controlled + diphthongs +
 * two-syllable at 7; prefixes/suffixes at 8), matching `PHONICS_LEVEL_BANDS` in
 * `storyReadingLevel.ts`. The cost is that a Level-3 story is checked slightly
 * generously; the benefit is that no stored level can be misread.
 *
 * ## What it deliberately does NOT do
 *
 * - It does not write anything, read anything, or know what a Firestore is.
 * - It never throws. A word it cannot account for classifies as Level 8 (the
 *   conservative direction — flagged, not waved through), and an unparseable
 *   page contributes nothing rather than poisoning a total.
 * - It does not decide what happens next. `handleGenerateStory` decides that:
 *   one fix attempt, then honesty (FEAT-176 Part 3).
 *
 * Pure: no I/O, imports nothing, never throws.
 */

/** The phonics ladder cap, mirroring `storyReadingLevel.PHONICS_LEVEL_CAP`. */
export const DECODABILITY_LEVEL_CAP = 8;

/**
 * The phonics level a child is assumed to be at when no assessed level exists.
 * Deliberately LOW: an unassessed level is the exact case the owner reported
 * ("regardless the words are too advanced"), and the honest line tells the
 * parent it is an estimate and where to set the real one.
 */
export const FALLBACK_LEVEL_YOUNG = 2;
export const FALLBACK_LEVEL_OLDER = 4;
/** Ages at or below this take `FALLBACK_LEVEL_YOUNG`. Matches `readingLevelFromAge`. */
export const FALLBACK_YOUNG_MAX_AGE = 7;

/**
 * The always-allowed core: the **Dolch pre-primer + primer list**, the ~90
 * highest-frequency words in beginning-reader English (together roughly 40% of
 * the running words in a beginner book).
 *
 * Why it exists. Most of these are either irregular (`said`, `of`, `one`,
 * `come`) or carry a pattern above the bottom of the ladder (`and` needs the
 * `nd` blend, `the`/`this` the `th` digraph, `see`/`blue` a vowel team), so a
 * purely orthographic classifier calls them hard at Level 2 — correctly, and
 * uselessly. Flagging them would bury the words that actually make a book
 * unreadable for a 6-year-old (*castle*, *journey*, *ready*) under a wall of
 * *the* and *and*, and would make a Level-2 story impossible to write at all.
 * Every real decodable reader ships with exactly such a list; this is the
 * standard one rather than one invented here.
 *
 * It is the **caller's** list to compose, not the checker's:
 * `checkStoryReadability` only ever sees `allowedWords`. Keeping the core out
 * here means the classifier's own answer for `the` stays honest (Level 3 — it
 * needs the `th` digraph), and a caller that wants the strict reading simply
 * does not pass it.
 *
 * Deliberately NOT extended past the primer list: every word added here is a
 * hole in the measurement.
 */
export const CORE_SIGHT_WORDS: readonly string[] = [
  // Dolch pre-primer
  "a", "and", "away", "big", "blue", "can", "come", "down", "find", "for",
  "funny", "go", "help", "here", "i", "in", "is", "it", "jump", "little",
  "look", "make", "me", "my", "not", "one", "play", "red", "run", "said",
  "see", "the", "three", "to", "two", "up", "we", "where", "yellow", "you",
  // Dolch primer
  "all", "am", "are", "at", "ate", "be", "black", "brown", "but", "came",
  "did", "do", "eat", "four", "get", "good", "have", "he", "into", "like",
  "must", "new", "no", "now", "on", "our", "out", "please", "pretty", "ran",
  "ride", "saw", "say", "she", "so", "soon", "that", "there", "they", "this",
  "too", "under", "want", "was", "well", "went", "what", "white", "who",
  "will", "with", "yes",
  // Irregulars every story needs that the two Dolch lists above leave out.
  "of", "his", "her", "him", "as", "an", "if", "us", "them", "then", "when",
];

/**
 * How many of the CHILD'S OWN words the SAFE WORDS block prints. The core list
 * above is always printed in full on top of this — it is fixed, small and the
 * part the model most needs stated, and capping the two together would let a
 * long mastered list silently push `the` and `said` out of the block.
 */
export const SAFE_WORD_CAP = 80;

/** One word the reader is not expected to be able to decode, and why. */
export interface HardWord {
  word: string;
  /** The lowest phonics level at which this word's patterns are taught. */
  minLevel: number;
}

/** One page's verdict. */
export interface PageReadability {
  pageNumber: number;
  /** Distinct hard words in first-appearance order (a word repeated on a page counts once). */
  hardWords: HardWord[];
  /** Every token on the page, including repeats and safe words. */
  tokenCount: number;
  /** Hard-word OCCURRENCES on the page (repeats counted) — the numerator of the ratio. */
  hardOccurrences: number;
}

/** The tolerance in force for a level. */
export interface ReadabilityTolerance {
  /** Distinct hard words allowed on any one page. */
  maxPerPage: number;
  /** Hard-word occurrences allowed as a share of all tokens, 0-1. */
  maxRatio: number;
}

export interface StoryReadabilityReport {
  /** The level the story was checked against. */
  phonicsLevel: number;
  /** `assessed` when it came from `workingLevels.phonics`; `age` for the fallback. */
  levelSource: "assessed" | "age";
  passed: boolean;
  pages: PageReadability[];
  /** Every hard word, page-tagged, in page order — what the client's honest line reads. */
  hardWords: Array<{ page: number; word: string; minLevel: number }>;
  /** Distinct hard words across the whole story, first-appearance order. */
  distinctHardWords: string[];
  totalTokens: number;
  /** Sum of the per-page DISTINCT counts. */
  totalHardWords: number;
  /** Sum of the per-page occurrence counts. */
  totalHardOccurrences: number;
  tolerance: ReadabilityTolerance;
}

export interface StoryReadabilityOptions {
  phonicsLevel: number;
  levelSource?: "assessed" | "age";
  /**
   * Words that are fine at ANY level — the child's sight words plus whatever the
   * parent asked for. Matched case-insensitively, punctuation-stripped.
   */
  allowedWords?: Iterable<string>;
}

/** A page as the story JSON carries it. `pageNumber` is optional; the index fills in. */
export interface ReadabilityPageInput {
  pageNumber?: number;
  text?: string;
}

// ── Tolerance table ─────────────────────────────────────────────

/**
 * How much stretch a level tolerates. One table, one place.
 *
 * The shape is deliberate: a beginning reader stalls on a single unknown word,
 * so Level 1-4 gets almost none; a Level 7-8 reader can carry a few unfamiliar
 * words on context. BOTH rules must hold — the per-page cap catches one dense
 * page in an otherwise easy book, and the ratio catches a book that is uniformly
 * a bit too hard.
 */
export function toleranceForLevel(phonicsLevel: number): ReadabilityTolerance {
  const level = clampLevel(phonicsLevel);
  if (level <= 4) return { maxPerPage: 1, maxRatio: 0.05 };
  if (level <= 6) return { maxPerPage: 2, maxRatio: 0.1 };
  return { maxPerPage: 3, maxRatio: 0.15 };
}

// ── The level a story is checked against ────────────────────────

export interface EffectiveLevel {
  level: number;
  source: "assessed" | "age";
}

/**
 * The level to check against: the assessed `phonics` working level when there is
 * one, else a low estimate from age. Nothing here writes a level.
 */
export function effectivePhonicsLevel(
  assessedPhonics: number | null | undefined,
  age: number,
): EffectiveLevel {
  if (typeof assessedPhonics === "number" && Number.isFinite(assessedPhonics) && assessedPhonics >= 1) {
    return { level: clampLevel(assessedPhonics), source: "assessed" };
  }
  const young = Number.isFinite(age) ? age <= FALLBACK_YOUNG_MAX_AGE : true;
  return { level: young ? FALLBACK_LEVEL_YOUNG : FALLBACK_LEVEL_OLDER, source: "age" };
}

// ── The classifier ──────────────────────────────────────────────

const CONSONANT_DIGRAPHS = ["sh", "ch", "th", "wh", "ck", "ph", "ng", "gh"];
const BLENDS = [
  "bl", "cl", "fl", "gl", "pl", "sl",
  "br", "cr", "dr", "fr", "gr", "pr", "tr",
  "sc", "sk", "sm", "sn", "sp", "st", "sw",
  "tw", "scr", "spl", "spr", "str", "shr", "thr",
  "nd", "nt", "nk", "mp", "lt", "lp", "lk", "ft", "sk", "st", "ct", "pt", "lf", "lb", "nch",
];
const VOWEL_TEAMS = [
  "ai", "ay", "ea", "ee", "ie", "oa", "oe", "ue", "ui", "oo", "au", "aw", "ew", "igh", "eigh",
];
const DIPHTHONGS = ["oi", "oy", "ou", "ow"];
const R_CONTROLLED = ["ar", "or", "er", "ir", "ur"];
const PREFIXES = ["un", "re", "dis", "pre", "mis", "non", "over", "under"];
const SUFFIXES = ["ing", "ed", "er", "est", "ly", "ful", "less", "ness", "tion", "sion", "able", "ible", "ment"];

/**
 * The lowest phonics level (1-8) at which a reader has been taught the patterns
 * this word needs. Case-insensitive; leading/trailing punctuation stripped.
 *
 * Anything it cannot account for lands at 8 — the conservative direction. A
 * word carrying a digit is 8 too (a numeral is not decoded, it is read as a
 * word the child has not met in print).
 */
export function minPhonicsLevelForWord(raw: string): number {
  const word = normalizeWord(raw);
  if (!word) return 1;
  if (/\d/.test(word)) return DECODABILITY_LEVEL_CAP;
  // A hyphenated compound is two words plus a convention — past this ladder.
  if (word.includes("-")) return DECODABILITY_LEVEL_CAP;

  // A contraction or possessive needs the apostrophe convention, which no
  // ladder rung below silent-e teaches. Take the harder of that floor and the
  // letters' own patterns.
  const contraction = word.includes("'");
  const letters = word.replace(/[^a-z]/g, "");
  if (!letters) return 1;
  const base = classifyLetters(letters);
  return contraction ? Math.max(base, 5) : base;
}

function classifyLetters(w: string): number {
  // Level 8 — prefixes and suffixes on a word that still has a root left over.
  if (hasAffix(w)) return DECODABILITY_LEVEL_CAP;
  // Level 7 — more than one syllable.
  if (countSyllables(w) >= 2) return 7;
  // Level 7 — r-controlled vowels and diphthongs (single-syllable from here on).
  // Every R_CONTROLLED entry already begins with its vowel, so a substring hit
  // IS a vowel followed by r ("farm" yes; "rain" no — its r opens the word).
  if (containsAny(w, R_CONTROLLED) || containsAny(w, DIPHTHONGS)) return 7;
  // Level 6 — vowel teams.
  if (containsAny(w, VOWEL_TEAMS)) return 6;
  // Level 5 — silent-e / long vowels (VCe).
  if (/[aeiou][^aeiou]e$/.test(w)) return 5;
  // Level 3 — consonant digraphs and blends (see the header: 3 and 4 are merged).
  if (containsAny(w, CONSONANT_DIGRAPHS) || containsAny(w, BLENDS)) return 3;
  // Levels 1-2 — CVC / VC / CV with a single short vowel.
  if (isSimpleShort(w)) return 2;
  return DECODABILITY_LEVEL_CAP;
}

function containsAny(w: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => w.includes(p));
}

function hasAffix(w: string): boolean {
  for (const p of PREFIXES) {
    if (w.startsWith(p) && w.length - p.length >= 3) return true;
  }
  for (const s of SUFFIXES) {
    if (w.endsWith(s) && w.length - s.length >= 3) return true;
  }
  return false;
}

/** Vowel-group syllable count with the silent final `e` discounted. Never below 1. */
export function countSyllables(w: string): number {
  const groups = w.match(/[aeiouy]+/g);
  if (!groups) return 1;
  let count = groups.length;
  if (count > 1 && /[^aeiouy]e$/.test(w)) count--;
  return Math.max(1, count);
}

/** A short single-syllable word with no pattern above the CVC band. */
function isSimpleShort(w: string): boolean {
  if (w.length > 4) return false;
  return /^[a-z]*[aeiouy][a-z]*$/.test(w);
}

/** Lower-case, strip surrounding punctuation, normalise curly apostrophes. */
export function normalizeWord(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^[^a-z0-9']+/, "")
    .replace(/[^a-z0-9'-]+$/, "")
    .replace(/^-+|-+$/g, "");
}

/** Split a page's text into word tokens, punctuation dropped. */
export function tokenizeStoryText(text: string): string[] {
  return String(text ?? "")
    .split(/[^A-Za-z0-9'‘’-]+/)
    .map(normalizeWord)
    .filter((t) => t.length > 0 && /[a-z0-9]/.test(t));
}

// ── The check ───────────────────────────────────────────────────

/**
 * Measure a drafted story against the level it was written for.
 *
 * `allowedWords` are fine at any level and are not classified — the caller
 * composes them (`CORE_SIGHT_WORDS` + the child's sight words + the parent's
 * typed list). Character names are NOT special-cased: a Level-2 reader cannot
 * decode *Marco*, so a name that breaks the level is a hard word like any other.
 * The prompt says so too (`buildReadingLevelBlock`).
 */
export function checkStoryReadability(
  pages: ReadonlyArray<ReadabilityPageInput>,
  options: StoryReadabilityOptions,
): StoryReadabilityReport {
  const phonicsLevel = clampLevel(options.phonicsLevel);
  const levelSource = options.levelSource ?? "assessed";
  const tolerance = toleranceForLevel(phonicsLevel);

  const allowed = new Set<string>();
  for (const w of options.allowedWords ?? []) {
    const n = normalizeWord(w);
    if (n) allowed.add(n);
  }

  const pageReports: PageReadability[] = [];
  const flat: Array<{ page: number; word: string; minLevel: number }> = [];
  const distinct: string[] = [];
  const distinctSeen = new Set<string>();
  let totalTokens = 0;
  let totalHardWords = 0;
  let totalHardOccurrences = 0;

  const list = Array.isArray(pages) ? pages : [];
  for (let i = 0; i < list.length; i++) {
    const page = list[i] ?? {};
    const pageNumber =
      typeof page.pageNumber === "number" && Number.isFinite(page.pageNumber)
        ? page.pageNumber
        : i + 1;
    const tokens = tokenizeStoryText(page.text ?? "");
    const hardWords: HardWord[] = [];
    const seenOnPage = new Set<string>();
    let hardOccurrences = 0;

    for (const token of tokens) {
      if (allowed.has(token)) continue;
      const minLevel = minPhonicsLevelForWord(token);
      if (minLevel <= phonicsLevel) continue;
      hardOccurrences++;
      if (seenOnPage.has(token)) continue;
      seenOnPage.add(token);
      hardWords.push({ word: token, minLevel });
      flat.push({ page: pageNumber, word: token, minLevel });
      if (!distinctSeen.has(token)) {
        distinctSeen.add(token);
        distinct.push(token);
      }
    }

    totalTokens += tokens.length;
    totalHardWords += hardWords.length;
    totalHardOccurrences += hardOccurrences;
    pageReports.push({ pageNumber, hardWords, tokenCount: tokens.length, hardOccurrences });
  }

  const ratio = totalTokens === 0 ? 0 : totalHardOccurrences / totalTokens;
  const perPageOk = pageReports.every((p) => p.hardWords.length <= tolerance.maxPerPage);
  const ratioOk = ratio <= tolerance.maxRatio + RATIO_EPSILON;

  return {
    phonicsLevel,
    levelSource,
    passed: perPageOk && ratioOk,
    pages: pageReports,
    hardWords: flat,
    distinctHardWords: distinct,
    totalTokens,
    totalHardWords,
    totalHardOccurrences,
    tolerance,
  };
}

/** Floating-point slack so an exact 5% boundary passes rather than losing to 0.05000000000000001. */
const RATIO_EPSILON = 1e-9;

// ── Safe-word composition ───────────────────────────────────────

export interface SafeWordGroups {
  /** Always included, never crowded out. */
  core?: readonly string[];
  mastered?: readonly string[];
  familiar?: readonly string[];
  practicing?: readonly string[];
  /** The words the parent typed / the practice list the client sent — never dropped. */
  requested?: readonly string[];
}

/**
 * The SAFE WORDS list, in the order the prompt prints it.
 *
 * `core` is printed in full and does NOT count against `cap` (see
 * `SAFE_WORD_CAP`). The child's own words follow in preference order —
 * mastered → familiar → practicing — and the words the story was ASKED to use
 * are appended and **reserved**: a long mastered list can never crowd out a word
 * the story is required to weave in, because that word would then be measured as
 * a hard word the parent themselves requested.
 *
 * De-duplicated and lower-cased throughout.
 */
export function composeSafeWords(groups: SafeWordGroups, cap: number = SAFE_WORD_CAP): string[] {
  const seen = new Set<string>();
  const core: string[] = [];
  for (const raw of groups.core ?? []) {
    const w = normalizeWord(raw);
    if (!w || seen.has(w)) continue;
    seen.add(w);
    core.push(w);
  }

  const requested: string[] = [];
  for (const raw of groups.requested ?? []) {
    const w = normalizeWord(raw);
    if (!w || seen.has(w)) continue;
    seen.add(w);
    requested.push(w);
  }

  const limit = Math.max(0, cap);
  const reserved = Math.min(requested.length, limit);
  const fillLimit = Math.max(0, limit - reserved);

  const fill: string[] = [];
  for (const group of [groups.mastered ?? [], groups.familiar ?? [], groups.practicing ?? []]) {
    for (const raw of group) {
      if (fill.length >= fillLimit) break;
      const w = normalizeWord(raw);
      if (!w || seen.has(w)) continue;
      seen.add(w);
      fill.push(w);
    }
  }
  return [...core, ...fill, ...requested.slice(0, reserved)];
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return FALLBACK_LEVEL_YOUNG;
  return Math.min(DECODABILITY_LEVEL_CAP, Math.max(1, Math.round(level)));
}
