/**
 * Planner Prompt Assembly (T-201)
 *
 * Assembles weekly plan generation prompts from:
 * - Base system prompt (charter values)
 * - Child context (skill snapshot, supports, stop rules)
 * - Session context (pace data, energy, recent history)
 * - Assignment candidates (from planner conversation)
 * - Output schema (DraftWeeklyPlan JSON)
 */

import type {
  AppBlock,
  AssignmentCandidate,
  Child,
  PaceGaugeResult,
  PrioritySkill,
  Session,
  SkillSnapshot,
  StopRule,
  SupportDefault,
} from '../../types'
import type { EnergyLevel } from '../../types/enums'
import type { EnergyPatternResult } from '../../utils/energyPatterns'
import { formatEnergyPatternsForPrompt } from '../../utils/energyPatterns'

// ── Charter Preamble ────────────────────────────────────────────

export const CHARTER_PREAMBLE = `You are an AI assistant for the First Principles Engine, a family homeschool learning platform.

Core family values (Charter):
- Formation first: character and virtue before academics.
- Both kids count: Lincoln (10, neurodivergent, speech challenges) and London (6, story-driven).
- Narration counts: oral evidence is first-class, especially for Lincoln.
- Small artifacts > perfect documentation: capture evidence quickly.
- No heroics: simple routines, minimum viable days are real school.
- Shelly's direct attention is the primary schedulable resource — split-block scheduling is required.

Always align recommendations with these values. Be concise, practical, and encouraging.`

// ── Planner Task Instructions ───────────────────────────────────

export const PLANNER_TASK_INSTRUCTIONS = `You are generating a weekly plan for a homeschool child. Your job is to distribute assignments across the school week (Monday–Friday) while respecting:

1. **Time budgets**: Do not exceed the available hours per day.
2. **Split-block scheduling**: Shelly teaches one child at a time. Direct-instruction items should alternate with independent-work items.
3. **Stop rules**: If an assignment matches a stop-rule trigger, modify or shorten it per the rule's action.
4. **Skill priorities**: Emerging skills get daily micro reps (5–8 min). Developing/supported skills get 3×/week practice (15 min).
5. **Energy awareness**: On low-energy or overwhelmed days, reduce load — prefer minimum viable day items.
6. **Pace data**: If a workbook is behind pace, front-load new lessons Mon/Tue. If ahead, allow lighter days.
7. **App blocks**: These are fixed daily items (e.g., Reading Eggs) that must appear every day.

Your output must be valid JSON matching the DraftWeeklyPlan schema.`

// ── Output Schema ───────────────────────────────────────────────

export const DRAFT_WEEKLY_PLAN_SCHEMA = `{
  "days": [
    {
      "day": "Monday",
      "timeBudgetMinutes": 150,
      "items": [
        {
          "id": "string",
          "title": "string",
          "subjectBucket": "Reading | LanguageArts | Math | Science | SocialStudies | Other",
          "estimatedMinutes": 15,
          "skillTags": ["reading.phonics.cvc"],
          "ladderRef": { "ladderId": "string", "rungId": "string" },
          "isAppBlock": false,
          "skipSuggestion": {
            "action": "skip | modify",
            "reason": "string",
            "replacement": "string",
            "evidence": "string"
          },
          "accepted": true,
          "assignmentId": "string"
        }
      ]
    }
  ],
  "skipSuggestions": [],
  "minimumWin": "string — one sentence describing the minimum viable outcome for the week"
}`

// ── Input Types ─────────────────────────────────────────────────

export interface PlannerPromptInputs {
  child: Pick<Child, 'id' | 'name' | 'grade'>
  weekKey: string
  snapshot: SkillSnapshot | null
  assignments: AssignmentCandidate[]
  appBlocks: AppBlock[]
  hoursPerDay: number
  energyLevel?: EnergyLevel
  paceData?: PaceGaugeResult[]
  recentSessions?: Pick<Session, 'date' | 'streamId' | 'result' | 'notes'>[]
  energyPatterns?: EnergyPatternResult
}

// ── Formatting Helpers ──────────────────────────────────────────

export function formatSkillsForPrompt(skills: PrioritySkill[]): string {
  if (skills.length === 0) return 'No priority skills defined.'
  return skills
    .map((s) => {
      const gate = s.masteryGate !== undefined ? ` (mastery gate: ${s.masteryGate})` : ''
      const notes = s.notes ? ` — ${s.notes}` : ''
      return `- ${s.label} [${s.tag}]: level=${s.level}${gate}${notes}`
    })
    .join('\n')
}

export function formatSupportsForPrompt(supports: SupportDefault[]): string {
  if (supports.length === 0) return 'No default supports.'
  return supports.map((s) => `- ${s.label}: ${s.description}`).join('\n')
}

export function formatStopRulesForPrompt(rules: StopRule[]): string {
  if (rules.length === 0) return 'No stop rules.'
  return rules.map((r) => `- ${r.label}: when "${r.trigger}" → ${r.action}`).join('\n')
}

export function formatAssignmentsForPrompt(assignments: AssignmentCandidate[]): string {
  if (assignments.length === 0) return 'No assignments provided.'
  return assignments
    .map((a) => {
      const cues = a.difficultyCues.length > 0 ? ` [cues: ${a.difficultyCues.join(', ')}]` : ''
      const pages = a.pageRange ? ` (${a.pageRange})` : ''
      return `- [${a.id}] ${a.workbookName} – ${a.lessonName}${pages}: ${a.subjectBucket}, ~${a.estimatedMinutes}m, action=${a.action}${cues}`
    })
    .join('\n')
}

