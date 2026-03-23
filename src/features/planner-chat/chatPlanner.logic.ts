import type {
  AppBlock,
  AssignmentCandidate,
  DraftDayPlan,
  DraftPlanItem,
  DraftWeeklyPlan,
  SkillSnapshot,
  SkipSuggestion,
} from '../../core/types'
import type { ChatResponse } from '../../core/ai/useAI'
import { AssignmentAction, SubjectBucket } from '../../core/types/enums'
import { autoSuggestTags } from '../../core/types/skillTags'

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const
export type WeekDay = (typeof WEEK_DAYS)[number]

let _nextId = 1
export function generateItemId(): string {
  return `ci_${Date.now()}_${_nextId++}`
}

/** Reset the ID counter (for testing) */
export function resetIdCounter(): void {
  _nextId = 1
}

export interface PlanGeneratorInputs {
  snapshot: SkillSnapshot | null
  hoursPerDay: number
  appBlocks: AppBlock[]
  assignments: AssignmentCandidate[]
  adjustments?: AdjustmentIntent[]
  /** Daily routine text from Shelly's setup (activities + times) */
  dailyRoutine?: string
  /** Per-subject default minutes (e.g., { Reading: 25, Math: 30 }) */
  subjectTimeDefaults?: Record<string, number>
}

// ── Adjustment Intents ─────────────────────────────────────────

export const AdjustmentType = {
  LightenDay: 'lighten_day',
  MoveSubject: 'move_subject',
  ReduceSubject: 'reduce_subject',
  CapSubjectTime: 'cap_subject_time',
} as const
export type AdjustmentType = (typeof AdjustmentType)[keyof typeof AdjustmentType]

export interface LightenDayIntent {
  type: typeof AdjustmentType.LightenDay
  day: WeekDay
}

export interface MoveSubjectIntent {
  type: typeof AdjustmentType.MoveSubject
  subject: SubjectBucket
  toDays: WeekDay[]
}

export interface ReduceSubjectIntent {
  type: typeof AdjustmentType.ReduceSubject
  subject: SubjectBucket
  /** Reduction factor, e.g. 0.5 means halve the time */
  factor: number
}

export interface CapSubjectTimeIntent {
  type: typeof AdjustmentType.CapSubjectTime
  subject: SubjectBucket
  maxMinutesPerDay: number
}

export type AdjustmentIntent =
  | LightenDayIntent
  | MoveSubjectIntent
  | ReduceSubjectIntent
  | CapSubjectTimeIntent

// ── Minimum Win Generator ──────────────────────────────────────

export function buildMinimumWinText(snapshot: SkillSnapshot | null): string {
  if (!snapshot || snapshot.prioritySkills.length === 0) {
    return 'Complete daily assignments within time budget.'
  }
  const parts = snapshot.prioritySkills.map((skill) => {
    if (skill.level === 'emerging') {
      return `${skill.label}: daily micro reps (5-8 min)`
    }
    if (skill.level === 'developing' || skill.level === 'supported') {
      return `${skill.label}: 3x/week practice`
    }
    return `${skill.label}: maintain with regular practice`
  })
  return parts.join('; ') + '.'
}

// ── Snapshot Application ───────────────────────────────────────

export function applySnapshotSuggestions(
  assignments: AssignmentCandidate[],
  snapshot: SkillSnapshot | null,
): { assignments: AssignmentCandidate[]; skipSuggestions: SkipSuggestion[] } {
  if (!snapshot || snapshot.prioritySkills.length === 0) {
    return { assignments, skipSuggestions: [] }
  }
  const skipSuggestions: SkipSuggestion[] = []
  const processed = assignments.map((assignment) => {
    // Check stop rules
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
        skipSuggestions.push(suggestion)
        return { ...assignment, action: AssignmentAction.Modify, skipSuggestion: suggestion }
      }
    }
    // Long task check
    if (assignment.estimatedMinutes > 20) {
      const suggestion: SkipSuggestion = {
        action: 'modify',
        reason: 'Long task may exceed attention window',
        replacement: 'Do odds only or first half, then 2-min review',
        evidence: 'Completes modified set with acceptable accuracy',
      }
      skipSuggestions.push(suggestion)
      return { ...assignment, action: AssignmentAction.Modify, skipSuggestion: suggestion }
    }
    return assignment
  })
  return { assignments: processed, skipSuggestions }
}

