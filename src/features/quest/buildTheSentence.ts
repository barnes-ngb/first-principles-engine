/**
 * Build-the-sentence target selection + question generation (FEAT-11 Phase 2).
 *
 * The **bridge** from "right word" (spell-the-word, Phase 1) to "real writing":
 * the child taps word tiles into order to form a sentence — staying in the same
 * tap-only tile paradigm he succeeds with, just with bigger units. There is
 * NEVER a typed input; the words are spoken/known and tapped, never typed.
 *
 * Scope (Phase 2, decided): **scrambled-to-order only** — the correct words are
 * presented scrambled and the child taps them into order, with a **capital tile**
 * and a **period tile** bundled in (capital at the start, period at the end). The
 * sentence is **client-generated** from his word bank blended with a small
 * **function-word set** (the grammar scaffold), using level-scaled templates so
 * the target is always grammatical and deterministically checkable.
 *
 * Deferred (not this run): **free-bank** open composition (multiple valid
 * sentences — needs a validity approach) and the **dictate→reorder** voice
 * on-ramp (Phase 3). Both are noted in `docs/WRITING_SPELLING_DESIGN.md` §3.
 *
 * Sentence-building is tracked as its **own** signal (`writing.composition.sentence`
 * → `workingLevels.sentence`), deliberately separate from the spelling signal
 * (`writing.spelling.*` → `workingLevels.writing`) and from any future composition
 * signal. Spelling ≠ sentence ≠ composition — never one blurred `writing` number.
 *
 * This module is pure (no I/O) so generation + the assembly check are unit-testable
 * in isolation. The produced question renders with the sibling
 * `BuildSentenceQuestionScreen` (tap-only word tiles).
 */

import { WritingTags } from '../../core/types/skillTags'
import { SENTENCE_LEVEL_CAP } from './questTypes'
import type { BuildSentenceQuestion } from './questTypes'

// ── Special tiles (bundled capital + period mechanic) ───────────────
// Sentinel tile values carried in `tiles: string[]`. The component renders them
// distinctly (a capital marker / a period) and the assembler interprets them:
// the capital tile capitalizes the *next* word placed; the period attaches to the
// running sentence. Neither is a real word, so they never collide with the bank.
export const SENTENCE_CAPITAL_TILE = '⇧'
export const SENTENCE_PERIOD_TILE = '.'

// ── Word pools (decodable, level-appropriate — words he can read) ───
// Content pools overlap the phonics frontier so the words are ones he is
// plausibly reading. Past-tense verbs are used with determiner+noun subjects so
// subject–verb agreement is always correct without any agreement logic.
const DETERMINERS = ['the', 'a', 'my']
const PRONOUNS_PLURAL = ['I', 'we'] // take present-tense verbs
const NOUNS = ['cat', 'dog', 'sun', 'pig', 'hat', 'bug', 'fox', 'hen', 'cup', 'man', 'bee', 'frog', 'duck', 'ball', 'fish', 'bird']
const PAST_VERBS = ['ran', 'sat', 'hid', 'dug', 'hopped', 'napped', 'played', 'jumped', 'slept']
// Verbs that read naturally with an "I/we" subject + an object ("I see the dog").
const PRESENT_VERBS_TRANS = ['see', 'like', 'pat', 'hug', 'feed', 'find']
const ADJECTIVES = ['big', 'red', 'wet', 'hot', 'fun', 'sad', 'soft']
const PREPOSITIONS = ['to', 'on', 'in', 'by']

/** The small function-word set (grammar scaffold) blended with his word bank. */
export const FUNCTION_WORDS: string[] = [...DETERMINERS, ...PRONOUNS_PLURAL, ...PREPOSITIONS]

// ── Pure RNG helpers ────────────────────────────────────────────────

function pick<T>(arr: T[], rng: () => number): T {
  if (arr.length === 0) throw new Error('pick from empty array')
  const idx = Math.floor(rng() * arr.length) % arr.length
  return arr[idx]
}

/** Fisher–Yates shuffle (pure given `rng`). */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function capitalize(word: string): string {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1)
}

// ── Sentence assembly + checkability (deterministic) ────────────────

/**
 * Assemble the ordered tile values into a sentence string, faithfully reflecting
 * the order the child tapped — so a misplaced capital/period produces a string
 * that simply won't match the target (no shame, the adaptive layer scores it).
 *
 * - {@link SENTENCE_CAPITAL_TILE} capitalizes the first letter of the next word.
 * - {@link SENTENCE_PERIOD_TILE} appends a period directly (no leading space).
 * - Words are joined with single spaces.
 */
