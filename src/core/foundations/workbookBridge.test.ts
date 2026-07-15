import { describe, expect, it } from 'vitest'

import {
  applyBridgeCoverageToModel,
  bridgeCoveredConcepts,
  isPositionAddressable,
  maxWitnessedNativePosition,
  resolveNativePosition,
  resolveSyncNativePosition,
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

  it('resolves the Mathseeds bridge activated in FEAT-64', () => {
    // Draft-only under FEAT-63; FEAT-64 ships it as data.
    expect(workbookBridgeForSource('Mathseeds')?.sourceId).toBe('mathseeds')
    expect(workbookBridgeForSource('math seeds')?.sourceId).toBe('mathseeds')
  })

  it('resolves the TGTB LA1 bridge activated in FEAT-64', () => {
    expect(workbookBridgeForSource('TGTB Language Arts')?.sourceId).toBe(
      'tgtbLanguageArts1',
    )
    expect(workbookBridgeForSource('tgtb la')?.sourceId).toBe('tgtbLanguageArts1')
  })

  it('returns null for a still-UNBRIDGED source (TGTB Math) and empties', () => {
    expect(workbookBridgeForSource('The Good and the Beautiful Math')).toBeNull()
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
  it('Fast Phonics now resolves via the OWNER divisor (ceil(lesson / 5))', () => {
    // FEAT-64: the lesson→peak question was answered — an FP-internal lesson counter.
    expect(resolveNativePosition(fastPhonicsWorkbookBridge, 90)).toBe(18) // 90/5
    expect(resolveNativePosition(fastPhonicsWorkbookBridge, 1)).toBe(1) // clamped ≥ 1
    expect(resolveNativePosition(fastPhonicsWorkbookBridge, 65)).toBe(13) // 65/5
    expect(resolveNativePosition(fastPhonicsWorkbookBridge, 500)).toBe(20) // clamped ≤ 20
  })

  it('a not-started Fast Phonics position (0 / negative) resolves to null', () => {
    // `currentPosition: 0` is the not-started sentinel; must NOT write Peak-1 evidence.
    expect(resolveNativePosition(fastPhonicsWorkbookBridge, 0)).toBeNull()
    expect(resolveNativePosition(fastPhonicsWorkbookBridge, -3)).toBeNull()
  })

  it('a bridge with an identity lessonToUnit resolves config → native', () => {
    expect(resolveNativePosition(TEST_BRIDGE, 2)).toBe(2)
  })

  it('is position-addressable regardless (FP units carry peak boundaries)', () => {
    expect(isPositionAddressable(fastPhonicsWorkbookBridge)).toBe(true)
    expect(isPositionAddressable(TEST_BRIDGE)).toBe(true)
  })
})

// ── The conflict rule — a divisor GUESS defers to a WITNESS (FEAT-64 §3) ───

describe('resolveSyncNativePosition — Fast Phonics conflict rule', () => {
  /** A model carrying a DIRECT Peak-13 witness from the Review-Chat upload path.
   *  Uses the CANONICAL `fastPhonics` source (the review prompt emits the bridge id,
   *  so a real witness shares source/sourceId with a sync write) — it is a witness
   *  purely because it is NOT `positionSync`. This pins the P1 fix: source string is
   *  NOT the discriminator, the `positionSync` marker is. */
  function peak13WitnessModel(): LearnerModel {
    return baseModel({
      conceptStates: {
        'reading.phonics.blends': {
          state: 'forming',
          evidence: [
            {
              kind: 'curriculumPosition',
              sourceId: 'fastPhonics', // canonical — same as a self-sync would use
              note: 'Covered in fastPhonics Peak 13',
              observedAt: '2026-07-10T00:00:00.000Z',
              source: 'fastPhonics',
              unit: 'Peak 13',
              via: 'manual',
              // NO positionSync ⇒ a genuine witness, not the sync's own write.
            },
          ],
        },
      },
    })
  }

  it('caps L90 (guess Peak 18) at the witnessed Peak 13 — guesses defer to witnesses', () => {
    const model = peak13WitnessModel()
    expect(resolveSyncNativePosition(fastPhonicsWorkbookBridge, 90, model)).toBe(13)
  })

  it('the capped position yields PEAK-13 coverage, never the guessed Peak-18 content', () => {
    const model = peak13WitnessModel()
    const capped = resolveSyncNativePosition(fastPhonicsWorkbookBridge, 90, model)!
    const ids = new Set(
      bridgeCoveredConcepts(fastPhonicsWorkbookBridge, capped).map((c) => c.conceptId),
    )
    expect(ids).toContain('reading.phonics.blends') // Peak 13
    expect(ids).not.toContain('reading.phonics.longVowels') // Peak 18 (silent-e) — never
  })

  it('does NOT inflate when the guess is BELOW the witness (min of the two)', () => {
    const model = peak13WitnessModel()
    // L40 → guess Peak 8; witness is 13, so the lower guess stands.
    expect(resolveSyncNativePosition(fastPhonicsWorkbookBridge, 40, model)).toBe(8)
  })

  it('with NO witness, the divisor guess passes through (grows with the lesson)', () => {
    expect(resolveSyncNativePosition(fastPhonicsWorkbookBridge, 90, baseModel())).toBe(18)
    expect(resolveSyncNativePosition(fastPhonicsWorkbookBridge, 90, null)).toBe(18)
  })

  it('a self-sync write (positionSync: true) is NOT a witness — guess grows freely', () => {
    // The sync must not cap itself: a prior sync write (marked positionSync) at a
    // LOWER peak must not freeze future growth as the lesson advances.
    const selfOnly = baseModel({
      conceptStates: {
        'reading.phonics.blends': {
          state: 'forming',
          evidence: [
            {
              kind: 'curriculumPosition',
              sourceId: 'fastPhonics',
              note: 'Covered in fastPhonics Peak 10',
              observedAt: '2026-07-10T00:00:00.000Z',
              source: 'fastPhonics',
              unit: 'Peak 10',
              via: 'scan',
              positionSync: true, // the sync's own write
            },
          ],
        },
      },
    })
    // No genuine witness → the L90 guess (18) is free to stand, uncapped by Peak 10.
    expect(resolveSyncNativePosition(fastPhonicsWorkbookBridge, 90, selfOnly)).toBe(18)
  })

  it('deterministic band bridges (Mathseeds/TGTB) ignore the conflict rule', () => {
    // TEST_BRIDGE is not provisional → passes straight through regardless of model.
    const model = peak13WitnessModel()
    expect(resolveSyncNativePosition(TEST_BRIDGE, 2, model)).toBe(2)
  })
})

// ── maxWitnessedNativePosition — witness detection ─────────────────────────

describe('maxWitnessedNativePosition', () => {
  it('returns the highest witnessed peak, ignoring positionSync self-writes', () => {
    const model = baseModel({
      conceptStates: {
        a: {
          state: 'forming',
          evidence: [
            { kind: 'curriculumPosition', sourceId: 'fastPhonics', note: '', observedAt: NOW, source: 'fastPhonics', unit: 'Peak 8' },
            { kind: 'curriculumPosition', sourceId: 'fastPhonics', note: '', observedAt: NOW, source: 'fastPhonics', unit: 'Peak 13' },
            { kind: 'curriculumPosition', sourceId: 'fastPhonics', note: '', observedAt: NOW, source: 'fastPhonics', unit: 'Peak 17', positionSync: true }, // self-write, ignored
          ],
        },
      },
    })
    // The Peak-17 self-write is ignored; the highest genuine witness (Peak 13) wins —
    // even though ALL three share the canonical `fastPhonics` source (the P1 case).
    expect(maxWitnessedNativePosition(model, fastPhonicsWorkbookBridge)).toBe(13)
  })

  it('returns null when there are no witnesses', () => {
    expect(maxWitnessedNativePosition(baseModel(), fastPhonicsWorkbookBridge)).toBeNull()
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

  it('stamps its own writes positionSync:true and PRESERVES a canonical-source witness', () => {
    // A Review-Chat witness on the SAME canonical source (the P1 case) must survive a
    // sync write — the dedup removes only the sync's OWN prior refs, not the witness.
    const withWitness = baseModel({
      conceptStates: {
        'math.number.counting': {
          state: 'forming',
          evidence: [
            {
              kind: 'curriculumPosition',
              sourceId: 'testMath',
              note: 'Covered in testMath Unit 9 (upload)',
              observedAt: '2026-07-02T00:00:00.000Z',
              source: 'testMath',
              unit: 'Unit 9',
              via: 'manual',
              // NO positionSync ⇒ a witness
            },
          ],
        },
      },
    })
    const { model } = applyBridgeCoverageToModel(withWitness, coverage, 'testMath', NOW)
    const evs = model.conceptStates['math.number.counting'].evidence
    // The witness is preserved; the sync's own write is appended + marked.
    expect(evs.some((e) => e.unit === 'Unit 9' && !e.positionSync)).toBe(true)
    expect(evs.some((e) => e.unit === 'Unit 3' && e.positionSync === true)).toBe(true)
    expect(evs).toHaveLength(2)
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
