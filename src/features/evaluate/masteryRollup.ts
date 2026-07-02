import { generateBlockId, effectiveStatus } from '../../core/utils/blockerLifecycle'
import { MasteryGate, SkillLevel } from '../../core/types/enums'
import type { ChecklistItem } from '../../core/types/planning'
import type { ConceptualBlock, SkillSnapshot } from '../../core/types/evaluation'
import type { SessionQuestion } from '../quest/questTypes'
import { inferSkillKey } from '../today/masteryBlocker'

/**
 * FEAT-09 — keep the foundation map current (close the mastery loop).
 *
 * Per-item mastery (got-it / working / stuck) and quest performance are
 * captured every day but never rolled back up into the Skill Snapshot, so
 * mastered skills keep getting served (the "stale foundation map" dead-end the
 * 2026-06-01 integration audit found). This module is the pure, testable
 * aggregation half of the fix: it folds those signals into a per-skill mastery
 * rollup and decides — *conservatively* — which skills look mastered enough to
 * be checked off.
 *
 * **It does not write.** Reflecting a rollup in the snapshot goes exclusively
 * through the central `skillSnapshotWrites.ts` writer ({@link commitMasteryRollup}),
 * which is additive and never downgrades. Everything here is a pure reducer so
 * the threshold can be unit-tested in isolation.
 *
 * ### Conservative threshold (bias toward NOT marking)
 * For a struggling learner a *false* "mastered" hides a real gap — worse than
 * over-practice. So mastery requires **strong, repeated** evidence:
 * - at least {@link MASTERY_MIN_STRONG_SIGNALS} strong signals,
 * - spread across at least {@link MASTERY_MIN_OCCASIONS} distinct days, and
 * - **zero** struggle signals anywhere in the window.
 *
 * A couple of got-its does not clear it; three got-its on a single day does not
 * clear it (one good day isn't repetition); a single recent "stuck" vetoes it.
 */

/** Normalized mastery observation, across capture surfaces. */
export type MasterySignalKind = 'strong' | 'neutral' | 'struggle'

export interface MasterySignal {
  /** Stable slug identifying the skill (matches the central writer's matcher). */
  skillKey: string
  /** Human-readable label, used for display + the evidence stamp. */
  label: string
  kind: MasterySignalKind
  /** YYYY-MM-DD occasion date. */
  date: string
  source: 'checklist' | 'quest'
}

/** A day log carrying per-item mastery chips. */
export interface DayLogLike {
  /** YYYY-MM-DD. */
  date: string
  checklist?: ChecklistItem[]
}

/** A completed interactive quest session carrying per-question outcomes. */
export interface QuestSessionLike {
  /** ISO timestamp (the day portion is the occasion). */
  evaluatedAt?: string
  /**
   * Per-question outcomes. Only the grading fields the rollup reads are
   * required — a full {@link SessionQuestion} satisfies this too, so real quest
   * sessions pass unchanged.
   */
  questions?: Array<Pick<SessionQuestion, 'skill' | 'correct' | 'skipped'>>
}

export interface MasterySkillRollup {
  skillKey: string
  label: string
  strongSignals: number
  neutralSignals: number
  struggleSignals: number
  /** Distinct YYYY-MM-DD dates that carried a strong signal. */
  strongOccasions: number
  lastSignalDate: string
  sources: Array<'checklist' | 'quest'>
  /** True only when the conservative threshold is cleared. */
  mastered: boolean
  /** Short evidence string for surfacing + the snapshot stamp. */
  evidence: string
}

// ── Thresholds (documented, conservative) ────────────────────────────
/** Minimum strong signals before a skill can be considered mastered. */
export const MASTERY_MIN_STRONG_SIGNALS = 3
/** Strong signals must be spread across at least this many distinct days. */
export const MASTERY_MIN_OCCASIONS = 2
/** Quest accuracy at/above this (with enough attempts) is a strong signal. */
export const QUEST_STRONG_ACCURACY = 0.8
/** Need at least this many graded attempts on a skill in a session to call it strong. */
export const QUEST_STRONG_MIN_ATTEMPTS = 2
/** Quest accuracy at/below this is a struggle signal. */
export const QUEST_STRUGGLE_ACCURACY = 0.5

