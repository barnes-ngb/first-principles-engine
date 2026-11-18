import { beforeEach, describe, expect, it } from 'vitest'

import {
  BUILD_STUDIO_MAX_ARCHIVE_BYTES,
  BUILD_STUDIO_MAX_FILE_BYTES,
  serializeBuildStudioSource,
  utf8ByteLength,
  type BuildStudioSourceFiles,
} from '../../core/types/buildStudio'
import {
  ARCADE_ORIGIN,
  ARCADE_TOO_BIG_TO_SAVE,
  ArcadeBridge,
  ArcadeBridgeError,
  ArcadeBridgeFailure,
  payloadWithinCaps,
  projectShapeComplete,
  readPayloadCaps,
  readProjectFiles,
  type RejectedMessage,
} from './arcadeBridge'
import { RecoveryRefused, readRecoveryArchive } from './buildStudioExport'
import { BUILD_STUDIO_PROJECT_NAME } from './buildStudioStarter'

/**
 * The bridge's refusals (LOCAL-BUILD-001).
 *
 * This is where the slice's "late/duplicate callback rejection" acceptance
 * item is asserted, plus every other way a message can fail to be ours. The
 * handler is called DIRECTLY rather than dispatched on `window`, because
 * jsdom's `MessageEvent` will not carry an arbitrary object as `source` and the
 * thing under test is the handler's contract, not the DOM's.
 *
 * POSITIVE CONTROLS are named per block.
 */

/** A stand-in for the iframe and its content window. */
function fakeFrame() {
  const posted: Array<{ message: Record<string, unknown>; origin: string }> = []
  const contentWindow = {
    postMessage: (message: Record<string, unknown>, origin: string) =>
      posted.push({ message, origin }),
  }
  // `style` and `ownerDocument` are real enough for the capture's input freeze;
  // without them it falls into its own `catch`, which would make the freeze
  // untested rather than tested.
  const style: Record<string, string> = {}
  return {
    posted,
    contentWindow,
    style,
    element: {
      contentWindow,
      style,
      blur: () => {},
      ownerDocument: { activeElement: null },
    } as unknown as HTMLIFrameElement,
  }
}

let ids = 0
const nextId = () => `id-${++ids}`

function makeBridge(
  overrides: { live?: () => boolean } = {},
): {
  bridge: ArcadeBridge
  frame: ReturnType<typeof fakeFrame>
  rejected: RejectedMessage[]
  loaded: () => number
} {
  const frame = fakeFrame()
  const rejected: RejectedMessage[] = []
  let loadedCount = 0
  const bridge = new ArcadeBridge({
    projectName: BUILD_STUDIO_PROJECT_NAME,
    isScopeLive: overrides.live ?? (() => true),
    newId: nextId,
    now: () => 1_000,
    onRejected: (r) => rejected.push(r),
    onEditorLoaded: () => {
      loadedCount += 1
    },
  })
  bridge.attach(frame.element)
  return { bridge, frame, rejected, loaded: () => loadedCount }
}

/** An event as the handler sees one. */
function event(
  frame: ReturnType<typeof fakeFrame>,
  data: unknown,
  origin = ARCADE_ORIGIN,
  source: unknown = undefined,
): MessageEvent {
  return {
    origin,
    source: source === undefined ? frame.contentWindow : source,
    data,
  } as unknown as MessageEvent
}

/** A project the bridge should accept. */
function ourProject(overrides: Record<string, unknown> = {}) {
  return {
    header: {
      id: 'header-1',
      name: BUILD_STUDIO_PROJECT_NAME,
      target: 'arcade',
      targetVersion: '4.1.28',
      pubId: '',
      ...((overrides.header as Record<string, unknown>) ?? {}),
    },
    text: {
      'pxt.json': '{"name":"Apple Dash starter"}',
      'main.ts': 'info.setLife(3)',
      'main.blocks': '<xml/>',
      ...((overrides.text as Record<string, unknown>) ?? {}),
    },
  }
}

beforeEach(() => {
  ids = 0
})

describe('the frame URL carries this visit’s own frame id', () => {
  it('is the Arcade origin in controller mode', () => {
    const { bridge } = makeBridge()
    const url = new URL(bridge.frameUrl())
    expect(url.origin).toBe(ARCADE_ORIGIN)
    expect(url.searchParams.get('controller')).toBe('1')
    expect(url.searchParams.get('frameId')).toBe(bridge.frameId)
  })

  it('sends nothing of the child in the URL', () => {
    const { bridge } = makeBridge()
    const url = new URL(bridge.frameUrl())
    expect([...url.searchParams.keys()].sort()).toEqual(['controller', 'frameId'])
  })
})

describe('a message is read only when every check passes', () => {
  /**
   * POSITIVE CONTROL: relax any one of these four checks in `handleMessage`
   * and the matching case below fails.
   */
  it('refuses another origin', () => {
    const { bridge, frame, rejected } = makeBridge()
    bridge.handleMessage(
      event(frame, { type: 'pxthost', action: 'workspaceloaded', frameId: bridge.frameId }, 'https://evil.example'),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['origin'])
    expect(frame.posted).toHaveLength(0)
  })

  it('refuses an origin that merely STARTS with the Arcade one', () => {
    const { bridge, frame, rejected } = makeBridge()
    bridge.handleMessage(
      event(
        frame,
        { type: 'pxthost', action: 'workspaceloaded', frameId: bridge.frameId },
        `${ARCADE_ORIGIN}.evil.example`,
      ),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['origin'])
  })

  it('refuses a window that is not the current frame’s', () => {
    const { bridge, frame, rejected } = makeBridge()
    bridge.handleMessage(
      event(
        frame,
        { type: 'pxthost', action: 'workspaceloaded', frameId: bridge.frameId },
        ARCADE_ORIGIN,
        { postMessage: () => {} },
      ),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['frame'])
  })

  it('refuses a stale frame id — the previous frame’s reply', () => {
    const { bridge, frame, rejected } = makeBridge()
    bridge.handleMessage(
      event(frame, { type: 'pxthost', action: 'workspaceloaded', frameId: 'an-older-frame' }),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['frame-id'])
    expect(bridge.isLoaded()).toBe(false)
  })

  it('refuses a host action it does not answer', () => {
    const { bridge, frame, rejected } = makeBridge()
    bridge.handleMessage(
      event(frame, { type: 'pxthost', action: 'publishproject', frameId: bridge.frameId }),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['action'])
    expect(frame.posted).toHaveLength(0)
  })
})

describe('the handshake', () => {
  it('answers workspacesync with NO projects — the shelf is not the editor’s', () => {
    const { bridge, frame } = makeBridge()
    bridge.handleMessage(
      event(frame, { type: 'pxthost', action: 'workspacesync', id: 'sync-1', frameId: bridge.frameId }),
    )
    expect(frame.posted).toHaveLength(1)
    expect(frame.posted[0].origin).toBe(ARCADE_ORIGIN)
    expect(frame.posted[0].message).toMatchObject({
      type: 'pxthost',
      action: 'workspacesync',
      id: 'sync-1',
      frameId: bridge.frameId,
      projects: [],
    })
  })

  it('answers workspaceloaded and only then counts as loaded', () => {
    const { bridge, frame, loaded } = makeBridge()
    expect(bridge.isLoaded()).toBe(false)
    bridge.handleMessage(
      event(frame, { type: 'pxthost', action: 'workspaceloaded', id: 'l-1', frameId: bridge.frameId }),
    )
    expect(bridge.isLoaded()).toBe(true)
    expect(loaded()).toBe(1)
    expect(frame.posted[0].message).toMatchObject({ action: 'workspaceloaded', success: true })
  })

  it('refuses a snapshot before the editor has loaded', async () => {
    const { bridge } = makeBridge()
    await expect(bridge.requestSnapshot()).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.NotReady,
    })
  })
})

