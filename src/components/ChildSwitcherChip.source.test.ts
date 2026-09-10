import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync(resolve(__dirname, './ChildSwitcherChip.tsx'), 'utf8')

/**
 * UX-324's two structural rails, asserted rather than claimed.
 */
describe('ChildSwitcherChip — structure', () => {
  it('reads the ONE source of truth for the active child', () => {
    // Not a second copy of the selection. Every in-page `ChildSelector` host
    // reads and writes the same hook, so switching in either place moves both.
    expect(SRC).toMatch(/from '\.\.\/core\/hooks\/useActiveChild'/)
  })

  it('writes nothing — it reaches no Firestore door at all', () => {
    // Switching changes the selected child and nothing else: no XP, no hours,
    // no `skillSnapshots`, no `learnerModels`.
    expect(SRC).not.toMatch(/firebase\//)
    expect(SRC).not.toMatch(/core\/firebase/)
    expect(SRC).not.toMatch(/setDoc|updateDoc|addDoc|deleteDoc|runTransaction/)
  })
})
