import { beforeEach, describe, expect, it } from 'vitest'

import {
  ARCADE_ORIGIN,
  ArcadeBridge,
  ArcadeBridgeError,
  ArcadeBridgeFailure,
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
  return {
    posted,
    contentWindow,
    element: { contentWindow } as unknown as HTMLIFrameElement,
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

describe('an explicit snapshot takes a save made AFTER the request', () => {
  function readyBridge(now: () => number) {
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

  it('resolves from a workspacesave provoked by saveproject', async () => {
    let clock = 100
    const { bridge, frame } = readyBridge(() => clock)
    const pending = bridge.requestSnapshot()
    expect(frame.posted.at(-1)!.message).toMatchObject({ action: 'saveproject' })
    clock = 200
    bridge.handleMessage(
      event(frame, {
        type: 'pxthost',
        action: 'workspacesave',
        frameId: bridge.frameId,
        project: ourProject({ text: { 'main.ts': 'info.setLife(4)' } }),
      }),
    )
    const result = await pending
    expect(result.files['main.ts']).toBe('info.setLife(4)')
  })

  it('resolves from the reply itself when the reply carries the project', async () => {
    const { bridge, frame } = readyBridge(() => 100)
    const pending = bridge.requestSnapshot()
    const id = frame.posted.at(-1)!.message.id
    bridge.handleMessage(
      event(frame, {
        type: 'pxteditor',
        action: 'saveproject',
        id,
        frameId: bridge.frameId,
        success: true,
        project: ourProject({ text: { 'main.ts': 'info.setLife(5)' } }),
      }),
    )
    const result = await pending
    expect(result.files['main.ts']).toBe('info.setLife(5)')
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

describe('version drift is reported, never enforced', () => {
  it('tells the host once when the editor is a different version', () => {
    const drifts: Array<{ targetVersion?: string }> = []
    const frame = fakeFrame()
    const bridge = new ArcadeBridge({
      projectName: BUILD_STUDIO_PROJECT_NAME,
      isScopeLive: () => true,
      newId: nextId,
      now: () => 1,
      onVersionDrift: (r) => drifts.push(r),
    })
    bridge.attach(frame.element)
    const save = (targetVersion: string) =>
      bridge.handleMessage(
        event(frame, {
          type: 'pxthost',
          action: 'workspacesave',
          frameId: bridge.frameId,
          project: ourProject({ header: { targetVersion } }),
        }),
      )
    save('9.9.9')
    save('9.9.9')
    expect(drifts).toEqual([{ target: 'arcade', targetVersion: '9.9.9' }])
    // ...and the project was still ACCEPTED. A newer editor must keep working.
    expect(bridge.editorSaveSeen()).not.toBeNull()
  })

  it('says nothing when the version matches', () => {
    const drifts: unknown[] = []
    const frame = fakeFrame()
    const bridge = new ArcadeBridge({
      projectName: BUILD_STUDIO_PROJECT_NAME,
      isScopeLive: () => true,
      newId: nextId,
      now: () => 1,
      onVersionDrift: (r) => drifts.push(r),
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
    expect(drifts).toEqual([])
  })
})

describe('the failure kinds the page branches on are all named', () => {
  it('declares every one it throws', () => {
    expect(Object.values(ArcadeBridgeFailure).sort()).toEqual([
      'bad-project',
      'not-ready',
      'refused',
      'stale',
      'timeout',
    ])
  })
})