describe('a project is accepted only when it is OURS', () => {
  function loadedBridge() {
    const made = makeBridge()
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxthost',
        action: 'workspaceloaded',
        id: 'l-1',
        frameId: made.bridge.frameId,
      }),
    )
    made.frame.posted.length = 0
    return made
  }

  it('ignores the editor’s auto-created Untitled project', () => {
    // It really does appear — the probe's own log shows an `Untitled-2` path.
    const { bridge, frame, rejected } = loadedBridge()
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject({ header: { name: 'Untitled' } }),
      }),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['foreign-project'])
    expect(bridge.editorSaveSeen()).toBeNull()
  })

  it('refuses a SHARED project — this app has no share action', () => {
    const { bridge, frame, rejected } = loadedBridge()
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject({ header: { pubId: 'abc123' } }),
      }),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['foreign-project'])
  })

  it('refuses a second project that shares the name but not the header id', () => {
    const { bridge, frame, rejected } = loadedBridge()
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject(),
      }),
    )
    expect(bridge.editorSaveSeen()?.header.id).toBe('header-1')
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject({ header: { id: 'header-2' } }),
      }),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['foreign-project'])
    // The earlier, genuine one is still what was seen.
    expect(bridge.editorSaveSeen()?.header.id).toBe('header-1')
  })

  /**
   * A FRESH bridge has no pin, so the project the editor assigns to the visit's
   * one startup import is the one that gets pinned — and a second, foreign
   * header in that same frame is still refused. There is no per-import reset:
   * every recovery and every reopen is a new visit with a new bridge.
   */
  it('pins the project its own fresh visit imported, and refuses a stranger', async () => {
    const { bridge, frame, rejected } = loadedBridge()
    const pending = bridge.importProject({ 'pxt.json': '{}', 'main.ts': 'x' })
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'importproject',
        id: frame.posted.at(-1)!.message.id,
        frameId: bridge.frameId,
        success: true,
      }),
    )
    await pending
    const save = (id: string) =>
      bridge.handleMessage(
        event(frame, {
          type: 'pxthost',
          action: 'workspacesave',
          frameId: bridge.frameId,
          project: ourProject({ header: { id } }),
        }),
      )
    save('header-imported')
    save('header-stranger')
    expect(rejected.map((r) => r.reason)).toEqual(['foreign-project'])
    expect(bridge.editorSaveSeen()?.header.id).toBe('header-imported')
  })

  it('refuses a project whose text is not all strings', () => {
    const { bridge, frame, rejected } = loadedBridge()
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: { header: ourProject().header, text: { 'pxt.json': '{}', 'main.ts': 7 } },
      }),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['foreign-project'])
  })
})

describe('an editor save is recorded, and is NOT an app save', () => {
  it('is reported as an editor save and nothing more', () => {
    const saves: string[] = []
    const frame = fakeFrame()
    const bridge = new ArcadeBridge({
      projectName: BUILD_STUDIO_PROJECT_NAME,
      isScopeLive: () => true,
      newId: nextId,
      now: () => 1_000,
      onEditorSave: (p) => saves.push(p.header.id ?? ''),
    })
    bridge.attach(frame.element)
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject(),
      }),
    )
    expect(saves).toEqual(['header-1'])
  })
})

describe('a reply is matched to a request, once', () => {
  it('resolves the request whose id it carries', async () => {
    const { bridge, frame } = makeBridge()
    const pending = bridge.importProject({ 'pxt.json': '{}', 'main.ts': 'x' })
    const sent = frame.posted.at(-1)!.message
    expect(sent).toMatchObject({
      type: 'pxteditor',
      action: 'importproject',
      response: true,
      frameId: bridge.frameId,
    })
    // Only `text` is sent — no header, and nothing of the child.
    expect(sent.project).toEqual({ text: { 'pxt.json': '{}', 'main.ts': 'x' } })
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'importproject',
        id: sent.id,
        frameId: bridge.frameId,
        success: true,
      }),
    )
    await expect(pending).resolves.toBeUndefined()
  })

  it('DROPS a duplicate reply rather than resolving a later request', async () => {
    // The acceptance item. A second copy of a reply must not satisfy whatever
    // request happens to be open when it lands.
    const { bridge, frame, rejected } = makeBridge()
    const first = bridge.importProject({ 'pxt.json': '{}', 'main.ts': 'x' })
    const firstId = frame.posted.at(-1)!.message.id
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'importproject',
        id: firstId,
        frameId: bridge.frameId,
        success: true,
      }),
    )
    await first

    const second = bridge.switchToBlocks()
    const secondId = frame.posted.at(-1)!.message.id
    expect(secondId).not.toBe(firstId)
    // The duplicate of the FIRST reply arrives late.
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'importproject',
        id: firstId,
        frameId: bridge.frameId,
        success: true,
      }),
    )
    expect(rejected.map((r) => r.reason)).toContain('unsolicited')
    // The open request is still open; it resolves only on its OWN reply.
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'switchblocks',
        id: secondId,
        frameId: bridge.frameId,
        success: true,
      }),
    )
    await expect(second).resolves.toBe(true)
  })

  it('rejects a reply whose scope is no longer live', async () => {
    let live = true
    const { bridge, frame, rejected } = makeBridge({ live: () => live })
    const pending = bridge.importProject({ 'pxt.json': '{}', 'main.ts': 'x' })
    const id = frame.posted.at(-1)!.message.id
    // The page moved on — a different child, version or visit.
    live = false
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'importproject',
        id,
        frameId: bridge.frameId,
        success: true,
      }),
    )
    await expect(pending).rejects.toMatchObject({ kind: ArcadeBridgeFailure.Stale })
    expect(rejected.map((r) => r.reason)).toContain('scope')
  })

  it('refuses a host action when the scope is no longer live', () => {
    const { bridge, frame, rejected } = makeBridge({ live: () => false })
    bridge.handleMessage(
      event(frame, { type: 'pxthost', action: 'workspacesync', id: 's', frameId: bridge.frameId }),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['scope'])
    expect(frame.posted).toHaveLength(0)
  })

  it('reports the editor’s own refusal as a refusal', async () => {
    const { bridge, frame } = makeBridge()
    const pending = bridge.importProject({ 'pxt.json': '{}', 'main.ts': 'x' })
    const id = frame.posted.at(-1)!.message.id
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'importproject',
        id,
        frameId: bridge.frameId,
        success: false,
      }),
    )
    await expect(pending).rejects.toMatchObject({ kind: ArcadeBridgeFailure.Refused })
  })

  it('swallows a switchblocks failure — it is checked by its result, not its answer', async () => {
    const { bridge, frame } = makeBridge()
    const pending = bridge.switchToBlocks()
    const id = frame.posted.at(-1)!.message.id
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'switchblocks',
        id,
        frameId: bridge.frameId,
        success: false,
      }),
    )
    await expect(pending).resolves.toBe(false)
  })
})

/**
 * The capture fence (LOCAL-BUILD-001 repair #2).
 *
 * The verified stock order for one `saveproject` is: several full
 * `workspacesave` events for the current header, then the matching
 * `success: true` reply carrying NO project body. The first draft resolved on
 * the first broadly-accepted event received after a `Date.now()` reading, which
 * can accept an older delayed autosave and whose single waiter could be
 * overwritten by an interleaved request.
 *
 * So: collect every valid payload, resolve on the MATCHING ACK with the last
 * one collected, and serialize captures.
 *
 * POSITIVE CONTROLS are named per case.
 */
