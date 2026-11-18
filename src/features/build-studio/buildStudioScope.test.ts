import { beforeEach, describe, expect, it } from 'vitest'

import { EDITOR_SCRATCH_FILES } from '../../core/types/buildStudio'
import {
  clearPendingSave,
  holdPendingSave,
  pendingSlotAccepts,
  readPendingSave,
  resetPendingSaveStore,
} from './buildStudioPendingStore'
import {
  newBridgeId,
  newNoteActionId,
  newVersionId,
  newVisitId,
  noteTargetKey,
  sameNoteTarget,
  sameScope,
  scopeToken,
  sourceSignature,
  type BuildStudioNoteTarget,
  type BuildStudioScope,
  type PendingSave,
} from './buildStudioScope'

/**
 * Identity, and the owner-bound hold (LOCAL-BUILD-001 repairs #3, #4, #7).
 *
 * Three of this feature's hardest bugs are identity bugs, so the identity lives
 * in pure modules a test can exhaust.
 */

const SCOPE: BuildStudioScope = {
  familyId: 'family-1',
  childId: 'child-lincoln',
  projectId: 'apple-dash-starter',
  visitId: 's-one',
  versionId: null,
}

describe('an A → B → A is a DIFFERENT scope', () => {
  it('separates two visits with the same child and version', () => {
    const again = { ...SCOPE, visitId: 's-two' }
    expect(sameScope(SCOPE, again)).toBe(false)
    expect(scopeToken(SCOPE)).not.toBe(scopeToken(again))
  })

  it('separates the same visit on a different reopened version', () => {
    expect(sameScope(SCOPE, { ...SCOPE, versionId: 'v-1' })).toBe(false)
  })

  it('compares every field, never a subset', () => {
    for (const change of [
      { familyId: 'family-2' },
      { childId: 'child-london' },
      { projectId: 'other' },
      { visitId: 's-two' },
      { versionId: 'v-1' },
    ]) {
      expect(sameScope(SCOPE, { ...SCOPE, ...change }), JSON.stringify(change)).toBe(false)
    }
    expect(sameScope(SCOPE, { ...SCOPE })).toBe(true)
  })

  it('treats a missing scope as never matching', () => {
    expect(sameScope(null, SCOPE)).toBe(false)
    expect(sameScope(SCOPE, null)).toBe(false)
  })

  it('cannot be impersonated by a field’s own content', () => {
    // The separator is `\u0000`, which no id may contain.
    const a = scopeToken({ ...SCOPE, childId: 'a', projectId: 'b' })
    const b = scopeToken({ ...SCOPE, childId: 'a\u0000b', projectId: '' })
    expect(a).not.toBe(b)
  })
})

/**
 * The signature is what "is this still what is on screen?" is answered with.
 * A counter was wrong in the one case that mattered: it was read before the
 * capture and incremented by the capture's own save events, so a clean Save
 * reported newer work.
 */
describe('the source signature compares CONTENT', () => {
  const files = { 'pxt.json': '{"files":["main.ts"]}', 'main.ts': 'info.setLife(3)' }

  it('is stable for the same files in a different order', () => {
    expect(sourceSignature(files)).toBe(
      sourceSignature({ 'main.ts': files['main.ts'], 'pxt.json': files['pxt.json'] }),
    )
  })

  it('IGNORES the editor’s own `_history` bookkeeping', () => {
    // MakeCode rewrites `_history` on every keystroke. Counting it as a change
    // would make every project permanently dirty.
    expect(sourceSignature({ ...files, _history: '{"entries":[1]}' })).toBe(
      sourceSignature({ ...files, _history: '{"entries":[1,2,3]}' }),
    )
    expect(sourceSignature({ ...files, _history: 'x' })).toBe(sourceSignature(files))
  })

  /**
   * The measured stock behaviour: a clean Save → Today in Arcade 4.1.28 adds or
   * updates exactly `.simstate.json`, 55 bytes, holding `S/#run` and `S/#scope`.
   * TypeScript, Blocks, `pxt.json` and assets are untouched. Counting that as an
   * edit made every ordinary departure report unsaved work.
   *
   * POSITIVE CONTROL: remove `.simstate.json` from `EDITOR_SCRATCH_FILES` and
   * the first two cases here fail.
   */
  it('IGNORES the simulator scratch file stock rewrites on every run', () => {
    const before = { ...files, '.simstate.json': '{"S/#run":"0","S/#scope":"a"}' }
    const after = { ...files, '.simstate.json': '{"S/#run":"1","S/#scope":"b"}' }
    expect(sourceSignature(before)).toBe(sourceSignature(after))
    // …and its first appearance is not an edit either.
    expect(sourceSignature(after)).toBe(sourceSignature(files))
  })

  it('still sees a real change made in the SAME save as the scratch file', () => {
    // The exclusion is one named file, not a licence to miss a code change
    // that happens to arrive beside it.
    const scratchOnly = { ...files, '.simstate.json': '{"S/#run":"1"}' }
    const alsoEdited = {
      ...scratchOnly,
      'main.ts': 'info.setLife(4)',
    }
    expect(sourceSignature(alsoEdited)).not.toBe(sourceSignature(scratchOnly))
  })

  it('names exactly one scratch file, and it is that one', () => {
    expect([...EDITOR_SCRATCH_FILES]).toEqual(['.simstate.json'])
  })

  it('changes for a real edit', () => {
    expect(sourceSignature({ ...files, 'main.ts': 'info.setLife(4)' })).not.toBe(
      sourceSignature(files),
    )
  })

  it('changes when a file is added or removed', () => {
    expect(sourceSignature({ ...files, 'assets.jres': '{}' })).not.toBe(
      sourceSignature(files),
    )
  })
})

