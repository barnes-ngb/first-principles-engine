import { describe, expect, it } from 'vitest'

import { WRITING_MAP } from './curriculumMap'

/**
 * FEAT-11 — the writing curriculum map's practice ideas must be tap/voice, never
 * pencil/handwriting. Lincoln's block is the *mechanics* of handwriting, not the
 * ideas, so the planner must never be able to route him to tracing / sand-tray /
 * copy-by-hand work via these nodes.
 */

// Handwriting-first terms that were neutralized out of the practice ideas.
const BANNED = [
  'trac', // tracing
  'sand',
  'salt tray',
  'chalk',
  'whiteboard',
  'popsicle',
  'pencil',
  'cursive',
  'tripod',
  'skywriting',
  'lined paper',
  'look-say-cover',
  'copy short sentences',
  'finger spacing',
  'large motor writing',
  'handwriting',
]

describe('WRITING_MAP practiceIdeas — no pencil / handwriting routing', () => {
  it('contains no handwriting/pencil practice ideas on any writing node', () => {
    const offending: string[] = []
    for (const node of WRITING_MAP.nodes) {
      for (const idea of node.practiceIdeas ?? []) {
        const lower = idea.toLowerCase()
        for (const term of BANNED) {
          if (lower.includes(term)) offending.push(`${node.id}: "${idea}" (matched "${term}")`)
        }
      }
    }
    expect(offending).toEqual([])
  })

  it('still defines the phonetic-spelling node that spell-the-word maps to', () => {
    const spelling = WRITING_MAP.nodes.find((n) => n.id === 'writing.mechanics.spelling')
    expect(spelling).toBeDefined()
    // Its practice ideas should now be tap/voice (mention tiles / sounds).
    const ideas = (spelling!.practiceIdeas ?? []).join(' ').toLowerCase()
    expect(ideas).toMatch(/tile|sound|hear/)
  })

  it('keeps the node structure intact (13 writing nodes retained)', () => {
    expect(WRITING_MAP.nodes.length).toBe(13)
  })
})