describe('a capture resolves on its own acknowledgment, not on an event', () => {
  function readyBridge(now: () => number = () => 100) {
    const frame = fakeFrame()
    const rejected: RejectedMessage[] = []
    const bridge = new ArcadeBridge({
      projectName: BUILD_STUDIO_PROJECT_NAME,
      isScopeLive: () => true,
      newId: nextId,
      now,
      onRejected: (r) => rejected.push(r),
    })
    bridge.attach(frame.element)
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspaceloaded',
        id: 'l',
        frameId: bridge.frameId,
      }),
    )
    frame.posted.length = 0
    return { bridge, frame, rejected }
  }

  const save = (
    bridge: ArcadeBridge,
    frame: ReturnType<typeof fakeFrame>,
    mainTs: string,
  ) =>
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject({ text: { 'main.ts': mainTs } }),
      }),
    )

  const ack = (
    bridge: ArcadeBridge,
    frame: ReturnType<typeof fakeFrame>,
    id: unknown,
    extra: Record<string, unknown> = {},
  ) =>
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'saveproject',
        id,
        frameId: bridge.frameId,
        success: true,
        ...extra,
      }),
    )

  it('does NOT resolve on the first event — it waits for the reply', async () => {
    // POSITIVE CONTROL: resolve the capture from `handleHostAction` and this
    // case passes early, which is the defect.
    const { bridge, frame } = readyBridge()
    const pending = bridge.requestSnapshot()
    expect(frame.posted.at(-1)!.message).toMatchObject({ action: 'saveproject' })
    save(bridge, frame, 'info.setLife(3)')
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    ack(bridge, frame, frame.posted.at(-1)!.message.id)
    await expect(pending).resolves.toMatchObject({
      files: { 'main.ts': 'info.setLife(3)' },
    })
  })

  it('takes the LAST payload before the acknowledgment, not the first', async () => {
    // Three full events then the ACK is the exact observed stock sequence.
    const { bridge, frame } = readyBridge()
    const pending = bridge.requestSnapshot()
    const id = frame.posted.at(-1)!.message.id
    save(bridge, frame, 'info.setLife(1)')
    save(bridge, frame, 'info.setLife(2)')
    save(bridge, frame, 'info.setLife(4)')
    ack(bridge, frame, id)
    const result = await pending
    expect(result.files['main.ts']).toBe('info.setLife(4)')
  })

  it('reads the reply’s own project when a version ever sends one', async () => {
    const { bridge, frame } = readyBridge()
    const pending = bridge.requestSnapshot()
    const id = frame.posted.at(-1)!.message.id
    ack(bridge, frame, id, {
      project: ourProject({ text: { 'main.ts': 'info.setLife(5)' } }),
    })
    const result = await pending
    expect(result.files['main.ts']).toBe('info.setLife(5)')
  })

  it('REFUSES an acknowledgment with no payload collected at all', async () => {
    // Never a fallback to whatever the frame last volunteered — that is the
    // stale-source failure in another costume.
    const { bridge, frame } = readyBridge()
    const pending = bridge.requestSnapshot()
    ack(bridge, frame, frame.posted.at(-1)!.message.id)
    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
    })
  })

  it('ignores a payload that arrives AFTER the acknowledgment', async () => {
    const { bridge, frame } = readyBridge()
    const first = bridge.requestSnapshot()
    const id = frame.posted.at(-1)!.message.id
    save(bridge, frame, 'info.setLife(3)')
    ack(bridge, frame, id)
    await expect(first).resolves.toMatchObject({
      files: { 'main.ts': 'info.setLife(3)' },
    })
    // A later autosave is recorded as an editor save and belongs to no capture.
    save(bridge, frame, 'info.setLife(9)')
    expect(bridge.isCapturing()).toBe(false)
    expect(bridge.editorSaveSeen()?.files['main.ts']).toBe('info.setLife(9)')
  })

  it('refuses a SECOND capture while one is in flight', async () => {
    // Serialized, never queued — one waiter cannot be overwritten by another.
    const { bridge, frame } = readyBridge()
    const first = bridge.requestSnapshot()
    expect(bridge.isCapturing()).toBe(true)
    await expect(bridge.requestSnapshot()).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.Busy,
    })
    const id = frame.posted.at(-1)!.message.id
    save(bridge, frame, 'info.setLife(3)')
    ack(bridge, frame, id)
    await first
    // ...and the lane is free again.
    expect(bridge.isCapturing()).toBe(false)
  })

  it('refuses an acknowledgment for a DIFFERENT action', async () => {
    const { bridge, frame } = readyBridge()
    const pending = bridge.requestSnapshot()
    const id = frame.posted.at(-1)!.message.id
    save(bridge, frame, 'info.setLife(3)')
    // A reply whose id is not this request's resolves nothing.
    ack(bridge, frame, 'some-other-id')
    let settled = false
    void pending.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await Promise.resolve()
    expect(settled).toBe(false)
    ack(bridge, frame, id)
    await expect(pending).resolves.toBeTruthy()
  })

  it('collects no payload from a FOREIGN project during a capture', async () => {
    const { bridge, frame } = readyBridge()
    const pending = bridge.requestSnapshot()
    const id = frame.posted.at(-1)!.message.id
    // An auto-created Untitled project saving mid-capture.
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject({ header: { name: 'Untitled' } }),
      }),
    )
    ack(bridge, frame, id)
    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
    })
  })

  it('refuses when the scope retired before the acknowledgment', async () => {
    let live = true
    const frame = fakeFrame()
    const bridge = new ArcadeBridge({
      projectName: BUILD_STUDIO_PROJECT_NAME,
      isScopeLive: () => live,
      newId: nextId,
      now: () => 1,
    })
    bridge.attach(frame.element)
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspaceloaded',
        id: 'l',
        frameId: bridge.frameId,
      }),
    )
    frame.posted.length = 0
    const pending = bridge.requestSnapshot()
    const id = frame.posted.at(-1)!.message.id
    save(bridge, frame, 'info.setLife(3)')
    live = false
    ack(bridge, frame, id)
    await expect(pending).rejects.toMatchObject({ kind: ArcadeBridgeFailure.Stale })
  })

  it('refuses the editor’s own failure reply', async () => {
    const { bridge, frame } = readyBridge()
    const pending = bridge.requestSnapshot()
    const id = frame.posted.at(-1)!.message.id
    save(bridge, frame, 'info.setLife(3)')
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'saveproject',
        id,
        frameId: bridge.frameId,
        success: false,
      }),
    )
    await expect(pending).rejects.toMatchObject({ kind: ArcadeBridgeFailure.Refused })
    expect(bridge.isCapturing()).toBe(false)
  })

  it('frees the capture lane when disposed mid-flight', async () => {
    const { bridge } = readyBridge()
    const pending = bridge.requestSnapshot()
    bridge.dispose()
    await expect(pending).rejects.toBeInstanceOf(ArcadeBridgeError)
    expect(bridge.isCapturing()).toBe(false)
  })
})

describe('the frame is frozen while a capture runs', () => {
  it('turns pointer events off and back on', async () => {
    const style: Record<string, string> = {}
    const posted: Array<Record<string, unknown>> = []
    const contentWindow = {
      postMessage: (m: Record<string, unknown>) => posted.push(m),
    }
    let blurred = 0
    const element = {
      contentWindow,
      style,
      blur: () => {
        blurred += 1
      },
      ownerDocument: { get activeElement() { return element } },
    } as unknown as HTMLIFrameElement
    const frameLike = { contentWindow, posted, element }

    const bridge = new ArcadeBridge({
      projectName: BUILD_STUDIO_PROJECT_NAME,
      isScopeLive: () => true,
      newId: nextId,
      now: () => 1,
    })
    bridge.attach(element)
    bridge.handleMessage(
      event(frameLike as never, {
        type: 'pxthost',
        action: 'workspaceloaded',
        id: 'l',
        frameId: bridge.frameId,
      }),
    )
    const pending = bridge.requestSnapshot()
    // A keystroke reaches a FOCUSED iframe with no pointer event, so focus is
    // moved out as well as pointer events disabled.
    expect(style.pointerEvents).toBe('none')
    expect(blurred).toBe(1)

    const id = posted.at(-1)!.id
    bridge.handleMessage(
      event(frameLike as never, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject(),
      }),
    )
    bridge.handleMessage(
      event(frameLike as never, {
        type: 'pxteditor',
        action: 'saveproject',
        id,
        frameId: bridge.frameId,
        success: true,
      }),
    )
    await pending
    expect(style.pointerEvents).toBe('')
  })
})

describe('disposal answers every pending request', () => {
  it('rejects instead of leaving a promise that can never settle', async () => {
    const { bridge, frame } = makeBridge()
    const pending = bridge.importProject({ 'pxt.json': '{}', 'main.ts': 'x' })
    expect(frame.posted).toHaveLength(1)
    bridge.dispose()
    await expect(pending).rejects.toBeInstanceOf(ArcadeBridgeError)
  })

  it('reads nothing after disposal', () => {
    const { bridge, frame } = makeBridge()
    bridge.dispose()
    bridge.handleMessage(
      event(frame, { type: 'pxthost', action: 'workspaceloaded', frameId: bridge.frameId }),
    )
    expect(bridge.isLoaded()).toBe(false)
  })
})

describe('readProjectFiles is strict about shape', () => {
  it.each([
    ['no text', { header: { id: 'a' } }],
    ['an empty map', { header: { id: 'a' }, text: {} }],
    ['no manifest', { header: { id: 'a' }, text: { 'main.ts': 'x' } }],
    ['a non-string file', { header: { id: 'a' }, text: { 'pxt.json': '{}', 'main.ts': 1 } }],
  ])('refuses %s', (_label, project) => {
    expect(readProjectFiles(project as never)).toBeNull()
  })

  it('accepts a project with a manifest and text files', () => {
    expect(readProjectFiles(ourProject() as never)).toMatchObject({
      'main.ts': 'info.setLife(3)',
    })
  })
})

describe('nothing here can publish', () => {
  it('names no share or publish action anywhere in the module', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(__dirname, 'arcadeBridge.ts'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/'(?:share|publishproject|sharepage|publish)'/)
    // And the one place a published project could arrive is refused.
    expect(code).toContain('header.pubId')
  })
})

/**
 * Runtime metadata comes from the editor's own `info` reply.
 *
 * The imported project's `header.targetVersion` is a placeholder — stock
 * 4.1.28 reports `0.0.0` on it — so reading it as the runtime produced a banner
 * telling a child his editor was the wrong version. The same runtime's `info`
 * reply says `target: '4.1.28'`, `pxt: '13.1.25'`.
 *
 * POSITIVE CONTROL: have `acceptProject` set `runtime` from the header and the
 * first case here fails.
 */
