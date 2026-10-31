import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadSourceFiles, stripComments } from '../../test/childSwitchSources'

/**
 * UX-273's one hard promise, read off the source: **opening the hand-off writes
 * nothing and calls nothing.**
 *
 * A behavioural test can show that no write happened on the path it drove. What
 * it cannot show is the ABSENCE of a second path — a "while we're here" thread
 * creation, a pre-send, a model call to tidy the question up — which is exactly
 * the failure that makes this feature dangerous rather than merely broken: the
 * destination writes a child's records behind confirm cards, and a draft that
 * sent itself would put one of those writes a single tap from a screen she did
 * not choose to be on.
 *
 * So these assertions are deliberately narrow and are about names:
 *
 *  1. no module on the hand-off path names a Firestore write, a collection
 *     helper, the AI hook, or `openChatWithContext` — the existing planner→chat
 *     door, which creates a thread document AND a user message before it
 *     navigates, and is the thing this feature must not become;
 *  2. the transfer names no URL or storage carrier, because a question in a
 *     query string is in the back stack and one in `localStorage` outlives the
 *     visit;
 *  3. exactly one product call site stages a hand-off.
 *
 * It does NOT claim a write is impossible from here — an import graph cannot
 * prove that, and asserting it would be the overreach these source tests are
 * careful to avoid.
 */

const root = process.cwd()
const read = (relPath: string) => stripComments(readFileSync(join(root, relPath), 'utf8'))

const TRANSFER = 'src/features/planner-chat/plannerAskHandoff.ts'
const RECEIVER = 'src/features/shelly-chat/usePlannerAskHandoff.ts'
const NOTICE = 'src/features/shelly-chat/PlannerAskHandoffNotice.tsx'
const LINK = 'src/features/planner-chat/PlannerBoundaryLink.tsx'
const CUSTODY = 'src/features/shelly-chat/composerCustody.ts'
const LINES = 'src/features/shelly-chat/plannerAskHandoffLines.ts'
const SCOPE_WATCH = 'src/features/shelly-chat/useHandoffScopeWatch.ts'
/** The planner-side ownership rail: which scope the transcript on screen is. */
const SOURCE_OWNERSHIP = 'src/features/planner-chat/usePlannerAskSource.ts'

const PATH_MODULES = [TRANSFER, RECEIVER, NOTICE, LINK, CUSTODY, LINES, SCOPE_WATCH, SOURCE_OWNERSHIP]

/** Every way this repo spells a write, a send, or a paid call. */
const FORBIDDEN = [
  'setDoc',
  'addDoc',
  'updateDoc',
  'deleteDoc',
  'runTransaction',
  'writeBatch',
  'onSnapshot',
  'getDocs',
  'shellyChatThreadsCollection',
  'shellyChatMessagesCollection',
  'openChatWithContext',
  'useAI',
  'TaskType',
  'generateImage',
  'applyChatAction',
]

describe('the hand-off path writes nothing and calls nothing', () => {
  it('names no writer, no collection, no model call and not the door that writes', () => {
    for (const path of PATH_MODULES) {
      const source = read(path)
      for (const name of FORBIDDEN) {
        expect(source.includes(name), `${path} names ${name}`).toBe(false)
      }
    }
  })

  it('carries the question in neither the URL nor any store', () => {
    for (const path of [TRANSFER, RECEIVER, LINK, CUSTODY]) {
      const source = read(path)
      for (const carrier of ['localStorage', 'sessionStorage', 'useSearchParams', 'searchParams', 'window.location']) {
        expect(source.includes(carrier), `${path} names ${carrier}`).toBe(false)
      }
    }
  })

  it('is staged from exactly one place in the app', () => {
    const callers = loadSourceFiles()
      .filter((f) => f.path !== TRANSFER)
      .filter((f) => stripComments(f.source).includes('stagePlannerAskHandoff('))
      .map((f) => f.path)
    expect(callers).toEqual([LINK])
  })

  it('clears its two slots from the receiver and the shell observer only', () => {
    // The observer exists so a scope change is honoured while Ask AI is
    // unmounted; a third caller would be a lifetime nobody can reason about.
    const callers = (name: string) =>
      loadSourceFiles()
        .filter((f) => f.path !== TRANSFER && f.path !== CUSTODY)
        .filter((f) => stripComments(f.source).includes(`${name}(`))
        .map((f) => f.path)
        .sort()
    expect(callers('clearComposerCustody')).toEqual([SCOPE_WATCH])
    expect(callers('clearPlannerAskHandoff')).toEqual([SCOPE_WATCH])
    // Ending a sign-in refuses every save still to come from it, which is a
    // stronger act than clearing and belongs to the same single caller.
    expect(callers('endComposerCustodySession')).toEqual([SCOPE_WATCH])
  })

  it('keeps the composer-custody slot to one writer and one reader', () => {
    // A second caller is how a "narrowly scoped holder" becomes a store.
    const users = (name: string) =>
      loadSourceFiles()
        .filter((f) => f.path !== CUSTODY)
        .filter((f) => stripComments(f.source).includes(`${name}(`))
        .map((f) => f.path)
    expect(users('saveComposerCustody')).toEqual([RECEIVER])
    expect(users('takeComposerCustody')).toEqual([RECEIVER])
    // Looking is the same slot and the same lifetime: the receiver peeks before
    // it knows whether anything can be placed, so a second peeker would be a
    // second reader of a read-once slot by another name.
    expect(users('peekComposerCustody')).toEqual([RECEIVER])
    // The second home — what the question displaced — has exactly the same
    // single user. Two homes is the bound on this feature's memory, so a third
    // module reaching into either of them is how the bound would be lost.
    expect(users('saveDisplacedComposerCustody')).toEqual([RECEIVER])
    expect(users('takeDisplacedComposerCustody')).toEqual([RECEIVER])
    expect(users('peekDisplacedComposerCustody')).toEqual([RECEIVER])
    // Winding an interrupted stage back is the HANDOVER's decision and only its
    // decision: a second caller would be a second answer to what an interrupted
    // request means, applied somewhere the request may still be running.
    expect(users('normalizeInterruptedComposerDraft')).toEqual([])
    // Minting a preview is taking ownership of a resource somebody then has to
    // free, so it belongs to the one module that PLACES restored work.
    expect(users('adoptRestoredUploadPreviews')).toEqual([RECEIVER])
    // Re-stamping which conversation an entry is in is the one write here that
    // changes a label rather than storing one, and whether a thread creation was
    // really this composer's OWN is only knowable where the operation's context
    // was captured. A second caller would be a second answer to that question.
    expect(users('advanceComposerCustodyThread')).toEqual([RECEIVER])
  })

  it('is read from exactly one place in the app', () => {
    const readers = loadSourceFiles()
      .filter((f) => f.path !== TRANSFER)
      .filter((f) => stripComments(f.source).includes('takePlannerAskHandoff('))
      .map((f) => f.path)
    expect(readers).toEqual([RECEIVER])
  })
})
