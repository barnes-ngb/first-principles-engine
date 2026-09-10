import { describe, expect, it } from 'vitest'

import {
  findingStatusToSkillStatus,
  getNodesForProgram,
  KEYWORD_FALLBACKS,
  keywordFallbackNode,
  mapFindingToNode,
} from './mapFindingToNode'
import { CURRICULUM_NODE_MAP } from './curriculumMap'

describe('mapFindingToNode', () => {
  // ── Direct curriculum node IDs pass through ──────────────
  it('returns the ID if it is already a valid curriculum node', () => {
    expect(mapFindingToNode('reading.phonics.cvc')).toBe('reading.phonics.cvc')
    expect(mapFindingToNode('math.operations.addSub')).toBe('math.operations.addSub')
  })

  // ── Phonics finding tags ────────────────────────────────
  it('maps phonics.cvc.short-o → reading.phonics.cvc', () => {
    expect(mapFindingToNode('phonics.cvc.short-o')).toBe('reading.phonics.cvc')
  })

  it('maps phonics.cvc.short-a → reading.phonics.cvc', () => {
    expect(mapFindingToNode('phonics.cvc.short-a')).toBe('reading.phonics.cvc')
  })

  it('maps phonics.letterSound → reading.phonics.letterSounds', () => {
    expect(mapFindingToNode('phonics.letterSound')).toBe('reading.phonics.letterSounds')
  })

  it('maps phonics.blends → reading.phonics.blends', () => {
    expect(mapFindingToNode('phonics.blends')).toBe('reading.phonics.blends')
  })

  it('maps phonics.digraphs → reading.phonics.digraphs', () => {
    expect(mapFindingToNode('phonics.digraphs')).toBe('reading.phonics.digraphs')
  })

  it('maps phonics.cvce → reading.phonics.longVowels', () => {
    expect(mapFindingToNode('phonics.cvce')).toBe('reading.phonics.longVowels')
  })

  it('maps phonics.vowelTeams → reading.phonics.longVowels', () => {
    expect(mapFindingToNode('phonics.vowelTeams')).toBe('reading.phonics.longVowels')
  })

  it('maps phonics.multisyllable → reading.decoding.multisyllable', () => {
    expect(mapFindingToNode('phonics.multisyllable')).toBe('reading.decoding.multisyllable')
  })

  it('maps phonics.prefixes → reading.vocabulary.wordParts', () => {
    expect(mapFindingToNode('phonics.prefixes')).toBe('reading.vocabulary.wordParts')
  })

  // ── Reading comprehension tags ──────────────────────────
  it('maps reading.comprehension.explicit → reading.comprehension.explicit', () => {
    expect(mapFindingToNode('reading.comprehension.explicit')).toBe('reading.comprehension.explicit')
  })

  it('maps reading.comprehension.inference → reading.comprehension.inference', () => {
    expect(mapFindingToNode('reading.comprehension.inference')).toBe('reading.comprehension.inference')
  })

  it('maps reading.comprehension.mainIdea → reading.comprehension.mainIdea', () => {
    expect(mapFindingToNode('reading.comprehension.mainIdea')).toBe('reading.comprehension.mainIdea')
  })

  it('maps reading.vocabulary.contextClues → reading.vocabulary.contextClues', () => {
    expect(mapFindingToNode('reading.vocabulary.contextClues')).toBe('reading.vocabulary.contextClues')
  })

  // ── Math tags ───────────────────────────────────────────
  it('maps math.addition.within-20 → math.operations.addSub', () => {
    expect(mapFindingToNode('math.addition.within-20')).toBe('math.operations.addSub')
  })

  it('maps math.multiplication.tables-2-5-10 → math.operations.multDiv', () => {
    expect(mapFindingToNode('math.multiplication.tables-2-5-10')).toBe('math.operations.multDiv')
  })

  it('maps math.subtraction → math.operations.addSub', () => {
    expect(mapFindingToNode('math.subtraction')).toBe('math.operations.addSub')
  })

  it('maps math.placeValue → math.number.placeValue', () => {
    expect(mapFindingToNode('math.placeValue')).toBe('math.number.placeValue')
  })

  it('maps math.fractions → math.fractions.concepts', () => {
    expect(mapFindingToNode('math.fractions')).toBe('math.fractions.concepts')
  })

  it('maps math.wordProblems → math.problemSolving', () => {
    expect(mapFindingToNode('math.wordProblems')).toBe('math.problemSolving')
  })

  // ── Speech tags ─────────────────────────────────────────
  it('maps speech.articulation.r.initial → speech.sounds.late', () => {
    expect(mapFindingToNode('speech.articulation.r.initial')).toBe('speech.sounds.late')
  })

  it('maps speech.articulation.l.medial → speech.sounds.late', () => {
    expect(mapFindingToNode('speech.articulation.l.medial')).toBe('speech.sounds.late')
  })

  it('maps speech.articulation.th.initial → speech.sounds.late', () => {
    expect(mapFindingToNode('speech.articulation.th.initial')).toBe('speech.sounds.late')
  })

  it('maps speech.metathesis → speech.sequencing', () => {
    expect(mapFindingToNode('speech.metathesis')).toBe('speech.sequencing')
  })

  it('maps speech.connectedSpeech → speech.connected', () => {
    expect(mapFindingToNode('speech.connectedSpeech')).toBe('speech.connected')
  })

  // ── Edge cases ──────────────────────────────────────────
  it('returns null for empty string', () => {
    expect(mapFindingToNode('')).toBeNull()
  })

  it('returns null for completely unknown tag', () => {
    expect(mapFindingToNode('nonsense.unknown.tag')).toBeNull()
  })

  it('handles spaces around dots', () => {
    expect(mapFindingToNode('phonics . cvc . short-a')).toBe('reading.phonics.cvc')
  })
})

