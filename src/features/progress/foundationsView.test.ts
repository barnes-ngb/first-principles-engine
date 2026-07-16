import { describe, expect, it } from 'vitest'

import type {
  ChangeEntry,
  EvidenceRef,
  LearnerModel,
  SynthesisMove,
} from '../../core/types/learnerModel'
import {
  computeFocusConfirmations,
  computeMovedFeed,
  countByState,
  evidenceSourceLine,
  groupTerrainByDomain,
  prettySource,
  scrubDisplayJargon,
} from './foundationsView'

describe('scrubDisplayJargon — §14 display rules', () => {
  it('strips band numbers, working-level numbers, and percentages', () => {
    expect(scrubDisplayJargon('Below phonics working level 4 (band 1 < frontier)')).not.toMatch(
      /band|level\s*\d|\d+\s*%/i,
    )
    expect(scrubDisplayJargon('3/350 sight words mastered (1%)')).not.toContain('%')
    expect(scrubDisplayJargon('3/350 sight words mastered (1%)')).not.toContain('/350')
    expect(scrubDisplayJargon('band 4')).not.toMatch(/band\s*\d/i)
  })

  it('keeps the actionable clause of a modality note readable', () => {
    const out = scrubDisplayJargon(
      'Reads around working level 4 — put short reading in activities at this level.',
    )
    expect(out).toContain('put short reading in activities')
    expect(out).not.toMatch(/level\s*\d/i)
  })

  it('leaves already-compliant prose untouched (source units survive)', () => {
    const prose = 'Blends are solid; long vowels are the next unlock. Fast Phonics Peak 13.'
    expect(scrubDisplayJargon(prose)).toBe(prose)
  })
})

describe('evidenceSourceLine — plain-language source, never the seeded note', () => {
  it('renders each evidence kind as a source + date, no jargon', () => {
    const cases: EvidenceRef[] = [
      { kind: 'attestation', sourceId: 'x', note: 'working level 4', observedAt: '2026-07-01' },
      {
        kind: 'curriculumPosition',
        sourceId: 'x',
        note: '',
        source: 'fastPhonics',
        unit: 'Peak 13',
        detail: '548 words known · 100% quizzes',
        observedAt: '2026-06-20',
      },
      { kind: 'workingLevel', sourceId: 'x', note: 'At phonics working level 4', observedAt: '2026-05-05' },
      { kind: 'sightWordShare', sourceId: 'x', note: '3/350 (1%)', observedAt: '2026-05-05' },
    ]
    for (const ref of cases) {
      const line = evidenceSourceLine(ref)
      expect(line).not.toMatch(/working level\s*\d|band\s*\d|\d+\s*%/i)
    }
    expect(evidenceSourceLine(cases[0])).toContain('You confirmed this')
    // Source units are allowed and useful.
    expect(evidenceSourceLine(cases[1])).toContain('Fast Phonics Peak 13')
    expect(evidenceSourceLine(cases[1])).toContain('548 words known')
  })

  it('prettifies canonical source ids', () => {
    expect(prettySource('fastPhonics')).toBe('Fast Phonics')
    expect(prettySource('mathseeds')).toBe('Mathseeds')
  })
})

// A minimal model keyed to real reading-graph node ids so the node-map lookups
// resolve to kid-word names.
const CVC = 'reading.phonics.cvc'

function baseModel(overrides: Partial<LearnerModel> = {}): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'synthesized',
    conceptStates: {
      [CVC]: { state: 'solid', evidence: [] },
    },
    modalityCalibration: {
      reading: { note: 'x' },
      writing: { note: 'x' },
      math: { note: 'x' },
    },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: '2026-07-01',
    updatedAt: '2026-07-01',
    ...overrides,
  }
}

describe('groupTerrainByDomain / countByState', () => {
  it('groups known concepts by domain and counts states', () => {
    const model = baseModel()
    const domains = groupTerrainByDomain(model)
    expect(domains.length).toBeGreaterThan(0)
    expect(domains[0].domain).toBe('reading')
    expect(domains[0].concepts[0].kidName).toBeTruthy()
    expect(domains[0].concepts[0].kidName).not.toBe(CVC) // plain name, not the id
    expect(countByState(model).solid).toBe(1)
  })
})

describe('computeFocusConfirmations — loop confirmation (G3)', () => {
  const solidMove: SynthesisMove[] = [
    { conceptId: CVC, kidName: 'Sound out short words', why: 'next unlock', suggestedVehicle: 'quest' },
  ]

  it('fires a confirmation only for → solid graduations, most-recent first', () => {
    const feed: ChangeEntry[] = [
      { conceptId: CVC, from: 'frontier', to: 'solid', cause: 'quest', at: '2026-07-10' },
      { conceptId: 'reading.phonics.blends', from: 'not-yet', to: 'forming', cause: 'review', at: '2026-07-12' },
      { conceptId: 'reading.phonics.digraphs', from: 'forming', to: 'solid', cause: 'quest', at: '2026-07-14' },
    ]
    const confs = computeFocusConfirmations(feed, solidMove)
    // Two → solid entries qualify; the forming one does not.
    expect(confs).toHaveLength(2)
    expect(confs[0].at).toBe('2026-07-14') // most recent first
    // CVC is also a current focus → wasFocus true.
    const cvcConf = confs.find((c) => c.conceptId === CVC)
    expect(cvcConf?.wasFocus).toBe(true)
    expect(cvcConf?.kidName).not.toBe(CVC)
  })

  it('returns nothing when no concept became solid', () => {
    const feed: ChangeEntry[] = [
      { conceptId: CVC, from: 'not-yet', to: 'forming', cause: 'review', at: '2026-07-10' },
    ]
    expect(computeFocusConfirmations(feed, solidMove)).toHaveLength(0)
  })
})

describe('computeMovedFeed — accumulating, never a downgrade phrasing', () => {
  it('renders positive lines, most-recent first', () => {
    const feed: ChangeEntry[] = [
      { conceptId: CVC, from: 'frontier', to: 'solid', cause: 'quest', at: '2026-07-01' },
      { conceptId: 'reading.phonics.blends', from: 'not-yet', to: 'forming', cause: 'review', at: '2026-07-05' },
    ]
    const moved = computeMovedFeed(feed)
    expect(moved[0].at).toBe('2026-07-05')
    expect(moved.some((m) => m.line.includes('became solid'))).toBe(true)
    expect(moved.every((m) => !/\bnot\b.*\bsolid\b|down|regress|lost/i.test(m.line))).toBe(true)
  })
})
