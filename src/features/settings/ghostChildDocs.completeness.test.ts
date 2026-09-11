import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PROBED_COLLECTIONS, UNPROBED_COLLECTIONS } from './ghostChildDocs'

/**
 * **The completeness claim, derived rather than asserted** — `UX-394`, Codex
 * round 1 (P1).
 *
 * The first version of `ghostChildDocs` probed eight hand-picked collections
 * and told a parent that *nothing references this document*. It was wrong in a
 * way that mattered: `addXpEvent` writes per-event records as
 * `xpLedger/{childId}_{dedupKey}` and a diamond award never writes the
 * cumulative `xpLedger/{childId}` document at all, so a ghost holding an
 * irreversible currency record read as unreferenced and was offered for
 * deletion. The review's own words: *"the same completeness check should cover
 * other child-keyed collections before claiming that nothing references the
 * document."*
 *
 * A hand-picked list is the `[ledger-shape]` failure in a new place — a guard
 * that reports green while asking a fraction of the question — so the fix is
 * not to add `xpLedger` twice and move on. `CLAUDE.md`'s Firestore Collections
 * table is this repo's register of what exists; this test makes it the register
 * the survey is measured against. A new collection added there fails here until
 * it is probed or explicitly excluded **with a reason**.
 *
 * POSITIVE CONTROL: remove any entry from `PROBED_COLLECTIONS` and the first
 * case fails naming it.
 */

const CLAUDE_MD = readFileSync(resolve(__dirname, '../../../CLAUDE.md'), 'utf8')

/**
 * The family-scoped collection names `CLAUDE.md` declares — the rows of the
 * table under *Firestore Collections*, stopping at the **Global collections**
 * heading, since those do not live under `families/{familyId}`.
 */
function declaredFamilyCollections(): string[] {
  const start = CLAUDE_MD.indexOf('## Firestore Collections')
  const end = CLAUDE_MD.indexOf('**Global collections**', start)
  expect(start, 'CLAUDE.md has no Firestore Collections section').toBeGreaterThan(-1)
  expect(end, 'CLAUDE.md has no Global collections marker').toBeGreaterThan(start)

  const table = CLAUDE_MD.slice(start, end)
  const names = [...table.matchAll(/^\| `([A-Za-z][A-Za-z0-9]*)` \|/gm)].map((m) => m[1])
  // Fail closed: a parse that yields nothing would satisfy every assertion
  // below trivially, which is the exact guard failure this file exists to stop.
  expect(names.length).toBeGreaterThan(20)
  return names
}

describe('every family collection is probed, or excluded with a reason (UX-394)', () => {
  it('probes every collection CLAUDE.md declares under families/', () => {
    const probed = new Set(PROBED_COLLECTIONS)
    const excluded = new Set(Object.keys(UNPROBED_COLLECTIONS))

    const missing = declaredFamilyCollections().filter(
      (name) => !probed.has(name) && !excluded.has(name),
    )

    expect(
      missing,
      `not probed and not excluded: ${missing.join(', ')} — add each to PROBED_COLLECTIONS, or to UNPROBED_COLLECTIONS with a reason`,
    ).toEqual([])
  })

  it('probes nothing CLAUDE.md does not declare', () => {
    // The other direction, for the same reason `stale-row` is checked both ways
    // in the child-switch census: a probe naming a collection that no longer
    // exists is a read that can only fail, and a list nobody prunes rots.
    const declared = new Set([
      ...declaredFamilyCollections(),
      // Global, named in the table below the marker; excluded on purpose.
      ...Object.keys(UNPROBED_COLLECTIONS),
    ])
    const stray = PROBED_COLLECTIONS.filter((name) => !declared.has(name))

    expect(stray, `probed but not declared in CLAUDE.md: ${stray.join(', ')}`).toEqual([])
  })

  it('never probes `children` itself', () => {
    // The ghost IS a document in `children`, so a doc-id probe there would
    // match itself and nothing would ever be deletable.
    expect(PROBED_COLLECTIONS).not.toContain('children')
    expect(UNPROBED_COLLECTIONS.children).toBeTruthy()
  })

  it('every exclusion carries a reason', () => {
    for (const [name, reason] of Object.entries(UNPROBED_COLLECTIONS)) {
      expect(reason.trim().length, `${name} is excluded with no reason`).toBeGreaterThan(10)
    }
  })

  it('names no collection twice', () => {
    expect(new Set(PROBED_COLLECTIONS).size).toBe(PROBED_COLLECTIONS.length)
  })
})