describe('findingStatusToSkillStatus', () => {
  it('maps mastered → mastered', () => {
    expect(findingStatusToSkillStatus('mastered')).toBe('mastered')
  })

  it('maps emerging → in-progress', () => {
    expect(findingStatusToSkillStatus('emerging')).toBe('in-progress')
  })

  it('maps not-yet → in-progress', () => {
    expect(findingStatusToSkillStatus('not-yet')).toBe('in-progress')
  })

  it('maps not-tested → null', () => {
    expect(findingStatusToSkillStatus('not-tested')).toBeNull()
  })
})

describe('getNodesForProgram', () => {
  it('returns reading-eggs linked nodes', () => {
    const nodes = getNodesForProgram('reading-eggs')
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes).toContain('reading.phonics.letterSounds')
    expect(nodes).toContain('reading.phonics.cvc')
    expect(nodes).toContain('reading.phonics.blends')
    expect(nodes).toContain('reading.phonics.digraphs')
    expect(nodes).toContain('reading.phonics.longVowels')
    expect(nodes).toContain('reading.phonics.rControlled')
    expect(nodes).toContain('reading.phonics.sightWords')
  })

  it('returns empty array for unknown program', () => {
    expect(getNodesForProgram('nonexistent-program')).toEqual([])
  })
})

// ── FIX-226 — the repaired keyword fallback (UX-346 / UX-347) ────────────
//
// AUDIT-226's finding was that the *technique* was the bug, not the entries: an
// ordered chain of `includes` tests over a separator-stripped tag had produced
// three independent defects, two of them found by accident. These blocks pin the
// repair and the entries it made reachable. Each assertion below fails if the
// boundary rule, the declared order or the domain anchor is reverted.

describe('UX-347 — a writing finding is no longer written onto a math concept', () => {
  it('routes writing.paragraph to the writing node, not math.data.graphs', () => {
    expect(mapFindingToNode('writing.paragraph')).toBe('writing.composition.paragraph')
  })

  it('made the paragraph rule reachable at all — it was dead code', () => {
    // The rule existed. Every input it was written to catch matched `graph`
    // first, so it could never fire. A bare tag proves it fires now.
    expect(mapFindingToNode('paragraph')).toBe('writing.composition.paragraph')
  })

  it('still routes a tag that really is about graphs or data', () => {
    // The repair must not cost the rule it was shadowed by.
    expect(mapFindingToNode('math.graphs')).toBe('math.data.graphs')
    expect(mapFindingToNode('math.data')).toBe('math.data.graphs')
    expect(mapFindingToNode('graph')).toBe('math.data.graphs')
  })

  it('refuses to cross a declared domain rather than guessing', () => {
    // The domain anchor, belt to the boundary rule's braces. A math tag may not
    // answer with a writing node and a reading tag may not either, so an
    // unrecognised tag in a declared domain is null — honest — not cross-domain.
    expect(mapFindingToNode('math.paragraph')).toBeNull()
    expect(mapFindingToNode('reading.paragraph')).toBeNull()
    expect(mapFindingToNode('writing.data')).toBeNull()
    expect(mapFindingToNode('math.fluency')).toBeNull()
  })

  it('keeps the ONE declared cross-domain lane: writing spelling → reading', () => {
    // `deriveWorkingLevelMastery` declares it for its writing key ("spelling a
    // CVC word implies you can decode it"), so the catalog tag keeps the answer
    // it has always had. The lane is one-directional by design.
    expect(mapFindingToNode('writing.spelling.sightWord')).toBe('reading.phonics.sightWords')
  })
})

