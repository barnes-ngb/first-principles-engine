import type {
  ActivityConfig,
  AppBlock,
  AssignmentCandidate,
  DraftDayPlan,
  DraftPlanItem,
  DraftWeeklyPlan,
  SkillSnapshot,
  SkipSuggestion,
  WeekPlan,
} from '../../core/types'
import type { ChatResponse } from '../../core/ai/useAI'
import { AssignmentAction, MasteryGate, MasteryGateLabel, SubjectBucket } from '../../core/types/enums'
import { ALL_SKILL_TAGS, SKILL_TAG_MAP, suggestTagsForSubject } from '../../core/types/skillTags'
import { formatDateYmd, parseDateYmd } from '../../core/utils/format'
import { getEffectiveMasteryGate } from './skipAdvisor.logic'

/** Default app blocks that run "on rails" */
export const defaultAppBlocks: AppBlock[] = [
  { label: 'Reading Eggs', defaultMinutes: 15 },
  { label: 'Math app / Typing', defaultMinutes: 15 },
]

/**
 * Shelly's real daily routine template — used as default when no custom routine is set.
 * Each line is an activity with approximate time and curriculum source.
 */
export const defaultDailyRoutine = `Handwriting (while read-aloud) — 20 min — LanguageArts
Booster cards — 15 min — Reading
Good and the Beautiful reading — 30 min — GATB — Reading
Sight word games — 15 min — Reading
Memory card — 10 min — Reading
Language arts workbook — 20 min — LanguageArts
Reading Eggs (tablet) — 45 min — Reading Eggs (app) — Reading
Good and the Beautiful Math — 30 min — GATB — Math`

/**
 * Convert activity configs to a routine text string suitable for the local plan generator.
 * This replaces the old free-text dailyRoutine with structured data from activityConfigs.
 * Only includes non-completed configs, sorted by sortOrder.
 */
export function activityConfigsToRoutineText(configs: ActivityConfig[]): string {
  const active = configs
    .filter((c) => !c.completed)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  if (active.length === 0) return ''

  return active
    .map((c) => {
      let line = `${c.name} — ${c.defaultMinutes} min — ${c.subjectBucket}`
      if (c.currentPosition && c.totalUnits) {
        line += ` (at ${c.unitLabel || 'lesson'} ${c.currentPosition} of ${c.totalUnits})`
      }
      return line
    })
    .join('\n')
}

/** Parse a routine string and return total minutes per day. */
export function parseRoutineTotalMinutes(routine: string): number {
  if (!routine) return 0
  let total = 0
  for (const line of routine.split('\n').filter(l => l.trim())) {
    const dashMatch = line.match(/^(.+?)\s*[—–-]\s*(\d+)\s*min/)
    const parenMatch = line.match(/^(.+?)\s*\((\d+)\s*min\)/)
    const match = dashMatch || parenMatch
    total += match ? parseInt(match[2]) : 15
  }
  return total
}

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const
export type WeekDay = (typeof WEEK_DAYS)[number]

/**
 * Given a week start date (Sunday-based, matching getWeekRange default)
 * and a WEEK_DAYS day name (Monday=0), return the date key (YYYY-MM-DD)
 * for that day.
 *
 * WEEK_DAYS is Monday-indexed but weekRange.start is Sunday, so Monday
 * is +1 from weekStart, Friday is +5.
 */
export function dateKeyForDayPlan(
  weekStart: string,
  day: (typeof WEEK_DAYS)[number],
): string {
  const dayIndex = WEEK_DAYS.indexOf(day)
  if (dayIndex < 0) {
    throw new Error(`Invalid day "${day}" — must be one of ${WEEK_DAYS.join(', ')}`)
  }
  const start = new Date(weekStart + 'T00:00:00')
  const target = new Date(start)
  target.setDate(start.getDate() + dayIndex + 1)
  return formatDateYmd(target)
}

/**
 * Format a single day's card header from the planning-week start, e.g.
 * "Monday · Jul 20" — the concrete calendar date that `dateKeyForDayPlan`
 * (and therefore apply) will write to, so the week being edited is never
 * invisible again (FEAT-112). Falls back to the bare day name for any string
 * outside `WEEK_DAYS`.
 */
