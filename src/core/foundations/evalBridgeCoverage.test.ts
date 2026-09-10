// ── Characterization test for UX-288 (filed by AUDIT-217, fixed by FIX-224) ──
//
// `computeEvalRead` is the guided evaluation's route into the learner model —
// the ONE calibrated writer, the only path permitted to move a concept toward
// the working edge. It routes each finding through the shared `mapFindingToNode`
// bridge and then DROPS anything whose target is not a node in the foundations
// graph (`!FOUNDATION_NODE_MAP[conceptId]`).
//
// That filter is correct. What was wrong was what fell through it: the finding
// bridge answers `math.addition` / `math.subtraction` with
// `math.operations.addSub`, and `math.multiplication` / `math.division` with
// `math.operations.multDiv` — **`curriculumMap` node ids, which the math graph
// does not define.** So an eval's most likely math findings for a child working
// at ~3rd grade produced no evidence, no state and no changeFeed line.
//
// **FIX-224 did not repoint the bridge, and this file is the record of why.**
// Both ids are live `curriculumMap` nodes with four declared dependants and
// stored `childSkillMaps` entries written against them, so `mapFindingToNode`,
// `curriculumMap.ts` and the skill-map writers are unchanged — every assertion
// below that pins the OLD bridge behaviour still passes, deliberately. The
// repair is a second, foundations-side resolution
// (`curriculumNodeBridge.resolveFoundationConcepts`) that reads the finding's
// OWN detail — the part `mapFindingToNode` discards when it collapses
// `math.addition.within-20` to `addSub` — and answers with the concept the tag
// actually names, or with none.
//
// What this file therefore asserts, in order: the bridge is unchanged; the
// eval's math tags now land; a tag too coarse to name a concept still writes
// nothing (by rule, not by accident); the declared writing/speech boundary is
// untouched; and the skill-map side is untouched.
//
// Read-only: this file adds no behaviour and touches no other test.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { FOUNDATION_NODE_MAP } from './index'
import { computeEvalRead } from './evalModelSync'
import { FoundationBridgeOutcome, resolveFoundationConcepts } from './curriculumNodeBridge'
import { mapFindingToNode } from '../curriculum/mapFindingToNode'
import { CURRICULUM_NODE_MAP } from '../curriculum/curriculumMap'
import { TAG_CONCEPT_BRIDGE } from './tagConceptBridge'
import { promptListTags } from '../../test/findingTagBridge'
import { loadChatPromptSource } from '../../test/findingTagSources'
import type { EvaluationFinding } from '../types/evaluation'

function finding(skill: string, status: EvaluationFinding['status'] = 'not-yet'): EvaluationFinding {
  return { skill, status, evidence: 'characterization fixture' } as EvaluationFinding
}

/**
 * The math skill tags the eval prompt itself tells the model to emit — copied
 * from the "SKILL TAGS for math findings" list in `functions/src/ai/chat.ts`,
 * in prompt order. Named rather than counted: this list is the actual input
 * surface, so it is its own check and cannot drift against a recount.
 *
 * It is a hand copy, so AUDIT-226 added the one thing that keeps a hand copy
 * honest — a test below asserting it equals the list the census DERIVES from
 * that prompt file. Without it, a tag added to the prompt would leave this
 * suite green while the tag reached nothing.
 */
const EVAL_PROMPT_MATH_TAGS = [
  'math.number-sense',
  'math.addition.within-20',
  'math.subtraction.within-20',
  'math.place-value',
  'math.two-digit.addition',
  'math.two-digit.subtraction',
  'math.word-problems.multi-step',
  'math.multiplication.facts',
  'math.multi-digit.multiplication',
  'math.division.basic',
  'math.fractions.recognizing',
  'math.fractions.comparing',
  'math.fractions.operations',
  'math.measurement',
  'math.time',
  'math.money',
  'math.multi-digit.subtraction',
  'math.subtraction.regrouping',
  'math.multiplication.tables',
  'math.times-tables',
] as const