// ── Core Draft Plan Generator ──────────────────────────────────

export function generateDraftPlanFromInputs(inputs: PlanGeneratorInputs): DraftWeeklyPlan {
  const { snapshot, hoursPerDay, appBlocks, assignments, adjustments = [], dailyRoutine, subjectTimeDefaults } = inputs
  const minutesPerDay = hoursPerDay * 60

  // Apply snapshot suggestions
  const { assignments: processed, skipSuggestions } = applySnapshotSuggestions(assignments, snapshot)

  // ── Parse daily routine into plan items ──
  const routineItems: DraftPlanItem[] = []
  if (dailyRoutine) {
    const lines = dailyRoutine.split('\n').filter(l => l.trim())
    for (const line of lines) {
      // Parse format: "Activity name — 20 min — Subject" or "Activity name (20 min) — Subject"
      const dashMatch = line.match(/^(.+?)\s*[—–-]\s*(\d+)\s*min\s*(?:[—–-]\s*(.+?))?(?:\s*[—–-]\s*(.+?))?$/)
      const parenMatch = line.match(/^(.+?)\s*\((\d+)\s*min\)\s*(?:[—–-]\s*(.+?))?$/)

      const match = dashMatch || parenMatch
      if (!match) continue

      const name = match[1].trim()
      const minutes = parseInt(match[2])
      // Try to find subject from remaining parts
      let subject: SubjectBucket = SubjectBucket.Other
      const remaining = [match[3], match[4]].filter(Boolean).join(' ').trim().toLowerCase()

      if (remaining.includes('reading') || remaining.includes('phonics')) subject = SubjectBucket.Reading
      else if (remaining.includes('math')) subject = SubjectBucket.Math
      else if (remaining.includes('language') || remaining.includes('handwriting') || remaining.includes('writing')) subject = SubjectBucket.LanguageArts
      else if (remaining.includes('science')) subject = SubjectBucket.Science
      else if (remaining.includes('social')) subject = SubjectBucket.SocialStudies
      else subject = guessSubjectFromTitle(name)

      // Check if this is an app block
      const isApp = remaining.includes('app') || remaining.includes('tablet') ||
                     name.toLowerCase().includes('reading eggs') || name.toLowerCase().includes('math app')

      routineItems.push({
        id: generateItemId(),
        title: name,
        subjectBucket: subject,
        estimatedMinutes: minutes,
        skillTags: [],
        isAppBlock: isApp,
        accepted: true,
        category: 'must-do',
        mvdEssential: minutes >= 15,
      })
    }
  }

  // Initialize day plans
  const dayMap = new Map<WeekDay, DraftDayPlan>()
  const routineMinutesPerDay = routineItems.reduce((sum, item) => sum + item.estimatedMinutes, 0)
  const appMinutesPerDay = appBlocks.reduce((sum, b) => sum + b.defaultMinutes, 0)

  for (const day of WEEK_DAYS) {
    const dayItems: DraftPlanItem[] = []

    if (routineItems.length > 0) {
      // Use routine items as the base — give each a fresh ID per day
      for (const item of routineItems) {
        dayItems.push({ ...item, id: generateItemId() })
      }
      // Add app blocks that aren't already covered by routine
      for (const block of appBlocks) {
        const alreadyInRoutine = routineItems.some(r =>
          r.title.toLowerCase().includes(block.label.toLowerCase()) ||
          block.label.toLowerCase().includes(r.title.toLowerCase())
        )
        if (!alreadyInRoutine) {
          dayItems.push({
            id: generateItemId(),
            title: block.label,
            subjectBucket: SubjectBucket.Other,
            estimatedMinutes: block.defaultMinutes,
            skillTags: [],
            isAppBlock: true,
            accepted: true,
            category: 'choose',
          })
        }
      }
    } else {
      // No routine — fall back to app blocks only (old behavior)
      const appItems: DraftPlanItem[] = appBlocks.map((block) => ({
        id: generateItemId(),
        title: block.label,
        subjectBucket: SubjectBucket.Other,
        estimatedMinutes: block.defaultMinutes,
        skillTags: [],
        isAppBlock: true,
        accepted: true,
      }))
      dayItems.push(...appItems)
    }

    dayMap.set(day, {
      day,
      timeBudgetMinutes: minutesPerDay,
      items: dayItems,
    })
  }

  const remainingPerDay = Math.max(0, minutesPerDay - (routineItems.length > 0 ? routineMinutesPerDay : appMinutesPerDay))

  // Distribute active assignments across days (greedy: fill least-loaded day)
  const activeAssignments = processed.filter(
    (a) => a.action === AssignmentAction.Keep || a.action === AssignmentAction.Modify,
  )

  const dayBudgets = new Map<WeekDay, number>()
  for (const day of WEEK_DAYS) {
    dayBudgets.set(day, remainingPerDay)
  }

  // Add skill-priority items (daily micro reps for emerging skills)
  if (snapshot) {
    for (const skill of snapshot.prioritySkills) {
      if (skill.level === 'emerging') {
        // Daily micro reps for emerging skills
        for (const day of WEEK_DAYS) {
          const dayPlan = dayMap.get(day)!
          const item: DraftPlanItem = {
            id: generateItemId(),
            title: `${skill.label} (micro rep)`,
            subjectBucket: skillTagToSubject(skill.tag),
            estimatedMinutes: 8,
            skillTags: [skill.tag],
            accepted: true,
          }
          dayPlan.items.push(item)
          dayBudgets.set(day, dayBudgets.get(day)! - 8)
        }
      } else if (skill.level === 'developing' || skill.level === 'supported') {
        // 3x/week for developing/supported
        const targetDays: WeekDay[] = ['Monday', 'Wednesday', 'Friday']
        for (const day of targetDays) {
          const dayPlan = dayMap.get(day)!
          const item: DraftPlanItem = {
            id: generateItemId(),
            title: `${skill.label} practice`,
            subjectBucket: skillTagToSubject(skill.tag),
            estimatedMinutes: 15,
            skillTags: [skill.tag],
            accepted: true,
          }
          dayPlan.items.push(item)
          dayBudgets.set(day, dayBudgets.get(day)! - 15)
        }
      }
    }
  }

  // Build priority tag list for auto-suggest
  const prioritySkillTags = snapshot?.prioritySkills.map((s) => s.tag) ?? []

  // Distribute remaining assignments
  for (const assignment of activeAssignments) {
    // Use subject time defaults as baseline, fall back to assignment's own estimate
    const baseMinutes = subjectTimeDefaults?.[assignment.subjectBucket] ?? assignment.estimatedMinutes
    const effectiveMinutes =
      assignment.action === AssignmentAction.Modify
        ? Math.ceil(baseMinutes * 0.6)
        : baseMinutes

    // Find day with most remaining budget
    let bestDay: WeekDay = WEEK_DAYS[0]
    let bestBudget = dayBudgets.get(WEEK_DAYS[0])!
    for (const day of WEEK_DAYS) {
      const budget = dayBudgets.get(day)!
      if (budget > bestBudget) {
        bestDay = day
        bestBudget = budget
      }
    }

    // Auto-suggest skill tags based on subject + priority skills
    const suggestedTags = autoSuggestTags(assignment.subjectBucket, prioritySkillTags)

    const dayPlan = dayMap.get(bestDay)!
    dayPlan.items.push({
      id: generateItemId(),
      title: `${assignment.workbookName} – ${assignment.lessonName}`,
      subjectBucket: assignment.subjectBucket,
      estimatedMinutes: effectiveMinutes,
      skillTags: suggestedTags,
      skipSuggestion: assignment.skipSuggestion,
      accepted: true,
      assignmentId: assignment.id,
    })
    dayBudgets.set(bestDay, dayBudgets.get(bestDay)! - effectiveMinutes)
  }

  // Apply adjustments
  const days = Array.from(dayMap.values())
  applyAdjustments(days, adjustments)

  return {
    days,
    skipSuggestions,
    minimumWin: buildMinimumWinText(snapshot),
  }
}

