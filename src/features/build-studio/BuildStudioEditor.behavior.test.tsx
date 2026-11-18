import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The editor's LIFECYCLE, exercised rather than scanned.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 *
 * A source scan pinning `const capturedRevision = …` above `requestSnapshot`
 * passed while an ordinary clean Save reported "you have made more changes
 * since then" and falsely held the next navigation. The scan mirrored the
 * implementation; it did not check the behaviour. These do.
 *
 * ── How ──────────────────────────────────────────────────────────────────
 *
 * The bridge is replaced with a controllable fake: the test decides when the
 * handshake lands, what a capture returns, and when a `workspacesave` is
 * announced — which is the whole point, because real delivery is delayed and
 * that delay is where the defects lived. Nothing crosses an origin and no
 * iframe handshake is required.
 */

// ── The fake bridge ──────────────────────────────────────────────────────

interface FakeProject {
  header: { id: string; name: string; target?: string; targetVersion?: string }
  files: Record<string, string>
}

/**
 * The REAL starter bytes, not a stand-in.
 *
 * This is the driver bug the C3 root run found. The component imports
 * `starterSourceFiles()` and records ITS signature as "what is on the shelf";
 * a fake peer that announced different bytes therefore read as a permanent
 * edit, so every clean-source assertion failed — a broken synthetic driver
 * reporting a product defect that was not there. The fake editor now holds the
 * same project the component does.
 */
const starterFiles = (): Record<string, string> => ({ ...starterSourceFiles() })

/** The same project with the life number changed, as a child's edit would. */
const editedFiles = (lives: number): Record<string, string> => {
  const files = starterFiles()
  return {
    ...files,
    'main.ts': files['main.ts'].replace('info.setLife(3)', `info.setLife(${lives})`),
    'main.blocks': files['main.blocks'].replace(
      /(type="hudSetLife"[\s\S]{0,200}?<field name="NUM">)3(<\/field>)/,
      `$1${lives}$2`,
    ),
  }
}

/** Every fake bridge the component built, newest last. */
const bridges: FakeBridgeStub[] = []

class FakeBridgeStub {
  readonly frameId: string
  onEditorLoaded: () => void
  onEditorSave: (p: FakeProject) => void
  isScopeLive: () => boolean
  /** What the NEXT capture resolves with. */
  nextCapture: Record<string, string> = starterFiles()
  /** When set, the next capture rejects with it. */
  captureError: Error | null = null
  /**
   * When set, a capture HANGS and hands its resolver here — so a test can
   * reproduce the real thing: MakeCode answers late, and whatever the app does
   * in the meantime must not cancel the answer.
   */
  captureGate: ((release: (files: Record<string, string>) => void) => void) | null = null
  captures = 0
  disposed = false
  infoAsked = 0
  played = 0
  edited = 0
  imported: Record<string, string>[] = []
  runtime: { target?: string; pxt?: string } | null = null
  /** The last project the EDITOR announced and this app ACCEPTED. */
  lastSave: Record<string, string> | null = null
  /** The current source the caps refused, when it is small enough to hand back. */
  overCapsFiles: Record<string, string> | null = null
  /** Is the newest source over the caps at all? */
  overCaps = false

  constructor(options: {
    newId: () => string
    onEditorLoaded?: () => void
    onEditorSave?: (p: FakeProject) => void
    isScopeLive: () => boolean
  }) {
    this.frameId = options.newId()
    this.onEditorLoaded = options.onEditorLoaded ?? (() => {})
    this.onEditorSave = options.onEditorSave ?? (() => {})
    this.isScopeLive = options.isScopeLive
    bridges.push(this)
  }

  frameUrl() {
    return `https://arcade.makecode.com/?controller=1&frameId=${this.frameId}`
  }
  attach() {}
  handleMessage = () => {}
  isLoaded() {
    return true
  }
  editorSaveSeen() {
    if (!this.lastSave) return null
    return {
      header: { id: 'h1', name: 'Apple Dash starter' },
      files: { ...this.lastSave },
    }
  }
  sourceOverCaps() {
    return this.overCaps
  }
  oversizedSourceForDownload() {
    return this.overCapsFiles ? { ...this.overCapsFiles } : null
  }
  runtimeVersions() {
    return this.runtime
  }
  async requestInfo() {
    this.infoAsked += 1
    return this.runtime
  }
  async importProject(files: Record<string, string>) {
    this.imported.push(files)
  }
  async switchToBlocks() {
    return true
  }
  async playFullscreen() {
    this.played += 1
    return true
  }
  async backToBlocks() {
    this.edited += 1
    return true
  }
  async requestSnapshot(): Promise<FakeProject> {
    this.captures += 1
    if (this.captureError) throw this.captureError
    const header = { id: 'h1', name: 'Apple Dash starter', targetVersion: '0.0.0' }
    const gate = this.captureGate
    if (gate) {
      this.captureGate = null
      return new Promise<FakeProject>((resolveCapture) => {
        gate((files) => resolveCapture({ header, files: { ...files } }))
      })
    }
    return { header, files: { ...this.nextCapture } }
  }
  dispose() {
    this.disposed = true
  }
  /** Pretend MakeCode announced a save, with whatever bytes. */
  announce(files: Record<string, string>) {
    // Accepted, so it becomes the newest source this app has read — and it
    // clears any over-cap refusal, exactly as `acceptProject` does.
    this.lastSave = { ...files }
    this.overCaps = false
    this.overCapsFiles = null
    this.onEditorSave({
      header: { id: 'h1', name: 'Apple Dash starter' },
      files: { ...files },
    })
  }

  /**
   * Pretend MakeCode announced a save the CAPS refused.
   *
   * The real bridge's behaviour, faithfully: `onEditorSave` is never called, the
   * accepted editor-save answer keeps pointing at the older project, and the
   * refused source is available for a download only when it is bounded enough
   * to hold (`files`) — `null` reproduces the too-big-to-hold case.
   */
  refuseTooBig(files: Record<string, string> | null) {
    this.overCaps = true
    this.overCapsFiles = files ? { ...files } : null
  }
  /** Pretend the handshake completed. */
  ready() {
    this.onEditorLoaded()
  }
}

vi.mock('./arcadeBridge', () => ({
  ARCADE_OPENING_TIMEOUT_MS: 45_000,
  ArcadeBridge: FakeBridgeStub,
}))

// ── The writers ──────────────────────────────────────────────────────────

const saveVersion = vi.fn()
const saveNote = vi.fn()

vi.mock('../../core/firebase/buildStudioVersionWrites', () => ({
  BuildStudioRefused: class extends Error {},
  saveBuildStudioVersion: (args: unknown) => saveVersion(args),
}))
vi.mock('../../core/firebase/buildStudioNoteWrites', () => ({
  BuildStudioNoteRefused: class extends Error {},
  saveBuildStudioNote: (args: unknown) => saveNote(args),
}))

// ── The shell deps ───────────────────────────────────────────────────────

/**
 * A SUBSCRIBED router stand-in, not a plain mutable object.
 *
 * The previous mock returned `{ state }` from a module-level object, so a test
 * that set `blocker.state = 'blocked'` and then emitted the same editor bytes
 * produced no re-render — React saw an identical dirty value — and the
 * component never saw the hold. Eleven held-departure and profile cases failed
 * against working product code, which is the test driver lying about the
 * router rather than a defect.
 *
 * This store notifies its subscribers on every transition, and `proceed` /
 * `reset` perform the real transition back to `unblocked` the way the data
 * router does.
 */
const routerStore = {
  state: 'unblocked' as 'unblocked' | 'blocked',
  listeners: new Set<() => void>(),
  set(next: 'unblocked' | 'blocked') {
    if (routerStore.state === next) return
    routerStore.state = next
    for (const listener of [...routerStore.listeners]) listener()
  },
}
const proceedSpy = vi.fn()
const resetSpy = vi.fn()
let blockPredicate: (() => boolean) | null = null

vi.mock('react-router-dom', async () => {
  const React = await import('react')
  return {
    useBlocker: (arg: () => boolean) => {
      blockPredicate = arg
      const [, bump] = React.useReducer((count: number) => count + 1, 0)
      React.useEffect(() => {
        routerStore.listeners.add(bump)
        return () => {
          routerStore.listeners.delete(bump)
        }
      }, [])
      return {
        state: routerStore.state,
        proceed: () => {
          proceedSpy()
          routerStore.set('unblocked')
        },
        reset: () => {
          resetSpy()
          routerStore.set('unblocked')
        },
      }
    },
  }
})

/** Tap a nav link: the router holds the departure and asks the component. */
async function attemptDeparture() {
  await act(async () => {
    routerStore.set('blocked')
  })
}

const selectProfile = vi.fn()
let registeredGuard: ((next: string) => boolean) | null = null

/**
 * STABLE identities, because the real provider's are stable.
 *
 * This was the driver bug behind five profile failures. `ProfileProvider`
 * builds `registerProfileChangeGuard` with `useCallback` and publishes it in a
 * memoised value, so the editor's registration effect runs ONCE. The mock
 * returned a fresh closure on every render, so `setHeldProfile` re-rendered,
 * the effect's dependency changed, and its cleanup — whose job is to retire an
 * ask on unmount or a visit change — cancelled the ask the component had just
 * opened. The product code was right; the driver re-registered a guard the real
 * app never re-registers. Nothing about the delayed-capture, Stay-is-final or
 * late-result assertions is relaxed to accommodate it.
 */
const registerProfileChangeGuard = (g: (next: string) => boolean) => {
  registeredGuard = g
  return () => {
    // Only its own registration, as the provider's filter does.
    if (registeredGuard === g) registeredGuard = null
  }
}
const profileValue = { selectProfile, registerProfileChangeGuard }
vi.mock('../../core/profile/useProfile', () => ({ useProfile: () => profileValue }))

vi.mock('../../core/hooks/useTTS', () => ({ useTTS: () => ({ speak: vi.fn() }) }))

/**
 * A mic that hands over a transcript when it is tapped.
 *
 * The reflection is the one thing in this feature that cannot be captured
 * again, so its loss has to be reproducible: this fake lets a test accept words
 * the way `VoiceInput` does — text plus the voice event they came from — and
 * records the props it was given, so ownership and surface are checked too.
 */
const voiceScript = { text: 'I made the apples fall faster', eventId: 'voice-ev-1' }
const voiceProps: Array<{
  /** The whole profile, so the ENGINE choice is checked and not just the id. */
  profile?: { id?: string; voiceInputEnhanced?: boolean }
  sourceSurface?: string
}> = []
vi.mock('../../components/VoiceInput', async () => {
  const React = await import('react')
  return {
    default: (props: {
      profile?: { id?: string; voiceInputEnhanced?: boolean }
      sourceSurface?: string
      onTranscript: (text: string, meta?: { eventId?: string }) => void
    }) => {
      voiceProps.push({ profile: props.profile, sourceSurface: props.sourceSurface })
      return React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => props.onTranscript(voiceScript.text, { eventId: voiceScript.eventId }),
        },
        'Pretend mic',
      )
    },
  }
})
/**
 * The files a download really handed over.
 *
 * Only the DOM-touching half is replaced: `buildStudioDownloads` and the
 * archive serializer stay real, so what these assertions read is the actual
 * bytes a person would get — which is the whole question in "did it download
 * the current game or an older one".
 */