export function formatAppBlocksForPrompt(appBlocks: AppBlock[]): string {
  if (appBlocks.length === 0) return 'No fixed app blocks.'
  return appBlocks
    .map((b) => {
      const notes = b.notes ? ` (${b.notes})` : ''
      return `- ${b.label}: ${b.defaultMinutes}m/day${notes}`
    })
    .join('\n')
}

export function formatPaceDataForPrompt(paceData: PaceGaugeResult[]): string {
  if (paceData.length === 0) return 'No pace data available.'
  return paceData
    .map(
      (p) =>
        `- ${p.workbookName}: status=${p.status}, ${p.plannedPerWeek}/${p.requiredPerWeek} per week (delta ${p.delta > 0 ? '+' : ''}${p.delta}). ${p.suggestion}`,
    )
    .join('\n')
}

export function formatRecentSessionsForPrompt(
  sessions: Pick<Session, 'date' | 'streamId' | 'result' | 'notes'>[],
): string {
  if (sessions.length === 0) return 'No recent sessions.'
  return sessions
    .map((s) => {
      const notes = s.notes ? ` — ${s.notes}` : ''
      return `- ${s.date} ${s.streamId}: ${s.result}${notes}`
    })
    .join('\n')
}

// ── Section Builders ────────────────────────────────────────────

export function buildChildContextSection(inputs: PlannerPromptInputs): string {
  const lines: string[] = [
    '## Child Context',
    '',
    `Child: ${inputs.child.name}`,
  ]

  if (inputs.child.grade) {
    lines.push(`Grade: ${inputs.child.grade}`)
  }

  lines.push(`Week: ${inputs.weekKey}`)
  lines.push(`Available hours/day: ${inputs.hoursPerDay} (${inputs.hoursPerDay * 60}m)`)

  if (inputs.energyLevel && inputs.energyLevel !== 'normal') {
    lines.push(`Energy level: ${inputs.energyLevel}`)
  }

  return lines.join('\n')
}

export function buildSkillSnapshotSection(snapshot: SkillSnapshot | null): string {
  if (!snapshot) {
    return '## Skill Snapshot\n\nNo skill snapshot available. Use generic scheduling defaults.'
  }

  const lines: string[] = [
    '## Skill Snapshot',
    '',
    '### Priority Skills',
    formatSkillsForPrompt(snapshot.prioritySkills),
    '',
    '### Default Supports',
    formatSupportsForPrompt(snapshot.supports),
    '',
    '### Stop Rules',
    formatStopRulesForPrompt(snapshot.stopRules),
  ]

  return lines.join('\n')
}

export function buildSessionContextSection(inputs: PlannerPromptInputs): string {
  const lines: string[] = ['## Session Context']

  if (inputs.paceData && inputs.paceData.length > 0) {
    lines.push('', '### Pace Data', formatPaceDataForPrompt(inputs.paceData))
  }

  if (inputs.recentSessions && inputs.recentSessions.length > 0) {
    lines.push('', '### Recent Sessions', formatRecentSessionsForPrompt(inputs.recentSessions))
  }

  if (lines.length === 1) {
    lines.push('', 'No session history or pace data available.')
  }

  return lines.join('\n')
}

export function buildAssignmentsSection(inputs: PlannerPromptInputs): string {
  const lines: string[] = [
    '## Assignments',
    '',
    '### Assignment Candidates',
    formatAssignmentsForPrompt(inputs.assignments),
    '',
    '### Fixed App Blocks (daily)',
    formatAppBlocksForPrompt(inputs.appBlocks),
  ]

  return lines.join('\n')
}

export function buildOutputSchemaSection(): string {
  return [
    '## Output Format',
    '',
    'Respond with ONLY valid JSON matching this schema (no markdown fences, no commentary):',
    '',
    DRAFT_WEEKLY_PLAN_SCHEMA,
  ].join('\n')
}

// ── Main Prompt Assembly ────────────────────────────────────────

export function buildPlannerSystemPrompt(inputs: PlannerPromptInputs): string {
  const sections = [
    CHARTER_PREAMBLE,
    '',
    PLANNER_TASK_INSTRUCTIONS,
    '',
    buildChildContextSection(inputs),
    '',
    buildSkillSnapshotSection(inputs.snapshot),
    '',
    buildSessionContextSection(inputs),
  ]

  if (inputs.energyPatterns) {
    sections.push('', formatEnergyPatternsForPrompt(inputs.energyPatterns))
  }

  sections.push(
    '',
    buildAssignmentsSection(inputs),
    '',
    buildOutputSchemaSection(),
  )

  return sections.join('\n')
}

/**
 * Build the user message that kicks off plan generation.
 * This is the message sent alongside the system prompt.
 */
export function buildPlannerUserMessage(inputs: PlannerPromptInputs): string {
  const energyNote =
    inputs.energyLevel === 'low'
      ? ' Energy is low today — prefer lighter loads and minimum viable day items.'
      : inputs.energyLevel === 'overwhelmed'
        ? ' Family is overwhelmed — generate a minimum viable day plan only (Prayer/Scripture + read aloud + math practice + project/life-skills + one-sentence reflection).'
        : ''

  return `Generate a weekly plan for ${inputs.child.name} for the week of ${inputs.weekKey}.${energyNote} Distribute the ${inputs.assignments.length} assignment(s) and ${inputs.appBlocks.length} app block(s) across Monday–Friday within the ${inputs.hoursPerDay * 60}-minute daily budget. Return JSON only.`
}
