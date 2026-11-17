/**
 * The raw MakeCode Arcade controller bridge (LOCAL-BUILD-001).
 *
 * ── What this is, and what the reference data is not ──────────────────────
 *
 * A small, isolated, version-aware adapter over the `postMessage` protocol that
 * `arcade.makecode.com?controller=1` speaks. The actions it uses —
 * `importproject`, `switchblocks`, `saveproject`, and the host side's
 * `workspacesync` / `workspacesave` / `workspaceloaded` — are **internal and
 * version-sensitive**. The independent probe proved they work against Arcade
 * 4.1.28 / PXT 13.1.25 in a browser; it did not make them a supported API, and
 * nothing here treats them as one. Every one of them is wrapped in a timeout, a
 * shape check and a visible failure with a recovery route.
 *
 * ── Everything it refuses ─────────────────────────────────────────────────
 *
 * A message is read only when ALL of these hold, and each one is a real attack
 * or a real bug rather than a precaution:
 *
 *   • `event.origin` is exactly the Arcade origin — not `startsWith`, not a
 *     suffix test;
 *   • `event.source` is the CURRENT iframe's `contentWindow` — an old frame
 *     still closing, or a second frame on the page, is not this editor;
 *   • `msg.frameId` is this visit's fresh frame id — the one in the iframe's
 *     own URL, generated per attach, so a reply addressed to the previous
 *     frame cannot be read as this one's;
 *   • for a reply, `msg.id` matches a request WE made and have not yet
 *     resolved — so a duplicate reply is dropped rather than resolving a later
 *     request, and an unsolicited `pxteditor` message matches nothing;
 *   • the scope the request was made under is STILL live
 *     ({@link ArcadeBridgeOptions.isScopeLive}) — child, project, version and
 *     visit. A callback that lands after the page has moved on cannot modify
 *     the new visit;
 *   • for a host action, the action is one of the three the host answers.
 *
 * And a project is accepted only when it is OURS: the header names this
 * project, carries no `pubId`, and — once the first one has been seen — has the
 * same header id. That is what makes the editor's own auto-created *Untitled*
 * project, which really does appear, something this ignores rather than saves.
 *
 * ── What it never sends ───────────────────────────────────────────────────
 *
 * Only editor-required project source leaves the app: the file map and the
 * project name that is inside `pxt.json` anyway. No child id, no child name, no
 * note, no audio, no snapshot, no credential, no family id, and no share
 * action. There is no code path here that can publish. "Private" here means no
 * public publication — it does not mean Microsoft's editor is not involved, and
 * the page says so to a parent in those words.
 */

import type { BuildStudioSourceFiles } from '../../core/types/buildStudio'
import { ARCADE_TARGET, ARCADE_TARGET_VERSION } from './buildStudioStarter'

/** The one origin. Exact match, never a prefix. */
export const ARCADE_ORIGIN = 'https://arcade.makecode.com'

/** Timeouts, in ms. Generous: a cold editor on a tablet is slow. */
export const ARCADE_IMPORT_TIMEOUT_MS = 30_000
export const ARCADE_SNAPSHOT_TIMEOUT_MS = 20_000
export const ARCADE_SWITCH_TIMEOUT_MS = 10_000

/** The host actions this bridge answers. Anything else is ignored. */
const HOST_ACTIONS = ['workspacesync', 'workspacesave', 'workspaceloaded'] as const
type HostAction = (typeof HOST_ACTIONS)[number]

/** A MakeCode project header, as much of it as this app reads. */
export interface ArcadeProjectHeader {
  id?: string
  name?: string
  target?: string
  targetVersion?: string
  editor?: string
  pubId?: string
}

export interface ArcadeProject {
  header?: ArcadeProjectHeader
  text?: Record<string, unknown>
}

/** An accepted project: a validated header plus a validated file map. */
export interface AcceptedProject {
  header: ArcadeProjectHeader
  files: BuildStudioSourceFiles
}

export const ArcadeBridgeFailure = {
  /** The editor never completed its handshake. */
  NotReady: 'not-ready',
  /** An action timed out. */
  Timeout: 'timeout',
  /** The editor answered `success: false`. */
  Refused: 'refused',
  /** The editor handed back something that is not a project. */
  BadProject: 'bad-project',
  /** The scope moved on; this answer belongs to nobody. */
  Stale: 'stale',
} as const
export type ArcadeBridgeFailure =
  (typeof ArcadeBridgeFailure)[keyof typeof ArcadeBridgeFailure]

