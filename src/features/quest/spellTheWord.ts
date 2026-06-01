/**
 * Spell-the-word target selection + question generation (FEAT-11 Phase 1).
 *
 * The encoding complement to build-the-word, but seeded from words the child has
 * been *reading*: his **sight-word bank** (words he can already recognize) blended
 * with a **phonics frontier** word list at his current level. The child hears the
 * word (TTS) and taps grapheme tiles to spell it — there is NEVER a typed input;
 * the target is spoken, never shown. This module is pure (no I/O) so the target
 * selection and tile construction are unit-testable in isolation.
 *
 * Reuses the build-word tile engine: the produced question is checked with the
 * same `canAssemble` / exact-match path and rendered with `BuildWordQuestionScreen`.
 *
 * Spelling is tracked as its **own** signal (`writing.spelling.*` →
 * `workingLevels.writing`), deliberately separate from phonics and from any
 * future composition signal.
 */

import { canAssemble } from './questHelpers'
import { WRITING_LEVEL_CAP } from './questTypes'
import type { SpellWordQuestion } from './questTypes'
import { WritingTags } from '../../core/types/skillTags'

// ── Phonics frontier word lists (level-appropriate, decodable) ──────
// Mirrors the build-word / fallback CVC→vowel-team progression (L1–L6). These
// are words the child is plausibly reading at each level, used to stretch
// spelling just past the sight-word bank.
export const FRONTIER_WORDS: Record<number, string[]> = {
  1: ['cat', 'dog', 'sun', 'hat', 'pig', 'cup', 'bed', 'map', 'top', 'fan'],
  2: ['stop', 'frog', 'clap', 'drum', 'grin', 'step', 'jump', 'help', 'desk', 'sand'],
  3: ['ship', 'chat', 'thin', 'wish', 'much', 'bath', 'shop', 'chin', 'rush', 'path'],
  4: ['cake', 'bike', 'home', 'tune', 'lake', 'hide', 'rope', 'cute', 'gate', 'note'],
  5: ['train', 'sleep', 'float', 'cream', 'snail', 'beach', 'toast', 'green', 'paint', 'dream'],
  6: ['night', 'bright', 'cloud', 'mouth', 'spoon', 'crawl', 'point', 'brown', 'sound', 'light'],
}

// ── Grapheme segmentation ───────────────────────────────────────────
// Graphemes recognized as a single tile once the level introduces them, so the
// tiles match how the word is taught (e.g. "sh" is one block at L3+, not s + h).
// Order matters: longest first so greedy matching prefers trigraphs/digraphs.
const TRIGRAPHS = ['igh']
const DIGRAPHS_CONSONANT = ['sh', 'ch', 'th', 'wh', 'ck', 'ng', 'ph', 'qu']
const VOWEL_TEAMS = ['ai', 'ay', 'ea', 'ee', 'oa', 'oo', 'ow', 'ou', 'oi', 'oy', 'ie', 'ue', 'ew', 'aw', 'au']

/** Graphemes treated as single tiles at a given level (cumulative). */
function graphemesForLevel(level: number): string[] {
  const out: string[] = []
  if (level >= 5) out.push(...TRIGRAPHS, ...VOWEL_TEAMS)
  if (level >= 3) out.push(...DIGRAPHS_CONSONANT)
  // Sort longest-first for greedy matching.
  return out.sort((a, b) => b.length - a.length)
}

/**
 * Split a word into ordered grapheme tiles for the given level. Greedy
 * longest-match against the level's known graphemes, falling back to single
 * letters. The concatenation of the result always equals the word, so the
 * resulting tile set is guaranteed assemblable.
 */
export function segmentGraphemes(word: string, level: number): string[] {
  const w = (word || '').trim().toLowerCase()
  const known = graphemesForLevel(level)
  const tiles: string[] = []
  let i = 0
  while (i < w.length) {
    let matched: string | null = null
    for (const g of known) {
      if (w.startsWith(g, i)) {
        matched = g
        break
      }
    }
    if (matched) {
      tiles.push(matched)
      i += matched.length
    } else {
      tiles.push(w[i])
      i += 1
    }
  }
  return tiles
}

// ── Distractor tiles ────────────────────────────────────────────────
const DISTRACTOR_POOL = ['b', 'd', 'p', 'm', 'n', 't', 's', 'l', 'r', 'a', 'e', 'i', 'o', 'u']

/**
 * Add 1–2 plausible distractor tiles that are NOT part of the target's grapheme
 * set, keeping the total tile count tablet-friendly (≤ 7). Distractors never
 * make the word un-spellable (extra tiles are simply unused).
 */
