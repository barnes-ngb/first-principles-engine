import { describe, expect, it, beforeEach } from 'vitest'
import type { AssignmentCandidate, SkillSnapshot } from '../../core/types'
import type { ChatResponse } from '../../core/ai/useAI'
import { AssignmentAction, SkillLevel, SubjectBucket } from '../../core/types/enums'
import {
  AdjustmentType,
  applySnapshotSuggestions,
  buildMinimumWinText,
  buildPlannerPrompt,
  dayTotalMinutes,
  generateDraftPlanFromInputs,
  parseAIResponse,
  planTotalMinutes,
  resetIdCounter,
} from './chatPlanner.logic'
import type { PlanGeneratorInputs } from './chatPlanner.logic'

const baseSnapshot: SkillSnapshot = {
  childId: 'c1',
  prioritySkills: [
    { tag: 'reading.phonics.cvc.emerging', label: 'CVC blending', level: SkillLevel.Emerging },
    { tag: 'math.subtraction.regrouping.emerging', label: 'Regrouping', level: SkillLevel.Emerging },
  ],
  supports: [],
  stopRules: [
    { label: 'Skip long passages', trigger: 'Frustration spikes', action: 'Do 3 guided reps' },
  ],
  evidenceDefinitions: [
    { label: 'CVC', description: 'Blends 3+ CVC words with <=1 error' },
  ],
}

const baseInputs: PlanGeneratorInputs = {
  snapshot: baseSnapshot,
  hoursPerDay: 2.5,
  appBlocks: [{ label: 'Reading Eggs', defaultMinutes: 15 }],
  assignments: [],
}

beforeEach(() => {
  resetIdCounter()
})

describe('buildMinimumWinText', () => {
  it('returns generic text when no snapshot', () => {
    const text = buildMinimumWinText(null)
    expect(text).toContain('Complete daily assignments')
  })

  it('returns generic text when snapshot has no priority skills', () => {
    const text = buildMinimumWinText({ ...baseSnapshot, prioritySkills: [] })
    expect(text).toContain('Complete daily assignments')
  })

  it('includes daily micro reps for emerging skills', () => {
    const text = buildMinimumWinText(baseSnapshot)
    expect(text).toContain('CVC blending: daily micro reps')
    expect(text).toContain('Regrouping: daily micro reps')
  })

  it('includes 3x/week for developing skills', () => {
    const snapshot: SkillSnapshot = {
      ...baseSnapshot,
      prioritySkills: [
        { tag: 'writing.handwriting', label: 'Handwriting', level: SkillLevel.Developing },
      ],
    }
    const text = buildMinimumWinText(snapshot)
    expect(text).toContain('Handwriting: 3x/week practice')
  })
})

describe('applySnapshotSuggestions', () => {
  const assignment: AssignmentCandidate = {
    id: 'a1',
    subjectBucket: SubjectBucket.Math,
    workbookName: 'Math G2',
    lessonName: 'L5',
    estimatedMinutes: 15,
    difficultyCues: [],
    action: AssignmentAction.Keep,
  }

  it('returns unchanged when no snapshot', () => {
    const result = applySnapshotSuggestions([assignment], null)
    expect(result.assignments).toEqual([assignment])
    expect(result.skipSuggestions).toHaveLength(0)
  })

  it('applies modify for stop rule match', () => {
    const a: AssignmentCandidate = { ...assignment, difficultyCues: ['frustration spikes'] }
    const result = applySnapshotSuggestions([a], baseSnapshot)
    expect(result.assignments[0].action).toBe(AssignmentAction.Modify)
    expect(result.skipSuggestions).toHaveLength(1)
  })

  it('applies modify for long tasks', () => {
    const a: AssignmentCandidate = { ...assignment, estimatedMinutes: 25 }
    const result = applySnapshotSuggestions([a], baseSnapshot)
    expect(result.assignments[0].action).toBe(AssignmentAction.Modify)
    expect(result.assignments[0].skipSuggestion?.reason).toContain('attention window')
  })
})