/** Map a checklist mastery chip to a normalized signal kind. */
function chipToKind(mastery: ChecklistItem['mastery']): MasterySignalKind | null {
  switch (mastery) {
    case 'got-it':
      return 'strong'
    case 'working':
      return 'neutral'
    case 'stuck':
      return 'struggle'
    default:
      return null
  }
}

/**
 * Pull mastery signals from day-log checklist chips. Only completed items that
 * carry a mastery chip contribute. Skill keying matches the existing
 * `masteryBlocker` path so signals line up with the blocks that path creates.
 */
export function extractChecklistSignals(dayLogs: DayLogLike[]): MasterySignal[] {
  const out: MasterySignal[] = []
  for (const day of dayLogs) {
    const date = (day.date ?? '').slice(0, 10)
    if (!date) continue
    for (const item of day.checklist ?? []) {
      const kind = chipToKind(item.mastery)
      if (!kind) continue
      const label = (item.label ?? '').trim()
      if (!label) continue
      out.push({
        skillKey: generateBlockId(inferSkillKey(item)),
        label,
        kind,
        date,
        source: 'checklist',
      })
    }
  }
  return out
}

/**
 * Pull mastery signals from quest sessions. Within each session, questions are
 * grouped by their `skill`; a skill earns at most one signal per session
 * (an occasion), graded on that session's accuracy for the skill. A single
 * lucky answer is not strong — {@link QUEST_STRONG_MIN_ATTEMPTS} graded
 * attempts are required.
 */
export function extractQuestSignals(sessions: QuestSessionLike[]): MasterySignal[] {
  const out: MasterySignal[] = []
  for (const session of sessions) {
    const date = (session.evaluatedAt ?? '').slice(0, 10)
    if (!date) continue
    const bySkill = new Map<string, { label: string; attempts: number; correct: number }>()
    for (const q of session.questions ?? []) {
      const skill = (q.skill ?? '').trim()
      if (!skill) continue
      if (q.skipped) continue // ungraded — don't count for or against mastery
      const entry = bySkill.get(skill) ?? { label: skill, attempts: 0, correct: 0 }
      entry.attempts += 1
      if (q.correct) entry.correct += 1
      bySkill.set(skill, entry)
    }
    for (const [skill, { label, attempts, correct }] of bySkill) {
      if (attempts === 0) continue
      const accuracy = correct / attempts
      let kind: MasterySignalKind
      if (attempts >= QUEST_STRONG_MIN_ATTEMPTS && accuracy >= QUEST_STRONG_ACCURACY) {
        kind = 'strong'
      } else if (accuracy <= QUEST_STRUGGLE_ACCURACY) {
        kind = 'struggle'
      } else {
        kind = 'neutral'
      }
      out.push({ skillKey: generateBlockId(skill), label, kind, date, source: 'quest' })
    }
  }
  return out
}

/**
 * Fold normalized signals into a per-skill rollup and apply the conservative
 * mastery threshold. Pure — no I/O, deterministic given its inputs.
 */
