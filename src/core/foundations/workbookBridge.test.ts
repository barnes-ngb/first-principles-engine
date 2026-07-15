import { describe, expect, it } from 'vitest'

import {
  applyBridgeCoverageToModel,
  bridgeCoveredConcepts,
  isPositionAddressable,
  resolveNativePosition,
  workbookBridgeForSource,
} from './workbookBridge'
import type { BridgeCoverage, WorkbookBridge } from './workbookBridge'
import { fastPhonicsWorkbookBridge } from './fastPhonicsBridge'
import type { LearnerModel, ModalityCalibration } from '../types/learnerModel'

// ── Fixtures ─────────────────────────────────────────────────────────────

/** A tiny synthetic bridge whose config position IS its native unit (identity
 *  lessonToUnit), for the "bridged source at unit 1" fixture. */
const TEST_BRIDGE: WorkbookBridge = {
  sourceId: 'testMath',
  aliases: ['test math', 'tm'],
  version: 1,
  units: [
    { unitLabel: 'Unit 1', upToLesson: 1, covers: ['math.number.counting'] },
    { unitLabel: 'Unit 2', upToLesson: 2, covers: ['math.number.comparison'] },
    {
      unitLabel: 'Unit 3',
      upToLesson: 3,
      // re-covers counting at a higher unit → dedup should keep Unit 3's label
      covers: ['math.number.counting', 'math.operations.addWithin20'],
    },
  ],
  lessonToUnit: (lesson) => lesson, // config position == native unit
}

const EMPTY_CALIBRATION: ModalityCalibration = {
  reading: { note: '' },
  writing: { note: '' },
  math: { note: '' },
}

function baseModel(overrides?: Partial<LearnerModel>): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: {},
    modalityCalibration: EMPTY_CALIBRATION,
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

const NOW = '2026-07-15T12:00:00.000Z'
const idsOf = (c: BridgeCoverage[]) => c.map((x) => x.conceptId).sort()

// ── workbookBridgeForSource — tolerant lookup ─────────────────────────────

describe('workbookBridgeForSource', () => {
  it('resolves the shipped Fast Phonics bridge by canonical id + free-text', () => {
    expect(workbookBridgeForSource('fastPhonics')).toBe(fastPhonicsWorkbookBridge)
    expect(workbookBridgeForSource('Fast Phonics')).toBe(fastPhonicsWorkbookBridge)
    expect(workbookBridgeForSource('reading eggs fast phonics')).toBe(
      fastPhonicsWorkbookBridge,
    )
  })

  it('returns null for an UNBRIDGED source (Mathseeds / TGTB draft-only)', () => {
    expect(workbookBridgeForSource('Mathseeds')).toBeNull()
    expect(workbookBridgeForSource('The Good and the Beautiful Math')).toBeNull()
    expect(workbookBridgeForSource('TGTB Language Arts')).toBeNull()
    expect(workbookBridgeForSource('')).toBeNull()
    expect(workbookBridgeForSource(undefined)).toBeNull()
  })
})

// ── bridgeCoveredConcepts — the deterministic conversion ──────────────────

describe('bridgeCoveredConcepts', () => {
  it('is cumulative — reaching Unit 2 covers Units 1–2', () => {
    expect(idsOf(bridgeCoveredConcepts(TEST_BRIDGE, 2))).toEqual([
      'math.number.comparison',
      'math.number.counting',
    ])
  })

  it('a bridged source at unit 1 covers ONLY unit 1', () => {
    const cov = bridgeCoveredConcepts(TEST_BRIDGE, 1)
    expect(idsOf(cov)).toEqual(['math.number.counting'])
    expect(cov[0].unitLabel).toBe('Unit 1')
  })

  it('dedupes per concept, keeping the HIGHEST unit as the label', () => {
    const cov = bridgeCoveredConcepts(TEST_BRIDGE, 3)
    const counting = cov.filter((c) => c.conceptId === 'math.number.counting')
    expect(counting).toHaveLength(1) // covered at Units 1 & 3 → one entry
    expect(counting[0].unitLabel).toBe('Unit 3') // highest wins
  })

  it('position 0 (below every unit) covers nothing', () => {
    expect(bridgeCoveredConcepts(TEST_BRIDGE, 0)).toEqual([])
  })

  it('Fast Phonics at a mapped NATIVE position (peak) reproduces the peak spine', () => {
    // The generalized fn over the shipped FP bridge = the curated peak mapping.
    const at13 = idsOf(bridgeCoveredConcepts(fastPhonicsWorkbookBridge, 13))
    expect(at13).toContain('reading.phonics.digraphs') // Peak 8
    expect(at13).toContain('reading.phonics.blends') // Peak 13 frontier
    expect(at13).not.toContain('reading.phonics.longVowels') // silent-e is Peak 18
    // cumulative + monotonic: Peak 20 ⊇ Peak 13
    const at20 = new Set(idsOf(bridgeCoveredConcepts(fastPhonicsWorkbookBridge, 20)))
    for (const id of at13) expect(at20.has(id)).toBe(true)
    expect([...at20]).toContain('reading.phonics.longVowels')
  })
})

// ── resolveNativePosition — the lesson-vs-native gate (FEAT-63 §0.2) ───────

