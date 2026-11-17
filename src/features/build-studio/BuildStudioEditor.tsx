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
import {
  parseBuildStudioSource,
  type BuildStudioSourceFiles,
  type BuildStudioVersion,
} from '../../core/types/buildStudio'
import { ArcadeBridge, type AcceptedProject } from './arcadeBridge'
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

  const bridgeRef = useRef<ArcadeBridge | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [phase, setPhase] = useState<EditorPhase>(EditorPhase.Opening)
  /** Did the round trip prove a usable project is open? Save is gated on it. */
  const [projectReady, setProjectReady] = useState(false)
  const [openFailure, setOpenFailure] = useState<string | null>(null)
  const [advisory, setAdvisory] = useState<string | null>(null)
  const [drift, setDrift] = useState<string | null>(null)
  const [loadedToken, setLoadedToken] = useState<string | null>(null)
  /** The life number in the source that is actually open. Drives the hints. */
  const [openLives, setOpenLives] = useState<OpenLifeValue>(null)

  /** The editor saved since the last durable app save. */
  const [editorDirty, setEditorDirty] = useState(false)
  /**
   * Bumped on every editor save. A payload records the value it was captured
   * at, so an acknowledgment can tell whether newer work has arrived since.
   */
  const sourceRevisionRef = useRef(0)

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

  /** Claimed synchronously, before any await. The write-concurrency latch. */
  const saveLatchRef = useRef(false)
  const noteLatchRef = useRef(false)

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

  const hasWorkAtRisk = useCallback(() => atRiskRef.current, [])
  const writeIsInFlight = useCallback(() => inFlightRef.current, [])
  const departure = useBuildStudioDepartureGuard({
    hasWorkAtRisk,
    writeInFlight: writeIsInFlight,
  })

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

  // ── The bridge, one per visit ───────────────────────────────────────────
  useEffect(() => {
    const bridge = new ArcadeBridge({
      projectName: BUILD_STUDIO_PROJECT_NAME,
      isScopeLive: () => liveTokenRef.current === token,
      newId: () => newBridgeId(Date.now(), Math.random()),
      onEditorLoaded: () => setLoadedToken(token),
      onEditorSave: () => {
        sourceRevisionRef.current += 1
        setEditorDirty(true)
      },
      onVersionDrift: (reported) =>
        setDrift(
          `This is MakeCode ${reported.targetVersion ?? 'of an unknown version'}, not the one this page was built against. Saving and opening still work — tell a grown-up if something looks wrong.`,
        ),
    })
    bridgeRef.current = bridge
    setFrameUrl(bridge.frameUrl())
    setPhase(EditorPhase.Opening)
    setProjectReady(false)
    setOpenFailure(null)
    setAdvisory(null)
    setEditorDirty(false)
    setOpenLives(null)
    window.addEventListener('message', bridge.handleMessage)
    return () => {
      window.removeEventListener('message', bridge.handleMessage)
      bridge.dispose()
      if (bridgeRef.current === bridge) bridgeRef.current = null
    }
  }, [token])

  // The frame element, bound as soon as it exists — before the editor's first
  // `workspacesync`, which `onLoad` alone does not guarantee.
  useEffect(() => {
    const bridge = bridgeRef.current
    const frame = iframeRef.current
    if (bridge && frame) bridge.attach(frame)
  }, [frameUrl, token])

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
        await bridge.importProject(files)
        if (!live()) return

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
        setPending(attempt)
        holdPendingSave(ownOwner, attempt)
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
          // Durable now, whatever the screen is showing. The held payload is
          // released because it LANDED, for its own owner, not for whoever is
          // on screen.
          clearPendingSave(ownOwner)
          if (liveTokenRef.current !== ownToken) {
            // An accepted write bound to its owner finished after the page
            // moved on. Not undone, not silently dropped, and NOT applied to
            // whatever visit is mounted now.
            onOutOfScopeSave?.(
              `A save started earlier finished and is on the shelf as “${attempt.label}”.`,
            )
            return
          }
          // Did newer work arrive while this was writing? If so the dirty mark
          // STAYS — it belongs to edits this acknowledgment knows nothing
          // about.
          const stillCurrent = sourceRevisionRef.current === attempt.capturedRevision
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
          setPending(null)
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
    saveLatchRef.current = true
    // Synchronously, so a navigation in the same gesture is already held.
    inFlightRef.current = true
    atRiskRef.current = true
    setSaveState(SaveState.Snapshotting)
    setSaveMessage(null)
    // The previous unfinished payload is deliberately NOT cleared here. If this
    // capture fails there is still work waiting to be retried, and clearing it
    // first would hide it; `commit` replaces it the moment a new one exists.
    try {
      // The revision is read BEFORE the capture, so a save event that arrives
      // during the capture counts as newer work rather than as part of it.
      const capturedRevision = sourceRevisionRef.current
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
      const payload: PendingSave = {
        scope,
        versionId: newVersionId(Date.now(), Math.random()),
        label: label.trim() || defaultLabel(versions.versions.length + 1),
        createdAt: new Date().toISOString(),
        files: snapshot.files,
        editorTarget: snapshot.header.target,
        editorTargetVersion: snapshot.header.targetVersion,
        goalId: BUILD_STUDIO_GOAL.id,
        attempts: 0,
        capturedRevision,
      }
      await commit(payload)
    } finally {
      saveLatchRef.current = false
    }
  }, [phase, projectReady, label, scope, token, versions.versions.length, commit])

  const handleRetrySave = useCallback(async () => {
    if (saveLatchRef.current) return
    if (!pending) return
    saveLatchRef.current = true
    try {
      await commit(pending)
    } finally {
      saveLatchRef.current = false
    }
  }, [pending, commit])

  const handleDiscardPending = useCallback(() => {
    clearPendingSave(owner)
    setPending(null)
    setSaveState(SaveState.Idle)
    setSaveMessage(null)
  }, [owner])

  /**
   * Get the EDITED bytes out.
   *
   * The pending payload first, because that is the exact source a failed save
   * was carrying. Never the starter — substituting the starter for failed work
   * would replace what he made with what he began from.
   */
  const handleDownloadCurrent = useCallback(async () => {
    const fromPending = pending?.files ?? null
    const fromEditor = fromPending ? null : (bridgeRef.current?.editorSaveSeen()?.files ?? null)
    const files = fromPending ?? fromEditor
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
    noteLatchRef.current = true
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
      noteLatchRef.current = false
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
        <Button
          variant="outlined"
          size="large"
          disabled={gated}
          onClick={() => void bridgeRef.current?.switchToBlocks()}
          sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
        >
          🧩 Edit the blocks
        </Button>
        <Button
          variant="outlined"
          size="large"
          disabled={gated}
          onClick={() => void bridgeRef.current?.startSimulator()}
          sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
        >
          ▶ Play it
        </Button>
      </Stack>

      {currentHint && (
        <Alert severity="info" icon={false}>
          {currentHint.text}
        </Alert>
      )}

      {drift && <Alert severity="info">{drift}</Alert>}
      {advisory && <Alert severity="warning">{advisory}</Alert>}

      {openFailure && (
        <Alert severity="error">
          <AlertTitle>The editor would not open</AlertTitle>
          {openFailure} Nothing of yours was lost.
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
          {frameUrl && (
            <iframe
              // Keyed by the scope, so a new visit is a NEW frame.
              key={token}
              ref={iframeRef}
              src={frameUrl}
              title={`${BUILD_STUDIO_PROJECT_NAME} editor`}
              allow="autoplay; fullscreen; gamepad"
              style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
              onLoad={() => {
                const bridge = bridgeRef.current
                const frame = iframeRef.current
                if (bridge && frame) bridge.attach(frame)
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

      {/* ── Leaving ─────────────────────────────────────────────────── */}
      <Dialog open={departure.held} onClose={departure.stay}>
        <DialogTitle>Keep your game first?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {departure.reason === 'in-flight'
              ? 'Your game is being saved right now. Give it a moment — it will carry on by itself.'
              : pending
                ? `A save called “${pending.label}” did not finish. If you leave now it is gone.`
                : 'Your game has changes that are not on your shelf yet. If you leave now they are gone.'}
          </DialogContentText>
        </DialogContent>
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
          {!pending && canSave && (
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
      </Dialog>
    </Stack>
  )
}

/** A name for a save the child did not name. Never a score, just a count. */
function defaultLabel(n: number): string {
  return `My version ${n}`
}
