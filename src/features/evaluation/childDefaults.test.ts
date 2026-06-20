import { describe, expect, it } from 'vitest'

import {
  defaultEvidenceDefinitions as lincolnEvidence,
  defaultPrioritySkills as lincolnPrioritySkills,
  defaultStopRules as lincolnStopRules,
  defaultSupports as lincolnSupports,
} from './lincolnDefaults'
import {
  defaultPrioritySkills as londonPrioritySkills,
} from './londonDefaults'
import { getDefaultsForChild, isEarlyGradeBand } from './childDefaults'

/** Birthdate string for a child of the given whole-year age (with a margin). */
function birthdateForAge(age: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - age)
  d.setMonth(d.getMonth() - 1) // ensure the birthday has already passed this year
  return d.toISOString().slice(0, 10)
}

describe('isEarlyGradeBand', () => {
  it('matches Pre-K / Kindergarten / grade 1 forms', () => {
    expect(isEarlyGradeBand('Pre-K')).toBe(true)
    expect(isEarlyGradeBand('PreK')).toBe(true)
    expect(isEarlyGradeBand('Kindergarten')).toBe(true)
    expect(isEarlyGradeBand('K')).toBe(true)
    expect(isEarlyGradeBand('1st grade')).toBe(true)
    expect(isEarlyGradeBand('First grade')).toBe(true)
    expect(isEarlyGradeBand('Grade 1')).toBe(true)
  })

  it('does not match older grades', () => {
    expect(isEarlyGradeBand('2nd grade')).toBe(false)
    expect(isEarlyGradeBand('4th grade')).toBe(false)
    expect(isEarlyGradeBand('10th grade')).toBe(false)
  })

  it('returns false for missing/blank grade', () => {
    expect(isEarlyGradeBand(undefined)).toBe(false)
    expect(isEarlyGradeBand('')).toBe(false)
    expect(isEarlyGradeBand('   ')).toBe(false)
  })
})

describe('getDefaultsForChild', () => {
  it('selects London defaults for a kindergarten grade', () => {
    const defaults = getDefaultsForChild({ grade: 'Kindergarten' })
    expect(defaults.prioritySkills).toBe(londonPrioritySkills)
  })

  it('selects London defaults for an age-6 child by birthdate', () => {
    const defaults = getDefaultsForChild({ birthdate: birthdateForAge(6) })
    expect(defaults.prioritySkills).toBe(londonPrioritySkills)
  })

  it('selects London when age band qualifies even if grade is blank', () => {
    const defaults = getDefaultsForChild({ birthdate: birthdateForAge(5), grade: '' })
    expect(defaults.prioritySkills).toBe(londonPrioritySkills)
  })

  it('selects Lincoln defaults for an older child', () => {
    const defaults = getDefaultsForChild({ birthdate: birthdateForAge(10), grade: '4th grade' })
    expect(defaults.prioritySkills).toBe(lincolnPrioritySkills)
  })

  it('falls back to Lincoln when grade and age are unknown', () => {
    expect(getDefaultsForChild({}).prioritySkills).toBe(lincolnPrioritySkills)
    expect(getDefaultsForChild(null).prioritySkills).toBe(lincolnPrioritySkills)
    expect(getDefaultsForChild(undefined).prioritySkills).toBe(lincolnPrioritySkills)
  })

  it('returns Lincoln defaults byte-identical for an older child (characterization)', () => {
    const defaults = getDefaultsForChild({ birthdate: birthdateForAge(10), grade: '4th grade' })
    expect(defaults.prioritySkills).toEqual(lincolnPrioritySkills)
    expect(defaults.supports).toEqual(lincolnSupports)
    expect(defaults.stopRules).toEqual(lincolnStopRules)
    expect(defaults.evidenceDefinitions).toEqual(lincolnEvidence)
  })
})
