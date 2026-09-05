/**
 * The day-type picker's words (FEAT-200).
 *
 * Three peers, and the copy may not rank them. Each line says what that kind of
 * day **is** — never what it lacks, never how much of another kind it manages.
 * "A lighter version of a Normal Day", "when you can't do the full routine",
 * "the bare minimum" would all be rankings; so would ordering them by size.
 *
 * This is the charter showing up in a dropdown. Both existing types already
 * count as real school (CLAUDE.md › Energy Modes) and the third one does too, so
 * a parent choosing between them is choosing a shape, not confessing a shortfall.
 *
 * Strings only: no state, no behavior. Held to that rule by
 * `dayTypeChoices.test.ts`.
 */
import { PlanType } from '../../core/types/enums'
import { LIFE_DAY_COPY } from './lifeDay'

export interface DayTypeChoice {
  value: PlanType
  /** One line saying what this kind of day is. Never a comparison. */
  description: string
}

export const DAY_TYPE_CHOICES: readonly DayTypeChoice[] = [
  {
    value: PlanType.Normal,
    description: 'The full routine — formation, stations, and a together block.',
  },
  {
    value: PlanType.Mvd,
    description: 'Prayer, read-aloud, math, a project, one line of reflection.',
  },
  {
    value: PlanType.Life,
    description: LIFE_DAY_COPY.description,
  },
]