const downloads: Array<{ filename: string; text: string }> = []
vi.mock('./buildStudioExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./buildStudioExport')>()
  return {
    ...actual,
    downloadTextFile: (download: { filename: string; text: string }) => {
      downloads.push({ filename: download.filename, text: download.text })
    },
  }
})
vi.mock('./BuildStudioVersionShelf', () => ({ default: () => null }))
// Reached only for the pure `versionBelongsTo` predicate; stubbed so this
// suite initialises no Firebase app.
vi.mock('../../core/firebase/firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: () => ({ __col: 'buildStudioVersions' }),
}))

import { serializeBuildStudioSource } from '../../core/types/buildStudio'
import {
  claimNoteSend,
  clearPendingNote,
  discardPendingNote,
  failPendingNote,
  holdPendingNote,
  noteSendInFlight,
  readPendingNote,
  readPendingSave,
  releaseNoteSend,
  resetPendingSaveStore,
  subscribePendingNote,
} from './buildStudioPendingStore'
import type { PendingNote } from './buildStudioScope'
import { starterSourceFiles } from './buildStudioStarter'
import { VersionsStatus } from './useBuildStudioVersions'

/**
 * Imported DYNAMICALLY on purpose.
 *
 * A static import is hoisted above this file's body, so `./arcadeBridge`'s mock
 * factory would run before `FakeBridgeStub` exists and dereference it inside
 * its own temporal dead zone. Awaiting the import here runs the factory after
 * the class is defined.
 */
const { default: BuildStudioEditor } = await import('./BuildStudioEditor')

const OWNER = { familyId: 'fam1', childId: 'c1', projectId: 'apple-dash-starter' }

/**
 * What the PAGE resolves and hands down, with the defaults every existing case
 * was written against: this child, and no voice flag at all.
 */
interface EditorOptions {
  childId?: string
  childVoiceInputEnhanced?: boolean
}

function renderEditor({ childId, childVoiceInputEnhanced }: EditorOptions = {}) {
  return render(
    <BuildStudioEditor
      familyId={OWNER.familyId}
      childId={childId ?? OWNER.childId}
      childName="Lincoln"
      projectId={OWNER.projectId}
      childVoiceInputEnhanced={childVoiceInputEnhanced}
      versions={{
        status: VersionsStatus.Ready,
        versions: [],
        // The shelf read is always the one for the child being rendered, as
        // the page's own `shelfIsCurrent` guarantees.
        childId: childId ?? OWNER.childId,
        projectId: OWNER.projectId,
        error: null,
        retry: vi.fn(),
      }}
    />,
  )
}

/** Mount, complete the handshake, and settle the import round trip. */
async function openEditor(options: EditorOptions = {}) {
  renderEditor(options)
  const bridge = bridges[bridges.length - 1]
  await act(async () => {
    bridge.ready()
  })
  await waitFor(() => expect(bridge.captures).toBeGreaterThan(0))
  await waitFor(() => expect(screen.getByText('💾 Save my version')).toBeEnabled())
  return bridge
}

async function tapSave() {
  await act(async () => {
    screen.getByText('💾 Save my version').click()
  })
}

beforeEach(() => {
  bridges.length = 0
  routerStore.state = 'unblocked'
  routerStore.listeners.clear()
  blockPredicate = null
  registeredGuard = null
  proceedSpy.mockClear()
  resetSpy.mockClear()
  selectProfile.mockClear()
  saveVersion.mockReset()
  saveVersion.mockImplementation(async (args: { versionId: string }) => ({
    outcome: 'created',
    version: { id: `doc-${args.versionId}` },
  }))
  saveNote.mockReset()
  saveNote.mockResolvedValue({ id: 'note-1', alreadySaved: false })
  voiceProps.length = 0
  downloads.length = 0
  resetPendingSaveStore()
})

// ── Shared steps for the reflection ──────────────────────────────────────

/** Save a version, so there is something the words can be about. */
async function saveAVersion(bridge: FakeBridgeStub, files = editedFiles(4)) {
  bridge.nextCapture = files
  await act(async () => {
    bridge.announce(files)
  })
  await tapSave()
  await waitFor(() =>
    expect(screen.getByText('Saved. Your game is on your shelf.')).toBeInTheDocument(),
  )
}

/** Accept a transcript, as the mic's callback does. */
async function sayWords() {
  await act(async () => {
    screen.getByText('Pretend mic').click()
  })
  await waitFor(() =>
    expect(screen.getByLabelText('What you were trying')).toHaveValue(voiceScript.text),
  )
}

/** Type a correction into the accepted words. */
async function editWords(text: string) {
  const box = screen.getByLabelText('What you were trying')
  await act(async () => {
    fireEvent.change(box, { target: { value: text } })
  })
}

// ── 1. Clean versus newer edits ──────────────────────────────────────────

describe('an ordinary clean Save becomes clean', () => {
  it('does not claim newer changes when none were made', async () => {
    const bridge = await openEditor()
    // The child edits, MakeCode announces it, and he saves.
    const edited = editedFiles(4)
    await act(async () => {
      bridge.announce(edited)
    })
    expect(screen.getByText(/not saved to your shelf yet/)).toBeInTheDocument()

    bridge.nextCapture = edited
    await tapSave()

    await waitFor(() =>
      expect(screen.getByText('Saved. Your game is on your shelf.')).toBeInTheDocument(),
    )
    expect(screen.queryByText(/made more changes since then/)).not.toBeInTheDocument()
    expect(screen.queryByText(/not saved to your shelf yet/)).not.toBeInTheDocument()
  })

  it('stays clean when the capture itself announces the saved bytes', async () => {
    // The verified stock order: a `saveproject` provokes several
    // `workspacesave` events carrying the bytes being captured. Those are the
    // payload, not newer work.
    const bridge = await openEditor()
    const edited = editedFiles(4)
    bridge.nextCapture = edited
    await act(async () => {
      bridge.announce(edited)
      bridge.announce(edited)
    })
    await tapSave()
    await waitFor(() =>
      expect(screen.getByText('Saved. Your game is on your shelf.')).toBeInTheDocument(),
    )
    expect(screen.queryByText(/not saved to your shelf yet/)).not.toBeInTheDocument()
  })

  it('ignores a duplicate announcement of the same bytes', async () => {
    const bridge = await openEditor()
    await act(async () => {
      bridge.announce(starterFiles())
      bridge.announce(starterFiles())
    })
    // Identical to what was imported: nothing has changed.
    expect(screen.queryByText(/not saved to your shelf yet/)).not.toBeInTheDocument()
  })

  it('ignores `_history`, which MakeCode rewrites constantly', async () => {
    const bridge = await openEditor()
    await act(async () => {
      bridge.announce({ ...starterFiles(), _history: '{"entries":[1,2,3]}' })
    })
    expect(screen.queryByText(/not saved to your shelf yet/)).not.toBeInTheDocument()
  })

  it('STAYS dirty when a real edit lands during the cloud write', async () => {
    const bridge = await openEditor()
    const first = editedFiles(4)
    const later = editedFiles(9)

    let release: (() => void) | null = null
    saveVersion.mockImplementation(
      (args: { versionId: string }) =>
        new Promise((resolveWrite) => {
          release = () =>
            resolveWrite({ outcome: 'created', version: { id: `doc-${args.versionId}` } })
        }),
    )

    bridge.nextCapture = first
    await act(async () => {
      bridge.announce(first)
    })
    await tapSave()
    // Mid-write, he changes something else.
    await act(async () => {
      bridge.announce(later)
    })
    await act(async () => {
      release?.()
    })

    await waitFor(() =>
      expect(screen.getByText(/made more changes since then/)).toBeInTheDocument(),
    )
    expect(screen.getByText(/not saved to your shelf yet/)).toBeInTheDocument()
  })

  it('writes the signature of the bytes it actually captured', async () => {
    const bridge = await openEditor()
    const edited = editedFiles(4)
    bridge.nextCapture = edited
    await tapSave()
    await waitFor(() => expect(saveVersion).toHaveBeenCalled())
    expect(saveVersion.mock.calls[0][0].files['main.ts']).toBe(edited['main.ts'])
  })

  it('records the runtime from `info`, never the header placeholder', async () => {
    const bridge = await openEditor()
    bridge.runtime = { target: '4.1.28', pxt: '13.1.25' }
    await tapSave()
    await waitFor(() => expect(saveVersion).toHaveBeenCalled())
    expect(saveVersion.mock.calls[0][0].editorTargetVersion).toBe('4.1.28')
  })

  it('leaves the runtime UNKNOWN when info never answered', async () => {
    await openEditor()
    await tapSave()
    await waitFor(() => expect(saveVersion).toHaveBeenCalled())
    // Not '0.0.0', and not a constant.
    expect(saveVersion.mock.calls[0][0].editorTargetVersion).toBeUndefined()
  })

  it('asks the editor what it is, once the project is in', async () => {
    const bridge = await openEditor()
    expect(bridge.infoAsked).toBeGreaterThan(0)
  })
})

// ── 2. Departure before an unseen edit is lost ───────────────────────────

describe('a held departure is checked before anybody is warned', () => {
  it('holds while the editor is live, because an edit may be unannounced', async () => {
    await openEditor()
    expect(blockPredicate?.()).toBe(true)
  })

  it('releases a genuinely clean exit with no warning', async () => {
    const bridge = await openEditor()
    bridge.nextCapture = starterFiles()
    await attemptDeparture()
    await waitFor(() => expect(proceedSpy).toHaveBeenCalled())
    // The dialog is MUI's, and MUI keeps a closing dialog mounted for its exit
    // transition — so the question is whether it GOES, not whether it has
    // already gone by the next line. Nothing about the clean release is
    // weakened: `proceed` above is the real assertion, and the departure was
    // never answered by a person.
    await waitFor(() =>
      expect(screen.queryByText('Keep your game first?')).not.toBeInTheDocument(),
    )
    expect(resetSpy).not.toHaveBeenCalled()
    expect(screen.queryByText('Leave and lose it')).not.toBeInTheDocument()
  })

  it('captures an UNANNOUNCED edit and offers the real choice', async () => {
    const bridge = await openEditor()
    // He typed 4 into the blocks; MakeCode has said nothing.
    bridge.nextCapture = editedFiles(4)
    const before = bridge.captures
    await attemptDeparture()
    await waitFor(() => expect(bridge.captures).toBeGreaterThan(before))
    await waitFor(() => expect(screen.getByText('Keep your game first?')).toBeInTheDocument())
    expect(screen.getByText('Stay here')).toBeInTheDocument()
    expect(screen.getByText('Leave and lose it')).toBeInTheDocument()
    // The captured bytes — not a stale template — are what Save it now stores.
    expect(screen.getByText('Save it now')).toBeInTheDocument()
  })

  /**
   * The C3 regression, which stranded EVERY ordinary Today departure.
   *
   * The effect set `departureCheck('checking')`, had `departureCheck` as a
   * dependency, and its own cleanup then cancelled the in-flight capture — and
   * the `!== 'idle'` early return meant nothing replaced it. The dialog sat on
   * "Checking your game…" forever.
   *
   * POSITIVE CONTROL: put `departureCheck` back in the effect's dependencies
   * with a `cancelled` cleanup and the first two cases here hang on
   * "Checking your game…".
   */
  it('an ordinary Save then Today completes and releases the navigation', async () => {
    const bridge = await openEditor()
    const edited = editedFiles(4)
    bridge.nextCapture = edited
    await act(async () => {
      bridge.announce(edited)
    })
    await tapSave()
    await waitFor(() =>
      expect(screen.getByText('Saved. Your game is on your shelf.')).toBeInTheDocument(),
    )

    // Now he taps Today.
    await attemptDeparture()
    await waitFor(() => expect(proceedSpy).toHaveBeenCalled())
    // And it never stranded on the checking state.
    expect(screen.queryByText('Checking your game…')).not.toBeInTheDocument()
  })

  it('completes a DELAYED capture rather than cancelling itself', async () => {
    const bridge = await openEditor()
    let releaseCapture: ((files: Record<string, string>) => void) | null = null
    bridge.captureGate = (resolveCapture) => {
      releaseCapture = resolveCapture
    }
    await attemptDeparture()
    // The dialog is honest while it waits…
    await waitFor(() => expect(screen.getByText('Checking your game…')).toBeInTheDocument())
    expect(proceedSpy).not.toHaveBeenCalled()
    // …and the late answer still lands.
    await act(async () => {
      releaseCapture!(starterFiles())
    })
    await waitFor(() => expect(proceedSpy).toHaveBeenCalled())
    expect(screen.queryByText('Checking your game…')).not.toBeInTheDocument()
  })

  it('edit then Today then Stay keeps the editor and the work', async () => {
    const bridge = await openEditor()
    const edited = editedFiles(4)
    bridge.nextCapture = edited
    await attemptDeparture()
    await waitFor(() => expect(screen.getByText('Keep your game first?')).toBeInTheDocument())
    await act(async () => {
      screen.getByText('Stay here').click()
    })
    // `reset` performs the real transition back to unblocked, as the data
    // router does — so the dialog closes and nothing is lost.
    expect(resetSpy).toHaveBeenCalled()
    expect(proceedSpy).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.queryByText('Keep your game first?')).not.toBeInTheDocument(),
    )

    // A SECOND departure asks again rather than being stuck.
    await attemptDeparture()
    await waitFor(() => expect(screen.getByText('Keep your game first?')).toBeInTheDocument())
    expect(proceedSpy).not.toHaveBeenCalled()
  })

  it('says it cannot tell when the capture fails, rather than nothing', async () => {
    const bridge = await openEditor()
    bridge.captureError = new Error('no answer')
    await attemptDeparture()
    await waitFor(() =>
      expect(screen.getByText(/could not read the editor just now/)).toBeInTheDocument(),
    )
  })
})