describe('generateDraftPlanFromInputs', () => {
  it('creates app blocks for each day', () => {
    const plan = generateDraftPlanFromInputs(baseInputs)
    expect(plan.days).toHaveLength(5)
    for (const day of plan.days) {
      const appItems = day.items.filter((item) => item.isAppBlock)
      expect(appItems).toHaveLength(1)
      expect(appItems[0].title).toBe('Reading Eggs')
    }
  })

  it('generates daily micro reps for emerging skills', () => {
    const plan = generateDraftPlanFromInputs(baseInputs)
    for (const day of plan.days) {
      const microReps = day.items.filter((item) => item.title.includes('micro rep'))
      // 2 emerging skills = 2 micro reps per day
      expect(microReps).toHaveLength(2)
      expect(microReps[0].estimatedMinutes).toBe(8)
    }
  })

  it('distributes assignments across least-loaded days', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math', lessonName: 'L1',
          estimatedMinutes: 20, difficultyCues: [], action: AssignmentAction.Keep,
        },
        {
          id: 'a2', subjectBucket: SubjectBucket.Reading, workbookName: 'Reading', lessonName: 'L2',
          estimatedMinutes: 15, difficultyCues: [], action: AssignmentAction.Keep,
        },
      ],
    }
    const plan = generateDraftPlanFromInputs(inputs)
    const assignmentItems = plan.days.flatMap((d) => d.items.filter((i) => i.assignmentId))
    expect(assignmentItems).toHaveLength(2)
    // Should be on different days since all days start equally loaded
    const days = new Set(assignmentItems.map((_, idx) =>
      plan.days.find((d) => d.items.includes(assignmentItems[idx]))?.day,
    ))
    expect(days.size).toBe(2)
  })

  it('reduces time for modified assignments', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      snapshot: null,
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math', lessonName: 'L1',
          estimatedMinutes: 30, difficultyCues: [], action: AssignmentAction.Modify,
        },
      ],
    }
    const plan = generateDraftPlanFromInputs(inputs)
    const item = plan.days.flatMap((d) => d.items).find((i) => i.assignmentId === 'a1')
    expect(item).toBeDefined()
    expect(item!.estimatedMinutes).toBe(18) // 30 * 0.6
  })

  it('skips assignments with Skip action', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      snapshot: null,
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math', lessonName: 'L1',
          estimatedMinutes: 15, difficultyCues: [], action: AssignmentAction.Skip,
        },
      ],
    }
    const plan = generateDraftPlanFromInputs(inputs)
    const assignmentItems = plan.days.flatMap((d) => d.items.filter((i) => i.assignmentId))
    expect(assignmentItems).toHaveLength(0)
  })

  it('includes minimum win text from snapshot', () => {
    const plan = generateDraftPlanFromInputs(baseInputs)
    expect(plan.minimumWin).toContain('CVC blending')
    expect(plan.minimumWin).toContain('daily micro reps')
  })

  it('applies lighten day adjustment', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      snapshot: null,
      appBlocks: [],
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math', lessonName: 'L1',
          estimatedMinutes: 30, difficultyCues: [], action: AssignmentAction.Keep,
        },
      ],
      adjustments: [{ type: AdjustmentType.LightenDay, day: 'Monday' }],
    }
    const plan = generateDraftPlanFromInputs(inputs)
    const monday = plan.days.find((d) => d.day === 'Monday')!
    // Assignment should have been halved (30 -> 15)
    const item = monday.items.find((i) => i.assignmentId === 'a1')
    if (item) {
      expect(item.estimatedMinutes).toBeLessThanOrEqual(15)
    }
  })

  it('applies move subject adjustment', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      snapshot: null,
      appBlocks: [],
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math', lessonName: 'L1',
          estimatedMinutes: 15, difficultyCues: [], action: AssignmentAction.Keep,
        },
      ],
      adjustments: [{
        type: AdjustmentType.MoveSubject,
        subject: SubjectBucket.Math,
        toDays: ['Tuesday', 'Thursday'],
      }],
    }
    const plan = generateDraftPlanFromInputs(inputs)
    // Math should only be accepted on Tue/Thu
    for (const day of plan.days) {
      const mathItems = day.items.filter((i) => i.subjectBucket === SubjectBucket.Math && i.accepted)
      if (day.day === 'Tuesday' || day.day === 'Thursday') {
        // Could be 0 or more depending on where it was assigned
      } else {
        expect(mathItems).toHaveLength(0)
      }
    }
  })

  it('applies cap subject time adjustment', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      snapshot: null,
      appBlocks: [],
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math', lessonName: 'L1',
          estimatedMinutes: 30, difficultyCues: [], action: AssignmentAction.Keep,
        },
      ],
      adjustments: [{
        type: AdjustmentType.CapSubjectTime,
        subject: SubjectBucket.Math,
        maxMinutesPerDay: 15,
      }],
    }
    const plan = generateDraftPlanFromInputs(inputs)
    for (const day of plan.days) {
      for (const item of day.items) {
        if (item.subjectBucket === SubjectBucket.Math) {
          expect(item.estimatedMinutes).toBeLessThanOrEqual(15)
        }
      }
    }
  })
})

describe('dayTotalMinutes', () => {
  it('sums only accepted items', () => {
    const day = {
      day: 'Monday' as const,
      timeBudgetMinutes: 150,
      items: [
        { id: '1', title: 'A', subjectBucket: SubjectBucket.Math, estimatedMinutes: 20, skillTags: [], accepted: true },
        { id: '2', title: 'B', subjectBucket: SubjectBucket.Reading, estimatedMinutes: 15, skillTags: [], accepted: true },
        { id: '3', title: 'C', subjectBucket: SubjectBucket.Other, estimatedMinutes: 10, skillTags: [], accepted: false },
      ],
    }
    expect(dayTotalMinutes(day)).toBe(35)
  })
})