export class ArcadeBridgeError extends Error {
  constructor(
    readonly kind: ArcadeBridgeFailure,
    readonly action: string,
    message: string,
  ) {
    super(message)
  }
}

/** Why a message was thrown away. Kept for the diagnostics panel. */
export interface RejectedMessage {
  reason:
    | 'origin'
    | 'frame'
    | 'frame-id'
    | 'shape'
    | 'unsolicited'
    | 'scope'
    | 'foreign-project'
    | 'action'
  action?: string
}

export interface ArcadeBridgeOptions {
  /** The project name to bind on — the one inside `pxt.json`. */
  projectName: string
  /**
   * Is the scope this bridge was built for still the live one?
   *
   * Called again immediately before every callback is acted on, not merely at
   * construction. A page that has changed child, version or visit answers
   * false, and the reply is dropped instead of being applied to whatever is on
   * screen now.
   */
  isScopeLive: () => boolean
  /** Fresh ids. Injected so a test can make them deterministic. */
  newId: () => string
  /** `Date.now`, injected for the same reason. */
  now?: () => number
  /** The editor saved — NOT a durable app save. Used only for the dirty mark. */
  onEditorSave?: (project: AcceptedProject) => void
  /** The editor finished loading and the host answered. */
  onEditorLoaded?: () => void
  /** A message was refused. Diagnostics only. */
  onRejected?: (rejected: RejectedMessage) => void
  /** The editor reported a target version we were not built against. */
  onVersionDrift?: (reported: { target?: string; targetVersion?: string }) => void
  /** Overridable for tests. */
  origin?: string
}

interface PendingRequest {
  action: string
  resolve: (msg: Record<string, unknown>) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface SnapshotWaiter {
  requestedAt: number
  resolve: (project: AcceptedProject) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
  settled: boolean
}

/**
 * Is this a file map of nothing but text?
 *
 * The probe's own validator, kept: a project whose `text` holds a non-string
 * is not a project, and `pxt.json` is the one file without which nothing can
 * reopen it.
 */
export function readProjectFiles(
  project: ArcadeProject | undefined,
): BuildStudioSourceFiles | null {
  const text = project?.text
  if (!text || typeof text !== 'object' || Array.isArray(text)) return null
  const entries = Object.entries(text)
  if (entries.length === 0) return null
  if (!entries.every(([, value]) => typeof value === 'string')) return null
  if (typeof (text as Record<string, unknown>)['pxt.json'] !== 'string') return null
  return Object.fromEntries(entries) as BuildStudioSourceFiles
}

/**
 * The bridge. One per visit — never reused across a child, project or version
 * change, because the frame id, the pinned header and every pending request
 * belong to the visit they were made in.
 */
export class ArcadeBridge {
  readonly frameId: string
  private readonly origin: string
  private readonly options: ArcadeBridgeOptions
  private readonly now: () => number
  private iframe: HTMLIFrameElement | null = null
  private pending = new Map<string, PendingRequest>()
  private snapshotWaiter: SnapshotWaiter | null = null
  /** The header id of the project we imported, once the editor has told us. */
  private ourHeaderId: string | null = null
  private loaded = false
  private disposed = false
  /** The last project the EDITOR saved. Not a durable save; see `onEditorSave`. */
  private lastEditorSave: AcceptedProject | null = null
  private versionDriftReported = false

  constructor(options: ArcadeBridgeOptions) {
    this.options = options
    this.origin = options.origin ?? ARCADE_ORIGIN
    this.now = options.now ?? (() => Date.now())
    this.frameId = options.newId()
  }

  /** The URL the iframe must load. The frame id is in it, and is checked. */
  frameUrl(): string {
    const url = new URL(this.origin)
    url.search = new URLSearchParams({
      controller: '1',
      // No telemetry opt-out is claimed here; this is the controller handshake
      // flag the probe used and nothing more.
      frameId: this.frameId,
    }).toString()
    return url.href
  }

  /** Bind to the live iframe element. Every message is checked against it. */
  attach(iframe: HTMLIFrameElement): void {
    this.iframe = iframe
  }