describe('a profile change is held while the work is still intact', () => {
  it('registers a guard', async () => {
    await openEditor()
    expect(registeredGuard).toBeTruthy()
  })

  it('refuses the change and asks, when it cannot prove the source is clean', async () => {
    const bridge = await openEditor()
    bridge.nextCapture = editedFiles(4)
    let allowed: boolean | undefined
    await act(async () => {
      allowed = registeredGuard!('london')
    })
    expect(allowed).toBe(false)
    await waitFor(() => expect(screen.getByText('Switch profile?')).toBeInTheDocument())
    expect(screen.getByText('Switch anyway')).toBeInTheDocument()
  })

  it('lets a clean switch through by itself', async () => {
    const bridge = await openEditor()
    bridge.nextCapture = starterFiles()
    await act(async () => {
      registeredGuard!('london')
    })
    await waitFor(() => expect(selectProfile).toHaveBeenCalledWith('london'))
    expect(screen.queryByText('Switch profile?')).not.toBeInTheDocument()
  })

  /**
   * The C3 regression. The guard's capture resolved AFTER the person chose
   * *Stay here* — which only nulled the dialog state — and then called
   * `selectProfile(next)` anyway. An explicit Stay must be final.
   *
   * POSITIVE CONTROL: drop the `profileAskRef.current?.id !== askId` check and
   * this case sees `selectProfile` called after Stay.
   */
  it('NEVER changes profile after the person chose Stay here', async () => {
    const bridge = await openEditor()
    let releaseCapture: ((files: Record<string, string>) => void) | null = null
    bridge.captureGate = (resolveCapture) => {
      releaseCapture = resolveCapture
    }
    await act(async () => {
      expect(registeredGuard!('london')).toBe(false)
    })
    // The decision is not offered until the capture has an answer.
    await waitFor(() => expect(screen.getByText('Checking your game…')).toBeInTheDocument())
    expect(screen.getByText('Switch anyway')).toBeDisabled()

    await act(async () => {
      screen.getByText('Stay here').click()
    })
    // MUI keeps a closing dialog mounted for its exit transition, so the
    // question is whether the ask GOES — not whether it has already gone on
    // the next line. The assertion that matters is below and is unchanged.
    await waitFor(() =>
      expect(screen.queryByText('Switch profile?')).not.toBeInTheDocument(),
    )

    // The capture now comes back CLEAN — which, before the fix, switched.
    await act(async () => {
      releaseCapture!(starterFiles())
    })
    expect(selectProfile).not.toHaveBeenCalled()
  })

  it('offers the decision only once the capture answered', async () => {
    const bridge = await openEditor()
    let releaseCapture: ((files: Record<string, string>) => void) | null = null
    bridge.captureGate = (resolveCapture) => {
      releaseCapture = resolveCapture
    }
    await act(async () => {
      registeredGuard!('london')
    })
    await waitFor(() => expect(screen.getByText('Switch anyway')).toBeDisabled())
    await act(async () => {
      releaseCapture!(editedFiles(4))
    })
    await waitFor(() => expect(screen.getByText('Switch anyway')).toBeEnabled())
    expect(screen.getByText('Switch profile?')).toBeInTheDocument()
  })

  it('does not act on a late result after the editor unmounted', async () => {
    const bridge = await openEditor()
    let releaseCapture: ((files: Record<string, string>) => void) | null = null
    bridge.captureGate = (resolveCapture) => {
      releaseCapture = resolveCapture
    }
    const guard = registeredGuard!
    await act(async () => {
      guard('london')
    })
    await waitFor(() => expect(screen.getByText('Checking your game…')).toBeInTheDocument())
    // The editor goes away while the capture is still out.
    cleanup()
    await act(async () => {
      releaseCapture!(starterFiles())
    })
    expect(selectProfile).not.toHaveBeenCalled()
  })

  it('switches on the explicit choice, consuming the allowance once', async () => {
    const bridge = await openEditor()
    bridge.nextCapture = editedFiles(4)
    await act(async () => {
      registeredGuard!('london')
    })
    await waitFor(() => expect(screen.getByText('Switch anyway')).toBeInTheDocument())
    await act(async () => {
      screen.getByText('Switch anyway').click()
    })
    expect(selectProfile).toHaveBeenCalledWith('london')
    // The allowance is consumed, so the NEXT change is asked about again.
    await act(async () => {
      expect(registeredGuard!('london')).toBe(true)
    })
    await act(async () => {
      expect(registeredGuard!('london')).toBe(false)
    })
  })
})

// ── 3. Failure recovery and latches ─────────────────────────────────────

describe('a failed Save keeps its exact retry, and the latch is released', () => {
  it('offers a retry and can be tapped again after a snapshot failure', async () => {
    const bridge = await openEditor()
    bridge.captureError = new Error('The editor did not hand the game over.')
    await tapSave()
    await waitFor(() =>
      expect(screen.getByText(/did not hand the game over/)).toBeInTheDocument(),
    )
    // The latch released, so a second tap really does try again.
    const before = bridge.captures
    bridge.captureError = null
    await tapSave()
    await waitFor(() => expect(bridge.captures).toBeGreaterThan(before))
  })

  it('holds the exact payload for its owner when the write fails', async () => {
    const bridge = await openEditor()
    bridge.nextCapture = editedFiles(4)
    saveVersion.mockRejectedValue(new Error('offline'))
    await tapSave()
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())
    const held = readPendingSave(OWNER)
    expect(held?.files['main.ts']).toBe(editedFiles(4)['main.ts'])
    // Owner-bound: a sibling's editor cannot see it.
    expect(readPendingSave({ ...OWNER, childId: 'c2' })).toBeNull()
  })

  it('retries the SAME version id rather than minting a new one', async () => {
    const bridge = await openEditor()
    bridge.nextCapture = starterFiles()
    saveVersion.mockRejectedValue(new Error('offline'))
    await tapSave()
    await waitFor(() => expect(saveVersion).toHaveBeenCalled())
    const firstId = saveVersion.mock.calls[0][0].versionId
    // One automatic retry already happened; both used the same id.
    for (const call of saveVersion.mock.calls) {
      expect(call[0].versionId).toBe(firstId)
    }
    saveVersion.mockClear()
    saveVersion.mockImplementation(async (args: { versionId: string }) => ({
      outcome: 'created',
      version: { id: `doc-${args.versionId}` },
    }))
    await act(async () => {
      screen.getByText('Try again').click()
    })
    await waitFor(() => expect(saveVersion).toHaveBeenCalled())
    expect(saveVersion.mock.calls[0][0].versionId).toBe(firstId)
  })

  /**
   * The reported interleaving, through the real component.
   *
   * A fails and is held; the child leaves and comes back (a remount re-seeds
   * the held payload); B is captured and fails; A's write finally
   * acknowledges. A may finish its own version and must not clear B's slot.
   *
   * POSITIVE CONTROL: drop the `versionId` argument from `clearPendingSave` and
   * B's retry disappears here.
   */
  it('an old save’s acknowledgment leaves a newer pending save retriable', async () => {
    // ── A ──
    const first = await openEditor()
    first.nextCapture = editedFiles(4)
    let releaseA: ((ok: boolean) => void) | null = null
    saveVersion.mockImplementation(
      (args: { versionId: string }) =>
        new Promise((resolveWrite, rejectWrite) => {
          releaseA = (ok) =>
            ok
              ? resolveWrite({ outcome: 'created', version: { id: `doc-${args.versionId}` } })
              : rejectWrite(new Error('offline'))
        }),
    )
    await tapSave()
    await waitFor(() => expect(saveVersion).toHaveBeenCalled())
    const idA = saveVersion.mock.calls[0][0].versionId

    // ── Leave and come back ──
    cleanup()
    const second = await openEditor()
    expect(readPendingSave(OWNER)?.versionId).toBe(idA)

    // ── B, which fails ──
    second.nextCapture = editedFiles(7)
    saveVersion.mockReset()
    saveVersion.mockRejectedValue(new Error('offline'))
    await tapSave()
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())
    const idB = readPendingSave(OWNER)?.versionId
    expect(idB).toBeTruthy()
    expect(idB).not.toBe(idA)

    // ── A's write finally lands ──
    await act(async () => {
      releaseA?.(true)
    })

    // B is still exactly there, with its own bytes.
    const slot = readPendingSave(OWNER)
    expect(slot?.versionId).toBe(idB)
    expect(slot?.files['main.ts']).toBe(editedFiles(7)['main.ts'])
    // …and its retry is still on screen.
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })

  /**
   * The verified stuck receipt: a restored Retry committed the version — the
   * shelf showed it — but the UI stayed on "Saving…", showed *About an earlier
   * save*, and offered no Open. `commit` compared the acknowledgment to the
   * payload's ORIGINAL capture visit, which a remount had retired, so it took
   * the out-of-scope branch and never touched the screen.
   *
   * POSITIVE CONTROL: compute the liveness check from `payload.scope` again and
   * this case stays on "Saving…".
   */
  it('a restored Retry acknowledges on the CURRENT visit', async () => {
    // A fails and is held.
    const first = await openEditor()
    first.nextCapture = editedFiles(4)
    saveVersion.mockRejectedValue(new Error('offline'))
    await tapSave()
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())
    const idA = readPendingSave(OWNER)?.versionId
    expect(idA).toBeTruthy()

    // He leaves and comes back; the editor now holds something ELSE.
    cleanup()
    const second = await openEditor()
    second.nextCapture = editedFiles(7)
    await act(async () => {
      second.announce(editedFiles(7))
    })
    expect(screen.getByText(/not saved to your shelf yet/)).toBeInTheDocument()

    // The deliberate Retry, on the restored payload.
    saveVersion.mockReset()
    saveVersion.mockImplementation(async (args: { versionId: string }) => ({
      outcome: 'created',
      version: { id: `doc-${args.versionId}` },
    }))
    await act(async () => {
      screen.getByText('Try again').click()
    })

    // It acknowledged HERE: the receipt is on screen and the controls are
    // usable again, rather than stuck on "Saving…".
    await waitFor(() => expect(screen.getByText(/it is on your shelf now/)).toBeInTheDocument())
    expect(screen.getByText('💾 Save my version')).toBeEnabled()
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument()

    // Provenance was preserved: same action id, same bytes, same child.
    expect(saveVersion.mock.calls[0][0].versionId).toBe(idA)
    expect(saveVersion.mock.calls[0][0].files['main.ts']).toBe(editedFiles(4)['main.ts'])
    expect(saveVersion.mock.calls[0][0].childId).toBe(OWNER.childId)

    // And it did NOT declare the live editor clean — that source is different
    // and is still unsaved.
    expect(screen.getByText(/not saved to your shelf yet/)).toBeInTheDocument()
    // Nor did it claim the open game is on the shelf.
    expect(screen.queryByText('Saved. Your game is on your shelf.')).not.toBeInTheDocument()
  })

  it('releases the hold when the write finally lands', async () => {
    const bridge = await openEditor()
    bridge.nextCapture = starterFiles()
    saveVersion.mockRejectedValue(new Error('offline'))
    await tapSave()
    await waitFor(() => expect(readPendingSave(OWNER)).not.toBeNull())
    saveVersion.mockImplementation(async (args: { versionId: string }) => ({
      outcome: 'created',
      version: { id: `doc-${args.versionId}` },
    }))
    await act(async () => {
      screen.getByText('Try again').click()
    })
    await waitFor(() => expect(readPendingSave(OWNER)).toBeNull())
  })
})

