import { describe, expect, it } from 'vitest'

import { workflowLeftItsChild, workshopSwitchedAwayLine } from './workshopChildSwitch'

describe('workflowLeftItsChild (UX-324, Codex round 2)', () => {
  it('fires when the header moved to another child mid-workflow', () => {
    expect(workflowLeftItsChild('lincoln', 'london')).toBe(true)
  })

  it('does not fire while the header still agrees', () => {
    expect(workflowLeftItsChild('lincoln', 'lincoln')).toBe(false)
  })

  it('does not fire when nothing is in flight', () => {
    // The workshop home. There is no workflow to end.
    expect(workflowLeftItsChild(null, 'london')).toBe(false)
  })

  it('treats an unresolved active child as not-a-switch', () => {
    // A child still loading must never close a wizard someone is typing into.
    expect(workflowLeftItsChild('lincoln', '')).toBe(false)
  })
})

describe('workshopSwitchedAwayLine', () => {
  it('names whose game it is AND that it is still there', () => {
    // Nothing was lost — the draft is saved under its own child. A line that
    // said only "closed" would read as lost work.
    const line = workshopSwitchedAwayLine('Lincoln')
    expect(line).toContain("Lincoln's")
    expect(line).toMatch(/saved in their Workshop/i)
    expect(line).toMatch(/switch back/i)
  })

  it('still says where the work is when it cannot name the child', () => {
    const line = workshopSwitchedAwayLine(undefined)
    expect(line).toMatch(/saved in their Workshop/i)
    expect(line).not.toMatch(/undefined/)
  })
})