describe('AUDIT-226 — the hand-copied prompt list still matches the prompt', () => {
  it('equals the list derived from the SKILL TAGS block itself', () => {
    const derived = promptListTags(loadChatPromptSource()).filter((t) => t.startsWith('math.'))
    expect(derived).toEqual([...EVAL_PROMPT_MATH_TAGS])
  })
})

describe('UX-288 — the finding bridge is UNCHANGED, and still answers in curriculumMap ids', () => {
  it('still maps addition and subtraction to a node the foundations graph does not define', () => {
    for (const tag of ['math.addition', 'math.subtraction']) {
      expect(mapFindingToNode(tag), `${tag} still resolves through the finding bridge`).toBe(
        'math.operations.addSub',
      )
    }
    expect(
      FOUNDATION_NODE_MAP['math.operations.addSub'],
      'math.operations.addSub is a curriculumMap id, not a foundations concept',
    ).toBeUndefined()
  })

  it('still maps multiplication and division to a node the foundations graph does not define', () => {
    for (const tag of ['math.multiplication', 'math.division']) {
      expect(mapFindingToNode(tag), `${tag} still resolves through the finding bridge`).toBe(
        'math.operations.multDiv',
      )
    }
    expect(
      FOUNDATION_NODE_MAP['math.operations.multDiv'],
      'math.operations.multDiv is a curriculumMap id, not a foundations concept',
    ).toBeUndefined()
  })

  it('keeps both ids load-bearing in the curriculum map — which is why they were not repointed', () => {
    // The four dependants that would have been orphaned. Named, not counted.
    const dependants = [
      'math.operations.multiDigit',
      'math.fractions.concepts',
      'math.measurement.time',
      'math.geometry.area',
    ]
    for (const id of dependants) {
      const deps = CURRICULUM_NODE_MAP[id]?.dependencies ?? []
      expect(
        deps.some((d) => d === 'math.operations.addSub' || d === 'math.operations.multDiv'),
        `${id} depends on one of the two ids`,
      ).toBe(true)
    }
  })
})

describe('UX-288 — the eval now reaches the concepts its findings are about', () => {
  it('lands every math tag the eval prompt emits, except the one that names three concepts', () => {
    const landed: string[] = []
    const dropped: string[] = []
    for (const tag of EVAL_PROMPT_MATH_TAGS) {
      const reads = computeEvalRead([finding(tag)])
      ;(reads.length > 0 ? landed : dropped).push(tag)
      for (const read of reads) {
        expect(FOUNDATION_NODE_MAP[read.conceptId], `${tag} → ${read.conceptId}`).toBeDefined()
      }
    }

    // Before FIX-224 twelve of these wrote nothing. One still does — and FIX-226
    // changed WHY, which is the whole point of that run. `math.number-sense` used
    // to resolve to nothing at all (UX-346); it now resolves to the curriculum
    // map's Level-1 number node, and the learner-model half DECLINES by rule
    // because the tag's own gloss names three K-band concepts at once. A drop by
    // declared rule with a recorded outcome is not the same thing as a tag
    // falling off the end of a keyword chain into a `console.warn`.
    expect(dropped).toEqual(['math.number-sense'])
    expect(mapFindingToNode('math.number-sense')).toBe('math.number.counting')
    expect(
      resolveFoundationConcepts(mapFindingToNode('math.number-sense'), 'math.number-sense').outcome,
    ).toBe(FoundationBridgeOutcome.NoDetail)
    // …and a Level-1 tag that says WHICH skill was tested lands.
    expect(computeEvalRead([finding('math.number-sense.counting')])[0]?.conceptId).toBe(
      'math.number.counting',
    )
    expect(landed).toHaveLength(EVAL_PROMPT_MATH_TAGS.length - 1)
  })

  it('produces one concept per finding for the four core operations — INVERTED from the drop', () => {
    // The case AUDIT-217 filed, in the tags the prompt actually emits. Each
    // finding lands on exactly one concept: a finding is never fanned out.
    const reads = computeEvalRead([
      finding('math.addition.within-20'),
      finding('math.subtraction.within-20'),
      finding('math.multiplication.facts'),
      finding('math.division.basic'),
    ])
    expect(reads.map((r) => r.conceptId).sort()).toEqual([
      'math.operations.addWithin20',
      'math.operations.division',
      'math.operations.multFacts',
      'math.operations.subWithin20',
    ])
    // A tested `not-yet` finding reads as `frontier` (the positive framing).
    for (const read of reads) expect(read.state).toBe('frontier')
  })

  it('carries the concept its own kidName into the evidence note', () => {
    const [read] = computeEvalRead([finding('math.subtraction.regrouping', 'mastered')])
    expect(read.conceptId).toBe('math.operations.regrouping')
    // Was `math.operations.addSub` → dropped; the note could not exist at all.
    expect(read.note).toContain('Carry and borrow')
    expect(read.state).toBe('solid')
  })
})