/**
 * The verified recovery failure: a downloaded copy opened visibly and then
 * every Save failed forever, because the file was imported into the starter's
 * bridge whose pinned header no longer matched the project stock had just
 * created.
 *
 * POSITIVE CONTROL: import into the live bridge instead of starting a visit and
 * the first case sees one bridge rather than two.
 */
describe('opening a downloaded copy starts a fresh visit', () => {
  /**
   * A File with an honest async `text()`.
   *
   * jsdom does not reliably implement `Blob.prototype.text`, and the product
   * must NOT carry a fallback for that — a missing reader would be reported as
   * an invalid archive, which is a lie about the family's file. So the seam is
   * here, in the test, and it behaves exactly as the browser's does.
   */
  function archiveFile(body: string, name = 'my-game-source.json'): File {
    const file = new File([body], name, { type: 'application/json' })
    if (typeof file.text !== 'function') {
      Object.defineProperty(file, 'text', { value: async () => body })
    }
    return file
  }

  async function pickFile(file: File) {
    const input = screen.getByLabelText('Open a downloaded game file')
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
  }

  /** Pick the file and take the explicit Replace, which is the ordinary path. */
  async function openRecoveryFile(files: Record<string, string>) {
    await pickFile(archiveFile(serializeBuildStudioSource(files)))
    // A recovery replaces what is open, so it goes through the same
    // pre-replacement check as the shelf's Open. A clean editor proceeds by
    // itself; anything else offers the choice.
    const replace = screen.queryByText('Replace it anyway')
    if (replace) {
      await act(async () => {
        replace.click()
      })
    }
  }

  it('builds a new bridge and frame, and retires the old one', async () => {
    const first = await openEditor()
    const recovered = editedFiles(4)
    await openRecoveryFile(recovered)

    const second = bridges[bridges.length - 1]
    expect(second).not.toBe(first)
    expect(first.disposed).toBe(true)
    // The recovered bytes are what the new visit imports.
    second.nextCapture = recovered
    await act(async () => {
      second.ready()
    })
    await waitFor(() => expect(second.imported.length).toBeGreaterThan(0))
    expect(second.imported[0]['main.ts']).toBe(recovered['main.ts'])
    expect(second.imported[0]['main.blocks']).toBe(recovered['main.blocks'])
  })

  it('reads as NOT saved, and then an explicit Save succeeds', async () => {
    await openEditor()
    const recovered = editedFiles(4)
    await openRecoveryFile(recovered)
    const second = bridges[bridges.length - 1]
    second.nextCapture = recovered
    await act(async () => {
      second.ready()
    })
    await waitFor(() => expect(screen.getByText('💾 Save my version')).toBeEnabled())
    // Nothing recovered from a file is on the shelf yet.
    expect(screen.getByText(/not saved to your shelf yet/)).toBeInTheDocument()

    await tapSave()
    await waitFor(() =>
      expect(screen.getByText('Saved. Your game is on your shelf.')).toBeInTheDocument(),
    )
    expect(saveVersion.mock.calls[0][0].files['main.ts']).toBe(recovered['main.ts'])
    // …and it is clean afterwards, so Today is not held.
    expect(screen.queryByText(/not saved to your shelf yet/)).not.toBeInTheDocument()
  })

  it('refuses a file that is not one of this app’s archives', async () => {
    await openEditor()
    const before = bridges.length
    await pickFile(archiveFile('not json at all', 'whatever.json'))
    await waitFor(() =>
      expect(screen.getByText(/not a game file this app saved/)).toBeInTheDocument(),
    )
    // No visit was started, so the open editor is untouched.
    expect(bridges.length).toBe(before)
  })

  /**
   * The preservation contract, both doors. The shelf's Open consulted only the
   * ANNOUNCED dirty flag, so an in-frame edit MakeCode had not reported was
   * replaced and lost; recovery replaced regardless.
   */
  it('does not replace an UNANNOUNCED edit without asking', async () => {
    const first = await openEditor()
    // He typed 4 into the blocks; MakeCode has said nothing.
    first.nextCapture = editedFiles(4)
    const before = bridges.length
    await pickFile(archiveFile(serializeBuildStudioSource(editedFiles(7))))
    await waitFor(() =>
      expect(screen.getByText(/work that is not on your shelf/)).toBeInTheDocument(),
    )
    // Nothing was replaced, and the live editor is untouched.
    expect(bridges.length).toBe(before)
    expect(first.disposed).toBe(false)
  })

  it('keeps the current edits and the pending retry on Keep working', async () => {
    const first = await openEditor()
    first.nextCapture = editedFiles(4)
    saveVersion.mockRejectedValue(new Error('offline'))
    await tapSave()
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())
    const heldBefore = readPendingSave(OWNER)?.versionId

    await pickFile(archiveFile(serializeBuildStudioSource(editedFiles(7))))
    await waitFor(() => expect(screen.getByText('Keep working')).toBeInTheDocument())
    await act(async () => {
      screen.getByText('Keep working').click()
    })
    // The editor stayed, and the exact retry is still waiting.
    expect(first.disposed).toBe(false)
    expect(readPendingSave(OWNER)?.versionId).toBe(heldBefore)
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })
})

// ── 4. Play and Edit ───────────────────────────────────────────────────

describe('Play and Edit use the bridge’s verified modes', () => {
  it('enters the full-size simulator on Play and leaves it on Edit', async () => {
    const bridge = await openEditor()
    await act(async () => {
      screen.getByText('▶ Play it').click()
    })
    expect(bridge.played).toBe(1)
    await act(async () => {
      screen.getByText('🧩 Edit the blocks').click()
    })
    expect(bridge.edited).toBe(1)
  })

  it('keeps the outer Save and Hint controls while playing', async () => {
    // They live outside the iframe, so entering the full-size simulator cannot
    // take them away.
    await openEditor()
    await act(async () => {
      screen.getByText('▶ Play it').click()
    })
    expect(screen.getByText('💾 Save my version')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hint/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hear it/ })).toBeInTheDocument()
  })
})

// ── 5. Opening deadline ────────────────────────────────────────────────

