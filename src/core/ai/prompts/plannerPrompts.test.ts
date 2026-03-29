import { describe, expect, it } from 'vitest'
import type {
  PrioritySkill,
  SkillSnapshot,
  StopRule,
  SupportDefault,
} from '../../types'
import { AssignmentAction, EnergyLevel, PaceStatus, SkillLevel, SubjectBucket } from '../../types/enums'
import {
  buildAssignmentsSection,
  buildChildContextSection,
  buildOutputSchemaSection,
  buildPlannerSystemPrompt,
  buildPlannerUserMessage,
  buildSessionContextSection,
  buildSkillSnapshotSection,
  CHARTER_PREAMBLE,
  DRAFT_WEEKLY_PLAN_SCHEMA,
  formatAppBlocksForPrompt,
  formatAssignmentsForPrompt,
  formatPaceDataForPrompt,
  formatSkillsForPrompt,
  formatStopRulesForPrompt,
  formatSupportsForPrompt,
  PLANNER_TASK_INSTRUCTIONS,
} from './plannerPrompts'
import type { PlannerPromptInputs } from './plannerPrompts'

// ── Test Fixtures ───────────────────────────────────────────────

const lincolnSnapshot: SkillSnapshot = {
  childId: 'lincoln',
  prioritySkills: [
    {
      tag: 'reading.phonics.cvc',
      label: 'CVC blending',
      level: SkillLevel.Emerging,
      masteryGate: 1,
      notes: 'Phonics recently clicking',
    },
    {
      tag: 'math.subtraction.regroup',
      label: 'Subtraction with regrouping',
      level: SkillLevel.Developing,
    },
  ],
  supports: [
    { label: 'Visual checklist', description: 'Step-by-step visual task list' },
    { label: 'Timer', description: '5-minute work sprints with break' },
  ],
  stopRules: [
    { label: 'Frustration cap', trigger: 'Frustration > 2 min', action: 'Switch to 3 guided reps then break' },
    { label: 'Long passage', trigger: 'Reading passage > 1 page', action: 'Do first paragraph only, oral narrate rest' },
  ],
  evidenceDefinitions: [
    { label: 'CVC accuracy', description: 'Blends 3+ CVC words with <=1 error' },
  ],
}

const baseInputs: PlannerPromptInputs = {
  child: { id: 'lincoln', name: 'Lincoln', grade: '3rd' },
  weekKey: '2026-03-02',
  snapshot: lincolnSnapshot,
  assignments: [
    {
      id: 'a1',
      subjectBucket: SubjectBucket.Math,
      workbookName: 'Saxon Math 3',
      lessonName: 'Lesson 45',
      pageRange: 'pp. 89–91',
      estimatedMinutes: 20,
      difficultyCues: ['multi-step word problems'],
      action: AssignmentAction.Keep,
    },
    {
      id: 'a2',
      subjectBucket: SubjectBucket.Reading,
      workbookName: 'Explode the Code 3',
      lessonName: 'Lesson 12',
      estimatedMinutes: 15,
      difficultyCues: [],
      action: AssignmentAction.Keep,
    },
  ],
  appBlocks: [
    { label: 'Reading Eggs', defaultMinutes: 15, notes: 'Independent iPad time' },
    { label: 'Formation', defaultMinutes: 10 },
  ],
  hoursPerDay: 2.5,
  energyLevel: EnergyLevel.Normal,
  paceData: [
    {
      workbookName: 'Saxon Math 3',
      requiredPerWeek: 5,
      plannedPerWeek: 4,
      delta: -1,
      status: PaceStatus.Behind,
      suggestion: 'Behind by ~1 lesson/week. Sprint Mon/Tue or skip review sets.',
      projectedFinishDate: '2026-06-15',
      bufferDays: 3,
    },
  ],
}

const minimalInputs: PlannerPromptInputs = {
  child: { id: 'london', name: 'London' },
  weekKey: '2026-03-02',
  snapshot: null,
  assignments: [],
  appBlocks: [],
  hoursPerDay: 2,
}

// ── Formatting Helper Tests ─────────────────────────────────────

describe('formatSkillsForPrompt', () => {
  it('returns placeholder for empty skills', () => {
    expect(formatSkillsForPrompt([])).toBe('No priority skills defined.')
  })

  it('formats skills with all fields', () => {
    const result = formatSkillsForPrompt(lincolnSnapshot.prioritySkills)
    expect(result).toContain('CVC blending [reading.phonics.cvc]: level=emerging')
    expect(result).toContain('mastery gate: 1')
    expect(result).toContain('Phonics recently clicking')
    expect(result).toContain('Subtraction with regrouping')
  })

  it('omits mastery gate when undefined', () => {
    const skills: PrioritySkill[] = [
      { tag: 'math.addition', label: 'Addition', level: SkillLevel.Secure },
    ]
    const result = formatSkillsForPrompt(skills)
    expect(result).not.toContain('mastery gate')
  })
})