describe('the runtime is read from `info`, never inferred', () => {
  it('is unknown until the reply lands', () => {
    const { bridge, frame } = makeBridge()
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        // The placeholder the real editor sends.
        project: ourProject({ header: { targetVersion: '0.0.0' } }),
      }),
    )
    // The project was ACCEPTED, and told us nothing about the runtime.
    expect(bridge.editorSaveSeen()).not.toBeNull()
    expect(bridge.runtimeVersions()).toBeNull()
  })

  it('reads target and pxt out of the reply’s `resp.versions`', async () => {
    const { bridge, frame } = makeBridge()
    const pending = bridge.requestInfo()
    expect(frame.posted.at(-1)!.message).toMatchObject({ action: 'info' })
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'info',
        id: frame.posted.at(-1)!.message.id,
        frameId: bridge.frameId,
        success: true,
        resp: {
          versions: { target: '4.1.28', pxt: '13.1.25', tag: 'v4.1.28' },
          locale: 'en',
        },
      }),
    )
    await expect(pending).resolves.toEqual({
      target: '4.1.28',
      pxt: '13.1.25',
      tag: 'v4.1.28',
    })
    expect(bridge.runtimeVersions()?.target).toBe('4.1.28')
  })

  it('stays unknown when the reply fails, and does not throw', async () => {
    const { bridge, frame } = makeBridge()
    const pending = bridge.requestInfo()
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'info',
        id: frame.posted.at(-1)!.message.id,
        frameId: bridge.frameId,
        success: false,
      }),
    )
    await expect(pending).resolves.toBeNull()
    expect(bridge.runtimeVersions()).toBeNull()
  })

  it('stays unknown when the reply carries no versions', async () => {
    const { bridge, frame } = makeBridge()
    const pending = bridge.requestInfo()
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'info',
        id: frame.posted.at(-1)!.message.id,
        frameId: bridge.frameId,
        success: true,
        resp: { locale: 'en' },
      }),
    )
    await expect(pending).resolves.toBeNull()
  })

  it('does not record a late reply for a retired scope', async () => {
    let live = true
    const frame = fakeFrame()
    const bridge = new ArcadeBridge({
      projectName: BUILD_STUDIO_PROJECT_NAME,
      isScopeLive: () => live,
      newId: nextId,
      now: () => 1,
    })
    bridge.attach(frame.element)
    const pending = bridge.requestInfo()
    live = false
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'info',
        id: frame.posted.at(-1)!.message.id,
        frameId: bridge.frameId,
        success: true,
        resp: { versions: { target: '4.1.28' } },
      }),
    )
    await expect(pending).resolves.toBeNull()
    expect(bridge.runtimeVersions()).toBeNull()
  })
})

/**
 * Play and Edit are the two MEASURED stock presentation modes.
 * `startsimulator` alone leaves a 96 × 85 preview in a 688 × 576 frame;
 * `setsimulatorfullscreen` with `enabled: true` gives 656 × 392 plus the touch
 * controls, and `false` returns to Blocks.
 */
describe('Play and Edit use the verified stock actions', () => {
  function answerAll(bridge: ArcadeBridge, frame: ReturnType<typeof fakeFrame>) {
    for (const posted of [...frame.posted]) {
      const msg = posted.message
      if (msg.type !== 'pxteditor') continue
      bridge.handleMessage(
        event(frame, {
          type: 'pxteditor',
          action: msg.action,
          id: msg.id,
          frameId: bridge.frameId,
          success: true,
        }),
      )
    }
  }

  /** Answer whatever is outstanding, repeatedly, until the chain settles. */
  async function drive(bridge: ArcadeBridge, frame: ReturnType<typeof fakeFrame>) {
    for (let i = 0; i < 6; i += 1) {
      answerAll(bridge, frame)
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  it('starts the simulator AND expands it', async () => {
    const { bridge, frame } = makeBridge()
    const pending = bridge.playFullscreen()
    // The first request goes out before the second is dispatched.
    expect(frame.posted.at(-1)!.message).toMatchObject({ action: 'startsimulator' })
    await drive(bridge, frame)
    await expect(pending).resolves.toBe(true)
    const actions = frame.posted.map((p) => p.message.action)
    expect(actions).toContain('startsimulator')
    const expand = frame.posted.find(
      (p) => p.message.action === 'setsimulatorfullscreen',
    )
    expect(expand, 'never asked for the full-size simulator').toBeTruthy()
    expect(expand!.message.enabled).toBe(true)
  })

  it('leaves play with enabled:false and shows Blocks', async () => {
    const { bridge, frame } = makeBridge()
    const pending = bridge.backToBlocks()
    expect(frame.posted.at(-1)!.message).toMatchObject({
      action: 'setsimulatorfullscreen',
      enabled: false,
    })
    await drive(bridge, frame)
    await pending
    expect(frame.posted.map((p) => p.message.action)).toContain('switchblocks')
  })

  it('invents no simulator action beyond the measured three', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const code = readFileSync(resolve(__dirname, 'arcadeBridge.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    // Every editor action this module can send, read off the three methods
    // that can send one. A fabricated `savepng` or `exportproject` would show
    // up here as a sixth name.
    const actions = [
      ...code.matchAll(/this\.(?:request|requestWithId|tolerant)\([^)]*?'([a-z]+)'/g),
    ].map((m) => m[1])
    expect([...new Set(actions)].sort()).toEqual([
      'importproject',
      'info',
      'saveproject',
      'setsimulatorfullscreen',
      'startsimulator',
      'switchblocks',
    ])
  })
})

/**
 * Counts and UTF-8 byte caps are enforced before a payload is accepted as
 * bridge state — not only before a Firestore write. An oversized project
 * accepted in memory and offered to Save would be refused after the child was
 * told it was being saved.
 *
 * An oversized payload is therefore never an EDITOR SAVE and never a save
 * candidate, which is what every case below pins. What it may be is a download,
 * and the block after this one is where that is checked.
 */
describe('an oversized payload is never held as a save', () => {
  it('refuses a project over the per-file byte cap', () => {
    const { bridge, frame, rejected } = makeBridge()
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject({ text: { 'main.ts': '界'.repeat(150_000) } }),
      }),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['payload-too-big'])
    expect(bridge.editorSaveSeen()).toBeNull()
  })

  it('refuses a project over the whole-archive byte cap', () => {
    const { bridge, frame, rejected } = makeBridge()
    const big = 'a'.repeat(300_000)
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject({ text: { 'main.ts': big, 'b.ts': big, 'c.ts': big } }),
      }),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['payload-too-big'])
    expect(bridge.editorSaveSeen()).toBeNull()
  })

  it('refuses a project with too many files', () => {
    const { bridge, frame, rejected } = makeBridge()
    // A COMPLETE project — manifest and program — so the only thing wrong with
    // it is the count, and the refusal this asserts is the count's.
    const text: Record<string, string> = { 'pxt.json': '{}', 'main.ts': 'info.setLife(3)' }
    for (let i = 0; i < 40; i += 1) text[`f${i}.ts`] = 'x'
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: { header: ourProject().header, text },
      }),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['payload-too-big'])
  })

  it('accepts an ordinary project, including a multibyte asset', () => {
    const { bridge, frame, rejected } = makeBridge()
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject({ text: { 'notes.txt': '界 🎮 café' } }),
      }),
    )
    expect(rejected).toEqual([])
    expect(bridge.editorSaveSeen()?.files['notes.txt']).toBe('界 🎮 café')
  })

  it('reads the same caps the writer does', () => {
    expect(payloadWithinCaps({ 'pxt.json': '{}', 'main.ts': 'x' })).toBe(true)
    expect(payloadWithinCaps({})).toBe(false)
    expect(
      payloadWithinCaps({ 'pxt.json': '{}', 'main.ts': '界'.repeat(150_000) }),
    ).toBe(false)
  })
})

/**
 * Admission is measured over the ARCHIVE, not the sum of the file contents.
 *
 * The witnessed hole: a payload whose contents summed to 600,002 bytes
 * serialized to an 800,060-byte archive — admitted here, refused by the
 * 700,000-byte writer, and written out as a "recovery" file the app's own reader
 * will not open. Each case ties the bridge's answer to the real serializer's
 * bytes and the real reader's refusal rather than to a copy of the arithmetic.
 *
 * POSITIVE CONTROL for the whole block: size the archive cap against
 * `totalBytes` again in `readPayloadCaps` and the first three cases fail.
 */