describe('a frame that never hands shakes is not left Opening forever', () => {
  it('fails with a retry after the opening deadline', async () => {
    vi.useFakeTimers()
    try {
      renderEditor()
      expect(screen.getByText('Opening the editor…')).toBeInTheDocument()
      await act(async () => {
        vi.advanceTimersByTime(46_000)
      })
      expect(screen.getByText('The editor would not open')).toBeInTheDocument()
      expect(screen.getByText('Try again')).toBeInTheDocument()
      // The adult-assisted starter route is visible too.
      expect(screen.getByText('A grown-up can open the starter directly')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not fire the deadline once the handshake lands', async () => {
    vi.useFakeTimers()
    try {
      renderEditor()
      const bridge = bridges[bridges.length - 1]
      await act(async () => {
        bridge.ready()
      })
      await act(async () => {
        vi.advanceTimersByTime(60_000)
      })
      expect(screen.queryByText('The editor would not open')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('builds a new bridge and frame for a Try again, disposing the old one', async () => {
    vi.useFakeTimers()
    try {
      renderEditor()
      const first = bridges[bridges.length - 1]
      await act(async () => {
        vi.advanceTimersByTime(46_000)
      })
      await act(async () => {
        screen.getByText('Try again').click()
      })
      const second = bridges[bridges.length - 1]
      expect(second).not.toBe(first)
      expect(first.disposed).toBe(true)
      // A late readiness from the retired frame must not revive it.
      await act(async () => {
        first.ready()
      })
      expect(first.isScopeLive()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders the iframe with ITS OWN session URL', async () => {
    const bridge = await openEditor()
    const frame = document.querySelector('iframe')
    expect(frame?.getAttribute('src')).toContain(bridge.frameId)
  })
})

// ── 6. The reflection: words are work, and cannot be said again ─────────

/**
 * The reported loss, through the real component: save a game, accept the
 * transcript, change its visible words, do NOT tap *Save my words*, tap
 * *Today*. There was no warning and the sentence was gone, with the saved
 * version intact — so the editor treated a game as work and a child's words as
 * nothing.
 */
describe('accepted words are work at risk', () => {
  it('holds an ordinary departure and says the WORDS are what is unsaved', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    // Nothing has been written down, and nothing is written by leaving.
    expect(saveNote).not.toHaveBeenCalled()
    // The mic belongs to THIS child and this surface, not the live profile.
    expect(voiceProps.at(-1)?.profile?.id).toBe(OWNER.childId)
    expect(voiceProps.at(-1)?.sourceSurface).toBe('build-studio-reflection')

    // The game is exactly what was saved, so the capture reads clean.
    bridge.nextCapture = editedFiles(4)
    await attemptDeparture()
    await waitFor(() =>
      expect(screen.getByText('Keep your words first?')).toBeInTheDocument(),
    )
    expect(proceedSpy).not.toHaveBeenCalled()
    // It does not invent a game problem…
    expect(screen.queryByText('Keep your game first?')).not.toBeInTheDocument()
    expect(screen.queryByText(/changes that are not on your shelf/)).not.toBeInTheDocument()
    // …and it does not offer a GAME save as the fix for unsaved words.
    expect(screen.queryByText('Save it now')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save my words' })).toBeInTheDocument()

    await act(async () => {
      screen.getByText('Stay here').click()
    })
    // Stay keeps the exact words, to the character.
    expect(screen.getByLabelText('What you were trying')).toHaveValue(voiceScript.text)
    expect(saveNote).not.toHaveBeenCalled()
  })

  it('offers the exact words back after leaving and returning', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    await editWords('I wanted three lives')
    const slot = readPendingNote(OWNER)
    expect(slot?.text).toBe('I wanted three lives')
    // Held, not written: holding is not saving.
    expect(slot?.state).toBe('unsent')
    expect(saveNote).not.toHaveBeenCalled()
    // Owner-bound: a sibling's editor cannot see them.
    expect(readPendingNote({ ...OWNER, childId: 'c2' })).toBeNull()

    cleanup()
    await openEditor()
    expect(screen.getByText(/I wanted three lives/)).toBeInTheDocument()
    expect(screen.getByText('These words are not saved yet')).toBeInTheDocument()
    expect(saveNote).not.toHaveBeenCalled()

    await act(async () => {
      screen.getByText('Save these words').click()
    })
    await waitFor(() => expect(saveNote).toHaveBeenCalled())
    const args = saveNote.mock.calls[0][0]
    // The whole payload, not just the sentence: owner, version, action, stamp,
    // how the words were given and the help that had been offered.
    expect(args.text).toBe('I wanted three lives')
    expect(args.familyId).toBe(OWNER.familyId)
    expect(args.childId).toBe(OWNER.childId)
    expect(args.projectId).toBe(OWNER.projectId)
    expect(args.versionId).toBe(slot?.target.versionId)
    expect(args.versionDocId).toBe(slot?.target.versionDocId)
    expect(args.noteActionId).toBe(slot?.target.noteActionId)
    expect(args.createdAt).toBe(slot?.createdAt)
    // A typed correction does not relabel speech as typing.
    expect(args.capture).toBe('voice')
    expect(args.voiceEventId).toBe(voiceScript.eventId)
    expect(args.help).toBe('none-offered')
    await waitFor(() => expect(readPendingNote(OWNER)).toBeNull())
  })

  it('a game Save never claims it saved the words', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    // He changes the game again and saves again, without saving his words.
    await saveAVersion(bridge, editedFiles(7))
    expect(saveNote).not.toHaveBeenCalled()
    // The sentence is still his, still unsaved, still about the earlier save.
    await waitFor(() =>
      expect(screen.getByText('These words are not saved yet')).toBeInTheDocument(),
    )
    expect(screen.getByText(new RegExp(voiceScript.text))).toBeInTheDocument()
    expect(readPendingNote(OWNER)?.text).toBe(voiceScript.text)
  })

  /**
   * The baseline refusal: a second genuinely different sentence about one saved
   * game came back as "already saved", because the action id was minted with
   * the SAVE and reused by every transcript. It is minted with the WORDS now.
   */
  it('a second, different note about the same save is its own note', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    await act(async () => {
      screen.getByRole('button', { name: 'Save my words' }).click()
    })
    await waitFor(() =>
      expect(screen.getByText('Saved with your game.')).toBeInTheDocument(),
    )
    const first = saveNote.mock.calls[0][0]

    // The mic comes back, because that note is resolved.
    await sayWords()
    await editWords('and then I made them slower')
    await act(async () => {
      screen.getByRole('button', { name: 'Save my words' }).click()
    })
    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(2))
    const second = saveNote.mock.calls[1][0]
    expect(second.versionId).toBe(first.versionId)
    expect(second.noteActionId).not.toBe(first.noteActionId)
    expect(second.text).toBe('and then I made them slower')
    // The first note is untouched: same id, same words.
    expect(saveNote.mock.calls[0][0].text).toBe(voiceScript.text)
  })

  it('keeps a failed note’s exact payload and retries THAT note', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    saveNote.mockRejectedValue(new Error('offline'))
    await act(async () => {
      screen.getByRole('button', { name: 'Save my words' }).click()
    })
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())
    const sent = saveNote.mock.calls[0][0]
    expect(readPendingNote(OWNER)?.state).toBe('failed')
    expect(readPendingNote(OWNER)?.attempts).toBe(1)

    // A normal leave and return, which was not a discard.
    cleanup()
    await openEditor()
    expect(screen.getByText('These words did not save')).toBeInTheDocument()
    saveNote.mockReset()
    saveNote.mockResolvedValue({ id: 'note-1', alreadySaved: false })
    await act(async () => {
      screen.getByText('Save these words').click()
    })
    await waitFor(() => expect(saveNote).toHaveBeenCalled())
    const retry = saveNote.mock.calls[0][0]
    // The SAME note: one document, not a second one wearing a later stamp.
    expect(retry.noteActionId).toBe(sent.noteActionId)
    expect(retry.createdAt).toBe(sent.createdAt)
    expect(retry.text).toBe(sent.text)
    expect(retry.versionId).toBe(sent.versionId)
    expect(retry.versionDocId).toBe(sent.versionDocId)
    expect(retry.voiceEventId).toBe(sent.voiceEventId)
    expect(retry.help).toBe(sent.help)
    expect(retry.childId).toBe(OWNER.childId)
    await waitFor(() => expect(readPendingNote(OWNER)).toBeNull())
  })

  it('locks corrections while a note write is running, and says what it knows', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    let release: (() => void) | null = null
    saveNote.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ id: 'note-1', alreadySaved: false })
        }),
    )
    await act(async () => {
      screen.getByRole('button', { name: 'Save my words' }).click()
    })
    // The words a write is carrying cannot be edited away or started over.
    await waitFor(() =>
      expect(screen.getByLabelText('What you were trying')).toBeDisabled(),
    )
    expect(screen.getByRole('button', { name: 'Start over' })).toBeDisabled()
    expect(readPendingNote(OWNER)?.state).toBe('sending')

    // A remount while it is still out says so, rather than calling it failed
    // and inviting a second write.
    cleanup()
    await openEditor()
    expect(screen.getByText('These words may still be saving')).toBeInTheDocument()
    expect(screen.queryByText('These words did not save')).not.toBeInTheDocument()

    // And the late acknowledgment still releases its OWN words.
    await act(async () => {
      release?.()
    })
    await waitFor(() => expect(readPendingNote(OWNER)).toBeNull())
    expect(saveNote).toHaveBeenCalledTimes(1)
  })

  it('discards words only when somebody says so, and then they stay gone', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    bridge.nextCapture = editedFiles(4)
    await attemptDeparture()
    await waitFor(() =>
      expect(screen.getByText('Keep your words first?')).toBeInTheDocument(),
    )
    await act(async () => {
      screen.getByRole('button', { name: 'Discard my words' }).click()
    })
    // Deliberate, and nothing was written on the way out.
    expect(readPendingNote(OWNER)).toBeNull()
    expect(saveNote).not.toHaveBeenCalled()
    // Nothing is at risk now, so the departure he already chose continues.
    await waitFor(() => expect(proceedSpy).toHaveBeenCalled())

    cleanup()
    await openEditor()
    expect(screen.queryByText(new RegExp(voiceScript.text))).not.toBeInTheDocument()
  })

  it('holds a profile switch for unsaved words, with a clean game', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    bridge.nextCapture = editedFiles(4)
    await act(async () => {
      expect(registeredGuard!('london')).toBe(false)
    })
    await waitFor(() => expect(screen.getByText('Switch profile?')).toBeInTheDocument())
    expect(screen.getByText(/Your words are not saved yet/)).toBeInTheDocument()
    expect(selectProfile).not.toHaveBeenCalled()

    await act(async () => {
      screen.getByText('Stay here').click()
    })
    expect(screen.getByLabelText('What you were trying')).toHaveValue(voiceScript.text)
    expect(selectProfile).not.toHaveBeenCalled()
  })
})

/**
 * The defect unsaved words introduced, and the one this guards against: a
 * guard about WORDS must never answer the question about the GAME.
 *
 * `requestReplace` returned early on unsaved words and skipped the capture, so
 * an edit MakeCode had not announced yet read as clean, the warning talked only
 * about the sentence — and Open destroyed the game edit.
 */
describe('words never stand in for the game', () => {
  function archiveFile(body: string, name = 'my-game-source.json'): File {
    const file = new File([body], name, { type: 'application/json' })
    if (typeof file.text !== 'function') {
      Object.defineProperty(file, 'text', { value: async () => body })
    }
    return file
  }

  async function pickFile(file: File) {
    const input = screen.getByLabelText('Open a downloaded game file')
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
  }

  it('still captures the editor on a replacement when words are unsaved', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    // He then types 9 into the blocks. MakeCode has announced nothing.
    bridge.nextCapture = editedFiles(9)
    const before = bridge.captures
    const bridgeCount = bridges.length

    await pickFile(archiveFile(serializeBuildStudioSource(editedFiles(2))))
    // The capture ran while the editor was intact…
    await waitFor(() => expect(bridge.captures).toBeGreaterThan(before))
    // …so the warning is about the GAME, with the words named as well.
    await waitFor(() =>
      expect(screen.getByText(/work that is not on your shelf/)).toBeInTheDocument(),
    )
    expect(screen.getByText(/words are not saved either/)).toBeInTheDocument()
    // Nothing was replaced, so the unannounced edit is still in the editor.
    expect(bridges.length).toBe(bridgeCount)
    expect(bridge.disposed).toBe(false)

    await act(async () => {
      screen.getByText('Keep working').click()
    })
    expect(screen.getByLabelText('What you were trying')).toHaveValue(voiceScript.text)
  })

  it('says the game is saved and only the words are not, when that is true', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    // The editor holds exactly what was saved.
    bridge.nextCapture = editedFiles(4)
    await pickFile(archiveFile(serializeBuildStudioSource(editedFiles(2))))
    await waitFor(() =>
      expect(screen.getByText(/Your game is saved\. Your words are not/)).toBeInTheDocument(),
    )
    expect(screen.queryByText(/work that is not on your shelf/)).not.toBeInTheDocument()
  })

  it('warns about BOTH the game and the words on a departure', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    bridge.nextCapture = editedFiles(9)
    await attemptDeparture()
    await waitFor(() =>
      expect(screen.getByText('Keep your game first?')).toBeInTheDocument(),
    )
    expect(screen.getByText(/changes that are not on your shelf/)).toBeInTheDocument()
    expect(screen.getByText(/Your words are not saved yet/)).toBeInTheDocument()
    // And a deliberate way out is on the dialog.
    expect(screen.getByRole('button', { name: 'Leave and lose it' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stay here' })).toBeInTheDocument()
  })
})

/**
 * The slot rule, directly — because this is where two notes were lost.
 *
 * Unlike two captures of a game, two notes are two different sentences about
 * two different saves. Neither supersedes the other, and a lost one cannot be
 * said again, so the slot holds ONE unresolved note until it is written or
 * deliberately discarded.
 */
