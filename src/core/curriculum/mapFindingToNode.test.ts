import { describe, expect, it } from 'vitest'

import { findingStatusToSkillStatus, getNodesForProgram, mapFindingToNode } from './mapFindingToNode'

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