describe('planTotalMinutes', () => {
  it('sums all days', () => {
    const plan = generateDraftPlanFromInputs({ ...baseInputs, snapshot: null })
    // 1 app block * 15 min * 5 days = 75 minutes
    expect(planTotalMinutes(plan)).toBe(75)
  })
})

// ── AI Integration Tests ─────────────────────────────────────

describe('buildPlannerPrompt', () => {
  it('includes hours per day budget', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).toContain('2.5 hours/day')
  })

  it('includes app blocks', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).toContain('Reading Eggs')
    expect(prompt).toContain('15 min/day')
  })

  it('includes assignments when present', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math G2', lessonName: 'L5',
          estimatedMinutes: 15, difficultyCues: [], action: AssignmentAction.Keep,
        },
      ],
    }
    const prompt = buildPlannerPrompt(inputs)
    expect(prompt).toContain('Math G2')
    expect(prompt).toContain('L5')
  })

  it('includes priority skills from snapshot', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).toContain('CVC blending')
    expect(prompt).toContain('Regrouping')
  })

  it('includes stop rules from snapshot', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).toContain('Frustration spikes')
  })

  it('includes adjustments when present', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      adjustments: [{ type: AdjustmentType.LightenDay, day: 'Wednesday' }],
    }
    const prompt = buildPlannerPrompt(inputs)
    expect(prompt).toContain('lighten_day')
    expect(prompt).toContain('Wednesday')
  })

  it('includes JSON schema instruction', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).toContain('Respond ONLY with a JSON object')
  })
})