describe('formatSupportsForPrompt', () => {
  it('returns placeholder for empty supports', () => {
    expect(formatSupportsForPrompt([])).toBe('No default supports.')
  })

  it('formats supports', () => {
    const supports: SupportDefault[] = [
      { label: 'Timer', description: '5-min sprints' },
    ]
    const result = formatSupportsForPrompt(supports)
    expect(result).toBe('- Timer: 5-min sprints')
  })
})

describe('formatStopRulesForPrompt', () => {
  it('returns placeholder for empty rules', () => {
    expect(formatStopRulesForPrompt([])).toBe('No stop rules.')
  })

  it('formats stop rules', () => {
    const rules: StopRule[] = [
      { label: 'Cap', trigger: 'frustration > 2 min', action: 'guided reps' },
    ]
    const result = formatStopRulesForPrompt(rules)
    expect(result).toBe('- Cap: when "frustration > 2 min" → guided reps')
  })
})

describe('formatAssignmentsForPrompt', () => {
  it('returns placeholder for empty assignments', () => {
    expect(formatAssignmentsForPrompt([])).toBe('No assignments provided.')
  })

  it('formats assignments with all fields', () => {
    const result = formatAssignmentsForPrompt(baseInputs.assignments)
    expect(result).toContain('[a1] Saxon Math 3 – Lesson 45 (pp. 89–91)')
    expect(result).toContain('Math, ~20m, action=keep')
    expect(result).toContain('[cues: multi-step word problems]')
    expect(result).toContain('[a2] Explode the Code 3 – Lesson 12')
    expect(result).not.toContain('[a2].*cues') // a2 has no cues
  })
})

describe('formatAppBlocksForPrompt', () => {
  it('returns placeholder for empty blocks', () => {
    expect(formatAppBlocksForPrompt([])).toBe('No fixed app blocks.')
  })

  it('formats blocks with notes', () => {
    const result = formatAppBlocksForPrompt(baseInputs.appBlocks)
    expect(result).toContain('Reading Eggs: 15m/day (Independent iPad time)')
    expect(result).toContain('Formation: 10m/day')
  })
})

describe('formatPaceDataForPrompt', () => {
  it('returns placeholder for empty data', () => {
    expect(formatPaceDataForPrompt([])).toBe('No pace data available.')
  })

  it('formats pace data', () => {
    const result = formatPaceDataForPrompt(baseInputs.paceData!)
    expect(result).toContain('Saxon Math 3: status=behind')
    expect(result).toContain('4/5 per week (delta -1)')
    expect(result).toContain('Sprint Mon/Tue')
  })
})

// ── Section Builder Tests ───────────────────────────────────────

describe('buildChildContextSection', () => {
  it('includes child name, grade, week, and hours', () => {
    const section = buildChildContextSection(baseInputs)
    expect(section).toContain('Child: Lincoln')
    expect(section).toContain('Grade: 3rd')
    expect(section).toContain('Week: 2026-03-02')
    expect(section).toContain('Available hours/day: 2.5 (150m)')
  })

  it('omits grade when undefined', () => {
    const section = buildChildContextSection(minimalInputs)
    expect(section).toContain('Child: London')
    expect(section).not.toContain('Grade:')
  })

  it('includes energy level only when non-normal', () => {
    const section = buildChildContextSection(baseInputs)
    expect(section).not.toContain('Energy level:')

    const lowEnergy = buildChildContextSection({
      ...baseInputs,
      energyLevel: EnergyLevel.Low,
    })
    expect(lowEnergy).toContain('Energy level: low')
  })
})

describe('buildSkillSnapshotSection', () => {
  it('returns fallback for null snapshot', () => {
    const section = buildSkillSnapshotSection(null)
    expect(section).toContain('No skill snapshot available')
    expect(section).toContain('generic scheduling defaults')
  })

  it('includes all subsections', () => {
    const section = buildSkillSnapshotSection(lincolnSnapshot)
    expect(section).toContain('## Skill Snapshot')
    expect(section).toContain('### Priority Skills')
    expect(section).toContain('CVC blending')
    expect(section).toContain('### Default Supports')
    expect(section).toContain('Visual checklist')
    expect(section).toContain('### Stop Rules')
    expect(section).toContain('Frustration cap')
  })
})