export function assembleSentence(orderedTiles: string[]): string {
  let s = ''
  let capitalizeNext = false
  for (const raw of orderedTiles) {
    const v = (raw ?? '').trim()
    if (!v) continue
    if (v === SENTENCE_CAPITAL_TILE) {
      capitalizeNext = true
      continue
    }
    if (v === SENTENCE_PERIOD_TILE) {
      s += '.'
      continue
    }
    const word = capitalizeNext ? capitalize(v) : v
    capitalizeNext = false
    if (s.length > 0 && !s.endsWith(' ')) s += ' '
    s += word
  }
  return s
}

/** The lowercase content words of a target sentence (no capital, no period). */
function wordsOfTarget(target: string): string[] {
  return (target || '')
    .replace(/\.+$/, '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Whether the target sentence can be assembled from the offered tiles — i.e. the
 * tiles contain a capital tile, a period tile, and each target word (each tile
 * used at most once). The encoding analogue of "correctAnswer is in options".
 * Extra/distractor tiles are permitted (simply unused).
 */
export function canAssembleSentence(target: string, tiles: string[]): boolean {
  const words = wordsOfTarget(target)
  if (words.length === 0) return false
  const needed = [SENTENCE_CAPITAL_TILE, SENTENCE_PERIOD_TILE, ...words]
  const pool = (tiles || []).map((t) => (t ?? '').trim()).filter(Boolean)
  const available = [...pool]
  for (const want of needed) {
    const lower = want.toLowerCase()
    const idx = available.findIndex((t) =>
      t === SENTENCE_CAPITAL_TILE || t === SENTENCE_PERIOD_TILE
        ? t === want
        : t.toLowerCase() === lower,
    )
    if (idx < 0) return false
    available.splice(idx, 1)
  }
  return true
}

// ── Target generation (blended source + function-word scaffold) ─────

export interface SentenceSource {
  /** Words the child has met (familiar/mastered sight words) to blend into content slots. */
  bankWords?: string[]
}

type SlotRole = 'DET' | 'PRONOUN' | 'NOUN' | 'PAST_VERB' | 'TRANS_VERB' | 'ADJ' | 'PREP'

/**
 * Level-scaled sentence templates (slot roles, in order). Lower levels are short
 * subject–verb sentences; higher levels add an adjective and a prepositional
 * phrase. Every template is grammatical for any fill from the role pools, and
 * stays within a tablet-friendly tile count (≤ 6 words → ≤ 8 tiles with
 * capital + period).
 */
const TEMPLATES_BY_LEVEL: Record<number, SlotRole[][]> = {
  1: [['DET', 'NOUN', 'PAST_VERB']],
  2: [['DET', 'NOUN', 'PAST_VERB']],
  3: [
    ['PRONOUN', 'TRANS_VERB', 'DET', 'NOUN'],
    ['DET', 'NOUN', 'PAST_VERB'],
  ],
  4: [
    ['DET', 'ADJ', 'NOUN', 'PAST_VERB'],
    ['PRONOUN', 'TRANS_VERB', 'DET', 'NOUN'],
  ],
  5: [
    ['DET', 'NOUN', 'PAST_VERB', 'PREP', 'DET', 'NOUN'],
    ['DET', 'ADJ', 'NOUN', 'PAST_VERB'],
  ],
  6: [
    ['DET', 'ADJ', 'NOUN', 'PAST_VERB', 'PREP', 'DET', 'NOUN'],
    ['DET', 'NOUN', 'PAST_VERB', 'PREP', 'DET', 'NOUN'],
  ],
}

/** Prefer a bank word that fits the pool (his words), else fall back to the pool. */
function fillContentSlot(pool: string[], bank: Set<string>, rng: () => number): string {
  const fromBank = pool.filter((w) => bank.has(w.toLowerCase()))
  if (fromBank.length > 0 && rng() < 0.6) return pick(fromBank, rng)
  return pick(pool, rng)
}

function fillSlot(role: SlotRole, bank: Set<string>, rng: () => number): string {
  switch (role) {
    case 'DET':
      return pick(DETERMINERS, rng)
    case 'PRONOUN':
      return pick(PRONOUNS_PLURAL, rng)
    case 'NOUN':
      return fillContentSlot(NOUNS, bank, rng)
    case 'PAST_VERB':
      return fillContentSlot(PAST_VERBS, bank, rng)
    case 'TRANS_VERB':
      return fillContentSlot(PRESENT_VERBS_TRANS, bank, rng)
    case 'ADJ':
      return fillContentSlot(ADJECTIVES, bank, rng)
    case 'PREP':
      return pick(PREPOSITIONS, rng)
  }
}

/**
 * Choose the ordered words of a target sentence at `level` from the templates,
 * blending the child's bank words into content slots. Pure given `rng`.
 */
export function pickSentenceWords(
  source: SentenceSource,
  level: number,
  rng: () => number = Math.random,
): string[] {
  const lvl = Math.min(Math.max(Math.round(level) || 1, 1), SENTENCE_LEVEL_CAP)
  const templates = TEMPLATES_BY_LEVEL[lvl] ?? TEMPLATES_BY_LEVEL[1]
  const template = pick(templates, rng)
  const bank = new Set((source.bankWords ?? []).map((w) => String(w).trim().toLowerCase()))
  return template.map((role) => fillSlot(role, bank, rng))
}

let buildSentenceSeq = 0

/**
 * Build a checkable build-the-sentence question from an ordered list of words.
 * Tiles = the words (lowercase) + a capital tile + a period tile, shuffled. The
 * correct sentence (capital at start, period at end) is carried only in
 * `targetSentence` / `correctAnswer` / `audioCue` (spoken) — never in `prompt` or
 * `stimulus`, so the answer is never shown as text. Returns `null` if the words
 * are empty.
 */
export function buildSentenceQuestion(
  words: string[],
  level: number,
  rng: () => number = Math.random,
): BuildSentenceQuestion | null {
  const clean = (words || []).map((w) => (w ?? '').trim()).filter(Boolean)
  if (clean.length === 0) return null
  const cappedLevel = Math.min(Math.max(Math.round(level) || 1, 1), SENTENCE_LEVEL_CAP)

  const correctOrder = [SENTENCE_CAPITAL_TILE, ...clean.map((w) => w.toLowerCase()), SENTENCE_PERIOD_TILE]
  const targetSentence = assembleSentence(correctOrder)

  const tiles = shuffle(
    [SENTENCE_CAPITAL_TILE, SENTENCE_PERIOD_TILE, ...clean.map((w) => w.toLowerCase())],
    rng,
  )

  // Safety: the correct order always assembles to the target, but guard so a
  // malformed question is never emitted.
  if (!canAssembleSentence(targetSentence, tiles)) return null

  buildSentenceSeq += 1
  return {
    id: `sentence_${Date.now()}_${buildSentenceSeq}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'build-sentence',
    level: cappedLevel,
    skill: WritingTags.SentenceComposition,
    // No-shame, disposition framing — "build the sentence" / "you made it",
    // never "wrong" or "fix it". The sentence itself is NOT in the prompt.
    prompt: 'Listen, then build the sentence — tap the words in order!',
    targetSentence,
    correctAnswer: targetSentence,
    tiles,
    audioCue: targetSentence,
    encouragement: 'Great building — start with a capital and finish with a period.',
  }
}

/** How many times to re-roll a sentence whose target is already in the avoid-set. */
const SENTENCE_AVOID_ATTEMPTS = 4

/**
 * Convenience: generate the next build-the-sentence question from a blended
 * source at a level. Returns `null` only if generation fails.
 *
 * `avoid` (optional) is the session avoid-set of already-asked targets — if the
 * rolled sentence is one already asked this session, it re-rolls a few times and
 * returns `null` if it can't find a fresh one (the caller then falls back to the
 * AI question instead of repeating).
 */
export function generateBuildSentenceQuestion(
  source: SentenceSource,
  level: number,
  rng: () => number = Math.random,
  avoid?: Set<string>,
): BuildSentenceQuestion | null {
  const bank = new Set((source.bankWords ?? []).map((w) => String(w).trim().toLowerCase()))
  const attempts = avoid && avoid.size > 0 ? SENTENCE_AVOID_ATTEMPTS : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    const words = pickSentenceWords(source, level, rng)
    const q = buildSentenceQuestion(words, level, rng)
    if (!q) return null
    if (avoid?.has(q.targetSentence.trim().toLowerCase())) continue
    q.source = words.some((w) => bank.has(w.toLowerCase())) ? 'wordBank' : 'generated'
    return q
  }
  return null
}
