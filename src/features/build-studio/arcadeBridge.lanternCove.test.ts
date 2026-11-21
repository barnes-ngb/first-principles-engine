import { describe, expect, it } from 'vitest'

/**
 * The REAL bridge's admission of a Lantern Cove capture (FEAT-247).
 *
 * The released minimum accepts any payload of ours that has a non-blank
 * `pxt.json` and `main.ts`. For Lantern Cove that is not enough: a capture with
 * no map pair satisfies it while the cove is gone. The bridge therefore takes an
 * optional `acceptsFiles` rule, and a payload that fails it takes exactly the
 * path a missing required file takes — not accepted, and INVALIDATING whatever
 * the running capture had collected.
 *
 * Messages are delivered through `handleMessage` with the real origin, source and
 * frame-id checks in force; only the iframe and its `postMessage` are stand-ins.
 */

import {
  ARCADE_ORIGIN,
  ArcadeBridge,
  ArcadeBridgeFailure,
  type RejectedMessage,
} from './arcadeBridge'
import {
  LANTERN_COVE_PROJECT_NAME,
  lanternCoveArchiveComplete,
  lanternCoveStarterFiles,
} from './lanternCoveStarter'

type Files = Record<string, string>

function harness(options: { projectName: string; enforce: boolean }) {
  let seq = 0
  let live = true
  const posted: Array<Record<string, unknown>> = []
  const rejected: RejectedMessage[] = []
  const win = { postMessage: (message: Record<string, unknown>) => void posted.push(message) }
  const iframe = {
    contentWindow: win,
    style: {} as Record<string, string>,
    ownerDocument: { activeElement: null },
  } as unknown as HTMLIFrameElement
  const bridge = new ArcadeBridge({
    projectName: options.projectName,
    ...(options.enforce ? { acceptsFiles: lanternCoveArchiveComplete } : {}),
    isScopeLive: () => live,
    newId: () => `id${++seq}-abcd`,
    onRejected: (r) => void rejected.push(r),
  })
  bridge.attach(iframe)

  const send = (data: Record<string, unknown>) =>
    bridge.handleMessage({
      origin: ARCADE_ORIGIN,
      source: win,
      data: { ...data, frameId: bridge.frameId },
    } as unknown as MessageEvent)

  const header = { id: 'hdr-1', name: options.projectName }
  return {
    bridge,
    rejected,
    setLive: (value: boolean) => {
      live = value
    },
    load: () => send({ type: 'pxthost', action: 'workspaceloaded', id: 'host-1' }),
    /** The editor announces a save of `files`. */
    announce: (files: Files) =>
      send({ type: 'pxthost', action: 'workspacesave', project: { header, text: files } }),
    /** Start a capture; returns the settled outcome and the request id. */
    capture: () => {
      const outcome = bridge.requestSnapshot().then(
        (project) => ({ ok: true as const, project }),
        (error: unknown) => ({ ok: false as const, error }),
      )
      const request = [...posted].reverse().find((m) => m.action === 'saveproject')
      return { outcome, requestId: String(request?.id) }
    },
    ack: (requestId: string) => send({ type: 'pxteditor', id: requestId, success: true }),
  }
}

const lantern = () => harness({ projectName: LANTERN_COVE_PROJECT_NAME, enforce: true })

/** Two things a real child does: move the hero, and (separately) lose the map. */
const edited = (): Files => {
  const files = lanternCoveStarterFiles()
  return {
    ...files,
    'main.ts': files['main.ts'].replace(
      'tiles.getTileLocation(1, 1))',
      'tiles.getTileLocation(3, 2))',
    ),
  }
}
const withoutMap = (): Files => {
  const files = edited()
  return Object.fromEntries(
    Object.entries(files).filter(([name]) => !name.startsWith('tilemap.g.')),
  )
}

describe('Lantern Cove capture admission', () => {
  it('hands over a complete, edited archive — map, Blocks and code included', async () => {
    const h = lantern()
    h.load()
    const { outcome, requestId } = h.capture()
    h.announce(edited())
    h.ack(requestId)
    const result = await outcome
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.project.files).toEqual(edited())
  })

  it('fails closed on an incomplete current capture, and does NOT reuse the earlier complete one', async () => {
    const h = lantern()
    h.load()
    const { outcome, requestId } = h.capture()
    h.announce(lanternCoveStarterFiles()) // complete, earlier in the same capture
    h.announce(withoutMap()) // the NEWER reading: the map pair is gone
    h.ack(requestId)
    const result = await outcome
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ kind: ArcadeBridgeFailure.BadProject, tooBig: false })
    }
    expect(h.rejected.map((r) => r.reason)).toContain('incomplete-project')
  })

  it('fails closed when the only payload is incomplete', async () => {
    const h = lantern()
    h.load()
    const { outcome, requestId } = h.capture()
    h.announce(withoutMap())
    h.ack(requestId)
    const result = await outcome
    expect(result.ok).toBe(false)
  })

  it('recovers when a later COMPLETE payload lands before the same ACK', async () => {
    const h = lantern()
    h.load()
    const { outcome, requestId } = h.capture()
    h.announce(withoutMap())
    h.announce(edited())
    h.ack(requestId)
    const result = await outcome
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.project.files).toEqual(edited())
  })

  it('refuses a payload whose map data is cut short, even though every file is present', async () => {
    const h = lantern()
    h.load()
    const { outcome, requestId } = h.capture()
    const broken = edited()
    const jres = JSON.parse(broken['tilemap.g.jres'])
    jres['Lantern Cove1'].data = btoa(atob(jres['Lantern Cove1'].data).slice(0, 20))
    broken['tilemap.g.jres'] = JSON.stringify(jres)
    h.announce(broken)
    h.ack(requestId)
    expect((await outcome).ok).toBe(false)
  })

  it('does not let an incomplete announcement become the latest editor save', () => {
    const h = lantern()
    h.load()
    h.announce(withoutMap())
    expect(h.bridge.editorSaveSeen()).toBeNull()
    h.announce(edited())
    expect(h.bridge.editorSaveSeen()?.files).toEqual(edited())
  })

  it('a reply that lands after the scope moved on is dropped, not applied (delayed response)', async () => {
    const h = lantern()
    h.load()
    const { outcome, requestId } = h.capture()
    h.announce(edited())
    h.setLive(false) // the child, the version or the visit changed while it was out
    h.ack(requestId)
    const result = await outcome
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ kind: ArcadeBridgeFailure.Stale })
    }
  })
})

describe('Apple Dash admission is exactly what it was', () => {
  it('still accepts the released minimum: a manifest and a main.ts, nothing else', async () => {
    const h = harness({ projectName: 'Apple Dash starter', enforce: false })
    h.load()
    const { outcome, requestId } = h.capture()
    const minimal = { 'pxt.json': '{"name":"Apple Dash starter"}', 'main.ts': 'info.setLife(3)' }
    h.announce(minimal)
    h.ack(requestId)
    const result = await outcome
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.project.files).toEqual(minimal)
  })

  it('and the same minimal payload is refused for Lantern Cove', async () => {
    const h = lantern()
    h.load()
    const { outcome, requestId } = h.capture()
    h.announce({
      'pxt.json': JSON.stringify({ name: LANTERN_COVE_PROJECT_NAME, files: ['main.ts'] }),
      'main.ts': 'info.setLife(3)',
    })
    h.ack(requestId)
    expect((await outcome).ok).toBe(false)
  })
})
