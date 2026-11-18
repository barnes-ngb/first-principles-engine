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
 * ── Four latches, and why each one exists ───────────────────────────────
 *
 *   1. `saveLatchRef` — claimed SYNCHRONOUSLY before the first await, so two
 *      taps in one tick cannot both start a capture.
 *   2. the bridge's own capture serialization, so one `saveproject` is in
 *      flight at a time and its payload cannot be overwritten by another.
 *   3. `noteLatchRef` — the same, for *Save my words*.
 *   4. `downloadLatchRef` — the same, for *Download a copy*, which captures
 *      too (see below) and so has an await of its own.
 *
 * ── A copy of the open game is CAPTURED, not assembled ──────────────────
 *
 * *Download a copy* asks the live scoped editor for the source when it is
 * tapped and exports exactly that, because every copy this page is holding is
 * older than the tap by construction — and no ordering of older copies is a
 * substitute, which two rounds of the same defect proved. When the capture
 * cannot answer, the page says so and keeps the editor intact; the held copy is
 * offered as its own labelled *earlier copy*, with its own button, sentence and
 * file name. The starter is never either of them.
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
 * ── Words are the one thing that cannot be read again ───────────────────
 *
 * A game can always be captured from the editor once more. A sentence a child
 * said once cannot, and verification found it being lost: accepted words, an
 * edit to them, a tap on *Today*, no warning, gone. So unsaved words are work
 * at risk — every departure, profile switch, shelf Open and recovery stops and
 * says so — and the exact words are held for their owner (family + child +
 * project) in `buildStudioPendingStore`, offered back on return with the save
 * they were about named. Holding is not saving: nothing is written down until
 * *Save my words*, and discarding is a button somebody has to press.
 *
 * ── Nothing here is scored ──────────────────────────────────────────────
 *
 * No streak, no level, no meter, no reward, no completion. Hints are counted as
 * OFFERED, never as heard: the app asked the browser to speak, which is not
 * evidence a child listened.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
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
  // TYPE only, deliberately: it is read off a rejection with no runtime import,
  // so the size stamp stays type-checked against the bridge that sets it.
  type ArcadeBridgeError,
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
  claimNoteSend,
  clearPendingNote,
  noteSendInFlight,
  clearPendingSave,
  discardPendingNote,
  failPendingNote,
  holdPendingNote,
  holdPendingSave,
  pendingSlotAccepts,
  readPendingNote,
  readPendingSave,
  releaseNoteSend,
  subscribePendingNote,
  type PendingOwner,
} from './buildStudioPendingStore'
import {
  newBridgeId,
  newNoteActionId,
  newVersionId,
  newVisitId,
  noteTargetKey,
  sameNotePayload,
  sameNoteSlot,
  scopeToken,
  sourceSignature,
  type BuildStudioNoteSlot,
  type BuildStudioNoteTarget,
  type BuildStudioScope,
  type PendingNote,
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
/**
 * A restored retry landed: the earlier game is on the shelf, and what is open
 * now is something else. Deliberately does not say the open game is saved.
 */
const SAVED_EARLIER_LINE =
  'Saved. That was the earlier game — it is on your shelf now. What is open here is separate.'

/**
 * The name on a download of a source the app could not store.
 *
 * Deliberately not the save's label and not `my-game`: the file it produces is
 * a full source export of what is in the editor, and it must not be mistaken
 * later for a version that is on the shelf. The name is the first thing a
 * person reads, so it is where that is said.
 */
const OVERSIZED_DOWNLOAD_LABEL = 'my game full copy too big to save'
/** What that download IS, said as it happens. */
const OVERSIZED_DOWNLOAD_LINE =
  'That file is your whole game exactly as it is in the editor right now. It is too big for this app to keep, so it is NOT on your shelf — keep the file somewhere safe, and making the game a bit smaller is what lets it save again.'
/**
 * The honest refusal. Said rather than quietly handing over an older game: the
 * only copy this app still holds is a previous one, and offering it as "a copy"
 * of what is open would be a lie about which game it is.
 */
const OVERSIZED_NO_DOWNLOAD_LINE =
  'Your game is too big for this page to save or to download right now, and the only copies it still has are older ones — so nothing was downloaded rather than giving you the wrong game. It is all still open in the editor; a grown-up can take some of it out, or save it from MakeCode itself.'
/**
 * The unfinished save, named, when the refusal above is shown beside one.
 *
 * Disclosure rather than substitution: that payload is a DIFFERENT game from
 * the one on screen, its own *Try again* is what sends it, and this says so
 * instead of handing its bytes over as a copy of the current game.
 */
const unfinishedSaveAside = (label: string) =>
  `The save called “${label}” that did not finish is still here — Try again sends that earlier game, which is not the one open now.`

/**
 * The name on a download of the game that is OPEN.
 *
 * Earned, not assumed: it is used only after a capture this tap started has
 * handed the bytes over, which is the one reading that can see an edit MakeCode
 * has not announced. Deliberately NOT the unfinished save's label, which named
 * a file after a DIFFERENT game (UX-498).
 */
const CURRENT_DOWNLOAD_LABEL = 'my game'
/** What that file is, said as it happens. It is a copy, not a save. */
const CURRENT_DOWNLOAD_LINE =
  'That file is your game exactly as it is in the editor right now — the editor handed it over just now for this copy. Keeping it on your shelf is still the Save button.'
/**
 * The name on a copy this page was already holding.
 *
 * Every word of it is the point: a person who finds this file next week must be
 * able to tell from the NAME that it is not the game that was open. Kept inside
 * `exportSlug`'s 40-character budget, so the sentence is not truncated
 * mid-word in the file name that has to carry it.
 */
const EARLIER_DOWNLOAD_LABEL = 'my game earlier copy not the one open'
/** What THAT file is, said as it happens. */
const EARLIER_DOWNLOAD_LINE =
  'That file is the earlier copy, not the game that is open now. Nothing in the editor changed and nothing was saved to your shelf.'
/**
 * The honest refusal of a CURRENT copy.
 *
 * Said instead of quietly exporting a held copy: this page could not get the
 * open game out, and a file of an older game under the name of the current one
 * is the defect this path exists to prevent. The earlier copy is still offered
 * — as its own labelled choice, below this sentence, never as this one's bytes.
 */
const CURRENT_UNAVAILABLE_LINE =
  'This page could not get your game out of the editor just now — it may still be busy keeping it — so nothing was downloaded. Your game is all still open exactly as it was; tap Download a copy again in a moment.'

/**
 * A copy this page is holding that is NOT provably the open game.
 *
 * It exists so recovery survives a failed capture without the current-copy
 * action ever serving its bytes: it is offered by its own button, after its own
 * sentence, and exported under its own file name.
 */
interface EarlierCopy {
  files: BuildStudioSourceFiles
  /** Which moment these bytes are from. Said before the tap. */
  origin: 'announced' | 'departure' | 'pending'
  /** The unfinished save's own label, when that is where they come from. */
  saveLabel: string | null
}

/**
 * What an earlier copy IS, named before anybody taps.
 *
 * One sentence per origin, because "an earlier copy" is not enough to choose
 * by — the question a person is actually answering is *which moment is this
 * from, and is it worth keeping*.
 */
function earlierCopyLine(earlier: EarlierCopy): string {
  if (earlier.origin === 'pending') {
    return `The copy this page still holds is the game from the save called “${earlier.saveLabel ?? 'that save'}” that did not finish. Downloading it keeps those bytes in a file named as an earlier copy; it does not send that save.`
  }
  if (earlier.origin === 'departure') {
    return 'The copy this page still holds is the one it read when you last tried to leave this page. It is an earlier copy and may not have your newest changes in it.'
  }
  return 'The copy this page still holds is the last one the editor itself handed over. It is an earlier copy and may not have your newest changes in it.'
}

/**
 * What one tap on a download door produced.
 *
 * Kept apart from `saveMessage` on purpose: a download writes nothing, and
 * reporting it through the save's own alert made a download look like a save
 * and could hide the unfinished save's row. `token` is the visit it was made
 * in, so a receipt — and the earlier copy's bytes with it — belongs to the
 * visit that asked and is never rendered or exported into another one.
 */
interface DownloadOutcome {
  token: string
  tone: 'done' | 'refused'
  line: string
  /** The separate, explicit earlier-copy choice, when one is possible. */
  earlier: EarlierCopy | null
}

/**
 * The live UI an explicit save act belongs to — separate from the payload's own
 * provenance.
 *
 * `token` is the visit on screen when the person tapped, `opId` is the latch
 * this act holds, and the owner fields are the child/project the screen is
 * for. Every UI mutation is gated on all of them; the WRITE is gated on the
 * payload instead, so a restored retry still lands under its own child.
 */
interface SaveInvocation {
  token: string
  opId: string
  familyId: string
  childId: string
  projectId: string
}

/**
 * A save that really landed, for the source the visit on screen has open.
 *
 * The ONE event that can make a held departure's earlier "there are unsaved
 * changes" answer obsolete — and it is deliberately not a release: it carries
 * the visit it landed in and the exact bytes it stored, so the hold is re-asked
 * against the editor rather than let through on trust. A restored retry of an
 * older visit's payload never produces one of these, which is what stops an old
 * acknowledgment unlocking a departure it knows nothing about.
 */
interface SavedForDeparture {
  token: string
  signature: string
}

export interface BuildStudioEditorProps {
  familyId: string
  /** The child this studio is FOR. Captured; never re-read from the shell. */
  childId: string
  childName: string
  projectId: string
  /**
   * Is the enhanced (Whisper) voice path configured for THIS child?
   *
   * `children/{childId}.voiceInputEnhanced`, resolved by the page for the same
   * child this editor is for and passed down — exactly as Today and the books
   * chats do it. `VoiceInput` selects the existing Whisper recording only on
   * `profile.voiceInputEnhanced === true`, so a mic handed nothing but an id
   * silently fell back to Web Speech for a child whose settings say otherwise
   * (PR #1974 round 1).
   *
   * Optional, defaulting to the same `false` an absent flag has always meant,
   * so nothing about an unconfigured child changes.
   */
  childVoiceInputEnhanced?: boolean
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
  childVoiceInputEnhanced,
  versions,
  onOutOfScopeSave,
}: BuildStudioEditorProps) {
  const tts = useTTS()
  const { selectProfile, registerProfileChangeGuard } = useProfile()

  const owner: PendingOwner = useMemo(
    () => ({ familyId, childId, projectId }),
    [familyId, childId, projectId],
  )

  /**
   * Whose voice this is, and which engine his settings ask for.
   *
   * The id is this editor's OWN captured `childId` and is never the shell's
   * live one — the same rule the writes follow — and the flag is the value the
   * page resolved for that same child. Built here rather than taken as an
   * object so the two can never name different children, and memoised because
   * `VoiceInput` is remounted by key and should not be remade by an unrelated
   * render.
   */
  const voiceProfile = useMemo(
    () => ({ id: childId, voiceInputEnhanced: childVoiceInputEnhanced === true }),
    [childId, childVoiceInputEnhanced],
  )

  // ── The visit ────────────────────────────────────────────────────────────
  const [visit, setVisit] = useState(() => ({
    visitId: newVisitId(Date.now(), Math.random()),
    version: null as BuildStudioVersion | null,
    /**
     * Validated files from a downloaded archive, when this visit is a recovery.
     *
     * A recovery is its own visit rather than an import into the open one: the
     * editor assigns a new header per import, and a recovered project opened
     * into the starter's bridge could never be saved afterwards. A fresh visit
     * means a fresh frame, a fresh header, the same startup readback, and the
     * previous visit's callbacks and note target retired.
     */
    recovery: null as BuildStudioSourceFiles | null,
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
  /**
   * The download act that owns the door, claimed synchronously.
   *
   * A download captures now, so it has an await and therefore needs the same
   * treatment the Save latch gets: two taps in one tick must not both start a
   * capture (the bridge would refuse the second as busy and the page would have
   * to report "cannot tell" about a game it is perfectly able to read). It
   * holds the act's own id so a finished act releases only its own claim, and
   * it is released on every path — a download can never leave the door shut.
   */
  const downloadLatchRef = useRef<string | null>(null)
  /** Is a download capture running? The button says so and ignores a retap. */
  const [downloadBusy, setDownloadBusy] = useState(false)
  /** What the last tap on a download door produced. Never a save message. */
  const [downloadOutcome, setDownloadOutcome] = useState<DownloadOutcome | null>(null)

  const [hintsOffered, setHintsOffered] = useState(0)
  /**
   * The same count, readable synchronously — because a note records the help
   * that had been OFFERED when the words were accepted, and an accept can
   * follow a Hint in the same tick.
   */
  const hintsOfferedRef = useRef(0)
  useEffect(() => {
    hintsOfferedRef.current = hintsOffered
  }, [hintsOffered])
  /**
   * The words on screen, editable, about the save that is acknowledged NOW.
   *
   * It is a {@link PendingNote} — the same shape the store holds and the same
   * shape the write sends — so the words, their frozen target, how they were
   * given and how many times they have been sent never drift apart.
   */
  const [noteDraft, setNoteDraft] = useState<PendingNote | null>(null)
  /**
   * This owner's unresolved note, READ FROM THE STORE — not mirrored into
   * state.
   *
   * The store is the single current answer, and that is load-bearing: a copy
   * kept here went stale exactly when it mattered. A write started, the child
   * left, the write landed and released the slot, and the page he came back to
   * still offered words that were already filed — and refused him the mic for
   * a note that no longer existed. Subscribing means an acknowledgment from a
   * mount that is gone reaches this screen.
   */
  const storedNote = useSyncExternalStore(
    useCallback(
      (onChange: () => void) =>
        subscribePendingNote({ familyId, childId, projectId }, onChange),
      [familyId, childId, projectId],
    ),
    useCallback(
      () => readPendingNote({ familyId, childId, projectId }),
      [familyId, childId, projectId],
    ),
  )
  /**
   * The unresolved note the held panel is for: this owner's, when it is not
   * the words currently in the box. Derived, so it cannot disagree with the
   * store about whether it still exists.
   */
  const heldNote =
    storedNote && storedNote.target.noteActionId !== noteDraft?.target.noteActionId
      ? storedNote
      : null
  /**
   * Is a write for this owner's words running right now — including one a
   * previous mount started? This, not a local flag, is what decides whether a
   * retry or a discard may be offered.
   */
  const wordsSending = storedNote?.state === 'sending'
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [noteMessage, setNoteMessage] = useState<string | null>(null)

  /**
   * A replacement that has been asked for but not applied — a saved version or
   * a recovered file — plus what the pre-replacement capture found. One pair
   * for both doors, so neither can replace open work the other would protect.
   */
  const [prospect, setProspect] = useState<
    { version: BuildStudioVersion } | { recovery: BuildStudioSourceFiles } | null
  >(null)
  const [prospectCheck, setProspectCheck] = useState<
    'idle' | 'checking' | 'dirty' | 'unknown' | 'words'
  >('idle')
  const replaceRunRef = useRef<number | null>(null)
  const replaceSeqRef = useRef(0)
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
   * Are there words nobody has written down?
   *
   * Kept SEPARATE from `atRiskRef` because the two say different true things: a
   * dirty editor is a game that is not on the shelf, and this is a sentence that
   * exists nowhere but this page. The departure and the profile guard both block
   * on it, and the dialogs say which of the two it is rather than guessing.
   *
   * Written in an effect AND synchronously by the handlers that accept or edit
   * words — a transcript that lands in the same gesture as a tap on *Today*
   * would otherwise be read at the previous render's value, which is the whole
   * class of defect the departure refs exist for.
   */
  const wordsAtRiskRef = useRef(false)
  const hasWords = (note: PendingNote | null): boolean =>
    note !== null && note.text.trim().length > 0
  const wordsAtRisk = hasWords(noteDraft) || hasWords(heldNote)
  useEffect(() => {
    wordsAtRiskRef.current = wordsAtRisk
  }, [wordsAtRisk])

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

  /**
   * Work that is KNOWN to be at risk, answered synchronously: a game that is
   * not on the shelf, a Save that did not finish, or words nobody saved.
   */
  const workAtRiskNow = useCallback(
    () => atRiskRef.current || wordsAtRiskRef.current,
    [],
  )
  const hasWorkAtRisk = useCallback(
    () => workAtRiskNow() || (editorLiveRef.current && !cleanConfirmedRef.current),
    [workAtRiskNow],
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

  /**
   * ── A save that LANDED retires the answer a hold is standing on ──────────
   *
   * The defect this closes: navigate while dirty, the departure is held, the
   * dialog's *Save it now* saves the game — and then nothing moved.
   * `departureRunRef` still held the run that had answered "dirty", so the
   * effect below early-returned for ever; `cleanConfirmedRef` was false and the
   * editor was live, so `hasWorkAtRisk` stayed true and the guard's own release
   * never fired. The navigation he asked for never happened, and the dialog
   * went on warning that a game now safely on his shelf was about to be lost
   * (PR #1974 round 1).
   *
   * What it is NOT. Not a release: this only retires the stale answer, so the
   * run that replaces it CAPTURES the editor and compares the saved source
   * against what is in it now — an edit made during the save keeps the hold and
   * keeps its warning, and unsaved words keep the dialog on their own account.
   * Not on STARTING a save: a write in flight is held deliberately. Not on an
   * old acknowledgment: a restored retry's bytes are not what is open, so
   * `commit` never marks one (`sourceIsCurrent`), and the two checks below
   * refuse one that somehow arrives — the visit must still be the one the save
   * landed in, and those exact bytes must still be what this app believes is on
   * the shelf.
   */
  const savedForDepartureRef = useRef<SavedForDeparture | null>(null)
  const [savedForDepartureSeq, setSavedForDepartureSeq] = useState(0)
  const savedForDepartureSeenRef = useRef(0)
  /** Record a save that landed for the open source. One pass acts on it. */
  const noteSavedForDeparture = useCallback((saved: SavedForDeparture) => {
    savedForDepartureRef.current = saved
    setSavedForDepartureSeq((seq) => seq + 1)
  }, [])

  useEffect(() => {
    /**
     * Read on the FIRST pass that sees it, whether or not anything is held: a
     * marker left sitting would retire a later hold's run and then race its
     * own capture, which the bridge would refuse as busy and this page would
     * have to report as "cannot tell".
     */
    let savedRetiresRun = false
    if (savedForDepartureSeq !== savedForDepartureSeenRef.current) {
      savedForDepartureSeenRef.current = savedForDepartureSeq
      const saved = savedForDepartureRef.current
      savedForDepartureRef.current = null
      savedRetiresRun =
        saved !== null &&
        saved.token === liveTokenRef.current &&
        settledSignatureRef.current === saved.signature
    }
    if (!departure.held) {
      // The hold ended: retire any run still in flight and reset for the next.
      departureRunRef.current = null
      cleanConfirmedRef.current = false
      setDepartureCheck('idle')
      return
    }
    if (savedRetiresRun) {
      departureRunRef.current = null
      // The next capture is what may set this again. A save does not get to
      // declare the editor clean; it only gets the question re-asked.
      cleanConfirmedRef.current = false
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
      // Clean is still recorded when it is true — it is an observation about
      // the SOURCE, made while the editor was intact, and the guard's own
      // release effect needs it the moment the last thing at risk is dealt
      // with. What it no longer does by itself is leave.
      if (result === 'clean') cleanConfirmedRef.current = true
      if (result === 'clean' && !wordsAtRiskRef.current) {
        // Nothing at all is at risk, so the person is not asked a question
        // about nothing — the departure they already chose simply continues.
        departure.leaveAnyway()
      }
      // Clean source, unsaved WORDS: the dialog stays, because a sentence he
      // said is work, and leaving is still allowed — deliberately.
    })
  }, [departure, token, checkSourceNow, savedForDepartureSeq])

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
        // A clean GAME is not an empty page: words he said are only here. The
        // ask stays open, with Save my words, Discard and Stay on it.
        if (wordsAtRiskRef.current) return
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
    // A RECEIPT belongs to the visit it was earned in. The words themselves are
    // deliberately NOT cleared here: a new visit retires the draft's target,
    // and the effect that owns that transition keeps the words by holding them
    // for their owner. Clearing them here would be the loss this run exists to
    // fix, dressed up as housekeeping.
    setNoteState('idle')
    setNoteMessage(null)
    // A download receipt is a receipt for a visit, and the earlier copy it may
    // be holding is that visit's bytes. Both go with it — the render is fenced
    // on the token as well, so this is housekeeping rather than the guard.
    setDownloadOutcome(null)
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

  /** Start a brand new visit on the same source — the Try again door. */
  const reopenCurrent = useCallback(() => {
    setLoadedToken(null)
    setVisit((current) => ({
      visitId: newVisitId(Date.now(), Math.random()),
      version: current.version,
      recovery: current.recovery,
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
        const recovering = visit.recovery
        const files: BuildStudioSourceFiles = recovering
          ? recovering
          : reopening
            ? // The chosen version's OWN bytes, read back from its archive —
              // never "whatever the latest frame happens to hold".
              parseBuildStudioSource(reopening.sourceArchive)
            : starterSourceFiles()
        // What the app believes is on the shelf for this visit: a reopened
        // version IS a saved version, and a freshly imported starter is
        // unchanged. Either way the editor's first `workspacesave` carries
        // these same bytes and must read CLEAN.
        //
        // A RECOVERY is the exception and stays `null`: nothing recovered from
        // a file is on the shelf, so it reads DIRTY until a deliberate Save —
        // which is also what keeps the departure guard protecting it.
        settledSignatureRef.current = recovering ? null : sourceSignature(files)
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
        // A recovered file and a reopened version are both the child's OWN
        // bytes, so they are judged by the weaker rule: the app does not get to
        // require a life block in his game.
        const ok =
          reopening || recovering
            ? reopenedVersionLooksLoaded(round.files)
            : starterImportLooksCorrect(round.files)
        setProjectReady(ok)
        setAdvisory(
          ok
            ? recovering
              ? 'Your game file is open. It is not on your shelf yet — tap Save my version to keep it here.'
              : null
            : recovering
              ? 'That game file did not open properly, so saving is turned off to protect it. Try opening the file again.'
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
  }, [loadedToken, token, visit.version, visit.recovery])

  // ── Save ───────────────────────────────────────────────────────────────

  /**
   * Send ONE payload, with one automatic retry of the exact same bytes and the
   * exact same id. A loop rather than recursion, so "how many times may this be
   * sent" is one readable condition. `attempts` lives on the payload, so a
   * MANUAL retry continues the same action rather than restarting the count.
   */
  const commit = useCallback(
    async (payload: PendingSave, invocation: SaveInvocation) => {
      let attempt: PendingSave = payload
      /**
       * PROVENANCE — immutable, from the payload. Whose the work is, which
       * version it is, which bytes, and the visit it was captured in. This is
       * what the WRITE uses, so a restored retry still lands on its own
       * document under its own child. Never rebound.
       */
      const ownOwner: PendingOwner = {
        familyId: payload.scope.familyId,
        childId: payload.scope.childId,
        projectId: payload.scope.projectId,
      }
      /**
       * INVOCATION — the live UI this deliberate act belongs to. Separate from
       * provenance, which is the whole repair: a restored Retry tapped after a
       * remount has an OLD payload scope and a CURRENT invocation, and the old
       * code compared the acknowledgment to the old scope and so never updated
       * the screen — leaving "Saving…" forever with the version on the shelf.
       */
      const uiLive = () =>
        liveTokenRef.current === invocation.token &&
        saveLatchRef.current === invocation.opId &&
        invocation.familyId === ownOwner.familyId &&
        invocation.childId === ownOwner.childId &&
        invocation.projectId === ownOwner.projectId
      /**
       * Were these bytes captured in the visit that is on screen NOW?
       *
       * A restored old-source Retry says no, and that answer is load-bearing:
       * it may report Saved, but it may not declare the CURRENT editor contents
       * clean, and it may not become the note target — the words would be filed
       * against a version that is not what is open.
       */
      const sourceIsCurrent = scopeToken(payload.scope) === invocation.token

      for (;;) {
        attempt = { ...attempt, attempts: attempt.attempts + 1 }
        const sending = attempt
        // Identity-conditional, through the SAME rule the store uses: an older
        // save's retry may not take a newer save's recovery slot, and may not
        // replace it on screen either. The HOLD is provenance-bound and always
        // runs; the SCREEN is only touched while this invocation is live.
        holdPendingSave(ownOwner, sending)
        if (uiLive()) {
          setPending((current) => (pendingSlotAccepts(current, sending) ? sending : current))
          setSaveState(SaveState.Writing)
        }
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
          if (!uiLive()) {
            // An accepted write bound to its owner finished for a screen that
            // is no longer there, or was abandoned. Not undone, not silently
            // dropped, and NOT applied to whatever visit is mounted now.
            onOutOfScopeSave?.(
              `A save started earlier finished and is on the shelf as “${attempt.label}”.`,
            )
            return
          }
          if (sourceIsCurrent) {
            // These bytes ARE what is open, so they are what "clean" means from
            // here on, and they are a legitimate note target.
            settledSignatureRef.current = attempt.capturedSignature
            // Did a REAL new edit arrive while this was writing? Compared by
            // content: the capture's own save events carry the captured bytes
            // and read clean. An editor that has announced nothing is clean.
            const announced = announcedSignatureRef.current
            const stillCurrent =
              announced === null || announced === attempt.capturedSignature
            setEditorDirty(!stillCurrent)
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
            // The game this visit has open is now on the shelf, so a departure
            // being held on the reading from BEFORE this save is being held on
            // something that is no longer true. It is re-asked, not released:
            // `stillCurrent` above is about the announcement, and the re-check
            // captures the editor itself.
            noteSavedForDeparture({
              token: invocation.token,
              signature: attempt.capturedSignature,
            })
          } else {
            // A RESTORED retry: the version is safely on the shelf, and the
            // editor in front of him holds something else. So neither
            // `settledSignatureRef` nor `editorDirty` is touched — whatever is
            // open stays as dirty as it actually is — and no note target is
            // bound, because his words would be filed against bytes that are
            // not what he is looking at.
            setSaveMessage(SAVED_EARLIER_LINE)
          }
          setSaveState(SaveState.Saved)
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
            // The auto-retry re-checks the invocation BEFORE looping, so an
            // abandoned operation stops writing rather than quietly carrying on
            // against a screen that has moved.
            if (!uiLive()) {
              onOutOfScopeSave?.(
                'A save started earlier did not finish. It is still waiting to be tried again.',
              )
              return
            }
            continue
          }
          if (!uiLive()) {
            // Failed for a retired visit or an abandoned operation. The payload
            // stays held for its owner so the retry is waiting on return.
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
    [onOutOfScopeSave, noteSavedForDeparture],
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
      await commit(payload, { token, opId, ...owner })
    } finally {
      // Only if this operation still owns them.
      if (saveLatchRef.current === opId) {
        saveLatchRef.current = null
        inFlightRef.current = false
      }
    }
  }, [phase, projectReady, label, scope, token, owner, versions.versions.length, commit])

  /**
   * The deliberate Retry. The payload's provenance is untouched — same bytes,
   * same version id, same child — but the INVOCATION is the current screen's,
   * so its acknowledgment lands here instead of being reported as somebody
   * else's finished save and leaving "Saving…" on the button forever.
   */
  const handleRetrySave = useCallback(async () => {
    if (saveLatchRef.current) return
    if (!pending) return
    const opId = newVersionId(Date.now(), Math.random())
    saveLatchRef.current = opId
    inFlightRef.current = true
    try {
      await commit(pending, { token, opId, ...owner })
    } finally {
      if (saveLatchRef.current === opId) {
        saveLatchRef.current = null
        inFlightRef.current = false
      }
    }
  }, [pending, commit, token, owner])

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
      await commit(
        {
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
        },
        { token, opId, ...owner },
      )
      departureFilesRef.current = null
    } finally {
      if (saveLatchRef.current === opId) {
        saveLatchRef.current = null
        inFlightRef.current = false
      }
    }
  }, [commit, scope, label, token, owner, versions.versions.length])

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
   * Get the game that is OPEN out — or say truthfully that it could not.
   *
   * ── The current copy is CAPTURED, never assembled from what is held ─────
   *
   * This button means "a copy of what I am looking at", so it asks the live
   * scoped editor for the source at the moment of the tap, and exports exactly
   * what comes back. That is the only reading that can contain an edit MakeCode
   * has not announced yet, and the only one that is the open game by
   * construction rather than by argument.
   *
   * Every stored copy here is older than that by construction — a pre-departure
   * read, a failed save's exact payload, the last source the editor announced —
   * and ordering them cleverly is not a fix. It was tried twice. First the
   * stored copies came first, so a child whose blocks had gone over the cap got
   * his PREVIOUS game byte for byte with nothing said (PR #1974 round 1). Then
   * the over-cap reading came first, which caught only the oversized case: an
   * ORDINARY in-cap five-life edit, announced or not, still exported the
   * retained four-life payload of a save that had failed (PR #1975 promotion
   * review, UX-498). The hole was the premise, not the order.
   *
   * So on a failure nothing is substituted. The page says it could not read the
   * game, and the copy it does hold is offered as its own explicitly labelled
   * choice — {@link handleDownloadEarlier}, named for what it is, exported under
   * {@link EARLIER_DOWNLOAD_LABEL}. Never the starter, which is what he began
   * from and not what he made.
   *
   * The one export that is still handed over on a failure is the CURRENT source
   * the caps refused, and only when this capture is what refused it: the bytes
   * are then provably the open game, bounded by the archive cap, and the file
   * name and the sentence both say they are not on the shelf.
   *
   * It writes nothing — no version, no note, no record of any kind — and it
   * never touches the unfinished save, whose own *Try again* keeps its exact
   * payload, version id and action.
   */
  const handleDownloadCurrent = useCallback(async () => {
    // ── One download at a time, claimed before the first await ───────────
    //
    // A second tap is ignored rather than queued, and the latch holds this
    // act's own id so a finished act can only ever release its own claim. It
    // is released in `finally` on every path, so no failure can leave the door
    // shut.
    if (downloadLatchRef.current) return
    const opId = newVersionId(Date.now(), Math.random())
    downloadLatchRef.current = opId
    const ownToken = token
    const bridge = bridgeRef.current
    const give = (files: BuildStudioSourceFiles, fileLabel: string) => {
      for (const download of buildStudioDownloads(files, fileLabel)) {
        downloadTextFile(download)
      }
    }
    /**
     * The newest copy this page is still holding, or `null`.
     *
     * Newest first, and each one knows which moment it is from so the offer can
     * say so. The editor's own last announcement comes first because a capture
     * announces the bytes it collects, so it is at least as new as the
     * pre-departure read that produced it.
     */
    const earlierCopy = (): EarlierCopy | null => {
      const announced = bridge?.editorSaveSeen()?.files ?? null
      if (announced) return { files: announced, origin: 'announced', saveLabel: null }
      const departed = departureFilesRef.current
      if (departed) return { files: departed, origin: 'departure', saveLabel: null }
      if (pending) return { files: pending.files, origin: 'pending', saveLabel: pending.label }
      return null
    }
    /** Report, only into the visit that asked. */
    const settle = (
      tone: 'done' | 'refused',
      line: string,
      earlier: EarlierCopy | null,
    ) => {
      if (liveTokenRef.current !== ownToken) return
      setDownloadOutcome({ token: ownToken, tone, line, earlier })
    }
    setDownloadBusy(true)
    try {
      if (!bridge) {
        // There is no editor to ask — the frame never came up, or this visit
        // has none. Said plainly, with the held copy offered as itself.
        settle('refused', CURRENT_UNAVAILABLE_LINE, earlierCopy())
        return
      }
      // Deliberately NOT gated on `projectReady`. A project this page could not
      // read BACK is exactly the case the advisory sends a person here for, and
      // the bridge answers for itself: an unfinished handshake is its own
      // `not-ready` refusal, which lands on the honest-refusal path below.
      let snapshot: AcceptedProject
      try {
        snapshot = await bridge.requestSnapshot()
      } catch (err) {
        // ── Scope, before anything is read or written ──────────────────
        //
        // A refusal that lands after the child, the version or the visit
        // changed belongs to the visit that asked for it. It may not download,
        // relabel or report into the one on screen now.
        if (liveTokenRef.current !== ownToken || bridgeRef.current !== bridge) return
        if (captureRefusedForSize(err)) {
          // THIS capture read the open source and the caps refused it, so the
          // over-cap reading below is the game in front of him.
          const oversized = bridge.oversizedSourceForDownload()
          if (oversized) {
            give(oversized, OVERSIZED_DOWNLOAD_LABEL)
            settle('refused', OVERSIZED_DOWNLOAD_LINE, null)
            return
          }
          // Too big to hand back at all. Nothing older is substituted for it,
          // and the page names the save it is not giving him.
          settle(
            'refused',
            pending
              ? `${OVERSIZED_NO_DOWNLOAD_LINE} ${unfinishedSaveAside(pending.label)}`
              : OVERSIZED_NO_DOWNLOAD_LINE,
            earlierCopy(),
          )
          return
        }
        // Timed out, busy with a Save or a departure read, not ready, or the
        // editor handed nothing over. Every one of those means the same thing:
        // this page does not know what is in the editor, so it does not claim
        // to. The bridge's own serialization is what refuses a capture while
        // another one is running, which is how a download cannot steal a
        // Save's or a departure's.
        settle('refused', CURRENT_UNAVAILABLE_LINE, earlierCopy())
        return
      }
      if (liveTokenRef.current !== ownToken || bridgeRef.current !== bridge) return
      give(snapshot.files, CURRENT_DOWNLOAD_LABEL)
      settle('done', CURRENT_DOWNLOAD_LINE, null)
    } finally {
      if (downloadLatchRef.current === opId) downloadLatchRef.current = null
      setDownloadBusy(false)
    }
  }, [token, pending])

  /**
   * Export the earlier copy, as the earlier copy.
   *
   * A deliberate second act, offered only after a current copy has already been
   * refused out loud, named before the tap by {@link earlierCopyLine}, and
   * written to a file whose name says what it is. It saves nothing, sends
   * nothing, and leaves an unfinished save exactly where it is.
   */
  const handleDownloadEarlier = useCallback(() => {
    const outcome = downloadOutcome
    const earlier = outcome?.earlier
    if (!outcome || !earlier) return
    // The offer belongs to the visit it was made in. A child, version or visit
    // change retires it rather than letting another visit's bytes out under
    // this screen's name.
    if (outcome.token !== liveTokenRef.current) {
      setDownloadOutcome(null)
      return
    }
    for (const download of buildStudioDownloads(earlier.files, EARLIER_DOWNLOAD_LABEL)) {
      downloadTextFile(download)
    }
    // The offer is consumed, so a second tap cannot quietly produce a second
    // file; tapping Download a copy again is how a person asks once more.
    setDownloadOutcome({
      token: outcome.token,
      tone: 'done',
      line: EARLIER_DOWNLOAD_LINE,
      earlier: null,
    })
  }, [downloadOutcome])

  // ── Reopen ─────────────────────────────────────────────────────────────

  /** Replace what is open. Called only after the check or an explicit choice. */
  const applyReplace = useCallback(
    (next: { version: BuildStudioVersion } | { recovery: BuildStudioSourceFiles }) => {
      const version = 'version' in next ? next.version : null
      // Checked AGAIN here, not only on the shelf: this is the action that
      // imports bytes, and a row for another project under the same child must
      // never load as this project.
      if (version && !versionBelongsTo(version, childId, projectId)) {
        setProspect(null)
        setProspectCheck('idle')
        setSaveMessage('That saved game is not part of this one, so it was not opened.')
        return
      }
      if (version) setOpeningVersionId(version.versionId)
      setProspect(null)
      setProspectCheck('idle')
      setSaveState(SaveState.Idle)
      setSaveMessage(null)
      setLastSaved(null)
      // The DRAFT is not thrown away here. It used to be, which is how an Open
      // or a recovery silently deleted a sentence he had already said: the new
      // visit retires its target, and the effect that notices that keeps the
      // words for their owner instead. Only the receipt is visit-scoped.
      setNoteState('idle')
      setNoteMessage(null)
      setHintsOffered(0)
      hintsOfferedRef.current = 0
      departureFilesRef.current = null
      setLoadedToken(null)
      // A brand new visit: a new id, so nothing from the previous one can act
      // here even on an `A → B → A`.
      setVisit({
        visitId: newVisitId(Date.now(), Math.random()),
        version,
        recovery: 'recovery' in next ? next.recovery : null,
      })
    },
    [childId, projectId],
  )

  useEffect(() => {
    if (phase === EditorPhase.Ready || phase === EditorPhase.Failed) {
      setOpeningVersionId(null)
    }
  }, [phase])

  /**
   * Ask to replace what is open — with a saved version, or with a recovered
   * file — and don't replace anything until the open source has been looked at.
   *
   * ONE path for both doors. The shelf's Open used to consult only
   * `editorDirty`, which is the ANNOUNCED state, so an in-frame edit MakeCode
   * had not reported yet was replaced and lost; the recovery door replaced
   * regardless. A capture runs while the old editor is still intact: a verified
   * clean one proceeds by itself, and dirty or uncertain stops for Stay or an
   * explicit Replace. Nothing is privately saved either way.
   */
  const requestReplace = useCallback(
    (next: { version: BuildStudioVersion } | { recovery: BuildStudioSourceFiles }) => {
      if (writeInFlight || saveLatchRef.current) return
      replaceSeqRef.current += 1
      const runId = replaceSeqRef.current
      replaceRunRef.current = runId
      setProspect(next)
      // A failed save's exact retry is work, and its loss has to be deliberate.
      if (pending) {
        setProspectCheck('dirty')
        return
      }
      // Unsaved WORDS do not answer the question about the game, and must never
      // stand in for it: stopping here on the words alone skipped the capture,
      // so an edit MakeCode had not announced read as clean and an Open
      // destroyed it while the warning talked only about the sentence. The
      // capture runs either way, while the editor is still intact, and the two
      // facts are reported separately.
      setProspectCheck('checking')
      void checkSourceNow().then((result) => {
        if (replaceRunRef.current !== runId) return
        if (result === 'clean' && !wordsAtRiskRef.current) {
          replaceRunRef.current = null
          setProspect(null)
          setProspectCheck('idle')
          applyReplace(next)
          return
        }
        // `words` means exactly that: the game was READ and is clean, and the
        // only thing unsaved is what he said. `unknown` stays unknown — an
        // unavailable capture is never reported as clean.
        setProspectCheck(
          result === 'dirty' ? 'dirty' : result === 'unknown' ? 'unknown' : 'words',
        )
      })
    },
    [writeInFlight, pending, checkSourceNow, applyReplace],
  )

  /** Abandon the replacement. Current edits and any pending retry stay. */
  const cancelReplace = useCallback(() => {
    replaceRunRef.current = null
    setProspect(null)
    setProspectCheck('idle')
  }, [])

  /**
   * Put a previously downloaded archive back in, as its own fresh visit.
   *
   * The route back in, so the download really is a recovery. An explicit
   * action, bounded and checked by `readRecoveryArchive`. It does NOT import
   * into the current visit: stock assigns a new header per import, and a
   * recovered project pushed into the starter's bridge opened fine and then
   * could never be saved. It writes nothing — the child saves it himself, which
   * is the only way it becomes a version.
   */
  const handleRecoveryFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      const ownToken = token
      /**
       * Reading a file is slow, and an ordinary Save can start while it is in
       * flight. So the visit AND the write latch are re-read after the await,
       * on both paths — a recovery must never retire an active save or
       * overwrite its state.
       */
      const stillOurs = () =>
        liveTokenRef.current === ownToken &&
        !saveLatchRef.current &&
        !inFlightRef.current
      let files: BuildStudioSourceFiles
      try {
        files = readRecoveryArchive(await file.text())
      } catch (err) {
        if (!stillOurs()) return
        setSaveMessage(
          err instanceof RecoveryRefused || err instanceof Error
            ? err.message
            : 'That file could not be opened.',
        )
        setSaveState(SaveState.Failed)
        return
      }
      if (!stillOurs()) return
      requestReplace({ recovery: files })
    },
    [token, requestReplace],
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
    // Synchronously too: a Hint and an accepted transcript can land in one
    // tick, and the note must record the help that really had been offered.
    hintsOfferedRef.current = hint.rung
    setHintsOffered(hint.rung)
    tts.speak(hint.text)
  }, [hintsOffered, openLives, tts])

  const currentHint = hintsOffered > 0 ? nextHint(hintsOffered - 1, openLives) : null

  // ── The reflection ────────────────────────────────────────────────────

  /**
   * What a reflection recorded right now would be ABOUT — the SAVE, not the
   * note.
   *
   * `null` until a version has been acknowledged in THIS visit, which is what
   * makes the slot unambiguous. It deliberately carries no `noteActionId`: the
   * id used to be minted here, so every sentence said about one save reused one
   * id and the writer — correctly — refused the second genuinely different note
   * as already saved. The id is minted when words are ACCEPTED, below.
   */
  const noteSlot: BuildStudioNoteSlot | null = useMemo(() => {
    if (!lastSaved) return null
    return {
      familyId,
      childId,
      projectId,
      versionId: lastSaved.versionId,
      versionDocId: lastSaved.versionDocId,
      visitId: visit.visitId,
      // Placeholders only. The help a NOTE records is read when the words are
      // accepted, in `newNoteFor` — these fields exist because the slot shares
      // a shape with the target, and nothing writes them.
      help: 'unknown',
    }
    // `hintsOffered` is deliberately NOT a dependency: the identity of the save
    // these words are about must not change because help state changed, or an
    // accepted draft would be retargeted by a hint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSaved, familyId, childId, projectId, visit.visitId])

  /**
   * ONE note action, minted when a person's words are accepted.
   *
   * Frozen with the words and reused by every attempt of THOSE words — which is
   * what makes a retry idempotent rather than a second document. A new sentence
   * about the same save gets a new id and is a new note, which is the whole
   * point of not minting it with the slot.
   *
   * The help is read HERE, at acceptance, for the same reason: it is how much
   * authored help had been OFFERED before he spoke. Freezing it when the GAME
   * was acknowledged recorded "none offered" for a child who had just tapped
   * Hint and then said what he was trying. It is offered, never heard, and
   * never anything about mastery — and a hint offered after these words are
   * accepted does not rewrite them.
   */
  const newNoteFor = useCallback(
    (slot: BuildStudioNoteSlot): BuildStudioNoteTarget => {
      const offered = hintsOfferedRef.current
      return {
        ...slot,
        help: offered > 0 ? 'hints-offered' : 'none-offered',
        hintsOffered: offered > 0 ? offered : undefined,
        noteActionId: newNoteActionId(Date.now(), Math.random()),
      }
    },
    [],
  )

  /** A draft whose save is no longer the live one is retired, not written. */
  const draftIsStale = noteDraft !== null && !sameNoteSlot(noteDraft.target, noteSlot)

  /**
   * The words on screen, readable synchronously.
   *
   * An acknowledgment that arrives after a tap has to compare itself against
   * what is in the box NOW — including a correction typed in the same tick —
   * and a render-time copy would answer with the previous render's words.
   */
  const noteDraftRef = useRef<PendingNote | null>(null)

  /**
   * Put words on screen, and update what the guards read, together.
   *
   * One door, so there is no state in which the box holds a sentence and the
   * departure guard believes the page is empty. It only ever raises the
   * at-risk flag: lowering it is the settling effect's job, because held words
   * may still exist after the draft is cleared.
   */
  const putDraft = useCallback((next: PendingNote | null) => {
    noteDraftRef.current = next
    if (next && next.text.trim()) wordsAtRiskRef.current = true
    setNoteDraft(next)
  }, [])

  /**
   * Keep unsaved words for their owner — and, when the save they were about is
   * no longer the one on screen, move them to the held panel instead of
   * dropping them.
   *
   * This is the repair. The words used to live only in this component's state,
   * so a tap on *Today*, a profile switch, an Open from the shelf or a recovery
   * file ended them with no warning and nothing to come back to. They are now
   * held for family + child + project, in memory, and offered back on return.
   * Holding is NOT saving: nothing durable is written until *Save my words*.
   */
  useEffect(() => {
    if (!noteDraft) return
    if (!noteDraft.text.trim()) {
      // He cleared the box himself. The screen is the truth, so the held copy
      // of these words goes with it — but only this action's copy.
      clearPendingNote(owner, noteDraft.target.noteActionId)
      if (draftIsStale) putDraft(null)
      return
    }
    holdPendingNote(owner, noteDraft)
    if (!draftIsStale) return
    // The save these words were accepted for is not the acknowledged one any
    // more — a newer save, a reopened version, a recovery, a fresh visit. The
    // store already holds them with their OWN target, so dropping the draft is
    // all this takes: they reappear in the held panel, from the store.
    putDraft(null)
    setNoteState('idle')
    setNoteMessage(null)
  }, [noteDraft, draftIsStale, owner, putDraft])

  /**
   * Send ONE set of words, once.
   *
   * PROVENANCE is the payload's and is never rebound: its target names the
   * version, that version's document, the visit the words were given in, the
   * help that had been offered and the single `noteActionId` the writer is
   * idempotent on. So a retry after a remount still files his sentence against
   * the save it was actually about.
   *
   * The SCREEN is only touched while this act still owns the note latch and the
   * visit it started in — a late acknowledgment may not clear newer words, and
   * may not land in another visit's panel.
   *
   * There is no automatic retry and no automatic write: a note is sent when a
   * person taps, and never otherwise.
   */
  const commitNote = useCallback(
    async (payload: PendingNote, invocation: { token: string; opId: string }) => {
      const ownOwner: PendingOwner = {
        familyId: payload.target.familyId,
        childId: payload.target.childId,
        projectId: payload.target.projectId,
      }
      // Same words, same action, same frozen stamp — one more attempt of it,
      // and `sending` as the module's honest answer while it is out.
      const sending: PendingNote = {
        ...payload,
        attempts: payload.attempts + 1,
        state: 'sending',
      }
      // Held BEFORE the write and bound to the payload's own owner, so a
      // departure or a remount mid-write still has the exact words and the
      // exact action to try again.
      if (!holdPendingNote(ownOwner, sending)) {
        // The slot refused it: another action is unresolved, or these exact
        // words were deliberately discarded. Either way nothing is sent.
        setNoteState('idle')
        setNoteMessage(null)
        return
      }
      // One send per owner, claimed in the module so it outlives this mount.
      // Without it two mounts could retry one action at once and either could
      // contradict the other's result.
      const claimId = claimNoteSend(ownOwner, sending.target.noteActionId)
      if (!claimId) {
        setNoteState('saving')
        setNoteMessage('Those words are already being saved — one moment.')
        return
      }
      const uiLive = () =>
        liveTokenRef.current === invocation.token &&
        noteLatchRef.current === invocation.opId
      if (uiLive()) {
        setNoteState('saving')
        setNoteMessage(null)
      }
      try {
        await saveBuildStudioNote({
          familyId: sending.target.familyId,
          childId: sending.target.childId,
          projectId: sending.target.projectId,
          versionId: sending.target.versionId,
          versionDocId: sending.target.versionDocId,
          noteActionId: sending.target.noteActionId,
          text: sending.text,
          capture: sending.capture,
          help: sending.target.help,
          hintsOffered: sending.target.hintsOffered,
          voiceEventId: sending.voiceEventId,
          // Frozen when the words were accepted, so every attempt — including
          // one after a remount — writes the same document rather than a
          // second one stamped with the time the retry happened to occur.
          createdAt: sending.createdAt,
        })
        // Filed now, whatever the screen is showing. This action releases ITS
        // OWN held words by action id and no others — and the store tells every
        // mounted editor, including the one he came back to.
        clearPendingNote(ownOwner, sending.target.noteActionId)
        if (!uiLive()) return
        const live = noteDraftRef.current
        // Only THIS action's words may be cleared by this acknowledgment. A
        // draft about another save is another scope and is left alone.
        const sameAction =
          live !== null && live.target.noteActionId === sending.target.noteActionId
        if (sameAction && !sameNotePayload(live, sending)) {
          // The wording changed at the SAME save while this was in flight. What
          // is filed is what was sent. The newer sentence is not that note and
          // is not a retry of it, so it becomes its OWN note — a fresh action
          // id and a fresh stamp — rather than being refused forever as
          // already saved, or quietly thrown away.
          putDraft({
            ...live,
            target: newNoteFor(live.target),
            createdAt: new Date().toISOString(),
            attempts: 0,
            state: 'unsent',
          })
          setNoteState('saved')
          setNoteMessage(
            'Your words were filed as you sent them. What is in the box now is different and is not saved — tap Save my words to keep that as well.',
          )
          return
        }
        if (sameAction) putDraft(null)
        setNoteState('saved')
        setNoteMessage('Saved with your game.')
      } catch (err) {
        // What the MODULE knows, whatever the screen is doing: THIS claimed
        // attempt came back and did not land. Conditional on every count —
        // the live claim, its own action, and the slot still holding it — so a
        // failure cannot resurrect discarded words, cannot overwrite another
        // action, and cannot contradict an acknowledgment that already landed.
        const failed: PendingNote = { ...sending, state: 'failed' }
        const stillOurs = failPendingNote(ownOwner, claimId, failed)
        if (!uiLive()) return
        if (!stillOurs) {
          // Somebody dealt with these words while the write was out. The store
          // is the answer, so nothing here overrides it.
          setNoteState('idle')
          setNoteMessage(null)
          return
        }
        setNoteState('failed')
        setNoteMessage(
          err instanceof BuildStudioNoteRefused || err instanceof Error
            ? err.message
            : 'Your words did not save. Try again — your game is safe either way.',
        )
        // The words are deliberately kept, with their action, stamp and attempt
        // count, so the retry re-sends THEM rather than a second note.
        if (sameNotePayload(noteDraftRef.current, failed)) putDraft(failed)
      } finally {
        // The next deliberate tap may claim it. Only this claim is released.
        releaseNoteSend(ownOwner, claimId)
      }
    },
    [putDraft, newNoteFor],
  )

  /** Save the words on screen, about the save they were accepted for. */
  const handleSaveNote = useCallback(async () => {
    // Synchronous, before anything can await: two taps are one send.
    if (noteLatchRef.current) return
    const draft = noteDraftRef.current
    if (!draft || !draft.text.trim()) return
    if (!sameNoteSlot(draft.target, noteSlot)) {
      // A draft about V1 is never written against V2 — and never dropped for
      // it either. The words move to the held panel with their own target,
      // where they can be saved with that save or discarded on purpose.
      holdPendingNote(owner, draft)
      putDraft(null)
      setNoteState('idle')
      setNoteMessage(null)
      return
    }
    const opId = newNoteActionId(Date.now(), Math.random())
    noteLatchRef.current = opId
    try {
      await commitNote(draft, { token, opId })
    } finally {
      if (noteLatchRef.current === opId) noteLatchRef.current = null
    }
  }, [noteSlot, owner, token, commitNote, putDraft])

  /**
   * Save words that are about an EARLIER save: the exact held payload, with its
   * own version, action id and voice provenance. Not re-bound to what is open.
   */
  const handleSaveHeldNote = useCallback(async () => {
    if (noteLatchRef.current) return
    if (!heldNote || !heldNote.text.trim()) return
    // Not while a write for these words is actually running, whoever started
    // it. The claim below would refuse anyway; this keeps the page honest.
    if (heldNote.state === 'sending') return
    const opId = newNoteActionId(Date.now(), Math.random())
    noteLatchRef.current = opId
    try {
      await commitNote(heldNote, { token, opId })
    } finally {
      if (noteLatchRef.current === opId) noteLatchRef.current = null
    }
  }, [heldNote, token, commitNote])

  /**
   * Has the action in the box already been SENT? Answered synchronously, from
   * the store, so a handler kept by a stale render cannot reset the attempt
   * state or replace the exact words a retry is for.
   */
  const draftWasSubmitted = useCallback(() => {
    const draft = noteDraftRef.current
    if (!draft) return false
    const slot = readPendingNote(owner)
    const record =
      slot && slot.target.noteActionId === draft.target.noteActionId ? slot : draft
    return record.attempts > 0 || record.state !== 'unsent'
  }, [owner])

  /**
   * Throw the words on screen away, on purpose. Nothing else does this.
   *
   * Tombstoned by action id, so a failure that arrives afterwards cannot put
   * them back. Refused while a write for them is running: an accepted write
   * cannot be called back, and offering a cancel that is not one would be a
   * lie — the departure dialog's Stay and Leave are still both there.
   */
  const discardDraft = useCallback(() => {
    if (noteLatchRef.current) return
    // The module's answer, not this mount's: a write started before a remount
    // is still a write, and these words are still in it.
    if (noteSendInFlight(owner)) return
    const draft = noteDraftRef.current
    if (draft) discardPendingNote(owner, draft.target.noteActionId)
    putDraft(null)
    setNoteState('idle')
    setNoteMessage(null)
  }, [owner, putDraft])

  /** Throw the earlier words away, on purpose, so they are not offered again. */
  const discardHeldNote = useCallback(() => {
    if (noteLatchRef.current) return
    if (!heldNote) return
    if (heldNote.state === 'sending' || noteSendInFlight(owner)) return
    discardPendingNote(owner, heldNote.target.noteActionId)
  }, [owner, heldNote])

  /**
   * The deliberate way out of a dialog: every unsaved thing he said, gone
   * because somebody chose that. Named exactly that on the button.
   */
  const discardAllWords = useCallback(() => {
    discardDraft()
    discardHeldNote()
  }, [discardDraft, discardHeldNote])

  /** Save, from a dialog: the words on screen first, then any earlier ones. */
  const handleSaveWordsAtRisk = useCallback(async () => {
    if (noteDraftRef.current?.text.trim()) {
      await handleSaveNote()
      return
    }
    await handleSaveHeldNote()
  }, [handleSaveNote, handleSaveHeldNote])

  /**
   * True while a write owns this owner's words — including one a previous
   * mount started. Corrections, Start over, Retry and Discard are all closed
   * then, because none of them is true while an accepted write is out.
   */
  const noteBusy = noteState === 'saving' || wordsSending

  /**
   * Have the words in the box already been SENT under this action id?
   *
   * From the store when the store knows this action, because that is the
   * authority across mounts. Once an action has been attempted its text is
   * immutable: the writer keeps one note per action id and will not replace
   * its text, so a correction typed after a failure (or after a persisted
   * write whose acknowledgment was lost) could only be refused. Retry keeps
   * these words; Start over is the door to different ones.
   */
  const draftRecord =
    noteDraft &&
    storedNote &&
    storedNote.target.noteActionId === noteDraft.target.noteActionId
      ? storedNote
      : noteDraft
  const draftSubmitted =
    draftRecord !== null && (draftRecord.attempts > 0 || draftRecord.state !== 'unsent')
  /** The box is shut while a send owns it, and for good once it was sent. */
  const noteLocked = noteBusy || draftSubmitted

  /**
   * A local "Saving…" cannot outlive the send it was about.
   *
   * The store knows when the write for this owner ended, including one this
   * mount only watched. Without this, a mount that was refused the claim —
   * because another mount held it — would show Saving… forever.
   */
  useEffect(() => {
    if (wordsSending) return
    if (noteLatchRef.current) return
    if (noteState === 'saving') setNoteState('idle')
  }, [wordsSending, noteState])

  // ── Render ────────────────────────────────────────────────────────────

  const gated = phase !== EditorPhase.Ready || !projectReady
  const canSave = phase === EditorPhase.Ready && projectReady && !writeInFlight

  /**
   * What is true about unsaved words, said once and used by both doors.
   *
   * It does not claim they are about to be destroyed — they are held for this
   * page session — and it does not claim they are kept, either. It says the
   * only thing that is certainly true: nothing has written them down.
   */
  const wordsRiskLine = !wordsAtRisk
    ? null
    : wordsSending
      ? 'Your words are being saved right now. Leaving will not undo that, and nothing is written down until it finishes.'
      : 'Your words are not saved yet. They stay on this page until you save or discard them, and closing the app loses them.'

  /**
   * Save or discard the words, from a dialog.
   *
   * *Save my words* sends the ones on screen first and the earlier ones after,
   * so a second set is still asked about rather than swept up. *Discard my
   * words* is the deliberate loss, and discards exactly what the line above
   * describes: everything unsaved he said.
   */
  const wordsDialogActions = wordsAtRisk ? (
    <>
      <Button
        disabled={noteBusy}
        onClick={() => void handleSaveWordsAtRisk()}
        sx={{ textTransform: 'none', minHeight: 48 }}
      >
        Save my words
      </Button>
      <Button
        color="error"
        disabled={noteBusy}
        onClick={discardAllWords}
        sx={{ textTransform: 'none', minHeight: 48 }}
      >
        Discard my words
      </Button>
    </>
  ) : null

  /**
   * The download receipt, and the earlier copy's own door when there is one.
   *
   * ONE node, rendered in exactly one place at a time — inside whichever dialog
   * is open, and otherwise beside the Save. A receipt rendered only under the
   * Save would sit behind the departure and profile dialogs, which both offer
   * *Download a copy*: the refusal would be invisible and the earlier copy's
   * explicit choice would be unreachable, so the honest refusal would read as a
   * tap that did nothing.
   *
   * Fenced on the token, so a receipt and the bytes it holds belong to the
   * visit that earned them.
   */
  const downloadReceipt =
    downloadOutcome && downloadOutcome.token === token ? (
      <Alert
        severity={downloadOutcome.tone === 'done' ? 'success' : 'warning'}
        action={
          downloadOutcome.earlier ? (
            <Button
              size="small"
              onClick={handleDownloadEarlier}
              sx={{ textTransform: 'none' }}
            >
              Download the earlier copy
            </Button>
          ) : undefined
        }
      >
        {downloadOutcome.line}
        {downloadOutcome.earlier ? ` ${earlierCopyLine(downloadOutcome.earlier)}` : ''}
      </Alert>
    ) : null

  /** Is there anything true to ASK about this departure? */
  const departureHasAsk =
    departureCheck === 'checking' ||
    departureCheck === 'dirty' ||
    departureCheck === 'unknown' ||
    wordsAtRisk

  /**
   * What is at risk about the GAME, or `null` when the answer is "nothing".
   *
   * Separated from the words so neither door ever says "your game has changes
   * that are not on your shelf" about a clean editor and an unsaved sentence.
   */
  const departureGameLine =
    departureCheck === 'checking'
      ? null
      : departure.reason === 'in-flight'
        ? 'Your game is being saved right now. Give it a moment — it will carry on by itself.'
        : pending
          ? `A save called “${pending.label}” did not finish. If you leave now it is gone.`
          : departureCheck === 'unknown'
            ? 'This page could not read the editor just now, so it cannot tell whether your changes are saved. Leaving might lose them.'
            : departureCheck === 'dirty' || editorDirty
              ? 'Your game has changes that are not on your shelf yet. If you leave now they are gone.'
              : null

  /** The one condition the leaving dialog opens on, named so it can be read. */
  const departureDialogOpen =
    departure.held && departureCheck !== 'idle' && departureHasAsk

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
                    disabled={downloadBusy}
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

        {/* What a download did, in its own alert: a download is not a save and
            must not be reported through the save's. Shown here only while no
            dialog is holding the same receipt. */}
        {!departureDialogOpen && heldProfile === null && downloadReceipt}

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
                  disabled={downloadBusy}
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
        {!noteSlot && !heldNote && (
          <Typography variant="body2" color="text.secondary">
            Save a version first, then your words can go with it.
          </Typography>
        )}
        {/* Words that are about an EARLIER save: offered back after a return, a
            reopen, a recovery or a newer save — exactly as he said them, with
            the save they belong to named, and never filed by themselves. */}
        {heldNote && (
          <Alert
            severity="warning"
            action={
              <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
                <Button
                  size="small"
                  disabled={noteBusy}
                  onClick={() => void handleSaveHeldNote()}
                  sx={{ textTransform: 'none', fontWeight: 700 }}
                >
                  Save these words
                </Button>
                <Button
                  size="small"
                  color="error"
                  disabled={noteBusy}
                  onClick={discardHeldNote}
                  sx={{ textTransform: 'none' }}
                >
                  Discard these words
                </Button>
              </Stack>
            }
          >
            {/* The title is the module's own answer about this action, never
                an inference from an attempt count: a count cannot tell a
                refusal from a write that is still running, and a page that
                says "did not save" about a live write invites a second one. */}
            <AlertTitle>
              {heldNote.state === 'failed'
                ? 'These words did not save'
                : heldNote.state === 'sending'
                  ? 'These words may still be saving'
                  : 'These words are not saved yet'}
            </AlertTitle>
            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
              “{heldNote.text}”
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {heldNote.versionLabel
                ? `They are about your save “${heldNote.versionLabel}”. `
                : 'They are about an earlier save. '}
              {heldNote.state === 'sending'
                ? 'A save of these exact words is running now, so it cannot be called back or thrown away. They stay here until it finishes — you can wait, or leave and come back.'
                : 'Nothing is written down until you tap Save these words.'}
            </Typography>
          </Alert>
        )}
        {/* The mic is closed while an earlier note is still unresolved. Two
            notes are two different sentences, and the recovery slot holds one
            — so rather than quietly letting a new one displace words nobody
            dealt with, the page asks for that decision first. It is one tap
            either way: save them, or discard them. */}
        {noteSlot && !noteDraft && heldNote && (
          <Typography variant="body2" color="text.secondary">
            {heldNote.state === 'sending'
              ? 'Those words are being saved. When that finishes you can say something new.'
              : 'Save or discard the words above, and then you can say something new.'}
          </Typography>
        )}
        {noteSlot && !noteDraft && !heldNote && (
          <VoiceInput
            // Keyed by the SAVE. A change of acknowledged version or of visit
            // remounts the mic, so a recording started about one save is retired
            // rather than carried into the next.
            key={noteTargetKey(noteSlot)}
            // This child's id AND the engine his settings configure. The mic
            // itself is unchanged: the existing component picks the path, this
            // page adds no recording of its own, and nothing here infers that
            // anything was heard.
            profile={voiceProfile}
            sourceSurface="build-studio-reflection"
            onTranscript={(text, meta) =>
              putDraft({
                text,
                capture: 'voice',
                voiceEventId: meta?.eventId,
                // The note's own identity, minted HERE with the words — one
                // action id and one stamp per accepted sentence, so a retry is
                // the same note and a second sentence is a second note.
                target: newNoteFor(noteSlot),
                createdAt: new Date().toISOString(),
                // Display only, so the held panel can name the save later.
                versionLabel: lastSaved?.label,
                attempts: 0,
                state: 'unsent',
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
              // Closed while the write owns these words, AND once they have
              // been sent at all. A send that failed — or that persisted and
              // lost its acknowledgment — leaves an action whose text the
              // writer will not change, so editing here produced words the
              // retry could only be refused for. Retry keeps these words;
              // Start over is how different words are said.
              disabled={noteLocked}
              onChange={(e) => {
                if (noteLatchRef.current) return
                // Guarded here too, from the authoritative payload: a retained
                // callback must not reset the attempt state or replace the
                // text an existing action is being retried with.
                if (draftWasSubmitted()) return
                // A typed correction keeps the ORIGINAL capture and event id:
                // the words began as speech, and relabelling them as typed
                // would misreport how they were given, and it keeps the frozen
                // help and stamp.
                putDraft({
                  ...noteDraft,
                  text: e.target.value,
                  attempts: 0,
                  state: 'unsent',
                })
              }}
              multiline
              minRows={2}
              fullWidth
              inputProps={{
                'aria-label': 'What you were trying',
                readOnly: noteLocked,
              }}
            />
            <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
              <Button
                variant="contained"
                size="large"
                disabled={noteBusy || !noteDraft.text.trim()}
                onClick={() => void handleSaveNote()}
                sx={{ textTransform: 'none', fontWeight: 600, minHeight: 48 }}
              >
                {noteBusy
                  ? 'Saving…'
                  : draftSubmitted
                    ? 'Try again with these words'
                    : 'Save my words'}
              </Button>
              <Button
                variant="text"
                size="large"
                // Also closed mid-write: a tap here used to clear the exact
                // words a write was carrying, leaving nothing to retry.
                disabled={noteBusy}
                onClick={discardDraft}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                Start over
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {draftSubmitted
                ? 'Try again keeps these exact words. Start over clears them so you can say something different.'
                : 'Nothing is saved until you press Save my words.'}
              {noteBusy ? ' Keeping your words — one moment.' : ''}
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
        {prospect && (
          <Alert
            severity={prospectCheck === 'checking' ? 'info' : 'warning'}
            action={
              prospectCheck === 'checking' ? undefined : (
                <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
                  <Button
                    size="small"
                    onClick={cancelReplace}
                    sx={{ textTransform: 'none', fontWeight: 700 }}
                  >
                    Keep working
                  </Button>
                  <Button
                    size="small"
                    disabled={downloadBusy}
                    onClick={() => void handleDownloadCurrent()}
                    sx={{ textTransform: 'none' }}
                  >
                    Download a copy
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => applyReplace(prospect)}
                    sx={{ textTransform: 'none' }}
                  >
                    {'version' in prospect ? 'Open it anyway' : 'Replace it anyway'}
                  </Button>
                </Stack>
              )
            }
          >
            {/* The loss is named BEFORE the tap, not reported after it — and the
                capture that decides runs while the old editor is still intact,
                so an edit MakeCode has not announced yet still counts. */}
            {/* Two separate facts, never one standing in for the other: what
                is true about the GAME, then what is true about the words. */}
            {prospectCheck === 'checking'
              ? 'Checking what is in the editor first…'
              : prospectCheck === 'unknown'
                ? 'This page could not read the editor just now, so it cannot tell whether your changes are saved. Opening something else might lose them.'
                : pending
                  ? `A save called “${pending.label}” did not finish. Opening something else leaves it behind.`
                  : prospectCheck === 'words'
                    ? 'Your game is saved. Your words are not — opening something else keeps them here to save or discard, but it does not save them.'
                    : 'You have work that is not on your shelf. Opening something else will lose it.'}
            {prospectCheck === 'dirty' && wordsAtRisk
              ? ' Your words are not saved either.'
              : ''}
            {prospectCheck === 'unknown' && wordsAtRisk
              ? ' Your words are not saved yet either.'
              : ''}
          </Alert>
        )}
        <BuildStudioVersionShelf
          read={versions}
          canOpen={!writeInFlight}
          onOpen={(version) => requestReplace({ version })}
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
      <Dialog open={departureDialogOpen} onClose={departure.stay}>
        <DialogTitle>
          {departureCheck === 'checking'
            ? 'Checking your game…'
            : departureGameLine
              ? 'Keep your game first?'
              : 'Keep your words first?'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {departureCheck === 'checking'
              ? 'One moment — looking at what is in the editor.'
              : (departureGameLine ?? wordsRiskLine)}
          </DialogContentText>
          {/* Both, when both are true — never one standing in for the other. */}
          {departureCheck !== 'checking' && departureGameLine && wordsRiskLine && (
            <DialogContentText sx={{ mt: 1 }}>{wordsRiskLine}</DialogContentText>
          )}
          {/* A download tapped from this dialog reports INTO this dialog, so a
              refusal is seen and the earlier copy's choice can be reached. */}
          {heldProfile === null && downloadReceipt && (
            <Box sx={{ mt: 1.5 }}>{downloadReceipt}</Box>
          )}
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
            {/* Saving the GAME is offered only when the game is what is at
                risk. A words-only dialog used to show it, so the one obvious
                button saved a version nobody asked for and left the words
                exactly as unsaved as before. */}
            {!pending && departureGameLine && departureFilesRef.current && (
              <Button
                onClick={() => void handleSaveCaptured()}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                Save it now
              </Button>
            )}
            {!pending && departureGameLine && !departureFilesRef.current && canSave && (
              <Button
                onClick={() => void handleSave()}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                Save it now
              </Button>
            )}
            <Button
              disabled={downloadBusy}
              onClick={() => void handleDownloadCurrent()}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              Download a copy
            </Button>
            {wordsDialogActions}
            {/* The way out is always here, and it says which loss it is. */}
            <Button
              color="error"
              onClick={departure.leaveAnyway}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              {departureGameLine ? 'Leave and lose it' : 'Leave without saving them'}
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
                  : profileCheck === 'dirty' || editorDirty
                    ? 'Your game has changes that are not on your shelf yet. Switching closes the editor.'
                    : // A clean game is not an empty page. And when the words
                      // have been dealt with too, this says so rather than
                      // warning about nothing.
                      (wordsRiskLine ?? 'Your game and your words are saved. You can switch now.')}
          </DialogContentText>
          {profileCheck !== 'checking' &&
            (profileCheck === 'dirty' || editorDirty || pending) &&
            wordsRiskLine && (
              <DialogContentText sx={{ mt: 1 }}>{wordsRiskLine}</DialogContentText>
            )}
          {/* Same reason as the leaving dialog: the receipt belongs where the
              tap happened. */}
          {downloadReceipt && <Box sx={{ mt: 1.5 }}>{downloadReceipt}</Box>}
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
            disabled={profileCheck === 'checking' || downloadBusy}
            onClick={() => void handleDownloadCurrent()}
            sx={{ textTransform: 'none', minHeight: 48 }}
          >
            Download a copy
          </Button>
          {profileCheck !== 'checking' && wordsDialogActions}
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

/**
 * Did the capture that just failed prove the OPEN source is over the caps?
 *
 * Read from the rejection the bridge stamped, never from `sourceOverCaps()`:
 * that flag can be older than this tap, and treating it as this capture's
 * answer is how a timeout would hand over a previous over-cap reading as the
 * current game (UX-498).
 */
function captureRefusedForSize(err: unknown): boolean {
  return (err as Partial<ArcadeBridgeError> | null | undefined)?.tooBig === true
}
