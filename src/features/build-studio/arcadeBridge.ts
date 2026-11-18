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

import {
  BUILD_STUDIO_MAX_ARCHIVE_BYTES,
  BUILD_STUDIO_MAX_FILES,
  BUILD_STUDIO_MAX_FILE_BYTES,
  buildStudioSourceKeys,
  utf8ByteLength,
  type BuildStudioSourceFiles,
} from '../../core/types/buildStudio'

/** The one origin. Exact match, never a prefix. */
export const ARCADE_ORIGIN = 'https://arcade.makecode.com'

/**
 * Timeouts, in ms. Generous: a cold editor on a tablet is slow.
 *
 * How long one frame gets to complete its handshake.
 *
 * Every other deadline here belongs to a REQUEST, and every request waits for
 * `workspaceloaded` first — so a frame that never hands shakes had no deadline
 * at all and the page sat on "Opening the editor…" forever. This is the one
 * deadline that is not a request's.
 */
export const ARCADE_OPENING_TIMEOUT_MS = 45_000
export const ARCADE_IMPORT_TIMEOUT_MS = 30_000
export const ARCADE_SNAPSHOT_TIMEOUT_MS = 20_000
export const ARCADE_SWITCH_TIMEOUT_MS = 10_000

/**
 * What a capture says when the game itself is over this app's caps.
 *
 * It promises nothing about a download, because whether the bytes can be handed
 * back depends on how far over the caps they are, and the page answers that at
 * the moment somebody taps. What it does say is the one thing that is certainly
 * true: nothing was stored, nothing in the editor changed, and tapping Save
 * again will do exactly this again.
 */
export const ARCADE_TOO_BIG_TO_SAVE =
  'Your game is now too big for this app to keep, so nothing was saved. It is still open in the editor exactly as it was — making it a bit smaller is what lets it save again.'

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
  /** A capture is already in flight. Captures are serialized, never queued. */
  Busy: 'busy',
} as const
export type ArcadeBridgeFailure =
  (typeof ArcadeBridgeFailure)[keyof typeof ArcadeBridgeFailure]

/**
 * Explicit fields and assignments rather than constructor parameter properties:
 * `erasableSyntaxOnly` is on (`tsconfig.app.json`), and a parameter property
 * emits runtime code.
 */
export class ArcadeBridgeError extends Error {
  readonly kind: ArcadeBridgeFailure
  readonly action: string

