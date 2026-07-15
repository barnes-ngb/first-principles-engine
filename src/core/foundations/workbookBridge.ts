// ── Generalized workbook → learner-model bridge (FEAT-63) ────────────────
//
// FEAT-53 shipped the FIRST external-curriculum bridge (Fast Phonics → reading
// graph) as a per-peak `covers[]` table, and `bridgeEvidenceForPosition(peak)` as
// the deterministic peak→concept authority the Review-Chat upload path grounds
// against. This module is that pattern GENERALIZED so *any* bridged workbook can
// turn a tracked curriculum position (`ActivityConfig.currentPosition`) into
// `curriculumPosition` evidence, deterministically, with no LLM in the loop.
//
// It ships ONLY the wiring. The DATA for new sources (Mathseeds, TGTB) is owner
// curation follow-up — see `docs/foundations/*_BRIDGE_V0.md` (DRAFT, not consumed).
//
// Semantics are IDENTICAL to the Review-Chat `covered` write path (§13, FEAT-51):
//   • a position emits `curriculumPosition` evidence, capped at `forming`;
//   • it never downgrades a stronger standing state;
//   • it dedupes per concept (highest unit wins as the label) and appends a
//     deterministic changeFeed line;
//   • at most one verify-ask per concept per source, deduped against unresolved
//     asks (resolved asks don't re-queue — the 2c convention).
// The clamp / dedup helpers below MIRROR `foundationsReviewActions.ts` (features);
// they are re-stated here so `src/core/` stays free of a `src/features/` import.

import { readingGraph } from './readingGraph'
import { mathGraph } from './mathGraph'
import { normalizeSourceName, fastPhonicsWorkbookBridge } from './fastPhonicsBridge'
import { mathseedsBridge } from './mathseedsBridge'
import { tgtbLa1Bridge } from './tgtbLa1Bridge'
import type { ConceptNode } from './types'
import type {
  ConceptStateEntry,
  ConceptStateKind,
  EvidenceRef,
  LearnerModel,
  OpenQuestion,
} from '../types/learnerModel'

/**
 * Local flat node lookup, built from the domain graphs directly (NOT the `./index`
 * barrel) so this module — which `index` re-exports — never forms an import cycle.
 */
const NODE_MAP: Record<string, ConceptNode> = Object.fromEntries(
  [...readingGraph.nodes, ...mathGraph.nodes].map((n) => [n.id, n]),
)

/**
 * One ordered unit of a bridged workbook. A unit is "complete" when the tracked
 * position has reached its `upToLesson`. Positions are cumulative: reaching a
 * later unit implies coverage of every earlier one.
 */
export interface WorkbookBridgeUnit {
  /** Display label for the unit, e.g. "Peak 8", "Level 122", "Unit 4". */
  unitLabel: string
  /**
   * The NATIVE position value (in the bridge's own unit — peaks for Fast Phonics)
   * at/below which this unit counts as complete. **Absent ⇒ this unit is not
   * position-addressable** (its boundary is an open curation question), so a
   * position sync skips it. Cumulative + monotonic across `units`.
   */
  upToLesson?: number
  /** Reading-/math-graph node ids this unit supplies `covered` evidence for. */
  covers: string[]
  /**
   * Curriculum content the SOURCE teaches but the curated graph has NO node for —
   * recorded, never invented as a node (the FEAT-64 curation convention, e.g.
   * Mathseeds "rounding"). Purely documentary: the apply layer ignores it.
   */
  notes?: string[]
}

/**
 * A versioned external-curriculum bridge, generalized from the Fast Phonics shape.
 * `sourceId` matches `EvidenceRef.source`; `aliases` feed the tolerant
 * {@link workbookBridgeForSource} lookup (same normalizer as FEAT-61).
 */
