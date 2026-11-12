// ── The ONE locally generated, checked addition item (UX-495) ──────────────
//
// The Mine addition pilot asks one ordinary Math multiple-choice question in a
// session's opening slot, generated HERE rather than by the provider, and
// checked before it is ever shown. Everything else about the session — input,
// feedback, scoring, adaptation, the timer, the save — is the existing Mine.
//
// Why a local template at all: the pilot has to be able to say exactly WHICH
// item produced the one observation it records. A provider question cannot say
// that — its `targetConceptId` is an echo of something we asked for, so a tag
// alone is never evidence that a checked item was asked (and never authorises
// this pilot).
//
// ── One validation path, run three times ────────────────────────────────────
//
// `checkedMineAdditionProbeItem` is the ONLY place an item is judged, and it is
// run at generation, on the saved-source read, and at the Resume boundary. It
// does not ask whether the stored fields agree with each other — a corrupt
// record agrees with itself. It RECONSTRUCTS the template from the module's own
// canonical operands and rejects anything that is not it: the type, the skill,
// the level, the exact prompt and stimulus, the answer key, the concept, and
// the option set.
//
// The one thing that is NOT fixed is the display ORDER. A fixed ascending order
// would make the correct answer the middle tap every time, so the live item
// shuffles once, at generation, and that order travels with the item as its
// provenance — so the saved source and a Resume show and check the same thing
// the child actually saw.
//
// Pure: no Firestore, no React, no writes. The activation decision lives in
// `mineAdditionPilot.ts`.

import { FOUNDATION_NODE_MAP } from '../../core/foundations'
import type { QuestConceptResult } from '../../core/foundations/questTargeting'
import { checkAnswer, validateQuestion, shouldFlagAsError } from './questHelpers'
import {
  MINE_ADDITION_PROBE_KIND,
  type MineAdditionPilotTarget,
  type MultipleChoiceQuestion,
  type QuestLocalProbeStamp,
  type QuestQuestion,
  type SessionQuestion,
} from './questTypes'

/** The one concept this pilot observes. */
export const MINE_ADDITION_PROBE_CONCEPT = 'math.operations.addWithin20'
/** The one checked template. Bump the suffix if the item itself ever changes. */
export const MINE_ADDITION_PROBE_TEMPLATE_ID = 'mine.addition.within20.v1'
/** The level band the template was checked for — a level-2 Math opening slot. */
export const MINE_ADDITION_PROBE_LEVEL = 2
/** The template's operands: an ordinary opening sum inside the level-2 band. */
export const MINE_ADDITION_PROBE_OPERANDS: readonly [number, number] = [8, 7]
/**
 * The skill tag the item carries — the same `math.addition` tag the existing
 * client-side Math item uses, so findings, blockers and working levels read it
 * exactly as they read any other Math question.
 */
export const MINE_ADDITION_PROBE_SKILL = 'math.addition'

// ── The canonical template, reconstructed rather than trusted ───────────────

/** The sum, from the operands. Never typed out as a literal. */
function canonicalSum(): number {
  return MINE_ADDITION_PROBE_OPERANDS[0] + MINE_ADDITION_PROBE_OPERANDS[1]
}

/** The displayed sum, from the operands. */
function canonicalDisplayedSum(): string {
  return MINE_ADDITION_PROBE_OPERANDS.join(' + ')
}

/** The one correct answer, as the string the child taps. */
function canonicalExpectedAnswer(): string {
  return String(canonicalSum())
}

/** The item's exact words. */
function canonicalPrompt(): string {
  return `What is ${canonicalDisplayedSum()}?`
}

/**
 * The valid option SET: the sum and its two nearest neighbours.
 *
 * A set, not a sequence — the order is the live item's own choice. Three
 * distinct values, exactly one of which is the answer.
 */
function canonicalChoiceSet(): string[] {
  const sum = canonicalSum()
  return [sum - 1, sum, sum + 1].map(String)
}

/** Is `choices` exactly the canonical set, in some order, with no repeats? */
function isCanonicalChoiceOrder(choices: readonly unknown[]): choices is string[] {
  const canonical = canonicalChoiceSet()
  if (choices.length !== canonical.length) return false
  if (!choices.every((c) => typeof c === 'string' && c.trim() !== '')) return false
  const seen = new Set(choices as string[])
  if (seen.size !== canonical.length) return false
  return canonical.every((c) => seen.has(c))
}

/**
 * One display order of the canonical set, chosen once (Fisher-Yates).
 *
 * A fixed ascending order would put the correct answer in the middle every
 * time, which rewards a positional guess rather than the addition fact. The
 * order is chosen at generation and then travels with the item.
 */
