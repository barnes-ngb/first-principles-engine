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
// this pilot). So the item is built from a named template, re-derived and
// re-checked, and the item's own identity travels with it as PROVENANCE: the
// template id, the operands, the displayed sum, the choices, the expected
// answer, the concept, and the synthesis generation the accepted offer came
// from.
//
// Pure: no Firestore, no clock of its own beyond the question id every
// generator here builds, no React, no writes. The activation decision lives in
// `mineAdditionPilot.ts`; the projection's own read of the saved source uses
// `mineAdditionProbeResult` below.

import { FOUNDATION_NODE_MAP } from '../../core/foundations'
import type { QuestConceptResult } from '../../core/foundations/questTargeting'
import { validateQuestion, shouldFlagAsError } from './questHelpers'
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
export const MINE_ADDITION_PROBE_OPERANDS = [8, 7] as const
/**
 * The skill tag the item carries — the same `math.addition` tag the existing
 * client-side Math item uses, so findings, blockers and working levels read it
 * exactly as they read any other Math question.
 */
export const MINE_ADDITION_PROBE_SKILL = 'math.addition'

/** The displayed sum, from the operands — never typed out twice. */
function displayedSum(operands: readonly number[]): string {
  return operands.join(' + ')
}

/**
 * The three choices: the sum and its two nearest neighbours, ascending.
 *
 * Deterministic on purpose. A shuffled set is a different item every time and
 * so cannot be checked against the template that produced it — and the thing
 * being observed here is one addition fact, not a memory of option order.
 */
function probeChoices(sum: number): string[] {
  return [sum - 1, sum, sum + 1].map(String)
}

/** The pilot target a Start accepted, as a stamp the item and the row carry. */
export function mineAdditionProbeStamp(
  target: MineAdditionPilotTarget,
): QuestLocalProbeStamp {
  const operands = [...MINE_ADDITION_PROBE_OPERANDS]
  const sum = operands[0] + operands[1]
  return {
    ...target,
    operands,
    displayedSum: displayedSum(operands),
    expectedAnswer: String(sum),
    choices: probeChoices(sum),
  }
}

/**
 * Build the pilot's item — and return it only if it passes its own check.
 *
 * `null` means "the checked item is unavailable", which the caller answers with
 * an ordinary Math question. It is deliberately not a thrown error and not a
 * silently unchecked item.
 */
