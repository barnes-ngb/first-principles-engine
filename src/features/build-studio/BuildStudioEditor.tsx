/**
 * The child's own studio: the editor, the Save, the shelf and the helper
 * (LOCAL-BUILD-001).
 *
 * ── Whose work is this? Captured, never read live ────────────────────────
 *
 * `childId` arrives as a PROP and every write uses it. Nothing here reads the
 * shell's active-child hook — `useCreativeTimer`'s defect was a write that
 * resolved its child when it FINISHED rather than when it started, and a game
 * save is the most expensive version of that mistake in the app. The identity
 * is captured in a {@link BuildStudioScope} when the editor mounts, carried on
 * the pending payload, and used by the write. **BIND.**
 *
 * ── An editor save is not an app save ───────────────────────────────────
 *
 * MakeCode saves constantly; those arrive as `workspacesave` and all they do
 * here is light the "not saved yet" mark and bump a source revision. **Saved**
 * appears only after `saveBuildStudioVersion` resolves.
 *
 * ── Three latches, and why each one exists ──────────────────────────────
 *
 *   1. `saveLatchRef` — claimed SYNCHRONOUSLY before the first await, so two
 *      taps in one tick cannot both start a capture.
 *   2. the bridge's own capture serialization, so one `saveproject` is in
 *      flight at a time and its payload cannot be overwritten by another.
 *   3. `noteLatchRef` — the same, for *Save my words*.
 *
 * ── An old acknowledgment cannot clear newer work ───────────────────────
 *
 * Every payload records the source revision it was captured at. When the write
 * lands, the dirty mark clears only if the live revision still equals it;
 * otherwise an edit arrived during the write and the editor stays dirty. And
 * every post-await UI update is gated on the live scope token, which is retired
 * on unmount and on every visit change — so a late completion can never land in
 * a new visit.
 *
 * ── Nothing here is scored ──────────────────────────────────────────────
 *
 * No streak, no level, no meter, no reward, no completion. Hints are counted as
 * OFFERED, never as heard: the app asked the browser to speak, which is not
 * evidence a child listened.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import VoiceInput from '../../components/VoiceInput'
import {
  saveBuildStudioNote,
  BuildStudioNoteRefused,
} from '../../core/firebase/buildStudioNoteWrites'
import {
  saveBuildStudioVersion,
  BuildStudioRefused,
} from '../../core/firebase/buildStudioVersionWrites'
import { useTTS } from '../../core/hooks/useTTS'
import { useProfile } from '../../core/profile/useProfile'
import {
  parseBuildStudioSource,
  type BuildStudioSourceFiles,
  type BuildStudioVersion,
} from '../../core/types/buildStudio'
import type { UserProfile } from '../../core/types/enums'
import {
  ARCADE_OPENING_TIMEOUT_MS,
  ArcadeBridge,
  type AcceptedProject,
} from './arcadeBridge'
import {
  ARCADE_PLAIN_EDITOR_URL,
  buildStudioDownloads,
  downloadTextFile,
  readRecoveryArchive,
  RecoveryRefused,
} from './buildStudioExport'
import {
  BUILD_STUDIO_GOAL_LINE,
  BUILD_STUDIO_HINTS_DONE,
  BUILD_STUDIO_HINT_COUNT,
  goalSpeech,
  lifeBlockLabel,
  nextHint,
  readOpenLifeValue,
  type OpenLifeValue,
} from './buildStudioHints'
import {
  clearPendingSave,
  holdPendingSave,
  pendingSlotAccepts,
  readPendingSave,
  type PendingOwner,
} from './buildStudioPendingStore'
import {
  newBridgeId,
  newNoteActionId,
  newVersionId,
  newVisitId,
  noteTargetKey,
  sameNoteTarget,
  scopeToken,
  sourceSignature,
  type BuildStudioNoteTarget,
  type BuildStudioScope,
  type PendingSave,
} from './buildStudioScope'
import {
  BUILD_STUDIO_GOAL,
  BUILD_STUDIO_PROJECT_NAME,
  reopenedVersionLooksLoaded,
  starterImportLooksCorrect,
  starterSourceFiles,
  STARTER_PROJECT_PNG_URL,
  STARTER_TUNING_NUMBERS,
} from './buildStudioStarter'
import BuildStudioVersionShelf from './BuildStudioVersionShelf'
import { useBuildStudioDepartureGuard } from './useBuildStudioDepartureGuard'
import { versionBelongsTo, type BuildStudioVersionsRead } from './useBuildStudioVersions'

/** What the frame is doing. Editing is gated on `Ready` AND `projectReady`. */
const EditorPhase = {
  Opening: 'opening',
  Importing: 'importing',
  Ready: 'ready',
  Failed: 'failed',
} as const
type EditorPhase = (typeof EditorPhase)[keyof typeof EditorPhase]

const SaveState = {
  Idle: 'idle',
  Snapshotting: 'snapshotting',
  Writing: 'writing',
  Saved: 'saved',
  Failed: 'failed',
} as const
type SaveState = (typeof SaveState)[keyof typeof SaveState]

/** How many times one Save payload is sent in total: the try, and one retry. */
const MAX_AUTOMATIC_ATTEMPTS = 2

/** The sentinel a retired visit's token is set to. Matches nothing. */
const RETIRED = '\u0000retired'

const SAVED_LINE = 'Saved. Your game is on your shelf.'
const SAVED_ALREADY_LINE = 'Saved — that one was already on your shelf.'
const SAVED_BUT_NEWER_LINE =
  'Saved. You have made more changes since then — tap Save again to keep those too.'

export interface BuildStudioEditorProps {
  familyId: string
  /** The child this studio is FOR. Captured; never re-read from the shell. */
  childId: string
  childName: string
  projectId: string
  versions: BuildStudioVersionsRead
  /**
   * Told when a write completed for a scope that is no longer on screen, so
   * the page can say so honestly instead of the save vanishing.
   */
  onOutOfScopeSave?: (detail: string) => void
}