function shuffledChoices(rng: () => number): string[] {
  const out = canonicalChoiceSet()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const drawn = Math.floor(rng() * (i + 1))
    // A caller's rng is not trusted to stay in range; an out-of-range draw
    // becomes a no-op swap rather than an undefined slot.
    const j = Number.isFinite(drawn) && drawn >= 0 && drawn <= i ? drawn : i
    const held = out[i]
    out[i] = out[j]
    out[j] = held
  }
  return out
}

/**
 * The provenance stamp for an accepted target and a chosen display order.
 *
 * `choices` is the order the child will SEE, and it is what the saved row and a
 * Resume are later checked against. An omitted order is the canonical
 * ascending one, which is what fixtures want.
 */
export function mineAdditionProbeStamp(
  target: MineAdditionPilotTarget,
  choices: readonly string[] = canonicalChoiceSet(),
): QuestLocalProbeStamp {
  return {
    ...target,
    operands: [...MINE_ADDITION_PROBE_OPERANDS],
    displayedSum: canonicalDisplayedSum(),
    expectedAnswer: canonicalExpectedAnswer(),
    choices: [...choices],
  }
}

/**
 * Build the pilot's item — and return it only if it passes its own check.
 *
 * The display order is chosen HERE, once, and then validated through the same
 * path everything else goes through. `null` means "the checked item is
 * unavailable", which the caller answers with an ordinary Math question.
 */