describe('resolveNativePosition', () => {
  it('Fast Phonics config position does NOT resolve — lessonToUnit is uncurated', () => {
    // "Lesson 90" must NOT map to Peak 90 or all peaks; the source is gated.
    expect(resolveNativePosition(fastPhonicsWorkbookBridge, 90)).toBeNull()
    expect(resolveNativePosition(fastPhonicsWorkbookBridge, 1)).toBeNull()
  })

  it('a bridge with an identity lessonToUnit resolves config → native', () => {
    expect(resolveNativePosition(TEST_BRIDGE, 2)).toBe(2)
  })

  it('is position-addressable regardless (FP units carry peak boundaries)', () => {
    expect(isPositionAddressable(fastPhonicsWorkbookBridge)).toBe(true)
    expect(isPositionAddressable(TEST_BRIDGE)).toBe(true)
  })
})

// ── applyBridgeCoverageToModel — cap / no-downgrade / dedup / ask-dedup ────

describe('applyBridgeCoverageToModel', () => {
  const coverage: BridgeCoverage[] = [
    { conceptId: 'math.number.counting', unitLabel: 'Unit 3' },
  ]

  it('caps a fresh concept at forming (§13, covered ≠ mastered)', () => {
    const { model, changedConceptIds } = applyBridgeCoverageToModel(
      baseModel(),
      coverage,
      'testMath',
      NOW,
    )
    expect(model.conceptStates['math.number.counting'].state).toBe('forming')
    expect(changedConceptIds).toEqual(['math.number.counting'])
    const ev = model.conceptStates['math.number.counting'].evidence[0]
    expect(ev.kind).toBe('curriculumPosition')
    expect(ev.source).toBe('testMath')
    expect(ev.unit).toBe('Unit 3')
    expect(ev.via).toBe('scan')
  })

  it('NEVER downgrades a stronger standing state (solid stays solid, gains ref)', () => {
    const prior = baseModel({
      conceptStates: {
        'math.number.counting': {
          state: 'solid',
          evidence: [
            {
              kind: 'attestation',
              sourceId: 'reviewChat',
              note: 'seen it',
              observedAt: '2026-07-02T00:00:00.000Z',
            },
          ],
        },
      },
    })
    const { model } = applyBridgeCoverageToModel(prior, coverage, 'testMath', NOW)
    const entry = model.conceptStates['math.number.counting']
    expect(entry.state).toBe('solid') // unchanged
    expect(entry.evidence).toHaveLength(2) // attestation + new curriculumPosition
    expect(entry.evidence[1].kind).toBe('curriculumPosition')
  })

  it('dedupes evidence by source — re-syncing UPDATES rather than piles up', () => {
    const first = applyBridgeCoverageToModel(baseModel(), coverage, 'testMath', NOW).model
    const second = applyBridgeCoverageToModel(
      first,
      [{ conceptId: 'math.number.counting', unitLabel: 'Unit 5' }],
      'testMath',
      '2026-07-16T00:00:00.000Z',
    ).model
    const evs = second.conceptStates['math.number.counting'].evidence
    const fromSource = evs.filter((e) => e.source === 'testMath')
    expect(fromSource).toHaveLength(1) // one ref per source
    expect(fromSource[0].unit).toBe('Unit 5') // the latest position
  })

  it('queues at most ONE verify-ask per concept, deduped against unresolved asks', () => {
    const first = applyBridgeCoverageToModel(baseModel(), coverage, 'testMath', NOW).model
    expect(first.openQuestions.filter((q) => q.conceptId === 'math.number.counting')).toHaveLength(1)
    // re-apply → still one (unresolved dup swallowed)
    const second = applyBridgeCoverageToModel(first, coverage, 'testMath', NOW).model
    expect(
      second.openQuestions.filter((q) => q.conceptId === 'math.number.counting'),
    ).toHaveLength(1)
  })

  it('a RESOLVED ask does not block a fresh re-queue (2c convention)', () => {
    const withResolved = baseModel({
      openQuestions: [
        {
          conceptId: 'math.number.counting',
          question: 'old',
          routedTo: 'quest',
          reason: 'r',
          resolvedAt: '2026-07-10T00:00:00.000Z',
        },
      ],
    })
    const { model } = applyBridgeCoverageToModel(withResolved, coverage, 'testMath', NOW)
    const asks = model.openQuestions.filter((q) => q.conceptId === 'math.number.counting')
    expect(asks).toHaveLength(2) // resolved kept + fresh queued
  })

  it('appends a deterministic changeFeed line naming source + unit + cap', () => {
    const { model } = applyBridgeCoverageToModel(baseModel(), coverage, 'testMath', NOW)
    const line = model.changeFeed.at(-1)!
    expect(line.conceptId).toBe('math.number.counting')
    expect(line.to).toBe('forming')
    expect(line.cause).toContain('testMath')
    expect(line.cause).toContain('Unit 3')
    expect(line.at).toBe(NOW)
  })

  it('honors the `via` argument (manual edits stamp via:manual)', () => {
    const { model } = applyBridgeCoverageToModel(baseModel(), coverage, 'testMath', NOW, 'manual')
    expect(model.conceptStates['math.number.counting'].evidence[0].via).toBe('manual')
  })

  it('silently skips a coverage entry naming an unknown node', () => {
    const { model, changedConceptIds } = applyBridgeCoverageToModel(
      baseModel(),
      [{ conceptId: 'math.not.a.real.node', unitLabel: 'Unit 1' }],
      'testMath',
      NOW,
    )
    expect(changedConceptIds).toEqual([])
    expect(model.conceptStates['math.not.a.real.node']).toBeUndefined()
  })
})