describe('the held-words slot keeps one note until it is resolved', () => {
  const noteFor = (id: string, text: string): PendingNote => ({
    target: {
      familyId: OWNER.familyId,
      childId: OWNER.childId,
      projectId: OWNER.projectId,
      versionId: `ver-${id}`,
      versionDocId: `doc-${id}`,
      visitId: 's-1',
      noteActionId: id,
      help: 'none-offered',
    },
    text,
    capture: 'voice',
    voiceEventId: `ev-${id}`,
    createdAt: '2026-11-17T12:00:00.000Z',
    attempts: 0,
    state: 'unsent',
  })

  it('refuses a different note, and clears only the one that resolved', () => {
    const a = noteFor('n-a', 'the apples were too slow')
    const b = noteFor('n-b', 'I made the bomb bigger')
    expect(holdPendingNote(OWNER, a)).toBe(true)
    // B does not get to take A's recovery slot.
    expect(holdPendingNote(OWNER, b)).toBe(false)
    expect(readPendingNote(OWNER)?.text).toBe(a.text)

    // An acknowledgment of another note may not clear this one.
    clearPendingNote(OWNER, 'n-b')
    expect(readPendingNote(OWNER)?.text).toBe(a.text)

    // The same note always updates itself: a correction, an attempt, a state.
    expect(
      holdPendingNote(OWNER, { ...a, text: 'the apples were slow', state: 'failed' }),
    ).toBe(true)
    expect(readPendingNote(OWNER)?.state).toBe('failed')

    // Resolved, and the slot is free for the next sentence.
    clearPendingNote(OWNER, 'n-a')
    expect(readPendingNote(OWNER)).toBeNull()
    expect(holdPendingNote(OWNER, b)).toBe(true)
  })

  it('never files one child’s words under another', () => {
    const a = noteFor('n-a', 'mine')
    expect(holdPendingNote({ ...OWNER, childId: 'c2' }, a)).toBe(false)
    expect(readPendingNote({ ...OWNER, childId: 'c2' })).toBeNull()
  })

  /**
   * The send claim and the discard mark, directly.
   *
   * These are what make Retry and Discard conditional rather than a guess: a
   * failure may only be reported by the live claim for its own action, and
   * words somebody deliberately threw away may not come back.
   */
  it('lets only the live claim report a failure, for its own action', () => {
    const a = noteFor('n-a', 'the apples were too slow')
    const b = noteFor('n-b', 'I made the bomb bigger')
    holdPendingNote(OWNER, a)
    const claim = claimNoteSend(OWNER, 'n-a')
    expect(claim).toBeTruthy()
    expect(noteSendInFlight(OWNER)).toBe(true)
    // The slot says what is actually happening, for every mount.
    expect(readPendingNote(OWNER)?.state).toBe('sending')
    // A second mount cannot start the same send again.
    expect(claimNoteSend(OWNER, 'n-a')).toBeNull()
    // Nobody else's failure may land.
    expect(failPendingNote(OWNER, 'claim-nonsense', a)).toBe(false)
    expect(failPendingNote(OWNER, claim as string, b)).toBe(false)
    expect(readPendingNote(OWNER)?.state).toBe('sending')
    // Its own may, and that unlocks a real retry.
    expect(failPendingNote(OWNER, claim as string, a)).toBe(true)
    expect(readPendingNote(OWNER)?.state).toBe('failed')
    releaseNoteSend(OWNER, claim as string)
    expect(noteSendInFlight(OWNER)).toBe(false)
  })

  it('does not resurrect words somebody deliberately discarded', () => {
    const a = noteFor('n-a', 'the apples were too slow')
    holdPendingNote(OWNER, a)
    const claim = claimNoteSend(OWNER, 'n-a') as string
    discardPendingNote(OWNER, 'n-a')
    expect(readPendingNote(OWNER)).toBeNull()
    // A failure arriving afterwards changes nothing, and neither does a
    // re-hold of the same action.
    expect(failPendingNote(OWNER, claim, a)).toBe(false)
    expect(holdPendingNote(OWNER, a)).toBe(false)
    expect(readPendingNote(OWNER)).toBeNull()
    releaseNoteSend(OWNER, claim)
    // A NEW note is still allowed — only that action is gone.
    expect(holdPendingNote(OWNER, noteFor('n-b', 'second try'))).toBe(true)
  })

  it('tells subscribers when the slot changes', () => {
    const seen: Array<string | null> = []
    const stop = subscribePendingNote(OWNER, () => {
      seen.push(readPendingNote(OWNER)?.state ?? null)
    })
    const a = noteFor('n-a', 'said once')
    holdPendingNote(OWNER, a)
    const claim = claimNoteSend(OWNER, 'n-a') as string
    clearPendingNote(OWNER, 'n-a')
    releaseNoteSend(OWNER, claim)
    stop()
    holdPendingNote(OWNER, noteFor('n-c', 'after unsubscribe'))
    expect(seen).toEqual(['unsent', 'sending', null, null])
  })
})

/**
 * The three C2 defects, through the component.
 *
 * 1. a copy of the slot went stale, so an acknowledgment from a mount that had
 *    gone away left the panel up and the mic shut;
 * 2. Retry and Discard were enabled by a LOCAL flag, so a child could discard
 *    words a write was carrying and a late failure could resurrect them;
 * 3. the help was frozen when the GAME was acknowledged, so Hint → speak →
 *    Save recorded "none offered".
 */
describe('the store is the one current answer about a note', () => {
  it('clears the returned panel when the earlier write lands, and reopens the mic', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    let release: (() => void) | null = null
    saveNote.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ id: 'note-1', alreadySaved: false })
        }),
    )
    await act(async () => {
      screen.getByRole('button', { name: 'Save my words' }).click()
    })
    await waitFor(() => expect(readPendingNote(OWNER)?.state).toBe('sending'))

    // He leaves while it is out, and comes back.
    cleanup()
    const second = await openEditor()
    expect(screen.getByText('These words may still be saving')).toBeInTheDocument()
    // While it really is sending, neither a retry nor a discard is offered as
    // though it had failed.
    expect(screen.getByRole('button', { name: 'Save these words' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Discard these words' })).toBeDisabled()

    // The earlier write lands. The page he is looking at is told.
    await act(async () => {
      release?.()
    })
    await waitFor(() =>
      expect(screen.queryByText('These words may still be saving')).not.toBeInTheDocument(),
    )
    expect(readPendingNote(OWNER)).toBeNull()
    // And the mic is available again for a new note about the same game.
    await saveAVersion(second, editedFiles(5))
    await waitFor(() => expect(screen.getByText('Pretend mic')).toBeInTheDocument())
    expect(saveNote).toHaveBeenCalledTimes(1)
  })

  it('a late failure cannot revive words that were discarded', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    let fail: (() => void) | null = null
    saveNote.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = () => reject(new Error('offline'))
        }),
    )
    await act(async () => {
      screen.getByRole('button', { name: 'Save my words' }).click()
    })
    await waitFor(() => expect(readPendingNote(OWNER)?.state).toBe('sending'))
    // Mid-write, a discard is NOT offered: the write cannot be called back.
    expect(screen.getByRole('button', { name: 'Start over' })).toBeDisabled()

    // It fails, which unlocks a real retry…
    await act(async () => {
      fail?.()
    })
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Start over' })).toBeEnabled()
    const discardedId = readPendingNote(OWNER)?.target.noteActionId

    // …and now he deliberately throws them away.
    await act(async () => {
      screen.getByRole('button', { name: 'Start over' }).click()
    })
    expect(readPendingNote(OWNER)).toBeNull()
    // A stale re-hold of that exact action is refused, so nothing resurrects.
    const ghost: PendingNote = {
      target: {
        familyId: OWNER.familyId,
        childId: OWNER.childId,
        projectId: OWNER.projectId,
        versionId: 'v',
        versionDocId: 'doc',
        visitId: 's',
        noteActionId: discardedId as string,
        help: 'none-offered',
      },
      text: voiceScript.text,
      capture: 'voice',
      createdAt: '2026-11-17T12:00:00.000Z',
      attempts: 1,
      state: 'failed',
    }
    expect(holdPendingNote(OWNER, ghost)).toBe(false)
    cleanup()
    await openEditor()
    expect(screen.queryByText(new RegExp(voiceScript.text))).not.toBeInTheDocument()
  })
})

/**
 * The last reported defect: a note whose write FAILED (or persisted and lost
 * its acknowledgment) left an action the writer keeps one text for — and the
 * box was editable again, so a correction produced words the retry could only
 * be refused for. An attempted action's words are immutable; Start over is the
 * door to different ones.
 */
describe('an attempted note keeps the exact words it was sent with', () => {
  it('locks the box after a failure and retries the original payload', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    // A correction BEFORE the first send is still allowed.
    expect(screen.getByLabelText('What you were trying')).toBeEnabled()
    await editWords('I wanted the apples faster')

    saveNote.mockRejectedValueOnce(new Error('lost answer'))
    await act(async () => {
      screen.getByRole('button', { name: 'Save my words' }).click()
    })
    await waitFor(() => expect(screen.getByText('lost answer')).toBeInTheDocument())
    const sent = saveNote.mock.calls[0][0]
    const held = readPendingNote(OWNER)
    expect(sent.text).toBe('I wanted the apples faster')

    // Now the words belong to an attempted action: the box is shut, and the
    // button says what trying again does.
    const box = screen.getByLabelText('What you were trying')
    expect(box).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Try again with these words' }),
    ).toBeEnabled()
    expect(screen.getByText(/Try again keeps these exact words/)).toBeInTheDocument()

    // Even a retained callback firing cannot rewrite the pending payload.
    await act(async () => {
      fireEvent.change(box, { target: { value: 'completely different words' } })
    })
    expect(screen.getByLabelText('What you were trying')).toHaveValue(
      'I wanted the apples faster',
    )
    const after = readPendingNote(OWNER)
    expect(after?.text).toBe(held?.text)
    expect(after?.target.noteActionId).toBe(held?.target.noteActionId)
    expect(after?.createdAt).toBe(held?.createdAt)
    expect(after?.target.versionId).toBe(held?.target.versionId)
    expect(after?.voiceEventId).toBe(voiceScript.eventId)
    expect(after?.target.help).toBe('none-offered')
    expect(after?.attempts).toBe(1)
    expect(after?.state).toBe('failed')

    // And the retry sends exactly that, once.
    await act(async () => {
      screen.getByRole('button', { name: 'Try again with these words' }).click()
    })
    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(2))
    const retry = saveNote.mock.calls[1][0]
    expect(retry.text).toBe(sent.text)
    expect(retry.noteActionId).toBe(sent.noteActionId)
    expect(retry.createdAt).toBe(sent.createdAt)
    expect(retry.versionId).toBe(sent.versionId)
    expect(retry.versionDocId).toBe(sent.versionDocId)
    expect(retry.voiceEventId).toBe(sent.voiceEventId)
    expect(retry.help).toBe(sent.help)
    await waitFor(() => expect(readPendingNote(OWNER)).toBeNull())
  })

  it('Start over mints a NEW action, and that box is editable again', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    saveNote.mockRejectedValueOnce(new Error('offline'))
    await act(async () => {
      screen.getByRole('button', { name: 'Save my words' }).click()
    })
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())
    const firstId = saveNote.mock.calls[0][0].noteActionId

    // Different words are a deliberate restart, not an edit of a sent note.
    await act(async () => {
      screen.getByRole('button', { name: 'Start over' }).click()
    })
    expect(readPendingNote(OWNER)).toBeNull()

    await sayWords()
    expect(screen.getByLabelText('What you were trying')).toBeEnabled()
    await editWords('this time I changed the bomb')
    await act(async () => {
      screen.getByRole('button', { name: 'Save my words' }).click()
    })
    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(2))
    const second = saveNote.mock.calls[1][0]
    expect(second.noteActionId).not.toBe(firstId)
    expect(second.text).toBe('this time I changed the bomb')
    // The first, refused attempt was not re-sent or overwritten.
    expect(saveNote.mock.calls[0][0].noteActionId).toBe(firstId)
  })
})