export function formatDayCardLabel(weekStart: string, day: string): string {
  if (!WEEK_DAYS.includes(day as WeekDay)) return day
  const dateKey = dateKeyForDayPlan(weekStart, day as WeekDay)
  const parsed = parseDateYmd(dateKey)
  if (!parsed) return day
  return `${day} · ${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

/**
 * Format the Mon–Fri school body of a planning week as a prominent header,
 * e.g. "Week of Jul 20–24" (or "Week of Jul 27 – Aug 1" across a month
 * boundary). Uses the same `dateKeyForDayPlan` mapping apply uses, so the
 * header and the write can never disagree. Returns `''` if the start is
 * unparseable.
 */
export function formatPlanningWeekLabel(weekStart: string): string {
  const monday = parseDateYmd(dateKeyForDayPlan(weekStart, 'Monday'))
  const friday = parseDateYmd(dateKeyForDayPlan(weekStart, 'Friday'))
  if (!monday || !friday) return ''
  const mondayLabel = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const fridayLabel =
    monday.getMonth() === friday.getMonth()
      ? String(friday.getDate())
      : friday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const separator = monday.getMonth() === friday.getMonth() ? '–' : ' – '
  return `Week of ${mondayLabel}${separator}${fridayLabel}`
}

/**
 * FEAT-112 apply backstop: is the Mon–Fri body of this planning week entirely
 * in the past relative to `todayKey`? True only when even Friday — the last
 * school day — is before today, i.e. applying would write the whole plan to
 * days that have already gone by (the stale-tab case the live memo is meant to
 * prevent; this is the belt-and-suspenders). Mid-week planning — some earlier
 * days past but Friday today-or-future — is deliberately NOT flagged, so
 * re-planning the rest of an in-progress week is never blocked. An unparseable
 * start returns `false` (never a false block).
 */
export function isPlanningWeekPast(weekStart: string, todayKey: string): boolean {
  if (!parseDateYmd(weekStart)) return false
  const friday = dateKeyForDayPlan(weekStart, 'Friday')
  return friday < todayKey
}

/**
 * FEAT-112 follow-up: build a fresh `WeekPlan` for a forward-shifted apply that
 * targets a week whose doc the page never auto-seeded (only the live
 * `weekRange.start` doc is created by the planner's `weekPlanRef` effect). Mirrors
 * that effect's default shape and stamps the applied child's goals; siblings get
 * empty goal lists, exactly like the seed. `endDate` is the Saturday six days
 * after the Sunday-based `weekStart`.
 */
export function buildShiftedWeekPlan(
  weekStart: string,
  children: { id: string }[],
  activeChildId: string,
  planGoals: string[],
  readAloudBookId?: string,
): WeekPlan {
  const end = parseDateYmd(weekStart)
  if (end) end.setDate(end.getDate() + 6)
  return {
    startDate: weekStart,
    endDate: end ? formatDateYmd(end) : weekStart,
    theme: '',
    virtue: '',
    scriptureRef: '',
    heartQuestion: '',
    tracks: [],
    flywheelPlan: '',
    buildLab: { title: '', materials: [], steps: [] },
    childGoals: children.map((c) => ({
      childId: c.id,
      goals: c.id === activeChildId ? planGoals : [],
    })),
    ...(readAloudBookId ? { readAloudBookId } : {}),
  }
}

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

/**
 * Match a priority skill against an assignment by subject + label/tag mention.
 * Conservative: requires either subject prefix match on the skill tag or
 * a substring of the skill label/tag-leaf appearing in the lesson/workbook name.
 */
function assignmentMatchesPrioritySkill(
  assignment: AssignmentCandidate,
  skill: { tag: string; label: string },
): boolean {
  const subjectPrefix = assignment.subjectBucket.toLowerCase()
  const skillTag = skill.tag.toLowerCase()
  const haystack = `${assignment.workbookName} ${assignment.lessonName}`.toLowerCase()
  const labelMatch = skill.label.length > 0 && haystack.includes(skill.label.toLowerCase())
  const tagLeaf = skillTag.split('.').pop() ?? ''
  const leafMatch = tagLeaf.length > 2 && haystack.includes(tagLeaf)
  const subjectMatch = skillTag.startsWith(subjectPrefix) && (labelMatch || leafMatch)
  return subjectMatch || labelMatch
}

export function applySnapshotSuggestions(
  assignments: AssignmentCandidate[],
  snapshot: SkillSnapshot | null,
): { assignments: AssignmentCandidate[]; skipSuggestions: SkipSuggestion[] } {
  if (!snapshot || snapshot.prioritySkills.length === 0) {
    return { assignments, skipSuggestions: [] }
  }
  const skipSuggestions: SkipSuggestion[] = []
  const processed = assignments.map((assignment) => {
    // Mastery-gate consultation: if a matching priority skill is mastered, suggest skip.
    const masteredMatch = snapshot.prioritySkills.find(
      (s) =>
        getEffectiveMasteryGate(s) === MasteryGate.IndependentConsistent &&
        assignmentMatchesPrioritySkill(assignment, s),
    )
    if (masteredMatch) {
      const suggestion: SkipSuggestion = {
        action: 'skip',
        reason: `${masteredMatch.label} at ${MasteryGateLabel[MasteryGate.IndependentConsistent]}`,
        replacement: 'Drop or move to background practice; reclaim time for active focus.',
        evidence: snapshot.evidenceDefinitions[0]?.description ?? 'Mastery evidence on record',
      }
      skipSuggestions.push(suggestion)
      return { ...assignment, action: AssignmentAction.Skip, skipSuggestion: suggestion }
    }
    // Mostly-independent: suggest modify alongside the long-task / stop-rule paths.
    const mostlyIndependentMatch = snapshot.prioritySkills.find(
      (s) =>
        getEffectiveMasteryGate(s) === MasteryGate.MostlyIndependent &&
        assignmentMatchesPrioritySkill(assignment, s),
    )
    if (mostlyIndependentMatch) {
      const suggestion: SkipSuggestion = {
        action: 'modify',
        reason: `${mostlyIndependentMatch.label} is ${MasteryGateLabel[MasteryGate.MostlyIndependent]}`,
        replacement: '1-2 problems + quick check, not full set.',
        evidence: snapshot.evidenceDefinitions[0]?.description ?? 'Complete modified set',
      }
      skipSuggestions.push(suggestion)
      return { ...assignment, action: AssignmentAction.Modify, skipSuggestion: suggestion }
    }
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

  // Add ONE consolidated skill practice item per day (not individual items per skill)
  if (snapshot && snapshot.prioritySkills.length > 0) {
    const emergingSkills = snapshot.prioritySkills.filter(s => s.level === 'emerging')
    const developingSkills = snapshot.prioritySkills.filter(s => s.level === 'developing' || s.level === 'supported')

    if (emergingSkills.length > 0) {
      // ONE daily item that covers all emerging skills
      const skillLabels = emergingSkills.map(s => s.label).join(', ')
      const primarySubject = skillTagToSubject(emergingSkills[0].tag)

      for (const day of WEEK_DAYS) {
        const dayPlan = dayMap.get(day)!
        const item: DraftPlanItem = {
          id: generateItemId(),
          title: `Skill practice: ${skillLabels.length > 50 ? emergingSkills.length + ' emerging skills' : skillLabels}`,
          subjectBucket: primarySubject,
          estimatedMinutes: Math.min(15, emergingSkills.length * 5), // cap at 15 min
          skillTags: emergingSkills.map(s => s.tag),
          accepted: true,
          category: 'choose',  // choose, not must-do — keeps must-do list short
        }
        dayPlan.items.push(item)
        dayBudgets.set(day, dayBudgets.get(day)! - item.estimatedMinutes)
      }
    }

    if (developingSkills.length > 0) {
      // 3x/week for developing — ONE item covering all developing skills
      const skillLabels = developingSkills.map(s => s.label).join(', ')
      const primarySubject = skillTagToSubject(developingSkills[0].tag)
      const targetDays: WeekDay[] = ['Monday', 'Wednesday', 'Friday']

      for (const day of targetDays) {
        const dayPlan = dayMap.get(day)!
        const item: DraftPlanItem = {
          id: generateItemId(),
          title: `Practice: ${skillLabels.length > 50 ? developingSkills.length + ' developing skills' : skillLabels}`,
          subjectBucket: primarySubject,
          estimatedMinutes: 15,
          skillTags: developingSkills.map(s => s.tag),
          accepted: true,
          category: 'choose',
        }
        dayPlan.items.push(item)
        dayBudgets.set(day, dayBudgets.get(day)! - 15)
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

    // Resolve skill tags through the shared FEAT-73 no-guess decision: priority-matched
    // (witnessed) tags win; an unwitnessed LanguageArts/non-core subject-default is a
    // cross-domain guess and is suppressed; reading/math keep their subject default.
    const suggestedTags = resolveSuggestedTags(assignment.subjectBucket, prioritySkillTags)

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

  // Enforce daily time budget — remove excess choose items
  for (const day of WEEK_DAYS) {
    const dayPlan = dayMap.get(day)!
    const budget = minutesPerDay // from hoursPerDay input (e.g., 150 minutes)

    let totalMinutes = dayPlan.items.reduce((sum, i) => sum + (i.accepted ? i.estimatedMinutes : 0), 0)

    if (totalMinutes > budget) {
      const mustDo = dayPlan.items.filter(i => i.category !== 'choose')
      const choose = dayPlan.items.filter(i => i.category === 'choose')

      // Keep removing choose items from the end until under budget
      while (totalMinutes > budget && choose.length > 0) {
        const removed = choose.pop()!
        totalMinutes -= removed.estimatedMinutes
      }

      dayPlan.items = [...mustDo, ...choose]
    }
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

  // Non-essential = not an app block AND not mvdEssential.
  // Priority-skill micro-reps (no assignmentId, not app blocks) are protected only if mvdEssential.
  const removedItems: DraftPlanItem[] = []
  const keptItems: DraftPlanItem[] = []
  for (const item of targetDay.items) {
    if (!item.isAppBlock && !item.mvdEssential && item.accepted) {
      removedItems.push(item)
      item.accepted = false
    } else {
      keptItems.push(item)
    }
  }

  // Redistribute removed items to other days (round-robin, prefer days with most remaining budget)
  if (removedItems.length > 0) {
    const otherDays = days.filter((d) => d.day !== intent.day)
    // Sort by remaining budget descending so fuller days get fewer items
    const sortedOthers = [...otherDays].sort(
      (a, b) => (b.timeBudgetMinutes - dayTotalMinutes(b)) - (a.timeBudgetMinutes - dayTotalMinutes(a)),
    )
    for (let i = 0; i < removedItems.length; i++) {
      const recipient = sortedOthers[i % sortedOthers.length]
      if (recipient) {
        recipient.items.push({
          ...removedItems[i],
          id: generateItemId(),
          accepted: true,
        })
      }
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

/** Filter out daily routine lines that match completed programs (e.g., Reading Eggs). */
export function filterRoutineForCompletedPrograms(routine: string, completedPrograms: string[]): string {
  if (!completedPrograms || completedPrograms.length === 0) return routine
  const lines = routine.split('\n')
  const filtered = lines.filter(line => {
    const lineLower = line.toLowerCase().replace(/[^a-z0-9]/g, '')
    return !completedPrograms.some(prog => {
      const progLower = prog.toLowerCase().replace(/[^a-z0-9]/g, '')
      return lineLower.includes(progLower)
    })
  })
  return filtered.join('\n')
}

export function dayTotalMinutes(day: DraftDayPlan): number {
  let total = 0
  const pairedCounted = new Set<string>()
  const accepted = day.items.filter((item) => item.accepted)

  for (const item of accepted) {
    // For paired items, only count the longer one (they overlap)
    if (item.pairedWith) {
      if (pairedCounted.has(item.pairedWith)) continue
      const pair = accepted.find(
        (i) => i.id === item.pairedWith || i.pairedWith === item.id,
      )
      if (pair && pair !== item) {
        total += Math.max(item.estimatedMinutes, pair.estimatedMinutes)
        pairedCounted.add(item.pairedWith)
        pairedCounted.add(item.id)
        continue
      }
    }
    if (pairedCounted.has(item.id)) continue
    total += item.estimatedMinutes
  }

  return total
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

  // ── ROUTINE FIRST — this is the most important input ──
  let routineMinutesTotal = 0
  if (dailyRoutine) {
    lines.push('═══════════════════════════════════════════════════')
    lines.push('YOUR #1 JOB: Use mom\'s EXACT daily routine as the plan.')
    lines.push('═══════════════════════════════════════════════════')
    lines.push('')
    lines.push('Mom\'s daily routine (COPY THESE EXACTLY as plan items):')
    lines.push('')

    // Parse routine into structured items for the AI
    const routineLines = dailyRoutine.split('\n').filter(l => l.trim())
    for (const line of routineLines) {
      const dashMatch = line.match(/^(.+?)\s*[—–-]\s*(\d+)\s*min/)
      const parenMatch = line.match(/^(.+?)\s*\((\d+)\s*min\)/)
      const match = dashMatch || parenMatch
      if (match) {
        const mins = parseInt(match[2])
        routineMinutesTotal += mins
        lines.push(`  MUST-DO: "${match[1].trim()}" — ${mins} minutes`)
      } else {
        routineMinutesTotal += 15
        lines.push(`  MUST-DO: "${line.trim()}"`)
      }
    }

    lines.push('')
    lines.push('RULES:')
    lines.push('- Every day MUST include ALL of these activities with their EXACT names and times')
    lines.push('- Use "category": "must-do" for all routine items')
    lines.push('- Use the EXACT estimatedMinutes from the routine (20, 15, 30, 45, etc.) — do NOT default to 15')
    lines.push('- Do NOT rename activities. "Good and the Beautiful reading" stays "Good and the Beautiful reading"')
    lines.push('- Do NOT replace routine items with generic alternatives')
    lines.push('- You MAY add 1-2 extra "choose" items per day (games, books, art) beyond the routine')
    lines.push('- You MAY vary the lesson NUMBER or specific content within an activity across days')
    lines.push('  (e.g., Monday: "GATB Math — Lesson 5", Tuesday: "GATB Math — Lesson 6")')
    lines.push('')
    lines.push(`Daily time budget: ${routineMinutesTotal} minutes (based on routine total)`)
    lines.push('')
    lines.push('═══════════════════════════════════════════════════')
    lines.push('')
  }

  const timeBudgetMinutes = routineMinutesTotal > 0 ? routineMinutesTotal : hoursPerDay * 60

  lines.push(`Generate a weekly school plan (Monday–Friday) with ${timeBudgetMinutes} minutes/day budget.`)
  lines.push('')
  lines.push('HARD BUDGET RULE:')
  lines.push(`- The daily time budget is ${timeBudgetMinutes} minutes. The SUM of estimatedMinutes per day MUST be ≤ ${timeBudgetMinutes}.`)
  lines.push('- If routine + app blocks alone exceed the budget, reduce routine items — do NOT generate a plan that exceeds the budget and then warn about it. The plan MUST fit the day.')
  lines.push('- A fewer-item plan that fits is ALWAYS better than a longer plan that overflows. A 3-item day is acceptable. A 21-item day is not.')
  lines.push('- Recent weekly reviews show 0% completion on 13-item days; aim for 8–10 items/day (fewer on MVD/low-energy days).')
  lines.push('')

  if (subjectTimeDefaults && Object.keys(subjectTimeDefaults).length > 0) {
    lines.push('Subject time defaults (use these as the TOTAL minutes per subject per day, not per item):')
    for (const [subject, minutes] of Object.entries(subjectTimeDefaults)) {
      const label = subject === 'Other' ? 'Formation/Prayer' : subject === 'LanguageArts' ? 'Language Arts' : subject === 'SocialStudies' ? 'Social Studies' : subject
      lines.push(`- ${label}: ${minutes} min/day`)
    }
    lines.push('- Do NOT add multiple items in the same subject that collectively exceed its daily minutes.')
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
    lines.push('REDISTRIBUTION RULE:')
    lines.push('- When a day is made lighter or activities are removed, the WEEKLY total should stay the same')
    lines.push('- Move skipped activities to other days that have capacity')
    lines.push('- Example: If Monday drops 110 min of activities, spread ~28 min extra across Tue-Fri (4 days)')
    lines.push('- Prioritize adding to days that are currently below the daily budget')
    lines.push('- When redistributing, add the SAME activities (not new ones) — e.g., move Monday\'s "GATB Reading" to Tuesday')
    lines.push('')
  }

  lines.push('Respond ONLY with a JSON object matching this schema (no markdown fences, no commentary):')
  lines.push(JSON.stringify({
    days: [
      {
        day: 'Monday',
        timeBudgetMinutes: Math.round(timeBudgetMinutes),
        items: [
          {
            title: 'Handwriting (while read-aloud)',
            subjectBucket: 'LanguageArts',
            estimatedMinutes: 20,
            skillTags: [],
            isAppBlock: false,
            accepted: true,
            mvdEssential: true,
            category: 'must-do',
          },
          {
            title: 'Reading Eggs',
            subjectBucket: 'Reading',
            estimatedMinutes: 45,
            skillTags: [],
            isAppBlock: true,
            accepted: true,
            mvdEssential: true,
            category: 'must-do',
          },
        ],
      },
    ],
    skipSuggestions: [],
    minimumWin: 'Complete all must-do items.',
  }))

  lines.push('')
  lines.push('CRITICAL SIZE CONSTRAINTS:')
  lines.push('- Keep item titles SHORT (max 6 words). Example: "GATB Reading Lesson 21" not "Good and the Beautiful Reading — Lesson 21: Short vowel review with comprehension questions"')
  lines.push('- Keep skillTags to max 1 tag per item (the most relevant one)')
  lines.push('- Keep skipGuidance to max 15 words or omit if not needed')
  lines.push('- Do NOT include explanations, descriptions, or commentary in the JSON')
  lines.push('- Total response must be under 4000 tokens. Be concise.')

  return lines.join('\n')
}

const VALID_SUBJECT_BUCKETS = new Set<string>(Object.values(SubjectBucket))

/** Extract a JSON object string from text that may contain preamble or surrounding prose. */
function extractJsonObject(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  let candidate = trimmed

  // Pattern 1: ```json ... ``` (complete fences) — lazy match to stop at FIRST closing fence
  const lazyFence = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (lazyFence) {
    candidate = lazyFence[1].trim()
  } else {
    // Pattern 2: starts with ``` but no closing (AI truncated)
    const openFence = trimmed.match(/^```(?:json)?\s*\n?/)
    if (openFence) {
      candidate = trimmed.slice(openFence[0].length).trim()
      // Remove trailing ``` if present without matching open
      candidate = candidate.replace(/\s*```\s*$/, '').trim()
    }
  }

  // Find the outermost { ... } in the text
  const firstBrace = candidate.indexOf('{')
  if (firstBrace === -1) return null
  const lastBrace = candidate.lastIndexOf('}')

  if (lastBrace <= firstBrace) {
    // No closing brace — likely truncated. Extract from first brace to end
    // and let forgivingJsonParse attempt repair.
    const truncated = candidate.slice(firstBrace)
    console.log('[extractJsonObject] No closing brace found — extracted truncated JSON:', truncated.length, 'chars')
    return truncated
  }

  const extracted = candidate.slice(firstBrace, lastBrace + 1)
  console.log('[extractJsonObject] Extracted', extracted.length, 'chars')
  return extracted
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
 * Attempt to repair truncated JSON by closing open brackets/braces.
 * Tracks nesting with a stack, trims any incomplete trailing value,
 * and appends the missing closers. Returns null if already balanced.
 */
function repairTruncatedJson(text: string): string | null {
  const stack: string[] = []
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '\\' && inString) {
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === '{' || ch === '[') {
      stack.push(ch)
    } else if (ch === '}') {
      if (stack.length > 0 && stack[stack.length - 1] === '{') {
        stack.pop()
      }
    } else if (ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === '[') {
        stack.pop()
      }
    }
  }

  if (stack.length === 0) return null // Already balanced, parse error is something else

  let suffix = ''
  // If we're in the middle of a string, close it
  if (inString) {
    suffix += '"'
  }

  // Remove trailing partial value (incomplete string, number, etc.)
  let base = text.trimEnd()

  // Remove trailing comma if present
  if (base.endsWith(',')) {
    base = base.slice(0, -1)
  }

  // Close all open brackets/braces in reverse order
  const closers: Record<string, string> = { '{': '}', '[': ']' }
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += closers[stack[i]] || ''
  }

  const repaired = base + suffix
  console.log(`[repairTruncatedJson] Added ${suffix.length} closing chars. Stack depth was ${stack.length}`)

  return repaired
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
    const result = JSON.parse(text) as Record<string, unknown>
    console.log('[forgivingJsonParse] Strict JSON.parse succeeded')
    return result
  } catch (err) {
    console.warn('[forgivingJsonParse] Strict parse failed:', (err as Error).message)
  }

  const fixed = text
    // Remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, '$1')
    // Replace single-quoted string values with double-quoted (simple cases)
    .replace(/:\s*'([^']*)'/g, ': "$1"')
    // Remove newlines/tabs that may be inside string values
    .replace(/\n/g, ' ')
    .replace(/\t/g, ' ')

  // Try again after fixes
  try {
    const result = JSON.parse(fixed) as Record<string, unknown>
    console.log('[forgivingJsonParse] Fixed JSON parsed successfully after cleanup')
    return result
  } catch (err) {
    console.warn('[forgivingJsonParse] Cleanup parse failed:', (err as Error).message)
  }

  // Try to repair truncated JSON by closing open brackets/braces
  const repaired = repairTruncatedJson(fixed)
  if (repaired) {
    try {
      const result = JSON.parse(repaired) as Record<string, unknown>
      console.log('[forgivingJsonParse] Truncation repair succeeded')
      return result
    } catch (err) {
      console.error('[forgivingJsonParse] Repair parse failed:', (err as Error).message)
    }
  }

  console.error('[forgivingJsonParse] All recovery attempts failed')
  return null
}

/**
 * FEAT-73: the shared no-guess tag-resolution decision, routed through by BOTH
 * planner paths (the deterministic `buildDeterministicPlan` assignment loop and
 * the AI-parse `backfillCatalogTags`) so the two can never drift again. It
 * encodes the FEAT-72 doctrine subject-neutrally:
 *
 *  - **Non-core** subjects (Science / SocialStudies / Other) fall through to the
 *    whole catalog in `suggestTagsForSubject` — a fallback, not a targeted list,
 *    and there is no foundations concept graph for them — so never guess a tag
 *    (even if a priority tag happens to match). `[]`.
 *  - **Priority-matched** tags are *witnessed*: the child's skill snapshot
 *    explicitly lists the kid working them, so keep them — even for
 *    `LanguageArts`. This is the witness the AI-parse path deliberately does NOT
 *    honor for LA (see `backfillCatalogTags`): only the deterministic planner,
 *    which stamps real workbook assignments against the snapshot, treats a
 *    priority match on an LA subject as coverage worth keeping.
 *  - **`LanguageArts`, no witness** → `[]`: LA spans reading + writing but its
 *    subject-default is a **reading** tag (`reading.cvcBlend`), which the FEAT-69
 *    bridge resolves to a CVC concept. Guessing that onto a writing/handwriting
 *    item would enqueue a false reading-phonics re-test, so suppress it.
 *  - **Core reading/math, no witness** → the current subject-default suggestion
 *    (a same-domain guess is acceptable and pre-existing; there IS a foundations
 *    graph). Left exactly as the prior `autoSuggestTags` fallback (2 tags).
 */
export function resolveSuggestedTags(
  subjectBucket: SubjectBucket,
  prioritySkillTags: string[],
): string[] {
  const subjectTags = suggestTagsForSubject(subjectBucket)
  // Non-core: whole-catalog fallback (reference equality) → no targeted mapping, no guess.
  if (subjectTags === ALL_SKILL_TAGS) return []
  // Priority-matched tags are witnessed — keep them (works for LA and reading/math).
  const prioritized = subjectTags.filter((t) => prioritySkillTags.includes(t))
  if (prioritized.length > 0) return prioritized
  // No witness: LA's reading-first subject-default is a cross-domain guess — suppress.
  if (subjectBucket === SubjectBucket.LanguageArts) return []
  // No witness, core reading/math: keep the pre-existing same-domain subject default.
  return subjectTags.slice(0, 2)
}

/**
 * FEAT-72: deterministic catalog-tag backfill for a parsed AI-plan item.
 *
 * The AI-chat planner ships `"skillTags": []` in its prompt and the LLM usually
 * emits nothing (or an off-catalog string), so most AI items would reach the
 * persist paths untagged — which starves the FEAT-68/69 daily-signal → re-test
 * bridge (it can only map a **catalog** skillTag to a foundations concept).
 * This backfills the single best catalog tag at the parse chokepoint, reusing
 * the same `autoSuggestTags` helper the deterministic planner already uses
 * (`buildDeterministicPlan`, ~:461) — never trusting the model, never inventing
 * a synthetic `subject.general` tag.
 *
 * Rules:
 *  - keep any catalog-valid tags the LLM did emit (SKILL_TAG_MAP membership),
 *  - otherwise route through the shared `resolveSuggestedTags` no-guess decision
 *    (FEAT-73) and cap to the single best tag, honoring the "max ~1 tag per item"
 *    convention — a pile just seeds noisier re-tests.
 *
 * The AI-parse path is STRICTER than the deterministic planner on `LanguageArts`:
 * it lacks the deterministic planner's workbook-assignment + snapshot witness, so
 * a priority match does NOT rescue an ambiguous LA item here. LA is suppressed
 * before consulting the shared resolver, so an LA item is tagged only when the LLM
 * emitted a valid catalog tag (kept above). Non-core (`[]`) and reading/math
 * (subject-default) decisions come from the shared resolver, keeping the two
 * planner paths from drifting on everything except this one intentional axis.
 */
function backfillCatalogTags(
  rawTags: unknown,
  subjectBucket: SubjectBucket,
  prioritySkillTags: string[],
): string[] {
  const llmTags = Array.isArray(rawTags)
    ? (rawTags as unknown[]).filter((t): t is string => typeof t === 'string' && t.length > 0)
    : []
  const catalogTags = llmTags.filter((t) => t in SKILL_TAG_MAP)
  if (catalogTags.length > 0) return catalogTags
  // AI-path-specific: no workbook/snapshot witness, so an ambiguous LanguageArts
  // item is never rescued by a priority match — that would create false CVC re-test
  // evidence for writing items (FEAT-72). Reading / Math / non-core defer to the
  // shared resolver below.
  if (subjectBucket === SubjectBucket.LanguageArts) return []
  const [best] = resolveSuggestedTags(subjectBucket, prioritySkillTags)
  return best ? [best] : []
}

/**
 * Parse and validate an AI response into a DraftWeeklyPlan. Returns null if malformed.
 *
 * `prioritySkillTags` (from the child's skill snapshot) targets the FEAT-72
 * catalog-tag backfill; pass `[]` (the default) when unavailable — the backfill
 * still stamps subject-default catalog tags.
 */
export function parseAIResponse(response: ChatResponse, prioritySkillTags: string[] = []): DraftWeeklyPlan | null {
  try {
    const jsonText = extractJsonObject(response.message)
    if (!jsonText) {
      console.warn('[parseAIResponse] No JSON found. Response starts with:', response.message.substring(0, 200))
      console.warn('[parseAIResponse] Response length:', response.message.length)
      // Last-resort: try to extract structured day data from free text
      return extractDaysFromText(response.message)
    }
    console.log('[parseAIResponse] Extracted text length:', jsonText.length)
    const parsed = forgivingJsonParse(jsonText)
    if (!parsed) {
      console.error('[parseAIResponse] JSON parse failed after all recovery attempts')
      console.error('[parseAIResponse] JSON text starts with:', jsonText.substring(0, 500))
      // Last-resort: try to extract structured day data from free text
      return extractDaysFromText(response.message)
    }

    // Handle wrapped structures: { plan: { days: [...] } } or { weeklyPlan: { days: [...] } }
    let planData = parsed
    if (!Array.isArray(parsed.days)) {
      // Check well-known keys first, then fall back to scanning all keys
      const knownKeys = ['plan', 'weeklyPlan', 'weekly_plan', 'weekPlan', 'response', 'result', 'schedule']
      let found = false
      for (const key of knownKeys) {
        const nested = parsed[key]
        if (nested && typeof nested === 'object' && Array.isArray((nested as Record<string, unknown>).days)) {
          planData = nested as Record<string, unknown>
          console.log(`[parseAIResponse] Found days array under known key "${key}"`)
          found = true
          break
        }
      }
      // Scan all keys if known keys didn't match
      if (!found) {
        for (const key of Object.keys(parsed)) {
          const nested = parsed[key]
          if (nested && typeof nested === 'object' && Array.isArray((nested as Record<string, unknown>).days)) {
            planData = nested as Record<string, unknown>
            console.log(`[parseAIResponse] Found days array under key "${key}"`)
            found = true
            break
          }
        }
      }
      if (!found) {
        console.warn('[parseAIResponse] No days array found. Top-level keys:', Object.keys(parsed))
      }
    }

    if (!Array.isArray(planData.days) || planData.days.length === 0) {
      console.warn('[parseAIResponse] Missing or empty days array')
      return extractDaysFromText(response.message)
    }

    // Use planData from here on for days/minimumWin/skipSuggestions/weekSkipSummary
    parsed.days = planData.days
    if (planData.minimumWin) parsed.minimumWin = planData.minimumWin
    if (planData.skipSuggestions) parsed.skipSuggestions = planData.skipSuggestions
    if (planData.weekSkipSummary) parsed.weekSkipSummary = planData.weekSkipSummary

    // minimumWin is nice-to-have, not required
    const minimumWin = typeof parsed.minimumWin === 'string'
      ? parsed.minimumWin
      : 'Complete the core items for each day.'

    const days: DraftDayPlan[] = []
    for (let dayIdx = 0; dayIdx < (parsed.days as Array<Record<string, unknown>>).length; dayIdx++) {
      const rawDay = (parsed.days as Array<Record<string, unknown>>)[dayIdx]
      const dayName = typeof rawDay.day === 'string' ? rawDay.day : String(rawDay.day ?? '')
      if (!dayName) {
        console.warn(`[parseAIResponse] Day ${dayIdx}: missing day name, skipping`)
        continue
      }

      if (!Array.isArray(rawDay.items)) {
        console.warn(`[parseAIResponse] Day ${dayIdx} (${dayName}): items is not an array, type=${typeof rawDay.items}`)
        continue // skip this day, don't fail everything
      }

      const items: DraftPlanItem[] = []
      for (let itemIdx = 0; itemIdx < (rawDay.items as Array<Record<string, unknown>>).length; itemIdx++) {
        const rawItem = (rawDay.items as Array<Record<string, unknown>>)[itemIdx]
        let title = typeof rawItem.title === 'string' ? rawItem.title : String(rawItem.title ?? '')
        // Strip trailing JSON artifacts: quotes, commas, semicolons
        title = title.replace(/[",;]+$/, '').trim()
        // Strip leading quotes
        title = title.replace(/^["']+/, '').trim()
        // Safety net: AI occasionally embeds context in titles despite prompt constraints.
        // Truncate egregiously long titles at a word boundary so Today doesn't display garbage.
        if (title.length > 80) {
          const truncated = title.substring(0, 80).replace(/\s+\S*$/, '').trim()
          console.warn(`[parseAIResponse] Title exceeded 80 chars, truncated from "${title}" to "${truncated}"`)
          title = truncated
        }
        if (!title) {
          console.warn(`[parseAIResponse] Day ${dayIdx} item ${itemIdx}: empty title, skipping`)
          continue
        }

        // Coerce estimatedMinutes from string/number, accept "minutes" as alias
        const rawMinutes = rawItem.estimatedMinutes ?? rawItem.minutes
        const estimatedMinutes = typeof rawMinutes === 'number'
          ? rawMinutes
          : typeof rawMinutes === 'string'
            ? parseInt(rawMinutes, 10)
            : 15 // default

        const finalMinutes = isNaN(estimatedMinutes) || estimatedMinutes < 0 ? 15 : estimatedMinutes
        if (finalMinutes !== estimatedMinutes) {
          console.warn(`[parseAIResponse] Day ${dayIdx} item ${itemIdx} (${title}): bad minutes=${rawMinutes}, using 15`)
        }

        const subjectBucket = VALID_SUBJECT_BUCKETS.has(rawItem.subjectBucket as string)
          ? (rawItem.subjectBucket as SubjectBucket)
          : SubjectBucket.Other

        items.push({
          id: generateItemId(),
          title,
          subjectBucket,
          estimatedMinutes: finalMinutes,
          skillTags: backfillCatalogTags(rawItem.skillTags, subjectBucket, prioritySkillTags),
          isAppBlock: rawItem.isAppBlock === true,
          accepted: rawItem.accepted !== false,
          mvdEssential: rawItem.mvdEssential === true ? true : rawItem.category === 'must-do' ? true : undefined,
          category: rawItem.category === 'choose' ? 'choose' as const : 'must-do' as const,
          skipGuidance: typeof rawItem.skipGuidance === 'string' ? rawItem.skipGuidance : undefined,
          ...(typeof rawItem.itemType === 'string' && ['routine', 'workbook', 'evaluation', 'activity', 'watch'].includes(rawItem.itemType)
            ? { itemType: rawItem.itemType as 'routine' | 'workbook' | 'evaluation' | 'activity' | 'watch' } : {}),
          ...(typeof rawItem.evaluationMode === 'string' && ['phonics', 'comprehension', 'fluency', 'math'].includes(rawItem.evaluationMode)
            ? { evaluationMode: rawItem.evaluationMode as 'phonics' | 'comprehension' | 'fluency' | 'math' } : {}),
          ...(typeof rawItem.link === 'string' ? { link: rawItem.link } : {}),
          ...(typeof rawItem.bookId === 'string' && rawItem.bookId.length > 0 ? { bookId: rawItem.bookId } : {}),
          ...(typeof rawItem.watchVideoId === 'string' && rawItem.watchVideoId.length > 0 ? { watchVideoId: rawItem.watchVideoId } : {}),
        })
      }

      if (items.length === 0) {
        console.warn(`[parseAIResponse] Day ${dayIdx} (${dayName}): no valid items after parsing, skipping day`)
        continue
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

    console.log(`[parseAIResponse] Successfully parsed ${days.length} days with ${days.reduce((s, d) => s + d.items.length, 0)} total items`)

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

    const weekSkipSummary = typeof parsed.weekSkipSummary === 'string' ? parsed.weekSkipSummary : undefined

    return { days, skipSuggestions, minimumWin, weekSkipSummary }
  } catch (err) {
    console.error('[parseAIResponse] Parse error:', err, 'Raw:', response.message.substring(0, 300))
    // Last-resort: try to extract structured day data from free text
    return extractDaysFromText(response.message)
  }
}

export interface FillResult {
  plan: DraftWeeklyPlan
  filledDays: string[]
}

/**
 * If a parsed plan has fewer than 5 days (e.g., due to truncation repair),
 * fill missing days using items parsed from the daily routine text.
 */
export function fillMissingDaysFromRoutine(
  plan: DraftWeeklyPlan,
  dailyRoutine: string | undefined,
  hoursPerDay: number,
): FillResult {
  if (plan.days.length >= 5 || !dailyRoutine) return { plan, filledDays: [] }

  const existingDayNames = new Set(plan.days.map(d => d.day))
  const missingDays = WEEK_DAYS.filter(d => !existingDayNames.has(d))

  if (missingDays.length === 0) return { plan, filledDays: [] }

  // Parse routine items from the text (reuse the same parsing as generateDraftPlanFromInputs)
  const routineItems = parseRoutineText(dailyRoutine)
  if (routineItems.length === 0) return { plan, filledDays: [] }

  const filledDays = [...plan.days]
  for (const day of missingDays) {
    filledDays.push({
      day,
      timeBudgetMinutes: hoursPerDay * 60,
      items: routineItems.map(item => ({ ...item, id: generateItemId() })),
    })
  }

  // Sort days in weekday order
  const dayOrder = new Map(WEEK_DAYS.map((d, i) => [d, i]))
  filledDays.sort((a, b) => (dayOrder.get(a.day as WeekDay) ?? 99) - (dayOrder.get(b.day as WeekDay) ?? 99))

  console.warn(`[fillMissingDaysFromRoutine] Added ${missingDays.length} days from routine (AI provided ${plan.days.length})`)

  return { plan: { ...plan, days: filledDays }, filledDays: missingDays }
}

/** Parse daily routine text into DraftPlanItems (shared helper). */
function parseRoutineText(dailyRoutine: string): DraftPlanItem[] {
  const items: DraftPlanItem[] = []
  const lines = dailyRoutine.split('\n').filter(l => l.trim())

  for (const line of lines) {
    const dashMatch = line.match(/^(.+?)\s*[—–-]\s*(\d+)\s*min\s*(?:[—–-]\s*(.+?))?(?:\s*[—–-]\s*(.+?))?$/)
    const parenMatch = line.match(/^(.+?)\s*\((\d+)\s*min\)\s*(?:[—–-]\s*(.+?))?$/)

    const match = dashMatch || parenMatch
    if (!match) continue

    const name = match[1].trim()
    const minutes = parseInt(match[2])
    let subject: SubjectBucket = SubjectBucket.Other
    const remaining = [match[3], match[4]].filter(Boolean).join(' ').trim().toLowerCase()

    if (remaining.includes('reading') || remaining.includes('phonics')) subject = SubjectBucket.Reading
    else if (remaining.includes('math')) subject = SubjectBucket.Math
    else if (remaining.includes('language') || remaining.includes('handwriting') || remaining.includes('writing')) subject = SubjectBucket.LanguageArts
    else if (remaining.includes('science')) subject = SubjectBucket.Science
    else if (remaining.includes('social')) subject = SubjectBucket.SocialStudies
    else subject = guessSubjectFromTitle(name)

    const isApp = remaining.includes('app') || remaining.includes('tablet') ||
                   name.toLowerCase().includes('reading eggs') || name.toLowerCase().includes('math app')

    items.push({
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

  return items
}

/**
 * Post-generation validator: ensure the plan includes Fluency Practice.
 * Knowledge Mine is intentionally excluded — it's an always-available tool on
 * Kid Today (not a checklist task) and auto-tracks its own time.
 */
export function ensureEvaluationItems(plan: DraftWeeklyPlan): DraftWeeklyPlan {
  const allItems = plan.days.flatMap((d) => d.items)
  const hasFluency = allItems.some(
    (item) =>
      item.evaluationMode === 'fluency' ||
      item.title?.toLowerCase().includes('fluency'),
  )

  if (hasFluency || plan.days.length === 0) return plan

  console.warn('[Planner] No fluency items in generated plan — injecting defaults')

  const fluency: DraftPlanItem = {
    id: generateItemId(),
    title: 'Fluency Practice',
    estimatedMinutes: 10,
    subjectBucket: SubjectBucket.Reading,
    skillTags: [],
    accepted: true,
    category: 'choose',
    mvdEssential: false,
    itemType: 'evaluation',
    evaluationMode: 'fluency',
    link: '/quest',
  }

  const days = plan.days.map((day) => ({ ...day, items: [...day.items] }))

  // Spread fluency across the week: Monday + Wednesday
  if (days.length >= 1) days[0].items.push({ ...fluency, id: generateItemId() })
  if (days.length >= 3) days[2].items.push({ ...fluency, id: generateItemId() })

  return { ...plan, days }
}