// ── Adjustment Application ─────────────────────────────────────

function applyAdjustments(days: DraftDayPlan[], adjustments: AdjustmentIntent[]): void {
  for (const adj of adjustments) {
    switch (adj.type) {
      case AdjustmentType.LightenDay:
        applyLightenDay(days, adj)
        break
      case AdjustmentType.MoveSubject:
        applyMoveSubject(days, adj)
        break
      case AdjustmentType.ReduceSubject:
        applyReduceSubject(days, adj)
        break
      case AdjustmentType.CapSubjectTime:
        applyCapSubjectTime(days, adj)
        break
    }
  }
}

function applyLightenDay(days: DraftDayPlan[], intent: LightenDayIntent): void {
  const targetDay = days.find((d) => d.day === intent.day)
  if (!targetDay) return

  // Non-essential = not an app block AND not a generated priority-skill item (has assignmentId)
  // Priority-skill micro-reps (no assignmentId, not app blocks) are protected.
  const nonEssential = targetDay.items.filter(
    (item) => !item.isAppBlock && item.assignmentId != null,
  )
  for (const item of nonEssential) {
    item.estimatedMinutes = Math.ceil(item.estimatedMinutes * 0.5)
  }
  // Remove up to half of non-essential items if still heavy
  const totalMin = dayTotalMinutes(targetDay)
  if (totalMin > targetDay.timeBudgetMinutes) {
    const toRemove = nonEssential.slice(0, Math.ceil(nonEssential.length / 2))
    for (const item of toRemove) {
      item.accepted = false
    }
  }
}

