/**
 * Per-day type on a planned week — Full · Light · Life (UX-261).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Owner, 2026-09-06, planning a week with Shelly:
 *
 *   *"While planning we added in the chat that Tuesday Thursday would be packing
 *   days and only packing and tablet activities — the layout didn't seem to
 *   adjust."*
 *
 * The sentence WAS sent. FEAT-198 put it last and fenced, exactly where it
 * belongs. It was then lost, because `buildPlannerPrompt` opens with
 *
 *   `YOUR #1 JOB: Use mom's EXACT daily routine as the plan.`
 *   `- Every day MUST include ALL of these activities`
 *
 * in capitals, and a fenced request at the bottom of a prompt is a **wish**
 * against a hard rule at the top of it. Tuesday came back carrying the full
 * routine at 260 minutes.
 *
 * The fix is not a better sentence. **An abstract instruction to an LLM is a
 * wish; a toggle is a control.** So the parent says which days are set aside by
 * tapping them, the model is *told* as a courtesy, and the result is **enforced
 * after parsing regardless of what the model returns**. That last clause is the
 * whole difference between this module and the prompt line it replaces.
 *
 * ── The three types ──────────────────────────────────────────────────────────
 *
 *   Full   — the generated day, untouched. The default; absent config means this.
 *   Light  — the app blocks plus the tiny writing/math tasks. This is the
 *            existing `appointmentResilience.logic` template, reused verbatim.
 *   Life   — a FEAT-200 Life Day: **no checklist at all**. The day is capture-
 *            shaped on Today — time, chips, one optional line — and it is set
 *            *on the day*, not planned in advance.
 *
 * `Life` is the one the owner asked for. *"Tuesday and Thursday are packing
 * days"* is two taps and Apply, not a fight with the routine rule and not ✕ on
 * fifteen rows twice.
 *
 * They are **peers**. Nothing here may rank them, order them by size, or
 * describe one as a reduced version of another — the same charter rule
 * `today/dayTypeChoices.ts` holds for the Today picker.
 *
 * ── Hours: this module writes no minute, and cannot ──────────────────────────
 *
 * A Life day's items become `[]`. `applyWeekPlan`'s `applicableDays` filters out
 * a day with no accepted items, so **no DayLog write happens for it at all** —
 * no checklist, no blocks, no `plannedMinutes`. And `LIFE_DAY_DEFAULT_MINUTES`
 * is deliberately NOT materialised here: on Today it is the *picker's
 * preselection* for a parent who is looking at the day, and a plan-time write of
 * it would put two hours into a compliance record that nobody chose, for a day
 * that has not happened yet. The parent records the time on the day, as FEAT-200
 * designed. `applyWeekPlan.dayTypes.test.ts` asserts the zero.
 *
 * ── `appointment` ────────────────────────────────────────────────────────────
 *
 * `DayType.Appointment` has no production consumer anywhere in the repo
 * (confirmed 2026-09-07; the only readers are `appointmentResilience.logic` and
 * its tests, and that module is itself unmounted — UX-262). It is therefore not
 * offered by {@link PLANNER_DAY_TYPE_CHOICES}. It still has to be *handled*,
 * because it remains a member of the union and a stored config could carry it,
 * so {@link DAY_TYPE_SHAPE} is an exhaustive `Record<DayType, …>`: a new member
 * fails to compile until it is given a shape, and `appointment` degrades to the
 * Light shape (which is what `isLightDay` has always treated it as) rather than
 * being silently dropped. That is the UX-204 partition lesson.
 *
 * Pure — no Firestore, no React, no clock.
 */
import type {
  AppBlock,
  DayTypeConfig,
  DraftDayPlan,
  DraftWeeklyPlan,
} from '../../core/types'
import { DayType, PlanType } from '../../core/types/enums'
import { applyLightDayToplan, buildLightDayTemplate } from './appointmentResilience.logic'

/**
 * What each day type does to a generated day.
 *
 * Exhaustive over `DayType` on purpose — see the header. `keep` leaves the day
 * exactly as generated; `light` runs the shared template; `clear` empties it.
 */
export const DAY_TYPE_SHAPE: Record<DayType, 'keep' | 'light' | 'clear'> = {
  [DayType.Normal]: 'keep',
  [DayType.Light]: 'light',
  [DayType.Appointment]: 'light',
  [DayType.Life]: 'clear',
}

