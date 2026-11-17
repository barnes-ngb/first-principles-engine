/**
 * The child's own studio: the editor, the Save, the shelf and the helper
 * (LOCAL-BUILD-001).
 *
 * ── Whose work is this? The answer is captured, never read live ───────────
 *
 * `childId` arrives as a PROP and every write uses it. Nothing in here reads
 * the shell's active-child hook, which is deliberate: `useCreativeTimer`'s
 * defect was a write that resolved its child when it FINISHED rather than when
 * it started,
 * and a game save is the most expensive version of that mistake in the app. So
 * the identity is captured in a {@link BuildStudioScope} when the editor
 * mounts, carried on the pending payload, and used by the write — the **BIND**
 * verdict. An accepted write that is already in flight finishes against its own
 * owner even if the page around it has moved on, and its result is reported
 * rather than silently dropped.
 *
 * ── An editor save is not an app save ─────────────────────────────────────
 *
 * MakeCode saves constantly; those events arrive as `workspacesave` and all
 * they do here is light the "not saved yet" mark. The word **Saved** appears
 * only after `saveBuildStudioVersion` resolves, which is the only moment the
 * bytes are durably in this family's own store.
 *
 * ── Editing is gated until the import is finished ─────────────────────────
 *
 * Until the handshake completes, the project is imported and the round trip has
 * been checked, the frame sits under a cover. A half-imported workspace is one
 * a child can edit, and an import landing afterwards would throw that away.
 *
 * ── Nothing here is scored ────────────────────────────────────────────────
 *
 * No streak, no level, no meter, no reward, no completion. The goal is a
 * sentence, the hints are five written lines, and the only numbers on screen
 * are the game's own score and lives — which are game mechanics, inside the
 * game.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import VoiceInput from '../../components/VoiceInput'
import {
  saveBuildStudioNote,
  BuildStudioNoteRefused,
  type BuildStudioNoteHelp,
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
import {
  ArcadeBridge,
  type AcceptedProject,
  type ArcadeProjectHeader,
} from './arcadeBridge'
import {
  ARCADE_PLAIN_EDITOR_URL,
  buildStudioDownloads,
  downloadTextFile,
} from './buildStudioExport'
import {
  BUILD_STUDIO_GOAL_LINE,
  BUILD_STUDIO_HINTS_DONE,
  BUILD_STUDIO_HINT_COUNT,
  goalSpeech,
  nextHint,
} from './buildStudioHints'
import {
  newBridgeId,
  newVersionId,
  newVisitId,
  scopeToken,
  type BuildStudioScope,
  type PendingSave,
} from './buildStudioScope'
import {
  blocksLookAuthored,
  BUILD_STUDIO_GOAL,
  BUILD_STUDIO_PROJECT_NAME,
  starterImportLooksCorrect,
  starterSourceFiles,
  STARTER_TUNING_NUMBERS,
} from './buildStudioStarter'
import BuildStudioVersionShelf from './BuildStudioVersionShelf'
import type { BuildStudioVersionsRead } from './useBuildStudioVersions'

/** What the frame is doing. Editing is gated on `Ready`. */
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

