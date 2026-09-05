// ── Which section of Progress → Curriculum an activity belongs to (UX-204) ───
//
// The bug this module exists to make unrepresentable: `CurriculumTab` grouped
// its configs with four independent `filter` calls over a SIX-member
// `ActivityType`, and rendered four sections. Nothing named `'activity'` or
// `'app'`, so every config of those two types was rendered on no screen in the
// app — while `activityConfigsToRoutineText` (which filters on `completed`
// only) kept feeding them into every generated plan and into the day budget.
// A record that plans every day and that no screen renders is a record nobody
// can fix; the owner went looking for a duplicated "Fast Phonics (Reading
// Eggs)" and could not find it anywhere.
//
// The rail is `SECTION_FOR_TYPE`: a `Record<ActivityType, CurriculumSectionId>`,
// so a SEVENTH `ActivityType` member fails to compile until somebody decides
// which section it belongs in. That is a rail with no code path around it,
// which beats a test that has to be remembered. The property test alongside it
// checks the other half — that every section this map can name is a section the
// tab actually renders.
//
// Pure: no React, no Firestore, no ordering opinions beyond the caller's own
// `sortOrder`. It answers "where does this row go", nothing else.

import type { ActivityConfig } from '../../core/types'
import { ActivityType } from '../../core/types/enums'

/** The sections Progress → Curriculum renders for NON-completed activities. */
export const CurriculumSection = {
  Workbooks: 'workbooks',
  Routines: 'routines',
  Other: 'other',
  Evaluations: 'evaluations',
} as const
export type CurriculumSection = (typeof CurriculumSection)[keyof typeof CurriculumSection]

/**
 * Every `ActivityType`, placed. Exhaustive by type, not by discipline.
 *
 * `activity` and `app` land in `Other` rather than in `Routines` because they
 * are not the same thing to a parent — a routine is part of the shape of the
 * day, an app or a one-off activity is a thing that exists in the rotation —
 * and because a mislabelled row hides just as badly inside a section whose
 * heading is wrong for it.
 */
export const SECTION_FOR_TYPE: Record<ActivityType, CurriculumSection> = {
  [ActivityType.Workbook]: CurriculumSection.Workbooks,
  [ActivityType.Routine]: CurriculumSection.Routines,
  [ActivityType.Formation]: CurriculumSection.Routines,
  [ActivityType.Activity]: CurriculumSection.Other,
  [ActivityType.App]: CurriculumSection.Other,
  [ActivityType.Evaluation]: CurriculumSection.Evaluations,
}

/**
 * The section heading each id renders under. Kept here beside the map so that
 * placing a new type and naming its home are one decision in one file.
 */
export const CURRICULUM_SECTION_TITLE: Record<CurriculumSection, string> = {
  [CurriculumSection.Workbooks]: 'Active Workbooks',
  [CurriculumSection.Routines]: 'Routine Activities',
  [CurriculumSection.Other]: 'Apps & Other Activities',
  [CurriculumSection.Evaluations]: 'Evaluations (auto-managed)',
}

/**
 * The line under the new section's heading.
 *
 * It exists because the section's whole reason for being is that these rows
 * were invisible: a parent arriving at a heading she has never seen before
 * needs one sentence saying what put things there and that they are costing her
 * plan time.
 */
export const OTHER_ACTIVITIES_DESCRIPTION =
  'Apps and one-off activities — including anything added from Ask AI. These are planned every school day and counted in the day budget, the same as a routine.'

/**
 * Where an unrecognised stored `type` goes.
 *
 * Firestore holds whatever was written, including a value from a build that
 * knew a type this one does not. `Other` is the honest home for it: the row is
 * still real, still plans, and still needs a ⋮ menu — silently dropping it is
 * the exact failure this module was written to end.
 */
export function sectionForType(type: ActivityConfig['type']): CurriculumSection {
  return SECTION_FOR_TYPE[type] ?? CurriculumSection.Other
}

/** Non-completed configs grouped by section, plus the completed ones. */
export interface GroupedCurriculum {
  workbooks: ActivityConfig[]
  routines: ActivityConfig[]
  other: ActivityConfig[]
  evaluations: ActivityConfig[]
  completed: ActivityConfig[]
}

/**
 * Partition the family's configs into exactly the buckets the tab renders.
 *
 * A partition, not four filters: every config lands in exactly one bucket, so
 * the count of the five buckets always equals the count of the input. The
 * `completed` split comes first and is unchanged — a finished program has no
 * section, it has a history.
 */
export function groupCurriculumConfigs(configs: ActivityConfig[]): GroupedCurriculum {
  const grouped: GroupedCurriculum = {
    workbooks: [],
    routines: [],
    other: [],
    evaluations: [],
    completed: [],
  }
  for (const config of configs) {
    if (config.completed) {
      grouped.completed.push(config)
      continue
    }
    grouped[sectionForType(config.type)].push(config)
  }
  return grouped
}