/** One offered choice, with the one line that says what that kind of day is. */
export interface PlannerDayTypeChoice {
  value: DayType
  /** Short enough for a chip on a 390px day header. */
  label: string
  /** One line saying what this kind of day **is**. Never a comparison. */
  description: string
}

/**
 * The three types a parent may pick, in the order they are offered.
 *
 * Deliberately not `Object.values(DayType)`: `appointment` is handled but not
 * offered (see the header), and the order here is a copy decision rather than a
 * declaration order.
 */
export const PLANNER_DAY_TYPE_CHOICES: readonly PlannerDayTypeChoice[] = [
  {
    value: DayType.Normal,
    label: 'Full',
    description: 'The whole plan for this day.',
  },
  {
    value: DayType.Light,
    label: 'Light',
    description: 'The app blocks, a short writing task and a short math task.',
  },
  {
    value: DayType.Life,
    label: 'Life Day',
    description: 'This day is the lesson. Set it aside — record what happened on the day.',
  },
]

/** The chip label for a type, including one that is handled but not offered. */
export function plannerDayTypeLabel(dayType: DayType): string {
  return PLANNER_DAY_TYPE_CHOICES.find((c) => c.value === dayType)?.label ?? 'Light'
}

// ── Reading and editing the config ───────────────────────────────────────────

/**
 * The type set for `day`. **Absent means Full** — that is the no-migration rule:
 * every week planned before this run, and every week a parent never touches the
 * control on, reads as it always did.
 */
export function resolvePlannerDayType(
  day: string,
  dayTypes: readonly DayTypeConfig[] | undefined,
): DayType {
  return dayTypes?.find((d) => d.day === day)?.dayType ?? DayType.Normal
}

/**
 * The config with `day` set to `dayType`. Appends when the day has no row yet,
 * so a config that started empty fills in one tap at a time and the days a
 * parent never touched stay absent (= Full) rather than being written as
 * explicit noise.
 */
export function setPlannerDayType(
  dayTypes: readonly DayTypeConfig[] | undefined,
  day: string,
  dayType: DayType,
): DayTypeConfig[] {
  const existing = dayTypes ?? []
  if (existing.some((d) => d.day === day)) {
    return existing.map((d) => (d.day === day ? { ...d, dayType } : d))
  }
  return [...existing, { day, dayType }]
}

/** The weekday names currently set aside as Life days, in config order. */
export function lifeDayNames(dayTypes: readonly DayTypeConfig[] | undefined): string[] {
  return (dayTypes ?? [])
    .filter((d) => d.dayType === DayType.Life)
    .map((d) => d.day)
}

/** The weekday names currently set to Light (or the unoffered `appointment`). */
export function lightDayNames(dayTypes: readonly DayTypeConfig[] | undefined): string[] {
  return (dayTypes ?? [])
    .filter((d) => DAY_TYPE_SHAPE[d.dayType] === 'light')
    .map((d) => d.day)
}

// ── Enforcement ──────────────────────────────────────────────────────────────

/**
 * One day, reshaped by its type. Pure.
 *
 * A Life day keeps its `day` and `timeBudgetMinutes` and loses every item. It
 * keeps the budget rather than zeroing it because the budget is a property of
 * the week's shape, not a claim about this day, and a parent who switches the
 * day back to Full must get the day they had — this is a **relabel, never a
 * destruction**, on the draft exactly as FEAT-200 made it on the saved day.
 */
export function applyDayTypeToDay(
  day: DraftDayPlan,
  dayType: DayType,
  appBlocks: AppBlock[],
): DraftDayPlan {
  switch (DAY_TYPE_SHAPE[dayType]) {
    case 'keep':
      return day
    case 'light':
      return applyLightDayToplan(day, buildLightDayTemplate(appBlocks))
    case 'clear':
      return { ...day, items: [] }
  }
}

/**
 * The draft with every day forced to its type. **This is the control.**
 *
 * Called after parsing on every path that produces a fresh draft — the AI plan,
 * the local fallback, the recovery parse and the adjustment regenerate — so the
 * result does not depend on the model having read the hint. A model that returns
 * a full routine for a Life day gets that day emptied anyway; a model that
 * returns nothing for it was already right.
 */