function applyMoveSubject(days: DraftDayPlan[], intent: MoveSubjectIntent): void {
  // Remove subject from all days except target days
  for (const day of days) {
    if (!intent.toDays.includes(day.day as WeekDay)) {
      for (const item of day.items) {
        if (item.subjectBucket === intent.subject && !item.isAppBlock) {
          item.accepted = false
        }
      }
    }
  }

  // Ensure subject is present on target days (re-enable if disabled)
  for (const day of days) {
    if (intent.toDays.includes(day.day as WeekDay)) {
      for (const item of day.items) {
        if (item.subjectBucket === intent.subject) {
          item.accepted = true
        }
      }
    }
  }
}

function applyReduceSubject(days: DraftDayPlan[], intent: ReduceSubjectIntent): void {
  for (const day of days) {
    for (const item of day.items) {
      if (item.subjectBucket === intent.subject && !item.isAppBlock) {
        item.estimatedMinutes = Math.ceil(item.estimatedMinutes * intent.factor)
      }
    }
  }
}

function applyCapSubjectTime(days: DraftDayPlan[], intent: CapSubjectTimeIntent): void {
  for (const day of days) {
    for (const item of day.items) {
      if (item.subjectBucket === intent.subject && !item.isAppBlock) {
        if (item.estimatedMinutes > intent.maxMinutesPerDay) {
          item.estimatedMinutes = intent.maxMinutesPerDay
        }
      }
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────

export function dayTotalMinutes(day: DraftDayPlan): number {
  return day.items
    .filter((item) => item.accepted)
    .reduce((sum, item) => sum + item.estimatedMinutes, 0)
}

export function planTotalMinutes(plan: DraftWeeklyPlan): number {
  return plan.days.reduce((sum, day) => sum + dayTotalMinutes(day), 0)
}

function skillTagToSubject(tag: string): SubjectBucket {
  const lower = tag.toLowerCase()
  if (lower.startsWith('reading') || lower.startsWith('phonics')) return SubjectBucket.Reading
  if (lower.startsWith('math')) return SubjectBucket.Math
  if (lower.startsWith('writing') || lower.startsWith('language')) return SubjectBucket.LanguageArts
  if (lower.startsWith('science')) return SubjectBucket.Science
  if (lower.startsWith('social')) return SubjectBucket.SocialStudies
  return SubjectBucket.Other
}

// ── AI-Powered Plan Generation ───────────────────────────────

/** Build the user message content that describes assignments and context for the LLM. */
export function buildPlannerPrompt(inputs: PlanGeneratorInputs): string {
  const { snapshot, hoursPerDay, appBlocks, assignments, adjustments = [], dailyRoutine, subjectTimeDefaults } = inputs
  const lines: string[] = []

  lines.push(`Generate a weekly school plan (Monday–Friday) with ${hoursPerDay} hours/day budget.`)
  lines.push('')

  if (subjectTimeDefaults && Object.keys(subjectTimeDefaults).length > 0) {
    lines.push('Subject time defaults (use these as the baseline for estimatedMinutes per item):')
    for (const [subject, minutes] of Object.entries(subjectTimeDefaults)) {
      const label = subject === 'Other' ? 'Formation/Prayer' : subject === 'LanguageArts' ? 'Language Arts' : subject === 'SocialStudies' ? 'Social Studies' : subject
      lines.push(`- ${label}: ${minutes} min/day`)
    }
    lines.push('')
  }

  if (dailyRoutine) {
    lines.push('IMPORTANT — Mom\'s daily routine template (use these EXACT activities and times as the base for each day):')
    lines.push(dailyRoutine)
    lines.push('')
    lines.push('Vary the specific content across days (different lessons, chapters, word lists) but keep the same activity structure and time blocks.')
    lines.push('')
  }

  if (appBlocks.length > 0) {
    lines.push('App blocks (pre-scheduled daily):')
    for (const block of appBlocks) {
      lines.push(`- ${block.label}: ${block.defaultMinutes} min/day`)
    }
    lines.push('')
  }

  if (assignments.length > 0) {
    lines.push('Workbook assignments to distribute:')
    for (const a of assignments) {
      lines.push(`- ${a.workbookName} – ${a.lessonName} (${a.subjectBucket}, ${a.estimatedMinutes} min)`)
    }
    lines.push('')
  }

  if (snapshot && snapshot.prioritySkills.length > 0) {
    lines.push('Priority skills:')
    for (const skill of snapshot.prioritySkills) {
      lines.push(`- ${skill.label} (${skill.tag}): ${skill.level}`)
    }
    lines.push('')
  }

  if (snapshot && snapshot.stopRules.length > 0) {
    lines.push('Stop rules:')
    for (const rule of snapshot.stopRules) {
      lines.push(`- ${rule.label}: when "${rule.trigger}" → ${rule.action}`)
    }
    lines.push('')
  }

  if (adjustments.length > 0) {
    lines.push('Adjustments requested:')
    for (const adj of adjustments) {
      lines.push(`- ${JSON.stringify(adj)}`)
    }
    lines.push('')
  }

  lines.push('Respond ONLY with a JSON object matching this schema (no markdown fences, no commentary):')
  lines.push(JSON.stringify({
    days: [
      {
        day: 'Monday',
        timeBudgetMinutes: 150,
        items: [
          {
            title: 'string',
            subjectBucket: 'Reading|Math|LanguageArts|Science|SocialStudies|Other',
            estimatedMinutes: 15,
            skillTags: ['optional.skill.tag'],
            isAppBlock: false,
            accepted: true,
          },
        ],
      },
    ],
    skipSuggestions: [],
    minimumWin: 'string',
  }))

  return lines.join('\n')
}

const VALID_SUBJECT_BUCKETS = new Set<string>(Object.values(SubjectBucket))

/** Extract a JSON object string from text that may contain preamble or surrounding prose. */
function extractJsonObject(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // Strip ALL markdown code fences (greedy match for large responses)
  let candidate = trimmed
  // Try greedy match first (handles complete fences)
  const greedyFence = trimmed.match(/```(?:json)?\s*\n?([\s\S]*)\n?\s*```/)
  if (greedyFence) {
    candidate = greedyFence[1].trim()
  } else {
    // No closing fence? Strip opening fence and use everything after it
    const openFence = trimmed.match(/^```(?:json)?\s*\n?/)
    if (openFence) {
      candidate = trimmed.slice(openFence[0].length).trim()
    }
  }

  // Find the outermost { ... } in the text
  const firstBrace = candidate.indexOf('{')
  if (firstBrace === -1) return null
  const lastBrace = candidate.lastIndexOf('}')
  if (lastBrace <= firstBrace) return null
  return candidate.slice(firstBrace, lastBrace + 1)
}

/**
 * Attempt to extract a "days" array from flat text when JSON parsing completely fails.
 * This is a last-resort fallback that reconstructs minimal plan data from structured text.
 */
function extractDaysFromText(text: string): DraftWeeklyPlan | null {
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const days: DraftDayPlan[] = []

  for (let i = 0; i < dayNames.length; i++) {
    const dayName = dayNames[i]
    const nextDay = dayNames[i + 1]
    // Find section for this day
    const dayRegex = new RegExp(`\\b${dayName}\\b`, 'i')
    const start = text.search(dayRegex)
    if (start === -1) continue

    const end = nextDay
      ? text.search(new RegExp(`\\b${nextDay}\\b`, 'i'))
      : text.length
    const section = text.slice(start, end === -1 ? undefined : end)

    // Extract bullet items (- or * prefixed lines)
    const itemRegex = /[-*•]\s+(.+?)(?:\s*[-–—]\s*(\d+)\s*(?:min|m)\b)?$/gm
    const items: DraftPlanItem[] = []
    let match: RegExpExecArray | null
    while ((match = itemRegex.exec(section)) !== null) {
      const title = match[1].replace(/\s*[-–—]\s*\d+\s*(?:min|m)\s*$/, '').trim()
      if (!title) continue
      items.push({
        id: generateItemId(),
        title,
        subjectBucket: guessSubjectFromTitle(title),
        estimatedMinutes: match[2] ? parseInt(match[2], 10) : 15,
        skillTags: [],
        accepted: true,
      })
    }

    if (items.length > 0) {
      days.push({ day: dayName, timeBudgetMinutes: 150, items })
    }
  }

  if (days.length === 0) return null
  return { days, skipSuggestions: [], minimumWin: 'Complete the core items for each day.' }
}

/** Best-effort subject guess from an activity title string. */
function guessSubjectFromTitle(title: string): SubjectBucket {
  const lower = title.toLowerCase()
  if (/\bread|phonics|sight\s*word|book|gatb\s*read|booster/i.test(lower)) return SubjectBucket.Reading
  if (/\bmath|number|add|subtract|multiply|gatb\s*math/i.test(lower)) return SubjectBucket.Math
  if (/\bwrit|handwrit|language\s*art|spell|grammar/i.test(lower)) return SubjectBucket.LanguageArts
  if (/\bscience|experiment|nature/i.test(lower)) return SubjectBucket.Science
  if (/\bsocial|histor|geograph/i.test(lower)) return SubjectBucket.SocialStudies
  return SubjectBucket.Other
}

/**
 * Attempt to fix common JSON issues from LLM output:
 * - Trailing commas before ] or }
 * - Single-quoted strings
 * - Truncated arrays/objects (attempt to close them)
 */
function forgivingJsonParse(text: string): Record<string, unknown> | null {
  // First try strict parse
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    // Continue to forgiving parse
  }

  let fixed = text
    // Remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, '$1')
    // Replace single-quoted string values with double-quoted (simple cases)
    .replace(/:\s*'([^']*)'/g, ': "$1"')

  // Try again after fixes
  try {
    return JSON.parse(fixed) as Record<string, unknown>
  } catch {
    // Continue to truncation repair
  }

  // Try to repair truncated JSON by closing open brackets/braces
  let openBraces = 0
  let openBrackets = 0
  let inString = false
  let escaped = false
  for (const ch of fixed) {
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') openBraces++
    else if (ch === '}') openBraces--
    else if (ch === '[') openBrackets++
    else if (ch === ']') openBrackets--
  }

  // Close any unclosed strings, remove trailing comma, then close brackets/braces
  if (inString) fixed += '"'
  fixed = fixed.replace(/,\s*$/, '')
  while (openBrackets > 0) { fixed += ']'; openBrackets-- }
  while (openBraces > 0) { fixed += '}'; openBraces-- }

  try {
    return JSON.parse(fixed) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Parse and validate an AI response into a DraftWeeklyPlan. Returns null if malformed. */
export function parseAIResponse(response: ChatResponse): DraftWeeklyPlan | null {
  try {
    const jsonText = extractJsonObject(response.message)
    if (!jsonText) {
      console.warn('[parseAIResponse] No JSON found. Response starts with:', response.message.substring(0, 200))
      console.warn('[parseAIResponse] Response length:', response.message.length)
      // Last-resort: try to extract structured day data from free text
      return extractDaysFromText(response.message)
    }
    const parsed = forgivingJsonParse(jsonText)
    if (!parsed) {
      console.warn('[parseAIResponse] JSON parse failed. Extracted text starts with:', jsonText.substring(0, 200))
      console.warn('[parseAIResponse] Extracted text length:', jsonText.length)
      // Last-resort: try to extract structured day data from free text
      return extractDaysFromText(response.message)
    }

    // Handle wrapped structures: { plan: { days: [...] } } or { weeklyPlan: { days: [...] } }
    let planData = parsed
    if (!Array.isArray(parsed.days)) {
      for (const key of ['plan', 'weeklyPlan', 'weekly_plan', 'weekPlan']) {
        const nested = parsed[key]
        if (nested && typeof nested === 'object' && Array.isArray((nested as Record<string, unknown>).days)) {
          planData = nested as Record<string, unknown>
          break
        }
      }
    }

    if (!Array.isArray(planData.days) || planData.days.length === 0) {
      console.warn('[parseAIResponse] Missing or empty days array')
      return extractDaysFromText(response.message)
    }

    // Use planData from here on for days/minimumWin/skipSuggestions
    parsed.days = planData.days
    if (planData.minimumWin) parsed.minimumWin = planData.minimumWin
    if (planData.skipSuggestions) parsed.skipSuggestions = planData.skipSuggestions

    // minimumWin is nice-to-have, not required
    const minimumWin = typeof parsed.minimumWin === 'string'
      ? parsed.minimumWin
      : 'Complete the core items for each day.'

    const days: DraftDayPlan[] = []
    for (const rawDay of parsed.days as Array<Record<string, unknown>>) {
      const dayName = typeof rawDay.day === 'string' ? rawDay.day : String(rawDay.day ?? '')
      if (!dayName) continue // skip bad days, don't fail
      if (!Array.isArray(rawDay.items)) continue

      const items: DraftPlanItem[] = []
      for (const rawItem of rawDay.items as Array<Record<string, unknown>>) {
        const title = typeof rawItem.title === 'string' ? rawItem.title : String(rawItem.title ?? 'Activity')
        if (!title) continue // skip empty items, don't fail

        // Coerce estimatedMinutes from string to number
        const estimatedMinutes = typeof rawItem.estimatedMinutes === 'number'
          ? rawItem.estimatedMinutes
          : typeof rawItem.estimatedMinutes === 'string'
            ? parseInt(rawItem.estimatedMinutes, 10)
            : 15 // default

        if (isNaN(estimatedMinutes) || estimatedMinutes < 0) {
          console.warn('[parseAIResponse] Bad estimatedMinutes:', rawItem.estimatedMinutes, 'for', title)
          continue // skip this item, don't fail the entire plan
        }

        const subjectBucket = VALID_SUBJECT_BUCKETS.has(rawItem.subjectBucket as string)
          ? (rawItem.subjectBucket as SubjectBucket)
          : SubjectBucket.Other

        items.push({
          id: generateItemId(),
          title,
          subjectBucket,
          estimatedMinutes,
          skillTags: Array.isArray(rawItem.skillTags) ? (rawItem.skillTags as string[]).filter(Boolean) : [],
          isAppBlock: rawItem.isAppBlock === true,
          accepted: rawItem.accepted !== false,
          mvdEssential: rawItem.mvdEssential === true ? true : rawItem.category === 'must-do' ? true : undefined,
          category: rawItem.category === 'must-do' || rawItem.category === 'choose' ? rawItem.category as 'must-do' | 'choose' : undefined,
        })
      }

      days.push({
        day: dayName,
        timeBudgetMinutes: typeof rawDay.timeBudgetMinutes === 'number' ? rawDay.timeBudgetMinutes : 150,
        items,
      })
    }

    if (days.length === 0) {
      console.warn('[parseAIResponse] No valid days parsed. Raw days array length:', (planData.days as unknown[]).length)
      console.warn('[parseAIResponse] First raw day sample:', JSON.stringify((planData.days as unknown[])[0]).substring(0, 200))
      return null
    }

    const validSkipActions = new Set(['skip', 'modify'])
    const skipSuggestions: SkipSuggestion[] = Array.isArray(parsed.skipSuggestions)
      ? (parsed.skipSuggestions as Array<Record<string, unknown>>)
          .filter(
            (s) =>
              typeof s.action === 'string' &&
              validSkipActions.has(s.action as string) &&
              typeof s.reason === 'string' &&
              typeof s.replacement === 'string' &&
              typeof s.evidence === 'string',
          )
          .map((s) => ({
            action: s.action as 'skip' | 'modify',
            reason: s.reason as string,
            replacement: s.replacement as string,
            evidence: s.evidence as string,
          }))
      : []

    return { days, skipSuggestions, minimumWin }
  } catch (err) {
    console.error('[parseAIResponse] Parse error:', err, 'Raw:', response.message.substring(0, 300))
    // Last-resort: try to extract structured day data from free text
    return extractDaysFromText(response.message)
  }
}