export function buildMineAdditionProbeQuestion(
  target: MineAdditionPilotTarget,
  rng: () => number = Math.random,
): MultipleChoiceQuestion | null {
  const stamp = mineAdditionProbeStamp(target, shuffledChoices(rng))
  const question: MultipleChoiceQuestion = {
    id: `q_pilot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'multiple-choice',
    level: MINE_ADDITION_PROBE_LEVEL,
    skill: MINE_ADDITION_PROBE_SKILL,
    prompt: canonicalPrompt(),
    stimulus: stamp.displayedSum,
    options: [...stamp.choices],
    correctAnswer: stamp.expectedAnswer,
    // The existing per-concept attribution field. It is what lets the ordinary
    // per-concept machinery read this answer under the pilot's concept; on its
    // own it is an echo and proves nothing, which is why the provenance is what
    // every read below actually validates.
    targetConceptId: target.conceptId,
    localProbe: stamp,
  }
  return checkedMineAdditionProbeQuestion(question, target)
}

/**
 * The provider-shaped turn the local item is recorded as in the conversation.
 *
 * The session's later provider calls are a conversation, and the roles have to
 * alternate: the opening slot asked no provider question, so without this the
 * next call would send two consecutive user turns. It is the item that was
 * actually asked, in the `<quest>` shape `parseQuestBlock` reads, so the
 * provider's own context is accurate rather than invented.
 */
export function mineAdditionProbeAssistantTurn(question: MultipleChoiceQuestion): string {
  return `<quest>${JSON.stringify({
    type: 'multiple-choice',
    level: question.level,
    skill: question.skill,
    prompt: question.prompt,
    stimulus: question.stimulus,
    options: question.options,
    correctAnswer: question.correctAnswer,
    targetConceptId: question.targetConceptId,
  })}</quest>`
}

// ── The checks ─────────────────────────────────────────────────────────────

/** A usable identity/stamp string: present, a string, and not blank. */
function usableString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Is this a well-formed pilot target — the exact template, concept and level,
 * with a usable synthesis generation?
 *
 * Reads unknown input (a stored document) rather than a typed value, because
 * this is the boundary a malformed or legacy record arrives at.
 */
export function readMineAdditionPilotTarget(
  raw: unknown,
): MineAdditionPilotTarget | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Partial<MineAdditionPilotTarget>
  if (t.kind !== MINE_ADDITION_PROBE_KIND) return null
  if (t.templateId !== MINE_ADDITION_PROBE_TEMPLATE_ID) return null
  if (t.conceptId !== MINE_ADDITION_PROBE_CONCEPT) return null
  // The concept has to be a real graph node, like every other attribution.
  if (!FOUNDATION_NODE_MAP[t.conceptId]) return null
  if (t.offerSource !== 'synthesis') return null
  if (!usableString(t.synthesisGeneratedAt)) return null
  if (t.level !== MINE_ADDITION_PROBE_LEVEL) return null
  return {
    kind: MINE_ADDITION_PROBE_KIND,
    templateId: t.templateId,
    conceptId: t.conceptId,
    offerSource: 'synthesis',
    synthesisGeneratedAt: t.synthesisGeneratedAt,
    level: t.level,
  }
}

/**
 * Is this a well-formed stamp whose arithmetic and option set are the
 * TEMPLATE's — reconstructed here, not read off the record?
 *
 * So a record that is internally consistent but is not this item (other
 * operands, another sum, a rewritten displayed sum, a different option set, a
 * repeated or missing choice) fails, and the order it carries is kept as given
 * because that order is what the child saw.
 */
export function readMineAdditionProbeStamp(
  raw: unknown,
): QuestLocalProbeStamp | null {
  const target = readMineAdditionPilotTarget(raw)
  if (!target) return null
  const s = raw as Partial<QuestLocalProbeStamp>
  const operands = s.operands
  if (!Array.isArray(operands) || operands.length !== MINE_ADDITION_PROBE_OPERANDS.length) {
    return null
  }
  if (operands.some((n, i) => n !== MINE_ADDITION_PROBE_OPERANDS[i])) return null
  if (s.displayedSum !== canonicalDisplayedSum()) return null
  if (s.expectedAnswer !== canonicalExpectedAnswer()) return null
  if (!Array.isArray(s.choices) || !isCanonicalChoiceOrder(s.choices)) return null
  return {
    ...target,
    operands: [...MINE_ADDITION_PROBE_OPERANDS],
    displayedSum: canonicalDisplayedSum(),
    expectedAnswer: canonicalExpectedAnswer(),
    // The DISPLAYED order, preserved exactly as stored.
    choices: [...s.choices],
  }
}

/**
 * The shape every reader of a probe item has in common: the live question, the
 * answered row, and the saved pending question.
 *
 * Deliberately the item's own fields only — nothing about the response — so one
 * path can judge "is this the checked item?" wherever the item turns up.
 */
export interface MineAdditionProbeItemFields {
  type?: string
  level?: number
  skill?: string
  prompt?: string
  stimulus?: string
  options?: readonly string[]
  correctAnswer?: string
  targetConceptId?: string
  localProbe?: unknown
}

/**
 * THE validation path: is this the exact checked item, and (when a target is
 * supplied) the one that target authorised?
 *
 * Returns the item's validated stamp — the displayed order included — or
 * `null`. Every field is compared against the reconstructed template, and the
 * options are compared IN ORDER against the stamp's own order, so a record
 * whose stored prompt, stimulus, choices or answer key disagree with what it
 * claims to be is refused rather than projected.
 */
export function checkedMineAdditionProbeItem(
  item: MineAdditionProbeItemFields | null | undefined,
  target?: MineAdditionPilotTarget | null,
): QuestLocalProbeStamp | null {
  if (!item) return null
  const stamp = readMineAdditionProbeStamp(item.localProbe)
  if (!stamp) return null
  // Tied to the accepted claim: the same template, concept and — the point of
  // this run — the same synthesis GENERATION.
  if (target) {
    if (stamp.templateId !== target.templateId) return null
    if (stamp.conceptId !== target.conceptId) return null
    if (stamp.synthesisGeneratedAt !== target.synthesisGeneratedAt) return null
    if (stamp.level !== target.level) return null
  }
  if (item.type !== 'multiple-choice') return null
  if (item.level !== stamp.level) return null
  if (item.skill !== MINE_ADDITION_PROBE_SKILL) return null
  if (item.prompt !== canonicalPrompt()) return null
  if (item.stimulus !== stamp.displayedSum) return null
  if (item.correctAnswer !== stamp.expectedAnswer) return null
  if (item.targetConceptId !== stamp.conceptId) return null
  const options = item.options
  if (!Array.isArray(options)) return null
  if (options.length !== stamp.choices.length) return null
  // In order: the child saw this sequence, and the stored row has to be it.
  if (options.some((option, i) => option !== stamp.choices[i])) return null
  return stamp
}

/**
 * The live item, checked through the one path plus the existing question rails
 * (`validateQuestion`, `shouldFlagAsError`) every other question goes through.
 */
export function checkedMineAdditionProbeQuestion(
  question: QuestQuestion | null | undefined,
  target?: MineAdditionPilotTarget | null,
): MultipleChoiceQuestion | null {
  if (!question) return null
  if (question.type !== 'multiple-choice') return null
  if (!checkedMineAdditionProbeItem(question, target)) return null
  if (!validateQuestion(question)) return null
  if (shouldFlagAsError(question)) return null
  return question
}

/** Does this row or saved question CLAIM to be a probe at all? */
function claimsProbe(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false
  const value = (row as { localProbe?: unknown }).localProbe
  return value !== undefined && value !== null
}

/** The canonical question the recorded response is re-scored against. */
function scoringQuestion(stamp: QuestLocalProbeStamp): MultipleChoiceQuestion {
  return {
    id: 'probe-scoring',
    type: 'multiple-choice',
    level: stamp.level,
    skill: MINE_ADDITION_PROBE_SKILL,
    prompt: canonicalPrompt(),
    stimulus: stamp.displayedSum,
    options: [...stamp.choices],
    correctAnswer: stamp.expectedAnswer,
  }
}

/**
 * Does a source CLAIM a queued ask plan? (UX-495, mutual exclusion.)
 *
 * The pilot passes no queued request identity, so a source carrying both is a
 * corrupt shape — not a pilot with extra context. Checked on the claim rather
 * than on the parsed plan, because a malformed row that parses away must not
 * launder a mixed record into a clean one.
 */
export function sourceClaimsAskPlan(source: { targetPlan?: unknown }): boolean {
  return Array.isArray(source.targetPlan) && source.targetPlan.length > 0
}

/** The stored-record fields these reads look at. Everything is optional. */
export interface StoredProbeRecord {
  domain?: string
  questMode?: string
  pilotProbe?: unknown
  targetPlan?: unknown
  questions?: unknown
  savedCurrentQuestion?: unknown
}

/**
 * The ONE counted probe observation a saved source carries, or `null`.
 *
 * Deliberately strict, because the only thing this can do is write evidence:
 *
 *   • the source's own accepted target must be well-formed, its domain and mode
 *     must be the Math quest the pilot is authorised for, and it must carry NO
 *     queued ask plan — a mixed shape is refused, not reconciled;
 *   • exactly ONE stored row may CLAIM to be a probe — zero is an ordinary
 *     session, and two (a duplicate, a replay, a malformed legacy row beside a
 *     real one) is refused rather than resolved;
 *   • that row must pass the one validation path against the accepted target,
 *     so its prompt, stimulus, answer key, concept and displayed option order
 *     are the checked item's and its generation is the accepted one;
 *   • the recorded ANSWER must be one of the choices the child was shown, and
 *     the recorded correctness must agree with the existing `checkAnswer`
 *     scoring — a row claiming a correct answer it did not give adds nothing;
 *   • a skipped or flagged row is no more evidence about the child than any
 *     other skip, so it adds nothing either.
 *
 * One answered row counts once — `total: 1` — for a correct answer and for a
 * wrong one alike, which is below the existing two-probe upgrade threshold and
 * therefore leaves concept state (and so the change feed and synthesis
 * freshness) exactly as it was. Nothing about strategy or help is inferred:
 * neither is measured, so neither is recorded.
 */
export function mineAdditionProbeResult(
  source: {
    domain?: string
    questMode?: string
    pilotProbe?: unknown
    targetPlan?: unknown
  },
  questions: readonly SessionQuestion[],
): QuestConceptResult | null {
  const target = readMineAdditionPilotTarget(source.pilotProbe)
  if (!target) return null
  // Never another mode, another domain or a level the template was not checked
  // for: the pilot is one Math level-2 multiple-choice item.
  if (source.domain !== 'math') return null
  if (source.questMode !== 'math') return null
  if (FOUNDATION_NODE_MAP[target.conceptId]?.domain !== source.domain) return null
  // A pilot projects one checked row with an EMPTY ask plan, or nothing.
  if (sourceClaimsAskPlan(source)) return null

  const claimed = questions.filter(claimsProbe)
  if (claimed.length !== 1) return null
  const row = claimed[0]
  const stamp = checkedMineAdditionProbeItem(row, target)
  if (!stamp) return null
  if (typeof row.correct !== 'boolean') return null
  if (row.skipped || row.flaggedAsError) return null
  // The response, judged by the existing scoring rather than by the record's
  // own claim about itself.
  if (typeof row.childAnswer !== 'string') return null
  if (!stamp.choices.includes(row.childAnswer)) return null
  if (checkAnswer(row.childAnswer, scoringQuestion(stamp)) !== row.correct) return null
  return { conceptId: target.conceptId, correct: row.correct ? 1 : 0, total: 1 }
}

/**
 * May a stored partial's saved PENDING item be restored and played? (UX-495.)
 *
 * Asked at the existing Resume eligibility boundary, so an invalid point is
 * refused once, in the one place that already decides this, and surfaces
 * through the normal `no-resume-point` handling — rather than being restored
 * and then shown or scored.
 *
 * Only a pending item that CLAIMS to be a probe is judged: an ordinary or
 * legacy saved question is none of this function's business and reads exactly
 * as it always did.
 */
export function mineAdditionProbeResumeRefusal(
  stored: StoredProbeRecord | null | undefined,
): 'no-resume-point' | null {
  if (!stored) return null
  const pending = stored.savedCurrentQuestion
  if (!claimsProbe(pending)) return null
  // From here the record claims a pending probe, so every doubt refuses.
  const target = readMineAdditionPilotTarget(stored.pilotProbe)
  if (!target) return 'no-resume-point'
  if (sourceClaimsAskPlan(stored)) return 'no-resume-point'
  if (!checkedMineAdditionProbeItem(pending as MineAdditionProbeItemFields, target)) {
    return 'no-resume-point'
  }
  // A probe already answered is consumed: it is not re-inserted as a pending
  // item, and two claiming rows could never be one observation anyway.
  const answered = Array.isArray(stored.questions) ? stored.questions : []
  if (answered.some(claimsProbe)) return 'no-resume-point'
  return null
}