const SAVED_LINE = 'Saved. Your game is on your shelf.'
const SAVED_ALREADY_LINE = 'Saved — that one was already on your shelf.'

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

  // ── The visit ────────────────────────────────────────────────────────────
  //
  // One mount of the editor. A fresh `visitId` every time, so an `A → B → A`
  // — back to the same child and the same version — is a DIFFERENT scope and
  // the previous visit's in-flight callbacks cannot act on it.
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

  /** The live scope, for the bridge's own re-check at callback time. */
  const liveTokenRef = useRef(token)
  useEffect(() => {
    liveTokenRef.current = token
  }, [token])

  const bridgeRef = useRef<ArcadeBridge | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [phase, setPhase] = useState<EditorPhase>(EditorPhase.Opening)
  const [openFailure, setOpenFailure] = useState<string | null>(null)
  const [advisory, setAdvisory] = useState<string | null>(null)
  const [drift, setDrift] = useState<string | null>(null)
  const [loadedToken, setLoadedToken] = useState<string | null>(null)
  const [editorHeader, setEditorHeader] = useState<ArcadeProjectHeader | null>(null)

  /** The editor saved since the last durable app save. */
  const [editorDirty, setEditorDirty] = useState(false)

  const [label, setLabel] = useState('')
  const [saveState, setSaveState] = useState<SaveState>(SaveState.Idle)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  /** The exact payload a retry re-sends. Never rebuilt from the editor. */
  const [pending, setPending] = useState<PendingSave | null>(null)
  const [lastSaved, setLastSaved] = useState<
    { versionId: string; versionDocId: string; label: string } | null
  >(null)

  const [hintsGiven, setHintsGiven] = useState(0)
  const [noteDraft, setNoteDraft] = useState<
    { text: string; capture: 'voice' | 'typed'; eventId?: string } | null
  >(null)
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [noteMessage, setNoteMessage] = useState<string | null>(null)

  const [confirmReopen, setConfirmReopen] = useState<BuildStudioVersion | null>(null)
  const [openingVersionId, setOpeningVersionId] = useState<string | null>(null)

  const writeInFlight = saveState === SaveState.Snapshotting || saveState === SaveState.Writing

  // ── The bridge, one per visit ───────────────────────────────────────────
  useEffect(() => {
    const bridge = new ArcadeBridge({
      projectName: BUILD_STUDIO_PROJECT_NAME,
      // Re-read at callback time, not captured as a boolean: the whole point is
      // that it can have changed since the request was sent.
      isScopeLive: () => liveTokenRef.current === token,
      newId: () => newBridgeId(Date.now(), Math.random()),
      onEditorLoaded: () => setLoadedToken(token),
      onEditorSave: () => setEditorDirty(true),
      onVersionDrift: (reported) =>
        setDrift(
          `This is MakeCode ${reported.targetVersion ?? 'of an unknown version'}, not the one this page was built against. Saving and opening still work — tell Dad if something looks wrong.`,
        ),
    })
    bridgeRef.current = bridge
    setFrameUrl(bridge.frameUrl())
    setPhase(EditorPhase.Opening)
    setOpenFailure(null)
    setAdvisory(null)
    setEditorDirty(false)
    setEditorHeader(null)
    window.addEventListener('message', bridge.handleMessage)
    return () => {
      window.removeEventListener('message', bridge.handleMessage)
      // Rejects every pending request rather than leaving a caller awaiting a
      // promise that can no longer settle.
      bridge.dispose()
      if (bridgeRef.current === bridge) bridgeRef.current = null
    }
  }, [token])

  // The frame element, bound as soon as it exists.
  //
  // Separate from the `onLoad` handler below on purpose: the editor posts its
  // first `workspacesync` after ITS document loads, and `onLoad` on the host
  // side is not guaranteed to have run first. A bridge with no frame attached
  // rejects every message as `frame`, so the handshake would never start.
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
        const files: BuildStudioSourceFiles = visit.version
          ? // The chosen version's OWN bytes, read back from its archive —
            // never "whatever the latest frame happens to hold".
            parseBuildStudioSource(visit.version.sourceArchive)
          : starterSourceFiles()
        await bridge.importProject(files)
        if (!live()) return
        // What turns the starter's canonical TypeScript into editable blocks.
        await bridge.switchToBlocks()
        if (!live()) return

        // The acceptance check the slice asks for, run by the app rather than
        // assumed: ask for the project back and look at what came.
        let round: AcceptedProject | null = null
        try {
          round = await bridge.requestSnapshot()
        } catch {
          round = null
        }
        if (!live()) return
        setPhase(EditorPhase.Ready)
        if (!round) {
          setAdvisory(
            'The editor is open, but this page could not read the game back to check it. Try Save and see what happens — and if Save fails, use Download a copy.',
          )
          return
        }
        setEditorHeader(round.header)
        const ok = visit.version
          ? blocksLookAuthored(round.files['main.blocks'])
          : starterImportLooksCorrect(round.files)
        setAdvisory(
          ok
            ? null
            : visit.version
              ? 'This saved version opened with an empty block workspace. The code is still there — use Download a copy if you need it.'
              : 'The starter opened but its blocks did not appear. Nothing is broken and nothing is lost — use Download a copy, or open MakeCode on its own and paste the code in.',
        )
      } catch (err) {
        if (cancelled) return
        setPhase(EditorPhase.Failed)
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

  // ── Leaving with work in the air ───────────────────────────────────────
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!editorDirty && !writeInFlight) return
      event.preventDefault()
      // The deprecated assignment is what actually triggers the prompt in
      // Chrome and Safari; `preventDefault` alone is the spec'd form.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [editorDirty, writeInFlight])

  // ── Save ───────────────────────────────────────────────────────────────

  /**
   * Send ONE payload, with one automatic retry of the exact same bytes and the
   * exact same id.
   *
   * A loop rather than recursion, so "how many times may this be sent" is one
   * readable condition in one place. `attempts` lives on the payload, not in
   * this function, which is what makes a MANUAL retry continue the same action
   * rather than restarting the count.
   */
  const commit = useCallback(
    async (payload: PendingSave) => {
      let attempt: PendingSave = payload
      const ownToken = scopeToken(payload.scope)
      for (;;) {
        attempt = { ...attempt, attempts: attempt.attempts + 1 }
        setPending(attempt)
        setSaveState(SaveState.Writing)
        try {
          const result = await saveBuildStudioVersion({
            familyId: attempt.scope.familyId,
            // The OWNER, from the captured scope. Not the live active child,
            // and not a value re-read after the await.
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
          // Durable now, whatever the screen is showing.
          if (liveTokenRef.current !== ownToken) {
            // An accepted write bound to its owner finished after the page
            // moved on. It is NOT undone and it is NOT silently dropped — the
            // page says which shelf it landed on.
            onOutOfScopeSave?.(
              `A save started earlier finished and is on the shelf as “${attempt.label}”.`,
            )
            return
          }
          setSaveState(SaveState.Saved)
          setSaveMessage(
            result.outcome === 'alreadySaved' ? SAVED_ALREADY_LINE : SAVED_LINE,
          )
          setLastSaved({
            versionId: attempt.versionId,
            versionDocId: result.version.id,
            label: attempt.label,
          })
          setEditorDirty(false)
          setPending(null)
          setLabel('')
          return
        } catch (err) {
          // A refusal is deterministic — the same payload will be refused
          // again, so it is never auto-retried. Everything else is treated as
          // transient and gets exactly ONE automatic retry of the EXACT
          // payload and identity.
          const deterministic = err instanceof BuildStudioRefused
          if (!deterministic && attempt.attempts < MAX_AUTOMATIC_ATTEMPTS) {
            continue
          }
          setSaveState(SaveState.Failed)
          setSaveMessage(
            err instanceof Error
              ? err.message
              : 'That did not save. Your game is still open — try again.',
          )
          // `pending` is deliberately kept, so the manual retry re-sends the
          // same bytes and the same id rather than taking a fresh snapshot
          // (which would be a different version, not a retry).
          return
        }
      }
    },
    [onOutOfScopeSave],
  )

  const handleSave = useCallback(async () => {
    const bridge = bridgeRef.current
    if (!bridge || phase !== EditorPhase.Ready) return
    setSaveState(SaveState.Snapshotting)
    setSaveMessage(null)
    setPending(null)
    let snapshot: AcceptedProject
    try {
      snapshot = await bridge.requestSnapshot()
    } catch (err) {
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
    }
    await commit(payload)
  }, [phase, label, scope, token, versions.versions.length, commit])

  const handleRetrySave = useCallback(async () => {
    if (!pending) return
    await commit(pending)
  }, [pending, commit])

  /** Get the bytes out, from whatever we have — pending payload or editor. */
  const handleDownloadCurrent = useCallback(async () => {
    const files =
      pending?.files ??
      bridgeRef.current?.editorSaveSeen()?.files ??
      (await bridgeRef.current?.requestSnapshot().then((p) => p.files).catch(() => null)) ??
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

  const openVersion = useCallback((version: BuildStudioVersion) => {
    setOpeningVersionId(version.versionId)
    setConfirmReopen(null)
    setSaveState(SaveState.Idle)
    setSaveMessage(null)
    setPending(null)
    setLastSaved(null)
    setNoteDraft(null)
    setNoteState('idle')
    setNoteMessage(null)
    setLoadedToken(null)
    // A brand new visit: new id, so nothing from the previous one can act here.
    setVisit({ visitId: newVisitId(Date.now(), Math.random()), version })
  }, [])

  useEffect(() => {
    if (phase === EditorPhase.Ready || phase === EditorPhase.Failed) {
      setOpeningVersionId(null)
    }
  }, [phase])

  const requestOpen = useCallback(
    (version: BuildStudioVersion) => {
      if (writeInFlight) return
      if (editorDirty) {
        setConfirmReopen(version)
        return
      }
      openVersion(version)
    },
    [writeInFlight, editorDirty, openVersion],
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
    tts.speak(goalSpeech().join(' '))
  }, [tts])

  const handleHint = useCallback(() => {
    const hint = nextHint(hintsGiven)
    if (!hint) {
      tts.speak(BUILD_STUDIO_HINTS_DONE)
      return
    }
    setHintsGiven(hint.rung)
    tts.speak(hint.text)
  }, [hintsGiven, tts])

  const currentHint = hintsGiven > 0 ? nextHint(hintsGiven - 1) : null

  // ── The reflection ────────────────────────────────────────────────────

  const handleSaveNote = useCallback(async () => {
    if (!noteDraft || !lastSaved) return
    setNoteState('saving')
    setNoteMessage(null)
    try {
      await saveBuildStudioNote({
        familyId: scope.familyId,
        childId: scope.childId,
        projectId: scope.projectId,
        versionId: lastSaved.versionId,
        versionDocId: lastSaved.versionDocId,
        text: noteDraft.text,
        capture: noteDraft.capture,
        // Honest provenance: how much authored help was heard in THIS visit.
        // A visit that heard none says so; the app never guesses for a visit it
        // did not observe (see the writer's three-valued `help`).
        help: (hintsGiven > 0 ? 'hints-heard' : 'none-heard') as BuildStudioNoteHelp,
        hintsHeard: hintsGiven > 0 ? hintsGiven : undefined,
        voiceEventId: noteDraft.eventId,
      })
      setNoteState('saved')
      setNoteMessage('Saved with your game.')
      setNoteDraft(null)
    } catch (err) {
      setNoteState('failed')
      setNoteMessage(
        err instanceof BuildStudioNoteRefused || err instanceof Error
          ? err.message
          : 'Your words did not save. Try again — your game is safe either way.',
      )
    }
  }, [noteDraft, lastSaved, scope, hintsGiven])

  // ── Render ────────────────────────────────────────────────────────────

  const gated = phase !== EditorPhase.Ready

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {childName}&apos;s Build Studio
        </Typography>
        <Typography variant="body1">{BUILD_STUDIO_GOAL_LINE}</Typography>
        <Typography variant="caption" color="text.secondary">
          Dad made this starter game. Change it however you like — every save keeps
          the one before it.
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
          {hintsGiven > 0 ? ` (${hintsGiven} of ${BUILD_STUDIO_HINT_COUNT})` : ''}
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
          {openFailure} Nothing of yours was lost. You can open{' '}
          <Link href={ARCADE_PLAIN_EDITOR_URL} target="_blank" rel="noreferrer">
            MakeCode on its own
          </Link>{' '}
          and download a copy of any saved game from the shelf below.
        </Alert>
      )}

      {/* ── The editor frame ─────────────────────────────────────────── */}
      <Box sx={{ position: 'relative', width: '100%' }}>
        <Box
          sx={{
            // Portrait and landscape both: tall enough to work in on a phone,
            // capped so the page's own controls stay reachable on a tablet in
            // landscape without a nested scroll.
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
              // Keyed by the scope, so a new visit is a NEW frame. Reusing one
              // would let a previous visit's editor state and a previous
              // frameId's replies into this one.
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
        {gated && (
          <Box
            // The cover. Editing is gated while the import is incomplete,
            // because a half-imported workspace is one a child can edit and an
            // import landing afterwards would throw that away.
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
            disabled={gated || writeInFlight}
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

        {editorDirty && saveState !== SaveState.Saved && (
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
        {!lastSaved && (
          <Typography variant="body2" color="text.secondary">
            Save a version first, then your words can go with it.
          </Typography>
        )}
        {lastSaved && !noteDraft && (
          <VoiceInput
            profile={{ id: childId }}
            sourceSurface="build-studio-reflection"
            onTranscript={(text, meta) =>
              setNoteDraft({ text, capture: 'voice', eventId: meta?.eventId })
            }
            placeholder="Tell me what you changed and what you expected."
            size="large"
          />
        )}
        {lastSaved && noteDraft && (
          <Stack spacing={1}>
            <TextField
              value={noteDraft.text}
              onChange={(e) =>
                setNoteDraft({ ...noteDraft, text: e.target.value, capture: 'typed' })
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
            {/* Explicit, and said so: the accepted transcript is a DRAFT until
                this button is pressed. Nothing is stored by speaking. */}
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
            You have changes that are not on your shelf. Opening
            “{confirmReopen.label}” will lose them.
          </Alert>
        )}
        <BuildStudioVersionShelf
          read={versions}
          canOpen={!writeInFlight}
          onOpen={requestOpen}
          onDownload={handleDownloadVersion}
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
              <strong>{tuning.label}</strong> — {tuning.blockLabel} ({tuning.where})
            </Typography>
          ))}
        </Stack>
      </Stack>

      {editorHeader?.targetVersion && (
        <Typography variant="caption" color="text.secondary">
          Editor: {editorHeader.target ?? 'arcade'} {editorHeader.targetVersion}
        </Typography>
      )}
    </Stack>
  )
}

/** A name for a save the child did not name. Never a score, just a count. */
function defaultLabel(n: number): string {
  return `My version ${n}`
}
