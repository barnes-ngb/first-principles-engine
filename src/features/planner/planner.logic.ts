import type {
  AppBlock,
  AssignmentCandidate,
  SkillSnapshot,
  SkipSuggestion,
  WeeklyPlanItem,
} from '../../core/types/domain'
import { AssignmentAction, SubjectBucket } from '../../core/types/enums'

/** Default app blocks that run "on rails" */
export const defaultAppBlocks: AppBlock[] = [
  { label: 'Reading Eggs', defaultMinutes: 15 },
  { label: 'Math app / Typing', defaultMinutes: 15 },
]

/** Day labels for Mon–Fri + optional weekend */
export const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const

let nextId = 1
export function generateId(): string {
  return `item_${Date.now()}_${nextId++}`
}

/**
 * Apply a skill snapshot to a list of assignment candidates.
 * Returns assignments with skip/modify suggestions attached.
 */
export function applySnapshotToAssignments(
  assignments: AssignmentCandidate[],
  snapshot: SkillSnapshot | null,
): AssignmentCandidate[] {
  if (!snapshot || snapshot.prioritySkills.length === 0) return assignments

  return assignments.map((assignment) => {
    // Check stop rules for potential skips/modifies
    for (const rule of snapshot.stopRules) {
      const matchesTrigger = assignment.difficultyCues.some(
        (cue) => cue.toLowerCase().includes(rule.trigger.toLowerCase()),
      )
      if (matchesTrigger) {
        const suggestion: SkipSuggestion = {
          action: 'modify',
          reason: rule.trigger,
          replacement: rule.action,
          evidence: snapshot.evidenceDefinitions[0]?.description ?? 'Complete modified set',
        }
        return { ...assignment, action: AssignmentAction.Modify, skipSuggestion: suggestion }
      }
    }

    // Check for long estimated time relative to attention window
    if (assignment.estimatedMinutes > 20) {
      const suggestion: SkipSuggestion = {
        action: 'modify',
        reason: 'Long task may exceed attention window',
        replacement: 'Do odds only or first half, then 2-min review',
        evidence: 'Completes modified set with acceptable accuracy',
      }
      return { ...assignment, action: AssignmentAction.Modify, skipSuggestion: suggestion }
    }

    return assignment
  })
}

/**
 * Generate a draft weekly plan from assignments + app blocks.
 * Distributes assignments across weekdays within the available time budget.
 */
export function generateDraftPlan(
  assignments: AssignmentCandidate[],
  appBlocks: AppBlock[],
  availableMinutesPerDay: number,
): WeeklyPlanItem[] {
  const items: WeeklyPlanItem[] = []

  // First add app blocks to every day
  for (const day of weekDays) {
    for (const block of appBlocks) {
      items.push({
        id: generateId(),
        day,
        title: block.label,
        subjectBucket: SubjectBucket.Other,
        estimatedMinutes: block.defaultMinutes,
        isAppBlock: true,
        skillTags: [],
        accepted: true,
      })
    }
  }

  // Calculate remaining time per day after app blocks
  const appMinutesPerDay = appBlocks.reduce((sum, b) => sum + b.defaultMinutes, 0)
  const remainingPerDay = Math.max(0, availableMinutesPerDay - appMinutesPerDay)

  // Distribute accepted/modified assignments across days
  const activeAssignments = assignments.filter(
    (a) => a.action === AssignmentAction.Keep || a.action === AssignmentAction.Modify,
  )

  const dayBudgets = weekDays.map(() => remainingPerDay)
  for (const assignment of activeAssignments) {
    // Find the day with most remaining budget
    let bestDay = 0
    for (let i = 1; i < dayBudgets.length; i++) {
      if (dayBudgets[i] > dayBudgets[bestDay]) bestDay = i
    }

    const effectiveMinutes =
      assignment.action === AssignmentAction.Modify
        ? Math.ceil(assignment.estimatedMinutes * 0.6)
        : assignment.estimatedMinutes

    dayBudgets[bestDay] -= effectiveMinutes

    items.push({
      id: generateId(),
      day: weekDays[bestDay],
      title: `${assignment.workbookName} \u2013 ${assignment.lessonName}`,
      subjectBucket: assignment.subjectBucket,
      estimatedMinutes: effectiveMinutes,
      assignmentId: assignment.id,
      skillTags: [],
      skipSuggestion: assignment.skipSuggestion,
      accepted: true,
    })
  }

  return items
}

/**
 * Calculate total estimated minutes for a given day.
 */
export function dayTotalMinutes(items: WeeklyPlanItem[], day: string): number {
  return items
    .filter((item) => item.day === day && item.accepted)
    .reduce((sum, item) => sum + item.estimatedMinutes, 0)
}
