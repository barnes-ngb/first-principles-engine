import { SubjectBucket } from '../../core/types/enums'
import type { AdjustmentIntent, WeekDay } from './chatPlanner.logic'
import { AdjustmentType, WEEK_DAYS } from './chatPlanner.logic'

const DAY_ALIASES: Record<string, WeekDay> = {
  mon: 'Monday',
  monday: 'Monday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  tuesday: 'Tuesday',
  wed: 'Wednesday',
  wednesday: 'Wednesday',
  thu: 'Thursday',
  thurs: 'Thursday',
  thursday: 'Thursday',
  fri: 'Friday',
  friday: 'Friday',
}

const SUBJECT_ALIASES: Record<string, SubjectBucket> = {
  math: SubjectBucket.Math,
  maths: SubjectBucket.Math,
  reading: SubjectBucket.Reading,
  phonics: SubjectBucket.Reading,
  writing: SubjectBucket.LanguageArts,
  la: SubjectBucket.LanguageArts,
  'language arts': SubjectBucket.LanguageArts,
  languagearts: SubjectBucket.LanguageArts,
  science: SubjectBucket.Science,
  social: SubjectBucket.SocialStudies,
  'social studies': SubjectBucket.SocialStudies,
}

function parseDay(text: string): WeekDay | null {
  const lower = text.trim().toLowerCase()
  return DAY_ALIASES[lower] ?? null
}

function parseDays(text: string): WeekDay[] {
  // Split on / , and & plus whitespace
  const parts = text.split(/[/,&]+/).map((s) => s.trim())
  const days: WeekDay[] = []
  for (const part of parts) {
    const day = parseDay(part)
    if (day) days.push(day)
  }
  return days
}

function parseSubject(text: string): SubjectBucket | null {
  const lower = text.trim().toLowerCase()
  return SUBJECT_ALIASES[lower] ?? null
}

/**
 * Parse natural language adjustment intents from user text.
 * Returns null if no known intent is detected.
 */
export function parseAdjustmentIntent(text: string): AdjustmentIntent | null {
  const lower = text.toLowerCase().trim()

  // Pattern: "make <day> light" / "lighten <day>"
  const lightenMatch = lower.match(
    /(?:make|set)\s+(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?)\s+(?:light|lighter|easy|easier|short|shorter)/,
  ) ?? lower.match(
    /(?:lighten|ease)\s+(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?)/,
  )
  if (lightenMatch) {
    const day = parseDay(lightenMatch[1])
    if (day) {
      return { type: AdjustmentType.LightenDay, day }
    }
  }

  // Pattern: "move <subject> to <day>/<day>"
  const moveMatch = lower.match(
    /move\s+(math|maths|reading|phonics|writing|la|language\s*arts|science|social(?:\s*studies)?)\s+to\s+(.+)/,
  )
  if (moveMatch) {
    const subject = parseSubject(moveMatch[1])
    const toDays = parseDays(moveMatch[2])
    if (subject && toDays.length > 0) {
      return { type: AdjustmentType.MoveSubject, subject, toDays }
    }
  }

  // Pattern: "reduce <subject>" / "less <subject>"
  const reduceMatch = lower.match(
    /(?:reduce|less|cut|lower)\s+(math|maths|reading|phonics|writing|la|language\s*arts|science|social(?:\s*studies)?)/,
  )
  if (reduceMatch) {
    const subject = parseSubject(reduceMatch[1])
    if (subject) {
      return { type: AdjustmentType.ReduceSubject, subject, factor: 0.5 }
    }
  }

  // Pattern: "cap <subject> at <N> min"
  const capMatch = lower.match(
    /cap\s+(math|maths|reading|phonics|writing|la|language\s*arts|science|social(?:\s*studies)?)\s+(?:at|to)\s+(\d+)\s*(?:min|minutes?)?/,
  )
  if (capMatch) {
    const subject = parseSubject(capMatch[1])
    const maxMin = parseInt(capMatch[2], 10)
    if (subject && maxMin > 0) {
      return { type: AdjustmentType.CapSubjectTime, subject, maxMinutesPerDay: maxMin }
    }
  }

  return null
}

/**
 * Build a human-readable description of an adjustment intent.
 */
export function describeAdjustment(intent: AdjustmentIntent): string {
  switch (intent.type) {
    case AdjustmentType.LightenDay:
      return `Lightening ${intent.day} — reducing non-essential items.`
    case AdjustmentType.MoveSubject:
      return `Moving ${intent.subject} to ${intent.toDays.join(', ')}.`
    case AdjustmentType.ReduceSubject:
      return `Reducing ${intent.subject} time by ${Math.round((1 - intent.factor) * 100)}%.`
    case AdjustmentType.CapSubjectTime:
      return `Capping ${intent.subject} at ${intent.maxMinutesPerDay} min/day.`
  }
}

/** Check if all days referenced in the intent are valid weekdays */
export function isValidIntent(intent: AdjustmentIntent): boolean {
  switch (intent.type) {
    case AdjustmentType.LightenDay:
      return WEEK_DAYS.includes(intent.day)
    case AdjustmentType.MoveSubject:
      return intent.toDays.length > 0 && intent.toDays.every((d) => WEEK_DAYS.includes(d))
    case AdjustmentType.ReduceSubject:
      return intent.factor > 0 && intent.factor < 1
    case AdjustmentType.CapSubjectTime:
      return intent.maxMinutesPerDay > 0
  }
}
