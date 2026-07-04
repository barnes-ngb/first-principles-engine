import { describe, expect, it } from 'vitest'

import { computeFanOut, computeReviewPriority } from './reviewPriority'
import { foundationNodesForDomain } from './index'
import type { ConceptStateEntry } from '../types/learnerModel'
import type { ConceptNode } from './types'

/** Minimal node factory — only the fields the ranker reads. */
function node(
  id: string,
  band: ConceptNode['band'],
  underlies: string[] = [],
): ConceptNode {
  return {
    id,
    domain: 'reading',
    band,
    kidName: id,
    parentDescription: `desc ${id}`,
    underlies,
  }
}

/** State-entry factory. */
function st(state: ConceptStateEntry['state']): ConceptStateEntry {
  return { state, evidence: [] }
}

describe('computeFanOut — transitive underlies', () => {
  it('counts distinct downstream descendants, not just direct edges', () => {
    // root → mid → leaf  (a chain): root blocks 2, mid blocks 1, leaf blocks 0.
    const nodes = [
      node('root', 'K', ['mid']),
      node('mid', '1', ['leaf']),
      node('leaf', '2'),
    ]
    const fan = computeFanOut(nodes)
    expect(fan.root).toBe(2)
    expect(fan.mid).toBe(1)
    expect(fan.leaf).toBe(0)
  })

  it('de-dupes diamond dependencies (a node reached two ways counts once)', () => {
    // top → {l, r} → bottom : top blocks {l, r, bottom} = 3, not 4.
    const nodes = [
      node('top', 'K', ['l', 'r']),
      node('l', '1', ['bottom']),
      node('r', '1', ['bottom']),
      node('bottom', '2'),
    ]
    const fan = computeFanOut(nodes)
    expect(fan.top).toBe(3)
    expect(fan.l).toBe(1)
    expect(fan.r).toBe(1)
    expect(fan.bottom).toBe(0)
  })

  it('ignores edges pointing outside the passed node set', () => {
    const nodes = [node('a', 'K', ['gone'])] // edge to a node not in the set
    expect(computeFanOut(nodes).a).toBe(0)
  })
})

describe('computeReviewPriority — walk order', () => {
  it('orders frontier, then forming, then not-yet', () => {
    const nodes = [
      node('ny', '1'),
      node('fo', '1'),
      node('fr', '1'),
    ]
    const states = {
      ny: st('not-yet'),
      fo: st('forming'),
      fr: st('frontier'),
    }
    expect(computeReviewPriority(nodes, states)).toEqual(['fr', 'fo', 'ny'])
  })

  it('excludes solid concepts entirely (never re-litigated)', () => {
    const nodes = [node('s', '1'), node('fr', '1')]
    const states = { s: st('solid'), fr: st('frontier') }
    expect(computeReviewPriority(nodes, states)).toEqual(['fr'])
  })

  it('ranks not-yet by underlies fan-out, descending', () => {
    // big blocks 2, small blocks 0 — big comes first though both are not-yet.
    const nodes = [
      node('small', '1'),
      node('big', '1', ['m']),
      node('m', '2', ['leaf']),
      node('leaf', '3'),
    ]
    const states = {
      small: st('not-yet'),
      big: st('not-yet'),
      m: st('not-yet'),
      leaf: st('not-yet'),
    }
    // big(2) > m(1) > small(0) == leaf(0) → band/id break the 0-tie: leaf band3 id 'leaf', small band1 id 'small' → small(band1) before leaf(band3).
    expect(computeReviewPriority(nodes, states)).toEqual(['big', 'm', 'small', 'leaf'])
  })

  it('treats a missing state entry as not-yet', () => {
    const nodes = [node('seen', '1'), node('unseen', '1')]
    const states = { seen: st('frontier') } // 'unseen' absent
    expect(computeReviewPriority(nodes, states)).toEqual(['seen', 'unseen'])
  })

  it('breaks fan-out ties by earlier band, then id', () => {
    // three not-yets, all fan-out 0: band K before band 2; within band, id asc.
    const nodes = [
      node('z', 'K'),
      node('a', 'K'),
      node('m', '2'),
    ]
    const states = { z: st('not-yet'), a: st('not-yet'), m: st('not-yet') }
    expect(computeReviewPriority(nodes, states)).toEqual(['a', 'z', 'm'])
  })

  it('is deterministic over the real reading graph', () => {
    const nodes = foundationNodesForDomain('reading')
    const states: Record<string, ConceptStateEntry> = {}
    // Seed a spiky profile: a couple solid, a frontier, rest default not-yet.
    states[nodes[0].id] = st('solid')
    states[nodes[1].id] = st('frontier')
    const a = computeReviewPriority(nodes, states)
    const b = computeReviewPriority(nodes, states)
    expect(a).toEqual(b)
    expect(a).not.toContain(nodes[0].id) // solid excluded
    expect(a[0]).toBe(nodes[1].id) // the lone frontier leads the walk
  })
})
