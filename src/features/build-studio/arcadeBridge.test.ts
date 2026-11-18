import { beforeEach, describe, expect, it } from 'vitest'

import {
  ARCADE_ORIGIN,
  ArcadeBridge,
  ArcadeBridgeError,
  ArcadeBridgeFailure,
  payloadWithinCaps,
  readProjectFiles,
  type RejectedMessage,
} from './arcadeBridge'
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
   * Stock assigns a NEW header id to every import. The pin from a previous
   * import is therefore about a project that no longer exists, and keeping it
   * refused every save event from the project just imported — which is how a
   * recovered file opened visibly and then could never be saved.
   *
   * POSITIVE CONTROL: remove `this.ourHeaderId = null` from `importProject` and
   * the first case here fails.
   */
  it('accepts the NEW header the editor assigns to a fresh import', async () => {
    const { bridge, frame, rejected } = loadedBridge()
    // The first project pins its header.
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject({ header: { id: 'header-first' } }),
      }),
    )
    expect(bridge.editorSaveSeen()?.header.id).toBe('header-first')

    // A new import. Stock gives it a different header id.
    const pending = bridge.importProject({ 'pxt.json': '{}', 'main.ts': 'x' })
    const id = frame.posted.at(-1)!.message.id
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'importproject',
        id,
        frameId: bridge.frameId,
        success: true,
      }),
    )
    await pending

    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject({ header: { id: 'header-second' } }),
      }),
    )
    expect(rejected.map((r) => r.reason)).toEqual([])
    expect(bridge.editorSaveSeen()?.header.id).toBe('header-second')
  })

  it('re-pins after the import, so a THIRD header is still refused', async () => {
    // Resetting the pin on import is not a relaxation: once the imported
    // project is accepted, a different project is refused exactly as before.
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
 * Counts and UTF-8 byte caps are enforced before a payload is held as bridge
 * state — not only before a Firestore write. An oversized project kept in
 * memory and offered to Save would be refused after the child was told it was
 * being saved.
 */
describe('an oversized payload is never held', () => {
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
    const text: Record<string, string> = { 'pxt.json': '{}' }
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