describe('admission is the archive this app would store', () => {
  /**
   * The witnessed payload: 600,002 bytes of contents, an 800,060-byte archive.
   * Half of each big file is `"`, which JSON escapes to `\"`. The count is 3 and
   * the largest file is 299,991 bytes, so the ARCHIVE cap is the only one in
   * play.
   */
  const escapeBomb = (): BuildStudioSourceFiles => ({
    'pxt.json': '{"files":["main.ts"]}',
    'main.ts': `${'"'.repeat(100_001)}${'m'.repeat(199_989)}`,
    'a.ts': `${'"'.repeat(100_002)}${'a'.repeat(199_989)}`,
  })

  it('refuses the raw-600,002 / canonical-800,060 payload the reviewer found', () => {
    const files = escapeBomb()
    const reading = readPayloadCaps(files)
    // The number the bridge USED to read, which is comfortably inside the cap…
    expect(reading.totalBytes).toBe(600_002)
    expect(reading.totalBytes).toBeLessThan(BUILD_STUDIO_MAX_ARCHIVE_BYTES)
    // …and the archive that would actually be stored, which is not. Asserted
    // against the serializer itself, so this cannot drift from the real format.
    expect(reading.archiveBytes).toBe(800_060)
    expect(reading.archiveBytes).toBe(utf8ByteLength(serializeBuildStudioSource(files)))
    // Nothing else is wrong with it: the count and every single file fit.
    expect(reading.fileCount).toBe(3)
    expect(reading.largestFileBytes).toBeLessThanOrEqual(BUILD_STUDIO_MAX_FILE_BYTES)
    expect(reading.withinCaps).toBe(false)
    // And it is not a recovery copy either, because the file it would write is
    // one this app refuses to open.
    expect(reading.overFileCapOnly).toBe(false)
    expect(() => readRecoveryArchive(serializeBuildStudioSource(files))).toThrow(
      RecoveryRefused,
    )
  })

  it('refuses it at the bridge, and keeps no bytes to hand back', () => {
    const { bridge, frame, rejected } = makeBridge()
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: { header: ourProject().header, text: escapeBomb() },
      }),
    )
    expect(rejected.map((r) => r.reason)).toEqual(['payload-too-big'])
    // Not a save…
    expect(bridge.editorSaveSeen()).toBeNull()
    // …and the FACT without the bytes, so the page refuses a current download
    // out loud instead of writing an unreadable one.
    expect(bridge.sourceOverCaps()).toBe(true)
    expect(bridge.oversizedSourceForDownload()).toBeNull()
  })

  /**
   * An escaping-heavy project sized to an exact archive length.
   *
   * Sized BY the real serializer rather than by a formula: the padding file is
   * plain ASCII, where one more character is one more archive byte, and the
   * cases below check the result against `serializeBuildStudioSource` instead of
   * trusting the sum. Everything else in it is deliberately awkward — quotes,
   * backslashes, tabs, newlines, a three-byte character, a four-byte emoji, an
   * editor-private journal and the simulator's scratch file.
   */
  const privateJournal = `${'h'.repeat(500_000)}"`
  function boundaryFiles(archiveBytes: number): BuildStudioSourceFiles {
    const base: Record<string, string> = {
      'pxt.json': JSON.stringify({
        name: 'Apple "Dash"',
        files: ['main.ts', 'main.blocks', 'a.ts', 'b.ts'],
      }),
      'main.ts': '// "界" \\ \there\nlet s = "🎮\\n"\n'.repeat(400),
      'main.blocks': '<block type="x" field="\\"界\\"">\n</block>\n'.repeat(1_000),
      '.simstate.json': '{"S/#run":"1","S/#scope":"a"}',
      // Editor-private, so the canonical archive leaves it out. A 500 KB undo
      // journal may not decide whether the child's game fits.
      _history: privateJournal,
      'a.ts': 'a'.repeat(250_000),
      'b.ts': '',
    }
    const short = archiveBytes - utf8ByteLength(serializeBuildStudioSource(base))
    return { ...base, 'b.ts': 'b'.repeat(short) }
  }

  /**
   * Typed as a tuple list rather than left to inference: a heterogeneous inline
   * array infers `(string | number)[]`, which would make the size a
   * `string | number` the helper cannot take.
   */
  const boundaryCases: Array<[string, number]> = [
    ['just under', BUILD_STUDIO_MAX_ARCHIVE_BYTES - 1],
    ['exactly at', BUILD_STUDIO_MAX_ARCHIVE_BYTES],
  ]

  it.each(boundaryCases)(
    'accepts an escaping-heavy project %s the boundary, and reads it back byte-identically',
    (_label, target) => {
      const files = boundaryFiles(target)
      const archive = serializeBuildStudioSource(files)
      expect(utf8ByteLength(archive)).toBe(target)

      const reading = readPayloadCaps(files)
      expect(reading.archiveBytes).toBe(target)
      expect(reading.withinCaps).toBe(true)
      // The boundary under test is the ARCHIVE's: no file is near its own cap,
      // so a per-file refusal cannot be what this case is reading.
      expect(reading.largestFileBytes).toBeLessThanOrEqual(BUILD_STUDIO_MAX_FILE_BYTES)
      // The private journal is outside the archive, so it is not what fits.
      expect(archive).not.toContain('_history')
      expect(utf8ByteLength(privateJournal)).toBeGreaterThan(BUILD_STUDIO_MAX_FILE_BYTES)

      // The recovery really is one: this app opens its own file, and
      // re-serializing what it read reproduces the same bytes exactly —
      // escaping, file names, whitespace, unicode and all.
      const read = readRecoveryArchive(archive)
      expect(serializeBuildStudioSource(read)).toBe(archive)
      expect(read['main.ts']).toBe(files['main.ts'])
      expect(read['main.blocks']).toBe(files['main.blocks'])
      expect(read['.simstate.json']).toBe(files['.simstate.json'])
      expect(read['main.ts']).toContain('界')
      expect(read['main.ts']).toContain('🎮')
      expect(read['_history']).toBeUndefined()
    },
  )

  it('refuses the same project one byte past the boundary', () => {
    const files = boundaryFiles(BUILD_STUDIO_MAX_ARCHIVE_BYTES + 1)
    const archive = serializeBuildStudioSource(files)
    expect(utf8ByteLength(archive)).toBe(700_001)
    const reading = readPayloadCaps(files)
    expect(reading.withinCaps).toBe(false)
    // Not a download copy either, for the reason the reader gives next.
    expect(reading.overFileCapOnly).toBe(false)
    expect(reading.largestFileBytes).toBeLessThanOrEqual(BUILD_STUDIO_MAX_FILE_BYTES)
    expect(() => readRecoveryArchive(archive)).toThrow(RecoveryRefused)
  })

  /**
   * The per-file-only case is unchanged, and now PROVABLY recoverable.
   *
   * `overFileCapOnly` is the page's licence to hand bytes back, so what it must
   * guarantee is that the file written is one this app can open again. Measuring
   * the archive is what makes that true rather than hoped for.
   */
  it('still holds a per-file-only oversize, and that copy really imports', () => {
    const files: BuildStudioSourceFiles = {
      'pxt.json': '{"files":["main.ts","main.blocks"]}',
      'main.ts': 'info.setLife(9)',
      'main.blocks': `<xml>${'b'.repeat(400_001)}</xml>`,
    }
    const reading = readPayloadCaps(files)
    expect(reading.withinCaps).toBe(false)
    expect(reading.largestFileBytes).toBeGreaterThan(BUILD_STUDIO_MAX_FILE_BYTES)
    expect(reading.overFileCapOnly).toBe(true)
    expect(reading.archiveBytes).toBeLessThanOrEqual(BUILD_STUDIO_MAX_ARCHIVE_BYTES)

    const read = readRecoveryArchive(serializeBuildStudioSource(files))
    expect(read['main.blocks']).toBe(files['main.blocks'])
    expect(read['main.ts']).toBe('info.setLife(9)')
  })

  it('counts a unicode payload in bytes, in the archive too', () => {
    // 240,000 CHARACTERS, which a character cap would wave through, and 720,002
    // bytes. JSON does not escape these, so the archive is the contents plus
    // the structure and nothing more — but it is still bytes, and still over.
    const files: BuildStudioSourceFiles = {
      'pxt.json': '{}',
      'main.ts': '界'.repeat(120_000),
      'a.ts': '界'.repeat(120_000),
    }
    const reading = readPayloadCaps(files)
    expect(reading.totalBytes).toBe(720_002)
    expect(reading.archiveBytes).toBe(utf8ByteLength(serializeBuildStudioSource(files)))
    expect(reading.archiveBytes).toBeGreaterThan(reading.totalBytes)
    // Every single file fits, so the archive cap is what refuses it.
    expect(reading.largestFileBytes).toBeLessThanOrEqual(BUILD_STUDIO_MAX_FILE_BYTES)
    expect(reading.withinCaps).toBe(false)
    expect(reading.overFileCapOnly).toBe(false)
  })
})

/**
 * A project missing a required file is neither a save nor a recovery copy, and
 * it is the NEWEST reading of the current source.
 *
 * Two witnessed holes. A same-header `pxt.json` + `main.blocks` map with no
 * `main.ts` was accepted, saved and exported as a recovery archive the app's own
 * reader refuses. And an incomplete map arriving after an over-cap one left the
 * over-cap bytes standing as "current", so *Download a copy* exported a
 * superseded game.
 *
 * So an own, readable, incomplete map is refused AND invalidates what the
 * running capture holds — the conservative answer, "this page does not know what
 * is in the editor", never "here is something older". Foreign, published and
 * non-map traffic still only gets ignored.
 *
 * POSITIVE CONTROLS are named per case.
 */
