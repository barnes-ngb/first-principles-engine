import { describe, expect, it } from 'vitest'

import {
  MO_CONFIG,
  TX_CONFIG,
  getStateConfig,
} from './stateCompliance'

// ─── DATA-12 characterization: MO must be byte-identical to the prior hardcode ──

describe('getStateConfig — Missouri (active default)', () => {
  it('defaults to MO when no state is given', () => {
    expect(getStateConfig()).toBe(MO_CONFIG)
    expect(getStateConfig(undefined)).toBe(MO_CONFIG)
  })

  it('reproduces the prior hardcoded MO hours targets exactly', () => {
    const cfg = getStateConfig('MO')
    expect(cfg.hoursRequirement).toEqual({
      total: 1000,
      core: 600,
      coreAtHome: 600,
    })
  })

  it('lists the five MO required core subjects in order', () => {
    expect(getStateConfig('MO').requiredCoreSubjects).toEqual([
      'Reading',
      'LanguageArts',
      'Math',
      'Science',
      'SocialStudies',
    ])
  })

  it('starts the school year on July 1', () => {
    expect(getStateConfig('MO').schoolYearStart).toEqual({ month: 7, day: 1 })
  })

  it('carries the RSMo 167.031 citation verbatim', () => {
    expect(getStateConfig('MO').legalCitation).toBe(
      'MO RSMo 167.031 requires 1,000 hours of instruction (600 in core subjects: Reading, Language Arts, Math, Science, Social Studies). At least 600 hours must occur at the regular place of instruction.',
    )
  })

  it('has no TEFA overlay', () => {
    expect(getStateConfig('MO').tefa).toBeNull()
  })

  it('ignores the tefaEnrolled toggle for MO (no overlay to flip)', () => {
    expect(getStateConfig('MO', { tefaEnrolled: true }).tefa).toBeNull()
  })
})

// ─── TX: defined, NOT activated ──────────────────────────────────────────────

describe('getStateConfig — Texas (defined, not activated)', () => {
  it('imposes no hours requirement', () => {
    expect(getStateConfig('TX').hoursRequirement).toBeNull()
  })

  it('best-effort maps the five TX areas to existing subject buckets', () => {
    // spelling + grammar collapse into LanguageArts; good citizenship →
    // SocialStudies (the imperfect mapping flagged in the config).
    expect(getStateConfig('TX').requiredCoreSubjects).toEqual([
      'Reading',
      'LanguageArts',
      'Math',
      'SocialStudies',
    ])
  })

  it('uses the Leeper / Educ. Code citation', () => {
    expect(getStateConfig('TX').legalCitation).toBe(
      'Tex. Educ. Code §25.086 / Leeper v. Arlington ISD',
    )
  })

  it('carries a TEFA overlay (not enrolled by default)', () => {
    expect(getStateConfig('TX').tefa).toEqual({
      enrolled: false,
      testingRequired: true,
      testingGradeBand: [3, 12],
      perStudentCap: 2000,
    })
  })

  it('tefaEnrolled toggle flips enrollment without mutating the base config', () => {
    const enrolled = getStateConfig('TX', { tefaEnrolled: true })
    expect(enrolled.tefa?.enrolled).toBe(true)
    // The shared TX_CONFIG singleton is untouched (no mutation).
    expect(TX_CONFIG.tefa?.enrolled).toBe(false)
    expect(getStateConfig('TX').tefa?.enrolled).toBe(false)
  })
})
