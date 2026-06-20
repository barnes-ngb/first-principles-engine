// ── Per-child Skill Snapshot defaults selector ──────────────────────
//
// Picks which starter defaults template to apply when a parent taps
// "Load Defaults" on the Skill Snapshot page. Selection is by **grade/age
// band — DATA, never name**: a kindergarten-band child (Pre-K/K/1, or age
// ≤ 6) gets London's K frame; everyone else gets Lincoln's. Unknown
// grade/age falls back to Lincoln.
//
// This is propose-and-confirm-friendly: the page still requires a human tap
// to apply — nothing auto-writes. Keying on `name`/`isLincoln` is forbidden
// (see CLAUDE.md "Lincoln-first / London minimal"); this generalizes to
// future children by adding another band before the fallback.

import { computeAge } from '../../core/profile/childIdentity'
import type {
  Child,
  EvidenceDefinition,
  PrioritySkill,
  StopRule,
  SupportDefault,
} from '../../core/types'
import {
  defaultEvidenceDefinitions as lincolnEvidence,
  defaultPrioritySkills as lincolnPrioritySkills,
  defaultStopRules as lincolnStopRules,
  defaultSupports as lincolnSupports,
} from './lincolnDefaults'
import {
  defaultEvidenceDefinitions as londonEvidence,
  defaultPrioritySkills as londonPrioritySkills,
  defaultStopRules as londonStopRules,
  defaultSupports as londonSupports,
} from './londonDefaults'

/** A starter-defaults template: the four Skill Snapshot seed arrays. */
export interface ChildDefaults {
  prioritySkills: PrioritySkill[]
  supports: SupportDefault[]
  stopRules: StopRule[]
  evidenceDefinitions: EvidenceDefinition[]
}

const lincolnDefaults: ChildDefaults = {
  prioritySkills: lincolnPrioritySkills,
  supports: lincolnSupports,
  stopRules: lincolnStopRules,
  evidenceDefinitions: lincolnEvidence,
}

const londonDefaults: ChildDefaults = {
  prioritySkills: londonPrioritySkills,
  supports: londonSupports,
  stopRules: londonStopRules,
  evidenceDefinitions: londonEvidence,
}

/** Highest grade still in the kindergarten band (grade 1 and below). */
const EARLY_GRADE_CEILING = 1

/** Age (years) at or below which a child is treated as kindergarten-band. */
const EARLY_AGE_CEILING = 6

/**
 * True when a freeform grade string reads as the kindergarten band
 * (Pre-K, Kindergarten, or 1st grade). Tolerant of the loose values the
 * `grade` field carries ("Kindergarten", "K", "1st grade", "Grade 1").
 */
export function isEarlyGradeBand(grade?: string): boolean {
  if (!grade) return false
  const g = grade.trim().toLowerCase()
  if (!g) return false
  if (g.includes('pre-k') || g.includes('prek') || g.includes('pre k')) return true
  if (g.includes('kindergarten') || g === 'k') return true
  if (g.includes('1st') || g.includes('first')) return true
  // Bare numeric forms only ("1", "grade 1") — note "\b\d+\b" deliberately
  // does NOT match the "4" in "4th" (no word boundary before the "t").
  const numMatch = g.match(/\b(\d+)\b/)
  if (numMatch) return Number(numMatch[1]) <= EARLY_GRADE_CEILING
  return false
}

/**
 * Select the starter-defaults template for a child by grade/age band.
 * Kindergarten-band (Pre-K/K/1, or age-from-birthdate ≤ 6) → London's K
 * frame; otherwise → Lincoln. Unknown grade *and* age → Lincoln (fallback).
 *
 * Selection is on capability/data, **never** on `name`/`isLincoln`.
 */
export function getDefaultsForChild(
  child: Pick<Child, 'birthdate' | 'grade'> | null | undefined,
): ChildDefaults {
  if (!child) return lincolnDefaults
  const age = computeAge(child.birthdate)
  const earlyByAge = age !== undefined && age <= EARLY_AGE_CEILING
  const earlyByGrade = isEarlyGradeBand(child.grade)
  if (earlyByAge || earlyByGrade) return londonDefaults
  return lincolnDefaults
}