describe('a project missing a required file is refused', () => {
  const noMainTs = () => ({
    'pxt.json': '{"files":["main.blocks"]}',
    'main.blocks': '<xml/>',
  })
  /** The other half of the pair: a program with no manifest. */
  const noPxtJson = () => ({ 'main.ts': 'info.setLife(3)', 'main.blocks': '<xml/>' })

  function readyBridge() {
    const made = makeBridge()
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxthost',
        action: 'workspaceloaded',
        id: 'l',
        frameId: made.bridge.frameId,
      }),
    )
    made.frame.posted.length = 0
    return made
  }

  function announce(
    made: ReturnType<typeof readyBridge>,
    text: Record<string, unknown>,
    header: Record<string, unknown> = {},
  ) {
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: made.bridge.frameId,
        project: { header: { ...ourProject().header, ...header }, text },
      }),
    )
  }

  /** The ACK, optionally carrying a project body of its own. */
  function ack(made: ReturnType<typeof readyBridge>, id: unknown, project?: unknown) {
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxteditor',
        action: 'saveproject',
        id,
        frameId: made.bridge.frameId,
        success: true,
        ...(project ? { project } : {}),
      }),
    )
  }

  it('reads the same required pair the writer and the reader do', () => {
    expect(projectShapeComplete({ 'pxt.json': '{}', 'main.ts': 'x' })).toBe(true)
    expect(projectShapeComplete(noMainTs())).toBe(false)
    expect(projectShapeComplete(noPxtJson())).toBe(false)
    // Blank is absent: whitespace-only text is not a manifest and not a program.
    expect(projectShapeComplete({ 'pxt.json': '{}', 'main.ts': '   \n' })).toBe(false)
    expect(projectShapeComplete({ 'pxt.json': '  ', 'main.ts': 'x' })).toBe(false)
  })

  /** Typed as tuples so the map is a file map and not a `string | …` union. */
  const incompleteCases: Array<[string, Record<string, string>]> = [
    ['no main.ts', noMainTs()],
    ['no pxt.json', noPxtJson()],
    ['a blank main.ts', { 'pxt.json': '{}', 'main.ts': '   ' }],
    ['a blank pxt.json', { 'pxt.json': ' \n ', 'main.ts': 'info.setLife(3)' }],
  ]

  it.each(incompleteCases)(
    'refuses a same-header map with %s, as its own reason',
    (_label, text) => {
      const made = readyBridge()
      announce(made, text)
      // Not foreign — it is ours — and not too big. It is incomplete.
      expect(made.rejected.map((r) => r.reason)).toEqual(['incomplete-project'])
      expect(made.bridge.editorSaveSeen()).toBeNull()
      // And it is not offered as a recoverable copy either.
      expect(made.bridge.sourceOverCaps()).toBe(false)
      expect(made.bridge.oversizedSourceForDownload()).toBeNull()
    },
  )

  it('refuses what the recovery reader itself refuses', () => {
    // The reason the bridge may not offer these as a copy: the archive each one
    // would write is a file this app will not open again.
    for (const text of [noMainTs(), noPxtJson()]) {
      expect(() => readRecoveryArchive(serializeBuildStudioSource(text))).toThrow(
        RecoveryRefused,
      )
    }
  })

  it('never keeps an incomplete project for a download, however it is sized', () => {
    const made = readyBridge()
    announce(made, { ...noMainTs(), 'main.blocks': 'b'.repeat(400_001) })
    expect(made.rejected.map((r) => r.reason)).toEqual(['incomplete-project'])
    expect(made.bridge.sourceOverCaps()).toBe(false)
    expect(made.bridge.oversizedSourceForDownload()).toBeNull()
  })

  /**
   * POSITIVE CONTROL: drop `this.capture.latest = null` from `refuseIncomplete`
   * and this case resolves with the superseded four-life source, which is the
   * witnessed defect.
   */
  it('refuses a capture whose last reading of ours was incomplete', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = made.frame.posted.at(-1)!.message.id
    announce(made, ourProject({ text: { 'main.ts': 'info.setLife(4)' } }).text)
    announce(made, noMainTs())
    ack(made, id)
    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
      // Not a size failure, so not the size sentence and not the size stamp.
      message: expect.stringContaining('try Save again'),
      tooBig: false,
    })
    expect(made.rejected.map((r) => r.reason)).toEqual(['incomplete-project'])
  })

  it('refuses when the incomplete map is the ACK’s own body', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = made.frame.posted.at(-1)!.message.id
    announce(made, ourProject({ text: { 'main.ts': 'info.setLife(4)' } }).text)
    ack(made, id, { header: ourProject().header, text: noPxtJson() })
    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
      tooBig: false,
    })
    expect(made.rejected.map((r) => r.reason)).toEqual(['incomplete-project'])
  })

  /**
   * POSITIVE CONTROL: leave `refusedTooBig` and `overCaps` alone in
   * `refuseIncomplete` and this case reports the size refusal and exports the
   * superseded over-cap bytes as the current game.
   */
  it('drops the over-cap bytes, and the size stamp, when a newer reading is incomplete', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = made.frame.posted.at(-1)!.message.id
    // Over the per-file cap only, so the bytes are held for a download…
    announce(made, {
      ...ourProject({ text: { 'main.ts': 'info.setLife(4)' } }).text,
      'main.blocks': 'b'.repeat(400_001),
    })
    expect(made.bridge.sourceOverCaps()).toBe(true)
    expect(made.bridge.oversizedSourceForDownload()).not.toBeNull()
    // …and then a newer reading of ours says the source is not a project at all.
    announce(made, noPxtJson())
    expect(made.bridge.sourceOverCaps()).toBe(false)
    expect(made.bridge.oversizedSourceForDownload()).toBeNull()
    ack(made, id)
    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
      tooBig: false,
    })
    expect(made.rejected.map((r) => r.reason)).toEqual([
      'payload-too-big',
      'incomplete-project',
    ])
  })

  /**
   * And a later VALID payload still recovers — the refusal is about the newest
   * reading, not a latch.
   *
   * POSITIVE CONTROL: this is also the stock positive control for the whole
   * block — an ordinary complete save, whatever came before it, succeeds.
   */
  it('lets a later complete payload recover the same capture', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = made.frame.posted.at(-1)!.message.id
    announce(made, noMainTs())
    announce(made, ourProject({ text: { 'main.ts': 'info.setLife(5)' } }).text)
    ack(made, id)
    const captured = await pending
    expect(captured.files['main.ts']).toBe('info.setLife(5)')
    expect(made.bridge.editorSaveSeen()?.files['main.ts']).toBe('info.setLife(5)')
  })

  /**
   * Not all bad traffic invalidates. A map that is not OURS, or not a map of
   * text at all, says nothing about the child's source — so a capture that has
   * collected a valid payload still answers with it.
   *
   * POSITIVE CONTROL: route the foreign and non-string refusals through
   * `refuseIncomplete` and this case fails the save it should have made.
   */
  it('still answers a capture after foreign or malformed traffic', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = made.frame.posted.at(-1)!.message.id
    announce(made, ourProject({ text: { 'main.ts': 'info.setLife(6)' } }).text)
    // A different project in the same frame…
    announce(made, noMainTs(), { id: 'header-2' })
    // …and a map whose values are not all text.
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: made.bridge.frameId,
        project: { header: ourProject().header, text: { 'pxt.json': '{}', 'main.ts': 7 } },
      }),
    )
    ack(made, id)
    const captured = await pending
    expect(captured.files['main.ts']).toBe('info.setLife(6)')
    expect(made.rejected.map((r) => r.reason)).toEqual([
      'foreign-project',
      'foreign-project',
    ])
  })
})

/**
 * A game that is too big to SAVE is still the child's current game
 * (PR #1974 round 1).
 *
 * The reported hole: an edited `main.blocks` over the per-file cap was refused
 * in silence, so `editorSaveSeen()` went on answering with the last project
 * that fitted — and the page's *Download a copy* handed over that OLDER game
 * with nothing to say it was older. The bridge now answers two separate
 * questions: is the newest source over the caps (`sourceOverCaps`), and are
 * those bytes bounded enough to hand back for a download
 * (`oversizedSourceForDownload`). Neither is a save candidate, and the caps are
 * untouched.
 *
 * POSITIVE CONTROLS are named per case.
 */