export interface WorkbookBridge {
  sourceId: string
  aliases: string[]
  /** Ordered units, earliest first. */
  units: WorkbookBridgeUnit[]
  /** Bump on curation, like the graph versions. */
  version?: number
  /**
   * Translate the FAMILY'S tracked config position (`ActivityConfig.currentPosition`,
   * e.g. Fast Phonics "Lesson 90") into the bridge's NATIVE position (e.g. a peak).
   * **This is the lesson-vs-native slot (FEAT-63 §0.2 finding).** For Fast Phonics
   * the family's lesson numbering ≠ peaks and its meaning is a CURATION QUESTION —
   * so it is left UNSET rather than guessed, which gates config-position sync for
   * that source (reported as "lesson mapping pending curation", never silently
   * mapped). A source whose config position IS the native unit sets an identity fn.
   *
   * **FEAT-64 update:** Fast Phonics NOW sets a divisor `lessonToUnit`
   * (`ceil(lesson / LESSONS_PER_PEAK)`, OWNER-CONFIRM) marked
   * {@link WorkbookBridge.positionIsProvisional}; Mathseeds / TGTB LA1 set a
   * band-ceiling `lessonToUnit` ({@link makeBandCeilingLessonToUnit}).
   */
  lessonToUnit?: (configLesson: number) => number | null
  /**
   * True when `lessonToUnit` produces a *provisional GUESS* rather than a witnessed
   * position — the Fast Phonics case (`ceil(lesson / LESSONS_PER_PEAK)`, FEAT-64 §3).
   * When set, the sync applies the **conflict rule**: a divisor-guessed native
   * position is capped at the highest position DIRECTLY witnessed on the model
   * (review-chat uploads carry a real peak), so a guess never overwrites or exceeds a
   * witness (see {@link resolveSyncNativePosition}). Deterministic band bridges (whose
   * `lessonToUnit` maps a real lesson to the band it falls in) leave it unset.
   */
  positionIsProvisional?: boolean
}

/** One deterministic coverage claim from a position: a concept + the unit label. */
export interface BridgeCoverage {
  conceptId: string
  unitLabel: string
}

/** Every bridge a tracked position can resolve against. New sources add here. */
const ALL_WORKBOOK_BRIDGES: WorkbookBridge[] = [
  fastPhonicsWorkbookBridge,
  mathseedsBridge,
  tgtbLa1Bridge,
]

// Re-exported for the public barrel + tests; defined in its own dependency-free
// module (`./bandCeiling`) so the bridge modules can use it without an import cycle.
export { makeBandCeilingLessonToUnit } from './bandCeiling'

/**
 * Tolerant bridge lookup by free-text workbook name (`ActivityConfig.name` /
 * `.curriculum`). Reuses the conservative FEAT-61 normalizer: formatting
 * differences collapse, real misspellings do not — an unrecognized name returns
 * null and the caller reports "no bridge yet" (never a silent map).
 */
export function workbookBridgeForSource(
  name: string | undefined | null,
): WorkbookBridge | null {
  if (!name) return null
  const key = normalizeSourceName(name)
  if (!key) return null
  for (const bridge of ALL_WORKBOOK_BRIDGES) {
    if (
      normalizeSourceName(bridge.sourceId) === key ||
      bridge.aliases.some((a) => normalizeSourceName(a) === key)
    ) {
      return bridge
    }
  }
  return null
}

/** True when at least one unit carries an `upToLesson` boundary (i.e. the bridge
 *  can be resolved by a numeric position at all). */
export function isPositionAddressable(bridge: WorkbookBridge): boolean {
  return bridge.units.some((u) => u.upToLesson != null)
}

/**
 * Resolve the family's tracked config position to the bridge's NATIVE position,
 * or `null` when the source's lesson numbering can't yet be translated (no
 * `lessonToUnit` curated — the Fast Phonics case). `null` is the honest gate the
 * sync action surfaces as "lesson mapping pending curation" — NOT a silent skip.
 */
export function resolveNativePosition(
  bridge: WorkbookBridge,
  configPosition: number,
): number | null {
  if (!bridge.lessonToUnit) return null
  const native = bridge.lessonToUnit(configPosition)
  return native == null || !Number.isFinite(native) ? null : native
}

/**
 * The DETERMINISTIC authority: which concepts does reaching NATIVE position N
 * cover? Cumulative over every unit with `upToLesson <= N`, deduped per concept
 * keeping the HIGHEST unit as the label (so evidence reads at the furthest unit
 * the child has reached). Pure — the generalized `bridgeEvidenceForPosition`.
 */