describe('the ids are path-safe by construction', () => {
  const PATH_SAFE = /^[A-Za-z0-9_-]{4,64}$/
  it.each([
    ['version', newVersionId],
    ['visit', newVisitId],
    ['bridge', newBridgeId],
    ['note', newNoteActionId],
  ])('%s ids satisfy the writer’s own rule', (_label, mint) => {
    for (const seed of [0, 1, 0.5, 0.999999]) {
      expect(mint(1_763_420_000_000, seed)).toMatch(PATH_SAFE)
    }
  })

  it('mints different ids for different moments', () => {
    expect(newVersionId(1, 0.1)).not.toBe(newVersionId(2, 0.1))
  })
})

describe('a note target is frozen, and keys the recorder', () => {
  const target: BuildStudioNoteTarget = {
    familyId: 'family-1',
    childId: 'child-lincoln',
    projectId: 'apple-dash-starter',
    versionId: 'v-1',
    versionDocId: 'child-lincoln__apple-dash-starter__v-1',
    visitId: 's-one',
    noteActionId: 'n-1',
    help: 'none-offered',
  }

  it('refuses a target for a later version', () => {
    // The reported P1: words accepted about V1, filed against V2.
    expect(sameNoteTarget(target, { ...target, versionId: 'v-2' })).toBe(false)
    expect(
      sameNoteTarget(target, { ...target, versionDocId: 'child-lincoln__p__v-2' }),
    ).toBe(false)
  })

  it('refuses a target from another visit, child or project', () => {
    expect(sameNoteTarget(target, { ...target, visitId: 's-two' })).toBe(false)
    expect(sameNoteTarget(target, { ...target, childId: 'child-london' })).toBe(false)
    expect(sameNoteTarget(target, { ...target, projectId: 'other' })).toBe(false)
  })

  it('does NOT compare the action id — a retry keeps its target', () => {
    expect(sameNoteTarget(target, { ...target, noteActionId: 'n-2' })).toBe(true)
  })

  it('does NOT compare help — a hint offered later changes no target', () => {
    expect(
      sameNoteTarget(target, { ...target, help: 'hints-offered', hintsOffered: 2 }),
    ).toBe(true)
  })

  it('keys the recorder so a version change remounts it', () => {
    expect(noteTargetKey(target)).not.toBe(noteTargetKey({ ...target, versionId: 'v-2' }))
    expect(noteTargetKey(target)).not.toBe(noteTargetKey({ ...target, visitId: 's-two' }))
    expect(noteTargetKey(null)).toBe('no-target')
  })
})

describe('an unfinished Save is held for its own owner', () => {
  const payload: PendingSave = {
    scope: SCOPE,
    versionId: 'v-held',
    label: 'My version 1',
    createdAt: '2026-11-17T21:00:00.000Z',
    files: { 'pxt.json': '{}', 'main.ts': 'info.setLife(4)' },
    attempts: 2,
    capturedSignature: 'sig-held',
  }
  const owner = {
    familyId: SCOPE.familyId,
    childId: SCOPE.childId,
    projectId: SCOPE.projectId,
  }

  beforeEach(() => resetPendingSaveStore())

  it('offers the EXACT payload and identity back on return', () => {
    holdPendingSave(owner, payload)
    const back = readPendingSave(owner)
    expect(back).toEqual(payload)
    // The same action id, so the immutable writer treats the retry as a retry.
    expect(back?.versionId).toBe('v-held')
    expect(back?.files['main.ts']).toBe('info.setLife(4)')
  })

  it('is invisible to a SIBLING’s editor', () => {
    holdPendingSave(owner, payload)
    expect(readPendingSave({ ...owner, childId: 'child-london' })).toBeNull()
  })

  it('is invisible to another family or another project', () => {
    holdPendingSave(owner, payload)
    expect(readPendingSave({ ...owner, familyId: 'family-2' })).toBeNull()
    expect(readPendingSave({ ...owner, projectId: 'other' })).toBeNull()
  })

  it('refuses to file a payload under an owner that is not its own', () => {
    // Otherwise a retry could be offered to the wrong child.
    holdPendingSave({ ...owner, childId: 'child-london' }, payload)
    expect(readPendingSave({ ...owner, childId: 'child-london' })).toBeNull()
  })

  it('is released when it lands, and when it is discarded', () => {
    holdPendingSave(owner, payload)
    clearPendingSave(owner, payload.versionId)
    expect(readPendingSave(owner)).toBeNull()
  })

  it('keeps the newest unfinished Save for one owner', () => {
    holdPendingSave(owner, payload)
    holdPendingSave(owner, {
      ...payload,
      versionId: 'v-newer',
      label: 'My version 2',
      createdAt: '2026-11-17T21:05:00.000Z',
    })
    expect(readPendingSave(owner)?.versionId).toBe('v-newer')
  })
})