  /** Has the editor completed its handshake? Editing is gated on this. */
  isLoaded(): boolean {
    return this.loaded
  }

  /** The most recent EDITOR save, which is not an app save. */
  editorSaveSeen(): AcceptedProject | null {
    return this.lastEditorSave
  }

  /**
   * The one message handler. Install it with
   * `window.addEventListener('message', bridge.handleMessage)`.
   *
   * An arrow property rather than a method so the same function identity can be
   * removed again — a listener that cannot be removed is a listener that
   * outlives its frame, which is the whole class of defect this file guards.
   */
  handleMessage = (event: MessageEvent): void => {
    if (this.disposed) return
    const reject = (rejected: RejectedMessage) => this.options.onRejected?.(rejected)

    if (event.origin !== this.origin) return reject({ reason: 'origin' })
    const frameWindow = this.iframe?.contentWindow ?? null
    if (!frameWindow || event.source !== frameWindow) return reject({ reason: 'frame' })

    const msg = event.data as Record<string, unknown> | null
    if (!msg || typeof msg !== 'object') return reject({ reason: 'shape' })
    if (msg.frameId !== this.frameId) return reject({ reason: 'frame-id' })

    if (msg.type === 'pxteditor') return this.handleEditorReply(msg)
    if (msg.type === 'pxthost') return this.handleHostAction(msg)
    return reject({ reason: 'shape' })
  }

  private handleEditorReply(msg: Record<string, unknown>): void {
    const id = typeof msg.id === 'string' ? msg.id : ''
    const request = id ? this.pending.get(id) : undefined
    // No matching request: an unsolicited reply, or the SECOND copy of one we
    // have already resolved. Dropped either way — a late duplicate must never
    // resolve a request made after it.
    if (!request) {
      this.options.onRejected?.({ reason: 'unsolicited', action: String(msg.action ?? '') })
      return
    }
    this.pending.delete(id)
    clearTimeout(request.timer)
    // The scope is re-read HERE, at the moment of acting, not when the request
    // was sent. The page may have changed child or version while this was in
    // flight.
    if (!this.options.isScopeLive()) {
      this.options.onRejected?.({ reason: 'scope', action: request.action })
      request.reject(
        new ArcadeBridgeError(
          ArcadeBridgeFailure.Stale,
          request.action,
          'That answer arrived after you moved on, so nothing was changed.',
        ),
      )
      return
    }
    if (msg.success === false) {
      request.reject(
        new ArcadeBridgeError(
          ArcadeBridgeFailure.Refused,
          request.action,
          `The editor could not ${request.action}.`,
        ),
      )
      return
    }
    request.resolve(msg)
  }

  private handleHostAction(msg: Record<string, unknown>): void {
    const action = msg.action
    if (typeof action !== 'string' || !HOST_ACTIONS.includes(action as HostAction)) {
      this.options.onRejected?.({ reason: 'action', action: String(action ?? '') })
      return
    }
    if (!this.options.isScopeLive()) {
      this.options.onRejected?.({ reason: 'scope', action })
      return
    }

    if (action === 'workspacesync') {
      // We supply NO stored projects. The app's shelf is Firestore, not the
      // editor's workspace, and handing the editor a list would be handing it
      // the child's library. The starter or the chosen version arrives through
      // `importproject` instead.
      this.post({ type: 'pxthost', action, id: msg.id, frameId: this.frameId, projects: [] })
      return
    }

    if (action === 'workspaceloaded') {
      this.loaded = true
      this.post({
        type: 'pxthost',
        action,
        id: msg.id,
        frameId: this.frameId,
        success: true,
      })
      this.options.onEditorLoaded?.()
      return
    }

    // `workspacesave` — the editor's own save. It is NOT a durable app save and
    // this bridge never persists from here; it records it so the page can show
    // "not saved yet", and it is what an explicit Save waits for.
    const accepted = this.acceptProject(msg.project as ArcadeProject | undefined)
    if (!accepted) return
    this.lastEditorSave = accepted
    this.options.onEditorSave?.(accepted)
    const waiter = this.snapshotWaiter
    if (waiter && !waiter.settled && this.now() >= waiter.requestedAt) {
      waiter.settled = true
      clearTimeout(waiter.timer)
      this.snapshotWaiter = null
      waiter.resolve(accepted)
    }
  }

