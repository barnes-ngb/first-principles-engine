import { describe, expect, it } from 'vitest'

import pageSource from './WorkshopPage.tsx?raw'

/**
 * UX-324, Codex round 2 — a Workshop workflow belongs to the child it was
 * started for.
 *
 * The page is a ~1,800-line shell over a dozen live hooks (the reason
 * `WorkshopPage.artCap.test.ts` pins its wiring at the source rather than
 * mounting it), so this does the same. The behaviour it pins: once the header
 * chip can switch child from anywhere — which UX-324 made true — a wizard
 * begun for Lincoln could be finished under London, and every downstream
 * reader (generation, `currentGame`, the art quota, the XP and artifact
 * rewards) reads the LIVE child while the draft document keeps the stamp it
 * was created with.
 */
describe('Workshop workflows stay with their child (UX-324)', () => {
  const code = pageSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('renders every phase off the DERIVED phase, never the raw one', () => {
    // This is the whole guard: with `renderPhase` forced to Idle, no door onto
    // generation, the quota or a reward is reachable while the header is on a
    // child this workflow is not for.
    expect(code).toMatch(/const renderPhase = workflowLeftChild \? GamePhase\.Idle : phase/)
    const derived = code.match(/\{renderPhase === GamePhase\./g) ?? []
    expect(derived.length).toBeGreaterThanOrEqual(15)
    // No JSX gate may read the raw phase — one that did would be a live door.
    expect(code).not.toMatch(/\{phase === GamePhase\./)
  })

  it('asks the shared rule whether the workflow left its child', () => {
    expect(code).toMatch(/workflowLeftItsChild\(workflowChildId, activeChildId\)/)
  })

  it('binds the workflow at every entry point', () => {
    // Starting fresh binds to the header; resuming a draft and opening a saved
    // game bind to the DOCUMENT's own child, which is the stamp the rest of the
    // workflow has to follow.
    expect(code).toMatch(/setWorkflowChildId\(activeChildId\)/)
    const fromDoc = code.match(/setWorkflowChildId\(game\.childId \?\? activeChildId\)/g) ?? []
    expect(fromDoc).toHaveLength(2)
  })

  it('clears the binding on every way back to the workshop home', () => {
    const cleared = code.match(/setWorkflowChildId\(null\)/g) ?? []
    expect(cleared.length).toBeGreaterThanOrEqual(3)
  })

  it('hides the workflow rather than destroying it', () => {
    // Nothing is reset, so switching back brings the work back exactly as it
    // was — and the line says so instead of implying lost work.
    expect(code).toMatch(/workshopSwitchedAwayLine\(workflowOwnerName\)/)
    // The guard is derived at render; a reset effect would be state to get
    // wrong on the way back (and this repo's lint forbids it besides).
    expect(code).not.toMatch(/useEffect\([^)]*workflowChildId/)
  })
})