describe('a note records the help that had been OFFERED when he spoke', () => {
  it('records a hint offered after the save and before the words', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    // Save the game, THEN ask for a hint, THEN say what he was trying.
    await act(async () => {
      screen.getByRole('button', { name: /Hint/ }).click()
    })
    await sayWords()
    await act(async () => {
      screen.getByRole('button', { name: 'Save my words' }).click()
    })
    await waitFor(() => expect(saveNote).toHaveBeenCalled())
    const args = saveNote.mock.calls[0][0]
    expect(args.help).toBe('hints-offered')
    expect(args.hintsOffered).toBe(1)
  })

  it('a hint offered AFTER the words changes nothing about them', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    await sayWords()
    // The hint comes after the sentence was accepted.
    await act(async () => {
      screen.getByRole('button', { name: /Hint/ }).click()
    })
    // The draft was not retargeted or invalidated by the help changing.
    expect(screen.getByLabelText('What you were trying')).toHaveValue(voiceScript.text)
    saveNote.mockRejectedValueOnce(new Error('offline'))
    await act(async () => {
      screen.getByRole('button', { name: 'Save my words' }).click()
    })
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())
    const first = saveNote.mock.calls[0][0]
    expect(first.help).toBe('none-offered')
    expect(first.hintsOffered).toBeUndefined()

    // And the retry carries the ORIGINAL metadata, not the newer help. The
    // button is named for what it does now that these words were sent once.
    saveNote.mockResolvedValue({ id: 'note-1', alreadySaved: false })
    await act(async () => {
      screen.getByRole('button', { name: 'Try again with these words' }).click()
    })
    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(2))
    const retry = saveNote.mock.calls[1][0]
    expect(retry.help).toBe('none-offered')
    expect(retry.hintsOffered).toBeUndefined()
    expect(retry.noteActionId).toBe(first.noteActionId)
    expect(retry.createdAt).toBe(first.createdAt)
    expect(retry.voiceEventId).toBe(first.voiceEventId)
  })
})

/**
 * A game too big to SAVE is never swapped for an older one (PR #1974 round 1).
 *
 * The reproduced hole: an edited `main.blocks` past the per-file cap is refused
 * by the bridge, so the app's newest ACCEPTED source stays the previous
 * project — and *Download a copy* handed that previous game over, named like
 * the current one, with nothing said. The child's 5-life source was over the
 * limit and the file he got held the 4-life bytes.
 *
 * POSITIVE CONTROLS are named per case.
 */
describe('a download is the CURRENT game or an honest refusal', () => {
  /** The archive — the recovery file — out of what the browser was handed. */
  const archive = () => downloads.find((d) => d.filename.endsWith('-source.json'))

  async function tapDownload() {
    await act(async () => {
      screen.getAllByText('Download a copy')[0].click()
    })
  }

  /**
   * The current source, over the per-file cap: the real shape of it, which is
   * the child's own edited blocks with far too much in them.
   */
  const tooBigFiles = (lives: number) => {
    const files = editedFiles(lives)
    return {
      ...files,
      'main.blocks': `${files['main.blocks']}<!--${'b'.repeat(400_001)}-->`,
    }
  }

  /**
   * POSITIVE CONTROL: put `bridgeRef.current?.editorSaveSeen()?.files` back as
   * the next fallback in `handleDownloadCurrent` and this case downloads
   * `info.setLife(4)` — the older game — exactly as the reviewer saw.
   */
  it('hands over the over-cap CURRENT source, not the older accepted game', async () => {
    const bridge = await openEditor()
    // The older game, accepted and announced.
    await act(async () => {
      bridge.announce(editedFiles(4))
    })
    // Now his blocks go past the cap. The bridge refuses it as a save and
    // keeps it for a download; the capture therefore comes back with nothing.
    bridge.refuseTooBig(tooBigFiles(5))
    bridge.captureError = new Error('Your game is now too big for this app to keep')
    await tapSave()
    await waitFor(() => expect(screen.getByText(/too big for this app to keep/)).toBeInTheDocument())

    downloads.length = 0
    await tapDownload()
    const file = archive()
    expect(file).toBeTruthy()
    // The bytes are the ones in front of him…
    expect(file!.text).toContain('info.setLife(5)')
    // …and not the older accepted game, which is the whole defect.
    expect(file!.text).not.toContain('info.setLife(4)')
    // The file says what it is, so it cannot be taken later for a version that
    // is on the shelf.
    expect(file!.filename).toContain('too-big-to-save')
    expect(screen.getByText(/NOT on your shelf/)).toBeInTheDocument()
  })

  it('refuses out loud when the current source is too big to hand back', async () => {
    const bridge = await openEditor()
    await act(async () => {
      bridge.announce(editedFiles(4))
    })
    // Over the ARCHIVE cap: nothing is held, so there is nothing to give.
    bridge.refuseTooBig(null)
    bridge.captureError = new Error('Your game is now too big for this app to keep')
    await tapSave()
    await waitFor(() => expect(screen.getByText(/too big for this app to keep/)).toBeInTheDocument())

    downloads.length = 0
    await tapDownload()
    // Nothing was downloaded — and in particular not the older game.
    expect(downloads).toHaveLength(0)
    expect(
      screen.getByText(/nothing was downloaded rather than giving you the wrong game/),
    ).toBeInTheDocument()
  })

  /**
   * The fallback that is still RIGHT, pinned so the fix above does not take it
   * away: when a capture merely failed, the last source the editor announced is
   * genuinely the newest thing this app has read.
   */
  it('still downloads the last announced source when a capture merely failed', async () => {
    const bridge = await openEditor()
    await act(async () => {
      bridge.announce(editedFiles(4))
    })
    bridge.captureError = new Error('The editor did not hand the game over.')
    await tapSave()
    await waitFor(() =>
      expect(screen.getByText(/did not hand the game over/)).toBeInTheDocument(),
    )

    downloads.length = 0
    await tapDownload()
    const file = archive()
    expect(file!.text).toContain('info.setLife(4)')
    expect(file!.filename).not.toContain('too-big-to-save')
    expect(screen.queryByText(/NOT on your shelf/)).not.toBeInTheDocument()
  })

  /**
   * Sol's independent browser blocker, which an earlier draft of this suite
   * wrongly endorsed.
   *
   * A four-life capture failed both writes, so its exact payload is held; the
   * child then built past the cap and Save was refused. *Download a copy*
   * returned the retained FOUR-life bytes, byte for byte, with nothing said —
   * the same defect in a second costume. The current source is now read before
   * any held copy, and the unfinished save stays exactly where it is, for its
   * own explicit Retry.
   *
   * POSITIVE CONTROL: move the `departureFilesRef.current ?? pending?.files`
   * branch back above the `sourceOverCaps()` check and this case downloads
   * `info.setLife(4)`.
   */
  it('exports the CURRENT over-cap source even while an unfinished save is held', async () => {
    const bridge = await openEditor()
    // The four-life capture, which failed both writes.
    bridge.nextCapture = editedFiles(4)
    saveVersion.mockRejectedValue(new Error('offline'))
    await tapSave()
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())
    const idA = readPendingSave(OWNER)?.versionId
    expect(readPendingSave(OWNER)?.files['main.ts']).toBe(editedFiles(4)['main.ts'])

    // He keeps building. The blocks are now over the cap, so Save is refused.
    bridge.refuseTooBig(tooBigFiles(5))
    bridge.captureError = new Error('Your game is now too big for this app to keep')
    await tapSave()
    await waitFor(() =>
      expect(screen.getByText(/too big for this app to keep/)).toBeInTheDocument(),
    )

    // Download a copy is a copy of what is OPEN.
    downloads.length = 0
    await tapDownload()
    expect(archive()!.text).toContain('info.setLife(5)')
    expect(archive()!.text).not.toContain('info.setLife(4)')
    expect(archive()!.filename).toContain('too-big-to-save')
    expect(screen.getByText(/NOT on your shelf/)).toBeInTheDocument()

    // And the unfinished save is untouched — same bytes, same version id, sent
    // only by its own Try again, which is a different intent.
    expect(readPendingSave(OWNER)?.versionId).toBe(idA)
    saveVersion.mockReset()
    saveVersion.mockImplementation(async (args: { versionId: string }) => ({
      outcome: 'created',
      version: { id: `doc-${args.versionId}` },
    }))
    await act(async () => {
      screen.getByText('Try again').click()
    })
    await waitFor(() => expect(saveVersion).toHaveBeenCalled())
    expect(saveVersion.mock.calls[0][0].versionId).toBe(idA)
    expect(saveVersion.mock.calls[0][0].files['main.ts']).toBe(editedFiles(4)['main.ts'])
  })

  it('exports the CURRENT over-cap source rather than an older departure capture', async () => {
    const bridge = await openEditor()
    // A pre-departure capture read the four-life source…
    bridge.nextCapture = editedFiles(4)
    await attemptDeparture()
    await waitFor(() => expect(screen.getByText('Save it now')).toBeInTheDocument())
    // …and then the blocks went over the cap while the dialog was open.
    bridge.refuseTooBig(tooBigFiles(5))
    downloads.length = 0
    await tapDownload()
    expect(archive()!.text).toContain('info.setLife(5)')
    expect(archive()!.text).not.toContain('info.setLife(4)')
    expect(archive()!.filename).toContain('too-big-to-save')
  })

  it('refuses, and NAMES the older save, when the current source is too large to hold', async () => {
    const bridge = await openEditor()
    bridge.nextCapture = editedFiles(4)
    saveVersion.mockRejectedValue(new Error('offline'))
    await tapSave()
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())
    const idA = readPendingSave(OWNER)?.versionId

    // Over the ARCHIVE cap: there is nothing to hand back at all.
    bridge.refuseTooBig(null)
    downloads.length = 0
    await tapDownload()
    // Nothing was downloaded, and in particular not the held four-life save.
    expect(downloads).toHaveLength(0)
    expect(
      screen.getByText(/nothing was downloaded rather than giving you the wrong game/),
    ).toBeInTheDocument()
    // That save is disclosed rather than substituted, and is still retriable
    // with its own payload.
    expect(screen.getByText(/Try again sends that earlier game/)).toBeInTheDocument()
    expect(readPendingSave(OWNER)?.versionId).toBe(idA)
    expect(readPendingSave(OWNER)?.files['main.ts']).toBe(editedFiles(4)['main.ts'])
  })
})

/**
 * A save that LANDS retires the held departure (PR #1974 round 1).
 *
 * Reproduced in a browser both ways round — Today then *Save it now*, and Save
 * then Today while the acknowledgment was still out: the game reached the
 * shelf and the navigation stayed blocked, with a dialog warning that a saved
 * game was about to be lost. `departureRunRef` still held the run that had
 * answered "dirty", and `hasWorkAtRisk` stayed true because the editor was
 * live and nothing had re-confirmed it clean.
 *
 * POSITIVE CONTROL for the whole block: remove the `savedRetiresRun` branch
 * from the departure effect and every release case here hangs with
 * `proceedSpy` never called.
 */
