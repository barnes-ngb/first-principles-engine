/**
 * Skill-tag → working-level maps (curriculum data).
 *
 * These five `Record<string, number>` maps are the source of truth for the
 * working-level progression in each domain. They live in `core/curriculum`
 * because they are pure curriculum data: the Knowledge Mine quest
 * (`src/features/quest/workingLevels.ts`) consumes them to *derive* a working
 * level from evaluation findings, and the Learning Map re-derivation engine
 * (`deriveWorkingLevelMastery`) *inverts* them to mark below-level skills as
 * mastered. Both are read-only consumers; the data lives here so neither owns it.
 *
 * Contents are byte-identical to the consts that previously lived in
 * `workingLevels.ts` (moved in the FEAT re-derivation run — no value changes).
 */

/**
 * Phonics skill → level mapping.
 * The highest level where the child showed competence determines the working level.
 */
export const PHONICS_SKILL_LEVEL_MAP: Record<string, number> = {
  'letter-sounds': 1,
  'letter-recognition': 1,
  'cvc': 2,
  'short-vowel': 2,
  'consonant-blend': 3,
  'blends': 3,
  'consonant-digraph': 4,
  'digraphs': 4,
  'digraph': 4,
  'cvce': 5,
  'silent-e': 5,
  'long-vowel': 5,
  'vowel-team': 6,
  'vowel-digraph': 6,
  'vowel-teams': 6,
  'diphthong': 7,
  'diphthongs': 7,
  'le-ending': 7,
  'le-endings': 7,
  'final-stable': 7,
  'r-controlled': 8,
  'multisyllable': 8,
  'multi-syllable': 8,
}

/**
 * Comprehension skill → level mapping (approximate).
 */
export const COMPREHENSION_SKILL_LEVEL_MAP: Record<string, number> = {
  'literal-recall': 1,
  'recall': 1,
  'sequencing': 2,
  'main-idea': 3,
  'character': 3,
  'inference': 4,
  'cause-effect': 4,
  'compare-contrast': 5,
  'theme': 5,
  'critical-thinking': 6,
  'evaluation': 6,
  'synthesis': 6,
}

/**
 * Math skill → level mapping. Aligned with MATH_CONCEPT_BANDS in
 * functions/src/ai/levelDefinitions.ts (server-side prompt SSOT).
 *
 * Skill tags from the math eval prompt are matched here via substring;
 * the longest / most specific match wins.
 */
export const MATH_SKILL_LEVEL_MAP: Record<string, number> = {
  'number-sense': 1,
  'counting': 1,
  'digit-recognition': 1,
  'number-comparison': 1,
  'addition.within-20': 2,
  'addition-within-20': 2,
  'single-digit-addition': 2,
  'doubles': 2,
  'making-10': 2,
  'subtraction.within-20': 3,
  'subtraction-within-20': 3,
  'single-digit-subtraction': 3,
  'fact-family': 3,
  'missing-addend': 3,
  'place-value': 4,
  'two-digit.addition': 4,
  'two-digit-addition': 4,
  'two-digit.subtraction': 4,
  'two-digit-subtraction': 4,
  'word-problems.multi-step': 4,
  'multi-step': 4,
  'multiplication.facts': 5,
  'multiplication-facts': 5,
  'times-table': 5,
  'multi-digit.multiplication': 5,
  'multi-digit-multiplication': 5,
  'division.basic': 5,
  'basic-division': 5,
  'repeated-addition': 5,
  'fractions.recognizing': 6,
  'fractions.comparing': 6,
  'fractions.operations': 6,
  'fractions': 6,
  'measurement': 6,
  'money': 6,
  'time': 6,
  // L7 — larger-number subtraction (multi-digit, regrouping/borrowing). FEAT-08 math slice.
  // Note: 'two-digit-subtraction' (L4) and 'subtraction.within-20' (L3) stay below; these
  // keys are the larger/regrouping frontier and never overlap those substrings.
  'subtraction.regrouping': 7,
  'subtraction-regrouping': 7,
  'multi-digit.subtraction': 7,
  'multi-digit-subtraction': 7,
  'larger-subtraction': 7,
  'borrowing': 7,
  // L8 — multiplication-table fluency (through 12×12). FEAT-08 math slice.
  // Distinct from the L5 intro keys 'times-table' (singular) / 'multiplication.facts';
  // the plural 'times-tables' and '.tables' fluency keys win via highest-match.
  'multiplication.tables': 8,
  'multiplication-tables': 8,
  'times-tables': 8,
  'multiplication.fluency': 8,
}

/**
 * Writing / spelling skill → level mapping (FEAT-11 Phase 1). Mirrors the
 * phonics tile progression that spell-the-word reuses (CVC → vowel teams),
 * capped at {@link WRITING_LEVEL_CAP}. Keys match the `writing.spelling.*` tags
 * and a few free-text variants. This is the **spelling** signal only —
 * composition skills are intentionally absent and will map separately when that
 * signal is built.
 */
export const WRITING_SKILL_LEVEL_MAP: Record<string, number> = {
  'cvc': 2,
  'short-vowel': 2,
  'phonetic': 2,
  'sight-word': 2,
  'sightword': 2,
  'blend': 3,
  'blends': 3,
  'consonant-blend': 3,
  'digraph': 4,
  'digraphs': 4,
  'cvce': 5,
  'silent-e': 5,
  'long-vowel': 5,
  'vowel-team': 6,
  'vowel-teams': 6,
  'vowelteam': 6,
  'conventional': 6,
}

/**
 * Sentence-building skill → level mapping (FEAT-11 Phase 2). The scrambled-to-
 * order construction grows from a short subject–verb sentence (L1–2) to one with
 * an adjective and a prepositional phrase (L5–6), capped at
 * {@link SENTENCE_LEVEL_CAP}. Keys match the `writing.composition.sentence` /
 * `writing.sentence.*` tags. This is the **sentence** signal only — kept distinct
 * from the `WRITING_SKILL_LEVEL_MAP` (spelling) so the two never blur.
 */
export const SENTENCE_SKILL_LEVEL_MAP: Record<string, number> = {
  'composition.sentence': 2,
  'sentence.order': 2,
  'sentence': 2,
  'sentence.subject-verb': 2,
  'sentence.capitalization': 3,
  'sentence.punctuation': 3,
  'sentence.adjective': 4,
  'sentence.expanded': 5,
  'sentence.prepositional': 6,
}