  /**
   * Is this project ours?
   *
   * Name, no `pubId`, a readable file map, and — once we have seen one — the
   * same header id. The name check is what ignores the editor's auto-created
   * *Untitled* project; the header-id check is what stops a second, unrelated
   * project that happens to share the name.
   */
  private acceptProject(project: ArcadeProject | undefined): AcceptedProject | null {
    const header = project?.header
    if (!header || typeof header.id !== 'string' || !header.id) {
      this.options.onRejected?.({ reason: 'foreign-project' })
      return null
    }
    if (header.name !== this.options.projectName) {
      this.options.onRejected?.({ reason: 'foreign-project' })
      return null
    }
    // A shared project is a published one. This app has no share action, so a
    // `pubId` means something outside it changed the project's nature; it is
    // refused rather than stored as the child's private version.
    if (header.pubId) {
      this.options.onRejected?.({ reason: 'foreign-project' })
      return null
    }
    if (this.ourHeaderId && header.id !== this.ourHeaderId) {
      this.options.onRejected?.({ reason: 'foreign-project' })
      return null
    }
    const files = readProjectFiles(project)
    if (!files) {
      this.options.onRejected?.({ reason: 'foreign-project' })
      return null
    }
    this.ourHeaderId = header.id
    this.reportVersionDrift(header)
    return { header, files }
  }

  /**
   * Say so, once, when the editor is not the one this was written against.
   *
   * Reported, never enforced: refusing to open a newer Arcade would break the
   * feature on the day Microsoft ships an update, and the handshake is checked
   * by its own results anyway. What the banner is for is the day something
   * stops working — a reader can see which editor answered instead of guessing.
   */
  private reportVersionDrift(header: ArcadeProjectHeader): void {
    if (this.versionDriftReported) return
    const sameTarget = !header.target || header.target === ARCADE_TARGET
    const sameVersion =
      !header.targetVersion || header.targetVersion === ARCADE_TARGET_VERSION
    if (sameTarget && sameVersion) return
    this.versionDriftReported = true
    this.options.onVersionDrift?.({
      target: header.target,
      targetVersion: header.targetVersion,
    })
  }

  private post(message: Record<string, unknown>): void {
    this.iframe?.contentWindow?.postMessage(message, this.origin)
  }