  constructor(kind: ArcadeBridgeFailure, action: string, message: string) {
    super(message)
    this.kind = kind
    this.action = action
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
    /** Too many files, or too many bytes, to hold as bridge state. */
    | 'payload-too-big'
  action?: string
}

/** What the editor says it IS, from its own `info` reply. Never inferred. */
export interface ArcadeRuntimeVersions {
  target?: string
  pxt?: string
  tag?: string
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
  /** Overridable for tests. */
  origin?: string
}

interface PendingRequest {
  action: string
  resolve: (msg: Record<string, unknown>) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * One in-flight capture.
 *
 * `requestId` is the `saveproject` request this capture owns, so a payload is
 * only collected for THIS capture and the ACK that ends it has to be the
 * matching one. `latest` is the most recent valid payload seen since dispatch —
 * the stock runtime emits several `workspacesave` events for one `saveproject`
 * and the matching `success: true` reply arrives after all of them, so the
 * fence is "the last payload before my own ACK", not "the first event after a
 * clock reading".
 */
interface CaptureState {
  requestId: string
  /** When the capture was dispatched. Diagnostic; the ACK is the fence. */
  startedAt: number
  latest: AcceptedProject | null
  /** Set once the matching ACK has arrived, so a later event cannot overwrite. */
  acked: boolean
  /**
   * A payload of OURS arrived during this capture and the caps refused it.
   *
   * Recorded so the failure this capture reports is the true one: "nothing was
   * handed over, try again" is wrong advice for a game that is simply too big,
   * and a retry of it fails identically for ever.
   */
  refusedTooBig: boolean
}

/**
 * The newest capture of OUR project that the caps refused.
 *
 * `files` is present only when {@link PayloadCapReading.overFileCapOnly} held —
 * a map bounded by the archive cap, which one download may hand back. Anything
 * bigger keeps the FACT and not the bytes, which is what lets the page refuse a
 * stale download out loud instead of quietly substituting an older game.
 *
 * It is never a save candidate: it is not `lastEditorSave`, it is not collected
 * into a capture, and nothing here can write it.
 */
interface OverCapsCapture {
  files: BuildStudioSourceFiles | null
  /** The reading that refused it. Diagnostics and the page's wording. */
  reading: PayloadCapReading
}

/** The project body on a reply, whichever key this editor version used. */
function msgProject(msg: Record<string, unknown>): ArcadeProject | undefined {
  const direct = msg.project as ArcadeProject | undefined
  if (direct) return direct
  return (msg.resp as ArcadeProject | undefined) ?? undefined
}

/**
 * How a payload measures against the caps — and, when it is over them, WHICH
 * cap it broke.
 *
 * The same counts and UTF-8 byte caps the writer enforces, read from the same
 * constants so the two can never disagree. {@link payloadWithinCaps} is this
 * reading's own boolean, computed from it rather than beside it.
 *
 * The extra answers exist for one reason. A `workspacesave` that is OURS and
 * readable but over the per-file cap is still the child's CURRENT game, and
 * refusing to store it is not a reason to hand him an OLDER one instead — which
 * is exactly what the download fallback did (PR #1974 round 1). So the bridge
 * needs to tell "too big to save, and here it is for a download" apart from
 * "too big to even hold", and `overFileCapOnly` is that line.
 */
export interface PayloadCapReading {
  /** The writer's own answer: may this be stored at all? */
  withinCaps: boolean
  /** How many files count towards the cap (`_history` and friends excluded). */
  fileCount: number
  /** Those files together, in UTF-8 bytes. */
  totalBytes: number
  /** The largest single one of them, in UTF-8 bytes. */
  largestFileBytes: number
  /**
   * True when the ONLY cap broken is the per-file one: the file count is
   * workable and the whole map is still inside the archive cap.
   *
   * That is a payload one download may safely hold — it is bounded by the same
   * archive ceiling an accepted project is. A map over the ARCHIVE cap, or with
   * too many files, is not held at all.
   */
  overFileCapOnly: boolean
}

export function readPayloadCaps(files: BuildStudioSourceFiles): PayloadCapReading {
  const keys = buildStudioSourceKeys(files)
  let total = 0
  let largest = 0
  for (const key of keys) {
    const bytes = utf8ByteLength(files[key])
    total += bytes
    if (bytes > largest) largest = bytes
  }
  const countOk = keys.length > 0 && keys.length <= BUILD_STUDIO_MAX_FILES
  const archiveOk = total <= BUILD_STUDIO_MAX_ARCHIVE_BYTES
  const perFileOk = largest <= BUILD_STUDIO_MAX_FILE_BYTES
  return {
    withinCaps: countOk && archiveOk && perFileOk,
    fileCount: keys.length,
    totalBytes: total,
    largestFileBytes: largest,
    overFileCapOnly: countOk && archiveOk && !perFileOk,
  }
}

/**
 * Is this payload small enough to hold at all?
 *
 * Unchanged in meaning and in strictness; it is now one field of
 * {@link readPayloadCaps}.
 */
export function payloadWithinCaps(files: BuildStudioSourceFiles): boolean {
  return readPayloadCaps(files).withinCaps
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
  /** The ONE active capture. A second `requestSnapshot` is refused, not queued. */
  private capture: CaptureState | null = null
  /** The header id of the project we imported, once the editor has told us. */
  private ourHeaderId: string | null = null
  private loaded = false
  private disposed = false
  /** The last project the EDITOR saved. Not a durable save; see `onEditorSave`. */
  private lastEditorSave: AcceptedProject | null = null
  /**
   * The newest capture of ours the caps refused, if one is newer than
   * `lastEditorSave`. Cleared the moment an acceptable project arrives.
   */
  private overCaps: OverCapsCapture | null = null
  /** From the editor's own `info` reply, or null. Never inferred. */
  private runtime: ArcadeRuntimeVersions | null = null

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
   * Is the source the editor last handed over too big for this app to store?
   *
   * True only while a refused-for-size capture of OURS is the newest thing this
   * bridge has seen — an acceptable project clears it. A foreign project, a
   * published one or an unreadable one never sets it: those are refused earlier,
   * by identity, and they say nothing about the child's own game.
   *
   * What it is FOR: it makes `editorSaveSeen()` a provably older source, so a
   * caller can refuse to offer it as "your game" instead of handing over a
   * stale one with no indication it was stale.
   */
  sourceOverCaps(): boolean {
    return this.overCaps !== null
  }

  /**
   * The current, over-cap source — when it is bounded enough to hand back.
   *
   * For a DOWNLOAD and nothing else. It is deliberately not an
   * {@link AcceptedProject}: it was not accepted, it cannot be saved, and the
   * caps that refused it are untouched. `null` both when the newest capture is
   * fine and when it is too big to hold at all.
   */
  oversizedSourceForDownload(): BuildStudioSourceFiles | null {
    return this.overCaps?.files ?? null
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
    // "not saved yet", and during a capture it is COLLECTED rather than raced.
    const accepted = this.acceptProject(msg.project as ArcadeProject | undefined)
    if (!accepted) return
    this.lastEditorSave = accepted
    this.options.onEditorSave?.(accepted)
    // Collected, never resolved from here. The stock controller awaits
    // `saveFileAsync` → `buildAssetsAsync` → `workspace.saveAsync`, and the
    // iframe provider posts `workspacesave` BEFORE the controller posts the
    // matching reply — so postMessage ordering is the fence, and the capture
    // ends on its own ACK. Resolving on an event would accept whichever
    // autosave happened to land first, including an older delayed one.
    if (this.capture && !this.capture.acked) this.capture.latest = accepted
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
    // The caps are enforced HERE, before the payload is accepted as bridge
    // state — not only before a Firestore write. An oversized project accepted
    // in memory and offered to Save would be refused later, after the child was
    // told it was being saved.
    //
    // What a refusal now ALSO does is say so. It used to be silent, so
    // `editorSaveSeen()` went on answering with the last project that fitted —
    // and the page offered that older game as "Download a copy" of the one in
    // front of him (PR #1974 round 1). The bytes are kept for a download only
    // when they are bounded by the archive cap; past that only the fact is, and
    // neither is a save candidate.
    const reading = readPayloadCaps(files)
    if (!reading.withinCaps) {
      this.overCaps = { files: reading.overFileCapOnly ? files : null, reading }
      if (this.capture && !this.capture.acked) this.capture.refusedTooBig = true
      this.options.onRejected?.({ reason: 'payload-too-big' })
      return null
    }
    // An acceptable project is the newest source there is, so the refusal it
    // replaces is no longer true about the editor.
    this.overCaps = null
    this.ourHeaderId = header.id
    return { header, files }
  }

  /**
   * What the editor says it is, from its OWN `info` reply.
   *
   * `null` until the reply lands, and `null` forever if it never does — which
   * must not block a healthy editor. Deliberately never inferred from the
   * imported project's `header.targetVersion`: that is a placeholder (`0.0.0`
   * in stock 4.1.28), and reading it as the runtime produced a banner telling a
   * child his editor was the wrong version.
   */
  runtimeVersions(): ArcadeRuntimeVersions | null {
    return this.runtime
  }

  /**
   * Ask the editor what it is. Best effort, scope-bound, and never awaited by
   * anything the child is waiting for.
   */
  async requestInfo(): Promise<ArcadeRuntimeVersions | null> {
    try {
      const reply = await this.request('info', {}, ARCADE_SWITCH_TIMEOUT_MS)
      const resp = reply.resp as { versions?: Record<string, unknown> } | undefined
      const versions = resp?.versions
      if (!versions) return null
      const read = (key: string) =>
        typeof versions[key] === 'string' ? (versions[key] as string) : undefined
      const runtime: ArcadeRuntimeVersions = {
        target: read('target'),
        pxt: read('pxt'),
        tag: read('tag'),
      }
      if (!this.options.isScopeLive()) return null
      this.runtime = runtime
      return runtime
    } catch {
      return null
    }
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
    return this.requestWithId(this.options.newId(), action, args, timeoutMs)
  }

  /**
   * The same, with the id minted by the caller.
   *
   * `requestSnapshot` needs the id BEFORE dispatch so the capture it registers
   * and the ACK that ends it are provably the same exchange.
   */
  private requestWithId(
    id: string,
    action: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    if (this.disposed) {
      return Promise.reject(
        new ArcadeBridgeError(ArcadeBridgeFailure.Stale, action, 'The editor was closed.'),
      )
    }
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
    //
    // The pin is deliberately NOT cleared here. There is exactly one caller, in
    // the visit's own startup, and a fresh visit means a fresh bridge with no
    // pin yet — so the first project the editor assigns is the one that gets
    // pinned, and a second, foreign header in the same frame is still refused.
    // Clearing it per import would have been a standing relaxation bought for a
    // case the app does not have.
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
    return this.tolerant('switchblocks', {})
  }

  /**
   * Play it, at a usable size.
   *
   * Measured in stock 4.1.28: `startsimulator` (and `showsimulator`) leave a
   * 96 × 85 preview inside a 688 × 576 editor frame — too small to play on a
   * tablet. `setsimulatorfullscreen` with `enabled: true` expands it to
   * 656 × 392 **with the larger touch controls**, which is the mode a child
   * actually plays in. So Play is both: start, then expand.
   *
   * Tolerant: a failure returns false and the editor's own green play control
   * is still there. The outer app controls live outside the frame and are
   * unaffected either way.
   */
  async playFullscreen(): Promise<boolean> {
    const started = await this.tolerant('startsimulator', {})
    const expanded = await this.tolerant('setsimulatorfullscreen', { enabled: true })
    return started || expanded
  }

  /** Leave play and show Blocks again. `enabled: false` is the measured exit. */
  async backToBlocks(): Promise<boolean> {
    const shrunk = await this.tolerant('setsimulatorfullscreen', { enabled: false })
    const blocks = await this.tolerant('switchblocks', {})
    return shrunk || blocks
  }

  /** One presentation request that may fail without consequence. */
  private async tolerant(action: string, args: Record<string, unknown>): Promise<boolean> {
    try {
      await this.request(action, args, ARCADE_SWITCH_TIMEOUT_MS)
      return true
    } catch {
      return false
    }
  }

  /** Is a capture in flight right now? */
  isCapturing(): boolean {
    return this.capture !== null
  }

  /**
   * Stop the child typing into the frame while a capture is running, and let go
   * again afterwards.
   *
   * `pointer-events: none` plus moving focus OUT of the iframe, because a
   * keystroke reaches a focused iframe without any pointer event at all. An
   * edit landing mid-capture would be an edit the stored version half-contains.
   * Cosmetically invisible on purpose — the page draws its own "Getting your
   * game…" state over the frame.
   */
  private freezeInput(frozen: boolean): void {
    const frame = this.iframe
    if (!frame) return
    try {
      frame.style.pointerEvents = frozen ? 'none' : ''
      if (frozen) {
        const active = frame.ownerDocument?.activeElement
        if (active === frame) (active as HTMLElement).blur()
      }
    } catch {
      // A frame detached mid-capture. The capture's own scope check refuses it.
    }
  }

  /**
   * The full source, as the editor holds it, fenced by the editor's own
   * acknowledgment.
   *
   * ── The fence, and why it is this one ──────────────────────────────────
   *
   * The stock 4.1.28 controller's `saveproject` awaits `saveFileAsync`, then
   * `buildAssetsAsync`, then the workspace provider — and the iframe provider
   * posts `workspacesave` BEFORE that chain resolves. So for one `saveproject`
   * the observed order is: several full `workspacesave` events for the current
   * header, then the matching `success: true` reply carrying **no project
   * body**. That ordering is the only correlation available; there is no raw
   * source-export action in the bundle and none is invented here.
   *
   * Therefore: dispatch, collect every valid same-header payload, and resolve
   * on the matching ACK with the LAST payload collected before it. Nothing is
   * raced. An ACK with no payload collected is a failure, not a fallback to
   * whatever the frame last volunteered.
   *
   * Captures are **serialized**: a second call while one is in flight is
   * refused rather than overwriting the first one's state.
   */
  async requestSnapshot(): Promise<AcceptedProject> {
    if (!this.loaded) {
      throw new ArcadeBridgeError(
        ArcadeBridgeFailure.NotReady,
        'saveproject',
        'The editor is still opening. Give it a moment and tap Save again.',
      )
    }
    if (this.capture) {
      throw new ArcadeBridgeError(
        ArcadeBridgeFailure.Busy,
        'saveproject',
        'Your game is already being saved. One moment.',
      )
    }

    // Claimed synchronously, before the first await, so two taps in one tick
    // cannot both get past the check above.
    const requestId = this.options.newId()
    this.capture = {
      requestId,
      startedAt: this.now(),
      latest: null,
      acked: false,
      refusedTooBig: false,
    }
    this.freezeInput(true)

    try {
      const ack = await this.requestWithId(
        requestId,
        'saveproject',
        {},
        ARCADE_SNAPSHOT_TIMEOUT_MS,
      )
      const state = this.capture
      // The capture was retired under us — disposed, or a newer visit took
      // over. Its answer belongs to nobody.
      if (!state || state.requestId !== requestId) {
        throw new ArcadeBridgeError(
          ArcadeBridgeFailure.Stale,
          'saveproject',
          'That save arrived after you moved on, so nothing was stored.',
        )
      }
      state.acked = true
      // The reply's own body, if this editor version ever sends one; otherwise
      // the last payload the provider posted before acknowledging. Both are
      // put through the same `acceptProject` checks.
      //
      // Asked only when there IS a body: in stock 4.1.28 the ACK carries none,
      // and running the acceptance checks over `undefined` would report a
      // `foreign-project` rejection on every ordinary save — diagnostics that
      // say something is wrong when nothing is.
      const body = msgProject(ack)
      const inReply = body ? this.acceptProject(body) : null
      const collected = inReply ?? state.latest
      if (!collected) {
        // Same failure KIND either way — nothing was captured, nothing was
        // stored, and the ACK/retry contract is unchanged. Only the sentence
        // differs, because "try Save again" is wrong advice for a game that is
        // over the caps: that retry fails identically every time.
        throw new ArcadeBridgeError(
          ArcadeBridgeFailure.BadProject,
          'saveproject',
          state.refusedTooBig
            ? ARCADE_TOO_BIG_TO_SAVE
            : 'The editor said it saved but did not hand the game over. Nothing was saved — try Save again.',
        )
      }
      if (!this.options.isScopeLive()) {
        throw new ArcadeBridgeError(
          ArcadeBridgeFailure.Stale,
          'saveproject',
          'That save arrived after you moved on, so nothing was stored.',
        )
      }
      return collected
    } finally {
      if (this.capture?.requestId === requestId) this.capture = null
      this.freezeInput(false)
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
    // The capture is retired rather than resolved. Its own `await` above is
    // already rejected by the pending-request loop; clearing the state is what
    // stops a late `workspacesave` being collected into a dead capture.
    this.capture = null
    // The download-only copy goes with the visit it was read in: a retired
    // bridge's source is nobody's current game, and holding those bytes after
    // the frame is gone would be a leak with no reader.
    this.overCaps = null
    this.freezeInput(false)
    this.iframe = null
  }
}
