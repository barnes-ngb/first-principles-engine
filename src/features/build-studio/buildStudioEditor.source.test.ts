import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The editor's load-bearing properties, asserted where they live.
 *
 * ── Why the source and not the render ─────────────────────────────────────
 *
 * Mounting `BuildStudioEditor` means mounting a cross-origin MakeCode iframe
 * and a `postMessage` handshake that cannot complete in jsdom, so a render test
 * here would exercise the loading cover and nothing else — and the properties
 * that matter are about ORDER and IDENTITY on paths a render test would not
 * take. The repo's precedent is `childSwitchResets.source.test.ts`, whose own
 * header makes the same argument for three heavy hosts.
 *
 * The genuinely checkable halves are checked for real elsewhere: the capture
 * fence in `arcadeBridge.test.ts`, the identity in `buildStudioScope.test.ts`,
 * the guard in `useBuildStudioDepartureGuard.test.ts`, and the two writers
 * against mocked Firestore. This file pins the WIRING between them.
 *
 * Browser-level verification of the live editor remains Sol's, and physical
 * device behaviour remains a family check.
 */

const EDITOR = readFileSync(resolve(__dirname, 'BuildStudioEditor.tsx'), 'utf8')
/** Comments removed — these scans are about what the code does. */
const CODE = EDITOR.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('this scan reads something (guards itself)', () => {
  it('found the editor and stripped it to code', () => {
    expect(CODE).toContain('export default function BuildStudioEditor')
    expect(CODE.length).toBeGreaterThan(2000)
  })
})

describe('departure goes through the router, not only beforeunload', () => {
  it('uses the app’s own departure guard', () => {
    expect(CODE).toContain('useBuildStudioDepartureGuard')
  })

  it('does NOT hand-roll a second beforeunload listener', () => {
    // There is exactly one, inside the guard, which also owns the router hold.
    expect(CODE).not.toContain('beforeunload')
  })

  it('renders a held departure as a real choice, with Stay and an explicit leave', () => {
    expect(CODE).toContain('departure.held')
    expect(CODE).toContain('departure.stay')
    expect(CODE).toContain('departure.leaveAnyway')
    expect(EDITOR).toContain('Stay here')
    expect(EDITOR).toContain('Leave and lose it')
  })

  it('offers the retry and the download from inside that choice', () => {
    const dialog = EDITOR.slice(EDITOR.indexOf('departure.held'))
    expect(dialog).toContain('handleRetrySave')
    expect(dialog).toContain('handleDownloadCurrent')
  })
})