export function buildMineAdditionProbeQuestion(
  target: MineAdditionPilotTarget,
): MultipleChoiceQuestion | null {
  const stamp = mineAdditionProbeStamp(target)
  const question: MultipleChoiceQuestion = {
    id: `q_pilot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'multiple-choice',
    level: MINE_ADDITION_PROBE_LEVEL,
    skill: MINE_ADDITION_PROBE_SKILL,
    prompt: `What is ${stamp.displayedSum}?`,
    stimulus: stamp.displayedSum,
    options: [...stamp.choices],
    correctAnswer: stamp.expectedAnswer,
    // The existing per-concept attribution field. It is what lets the ordinary
    // `computeQuestConceptResults` count this answer under the pilot's concept;
    // on its own it is an echo and proves nothing, which is why the provenance
    // below is what the saved-source read actually validates.
    targetConceptId: target.conceptId,
    localProbe: stamp,
  }
  return checkedMineAdditionProbeQuestion(question)
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
 * Is this a well-formed stamp whose ARITHMETIC and CHOICES are the template's?
 *
 * Checked, not trusted: two operands that really sum to the expected answer,
 * the displayed sum derived from those operands, three distinct choices, and
 * exactly one of them the expected answer.
 */
export function readMineAdditionProbeStamp(
  raw: unknown,
): QuestLocalProbeStamp | null {
  const target = readMineAdditionPilotTarget(raw)
  if (!target) return null
  const s = raw as Partial<QuestLocalProbeStamp>
  const operands = s.operands
  if (!Array.isArray(operands) || operands.length !== 2) return null
  if (!operands.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0)) return null
  const sum = operands[0] + operands[1]
  // Within 20 — the concept's own band, and what makes "invalid math" a refusal
  // rather than a guess.
  if (sum > 20) return null
  if (s.displayedSum !== displayedSum(operands)) return null
  if (s.expectedAnswer !== String(sum)) return null
  const choices = s.choices
  if (!Array.isArray(choices) || choices.length !== 3) return null
  if (!choices.every(usableString)) return null
  if (new Set(choices).size !== 3) return null
  if (choices.filter((c) => c === s.expectedAnswer).length !== 1) return null
  return {
    ...target,
    operands: [...operands],
    displayedSum: s.displayedSum,
    expectedAnswer: s.expectedAnswer,
    choices: [...choices],
  }
}

/**
 * The live item, checked: its stamp, its own template fields, and the existing
 * question validator and error-flag heuristic every other question goes
 * through. Anything else is `null` — an unavailable checked item.
 */
export function checkedMineAdditionProbeQuestion(
  question: QuestQuestion | null | undefined,
): MultipleChoiceQuestion | null {
  if (!question) return null
  if (question.type !== 'multiple-choice') return null
  const stamp = readMineAdditionProbeStamp(question.localProbe)
  if (!stamp) return null
  if (question.level !== stamp.level) return null
  if (question.skill !== MINE_ADDITION_PROBE_SKILL) return null
  if (question.targetConceptId !== stamp.conceptId) return null
  if (question.stimulus !== stamp.displayedSum) return null
  if (!question.prompt.includes(stamp.displayedSum)) return null
  if (question.correctAnswer !== stamp.expectedAnswer) return null
  if (question.options.length !== stamp.choices.length) return null
  if (question.options.some((option, i) => option !== stamp.choices[i])) return null
  // The existing rails, reused rather than re-implemented.
  if (!validateQuestion(question)) return null
  if (shouldFlagAsError(question)) return null
  return question
}

/** Does this stored row claim to BE a probe at all? Malformed claims included. */
function claimsProbe(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false
  const value = (row as { localProbe?: unknown }).localProbe
  return value !== undefined && value !== null
}

/**
 * The ONE counted probe observation a saved source carries, or `null`.
 *
 * Deliberately strict, because the only thing this can do is write evidence:
 *
 *   • the source's own accepted target must be well-formed, and its domain and
 *     mode must be the Math quest the pilot is authorised for;
 *   • exactly ONE stored row may CLAIM to be a probe — zero is an ordinary
 *     session, and two (a duplicate, a replay, a malformed legacy row beside a
 *     real one) is refused rather than resolved, so a second probe can never
 *     become a second observation;
 *   • that row's provenance must check out and must be the source's own target;
 *   • a skipped or flagged row is no more evidence about the child than any
 *     other skip, so it adds nothing.
 *
 * One answered row counts once — `total: 1` — for a correct answer and for a
 * wrong one alike, which is below the existing two-probe upgrade threshold and
 * therefore leaves concept state (and so the change feed and synthesis
 * freshness) exactly as it was.
 */
export function mineAdditionProbeResult(
  source: {
    domain?: string
    questMode?: string
    pilotProbe?: unknown
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

  const claimed = questions.filter(claimsProbe)
  if (claimed.length !== 1) return null
  const row = claimed[0]
  const stamp = readMineAdditionProbeStamp(row.localProbe)
  if (!stamp) return null
  if (stamp.templateId !== target.templateId) return null
  if (stamp.conceptId !== target.conceptId) return null
  if (stamp.synthesisGeneratedAt !== target.synthesisGeneratedAt) return null
  if (row.targetConceptId !== target.conceptId) return null
  if (row.level !== stamp.level) return null
  if (row.correctAnswer !== stamp.expectedAnswer) return null
  if (typeof row.correct !== 'boolean') return null
  if (row.skipped || row.flaggedAsError) return null
  return { conceptId: target.conceptId, correct: row.correct ? 1 : 0, total: 1 }
}