describe('a source that is too big to save is not an older source', () => {
  /** A handshaken bridge, so captures are allowed. */
  function readyBridge() {
    const made = makeBridge()
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxthost',
        action: 'workspaceloaded',
        id: 'l',
        frameId: made.bridge.frameId,
      }),
    )
    made.frame.posted.length = 0
    return made
  }

  function announce(
    made: ReturnType<typeof readyBridge>,
    text: Record<string, unknown>,
    header: Record<string, unknown> = {},
  ) {
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: made.bridge.frameId,
        project: ourProject({ text, header }),
      }),
    )
  }

  /** Over the PER-FILE cap only: the whole map still fits the archive cap. */
  const overFileCapOnly = () => ({ 'main.blocks': 'b'.repeat(400_001) })
  /** Over the ARCHIVE cap: too big to hold at all. */
  const overArchiveCap = () => ({
    'main.blocks': 'b'.repeat(300_000),
    'a.ts': 'a'.repeat(300_000),
    'c.ts': 'c'.repeat(300_000),
  })

  it('reads WHICH cap a payload broke', () => {
    const ok = readPayloadCaps({ 'pxt.json': '{}', 'main.ts': 'x' })
    expect(ok.withinCaps).toBe(true)
    expect(ok.overFileCapOnly).toBe(false)
    expect(ok.fileCount).toBe(2)

    const perFile = readPayloadCaps({ 'pxt.json': '{}', 'main.blocks': 'b'.repeat(400_001) })
    expect(perFile.withinCaps).toBe(false)
    expect(perFile.overFileCapOnly).toBe(true)
    expect(perFile.largestFileBytes).toBe(400_001)

    const archive = readPayloadCaps({ 'pxt.json': '{}', ...overArchiveCap() })
    expect(archive.withinCaps).toBe(false)
    // Too big to hold, so never offered for a download either.
    expect(archive.overFileCapOnly).toBe(false)

    // And it is the same answer `payloadWithinCaps` gives, by construction.
    //
    // Typed as the real file-map type rather than left to inference: a
    // heterogeneous inline array infers a union whose keys are optional, which
    // is not a `Record<string, string>` — and the fix for that is the right
    // type here, never a cast that would let a non-string into the validator.
    const cases: BuildStudioSourceFiles[] = [
      { 'pxt.json': '{}', 'main.ts': 'x' },
      { 'pxt.json': '{}', 'main.blocks': 'b'.repeat(400_001) },
      { 'pxt.json': '{}', ...overArchiveCap() },
      {},
    ]
    for (const files of cases) {
      expect(payloadWithinCaps(files)).toBe(readPayloadCaps(files).withinCaps)
    }
  })

  /**
   * POSITIVE CONTROL: drop the `this.overCaps = …` assignment in
   * `acceptProject` and this case sees the older game offered as the current
   * one, which is the reported defect.
   */
  it('keeps the CURRENT over-cap source for a download, after an older accepted one', () => {
    const made = readyBridge()
    // An ordinary save first: this is the "older accepted game".
    announce(made, { 'main.ts': 'info.setLife(3)' })
    expect(made.bridge.editorSaveSeen()?.files['main.ts']).toBe('info.setLife(3)')
    expect(made.bridge.sourceOverCaps()).toBe(false)
    expect(made.bridge.oversizedSourceForDownload()).toBeNull()

    // Now he fills the blocks past the per-file cap.
    announce(made, { 'main.ts': 'info.setLife(9)', ...overFileCapOnly() })
    expect(made.rejected.map((r) => r.reason)).toEqual(['payload-too-big'])
    // NOT a save: the editor-save answer is still the older one, so nothing
    // oversized can be stored or treated as clean.
    expect(made.bridge.editorSaveSeen()?.files['main.ts']).toBe('info.setLife(3)')
    // But the current source is available, as itself, for a download.
    expect(made.bridge.sourceOverCaps()).toBe(true)
    const out = made.bridge.oversizedSourceForDownload()
    expect(out?.['main.ts']).toBe('info.setLife(9)')
    expect(out?.['main.blocks']).toHaveLength(400_001)
  })

  it('keeps the FACT and not the bytes when it is too big to hold', () => {
    const made = readyBridge()
    announce(made, { 'main.ts': 'info.setLife(3)' })
    announce(made, overArchiveCap())
    expect(made.bridge.sourceOverCaps()).toBe(true)
    // Nothing to hand back — and the older accepted source is still not it.
    expect(made.bridge.oversizedSourceForDownload()).toBeNull()
    expect(made.bridge.editorSaveSeen()?.files['main.ts']).toBe('info.setLife(3)')
  })

  it('stops being true the moment an acceptable project arrives', () => {
    const made = readyBridge()
    announce(made, overFileCapOnly())
    expect(made.bridge.sourceOverCaps()).toBe(true)
    // He deleted some of it again.
    announce(made, { 'main.ts': 'info.setLife(4)' })
    expect(made.bridge.sourceOverCaps()).toBe(false)
    expect(made.bridge.oversizedSourceForDownload()).toBeNull()
    expect(made.bridge.editorSaveSeen()?.files['main.ts']).toBe('info.setLife(4)')
  })

  /**
   * The identity checks come FIRST and are not relaxed by any of this: a
   * foreign, published or wrong-header project says nothing about the child's
   * own game, so it may not become the thing a download hands over.
   */
  it('never keeps a project that is not ours, however big it is', () => {
    for (const header of [{ name: 'Untitled' }, { pubId: 'pub-1' }, { id: '' }]) {
      const made = readyBridge()
      announce(made, overFileCapOnly(), header)
      expect(made.bridge.sourceOverCaps()).toBe(false)
      expect(made.bridge.oversizedSourceForDownload()).toBeNull()
      expect(made.rejected.map((r) => r.reason)).toEqual(['foreign-project'])
    }
  })

  it('refuses a SECOND, differently-headed project even when it is oversized', () => {
    const made = readyBridge()
    // Ours, so the header is pinned.
    announce(made, { 'main.ts': 'info.setLife(3)' })
    announce(made, overFileCapOnly(), { id: 'header-2' })
    expect(made.rejected.map((r) => r.reason)).toEqual(['foreign-project'])
    expect(made.bridge.sourceOverCaps()).toBe(false)
  })

  /**
   * POSITIVE CONTROL: remove `state.refusedTooBig` from the throw in
   * `requestSnapshot` and this case reports "try Save again" for a game that
   * will be refused identically every time.
   */
  it('says WHY a capture came back with nothing, when the reason is size', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = made.frame.posted.at(-1)!.message.id
    announce(made, overFileCapOnly())
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxteditor',
        action: 'saveproject',
        id,
        frameId: made.bridge.frameId,
        success: true,
      }),
    )
    // The KIND is unchanged — nothing was captured and nothing was stored —
    // and the failure carries the size answer for THIS capture, which is what
    // lets a download tell "the open game is too big" from "this capture
    // failed" without consulting a flag that may predate the tap (UX-498).
    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
      message: ARCADE_TOO_BIG_TO_SAVE,
      tooBig: true,
    })
    expect(ARCADE_TOO_BIG_TO_SAVE).not.toMatch(/Save again/)
  })

  /**
   * The same stamp, the other way round: an over-cap reading already taken does
   * not make the NEXT capture's failure a size failure.
   *
   * POSITIVE CONTROL: stamp the throw with `this.overCaps !== null` instead of
   * `state.refusedTooBig` and this case reports `tooBig: true` for a capture
   * that read nothing at all.
   */
  it('does not stamp a later empty capture with an EARLIER size refusal', async () => {
    const made = readyBridge()
    // An over-cap payload arrives outside any capture, so the flag stands.
    announce(made, overFileCapOnly())
    expect(made.bridge.sourceOverCaps()).toBe(true)
    // A fresh capture that collects nothing is not a size failure.
    const pending = made.bridge.requestSnapshot()
    const id = made.frame.posted.at(-1)!.message.id
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxteditor',
        action: 'saveproject',
        id,
        frameId: made.bridge.frameId,
        success: true,
      }),
    )
    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
      message: expect.stringContaining('try Save again'),
      tooBig: false,
    })
  })

  it('still says "try Save again" when nothing was handed over at all', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = made.frame.posted.at(-1)!.message.id
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxteditor',
        action: 'saveproject',
        id,
        frameId: made.bridge.frameId,
        success: true,
      }),
    )
    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
      message: expect.stringContaining('try Save again'),
    })
  })

  it('lets the download copy go with the visit, on dispose', () => {
    const made = readyBridge()
    announce(made, overFileCapOnly())
    expect(made.bridge.oversizedSourceForDownload()).not.toBeNull()
    made.bridge.dispose()
    expect(made.bridge.oversizedSourceForDownload()).toBeNull()
    expect(made.bridge.sourceOverCaps()).toBe(false)
  })
})

/**
 * MESSAGE ORDER: a refused-for-size payload invalidates what the capture had
 * already collected (PR #1974 round 2).
 *
 * The reported hole, reproduced locally by the reviewer: the editor announces a
 * valid three-life `workspacesave`, the child's next save is over the caps, and
 * the matching ACK then arrives. `acceptProject` recorded the refusal but left
 * `capture.latest` holding the OLDER payload, so `requestSnapshot` resolved
 * with three-life bytes while `oversizedSourceForDownload()` held the four-life
 * game actually in the editor — Save storing the wrong version, and a departure
 * check reading a stale source as "clean".
 *
 * These drive the real `postMessage` protocol in its real order: events, then
 * the matching reply. Nothing is stubbed but the frame.
 *
 * POSITIVE CONTROL for the whole block: drop `this.capture.latest = null` from
 * the cap refusal in `acceptProject` and every "refuses" case here resolves
 * with the older `info.setLife(3)` source instead, which is the defect.
 */
