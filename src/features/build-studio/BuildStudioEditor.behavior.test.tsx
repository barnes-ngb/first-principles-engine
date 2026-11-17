import { act, render, screen, waitFor } from '@testing-library/react'
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

const PXT = JSON.stringify({ name: 'Apple Dash starter', files: ['main.blocks', 'main.ts'] })
const BLOCKS =
  '<xml xmlns="x"><block type="pxt-on-start"><statement name="HANDLER">' +
  '<block type="hudSetLife"><value name="value"><shadow type="math_number">' +
  '<field name="NUM">3</field></shadow></value></block></statement></block></xml>'

const starterFiles = () => ({
  'pxt.json': PXT,
  'main.blocks': BLOCKS,
  'main.ts': 'info.setLife(3)\nsprites.create(1)\n',
})

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
  captures = 0
  disposed = false
  infoAsked = 0
  played = 0
  edited = 0
  imported: Record<string, string>[] = []
  runtime: { target?: string; pxt?: string } | null = null

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
    return null
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
    return {
      header: { id: 'h1', name: 'Apple Dash starter', targetVersion: '0.0.0' },
      files: { ...this.nextCapture },
    }
  }
  dispose() {
    this.disposed = true
  }
  /** Pretend MakeCode announced a save, with whatever bytes. */
  announce(files: Record<string, string>) {
    this.onEditorSave({
      header: { id: 'h1', name: 'Apple Dash starter' },
      files: { ...files },
    })
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

const blocker = { state: 'unblocked' as 'unblocked' | 'blocked', proceed: vi.fn(), reset: vi.fn() }
let blockPredicate: (() => boolean) | null = null
vi.mock('react-router-dom', () => ({
  useBlocker: (arg: () => boolean) => {
    blockPredicate = arg
    return blocker
  },
}))

const selectProfile = vi.fn()
let registeredGuard: ((next: string) => boolean) | null = null
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({
    selectProfile,
    registerProfileChangeGuard: (g: (next: string) => boolean) => {
      registeredGuard = g
      return () => {
        registeredGuard = null
      }
    },
  }),
}))

vi.mock('../../core/hooks/useTTS', () => ({ useTTS: () => ({ speak: vi.fn() }) }))
vi.mock('../../components/VoiceInput', () => ({ default: () => null }))
vi.mock('./BuildStudioVersionShelf', () => ({ default: () => null }))
// Reached only for the pure `versionBelongsTo` predicate; stubbed so this
// suite initialises no Firebase app.
vi.mock('../../core/firebase/firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: () => ({ __col: 'buildStudioVersions' }),
}))

import { resetPendingSaveStore, readPendingSave } from './buildStudioPendingStore'
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

function renderEditor() {
  return render(
    <BuildStudioEditor
      familyId={OWNER.familyId}
      childId={OWNER.childId}
      childName="Lincoln"
      projectId={OWNER.projectId}
      versions={{
        status: VersionsStatus.Ready,
        versions: [],
        childId: OWNER.childId,
        projectId: OWNER.projectId,
        error: null,
        retry: vi.fn(),
      }}
    />,
  )
}

/** Mount, complete the handshake, and settle the import round trip. */
async function openEditor() {
  renderEditor()
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
  blocker.state = 'unblocked'
  blockPredicate = null
  registeredGuard = null
  vi.mocked(blocker.proceed).mockClear()
  vi.mocked(blocker.reset).mockClear()
  selectProfile.mockClear()
  saveVersion.mockReset()
  saveVersion.mockImplementation(async (args: { versionId: string }) => ({
    outcome: 'created',
    version: { id: `doc-${args.versionId}` },
  }))
  saveNote.mockReset()
  saveNote.mockResolvedValue({ id: 'note-1', alreadySaved: false })
  resetPendingSaveStore()
})

// ── 1. Clean versus newer edits ──────────────────────────────────────────

describe('an ordinary clean Save becomes clean', () => {
  it('does not claim newer changes when none were made', async () => {
    const bridge = await openEditor()
    // The child edits, MakeCode announces it, and he saves.
    const edited = { ...starterFiles(), 'main.ts': 'info.setLife(4)\nsprites.create(1)\n' }
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
    const edited = { ...starterFiles(), 'main.ts': 'info.setLife(4)\nsprites.create(1)\n' }
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
    const first = { ...starterFiles(), 'main.ts': 'info.setLife(4)\nsprites.create(1)\n' }
    const later = { ...starterFiles(), 'main.ts': 'info.setLife(9)\nsprites.create(1)\n' }

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
    const edited = { ...starterFiles(), 'main.ts': 'info.setLife(4)\nsprites.create(1)\n' }
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
    blocker.state = 'blocked'
    // Any state change re-renders, which is how the held departure is noticed.
    await act(async () => {
      bridge.announce(starterFiles())
    })
    await waitFor(() => expect(blocker.proceed).toHaveBeenCalled())
    expect(screen.queryByText('Keep your game first?')).not.toBeInTheDocument()
  })

  it('captures an UNANNOUNCED edit and offers the real choice', async () => {
    const bridge = await openEditor()
    // He typed 4 into the blocks; MakeCode has said nothing.
    bridge.nextCapture = { ...starterFiles(), 'main.ts': 'info.setLife(4)\nsprites.create(1)\n' }
    const before = bridge.captures
    blocker.state = 'blocked'
    await act(async () => {
      bridge.announce(starterFiles())
    })
    await waitFor(() => expect(bridge.captures).toBeGreaterThan(before))
    await waitFor(() => expect(screen.getByText('Keep your game first?')).toBeInTheDocument())
    expect(screen.getByText('Stay here')).toBeInTheDocument()
    expect(screen.getByText('Leave and lose it')).toBeInTheDocument()
    // The captured bytes — not a stale template — are what Save it now stores.
    expect(screen.getByText('Save it now')).toBeInTheDocument()
  })

  it('says it cannot tell when the capture fails, rather than nothing', async () => {
    const bridge = await openEditor()
    bridge.captureError = new Error('no answer')
    blocker.state = 'blocked'
    await act(async () => {
      bridge.announce(starterFiles())
    })
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
    bridge.nextCapture = { ...starterFiles(), 'main.ts': 'info.setLife(4)\nsprites.create(1)\n' }
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

  it('switches on the explicit choice, consuming the allowance once', async () => {
    const bridge = await openEditor()
    bridge.nextCapture = { ...starterFiles(), 'main.ts': 'info.setLife(4)\nsprites.create(1)\n' }
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
    bridge.nextCapture = { ...starterFiles(), 'main.ts': 'info.setLife(4)\nsprites.create(1)\n' }
    saveVersion.mockRejectedValue(new Error('offline'))
    await tapSave()
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())
    const held = readPendingSave(OWNER)
    expect(held?.files['main.ts']).toBe('info.setLife(4)\nsprites.create(1)\n')
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
