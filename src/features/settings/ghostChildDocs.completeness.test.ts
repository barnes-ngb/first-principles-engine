import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  CHILD_SUBCOLLECTIONS,
  PROBED_COLLECTIONS,
  UNPROBED_COLLECTIONS,
} from './ghostChildDocs'

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
 * **Round 3 widened what "complete" means.** The second version still derived
 * only the *top-level* table rows, and Codex named the shape that leaves out:
 * `children/{childId}/wordProgress` lives **under the child's own document**,
 * where no query over a sibling collection can see it — and Firestore does not
 * delete subcollections with their parent, so missing it orphans a child's word
 * history rather than losing a stray row. `CLAUDE.md` lists those paths in its
 * **Subcollections** section, so that section is now parsed too.
 *
 * POSITIVE CONTROLS: remove any entry from `PROBED_COLLECTIONS` and the first
 * case fails naming it; remove one from `CHILD_SUBCOLLECTIONS` and the
 * subcollection case fails naming it.
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

/**
 * The `children/{childId}/…` subcollection names `CLAUDE.md` declares. The
 * table of collections cannot show these — they hang off a document, not off
 * the family — which is exactly why round 3 found them missing.
 */
function declaredChildSubcollections(): string[] {
  const start = CLAUDE_MD.indexOf('**Subcollections:**')
  expect(start, 'CLAUDE.md has no Subcollections section').toBeGreaterThan(-1)
  const end = CLAUDE_MD.indexOf('**Settings documents:**', start)
  expect(end).toBeGreaterThan(start)

  const section = CLAUDE_MD.slice(start, end)
  const names = [
    ...section.matchAll(/`children\/\{childId\}\/([A-Za-z][A-Za-z0-9]*)`/g),
  ].map((m) => m[1])
  // Fail closed: a parse that yields nothing satisfies the assertion trivially.
  expect(names.length, 'parsed no child subcollections from CLAUDE.md').toBeGreaterThan(0)
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

  it('probes every subcollection hanging off the child’s OWN document', () => {
    // Round 3's P1. Firestore does not delete subcollections with their parent,
    // so a missed one is orphaned data, not a stray row — the worst of the four
    // shapes to get wrong.
    const probed = new Set(CHILD_SUBCOLLECTIONS)
    const missing = declaredChildSubcollections().filter((name) => !probed.has(name))

    expect(
      missing,
      `child subcollections declared in CLAUDE.md but never probed: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('probes no child subcollection CLAUDE.md does not declare', () => {
    const declared = new Set(declaredChildSubcollections())
    const stray = CHILD_SUBCOLLECTIONS.filter((name) => !declared.has(name))
    expect(stray, `probed but not declared: ${stray.join(', ')}`).toEqual([])
  })
})