export default function BuildStudioEditor({
  familyId,
  childId,
  childName,
  projectId,
  versions,
  onOutOfScopeSave,
}: BuildStudioEditorProps) {
  const tts = useTTS()
  const { selectProfile, registerProfileChangeGuard } = useProfile()

  const owner: PendingOwner = useMemo(
    () => ({ familyId, childId, projectId }),
    [familyId, childId, projectId],
  )

  // ── The visit ────────────────────────────────────────────────────────────
  const [visit, setVisit] = useState(() => ({
    visitId: newVisitId(Date.now(), Math.random()),
    version: null as BuildStudioVersion | null,
  }))

  const scope: BuildStudioScope = useMemo(
    () => ({
      familyId,
      childId,
      projectId,
      visitId: visit.visitId,
      versionId: visit.version?.versionId ?? null,
    }),
    [familyId, childId, projectId, visit],
  )
  const token = scopeToken(scope)

  /**
   * The live scope, for the bridge's re-check and for every post-await UI
   * update. Retired on unmount AND on every visit change — the cleanup runs
   * before the next effect body, so there is no window in which a retired
   * visit's token reads as live.
   */
  const liveTokenRef = useRef(RETIRED)
  useEffect(() => {
    liveTokenRef.current = token
    return () => {
      liveTokenRef.current = RETIRED
    }
  }, [token])

  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  /**
   * One editor session: the scope token, the bridge and the frame URL, created
   * together and rendered only while `session.token === token`.
   *
   * Three separate pieces of state meant a render could put the PREVIOUS
   * frame's URL into a new iframe while an effect was still updating the URL —
   * a frame and a bridge that did not belong to the same visit, which is how a
   * reopen could sit on "Opening…" forever. The iframe is keyed by
   * `bridge.frameId`, so a new bridge always gets a new element.
   */
  const [session, setSession] = useState<{
    token: string
    bridge: ArcadeBridge
    url: string
  } | null>(null)
  const liveSession = session && session.token === token ? session : null
  /** The live bridge, for handlers. Written in an effect, never during render. */
  const bridgeRef = useRef<ArcadeBridge | null>(null)
  useEffect(() => {
    bridgeRef.current = liveSession?.bridge ?? null
  }, [liveSession])

  const [phase, setPhase] = useState<EditorPhase>(EditorPhase.Opening)
  /** Did the round trip prove a usable project is open? Save is gated on it. */
  const [projectReady, setProjectReady] = useState(false)
  const [openFailure, setOpenFailure] = useState<string | null>(null)
  const [advisory, setAdvisory] = useState<string | null>(null)
  const [loadedToken, setLoadedToken] = useState<string | null>(null)
  /** The life number in the source that is actually open. Drives the hints. */
  const [openLives, setOpenLives] = useState<OpenLifeValue>(null)
  /** True while the simulator is expanded for play. */
  const [playing, setPlaying] = useState(false)

  /** The editor saved since the last durable app save. */
  const [editorDirty, setEditorDirty] = useState(false)
  /**
   * The signature of the source this app currently believes is on the shelf (or
   * was just imported), and the signature of the last source the EDITOR
   * announced. Dirty is `announced !== settled`, which is a comparison of
   * CONTENT — so the capture's own `workspacesave` events, a duplicate callback
   * and a startup callback all read clean, and only a real edit reads dirty.
   */
  const settledSignatureRef = useRef<string | null>(null)
  const announcedSignatureRef = useRef<string | null>(null)

  const [label, setLabel] = useState('')
  const [saveState, setSaveState] = useState<SaveState>(SaveState.Idle)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  /** The exact payload a retry re-sends. Never rebuilt from the editor. */
  const [pending, setPending] = useState<PendingSave | null>(() => readPendingSave({
    familyId,
    childId,
    projectId,
  }))
  const [lastSaved, setLastSaved] = useState<
    { versionId: string; versionDocId: string; label: string } | null
  >(null)

  /**
   * Claimed synchronously, before any await. The write-concurrency latch.
   *
   * It holds the OPERATION's own id rather than a boolean, so an older
   * operation's `finally` cannot release a newer operation's claim — which a
   * shared boolean would, since a visit change does not remount this component.
   */
  const saveLatchRef = useRef<string | null>(null)
  const noteLatchRef = useRef<string | null>(null)

  const [hintsOffered, setHintsOffered] = useState(0)
  const [noteDraft, setNoteDraft] = useState<
    {
      text: string
      capture: 'voice' | 'typed'
      /** Preserved even after a typed correction — see the handler. */
      voiceEventId?: string
      target: BuildStudioNoteTarget
    } | null
  >(null)
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [noteMessage, setNoteMessage] = useState<string | null>(null)

  const [confirmReopen, setConfirmReopen] = useState<BuildStudioVersion | null>(null)
  const [openingVersionId, setOpeningVersionId] = useState<string | null>(null)

  const writeInFlight = saveState === SaveState.Snapshotting || saveState === SaveState.Writing

  // ── Departure ───────────────────────────────────────────────────────────
  //
  // Refs so the predicates answer at NAVIGATION time rather than at the last
  // render — the `useUnsavedBookGuard` rule. Written in effects (never during
  // render) and also written synchronously by the handlers that start a write,
  // so a tap that saves and then navigates is still held.
  const atRiskRef = useRef(false)
  const inFlightRef = useRef(false)
  useEffect(() => {
    atRiskRef.current = editorDirty || pending !== null
  }, [editorDirty, pending])
  useEffect(() => {
    inFlightRef.current = writeInFlight
  }, [writeInFlight])

  /**
   * An edit can exist that the app has not been told about: a child types 4
   * into the blocks and taps Today before MakeCode emits `workspacesave`. The
   * app has NO signal for that, so while the editor is live "nothing at risk"
   * is never assumed — the departure is held, a capture answers it, and a clean
   * answer releases it immediately.
   *
   * `cleanConfirmedRef` is therefore transient: it is set by that capture and
   * cleared the moment the departure ends. A durable flag would be a promise
   * about the future that no edit announces.
   */
  const editorLiveRef = useRef(false)
  const cleanConfirmedRef = useRef(false)
  useEffect(() => {
    editorLiveRef.current = phase === EditorPhase.Ready && projectReady
  }, [phase, projectReady])

  const hasWorkAtRisk = useCallback(
    () => atRiskRef.current || (editorLiveRef.current && !cleanConfirmedRef.current),
    [],
  )
  const writeIsInFlight = useCallback(() => inFlightRef.current, [])
  const departure = useBuildStudioDepartureGuard({
    hasWorkAtRisk,
    writeInFlight: writeIsInFlight,
  })

  /** What a pre-departure capture found. `idle` while nothing is being left. */
  const [departureCheck, setDepartureCheck] = useState<
    'idle' | 'checking' | 'clean' | 'dirty' | 'unknown'
  >('idle')
  /** A profile change a guard is holding, with its own dialog. */
  const [heldProfile, setHeldProfile] = useState<UserProfile | null>(null)
  /** What the capture for THAT held change found. */
  const [profileCheck, setProfileCheck] = useState<
    'idle' | 'checking' | 'clean' | 'dirty' | 'unknown'
  >('idle')
  /**
   * The ask that is live, with its own id.
   *
   * Identity-scoped so a capture that resolves after the person chose *Stay
   * here* cannot still call `selectProfile`. Cleared by Stay, by closing the
   * dialog, by a visit change and by unmount.
   */
  const profileAskRef = useRef<{ id: number; next: UserProfile } | null>(null)
  const profileAskSeqRef = useRef(0)
  /** Consumed once by the guard, so "Switch anyway" is one explicit act. */
  const allowProfileOnceRef = useRef(false)

  /** The bytes a pre-departure capture found, for "Save it now". */
  const departureFilesRef = useRef<BuildStudioSourceFiles | null>(null)

  /**
   * Capture the editor's source NOW and say whether it matches the shelf.
   *
   * This is the pre-departure capture: it runs while the old editor is still
   * intact, which is the only moment an unannounced edit can still be read.
   * `unknown` is its own answer — a capture that fails is not a clean exit.
   */
  const checkSourceNow = useCallback(async (): Promise<'clean' | 'dirty' | 'unknown'> => {
    const bridge = bridgeRef.current
    if (!bridge || !editorLiveRef.current || inFlightRef.current) return 'unknown'
    const ownToken = token
    try {
      const snapshot = await bridge.requestSnapshot()
      if (liveTokenRef.current !== ownToken) return 'unknown'
      const sig = sourceSignature(snapshot.files)
      announcedSignatureRef.current = sig
      const clean = sig === settledSignatureRef.current
      setEditorDirty(!clean)
      departureFilesRef.current = clean ? null : snapshot.files
      return clean ? 'clean' : 'dirty'
    } catch {
      return 'unknown'
    }
  }, [token])

  /**
   * A held SPA departure is checked against the editor before anybody is
   * warned. A clean exit releases itself, so an ordinary "Save, then Today"
   * shows no dialog.
   *
   * ── Why the run is identified by a ref, not by the effect's cleanup ──────
   *
   * The first version cancelled itself. `setDepartureCheck('checking')` was its
   * own dependency, so the state change re-ran the effect, the cleanup set
   * `cancelled = true` on the still-pending capture, and the `!== 'idle'` early
   * return meant nothing replaced it — every ordinary Today departure stranded
   * on "Checking your game…" forever.
   *
   * So the run carries an identity (`departureRunRef`), and the callback
   * applies only while that identity is still the live one. Retirement is the
   * only thing that invalidates it: the departure ending, the visit's token
   * changing, or unmount. A state change this effect caused is not retirement.
   */
  /** The run that owns the current hold, or `null` when nothing is held. */
  const departureRunRef = useRef<number | null>(null)
  const departureSeqRef = useRef(0)

  useEffect(() => {
    if (!departure.held) {
      // The hold ended: retire any run still in flight and reset for the next.
      departureRunRef.current = null
      cleanConfirmedRef.current = false
      setDepartureCheck('idle')
      return
    }
    // One run per hold. `departureCheck` is deliberately NOT a dependency, and
    // this effect has NO cleanup, so its own state change cannot cancel it.
    if (departureRunRef.current !== null) return
    departureSeqRef.current += 1
    const runId = departureSeqRef.current
    departureRunRef.current = runId
    if (inFlightRef.current || atRiskRef.current) {
      setDepartureCheck('dirty')
      return
    }
    const ownToken = token
    setDepartureCheck('checking')
    void checkSourceNow().then((result) => {
      // Still the live run, and still the same visit.
      if (departureRunRef.current !== runId) return
      if (liveTokenRef.current !== ownToken) return
      setDepartureCheck(result)
      if (result === 'clean') {
        // Verified clean while the editor was still intact, so the person is
        // not asked a question about nothing — the departure they already
        // chose simply continues.
        cleanConfirmedRef.current = true
        departure.leaveAnyway()
      }
    })
  }, [departure, token, checkSourceNow])

  // Real retirement: this visit is gone, so no departure callback may land.
  useEffect(
    () => () => {
      departureRunRef.current = null
    },
    [token],
  )

  /**
   * The profile change, which is immediate and has no router hold.
   *
   * `ProfileMenu` switches straight away, this editor unmounts, and an edit it
   * had not been told about is gone — so the guard is the last moment the work
   * is still intact. It refuses conservatively and asks; nothing else in the
   * app registers one, so every other surface behaves exactly as before.
   */
  useEffect(() => {
    if (!registerProfileChangeGuard) return
    const unregister = registerProfileChangeGuard((next) => {
      if (allowProfileOnceRef.current) {
        allowProfileOnceRef.current = false
        return true
      }
      if (!inFlightRef.current && !hasWorkAtRisk()) return true

      // Each refusal is its own ASK, with its own identity. A late result may
      // only act while that exact ask is still the live one — so choosing
      // *Stay here* can never be followed, seconds later, by the profile
      // changing anyway.
      profileAskSeqRef.current += 1
      const askId = profileAskSeqRef.current
      profileAskRef.current = { id: askId, next }
      const ownToken = token
      setHeldProfile(next)
      setProfileCheck('checking')
      void checkSourceNow().then((result) => {
        if (profileAskRef.current?.id !== askId) return
        if (liveTokenRef.current !== ownToken) return
        setProfileCheck(result)
        if (result !== 'clean') return
        // Verified clean while the editor was still here, so the change the
        // person already asked for simply happens.
        profileAskRef.current = null
        allowProfileOnceRef.current = true
        setHeldProfile(null)
        setProfileCheck('idle')
        selectProfile(next)
      })
      return false
    })
    return () => {
      // Unmount, or a visit change, retires any ask in flight — so a capture
      // that answers afterwards changes nothing.
      profileAskRef.current = null
      setHeldProfile(null)
      setProfileCheck('idle')
      unregister()
    }
  }, [registerProfileChangeGuard, hasWorkAtRisk, checkSourceNow, selectProfile, token])

  /** Abandon the held profile change. Nothing may act on it afterwards. */
  const cancelProfileAsk = useCallback(() => {
    profileAskRef.current = null
    setHeldProfile(null)
    setProfileCheck('idle')
  }, [])

  /** Make the held profile change, now, as one explicit act. */
  const confirmProfileAsk = useCallback(() => {
    const ask = profileAskRef.current
    profileAskRef.current = null
    setHeldProfile(null)
    setProfileCheck('idle')
    if (!ask) return
    allowProfileOnceRef.current = true
    selectProfile(ask.next)
  }, [selectProfile])

  /**
   * Keep an unfinished Save for its owner across an unmount.
   *
   * Strictly owner-bound (family + child + project), in memory only. This is
   * what makes the retry still there on coming back, which verification found
   * missing.
   */
  useEffect(() => {
    if (pending) holdPendingSave(owner, pending)
  }, [pending, owner])

  // ── The session, one per visit ──────────────────────────────────────────
  useEffect(() => {
    const bridge = new ArcadeBridge({
      projectName: BUILD_STUDIO_PROJECT_NAME,
      isScopeLive: () => liveTokenRef.current === token,
      newId: () => newBridgeId(Date.now(), Math.random()),
      // A late readiness from a frame whose visit has retired must not revive
      // it, so the token is checked here as well as inside the bridge.
      onEditorLoaded: () => {
        if (liveTokenRef.current === token) setLoadedToken(token)
      },
      onEditorSave: (project) => {
        const sig = sourceSignature(project.files)
        announcedSignatureRef.current = sig
        setEditorDirty(sig !== settledSignatureRef.current)
      },
    })
    setSession({ token, bridge, url: bridge.frameUrl() })
    setPhase(EditorPhase.Opening)
    setProjectReady(false)
    setOpenFailure(null)
    setAdvisory(null)
    setEditorDirty(false)
    setPlaying(false)
    setOpenLives(null)
    settledSignatureRef.current = null
    announcedSignatureRef.current = null
    window.addEventListener('message', bridge.handleMessage)
    return () => {
      window.removeEventListener('message', bridge.handleMessage)
      bridge.dispose()
      // Only this bridge's own session is torn down — StrictMode's second
      // setup has already replaced it by the time the first cleanup runs.
      setSession((current) => (current?.bridge === bridge ? null : current))
    }
  }, [token])

  // The frame element, bound as soon as it exists — before the editor's first
  // `workspacesync`, which `onLoad` alone does not guarantee.
  useEffect(() => {
    const frame = iframeRef.current
    if (liveSession && frame) liveSession.bridge.attach(frame)
  }, [liveSession])

  // ── The opening deadline ───────────────────────────────────────────────
  //
  // Every other deadline belongs to a request, and every request waits for the
  // handshake — so a frame that never hands shakes had none. Cleared by the
  // handshake (which re-runs this effect into its early return), by a token
  // change, and by unmount.
  useEffect(() => {
    if (!liveSession) return
    if (loadedToken === token) return
    const timer = setTimeout(() => {
      if (liveTokenRef.current !== token) return
      setPhase(EditorPhase.Failed)
      setProjectReady(false)
      setOpenFailure(
        'The editor did not open in time. Nothing of yours was lost — tap Try again, or a grown-up can open the starter directly.',
      )
    }, ARCADE_OPENING_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [liveSession, loadedToken, token])

  /** Start a brand new visit on the same version — the Try again door. */
  const reopenCurrent = useCallback(() => {
    setLoadedToken(null)
    setVisit((current) => ({
      visitId: newVisitId(Date.now(), Math.random()),
      version: current.version,
    }))
  }, [])

  // ── Import, then CHECK that it really arrived ──────────────────────────
  useEffect(() => {
    if (loadedToken !== token) return
    const bridge = bridgeRef.current
    if (!bridge) return
    let cancelled = false
    const live = () => !cancelled && liveTokenRef.current === token

    void (async () => {
      setPhase(EditorPhase.Importing)
      try {
        const reopening = visit.version
        const files: BuildStudioSourceFiles = reopening
          ? // The chosen version's OWN bytes, read back from its archive —
            // never "whatever the latest frame happens to hold".
            parseBuildStudioSource(reopening.sourceArchive)
          : starterSourceFiles()
        // What the app believes is on the shelf for this visit: a reopened
        // version IS a saved version, and a freshly imported starter is
        // unchanged. Either way the editor's first `workspacesave` carries
        // these same bytes and must read CLEAN.
        settledSignatureRef.current = sourceSignature(files)
        await bridge.importProject(files)
        if (!live()) return

        // Best effort and never awaited by anything the child waits for: what
        // the editor says it IS, from its own `info` reply.
        void bridge.requestInfo()

        // The acceptance check, run by the app rather than assumed — and NOT a
        // `switchblocks` acknowledgment, which says nothing about whether a
        // decompile happened. The starter ships populated Blocks, so what is
        // being verified is that they arrived.
        let round: AcceptedProject | null = null
        try {
          round = await bridge.requestSnapshot()
        } catch {
          round = null
        }
        if (!live()) return
        setPhase(EditorPhase.Ready)

        if (!round) {
          // No round trip means no proof a usable project is open, so the
          // edit/save controls stay closed rather than letting him work in
          // something this page cannot read back.
          setProjectReady(false)
          setAdvisory(
            'The editor opened but this page could not read the game back, so saving is turned off for now. Use the starter download below, or reload the page.',
          )
          return
        }

        setOpenLives(readOpenLifeValue(round.files['main.ts']))
        // The round trip IS a capture, so it also answers "is the open source
        // what the shelf holds" — which makes a freshly opened project a clean
        // exit rather than an unanswered question.
        const roundSig = sourceSignature(round.files)
        announcedSignatureRef.current = roundSig
        setEditorDirty(roundSig !== settledSignatureRef.current)
        const ok = reopening
          ? reopenedVersionLooksLoaded(round.files)
          : starterImportLooksCorrect(round.files)
        setProjectReady(ok)
        setAdvisory(
          ok
            ? null
            : reopening
              ? 'That saved game did not open properly, so saving is turned off to protect it. Use Download a copy, or try opening it again.'
              : 'The starter did not open properly, so saving is turned off. Nothing is lost — a grown-up can import the starter file below into MakeCode.',
        )
      } catch (err) {
        if (cancelled) return
        setPhase(EditorPhase.Failed)
        setProjectReady(false)
        setOpenFailure(
          err instanceof Error
            ? err.message
            : 'The editor would not open. Nothing was lost.',
        )
      }
    })()

    return () => {
      cancelled = true
    }
  }, [loadedToken, token, visit.version])

  // ── Save ───────────────────────────────────────────────────────────────

  /**
   * Send ONE payload, with one automatic retry of the exact same bytes and the
   * exact same id. A loop rather than recursion, so "how many times may this be
   * sent" is one readable condition. `attempts` lives on the payload, so a
   * MANUAL retry continues the same action rather than restarting the count.
   */
  const commit = useCallback(
    async (payload: PendingSave) => {
      let attempt: PendingSave = payload
      const ownToken = scopeToken(payload.scope)
      const ownOwner: PendingOwner = {
        familyId: payload.scope.familyId,
        childId: payload.scope.childId,
        projectId: payload.scope.projectId,
      }
      for (;;) {
        attempt = { ...attempt, attempts: attempt.attempts + 1 }
        const sending = attempt
        // Identity-conditional, through the SAME rule the store uses: an older
        // save's retry may not take a newer save's recovery slot, and may not
        // replace it on screen either.
        setPending((current) => (pendingSlotAccepts(current, sending) ? sending : current))
        holdPendingSave(ownOwner, sending)
        setSaveState(SaveState.Writing)
        try {
          const result = await saveBuildStudioVersion({
            familyId: attempt.scope.familyId,
            // The OWNER, from the captured scope.
            childId: attempt.scope.childId,
            projectId: attempt.scope.projectId,
            versionId: attempt.versionId,
            files: attempt.files,
            label: attempt.label,
            createdAt: attempt.createdAt,
            editorTarget: attempt.editorTarget,
            editorTargetVersion: attempt.editorTargetVersion,
            goalId: attempt.goalId,
            visitId: attempt.scope.visitId,
          })
          // Durable now, whatever the screen is showing. This save releases
          // ITS OWN recovery slot and no other — an owner-only clear let an old
          // acknowledgment wipe a newer save's exact retry.
          clearPendingSave(ownOwner, attempt.versionId)
          if (liveTokenRef.current !== ownToken) {
            // An accepted write bound to its owner finished after the page
            // moved on. Not undone, not silently dropped, and NOT applied to
            // whatever visit is mounted now.
            onOutOfScopeSave?.(
              `A save started earlier finished and is on the shelf as “${attempt.label}”.`,
            )
            return
          }
          // What is on the shelf is now these bytes, so that is what "clean"
          // means from here on.
          settledSignatureRef.current = attempt.capturedSignature
          // Did a REAL new edit arrive while this was writing? Compared by
          // content: the capture's own save events carry the captured bytes and
          // read clean, and only different bytes read dirty. An editor that has
          // announced nothing yet is also clean.
          const announced = announcedSignatureRef.current
          const stillCurrent = announced === null || announced === attempt.capturedSignature
          setSaveState(SaveState.Saved)
          setSaveMessage(
            !stillCurrent
              ? SAVED_BUT_NEWER_LINE
              : result.outcome === 'alreadySaved'
                ? SAVED_ALREADY_LINE
                : SAVED_LINE,
          )
          setLastSaved({
            versionId: attempt.versionId,
            versionDocId: result.version.id,
            label: attempt.label,
          })
          setEditorDirty(!stillCurrent)
          // Only this save's own row leaves the screen. A newer pending save
          // stays exactly where it is.
          setPending((current) =>
            current && current.versionId === attempt.versionId ? null : current,
          )
          setLabel('')
          return
        } catch (err) {
          // A refusal is deterministic — the same payload will be refused
          // again, so it is never auto-retried. Everything else gets exactly
          // ONE automatic retry of the EXACT payload and identity.
          const deterministic = err instanceof BuildStudioRefused
          if (!deterministic && attempt.attempts < MAX_AUTOMATIC_ATTEMPTS) {
            continue
          }
          if (liveTokenRef.current !== ownToken) {
            // Failed for a retired visit. The payload stays held for its owner
            // so the retry is waiting when he comes back.
            onOutOfScopeSave?.(
              'A save started earlier did not finish. It is still waiting to be tried again.',
            )
            return
          }
          setSaveState(SaveState.Failed)
          setSaveMessage(
            err instanceof Error
              ? err.message
              : 'That did not save. Your game is still open — try again.',
          )
          // `pending` is deliberately kept, so the manual retry re-sends the
          // same bytes and the same id rather than taking a fresh snapshot.
          return
        }
      }
    },
    [onOutOfScopeSave],
  )

  const handleSave = useCallback(async () => {
    // ── Latch 1: claimed synchronously, before the first await ──────────
    if (saveLatchRef.current) return
    const bridge = bridgeRef.current
    if (!bridge || phase !== EditorPhase.Ready || !projectReady) return
    // The latch holds an OPERATION id, so an older operation's `finally`
    // cannot release a newer one's claim.
    const opId = newVersionId(Date.now(), Math.random())
    saveLatchRef.current = opId
    // Synchronously, so a navigation in the same gesture is already held.
    inFlightRef.current = true
    atRiskRef.current = true
    setSaveState(SaveState.Snapshotting)
    setSaveMessage(null)
    // The previous unfinished payload is deliberately NOT cleared here. If this
    // capture fails there is still work waiting to be retried, and clearing it
    // first would hide it; `commit` replaces it the moment a new one exists.
    try {
      let snapshot: AcceptedProject
      try {
        snapshot = await bridge.requestSnapshot()
      } catch (err) {
        if (liveTokenRef.current !== token) return
        setSaveState(SaveState.Failed)
        setSaveMessage(
          err instanceof Error
            ? err.message
            : 'The editor did not hand the game over. Nothing was saved.',
        )
        return
      }
      if (liveTokenRef.current !== token) {
        setSaveState(SaveState.Idle)
        return
      }
      // The signature of the bytes that were ACTUALLY captured, taken from the
      // fenced result rather than from a counter read before the capture began.
      const runtime = bridge.runtimeVersions()
      const payload: PendingSave = {
        scope,
        versionId: newVersionId(Date.now(), Math.random()),
        label: label.trim() || defaultLabel(versions.versions.length + 1),
        createdAt: new Date().toISOString(),
        files: snapshot.files,
        // From the editor's own `info` reply, or left UNKNOWN. Never the
        // project header's `targetVersion`, which is a `0.0.0` placeholder.
        editorTarget: runtime?.target ? 'arcade' : undefined,
        editorTargetVersion: runtime?.target,
        goalId: BUILD_STUDIO_GOAL.id,
        attempts: 0,
        capturedSignature: sourceSignature(snapshot.files),
      }
      await commit(payload)
    } finally {
      // Only if this operation still owns them.
      if (saveLatchRef.current === opId) {
        saveLatchRef.current = null
        inFlightRef.current = false
      }
    }
  }, [phase, projectReady, label, scope, token, versions.versions.length, commit])

  const handleRetrySave = useCallback(async () => {
    if (saveLatchRef.current) return
    if (!pending) return
    const opId = newVersionId(Date.now(), Math.random())
    saveLatchRef.current = opId
    inFlightRef.current = true
    try {
      await commit(pending)
    } finally {
      if (saveLatchRef.current === opId) {
        saveLatchRef.current = null
        inFlightRef.current = false
      }
    }
  }, [pending, commit])

  /**
   * Save the bytes a pre-departure capture already read.
   *
   * No second capture: the editor may be about to go away, and the bytes in
   * hand are the ones the person was shown a warning about.
   */
  const handleSaveCaptured = useCallback(async () => {
    const files = departureFilesRef.current
    if (!files || saveLatchRef.current) return
    const opId = newVersionId(Date.now(), Math.random())
    saveLatchRef.current = opId
    inFlightRef.current = true
    try {
      const runtime = bridgeRef.current?.runtimeVersions() ?? null
      await commit({
        scope,
        versionId: newVersionId(Date.now(), Math.random()),
        label: label.trim() || defaultLabel(versions.versions.length + 1),
        createdAt: new Date().toISOString(),
        files,
        editorTarget: runtime?.target ? 'arcade' : undefined,
        editorTargetVersion: runtime?.target,
        goalId: BUILD_STUDIO_GOAL.id,
        attempts: 0,
        capturedSignature: sourceSignature(files),
      })
      departureFilesRef.current = null
    } finally {
      if (saveLatchRef.current === opId) {
        saveLatchRef.current = null
        inFlightRef.current = false
      }
    }
  }, [commit, scope, label, versions.versions.length])

  const handleDiscardPending = useCallback(() => {
    // Discards exactly the payload that was shown, by its own id.
    if (!pending) return
    clearPendingSave(owner, pending.versionId)
    setPending((current) =>
      current && current.versionId === pending.versionId ? null : current,
    )
    setSaveState(SaveState.Idle)
    setSaveMessage(null)
  }, [owner, pending])

  /**
   * Get the EDITED bytes out.
   *
   * The pending payload first, because that is the exact source a failed save
   * was carrying. Never the starter — substituting the starter for failed work
   * would replace what he made with what he began from.
   */
  const handleDownloadCurrent = useCallback(async () => {
    // The LATEST source first, never a stale template: a pre-departure capture
    // read the newest bytes, then a failed save's exact payload, then whatever
    // the editor last announced.
    const files =
      departureFilesRef.current ??
      pending?.files ??
      bridgeRef.current?.editorSaveSeen()?.files ??
      null
    if (!files) {
      setSaveMessage('There was nothing to download yet.')
      return
    }
    for (const download of buildStudioDownloads(files, pending?.label ?? 'my-game')) {
      downloadTextFile(download)
    }
  }, [pending])

  // ── Reopen ─────────────────────────────────────────────────────────────

  const openVersion = useCallback(
    (version: BuildStudioVersion) => {
      // Checked AGAIN here, not only on the shelf: this is the action that
      // imports bytes, and a row for another project under the same child must
      // never load as this project.
      if (!versionBelongsTo(version, childId, projectId)) {
        setConfirmReopen(null)
        setSaveMessage('That saved game is not part of this one, so it was not opened.')
        return
      }
      setOpeningVersionId(version.versionId)
      setConfirmReopen(null)
      setSaveState(SaveState.Idle)
      setSaveMessage(null)
      setLastSaved(null)
      setNoteDraft(null)
      setNoteState('idle')
      setNoteMessage(null)
      setHintsOffered(0)
      setLoadedToken(null)
      // A brand new visit: a new id, so nothing from the previous one can act
      // here even on an `A → B → A`.
      setVisit({ visitId: newVisitId(Date.now(), Math.random()), version })
    },
    [childId, projectId],
  )

  useEffect(() => {
    if (phase === EditorPhase.Ready || phase === EditorPhase.Failed) {
      setOpeningVersionId(null)
    }
  }, [phase])

  const requestOpen = useCallback(
    (version: BuildStudioVersion) => {
      if (writeInFlight) return
      if (editorDirty || pending) {
        setConfirmReopen(version)
        return
      }
      openVersion(version)
    },
    [writeInFlight, editorDirty, pending, openVersion],
  )

  /**
   * Put a previously downloaded archive back into the open editor.
   *
   * The route back in, so the download really is a recovery. An explicit
   * action, bounded and checked by `readRecoveryArchive`, and it imports into
   * the CURRENT visit rather than inventing one — so the scope, the frame and
   * the gating are the ones already in force. It writes nothing: the child saves
   * it himself afterwards, which is the only way it becomes a version.
   */
  const handleRecoveryFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      const bridge = bridgeRef.current
      if (!bridge || phase !== EditorPhase.Ready) return
      const ownToken = token
      try {
        const files = readRecoveryArchive(await file.text())
        if (liveTokenRef.current !== ownToken) return
        await bridge.importProject(files)
        if (liveTokenRef.current !== ownToken) return
        setOpenLives(readOpenLifeValue(files['main.ts']))
        setEditorDirty(true)
        setSaveMessage(
          'That game file is open in the editor. Tap Save my version to keep it here.',
        )
        setSaveState(SaveState.Idle)
      } catch (err) {
        if (liveTokenRef.current !== ownToken) return
        setSaveMessage(
          err instanceof RecoveryRefused || err instanceof Error
            ? err.message
            : 'That file could not be opened.',
        )
        setSaveState(SaveState.Failed)
      }
    },
    [phase, token],
  )

  const handleDownloadVersion = useCallback((version: BuildStudioVersion) => {
    try {
      for (const download of buildStudioDownloads(
        parseBuildStudioSource(version.sourceArchive),
        version.label,
      )) {
        downloadTextFile(download)
      }
    } catch {
      setSaveMessage('That saved version could not be read for download.')
    }
  }, [])

  // ── The helper: it talks, and that is all it can do ───────────────────

  const handleHearGoal = useCallback(() => {
    tts.speak(goalSpeech(openLives).join(' '))
  }, [tts, openLives])

  const handleHint = useCallback(() => {
    const hint = nextHint(hintsOffered, openLives)
    if (!hint) {
      tts.speak(BUILD_STUDIO_HINTS_DONE)
      return
    }
    setHintsOffered(hint.rung)
    tts.speak(hint.text)
  }, [hintsOffered, openLives, tts])

  const currentHint = hintsOffered > 0 ? nextHint(hintsOffered - 1, openLives) : null

  // ── The reflection ────────────────────────────────────────────────────

  /**
   * What a reflection recorded right now would be ABOUT.
   *
   * `null` until a version has been acknowledged in THIS visit, which is what
   * makes the target unambiguous. `noteActionId` is minted with the target, so
   * the words, the save they are about and the id the write is idempotent on
   * are all decided at the same moment.
   */
  const noteTarget: BuildStudioNoteTarget | null = useMemo(() => {
    if (!lastSaved) return null
    return {
      familyId,
      childId,
      projectId,
      versionId: lastSaved.versionId,
      versionDocId: lastSaved.versionDocId,
      visitId: visit.visitId,
      noteActionId: newNoteActionId(Date.now(), Math.random()),
      help: hintsOffered > 0 ? 'hints-offered' : 'none-offered',
      hintsOffered: hintsOffered > 0 ? hintsOffered : undefined,
    }
    // `hintsOffered` is deliberately NOT a dependency: the target is frozen
    // when the save is acknowledged, and a hint offered afterwards describes
    // what came next, not what he was doing when he said this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSaved, familyId, childId, projectId, visit.visitId])

  /** A draft whose target is no longer the live one is retired, not written. */
  const draftIsStale = noteDraft !== null && !sameNoteTarget(noteDraft.target, noteTarget)

  const handleSaveNote = useCallback(async () => {
    if (noteLatchRef.current) return
    if (!noteDraft) return
    // Before the await: the captured target must still be the live one. A draft
    // about V1 is never written against V2.
    if (!sameNoteTarget(noteDraft.target, noteTarget)) {
      setNoteState('failed')
      setNoteMessage(
        'Those words were about an earlier save, so they were not filed. Say them again for this one.',
      )
      return
    }
    const target = noteDraft.target
    const draftText = noteDraft.text
    const ownToken = token
    const opId = newNoteActionId(Date.now(), Math.random())
    noteLatchRef.current = opId
    setNoteState('saving')
    setNoteMessage(null)
    try {
      await saveBuildStudioNote({
        familyId: target.familyId,
        childId: target.childId,
        projectId: target.projectId,
        versionId: target.versionId,
        versionDocId: target.versionDocId,
        noteActionId: target.noteActionId,
        text: draftText,
        capture: noteDraft.capture,
        help: target.help,
        hintsOffered: target.hintsOffered,
        voiceEventId: noteDraft.voiceEventId,
      })
      // After the await: a late result may not clear a draft that now belongs
      // to another target or another visit.
      if (liveTokenRef.current !== ownToken) return
      setNoteDraft((current) =>
        current && sameNoteTarget(current.target, target) ? null : current,
      )
      setNoteState('saved')
      setNoteMessage('Saved with your game.')
    } catch (err) {
      if (liveTokenRef.current !== ownToken) return
      setNoteState('failed')
      // The draft is deliberately NOT cleared on a failure, including the
      // refusal a second different note under one action id gets.
      setNoteMessage(
        err instanceof BuildStudioNoteRefused || err instanceof Error
          ? err.message
          : 'Your words did not save. Try again — your game is safe either way.',
      )
    } finally {
      if (noteLatchRef.current === opId) noteLatchRef.current = null
    }
  }, [noteDraft, noteTarget, token])

  // ── Render ────────────────────────────────────────────────────────────

  const gated = phase !== EditorPhase.Ready || !projectReady
  const canSave = phase === EditorPhase.Ready && projectReady && !writeInFlight

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {childName}&apos;s Build Studio
        </Typography>
        <Typography variant="body1">{BUILD_STUDIO_GOAL_LINE}</Typography>
        <Typography variant="caption" color="text.secondary">
          This is a prepared starter game. Change it however you like — every save
          keeps the one before it.
        </Typography>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
        <Button
          variant="outlined"
          size="large"
          onClick={handleHearGoal}
          sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
        >
          🔊 Hear it
        </Button>
        <Button
          variant="outlined"
          size="large"
          onClick={handleHint}
          sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
        >
          💡 Hint
          {hintsOffered > 0 ? ` (${hintsOffered} of ${BUILD_STUDIO_HINT_COUNT})` : ''}
        </Button>
        {/* Play and Edit are the two measured stock presentation modes.
            `startsimulator` alone leaves a 96 × 85 preview; expanding the
            simulator is what gives a playable screen and the touch controls.
            Both buttons live OUTSIDE the frame, so Save and Hint stay. */}
        <Button
          variant={playing ? 'contained' : 'outlined'}
          size="large"
          disabled={gated}
          onClick={() => {
            setPlaying(true)
            void bridgeRef.current?.playFullscreen()
          }}
          sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
        >
          ▶ Play it
        </Button>
        <Button
          variant={playing ? 'outlined' : 'contained'}
          size="large"
          disabled={gated}
          onClick={() => {
            setPlaying(false)
            void bridgeRef.current?.backToBlocks()
          }}
          sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
        >
          🧩 Edit the blocks
        </Button>
      </Stack>

      {currentHint && (
        <Alert severity="info" icon={false}>
          {currentHint.text}
        </Alert>
      )}

      {advisory && <Alert severity="warning">{advisory}</Alert>}

      {openFailure && (
        <Alert
          severity="error"
          action={
            <Button size="small" onClick={reopenCurrent} sx={{ textTransform: 'none' }}>
              Try again
            </Button>
          }
        >
          <AlertTitle>The editor would not open</AlertTitle>
          {openFailure}
        </Alert>
      )}

      {/* The adult-assisted fallback. STARTER only, and it says so — a MakeCode
          project file is a different thing from this app's archive, and
          offering it for failed EDITED work would replace what he made. */}
      {gated && phase !== EditorPhase.Opening && phase !== EditorPhase.Importing && (
        <Alert severity="info">
          <AlertTitle>A grown-up can open the starter directly</AlertTitle>
          Download{' '}
          <Link href={STARTER_PROJECT_PNG_URL} download>
            the starter project file
          </Link>{' '}
          and, at{' '}
          <Link href={ARCADE_PLAIN_EDITOR_URL} target="_blank" rel="noreferrer">
            arcade.makecode.com
          </Link>
          , choose <strong>Import</strong> then <strong>Import File</strong> and pick
          it. That is the prepared starter — it is not a copy of any game saved
          here.
        </Alert>
      )}

      {/* ── The editor frame ─────────────────────────────────────────── */}
      <Box sx={{ position: 'relative', width: '100%' }}>
        <Box
          sx={{
            height: { xs: '70vh', sm: '75vh' },
            minHeight: 420,
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          {liveSession && (
            <iframe
              // Keyed by the BRIDGE's own frame id, and given that same
              // session's URL — so the element, the URL and the attached bridge
              // always belong to one visit. Keying on the scope token alone let
              // a new element render with the previous frame's URL while an
              // effect caught up.
              key={liveSession.bridge.frameId}
              ref={iframeRef}
              src={liveSession.url}
              title={`${BUILD_STUDIO_PROJECT_NAME} editor`}
              allow="autoplay; fullscreen; gamepad"
              style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
              onLoad={() => {
                const frame = iframeRef.current
                if (frame) liveSession.bridge.attach(frame)
              }}
            />
          )}
        </Box>
        {(phase !== EditorPhase.Ready || writeInFlight) && (
          <Box
            // The cover. Editing is gated while the import is incomplete, and
            // again while a capture is running — the bridge also freezes the
            // frame's own input, so a keystroke cannot land mid-capture.
            role="status"
            aria-live="polite"
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: 'rgba(255,255,255,0.88)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              borderRadius: 2,
            }}
          >
            {phase !== EditorPhase.Failed && <CircularProgress />}
            <Typography variant="h6" sx={{ textAlign: 'center', px: 2 }}>
              {phase === EditorPhase.Failed
                ? 'The editor did not open.'
                : writeInFlight
                  ? 'Keeping your game — one moment.'
                  : phase === EditorPhase.Importing
                    ? 'Putting your game in…'
                    : 'Opening the editor…'}
            </Typography>
          </Box>
        )}
      </Box>

      {/* ── Save ─────────────────────────────────────────────────────── */}
      <Stack spacing={1}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', sm: 'center' }}
        >
          <TextField
            label="Name this save"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            size="medium"
            fullWidth
            disabled={writeInFlight}
            inputProps={{ 'aria-label': 'Name this save', maxLength: 60 }}
          />
          <Button
            variant="contained"
            size="large"
            disabled={!canSave}
            onClick={() => void handleSave()}
            sx={{ textTransform: 'none', fontWeight: 700, minHeight: 56, minWidth: 180 }}
          >
            {saveState === SaveState.Snapshotting
              ? 'Getting your game…'
              : saveState === SaveState.Writing
                ? 'Saving…'
                : '💾 Save my version'}
          </Button>
        </Stack>

        {editorDirty && (
          <Typography variant="caption" color="warning.main">
            You have changes that are not saved to your shelf yet.
          </Typography>
        )}

        {saveMessage && (
          <Alert
            severity={saveState === SaveState.Failed ? 'error' : 'success'}
            action={
              saveState === SaveState.Failed ? (
                <Stack direction="row" spacing={1}>
                  {pending && (
                    <Button
                      size="small"
                      onClick={() => void handleRetrySave()}
                      sx={{ textTransform: 'none' }}
                    >
                      Try again
                    </Button>
                  )}
                  <Button
                    size="small"
                    onClick={() => void handleDownloadCurrent()}
                    sx={{ textTransform: 'none' }}
                  >
                    Download a copy
                  </Button>
                </Stack>
              ) : undefined
            }
          >
            {saveMessage}
          </Alert>
        )}

        {/* The held payload, offered back after a remount or a return. */}
        {pending && saveState !== SaveState.Failed && !writeInFlight && (
          <Alert
            severity="warning"
            action={
              <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
                <Button
                  size="small"
                  onClick={() => void handleRetrySave()}
                  sx={{ textTransform: 'none' }}
                >
                  Try again
                </Button>
                <Button
                  size="small"
                  onClick={() => void handleDownloadCurrent()}
                  sx={{ textTransform: 'none' }}
                >
                  Download a copy
                </Button>
                <Button
                  size="small"
                  onClick={handleDiscardPending}
                  sx={{ textTransform: 'none' }}
                >
                  Discard it
                </Button>
              </Stack>
            }
          >
            A save called “{pending.label}” did not finish. Your game is still here —
            you can try again or download a copy.
          </Alert>
        )}
      </Stack>

      {/* The way back in for a file this app downloaded. Grown-up shaped and
          deliberately plain: it is the half that makes "Download a copy" a
          recovery instead of a souvenir. */}
      <Stack spacing={0.5}>
        <Typography variant="caption" color="text.secondary">
          Opening a game file this app downloaded (ends in <code>-source.json</code>):
        </Typography>
        <input
          type="file"
          accept="application/json,.json"
          aria-label="Open a downloaded game file"
          disabled={phase !== EditorPhase.Ready || writeInFlight}
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Cleared so picking the same file twice fires again.
            e.target.value = ''
            void handleRecoveryFile(file)
          }}
        />
      </Stack>

      {/* ── The optional reflection ──────────────────────────────────── */}
      <Divider />
      <Stack spacing={1}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Say what you were trying (if you want to)
        </Typography>
        <Typography variant="caption" color="text.secondary">
          This is optional. You can make and save games without it.
        </Typography>
        {!noteTarget && (
          <Typography variant="body2" color="text.secondary">
            Save a version first, then your words can go with it.
          </Typography>
        )}
        {noteTarget && draftIsStale && (
          <Alert severity="info">
            You saved again, so those earlier words were about the save before this
            one. Say them again for “{lastSaved?.label}” if you still want to.
          </Alert>
        )}
        {noteTarget && (!noteDraft || draftIsStale) && (
          <VoiceInput
            // Keyed by the TARGET. A change of acknowledged version or of visit
            // remounts the mic, so a recording started about one save is retired
            // rather than carried into the next.
            key={noteTargetKey(noteTarget)}
            profile={{ id: childId }}
            sourceSurface="build-studio-reflection"
            onTranscript={(text, meta) =>
              setNoteDraft({
                text,
                capture: 'voice',
                voiceEventId: meta?.eventId,
                // Frozen here, at accepted-draft creation.
                target: noteTarget,
              })
            }
            placeholder="Tell me what you changed and what you expected."
            size="large"
          />
        )}
        {noteDraft && !draftIsStale && (
          <Stack spacing={1}>
            {/* The disclosed target, named before the tap. `draftIsStale`
                guarantees it is the live one. */}
            <Typography variant="caption" color="text.secondary">
              These words will be saved with “{lastSaved?.label}”.
            </Typography>
            <TextField
              value={noteDraft.text}
              onChange={(e) =>
                // A typed correction keeps the ORIGINAL capture and event id:
                // the words began as speech, and relabelling them as typed
                // would misreport how they were given.
                setNoteDraft({ ...noteDraft, text: e.target.value })
              }
              multiline
              minRows={2}
              fullWidth
              inputProps={{ 'aria-label': 'What you were trying' }}
            />
            <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
              <Button
                variant="contained"
                size="large"
                disabled={noteState === 'saving' || !noteDraft.text.trim()}
                onClick={() => void handleSaveNote()}
                sx={{ textTransform: 'none', fontWeight: 600, minHeight: 48 }}
              >
                {noteState === 'saving' ? 'Saving…' : 'Save my words'}
              </Button>
              <Button
                variant="text"
                size="large"
                onClick={() => {
                  setNoteDraft(null)
                  setNoteState('idle')
                  setNoteMessage(null)
                }}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                Start over
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Nothing is saved until you press Save my words.
            </Typography>
          </Stack>
        )}
        {noteMessage && (
          <Alert severity={noteState === 'failed' ? 'error' : 'success'}>{noteMessage}</Alert>
        )}
      </Stack>

      {/* ── The shelf ───────────────────────────────────────────────── */}
      <Divider />
      <Stack spacing={1}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Your saved games
        </Typography>
        {confirmReopen && (
          <Alert
            severity="warning"
            action={
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  onClick={() => openVersion(confirmReopen)}
                  sx={{ textTransform: 'none' }}
                >
                  Open it anyway
                </Button>
                <Button
                  size="small"
                  onClick={() => setConfirmReopen(null)}
                  sx={{ textTransform: 'none' }}
                >
                  Keep working
                </Button>
              </Stack>
            }
          >
            {/* The loss is named BEFORE the tap, not reported after it. */}
            You have work that is not on your shelf. Opening “{confirmReopen.label}”
            will lose it.
          </Alert>
        )}
        <BuildStudioVersionShelf
          read={versions}
          canOpen={!writeInFlight}
          onOpen={requestOpen}
          onDownload={handleDownloadVersion}
          onRetryRead={versions.retry}
          currentVersionId={visit.version?.versionId ?? null}
          busyVersionId={openingVersionId}
        />
      </Stack>

      {/* ── The numbers worth changing. Read-only, on purpose. ──────── */}
      <Divider />
      <Stack spacing={1}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Numbers you can change
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Find these in the blocks and change them yourself. This list just says
          where to look.
        </Typography>
        <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {STARTER_TUNING_NUMBERS.map((tuning) => (
            <Typography component="li" variant="body2" key={tuning.id}>
              <strong>{tuning.label}</strong> —{' '}
              {/* The life row follows the OPEN source for the same reason the
                  hints do: after reopening a 4-life version, "set life to 3" is
                  a block that is not on his screen. */}
              {tuning.id === 'lives' ? lifeBlockLabel(openLives) : tuning.blockLabel} (
              {tuning.where})
            </Typography>
          ))}
        </Stack>
      </Stack>

      {/* ── Leaving ───────────────────────────────────────────────────
          Shown only once the pre-departure capture has an answer, so a clean
          exit never flashes a warning it is about to withdraw. */}
      <Dialog
        open={departure.held && departureCheck !== 'idle' && departureCheck !== 'clean'}
        onClose={departure.stay}
      >
        <DialogTitle>
          {departureCheck === 'checking' ? 'Checking your game…' : 'Keep your game first?'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {departureCheck === 'checking'
              ? 'One moment — looking at what is in the editor.'
              : departure.reason === 'in-flight'
                ? 'Your game is being saved right now. Give it a moment — it will carry on by itself.'
                : pending
                  ? `A save called “${pending.label}” did not finish. If you leave now it is gone.`
                  : departureCheck === 'unknown'
                    ? 'This page could not read the editor just now, so it cannot tell whether your changes are saved. Leaving might lose them.'
                    : 'Your game has changes that are not on your shelf yet. If you leave now they are gone.'}
          </DialogContentText>
        </DialogContent>
        {departureCheck !== 'checking' && (
          <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant="contained"
              onClick={departure.stay}
              sx={{ textTransform: 'none', fontWeight: 700, minHeight: 48 }}
            >
              Stay here
            </Button>
            {pending && (
              <Button
                onClick={() => void handleRetrySave()}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                Try saving again
              </Button>
            )}
            {!pending && departureFilesRef.current && (
              <Button
                onClick={() => void handleSaveCaptured()}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                Save it now
              </Button>
            )}
            {!pending && !departureFilesRef.current && canSave && (
              <Button
                onClick={() => void handleSave()}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                Save it now
              </Button>
            )}
            <Button
              onClick={() => void handleDownloadCurrent()}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              Download a copy
            </Button>
            <Button
              color="error"
              onClick={departure.leaveAnyway}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              Leave and lose it
            </Button>
          </DialogActions>
        )}
      </Dialog>

      {/* ── Changing who is signed in ───────────────────────────────── */}
      <Dialog open={heldProfile !== null} onClose={cancelProfileAsk}>
        <DialogTitle>
          {profileCheck === 'checking' ? 'Checking your game…' : 'Switch profile?'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {profileCheck === 'checking'
              ? 'One moment — looking at what is in the editor before anything closes.'
              : pending
                ? `A save called “${pending.label}” did not finish. Switching now leaves it behind.`
                : profileCheck === 'unknown'
                  ? 'This page could not read the editor just now, so it cannot tell whether your changes are saved. Switching might lose them.'
                  : 'Your game has changes that are not on your shelf yet. Switching closes the editor.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button
            variant="contained"
            onClick={cancelProfileAsk}
            sx={{ textTransform: 'none', fontWeight: 700, minHeight: 48 }}
          >
            Stay here
          </Button>
          {departureFilesRef.current && (
            <Button
              disabled={profileCheck === 'checking'}
              onClick={() => void handleSaveCaptured()}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              Save it now
            </Button>
          )}
          <Button
            disabled={profileCheck === 'checking'}
            onClick={() => void handleDownloadCurrent()}
            sx={{ textTransform: 'none', minHeight: 48 }}
          >
            Download a copy
          </Button>
          {/* Disabled until the capture has an answer: a destructive choice
              offered while the app does not yet know what it would discard is
              a choice nobody can make. Stay here is always available. */}
          <Button
            color="error"
            disabled={profileCheck === 'checking'}
            onClick={confirmProfileAsk}
            sx={{ textTransform: 'none', minHeight: 48 }}
          >
            Switch anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

/** A name for a save the child did not name. Never a score, just a count. */
function defaultLabel(n: number): string {
  return `My version ${n}`
}