describe('a save that lands releases the departure it was asked for', () => {
  it('releases after Save it now on an UNANNOUNCED edit', async () => {
    const bridge = await openEditor()
    const edited = editedFiles(4)
    // He typed 4 into the blocks; MakeCode has announced nothing.
    bridge.nextCapture = edited
    await attemptDeparture()
    await waitFor(() => expect(screen.getByText('Keep your game first?')).toBeInTheDocument())
    expect(proceedSpy).not.toHaveBeenCalled()

    await act(async () => {
      screen.getByText('Save it now').click()
    })
    // The captured bytes were stored, and the navigation he asked for happened.
    await waitFor(() => expect(proceedSpy).toHaveBeenCalled())
    expect(saveVersion.mock.calls[0][0].files['main.ts']).toBe(edited['main.ts'])
    await waitFor(() =>
      expect(screen.queryByText('Keep your game first?')).not.toBeInTheDocument(),
    )
  })

  it('releases after Save it now on an ANNOUNCED edit', async () => {
    const bridge = await openEditor()
    const edited = editedFiles(4)
    bridge.nextCapture = edited
    await act(async () => {
      bridge.announce(edited)
    })
    await attemptDeparture()
    // Known dirty, so the hold is answered without a capture…
    await waitFor(() => expect(screen.getByText('Keep your game first?')).toBeInTheDocument())
    await act(async () => {
      screen.getByText('Save it now').click()
    })
    // …and the save's own re-check is what releases it.
    await waitFor(() => expect(proceedSpy).toHaveBeenCalled())
  })

  it('releases when the write lands AFTER the person tapped Today', async () => {
    const bridge = await openEditor()
    const edited = editedFiles(4)
    bridge.nextCapture = edited
    await act(async () => {
      bridge.announce(edited)
    })
    let releaseWrite: (() => void) | null = null
    saveVersion.mockImplementation(
      (args: { versionId: string }) =>
        new Promise((resolveWrite) => {
          releaseWrite = () =>
            resolveWrite({ outcome: 'created', version: { id: `doc-${args.versionId}` } })
        }),
    )
    await tapSave()
    // He taps Today while the acknowledgment is still out. Held, deliberately.
    await attemptDeparture()
    expect(proceedSpy).not.toHaveBeenCalled()
    await act(async () => {
      releaseWrite?.()
    })
    await waitFor(() => expect(proceedSpy).toHaveBeenCalled())
  })

  /**
   * Sol's case: the re-check must CAPTURE, not trust. An edit made while the
   * write was out may never have been announced.
   *
   * POSITIVE CONTROL: release the hold in `commit` instead of retiring the run
   * and this case leaves with an unsaved edit in the editor.
   */
  it('keeps the hold for an UNANNOUNCED edit made while the save was running', async () => {
    const bridge = await openEditor()
    bridge.nextCapture = editedFiles(4)
    await attemptDeparture()
    await waitFor(() => expect(screen.getByText('Save it now')).toBeInTheDocument())
    saveVersion.mockImplementation(async (args: { versionId: string }) => {
      // He changes the blocks again mid-write. MakeCode says nothing about it;
      // only a fresh capture can see it.
      bridge.nextCapture = editedFiles(7)
      return { outcome: 'created', version: { id: `doc-${args.versionId}` } }
    })
    await act(async () => {
      screen.getByText('Save it now').click()
    })
    // The game that was captured is on the shelf; what is open is NOT, and the
    // departure is still held and still honest about why.
    await waitFor(() =>
      expect(screen.getByText(/changes that are not on your shelf yet/)).toBeInTheDocument(),
    )
    expect(proceedSpy).not.toHaveBeenCalled()
    expect(screen.getByText('Keep your game first?')).toBeInTheDocument()
  })

  it('keeps the hold for an ANNOUNCED edit made while the save was running', async () => {
    const bridge = await openEditor()
    const edited = editedFiles(4)
    bridge.nextCapture = edited
    await act(async () => {
      bridge.announce(edited)
    })
    await attemptDeparture()
    await waitFor(() => expect(screen.getByText('Save it now')).toBeInTheDocument())
    saveVersion.mockImplementation(async (args: { versionId: string }) => {
      bridge.announce(editedFiles(7))
      bridge.nextCapture = editedFiles(7)
      return { outcome: 'created', version: { id: `doc-${args.versionId}` } }
    })
    await act(async () => {
      screen.getByText('Save it now').click()
    })
    await waitFor(() =>
      expect(screen.getByText(/tap Save again to keep those too/)).toBeInTheDocument(),
    )
    expect(proceedSpy).not.toHaveBeenCalled()
  })

  /**
   * Accepted words keep their own guard. A saved game is not a saved sentence,
   * and the dialog must stop talking about the game and start talking about the
   * words — with the words still there to save.
   */
  it('keeps the hold for unsaved WORDS once the game is safely saved', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge, editedFiles(4))
    await sayWords()
    // Then he edits the game again and leaves.
    const newer = editedFiles(7)
    bridge.nextCapture = newer
    await act(async () => {
      bridge.announce(newer)
    })
    await attemptDeparture()
    await waitFor(() => expect(screen.getByText('Keep your game first?')).toBeInTheDocument())

    await act(async () => {
      screen.getByText('Save it now').click()
    })
    // The game is on the shelf, so the question is now only about the words…
    await waitFor(() => expect(screen.getByText('Keep your words first?')).toBeInTheDocument())
    expect(proceedSpy).not.toHaveBeenCalled()
    // …and the exact sentence is still held for their owner, offered back.
    expect(readPendingNote(OWNER)?.text).toBe(voiceScript.text)
    expect(screen.getByText(new RegExp(voiceScript.text))).toBeInTheDocument()
  })

  /**
   * An old acknowledgment is not an answer about the open game.
   *
   * POSITIVE CONTROL: mark the departure from the `else` branch of
   * `sourceIsCurrent` in `commit` and this case leaves with the live editor's
   * edit unsaved.
   */
  it('does NOT release on a restored retry of an older visit’s save', async () => {
    const first = await openEditor()
    first.nextCapture = editedFiles(4)
    saveVersion.mockRejectedValue(new Error('offline'))
    await tapSave()
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())

    // He leaves and comes back; the editor now holds something else.
    cleanup()
    const second = await openEditor()
    second.nextCapture = editedFiles(7)
    await act(async () => {
      second.announce(editedFiles(7))
    })
    saveVersion.mockReset()
    saveVersion.mockImplementation(async (args: { versionId: string }) => ({
      outcome: 'created',
      version: { id: `doc-${args.versionId}` },
    }))

    await attemptDeparture()
    await waitFor(() => expect(screen.getByText('Keep your game first?')).toBeInTheDocument())
    await act(async () => {
      screen.getByText('Try saving again').click()
    })
    // That earlier version is on the shelf — and the hold stands, because what
    // is open is still unsaved.
    await waitFor(() => expect(screen.getByText(/it is on your shelf now/)).toBeInTheDocument())
    expect(proceedSpy).not.toHaveBeenCalled()
    expect(screen.getByText('Keep your game first?')).toBeInTheDocument()
  })

  it('does not release merely because a save STARTED', async () => {
    const bridge = await openEditor()
    bridge.nextCapture = editedFiles(4)
    await act(async () => {
      bridge.announce(editedFiles(4))
    })
    saveVersion.mockImplementation(() => new Promise(() => {}))
    await attemptDeparture()
    await waitFor(() => expect(screen.getByText('Save it now')).toBeInTheDocument())
    await act(async () => {
      screen.getByText('Save it now').click()
    })
    await waitFor(() => expect(saveVersion).toHaveBeenCalled())
    // The write never came back, so nothing was released.
    expect(proceedSpy).not.toHaveBeenCalled()
  })
})

/**
 * The mic is handed the child's own configured engine (PR #1974 round 1).
 *
 * `VoiceInput` selects the existing Whisper recording only on
 * `profile.voiceInputEnhanced === true`. This page passed nothing but an id, so
 * a child configured for enhanced input got the Web Speech path — and on a
 * device with no `SpeechRecognition`, a disabled microphone. Nothing about how
 * a recording is made or stamped changes here: the component is the same one,
 * and its surface and owner are asserted beside the flag.
 */
describe('the reflection mic gets the resolved child’s voice setting', () => {
  const lastVoiceProfile = () => voiceProps.at(-1)?.profile

  it('passes TRUE through for a child configured for enhanced input', async () => {
    const bridge = await openEditor({ childVoiceInputEnhanced: true })
    await saveAVersion(bridge)
    expect(lastVoiceProfile()?.id).toBe(OWNER.childId)
    expect(lastVoiceProfile()?.voiceInputEnhanced).toBe(true)
    expect(voiceProps.at(-1)?.sourceSurface).toBe('build-studio-reflection')
  })

  it('passes FALSE through for a child configured off', async () => {
    const bridge = await openEditor({ childVoiceInputEnhanced: false })
    await saveAVersion(bridge)
    expect(lastVoiceProfile()).toEqual({
      id: OWNER.childId,
      voiceInputEnhanced: false,
    })
  })

  it('treats an ABSENT setting as off, which is what it has always meant', async () => {
    const bridge = await openEditor()
    await saveAVersion(bridge)
    expect(lastVoiceProfile()).toEqual({
      id: OWNER.childId,
      voiceInputEnhanced: false,
    })
  })

  /**
   * A child switch remounts this editor under the new child (the page keys it
   * by family + child), so the mic must be the NEW child's — his id and his
   * own setting, never the previous one's.
   */
  it('follows a child switch, id and setting together', async () => {
    const first = await openEditor({ childVoiceInputEnhanced: true })
    await saveAVersion(first)
    expect(lastVoiceProfile()?.voiceInputEnhanced).toBe(true)

    cleanup()
    const second = await openEditor({ childId: 'c2', childVoiceInputEnhanced: false })
    await saveAVersion(second)
    expect(lastVoiceProfile()).toEqual({ id: 'c2', voiceInputEnhanced: false })
    // And the write that save made is still the switched-to child's own.
    expect(saveVersion.mock.calls.at(-1)![0].childId).toBe('c2')
  })

  /**
   * Provenance is untouched by any of this: the words a mic hands over keep
   * their own voice event, and a retry re-sends THAT event under the same
   * child and the same version.
   */
  it('keeps the voice event, child and version across a retry', async () => {
    const bridge = await openEditor({ childVoiceInputEnhanced: true })
    await saveAVersion(bridge)
    await sayWords()
    saveNote.mockRejectedValueOnce(new Error('offline'))
    await act(async () => {
      screen.getByRole('button', { name: 'Save my words' }).click()
    })
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())
    saveNote.mockResolvedValue({ id: 'note-1', alreadySaved: false })
    await act(async () => {
      screen.getByRole('button', { name: 'Try again with these words' }).click()
    })
    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(2))
    const [first, retry] = saveNote.mock.calls.map((call) => call[0])
    expect(first.voiceEventId).toBe(voiceScript.eventId)
    expect(retry.voiceEventId).toBe(voiceScript.eventId)
    expect(retry.childId).toBe(OWNER.childId)
    expect(retry.versionId).toBe(first.versionId)
    expect(retry.noteActionId).toBe(first.noteActionId)
  })
})
