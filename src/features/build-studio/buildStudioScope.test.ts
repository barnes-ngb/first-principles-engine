import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearPendingSave,
  holdPendingSave,
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
    capturedRevision: 7,
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
    clearPendingSave(owner)
    expect(readPendingSave(owner)).toBeNull()
  })

  it('keeps only the newest unfinished Save for one owner', () => {
    holdPendingSave(owner, payload)
    holdPendingSave(owner, { ...payload, versionId: 'v-newer', label: 'My version 2' })
    expect(readPendingSave(owner)?.versionId).toBe('v-newer')
  })
})