  /** Send one request and wait for its reply, by its own scoped id. */
  private request(
    action: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    if (this.disposed) {
      return Promise.reject(
        new ArcadeBridgeError(ArcadeBridgeFailure.Stale, action, 'The editor was closed.'),
      )
    }
    const id = this.options.newId()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(
          new ArcadeBridgeError(
            ArcadeBridgeFailure.Timeout,
            action,
            'The editor did not answer in time.',
          ),
        )
      }, timeoutMs)
      this.pending.set(id, { action, resolve, reject, timer })
      this.post({
        ...args,
        type: 'pxteditor',
        action,
        response: true,
        id,
        frameId: this.frameId,
      })
    })
  }

  /**
   * Put a project into the editor. The starter on a first visit, or the exact
   * bytes of a chosen version on a reopen.
   *
   * **The caller must keep editing gated until this resolves.** A half-imported
   * workspace is one a child can edit and save over, and an import that lands
   * afterwards would throw that away.
   */
  async importProject(files: BuildStudioSourceFiles): Promise<void> {
    // The header is deliberately NOT sent: the editor assigns its own id, and
    // sending one of ours would be the app claiming to own a document in the
    // editor's workspace. Only `text` — editor-required source and nothing else.
    await this.request('importproject', { project: { text: files } }, ARCADE_IMPORT_TIMEOUT_MS)
  }

  /**
   * Ask the editor to show Blocks.
   *
   * This is what turns the starter's canonical TypeScript into the editable
   * blocks a seven-year-old works in. **Tolerant on purpose**: it is the most
   * version-sensitive action of the three, and a failure here is not a reason
   * to refuse the visit — the caller then checks whether blocks actually
   * arrived (`blocksLookAuthored`) and says something honest either way, which
   * is a better check than this action's own answer.
   */
  async switchToBlocks(): Promise<boolean> {
    try {
      await this.request('switchblocks', {}, ARCADE_SWITCH_TIMEOUT_MS)
      return true
    } catch {
      return false
    }
  }

  /**
   * Ask the editor to start its own simulator.
   *
   * Tolerant for the same reason `switchToBlocks` is, and the UI does not
   * depend on it: the Arcade editor draws its own green play control inside the
   * frame, the page says so in words, and this is a convenience that either
   * works or is silently not there. It is the one action here the probe did not
   * exercise, which is exactly why nothing is claimed on its answer.
   */
  async startSimulator(): Promise<boolean> {
    try {
      await this.request('startsimulator', {}, ARCADE_SWITCH_TIMEOUT_MS)
      return true
    } catch {
      return false
    }
  }

  /**
   * The full source, as the editor holds it right now.
   *
   * Asks the editor to save, then takes the project from whichever arrives
   * first: the reply itself, or a `workspacesave` the request provoked. Only a
   * save observed **at or after** the request counts — an older one is the
   * editor's previous state, and storing that as an explicit Save would be the
   * "stale frame" failure the slice names.
   *
   * Rejects rather than falling back to the last thing seen. A Save that
   * silently stored older bytes would be worse than one that failed, because
   * the child would be told his change was kept.
   */
  async requestSnapshot(): Promise<AcceptedProject> {
    if (!this.loaded) {
      throw new ArcadeBridgeError(
        ArcadeBridgeFailure.NotReady,
        'saveproject',
        'The editor is still opening. Give it a moment and tap Save again.',
      )
    }
    const requestedAt = this.now()
    const fromHost = new Promise<AcceptedProject>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.snapshotWaiter?.settled === false) this.snapshotWaiter.settled = true
        this.snapshotWaiter = null
        reject(
          new ArcadeBridgeError(
            ArcadeBridgeFailure.Timeout,
            'saveproject',
            'The editor did not hand over the game in time. Nothing was saved.',
          ),
        )
      }, ARCADE_SNAPSHOT_TIMEOUT_MS)
      this.snapshotWaiter = { requestedAt, resolve, reject, timer, settled: false }
    })

    const fromReply = this.request('saveproject', {}, ARCADE_SNAPSHOT_TIMEOUT_MS).then(
      (msg) => {
        const accepted = this.acceptProject(
          (msg.project ?? (msg.resp as ArcadeProject)) as ArcadeProject | undefined,
        )
        if (!accepted) {
          // Not a failure yet: `saveproject` commonly answers `{success:true}`
          // with no project and the source arrives as a host `workspacesave`.
          // So this branch waits for that one rather than rejecting the race.
          return fromHost
        }
        return accepted
      },
    )

    // Both branches get a handler attached BEFORE the race, so whichever one
    // loses does not surface as an unhandled rejection. `Promise.race` still
    // sees the original settlement — an extra `catch` observer does not change
    // what the promise resolves or rejects with.
    fromHost.catch(() => {})
    fromReply.catch(() => {})

    try {
      const accepted = await Promise.race([fromReply, fromHost])
      if (!this.options.isScopeLive()) {
        throw new ArcadeBridgeError(
          ArcadeBridgeFailure.Stale,
          'saveproject',
          'That save arrived after you moved on, so nothing was stored.',
        )
      }
      return accepted
    } finally {
      const waiter = this.snapshotWaiter
      if (waiter) {
        clearTimeout(waiter.timer)
        this.snapshotWaiter = null
      }
    }
  }

  /**
   * Stop. Every pending request is rejected rather than left hanging, so a
   * caller awaiting one gets an answer instead of a promise that never settles
   * — the leak that leaves a Save spinner on screen forever.
   */
  dispose(): void {
    this.disposed = true
    for (const [, request] of this.pending) {
      clearTimeout(request.timer)
      request.reject(
        new ArcadeBridgeError(
          ArcadeBridgeFailure.Stale,
          request.action,
          'The editor was closed before it answered.',
        ),
      )
    }
    this.pending.clear()
    const waiter = this.snapshotWaiter
    if (waiter && !waiter.settled) {
      waiter.settled = true
      clearTimeout(waiter.timer)
      waiter.reject(
        new ArcadeBridgeError(
          ArcadeBridgeFailure.Stale,
          'saveproject',
          'The editor was closed before it handed the game over.',
        ),
      )
    }
    this.snapshotWaiter = null
    this.iframe = null
  }
}