describe('the write latches are claimed before the first await', () => {
  it('declares a synchronous latch for Save and for the note', () => {
    expect(CODE).toContain('saveLatchRef')
    expect(CODE).toContain('noteLatchRef')
  })

  it('checks the Save latch before anything can await', () => {
    const handler = CODE.slice(CODE.indexOf('const handleSave ='))
    const check = handler.indexOf('if (saveLatchRef.current) return')
    const firstAwait = handler.indexOf('await')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(firstAwait)
  })

  it('checks the note latch before anything can await', () => {
    const handler = CODE.slice(CODE.indexOf('const handleSaveNote ='))
    const check = handler.indexOf('if (noteLatchRef.current) return')
    const firstAwait = handler.indexOf('await')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(firstAwait)
  })

  it('releases both latches in a finally', () => {
    expect(CODE).toMatch(/finally\s*\{\s*saveLatchRef\.current = false/)
    expect(CODE).toMatch(/finally\s*\{\s*noteLatchRef\.current = false/)
  })
})

describe('an old acknowledgment cannot clear newer work', () => {
  it('captures the source revision BEFORE the capture', () => {
    const handler = CODE.slice(CODE.indexOf('const handleSave ='))
    const captured = handler.indexOf('const capturedRevision = sourceRevisionRef.current')
    const request = handler.indexOf('requestSnapshot')
    expect(captured).toBeGreaterThan(-1)
    expect(captured).toBeLessThan(request)
  })

  it('compares the live revision to the captured one on acknowledgment', () => {
    expect(CODE).toContain('sourceRevisionRef.current === attempt.capturedRevision')
  })

  it('leaves the editor dirty when newer work arrived during the write', () => {
    expect(CODE).toContain('setEditorDirty(!stillCurrent)')
  })

  it('bumps the revision on every editor save', () => {
    expect(CODE).toContain('sourceRevisionRef.current += 1')
  })
})

describe('the live scope is retired, and read after every await', () => {
  it('retires the token on unmount and on every visit change', () => {
    expect(CODE).toMatch(/liveTokenRef\.current = RETIRED/)
    expect(CODE).toContain('const RETIRED')
  })

  it('writes with the CAPTURED child, never the live one', () => {
    expect(CODE).toContain('childId: attempt.scope.childId')
    // And it never reads the shell's active child at all.
    expect(CODE).not.toContain('useActiveChild')
  })

  it('checks the scope again after the durable write resolves', () => {
    expect(CODE).toContain('liveTokenRef.current !== ownToken')
  })

  it('reports an out-of-scope completion rather than dropping it', () => {
    expect(CODE).toContain('onOutOfScopeSave')
  })
})

describe('a reflection is written only to its own disclosed target', () => {
  it('freezes the target when the words are accepted', () => {
    const onTranscript = CODE.slice(CODE.indexOf('onTranscript='))
    expect(onTranscript).toContain('target: noteTarget')
  })

  it('keys the recorder by the target, so a version change retires it', () => {
    expect(CODE).toContain('key={noteTargetKey(noteTarget)}')
  })

  it('checks the target before the await AND the scope after it', () => {
    const handler = CODE.slice(
      CODE.indexOf('const handleSaveNote ='),
      CODE.indexOf('const gated ='),
    )
    const before = handler.indexOf('sameNoteTarget(noteDraft.target, noteTarget)')
    const call = handler.indexOf('await saveBuildStudioNote')
    const after = handler.indexOf('liveTokenRef.current !== ownToken')
    expect(before).toBeGreaterThan(-1)
    expect(before).toBeLessThan(call)
    expect(after).toBeGreaterThan(call)
  })

  it('writes the FROZEN target’s ids, not the current lastSaved', () => {
    const handler = CODE.slice(CODE.indexOf('await saveBuildStudioNote'))
    expect(handler).toContain('versionId: target.versionId')
    expect(handler).toContain('versionDocId: target.versionDocId')
    expect(handler).toContain('noteActionId: target.noteActionId')
  })

  it('does not clear another draft on a late result', () => {
    expect(CODE).toContain('sameNoteTarget(current.target, target) ? null : current')
  })

  it('keeps the draft on a failure, including a refusal', () => {
    const handler = CODE.slice(
      CODE.indexOf('const handleSaveNote ='),
      CODE.indexOf('const gated ='),
    )
    const catchBlock = handler.slice(handler.indexOf('} catch'))
    expect(catchBlock).not.toContain('setNoteDraft(null)')
  })

  it('counts help as OFFERED, never as heard', () => {
    expect(CODE).toContain("'hints-offered'")
    expect(CODE).not.toContain("'hints-heard'")
    expect(CODE).not.toContain('hintsHeard')
  })

  it('keeps voice provenance through a typed correction', () => {
    // The field list in the typed-correction setter carries the original
    // capture and event id forward rather than relabelling them.
    expect(CODE).toContain('setNoteDraft({ ...noteDraft, text: e.target.value })')
    expect(CODE).not.toContain("capture: 'typed'")
  })
})

describe('the editing controls are closed when no usable project is open', () => {
  it('gates on the round trip, not only on the phase', () => {
    expect(CODE).toContain('const gated = phase !== EditorPhase.Ready || !projectReady')
    expect(CODE).toContain('projectReady && !writeInFlight')
  })

  it('does not treat a switchblocks acknowledgment as readiness', () => {
    const importEffect = CODE.slice(
      CODE.indexOf('setPhase(EditorPhase.Importing)'),
      CODE.indexOf('const commit ='),
    )
    expect(importEffect).not.toContain('switchToBlocks')
    expect(importEffect).toContain('requestSnapshot')
    expect(importEffect).toContain('starterImportLooksCorrect')
  })

  it('judges a reopened version by its own weaker rule', () => {
    expect(CODE).toContain('reopenedVersionLooksLoaded')
  })
})

describe('every open action is checked against child AND project', () => {
  it('re-checks ownership in the action that imports bytes', () => {
    const open = CODE.slice(CODE.indexOf('const openVersion ='))
    expect(open).toContain('versionBelongsTo(version, childId, projectId)')
  })

  it('imports the chosen version’s OWN archive, not the live frame', () => {
    expect(CODE).toContain('parseBuildStudioSource(reopening.sourceArchive)')
  })
})

describe('the starter fallback is the STARTER and nothing else', () => {
  it('offers the checked project PNG with import instructions', () => {
    expect(CODE).toContain('STARTER_PROJECT_PNG_URL')
    expect(EDITOR).toContain('Import File')
  })

  it('says plainly that it is not a copy of saved work', () => {
    expect(EDITOR).toContain('not a copy of any game saved')
  })

  it('never offers the starter as recovery of edited work', () => {
    // `handleDownloadCurrent` is the edited-source route and reads only the
    // pending payload or the editor's own last save.
    const download = CODE.slice(
      CODE.indexOf('const handleDownloadCurrent ='),
      CODE.indexOf('const openVersion ='),
    )
    expect(download).not.toContain('starterSourceFiles')
    expect(download).not.toContain('STARTER_PROJECT_PNG_URL')
  })
})

describe('the kid page carries no routine implementation detail', () => {
  it('does not render a digest, a byte size or a file count', () => {
    expect(CODE).not.toContain('sourceDigest')
    expect(CODE).not.toContain('byteSize')
    expect(CODE).not.toContain('fileCount')
    expect(CODE).not.toContain('showTechnicalDetail')
  })

  it('does not render the editor’s version string', () => {
    expect(CODE).not.toContain('editorHeader')
  })

  it('still keeps the honest version-drift banner', () => {
    // A warning that something changed is not routine detail.
    expect(CODE).toContain('onVersionDrift')
  })
})

describe('the hints never send a mutating editor command', () => {
  it('handles Hint and Hear it with nothing but speech', () => {
    const hint = CODE.slice(CODE.indexOf('const handleHint ='), CODE.indexOf('const currentHint'))
    expect(hint).toContain('tts.speak')
    for (const action of ['importProject', 'requestSnapshot', 'switchToBlocks', 'postMessage']) {
      expect(hint, action).not.toContain(action)
    }
    const hear = CODE.slice(
      CODE.indexOf('const handleHearGoal ='),
      CODE.indexOf('const handleHint ='),
    )
    expect(hear).toContain('tts.speak')
    expect(hear).not.toContain('bridgeRef')
  })

  it('reads the hint wording from the OPEN source', () => {
    expect(CODE).toContain('nextHint(hintsOffered, openLives)')
    expect(CODE).toContain('goalSpeech(openLives)')
    expect(CODE).toContain('readOpenLifeValue(round.files')
  })

  it('resets the hint ladder when a visit changes', () => {
    // Inside `openVersion`, which is the only thing that starts a new visit.
    const start = CODE.indexOf('const openVersion =')
    expect(start).toBeGreaterThan(-1)
    const open = CODE.slice(start, start + 1200)
    expect(open).toContain('setHintsOffered(0)')
    expect(open).toContain('setVisit({ visitId: newVisitId(')
  })
})

describe('an unfinished Save survives a remount, for its owner only', () => {
  it('seeds the pending payload from the owner-bound hold', () => {
    expect(CODE).toContain('readPendingSave({')
  })

  it('holds it while it is unfinished and releases it when it lands', () => {
    expect(CODE).toContain('holdPendingSave(')
    expect(CODE).toContain('clearPendingSave(ownOwner)')
  })

  it('files it under the payload’s OWN owner, not the live one', () => {
    expect(CODE).toContain('const ownOwner: PendingOwner = {')
    expect(CODE).toContain('childId: payload.scope.childId')
  })
})