export function enforceDayTypes(
  draft: DraftWeeklyPlan,
  dayTypes: readonly DayTypeConfig[] | undefined,
  appBlocks: AppBlock[],
): DraftWeeklyPlan {
  if (!dayTypes || dayTypes.length === 0) return draft
  if (dayTypes.every((d) => d.dayType === DayType.Normal)) return draft

  return {
    ...draft,
    days: draft.days.map((day) =>
      applyDayTypeToDay(day, resolvePlannerDayType(day.day, dayTypes), appBlocks),
    ),
  }
}

// ── What Apply writes to `dailyPlans` ────────────────────────────────────────

/**
 * The `planType` Apply should write for a day, or `null` for "write nothing".
 *
 * **This is the only place the planner touches a day's `planType`**, and it is a
 * different collection from everything else Apply writes: `planType` lives on
 * `dailyPlans/{date}_{childId}`, **not** on the DayLog. (The run prompt assumed
 * the DayLog; it is not there — `TodayPage` reads it via `useDailyPlan` and
 * `handleDayTypeChange` writes it via `saveDailyPlan`.)
 *
 * Two rules, and the second one is the reason this is a function rather than a
 * constant:
 *
 *  - a **Life** day writes `life`, so the day opens on Today as a Life Day —
 *    byte-identical to one the parent sets on the day, because it IS the same
 *    field.
 *  - a **Full or Light** day writes `normal` **only when the stored value is
 *    already `life`**, and otherwise writes nothing at all.
 *
 * The second rule is narrow on purpose. Without it, a parent who marks Tuesday
 * Life, applies, changes their mind to Full and re-applies gets a Tuesday whose
 * DayLog carries a full checklist that Today then hides — the plan writes work
 * nobody can see. With it, the correction reaches the day. And because it fires
 * **only** on a stored `life`, it can never touch an `mvd` a parent chose on
 * Today: a Minimum Viable Day survives every apply, as it always has.
 */
export function plannedPlanTypeWrite(
  dayType: DayType,
  existing: PlanType | undefined,
): PlanType | null {
  if (dayType === DayType.Life) return PlanType.Life
  return existing === PlanType.Life ? PlanType.Normal : null
}

// ── What the model is told ───────────────────────────────────────────────────

/**
 * The prompt section naming the days that are set aside or light, or `''` when
 * every day is Full.
 *
 * A courtesy, not the mechanism: {@link enforceDayTypes} holds the result either
 * way. It is worth sending because a model that knows Tuesday is out will
 * distribute the week's work across the days that remain, rather than producing
 * five days and having two of them deleted underneath it.
 *
 * The page passes it as the **first** section of `composePlannerMessage`, so it
 * lands ABOVE `buildPlannerPrompt`'s `YOUR #1 JOB` / `Every day MUST include ALL
 * of these activities` block rather than below it. That placement is the direct
 * lesson of the bug: the parent's fenced request sat at the bottom and lost to
 * the capitals at the top. Composing it here rather than inside
 * `buildPlannerPrompt` also keeps `chatPlanner.logic` from importing this
 * module, which would close an import cycle through
 * `appointmentResilience.logic`.
 */
export function buildDayTypeSection(dayTypes: readonly DayTypeConfig[] | undefined): string {
  const life = lifeDayNames(dayTypes)
  const light = lightDayNames(dayTypes)
  if (life.length === 0 && light.length === 0) return ''

  const lines: string[] = ['DAYS THE PARENT HAS SET — these override every rule above:']
  if (life.length > 0) {
    lines.push(
      `- ${life.join(', ')}: SET ASIDE. Do NOT output ${life.length > 1 ? 'these days' : 'this day'} at all.`,
      '  The family is doing something else and will record it on the day. Not a lighter plan — no plan.',
    )
  }
  if (light.length > 0) {
    lines.push(
      `- ${light.join(', ')}: LIGHT. App blocks plus one short writing task and one short math task only.`,
      '  The routine MUST-DO rule does not apply on a light day.',
    )
  }
  lines.push('- Spread the week\'s work across the remaining days rather than dropping it.')
  return lines.join('\n')
}
