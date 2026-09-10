import { describe, expect, it } from 'vitest'

import { skillMapGateNote, skillMapIsEditable } from './skillMapGate'

/**
 * UX-344 — the rule behind the gate, on its own. The hook test beside this one
 * proves the map is cleared and the write refused; this proves the rule they
 * depend on answers every state, including the two that used to be
 * indistinguishable — a read that resolved to nothing and one that failed.
 */
describe('skillMapIsEditable', () => {
  const settled = { isLoading: false, loadFailed: false, hasTarget: true }

  it('is editable only once a successful read has settled', () => {
    expect(skillMapIsEditable(settled)).toBe(true)
  })

  it('is not editable while the read is open', () => {
    expect(skillMapIsEditable({ ...settled, isLoading: true })).toBe(false)
  })

  it('is not editable after a FAILED read', () => {
    expect(skillMapIsEditable({ ...settled, loadFailed: true })).toBe(false)
  })

  it('is not editable with no child', () => {
    expect(skillMapIsEditable({ ...settled, hasTarget: false })).toBe(false)
  })
})

describe('skillMapGateNote', () => {
  it('never reports a failed read as an empty map', () => {
    const note = skillMapGateNote({ isLoading: false, loadFailed: true, hasTarget: true })
    expect(note).toMatch(/couldn't read/i)
    expect(note).not.toMatch(/no skills|nothing recorded|not started yet/i)
  })

  it('says nothing once the map is writable', () => {
    expect(skillMapGateNote({ isLoading: false, loadFailed: false, hasTarget: true })).toBeNull()
  })
})