export function bridgeCoveredConcepts(
  bridge: WorkbookBridge,
  nativePosition: number,
): BridgeCoverage[] {
  const byConcept = new Map<string, WorkbookBridgeUnit>()
  for (const unit of bridge.units) {
    if (unit.upToLesson == null || unit.upToLesson > nativePosition) continue
    for (const conceptId of unit.covers) {
      const existing = byConcept.get(conceptId)
      if (!existing || (existing.upToLesson ?? -Infinity) < unit.upToLesson) {
        byConcept.set(conceptId, unit)
      }
    }
  }
  return [...byConcept.entries()].map(([conceptId, unit]) => ({
    conceptId,
    unitLabel: unit.unitLabel,
  }))
}

// ── Conflict rule — a divisor GUESS defers to a WITNESS (FEAT-64 §3) ───────
//
// Fast Phonics' `lessonToUnit` is a divisor GUESS (`ceil(lesson / 5)`). The
// Review-Chat upload path, by contrast, extracts a REAL peak from a screenshot and
// writes it as `curriculumPosition` evidence. Where the two disagree — the family's
// config reads "Lesson 90" (guess ⇒ Peak 18) but an upload witnessed Peak 13 — the
// witness wins: the sync must never overwrite or exceed a directly-evidenced peak
// with a guess. So the effective native position is the LOWER of (guess, witness).
// Rationale: L90 ÷ 5 = 18 conflicts with the family's observed Peak 13 — guesses
// defer to witnesses.

/** Parse a native position (the trailing integer) from a unit label — "Peak 13" →
 *  13, "up to Lesson 150" → 150. Null when no integer is present. */
export function parseNativePositionFromUnit(unit: string | undefined): number | null {
  if (!unit) return null
  const matches = unit.match(/\d+/g)
  if (!matches || matches.length === 0) return null
  const n = Number.parseInt(matches[matches.length - 1], 10)
  return Number.isFinite(n) ? n : null
}

/**
 * The highest native position **directly witnessed** for a bridge's source on the
 * model — i.e. from `curriculumPosition` evidence that a human/LLM covered-write
 * produced (a Review-Chat upload extracts a real peak), NOT the position sync's own
 * (possibly divisor-guessed) self-write.
 *
 * Self-writes are told apart by the `positionSync` marker, NOT by the `source`
 * string: the Review-Chat prompt emits the CANONICAL bridge id as `source`, so a
 * genuine witness commonly shares `source`/`sourceId` with the sync's own writes —
 * only `positionSync` reliably separates them. This keeps the guess from being
 * capped by its OWN prior writes (which would freeze growth), while a real witness
 * still caps it.
 */
export function maxWitnessedNativePosition(
  model: LearnerModel,
  bridge: WorkbookBridge,
): number | null {
  const canonicalKey = normalizeSourceName(bridge.sourceId)
  let max: number | null = null
  for (const entry of Object.values(model.conceptStates)) {
    for (const ev of entry.evidence) {
      if (ev.kind !== 'curriculumPosition') continue
      if (ev.positionSync) continue // the sync's own write — not a witness
      if (normalizeSourceName(ev.source ?? '') !== canonicalKey) continue
      const pos = parseNativePositionFromUnit(ev.unit)
      if (pos == null) continue
      if (max == null || pos > max) max = pos
    }
  }
  return max
}

/**
 * Resolve a config position to the bridge's native position FOR A SYNC — i.e.
 * {@link resolveNativePosition} plus the conflict rule. For a provisional
 * (divisor-guess) bridge, the guess is capped at the highest witnessed position on
 * the model (`min(guess, witness)`); a deterministic band bridge passes straight
 * through. `null` propagates the pending-curation / unfinite gate unchanged.
 */
export function resolveSyncNativePosition(
  bridge: WorkbookBridge,
  configPosition: number,
  model: LearnerModel | null,
): number | null {
  const native = resolveNativePosition(bridge, configPosition)
  if (native == null) return null
  if (!bridge.positionIsProvisional || !model) return native
  const witnessed = maxWitnessedNativePosition(model, bridge)
  return witnessed == null ? native : Math.min(native, witnessed)
}

// ── Apply layer — mirrors `foundationsReviewActions.ts` covered path (§13) ──

/** Rank for the "never downgrade" guard: solid > forming > frontier > not-yet. */
const STATE_RANK: Record<ConceptStateKind, number> = {
  'not-yet': 0,
  frontier: 1,
  forming: 2,
  solid: 3,
}