describe('UX-288 — a tag too coarse to name a concept still writes nothing', () => {
  it('drops a bare math.addition, and records that it declined rather than missed', () => {
    expect(computeEvalRead([finding('math.addition')])).toHaveLength(0)
    const r = resolveFoundationConcepts(mapFindingToNode('math.addition'), 'math.addition')
    expect(r.outcome).toBe(FoundationBridgeOutcome.NoDetail)
  })
})

describe('UX-288 — the declared boundary and the skill-map side are untouched', () => {
  // The census's first probe list was hand-built and missed targets; Codex round 1
  // found `speech.connected`, and round 2 found the deeper problem — a hand-copied
  // list is not a closed set at all. `mapFindingToNode` step 1 returns its INPUT
  // verbatim whenever that input is already a `CURRICULUM_NODE_MAP` id, so the
  // emittable set is the whole curriculum map (59 ids), which strictly contains the
  // prefix-table and keyword-fallback targets. This derives it from the map itself,
  // so the test cannot stay green while the list drifts — which is exactly how the
  // census got it wrong twice.
  it('emits only curriculumMap ids, and 25 of the 59 are not foundations concepts', () => {
    const emittable = Object.keys(CURRICULUM_NODE_MAP)
    expect(emittable.length).toBe(59)

    // Step 1 really is a verbatim passthrough for every one of them.
    for (const id of emittable) expect(mapFindingToNode(id)).toBe(id)

    const dropped = emittable.filter((id) => !FOUNDATION_NODE_MAP[id])
    expect(dropped).toHaveLength(25)

    // The two math ones were the defect, and they are still absent from the
    // foundations graph — FIX-224 resolves them on the READING side rather than
    // adding them here. The other 23 are the declared domain boundary:
    // `FoundationDomain` is reading + math, so curriculumMap's whole writing and
    // speech halves have nowhere to land by design.
    expect(dropped.filter((id) => id.startsWith('math.')).sort()).toEqual([
      'math.operations.addSub',
      'math.operations.multDiv',
    ])
    expect(dropped.filter((id) => id.startsWith('writing.'))).toHaveLength(13)
    expect(dropped.filter((id) => id.startsWith('speech.'))).toHaveLength(10)
    // Nothing else — no reading node is dropped.
    expect(dropped.filter((id) => id.startsWith('reading.'))).toEqual([])
  })

  it('the prefix table and keyword fallbacks stay within that set', () => {
    // A sample across both halves of the function: the prefix map (step 2/3) and
    // the keyword fallback (step 4). Every answer must be a curriculumMap id, or
    // the closed-set claim above is false.
    for (const tag of [
      'phonics.cvc', 'reading.fluency', 'math.addition', 'math.multiplication',
      'math.wordproblems', 'speech.connectedSpeech', 'writing.spelling',
      'writing.paragraph', 'some.unknown.tag.about.longvowels', 'a.tag.about.fractions',
    ]) {
      const node = mapFindingToNode(tag)
      if (node === null) continue
      expect(CURRICULUM_NODE_MAP[node], `${tag} → ${node} should be a curriculumMap id`).toBeDefined()
    }
  })

  it('speech.connectedSpeech is still dropped — the boundary is declared, not a bug', () => {
    expect(mapFindingToNode('speech.connectedSpeech')).toBe('speech.connected')
    expect(FOUNDATION_NODE_MAP['speech.connected']).toBeUndefined()
    expect(computeEvalRead([finding('speech.connectedSpeech')])).toHaveLength(0)
    expect(
      resolveFoundationConcepts(mapFindingToNode('speech.connectedSpeech'), 'speech.connectedSpeech')
        .outcome,
    ).toBe(FoundationBridgeOutcome.OutsideDomain)
  })

  it('a reading finding is unchanged — the fix did not disturb the half that worked', () => {
    const reads = computeEvalRead([finding('phonics.cvc')])
    expect(reads).toHaveLength(1)
    expect(reads[0].conceptId).toBe('reading.phonics.cvc')
    expect(reads[0].state).toBe('frontier')
  })

  it('the skill-map writers do NOT read the foundations bridge — a source scan', () => {
    // The reason the bridge was not repointed, enforced rather than argued.
    // `childSkillMaps` is keyed by curriculumMap ids, where `addSub`/`multDiv`
    // are correct; routing either writer through `curriculumNodeBridge` would
    // start writing foundations ids into that document. A source scan, because
    // both writers are async Firestore writers with no pure seam to assert on.
    for (const file of ['updateSkillMapFromFindings.ts', 'deriveWorkingLevelMastery.ts']) {
      const text = readFileSync(join(import.meta.dirname, '..', 'curriculum', file), 'utf8')
      expect(text, `${file} must keep using mapFindingToNode directly`).toContain(
        'mapFindingToNode',
      )
      expect(text, `${file} must not read the foundations-side bridge`).not.toContain(
        'curriculumNodeBridge',
      )
    }
  })

  it('UX-348 (FIXED by FIX-226): math.wordProblems reaches its curated concept', () => {
    // The owner-curated `tagConceptBridge` routes the catalog tag
    // `math.wordProblems` to `math.problemSolving.oneStep` ("catalog evidence is
    // single-step word problems"); `mapFindingToNode`'s prefix table answers the
    // band-5 multi-step `math.problemSolving`, which is a REAL foundations node,
    // so it used to pass straight through with nothing to compare it against and
    // a Gate-3 priority skill seeded the harder concept solid.
    //
    // `mapFindingToNode` is still unchanged — `oneStep` is not a curriculumMap id
    // and that function's contract is curriculumMap ids — so the fix is the
    // curated table's precedence plus a narrowing resolver, both here. The skill
    // map still records the coarse node, which is the only one the map has.
    expect(mapFindingToNode('math.wordProblems')).toBe('math.problemSolving')
    expect(TAG_CONCEPT_BRIDGE['math.wordProblems']).toEqual(['math.problemSolving.oneStep'])
    expect(computeEvalRead([finding('math.wordProblems')])[0]?.conceptId).toBe(
      'math.problemSolving.oneStep',
    )
    // The prompt's own multi-step tag still means the band-5 concept.
    expect(computeEvalRead([finding('math.word-problems.multi-step')])[0]?.conceptId).toBe(
      'math.problemSolving',
    )
  })

  it('UX-347 (FIXED by FIX-226): writing.paragraph no longer routes to a MATH concept', () => {
    // `mapFindingToNode`'s keyword fallback used to test `graph` as a SUBSTRING
    // before it reached its writing section, so "para-graph" matched and a
    // writing finding was written onto `math.data.graphs` — a real foundations
    // concept, so nothing downstream filtered it, on the one writer permitted to
    // move a concept DOWN. The boundary rule in `curriculum/tagPhrases.ts` closes
    // it by construction: `graph` is not a prefix of the word `paragraph`.
    expect(mapFindingToNode('writing.paragraph')).toBe('writing.composition.paragraph')
    // The writing half of the curriculum map has no foundations domain, so the
    // eval now writes NOTHING for it — the declared boundary, not a lie.
    expect(computeEvalRead([finding('writing.paragraph')])).toHaveLength(0)
    expect(
      resolveFoundationConcepts(mapFindingToNode('writing.paragraph'), 'writing.paragraph').outcome,
    ).toBe(FoundationBridgeOutcome.OutsideDomain)
  })
})