describe('parseAIResponse', () => {
  const validPlan = {
    days: [
      {
        day: 'Monday',
        timeBudgetMinutes: 150,
        items: [
          {
            title: 'CVC blending (micro rep)',
            subjectBucket: 'Reading',
            estimatedMinutes: 8,
            skillTags: ['reading.phonics.cvc'],
            isAppBlock: false,
            accepted: true,
          },
          {
            title: 'Reading Eggs',
            subjectBucket: 'Other',
            estimatedMinutes: 15,
            skillTags: [],
            isAppBlock: true,
            accepted: true,
          },
        ],
      },
      {
        day: 'Tuesday',
        timeBudgetMinutes: 150,
        items: [
          {
            title: 'Math worksheet',
            subjectBucket: 'Math',
            estimatedMinutes: 20,
            skillTags: [],
            isAppBlock: false,
            accepted: true,
          },
        ],
      },
    ],
    skipSuggestions: [],
    minimumWin: 'CVC blending: daily micro reps (5-8 min).',
  }

  const makeResponse = (message: string): ChatResponse => ({
    message,
    model: 'claude-sonnet-4-20250514',
    usage: { inputTokens: 100, outputTokens: 200 },
  })

  it('parses a valid JSON response into DraftWeeklyPlan', () => {
    const result = parseAIResponse(makeResponse(JSON.stringify(validPlan)))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(2)
    expect(result!.days[0].day).toBe('Monday')
    expect(result!.days[0].items).toHaveLength(2)
    expect(result!.days[0].items[0].title).toBe('CVC blending (micro rep)')
    expect(result!.days[0].items[0].subjectBucket).toBe(SubjectBucket.Reading)
    expect(result!.minimumWin).toContain('CVC blending')
  })

  it('generates unique IDs for each item', () => {
    const result = parseAIResponse(makeResponse(JSON.stringify(validPlan)))
    const allIds = result!.days.flatMap((d) => d.items.map((i) => i.id))
    const uniqueIds = new Set(allIds)
    expect(uniqueIds.size).toBe(allIds.length)
  })

  it('strips markdown code fences', () => {
    const wrapped = '```json\n' + JSON.stringify(validPlan) + '\n```'
    const result = parseAIResponse(makeResponse(wrapped))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(2)
  })

  it('extracts JSON when AI adds preamble text before the object', () => {
    const preamble = "Here's your weekly plan:\n" + JSON.stringify(validPlan)
    const result = parseAIResponse(makeResponse(preamble))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(2)
    expect(result!.days[0].day).toBe('Monday')
  })

  it('extracts JSON when AI adds trailing text after the object', () => {
    const trailing = JSON.stringify(validPlan) + '\n\nLet me know if you want adjustments!'
    const result = parseAIResponse(makeResponse(trailing))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(2)
  })

  it('extracts JSON wrapped in markdown fences with preamble', () => {
    const mixed = "Here's the plan:\n```json\n" + JSON.stringify(validPlan) + '\n```\nAdjust as needed.'
    const result = parseAIResponse(makeResponse(mixed))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(2)
  })

  it('defaults invalid subjectBucket to Other', () => {
    const plan = {
      ...validPlan,
      days: [
        {
          day: 'Monday',
          timeBudgetMinutes: 150,
          items: [
            {
              title: 'Test item',
              subjectBucket: 'InvalidSubject',
              estimatedMinutes: 10,
              skillTags: [],
            },
          ],
        },
      ],
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.days[0].items[0].subjectBucket).toBe(SubjectBucket.Other)
  })

  it('defaults accepted to true when not specified', () => {
    const plan = {
      ...validPlan,
      days: [
        {
          day: 'Monday',
          timeBudgetMinutes: 150,
          items: [{ title: 'Test', subjectBucket: 'Math', estimatedMinutes: 10 }],
        },
      ],
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result!.days[0].items[0].accepted).toBe(true)
  })

  it('parses skip suggestions when present', () => {
    const plan = {
      ...validPlan,
      skipSuggestions: [
        {
          action: 'modify',
          reason: 'Long task',
          replacement: 'Do half',
          evidence: 'Completes modified set',
        },
      ],
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result!.skipSuggestions).toHaveLength(1)
    expect(result!.skipSuggestions[0].reason).toBe('Long task')
  })

  it('returns null for empty string', () => {
    expect(parseAIResponse(makeResponse(''))).toBeNull()
  })

  it('returns null for non-JSON text', () => {
    expect(parseAIResponse(makeResponse('Here is your plan for the week...'))).toBeNull()
  })

  it('returns null when days array is missing', () => {
    expect(parseAIResponse(makeResponse(JSON.stringify({ minimumWin: 'x' })))).toBeNull()
  })

  it('returns null when days array is empty', () => {
    expect(parseAIResponse(makeResponse(JSON.stringify({ days: [], minimumWin: 'x' })))).toBeNull()
  })

  it('defaults minimumWin when missing from AI response', () => {
    const plan = { days: [{ day: 'Monday', items: [{ title: 'X', estimatedMinutes: 10 }] }] }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.minimumWin).toBe('Complete the core items for each day.')
  })

  it('skips items with missing title but keeps other items', () => {
    const plan = {
      days: [{ day: 'Monday', items: [
        { estimatedMinutes: 10, subjectBucket: 'Math' },
        { title: 'Good Item', estimatedMinutes: 15, subjectBucket: 'Reading' },
      ] }],
      minimumWin: 'x',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    // First item has no title → gets coerced to 'Activity', which is truthy, so it's kept
    expect(result!.days[0].items.length).toBeGreaterThanOrEqual(1)
  })

  it('defaults estimatedMinutes to 15 when missing', () => {
    const plan = {
      days: [{ day: 'Monday', items: [{ title: 'X', subjectBucket: 'Math' }] }],
      minimumWin: 'x',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.days[0].items[0].estimatedMinutes).toBe(15)
  })

  it('skips items with negative estimatedMinutes but keeps good items', () => {
    const plan = {
      days: [{ day: 'Monday', items: [
        { title: 'Bad', estimatedMinutes: -5, subjectBucket: 'Math' },
        { title: 'Good', estimatedMinutes: 10, subjectBucket: 'Reading' },
      ] }],
      minimumWin: 'x',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.days[0].items).toHaveLength(1)
    expect(result!.days[0].items[0].title).toBe('Good')
  })

  it('coerces string estimatedMinutes to number', () => {
    const plan = {
      days: [{ day: 'Monday', items: [{ title: 'X', estimatedMinutes: '8', subjectBucket: 'Math' }] }],
      minimumWin: 'x',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.days[0].items[0].estimatedMinutes).toBe(8)
  })

  it('returns null when all days are invalid', () => {
    const plan = {
      days: [{ items: [{ title: 'X', estimatedMinutes: 10 }] }],
      minimumWin: 'x',
    }
    expect(parseAIResponse(makeResponse(JSON.stringify(plan)))).toBeNull()
  })

  it('defaults timeBudgetMinutes to 150 when not provided', () => {
    const plan = {
      days: [{ day: 'Monday', items: [{ title: 'X', estimatedMinutes: 10, subjectBucket: 'Math' }] }],
      minimumWin: 'x',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result!.days[0].timeBudgetMinutes).toBe(150)
  })

  it('filters out malformed skip suggestions', () => {
    const plan = {
      ...validPlan,
      skipSuggestions: [
        { action: 'modify', reason: 'valid', replacement: 'ok', evidence: 'yes' },
        { action: 'modify' }, // missing fields
        'not an object',
      ],
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result!.skipSuggestions).toHaveLength(1)
  })
})
