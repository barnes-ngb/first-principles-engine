import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The editor's architectural NO-side-effect invariants.
 *
 * Only the claims that are genuinely about what the module *cannot* do are
 * here. Everything that is about what it DOES — clean versus newer edits,
 * departure, note ownership, failure recovery — moved to
 * `BuildStudioEditor.behavior.test.tsx`, because a scan pinning the position of
 * a variable mirrors an implementation instead of checking it, and passes a
 * rewrite that breaks the behaviour.
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

describe('the editor never reads the live active child', () => {
  it('takes its child as a prop and nothing else', () => {
    // `useCreativeTimer`'s defect: a write that resolved its child when it
    // FINISHED rather than when it started. BIND.
    expect(CODE).not.toContain('useActiveChild')
    expect(CODE).toContain('childId: attempt.scope.childId')
  })
})

describe('departure goes through the router, not a hand-rolled listener', () => {
  it('uses the app’s own guard and registers no second beforeunload', () => {
    expect(CODE).toContain('useBuildStudioDepartureGuard')
    expect(CODE).not.toContain('beforeunload')
  })

  it('registers a profile-change guard rather than patching ProfileMenu', () => {
    expect(CODE).toContain('registerProfileChangeGuard')
  })
})

describe('the helper can only talk', () => {
  it('handles Hint and Hear it with nothing but speech', () => {
    const hint = CODE.slice(CODE.indexOf('const handleHint ='), CODE.indexOf('const currentHint'))
    expect(hint).toContain('tts.speak')
    for (const action of [
      'importProject',
      'requestSnapshot',
      'switchToBlocks',
      'playFullscreen',
      'backToBlocks',
      'postMessage',
    ]) {
      expect(hint, action).not.toContain(action)
    }
    const hear = CODE.slice(
      CODE.indexOf('const handleHearGoal ='),
      CODE.indexOf('const handleHint ='),
    )
    expect(hear).toContain('tts.speak')
    expect(hear).not.toContain('bridgeRef')
  })
})

/**
 * Both scans below take a BOUNDED slice, and both guard the slice itself.
 *
 * They used to end at `const openVersion =`, a handler the editor no longer
 * has: `indexOf` returned `-1`, so one scan read to the end of the file and
 * reached the adult-assisted starter link 300 lines further down, and the other
 * sliced an empty string and asserted nothing at all. A slice whose boundaries
 * are not checked is a test that cannot fail.
 */
function slice(from: string, to: string): string {
  const start = CODE.indexOf(from)
  const end = CODE.indexOf(to)
  expect(start, `boundary missing: ${from}`).toBeGreaterThanOrEqual(0)
  expect(end, `boundary missing: ${to}`).toBeGreaterThan(start)
  return CODE.slice(start, end)
}

describe('the starter is never offered as recovery of edited work', () => {
  it('keeps the edited-source download off the starter entirely', () => {
    // The download handler ONLY, bounded by the next declaration after it.
    const download = slice('const handleDownloadCurrent =', 'const applyReplace =')
    expect(download).not.toContain('starterSourceFiles')
    expect(download).not.toContain('STARTER_PROJECT_PNG_URL')
    // And it reaches for the latest real bytes rather than a template.
    expect(download).toContain('departureFilesRef.current')
    expect(download).toContain('pending?.files')
  })

  it('says plainly that the project file is not a copy of saved work', () => {
    expect(EDITOR).toContain('not a copy of any game saved')
  })
})

describe('words are written only by a deliberate act, under their own owner', () => {
  it('has ONE note write, inside the commit, bound to the payload', () => {
    // One call site, so there is nowhere for an automatic write to hide.
    expect(CODE.split('saveBuildStudioNote(').length - 1).toBe(1)
    const commit = slice('const commitNote =', 'const handleSaveNote =')
    expect(commit).toContain('saveBuildStudioNote(')
    // Provenance comes from the payload's frozen target — the version, its
    // document and the one action id — never from whatever the screen shows.
    expect(commit).toContain('sending.target.noteActionId')
    expect(commit).toContain('payload.target.childId')
    expect(commit).not.toContain('noteTarget')
  })

  it('clears held words by action id, never by owner alone', () => {
    // An owner-only clear let one acknowledgment wipe another set of words.
    for (const call of CODE.match(/clearPendingNote\([^)]*\)/g) ?? []) {
      expect(call, call).toContain('noteActionId')
    }
    expect(CODE).toContain('clearPendingNote(')
  })
})

describe('the kid page carries no routine implementation detail', () => {
  it('renders no digest, byte size, file count or compiler version', () => {
    for (const detail of [
      'sourceDigest',
      'byteSize',
      'fileCount',
      'showTechnicalDetail',
      'editorHeader',
      'onVersionDrift',
    ]) {
      expect(CODE, detail).not.toContain(detail)
    }
  })

  it('reads runtime metadata only from the editor’s own info reply', () => {
    // Never from the project header, whose `targetVersion` is a `0.0.0`
    // placeholder in stock 4.1.28.
    expect(CODE).toContain('runtimeVersions()')
    expect(CODE).not.toContain('snapshot.header.targetVersion')
    expect(CODE).not.toContain('header.target')
  })
})

describe('every open action is checked against child AND project', () => {
  it('re-checks ownership in the action that imports bytes', () => {
    // `applyReplace` is that action now — one path for the shelf's Open and
    // for a recovered file — and the check lives inside it, not only on the
    // shelf row that offered it.
    const open = slice('const applyReplace =', 'const requestReplace =')
    expect(open).toContain('versionBelongsTo(version, childId, projectId)')
  })

  it('imports the chosen version’s OWN archive, not the live frame', () => {
    expect(CODE).toContain('parseBuildStudioSource(reopening.sourceArchive)')
  })
})