describe('UX-346 — the eval prompt Level-1 math tags map to something', () => {
  it('maps math.number-sense, which used to map to nothing at all', () => {
    expect(mapFindingToNode('math.number-sense')).toBe('math.number.counting')
  })

  it('maps the other two Level-1 keys the working-level map already carried', () => {
    expect(mapFindingToNode('digit-recognition')).toBe('math.number.counting')
    expect(mapFindingToNode('number-comparison')).toBe('math.number.comparison')
    expect(mapFindingToNode('number-sense')).toBe('math.number.counting')
  })

  it('lands on the same node the existing counting key already resolved to', () => {
    // Why this is safe on the skill-map side: `deriveWorkingLevelMastery` already
    // wrote this node from the `counting` key at the same level, so the family
    // joining it moves no existing answer.
    expect(mapFindingToNode('counting')).toBe('math.number.counting')
  })
})

describe('FIX-226 — the inference tags the Knowledge Mine prompt emits', () => {
  it('routes both of the prompt’s inference tags to the inference node', () => {
    // Both used to fall to the generic `comprehension` keyword and be recorded as
    // EXPLICIT recall — a different skill, and an easier one.
    expect(mapFindingToNode('reading.comprehension.inferCause')).toBe(
      'reading.comprehension.inference',
    )
    expect(mapFindingToNode('reading.comprehension.multiStepInference')).toBe(
      'reading.comprehension.inference',
    )
  })

  it('leaves the rest of the comprehension family on the explicit node', () => {
    // Deliberately unchanged: the curriculum map has no node for theme, point of
    // view or compare/contrast, so collapsing them is the only answer it has.
    // Filed as UX-350, not guessed at here.
    for (const tag of [
      'reading.comprehension.theme',
      'reading.comprehension.pointOfView',
      'reading.comprehension.compareContrast',
    ]) {
      expect(mapFindingToNode(tag), tag).toBe('reading.comprehension.explicit')
    }
  })
})

describe('FIX-226 — "repeated addition" is multiplication', () => {
  it('reads the more specific keyword first', () => {
    // `repeated-addition` matches BOTH `repeatedaddition` and `addition`; the
    // ordering rule is that the more specific skill is declared first. It used to
    // be recorded on the addition/subtraction node.
    expect(mapFindingToNode('repeated-addition')).toBe('math.operations.multDiv')
  })

  it('leaves plain addition alone', () => {
    expect(mapFindingToNode('single-digit-addition')).toBe('math.operations.addSub')
  })
})

describe('FIX-226 — the keyword table’s contract and its order', () => {
  it('answers only with curriculumMap node ids', () => {
    // The contract in the module header: the foundations graph is a different
    // namespace and is reached one step later, on the foundations side.
    for (const rule of KEYWORD_FALLBACKS) {
      expect(CURRICULUM_NODE_MAP[rule.node], rule.node).toBeDefined()
    }
  })

  it('never declares a keyword that an earlier keyword is a prefix of', () => {
    // Mechanical half of the ordering rule: the earlier one would always win, so
    // the later rule would be unreachable — `paragraph` under `graph`, one class
    // up. `cvce` before `cvc` and `times` before `time` are why this passes.
    const seen: string[] = []
    const shadowed: string[] = []
    for (const rule of KEYWORD_FALLBACKS) {
      for (const keyword of rule.keywords) {
        for (const earlier of seen) {
          if (keyword.startsWith(earlier)) shadowed.push(`${keyword} is shadowed by ${earlier}`)
        }
      }
      seen.push(...rule.keywords)
    }
    expect(shadowed).toEqual([])
  })

  it('declares no keyword twice', () => {
    const all = KEYWORD_FALLBACKS.flatMap((r) => r.keywords)
    expect(all.length).toBe(new Set(all).size)
  })

  it('exposes step 4 on its own, so a census can report on it separately', () => {
    // An exact/prefix answer is not a keyword answer, and the registry
    // distinguishes them.
    expect(keywordFallbackNode('phonics.cvc')).toBe('reading.phonics.cvc')
    expect(mapFindingToNode('math.counting')).toBe('math.number.counting')
    expect(keywordFallbackNode('math.counting')).toBe('math.number.counting')
    expect(keywordFallbackNode('utterly.unknown.thing')).toBeNull()
  })
})