function withDistractors(graphemes: string[], rng: () => number): string[] {
  const used = new Set(graphemes.map((g) => g.toLowerCase()))
  const candidates = DISTRACTOR_POOL.filter((c) => !used.has(c))
  const maxTotal = 7
  const room = Math.max(0, maxTotal - graphemes.length)
  const want = Math.min(room, graphemes.length <= 4 ? 2 : 1)
  const picked: string[] = []
  const pool = [...candidates]
  for (let k = 0; k < want && pool.length > 0; k++) {
    const idx = Math.floor(rng() * pool.length) % pool.length
    picked.push(pool[idx])
    pool.splice(idx, 1)
  }
  return shuffle([...graphemes, ...picked], rng)
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

// ── Spelling skill tagging ──────────────────────────────────────────

/**
 * The `writing.spelling.*` skill tag for a target. Sight-word-sourced targets
 * carry the sight-word spelling tag; frontier targets carry the phonetic-spelling
 * tag. Both live under `writing.spelling.` so they roll up as one separable
 * spelling signal (never blurred with composition).
 */
export function spellingSkillTag(source: 'sightWord' | 'frontier'): string {
  return source === 'sightWord' ? WritingTags.SpellingSightWord : WritingTags.SpellingPhonetic
}

// ── Target selection (blended source) ───────────────────────────────

export interface SpellingSource {
  /** Words the child can already READ (familiar/mastered sight words). */
  sightWords: string[]
  /** Optional explicit frontier list (defaults to FRONTIER_WORDS[level]). */
  frontierWords?: string[]
}

export interface SpellingTarget {
  word: string
  source: 'sightWord' | 'frontier'
}

/** Rough level-appropriateness filter so we don't ask to spell a word far past level. */
function lengthBoundForLevel(level: number): number {
  // L1–2: short CVC; grows gently with level. Cap keeps tablet tile rows sane.
  return Math.min(8, 3 + level)
}

/**
 * Blend the sight-word bank with the phonics frontier into ordered spelling
 * targets at `level`. Sight words come first (confidence — words he's met), then
 * frontier words (stretch). Deduped, length-bounded, capped at `count`. Returns
 * `[]` only when both sources are empty.
 */
export function blendSpellingTargets(
  source: SpellingSource,
  level: number,
  count = 4,
): SpellingTarget[] {
  const maxLen = lengthBoundForLevel(level)
  const seen = new Set<string>()
  const out: SpellingTarget[] = []

  const push = (word: string, src: 'sightWord' | 'frontier') => {
    const w = (word || '').trim().toLowerCase()
    if (!w || seen.has(w)) return
    // Only letters, and within the level's length bound.
    if (!/^[a-z]+$/.test(w)) return
    if (w.length < 2 || w.length > maxLen) return
    seen.add(w)
    out.push({ word: w, source: src })
  }

  for (const w of source.sightWords ?? []) push(w, 'sightWord')
  const frontier = source.frontierWords ?? FRONTIER_WORDS[Math.min(Math.max(level, 1), 6)] ?? []
  for (const w of frontier) push(w, 'frontier')

  return out.slice(0, count)
}

// ── Question construction ───────────────────────────────────────────

let spellWordSeq = 0

/**
 * Build a checkable spell-the-word question for a target at a level. Tiles are
 * the target's graphemes (for the level) plus 1–2 distractors, shuffled. The
 * target word is carried only in `targetWord` / `correctAnswer` / `audioCue`
 * (spoken) — never in `prompt` or `stimulus`, so it is never shown as text.
 *
 * Guarantees the result is assemblable (`canAssemble(target, tiles) === true`);
 * returns `null` for an empty/non-alpha target.
 */
export function buildSpellWordQuestion(
  target: SpellingTarget,
  level: number,
  rng: () => number = Math.random,
): SpellWordQuestion | null {
  const word = (target.word || '').trim().toLowerCase()
  if (!word || !/^[a-z]+$/.test(word)) return null
  const cappedLevel = Math.min(Math.max(level, 1), WRITING_LEVEL_CAP)

  const graphemes = segmentGraphemes(word, cappedLevel)
  const tiles = withDistractors(graphemes, rng)

  // Safety: the grapheme segmentation always concatenates to the word, but guard
  // anyway so a malformed question is never emitted.
  if (!canAssemble(word, tiles)) return null

  spellWordSeq += 1
  const skill = spellingSkillTag(target.source)
  return {
    id: `spell_${Date.now()}_${spellWordSeq}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'spell-word',
    level: cappedLevel,
    skill,
    // No-shame, disposition framing — "spell it" / "you built it", never "spell
    // it correctly" or "don't misspell". The word itself is NOT in the prompt.
    prompt: 'Listen, then spell the word with your sound-blocks!',
    targetWord: word,
    correctAnswer: word,
    tiles,
    audioCue: word,
    source: target.source,
    encouragement: 'Great building — tap the blocks for the sounds you hear.',
  }
}

/**
 * Convenience: pick the next spell-the-word question from a blended source at a
 * level. Picks one target (preferring sight words for confidence), builds it.
 * Returns `null` when no usable target exists.
 */
export function generateSpellWordQuestion(
  source: SpellingSource,
  level: number,
  rng: () => number = Math.random,
): SpellWordQuestion | null {
  const targets = blendSpellingTargets(source, level)
  if (targets.length === 0) return null
  // Weighted toward the front (sight words first) but with some variety.
  const idx = Math.floor(rng() * targets.length) % targets.length
  return buildSpellWordQuestion(targets[idx], level, rng)
}