/**
 * The §13 clamp — `curriculumPosition` evidence alone caps at `forming`. Mirrors
 * `clampCoveredState` in the Review-Chat write layer (the single "covered ≠
 * mastered" rule, restated in core to avoid a features import).
 */
function clampCovered(proposed: ConceptStateKind): ConceptStateKind {
  return proposed === 'solid' ? 'forming' : proposed
}

/** Append an `openQuestion`, deduped by (conceptId, routedTo) against UNRESOLVED
 *  asks only — a resolved 2c ask no longer blocks a fresh re-queue. */
function withOpenQuestion(existing: OpenQuestion[], q: OpenQuestion): OpenQuestion[] {
  const dup = existing.some(
    (e) => e.conceptId === q.conceptId && e.routedTo === q.routedTo && !e.resolvedAt,
  )
  return dup ? existing : [...existing, q]
}

/** The result of folding a position's coverage into a model. */
export interface AppliedBridgeCoverage {
  model: LearnerModel
  /** Concept ids whose entry changed (state or evidence), for a merge write. */
  changedConceptIds: string[]
}

/**
 * Fold a bridge's coverage for one source into a stored model. **Pure** — no
 * Firestore, no clock (caller passes `nowIso`). For each covered concept:
 *   • append a `curriculumPosition` EvidenceRef (dedup: replace a prior ref from
 *     the SAME source, so re-syncing a new position updates rather than piles up);
 *   • move state up to the clamped `forming` cap, never down from a stronger state;
 *   • append a deterministic changeFeed line and (at most one, deduped) verify-ask.
 * A concept already `solid` keeps its state and only gains the evidence ref.
 */
export function applyBridgeCoverageToModel(
  model: LearnerModel,
  coverage: BridgeCoverage[],
  source: string,
  nowIso: string,
  via: 'scan' | 'manual' = 'scan',
): AppliedBridgeCoverage {
  let conceptStates = model.conceptStates
  let openQuestions = model.openQuestions
  const changeFeed = [...model.changeFeed]
  const changedConceptIds: string[] = []

  for (const { conceptId, unitLabel } of coverage) {
    if (!NODE_MAP[conceptId]) continue // never write an unknown node
    const kidName = NODE_MAP[conceptId]?.kidName ?? conceptId
    const prev: ConceptStateEntry | undefined = conceptStates[conceptId]
    const fromState: ConceptStateKind = prev?.state ?? 'not-yet'

    const clamped = clampCovered('forming')
    const toState: ConceptStateKind =
      STATE_RANK[fromState] > STATE_RANK[clamped] ? fromState : clamped

    const evidence: EvidenceRef = {
      kind: 'curriculumPosition',
      sourceId: source,
      note: `Covered in ${source} ${unitLabel}`,
      observedAt: nowIso,
      source,
      unit: unitLabel,
      via,
      positionSync: true, // marks this as the sync's OWN write, not a witness
    }
    // Dedup by source, but ONLY our own prior sync writes (re-sync = update). A
    // Review-Chat witness carries the same canonical `source` (the prompt emits the
    // bridge id) yet is NOT `positionSync` — it must be preserved, never clobbered,
    // so the conflict rule can still cap a divisor guess against it (FEAT-64).
    const priorEvidence = (prev?.evidence ?? []).filter(
      (e) => !(e.kind === 'curriculumPosition' && e.source === source && e.positionSync),
    )
    const nextEntry: ConceptStateEntry = {
      state: toState,
      evidence: [...priorEvidence, evidence],
      seededAt: prev?.seededAt ?? nowIso,
    }

    conceptStates = { ...conceptStates, [conceptId]: nextEntry }
    changedConceptIds.push(conceptId)
    changeFeed.push({
      conceptId,
      from: fromState,
      to: toState,
      cause: `workbookSync: covered in ${source} ${unitLabel} (capped at ${toState})`,
      at: nowIso,
    })
    openQuestions = withOpenQuestion(openQuestions, {
      conceptId,
      question: `Verify "${kidName}" with a quick quest?`,
      routedTo: 'quest',
      reason: `Covered in ${source} ${unitLabel}; confirm mastery with a kid-facing check.`,
    })
  }

  return {
    model: { ...model, conceptStates, openQuestions, changeFeed, updatedAt: nowIso },
    changedConceptIds,
  }
}