/**
 * The interleaving regression. The reported sequence:
 *
 *   A is captured and its write fails, so A is held.
 *   The child chooses *Leave and lose it*, then comes back.
 *   B is captured and its write fails, so B is held.
 *   A's write — still in flight from before — finally acknowledges.
 *
 * With an owner-only clear, A's acknowledgment wiped B's recovery slot and B
 * was gone. With an owner-only hold, A's retry overwrote B with older bytes.
 *
 * POSITIVE CONTROLS: drop the `versionId` argument from `clearPendingSave` and
 * the first case fails; return `true` unconditionally from
 * `pendingSlotAccepts` and the second fails.
 */
describe('one save never clears or replaces another save’s recovery slot', () => {
  const owner = {
    familyId: SCOPE.familyId,
    childId: SCOPE.childId,
    projectId: SCOPE.projectId,
  }
  const base: PendingSave = {
    scope: SCOPE,
    versionId: 'v-A',
    label: 'A',
    createdAt: '2026-11-17T21:00:00.000Z',
    files: { 'pxt.json': '{}', 'main.ts': 'info.setLife(4)' },
    attempts: 1,
    capturedSignature: 'sig-A',
  }
  const A = base
  const B: PendingSave = {
    ...base,
    versionId: 'v-B',
    label: 'B',
    createdAt: '2026-11-17T21:10:00.000Z',
    files: { 'pxt.json': '{}', 'main.ts': 'info.setLife(7)' },
    capturedSignature: 'sig-B',
  }

  beforeEach(() => resetPendingSaveStore())

  it('leaves B retriable when A acknowledges afterwards', () => {
    holdPendingSave(owner, A)
    // Leave, return, capture B.
    expect(holdPendingSave(owner, B)).toBe(true)
    expect(readPendingSave(owner)?.versionId).toBe('v-B')

    // A's own write finally lands. It may finish its own version…
    clearPendingSave(owner, A.versionId)

    // …and B is still exactly there, with its own bytes and its own id.
    const slot = readPendingSave(owner)
    expect(slot?.versionId).toBe('v-B')
    expect(slot?.files['main.ts']).toBe('info.setLife(7)')
    expect(slot?.capturedSignature).toBe('sig-B')
  })

  it('refuses A’s GENUINE retry once B owns the slot', () => {
    // The real order: A is offered FIRST (its write failed), then B replaces it
    // after the child returns, and only then does A's retry arrive. Offering B
    // first would not have modelled a retry at all.
    expect(holdPendingSave(owner, A)).toBe(true)
    expect(holdPendingSave(owner, B)).toBe(true)
    const took = holdPendingSave(owner, { ...A, attempts: 2 })
    expect(took).toBe(false)
    expect(readPendingSave(owner)?.versionId).toBe('v-B')
    expect(readPendingSave(owner)?.files['main.ts']).toBe('info.setLife(7)')
  })

  it('refuses A’s retry even when A was never offered before B', () => {
    // A payload the store has not seen takes the next sequence number, so it
    // would look "newer" by order alone. Its own stamp is still older, and the
    // display rule refuses it — both halves are needed.
    expect(holdPendingSave(owner, B)).toBe(true)
    expect(holdPendingSave(owner, { ...A, attempts: 2 })).toBe(false)
    expect(readPendingSave(owner)?.versionId).toBe('v-B')
  })

  it('lets a save re-hold its OWN slot, which is what a retry does', () => {
    holdPendingSave(owner, A)
    expect(holdPendingSave(owner, { ...A, attempts: 2 })).toBe(true)
    expect(readPendingSave(owner)?.attempts).toBe(2)
  })

  it('lets B clear its own slot when B lands', () => {
    holdPendingSave(owner, A)
    holdPendingSave(owner, B)
    clearPendingSave(owner, B.versionId)
    expect(readPendingSave(owner)).toBeNull()
  })

  it('answers the display question in one place, for the screen', () => {
    expect(pendingSlotAccepts(null, A)).toBe(true)
    expect(pendingSlotAccepts(A, A)).toBe(true)
    expect(pendingSlotAccepts(A, B)).toBe(true)
    expect(pendingSlotAccepts(B, A)).toBe(false)
  })

  it('decides a SAME-MILLISECOND tie by real offer order, not by the stamp', () => {
    // Two save actions can share a timestamp; a tie decided the wrong way is
    // the older payload overwriting the newer one's recovery slot.
    const sameStamp = { ...B, createdAt: A.createdAt }
    holdPendingSave(owner, A)
    expect(holdPendingSave(owner, sameStamp)).toBe(true)
    expect(holdPendingSave(owner, { ...A, attempts: 3 })).toBe(false)
    expect(readPendingSave(owner)?.versionId).toBe('v-B')
    expect(readPendingSave(owner)?.files['main.ts']).toBe('info.setLife(7)')
  })
})
