import { describe, expect, it } from 'vitest'
import type { AssignmentCandidate, SkillSnapshot } from '../../core/types/domain'
import { AssignmentAction, SkillLevel, SubjectBucket } from '../../core/types/enums'
import {
  applySnapshotToAssignments,
  dayTotalMinutes,
  generateDraftPlan,
  generateId,
} from './planner.logic'

describe('generateId', () => {
  it('returns unique IDs', () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
    expect(id1).toMatch(/^item_/)
  })
})

describe('applySnapshotToAssignments', () => {
  const baseAssignment: AssignmentCandidate = {
    id: 'a1',
    subjectBucket: SubjectBucket.Math,
    workbookName: 'Math Grade 2',
    lessonName: 'Lesson 5',
    estimatedMinutes: 15,
    difficultyCues: [],
    action: AssignmentAction.Keep,
  }

  it('returns assignments unchanged when snapshot is null', () => {
    const result = applySnapshotToAssignments([baseAssignment], null)
    expect(result).toEqual([baseAssignment])
  })

  it('returns assignments unchanged when snapshot has no priority skills', () => {
    const snapshot: SkillSnapshot = {
      childId: 'c1',
      prioritySkills: [],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
    }
    const result = applySnapshotToAssignments([baseAssignment], snapshot)
    expect(result).toEqual([baseAssignment])
  })

  it('applies modify suggestion when stop rule trigger matches difficulty cue', () => {
    const assignment: AssignmentCandidate = {
      ...baseAssignment,
      difficultyCues: ['frustration spikes'],
    }
    const snapshot: SkillSnapshot = {
      childId: 'c1',
      prioritySkills: [{ tag: 'math.sub.regroup', label: 'Regrouping', level: SkillLevel.Emerging }],
      supports: [],
      stopRules: [
        { label: 'Skip regrouping', trigger: 'Frustration spikes', action: 'Do 3 guided reps' },
      ],
      evidenceDefinitions: [
        { label: 'Regroup', description: 'Can explain regroup step' },
      ],
    }
    const result = applySnapshotToAssignments([assignment], snapshot)
    expect(result[0].action).toBe(AssignmentAction.Modify)
    expect(result[0].skipSuggestion).toBeDefined()
    expect(result[0].skipSuggestion!.reason).toBe('Frustration spikes')
  })

  it('applies modify suggestion for long tasks (>20 min)', () => {
    const assignment: AssignmentCandidate = {
      ...baseAssignment,
      estimatedMinutes: 30,
    }
    const snapshot: SkillSnapshot = {
      childId: 'c1',
      prioritySkills: [{ tag: 'math.sub.regroup', label: 'Regrouping', level: SkillLevel.Emerging }],
      supports: [],
      stopRules: [],
      evidenceDefinitions: [],
    }
    const result = applySnapshotToAssignments([assignment], snapshot)
    expect(result[0].action).toBe(AssignmentAction.Modify)
    expect(result[0].skipSuggestion!.action).toBe('modify')
  })
})

describe('generateDraftPlan', () => {
  it('creates app block items for every weekday', () => {
    const appBlocks = [{ label: 'Reading Eggs', defaultMinutes: 15 }]
    const result = generateDraftPlan([], appBlocks, 120)
    expect(result).toHaveLength(5) // 1 app block * 5 days
    expect(result.every((item) => item.isAppBlock)).toBe(true)
    expect(result.every((item) => item.accepted)).toBe(true)
  })

  it('distributes assignments across days', () => {
    const assignments: AssignmentCandidate[] = [
      {
        id: 'a1',
        subjectBucket: SubjectBucket.Math,
        workbookName: 'Math',
        lessonName: 'L1',
        estimatedMinutes: 20,
        difficultyCues: [],
        action: AssignmentAction.Keep,
      },
      {
        id: 'a2',
        subjectBucket: SubjectBucket.Reading,
        workbookName: 'Reading',
        lessonName: 'L2',
        estimatedMinutes: 15,
        difficultyCues: [],
        action: AssignmentAction.Keep,
      },
    ]
    const result = generateDraftPlan(assignments, [], 120)
    expect(result).toHaveLength(2)
    // Both should be assigned to different days (budget allows)
    const days = new Set(result.map((item) => item.day))
    expect(days.size).toBe(2)
  })

  it('skips assignments marked as Skip', () => {
    const assignments: AssignmentCandidate[] = [
      {
        id: 'a1',
        subjectBucket: SubjectBucket.Math,
        workbookName: 'Math',
        lessonName: 'L1',
        estimatedMinutes: 20,
        difficultyCues: [],
        action: AssignmentAction.Skip,
      },
    ]
    const result = generateDraftPlan(assignments, [], 120)
    expect(result).toHaveLength(0)
  })

  it('reduces time for modified assignments', () => {
    const assignments: AssignmentCandidate[] = [
      {
        id: 'a1',
        subjectBucket: SubjectBucket.Math,
        workbookName: 'Math',
        lessonName: 'L1',
        estimatedMinutes: 30,
        difficultyCues: [],
        action: AssignmentAction.Modify,
      },
    ]
    const result = generateDraftPlan(assignments, [], 120)
    expect(result[0].estimatedMinutes).toBe(18) // 30 * 0.6 = 18
  })
})

describe('dayTotalMinutes', () => {
  it('sums accepted items for a given day', () => {
    const items = [
      { id: '1', day: 'Monday', title: 'A', subjectBucket: SubjectBucket.Math, estimatedMinutes: 20, skillTags: [], accepted: true },
      { id: '2', day: 'Monday', title: 'B', subjectBucket: SubjectBucket.Math, estimatedMinutes: 15, skillTags: [], accepted: true },
      { id: '3', day: 'Monday', title: 'C', subjectBucket: SubjectBucket.Math, estimatedMinutes: 10, skillTags: [], accepted: false },
      { id: '4', day: 'Tuesday', title: 'D', subjectBucket: SubjectBucket.Math, estimatedMinutes: 30, skillTags: [], accepted: true },
    ]
    expect(dayTotalMinutes(items, 'Monday')).toBe(35)
    expect(dayTotalMinutes(items, 'Tuesday')).toBe(30)
    expect(dayTotalMinutes(items, 'Wednesday')).toBe(0)
  })
})