describe('a capture never answers with a version older than a refused one', () => {
  function readyBridge() {
    const made = makeBridge()
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxthost',
        action: 'workspaceloaded',
        id: 'l',
        frameId: made.bridge.frameId,
      }),
    )
    made.frame.posted.length = 0
    return made
  }

  /** One `workspacesave` event, as the provider posts them. */
  function announce(
    made: ReturnType<typeof readyBridge>,
    text: Record<string, unknown>,
    header: Record<string, unknown> = {},
  ) {
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: made.bridge.frameId,
        project: ourProject({ text, header }),
      }),
    )
  }

  /** The matching `saveproject` reply. Stock 4.1.28 carries no project body. */
  function ack(
    made: ReturnType<typeof readyBridge>,
    id: unknown,
    extra: Record<string, unknown> = {},
  ) {
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxteditor',
        action: 'saveproject',
        id,
        frameId: made.bridge.frameId,
        success: true,
        ...extra,
      }),
    )
  }

  const captureId = (made: ReturnType<typeof readyBridge>) =>
    made.frame.posted.at(-1)!.message.id

  /** Over the PER-FILE cap only — the whole map still fits the archive cap. */
  const overFileCap = (lives: number) => ({
    'main.ts': `info.setLife(${lives})`,
    'main.blocks': 'b'.repeat(400_001),
  })
  /** Over the TOTAL archive cap, with no single file over the per-file one. */
  const overTotalCap = (lives: number) => ({
    'main.ts': `info.setLife(${lives})`,
    'main.blocks': 'b'.repeat(300_000),
    'a.ts': 'a'.repeat(300_000),
    'c.ts': 'c'.repeat(300_000),
  })
  /** Over the FILE-COUNT cap: 24 is the most a project may carry. */
  const overFileCountCap = (lives: number) => {
    const text: Record<string, string> = { 'main.ts': `info.setLife(${lives})` }
    for (let i = 0; i < 30; i += 1) text[`f${i}.ts`] = 'x'
    return text
  }

  it('refuses the capture when the newer payload broke the PER-FILE cap', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = captureId(made)
    // The valid payload the stock provider posts first, and collects.
    announce(made, { 'main.ts': 'info.setLife(3)' })
    // Then the child's current, bigger game — ours, and refused.
    announce(made, overFileCap(4))
    ack(made, id)

    // The size failure, NOT a success carrying the older three-life bytes.
    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
      message: ARCADE_TOO_BIG_TO_SAVE,
    })
    expect(made.rejected.map((r) => r.reason)).toContain('payload-too-big')
    // The refused source is still the newest one this bridge has read, and is
    // available as itself for a download — unchanged by this repair.
    expect(made.bridge.sourceOverCaps()).toBe(true)
    expect(made.bridge.oversizedSourceForDownload()?.['main.ts']).toBe('info.setLife(4)')
    // The older accepted project is an editor save and nothing more.
    expect(made.bridge.editorSaveSeen()?.files['main.ts']).toBe('info.setLife(3)')
    expect(made.bridge.isCapturing()).toBe(false)
  })

  it('refuses it for the TOTAL archive cap, with nothing to hand back', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = captureId(made)
    announce(made, { 'main.ts': 'info.setLife(3)' })
    announce(made, overTotalCap(4))
    ack(made, id)

    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
      message: ARCADE_TOO_BIG_TO_SAVE,
    })
    expect(made.bridge.sourceOverCaps()).toBe(true)
    // Too big to hold at all: the FACT, not the bytes.
    expect(made.bridge.oversizedSourceForDownload()).toBeNull()
  })

  it('refuses it when the newer payload broke the FILE-COUNT cap', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = captureId(made)
    announce(made, { 'main.ts': 'info.setLife(3)' })
    announce(made, overFileCountCap(4))
    ack(made, id)

    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
      message: ARCADE_TOO_BIG_TO_SAVE,
    })
    expect(made.bridge.oversizedSourceForDownload()).toBeNull()
  })

  /**
   * The other direction, which must still SUCCEED: he went over the cap, then
   * deleted some of it again before the ACK. The capture's answer is that last
   * acceptable payload — never the refused one, and never a failure.
   */
  it('succeeds with a LATER valid payload that replaced the refused one', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = captureId(made)
    announce(made, overFileCap(4))
    announce(made, { 'main.ts': 'info.setLife(5)' })
    ack(made, id)

    const result = await pending
    expect(result.files['main.ts']).toBe('info.setLife(5)')
    expect(result.files['main.blocks']).toBe('<xml/>')
    // The refusal is no longer true about the editor.
    expect(made.bridge.sourceOverCaps()).toBe(false)
    expect(made.bridge.oversizedSourceForDownload()).toBeNull()
  })

  it('succeeds with the last valid payload across valid → overcap → valid', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = captureId(made)
    announce(made, { 'main.ts': 'info.setLife(3)' })
    announce(made, overFileCap(4))
    announce(made, { 'main.ts': 'info.setLife(5)' })
    ack(made, id)

    await expect(pending).resolves.toMatchObject({
      files: { 'main.ts': 'info.setLife(5)' },
    })
  })

  it('is NOT rescued by a valid payload that arrives after the ACK', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = captureId(made)
    announce(made, { 'main.ts': 'info.setLife(3)' })
    announce(made, overFileCap(4))
    ack(made, id)
    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
      message: ARCADE_TOO_BIG_TO_SAVE,
    })
    // A later autosave belongs to no capture: it is an editor save, and the
    // failed capture stays failed until somebody taps Save again.
    announce(made, { 'main.ts': 'info.setLife(5)' })
    expect(made.bridge.editorSaveSeen()?.files['main.ts']).toBe('info.setLife(5)')
    expect(made.bridge.isCapturing()).toBe(false)
  })

  /**
   * Identity comes FIRST, and this repair does not give an outsider a new
   * power: a foreign, published or differently-headed oversized event says
   * nothing about the child's own game, so it may neither contribute bytes nor
   * throw away a correct capture.
   */
  it('lets no FOREIGN oversized event invalidate our valid capture', async () => {
    const strangers = [
      { name: 'Untitled' },
      { pubId: 'pub-1' },
      { id: 'header-2' },
      { id: '' },
    ]
    for (const header of strangers) {
      const made = readyBridge()
      const pending = made.bridge.requestSnapshot()
      const id = captureId(made)
      // Ours, so the header is pinned and the payload collected.
      announce(made, { 'main.ts': 'info.setLife(3)' })
      // A stranger's enormous save, mid-capture.
      announce(made, overFileCap(9), header)
      ack(made, id)

      await expect(pending).resolves.toMatchObject({
        files: { 'main.ts': 'info.setLife(3)' },
      })
      expect(made.rejected.map((r) => r.reason)).toEqual(['foreign-project'])
      // And it contributed nothing to the download route either.
      expect(made.bridge.sourceOverCaps()).toBe(false)
      expect(made.bridge.oversizedSourceForDownload()).toBeNull()
    }
  })

  it('lets no MALFORMED or wrong-addressed oversized event invalidate it', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = captureId(made)
    announce(made, { 'main.ts': 'info.setLife(3)' })

    // Unreadable: a huge map with a non-string file in it.
    announce(made, { ...overFileCap(9), 'bad.ts': 7 })
    // The PREVIOUS frame's enormous save.
    made.bridge.handleMessage(
      event(made.frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: 'an-older-frame',
        project: ourProject({ text: overFileCap(9) }),
      }),
    )
    // And one from somewhere else entirely.
    made.bridge.handleMessage(
      event(
        made.frame,
        {
          type: 'pxthost',
          action: 'workspacesave',
          frameId: made.bridge.frameId,
          project: ourProject({ text: overFileCap(9) }),
        },
        'https://evil.example',
      ),
    )
    ack(made, id)

    await expect(pending).resolves.toMatchObject({
      files: { 'main.ts': 'info.setLife(3)' },
    })
    expect(made.rejected.map((r) => r.reason)).toEqual([
      'foreign-project',
      'frame-id',
      'origin',
    ])
    expect(made.bridge.sourceOverCaps()).toBe(false)
  })

  /**
   * The same hole on the other correlation route: a version that DOES send a
   * project body on the reply, and that body is over the caps. The older
   * collected payload is not a fallback for it.
   */
  it('refuses an over-cap project body carried ON the acknowledgment', async () => {
    const made = readyBridge()
    const pending = made.bridge.requestSnapshot()
    const id = captureId(made)
    announce(made, { 'main.ts': 'info.setLife(3)' })
    ack(made, id, { project: ourProject({ text: overFileCap(4) }) })

    await expect(pending).rejects.toMatchObject({
      kind: ArcadeBridgeFailure.BadProject,
      message: ARCADE_TOO_BIG_TO_SAVE,
    })
    expect(made.bridge.oversizedSourceForDownload()?.['main.ts']).toBe('info.setLife(4)')
  })
})

describe('the failure kinds the page branches on are all named', () => {
  it('declares every one it throws', () => {
    expect(Object.values(ArcadeBridgeFailure).sort()).toEqual([
      'bad-project',
      'busy',
      'not-ready',
      'refused',
      'stale',
      'timeout',
    ])
  })
})