export function aggregateMastery(signals: MasterySignal[]): MasterySkillRollup[] {
  const groups = new Map<
    string,
    {
      label: string
      labelDate: string
      strong: number
      neutral: number
      struggle: number
      strongDates: Set<string>
      lastDate: string
      sources: Set<'checklist' | 'quest'>
    }
  >()

  for (const sig of signals) {
    if (!sig.skillKey) continue
    const g =
      groups.get(sig.skillKey) ??
      {
        label: sig.label,
        labelDate: sig.date,
        strong: 0,
        neutral: 0,
        struggle: 0,
        strongDates: new Set<string>(),
        lastDate: sig.date,
        sources: new Set<'checklist' | 'quest'>(),
      }
    if (sig.kind === 'strong') {
      g.strong += 1
      g.strongDates.add(sig.date)
    } else if (sig.kind === 'neutral') {
      g.neutral += 1
    } else {
      g.struggle += 1
    }
    g.sources.add(sig.source)
    // Keep the most recent non-empty label as the display label.
    if (sig.date >= g.labelDate && sig.label) {
      g.label = sig.label
      g.labelDate = sig.date
    }
    if (sig.date > g.lastDate) g.lastDate = sig.date
    groups.set(sig.skillKey, g)
  }

  const rollups: MasterySkillRollup[] = []
  for (const [skillKey, g] of groups) {
    const strongOccasions = g.strongDates.size
    const mastered =
      g.struggle === 0 &&
      g.strong >= MASTERY_MIN_STRONG_SIGNALS &&
      strongOccasions >= MASTERY_MIN_OCCASIONS
    const sources = Array.from(g.sources).sort()
    const via =
      sources.length === 2
        ? 'repeated got-it / quest'
        : sources[0] === 'quest'
          ? 'repeated quest'
          : 'repeated got-it'
    const evidence = mastered
      ? `mastered via ${via} — ${g.lastDate} (${g.strong} strong across ${strongOccasions} days)`
      : `${g.strong} strong / ${g.neutral} working / ${g.struggle} stuck across signals (last ${g.lastDate})`
    rollups.push({
      skillKey,
      label: g.label,
      strongSignals: g.strong,
      neutralSignals: g.neutral,
      struggleSignals: g.struggle,
      strongOccasions,
      lastSignalDate: g.lastDate,
      sources,
      mastered,
      evidence,
    })
  }
  // Stable, useful order: mastered first, then by most strong signals.
  rollups.sort((a, b) => {
    if (a.mastered !== b.mastered) return a.mastered ? -1 : 1
    return b.strongSignals - a.strongSignals
  })
  return rollups
}

/** True if a conceptual block corresponds to this rollup. */
function matchesBlock(block: ConceptualBlock, rollup: MasterySkillRollup): boolean {
  const keys = new Set([rollup.skillKey, generateBlockId(rollup.label)])
  if (block.id && keys.has(block.id)) return true
  if (block.name && keys.has(generateBlockId(block.name))) return true
  return (block.affectedSkills ?? []).some((s) => keys.has(generateBlockId(s)))
}

/**
 * Of the mastered rollups, return only those that are **actionable** against
 * the current snapshot: the skill is already on the map (a priority skill or a
 * conceptual block) and has **not yet** reached its mastered terminal state.
 *
 * This is the transparency filter behind the surface — it shows exactly what
 * would get checked off and excludes (a) skills already marked Secure/RESOLVED
 * (nothing to do) and (b) skills not on the map at all (the additive central
 * writer can only advance existing entries, never invent a mastered one).
 */
export function pendingCheckoffs(
  rollups: MasterySkillRollup[],
  snapshot: SkillSnapshot | null | undefined,
): MasterySkillRollup[] {
  if (!snapshot) return []
  const blocks = snapshot.conceptualBlocks ?? []
  return rollups.filter((r) => {
    if (!r.mastered) return false

    // A matching priority skill that is not yet Secure + IndependentConsistent.
    const skillPending = snapshot.prioritySkills.some((s) => {
      const keys = new Set([r.skillKey, generateBlockId(r.label)])
      if (!keys.has(generateBlockId(s.label || String(s.tag)))) return false
      const gate = s.masteryGate ?? MasteryGate.NotYet
      return !(s.level === SkillLevel.Secure && gate >= MasteryGate.IndependentConsistent)
    })

    // A matching block still active (ADDRESS_NOW / RESOLVING).
    const blockPending = blocks.some((b) => {
      if (!matchesBlock(b, r)) return false
      const status = effectiveStatus(b)
      return status === 'ADDRESS_NOW' || status === 'RESOLVING'
    })

    // Show it only when it matches an active, non-terminal entry. Skills whose
    // matches are all terminal (already checked off) or that match nothing on
    // the map (the additive writer can't invent a mastered entry) are excluded.
    return skillPending || blockPending
  })
}