describe('buildSessionContextSection', () => {
  it('includes pace data', () => {
    const section = buildSessionContextSection(baseInputs)
    expect(section).toContain('## Session Context')
    expect(section).toContain('### Pace Data')
    expect(section).toContain('Saxon Math 3')
  })

  it('shows fallback when no context available', () => {
    const section = buildSessionContextSection(minimalInputs)
    expect(section).toContain('No session history or pace data')
  })
})

describe('buildAssignmentsSection', () => {
  it('includes assignments and app blocks', () => {
    const section = buildAssignmentsSection(baseInputs)
    expect(section).toContain('## Assignments')
    expect(section).toContain('### Assignment Candidates')
    expect(section).toContain('Saxon Math 3')
    expect(section).toContain('### Fixed App Blocks (daily)')
    expect(section).toContain('Reading Eggs')
  })
})

describe('buildOutputSchemaSection', () => {
  it('includes schema and instruction', () => {
    const section = buildOutputSchemaSection()
    expect(section).toContain('## Output Format')
    expect(section).toContain('valid JSON')
    expect(section).toContain('"days"')
    expect(section).toContain('"minimumWin"')
  })
})

// ── Full System Prompt Tests ────────────────────────────────────

describe('buildPlannerSystemPrompt', () => {
  it('assembles all required context sections', () => {
    const prompt = buildPlannerSystemPrompt(baseInputs)

    // Charter preamble
    expect(prompt).toContain('Formation first')
    expect(prompt).toContain('split-block scheduling')

    // Task instructions
    expect(prompt).toContain('generating a weekly plan')
    expect(prompt).toContain('Time budgets')
    expect(prompt).toContain('Stop rules')

    // Child context
    expect(prompt).toContain('Child: Lincoln')
    expect(prompt).toContain('Grade: 3rd')

    // Skill snapshot
    expect(prompt).toContain('CVC blending')
    expect(prompt).toContain('Frustration cap')
    expect(prompt).toContain('Visual checklist')

    // Session context
    expect(prompt).toContain('Saxon Math 3: status=behind')

    // Assignments
    expect(prompt).toContain('Saxon Math 3 – Lesson 45')
    expect(prompt).toContain('Reading Eggs')

    // Output schema
    expect(prompt).toContain('"days"')
    expect(prompt).toContain('"minimumWin"')
  })

  it('handles minimal inputs gracefully', () => {
    const prompt = buildPlannerSystemPrompt(minimalInputs)

    expect(prompt).toContain('Formation first')
    expect(prompt).toContain('Child: London')
    expect(prompt).toContain('No skill snapshot available')
    expect(prompt).toContain('No session history or pace data')
    expect(prompt).toContain('No assignments provided')
    expect(prompt).toContain('"days"')
  })

  it('snapshot matches for full prompt', () => {
    const prompt = buildPlannerSystemPrompt(baseInputs)
    expect(prompt).toMatchSnapshot()
  })

  it('snapshot matches for minimal prompt', () => {
    const prompt = buildPlannerSystemPrompt(minimalInputs)
    expect(prompt).toMatchSnapshot()
  })
})

// ── User Message Tests ──────────────────────────────────────────

describe('buildPlannerUserMessage', () => {
  it('generates message with assignment and block counts', () => {
    const msg = buildPlannerUserMessage(baseInputs)
    expect(msg).toContain('Lincoln')
    expect(msg).toContain('2026-03-02')
    expect(msg).toContain('2 assignment(s)')
    expect(msg).toContain('2 app block(s)')
    expect(msg).toContain('150-minute')
    expect(msg).toContain('Return JSON only')
  })

  it('adds low-energy note', () => {
    const msg = buildPlannerUserMessage({ ...baseInputs, energyLevel: EnergyLevel.Low })
    expect(msg).toContain('Energy is low')
    expect(msg).toContain('lighter loads')
  })

  it('adds overwhelmed note with MVD items', () => {
    const msg = buildPlannerUserMessage({ ...baseInputs, energyLevel: EnergyLevel.Overwhelmed })
    expect(msg).toContain('overwhelmed')
    expect(msg).toContain('minimum viable day')
  })

  it('has no energy note for normal energy', () => {
    const msg = buildPlannerUserMessage(baseInputs)
    expect(msg).not.toContain('Energy is low')
    expect(msg).not.toContain('overwhelmed')
  })
})

// ── Constant Stability Tests ────────────────────────────────────

describe('prompt constants', () => {
  it('charter preamble snapshot', () => {
    expect(CHARTER_PREAMBLE).toMatchSnapshot()
  })

  it('task instructions snapshot', () => {
    expect(PLANNER_TASK_INSTRUCTIONS).toMatchSnapshot()
  })

  it('output schema snapshot', () => {
    expect(DRAFT_WEEKLY_PLAN_SCHEMA).toMatchSnapshot()
  })
})
