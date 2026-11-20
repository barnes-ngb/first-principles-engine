/**
 * The child's way IN: which game opens, chosen before anything is loaded
 * (LOCAL-BUILD-001).
 *
 * The studio used to mount the editor and import the prepared starter every
 * time, so a child with four saved versions came back to the starter with his
 * own games behind an *Open this one* that REPLACES what is open. The ordinary
 * case — carry on with my game — cost the most taps and read like a loss. The
 * first screen is now a question with explicit answers, and neither is taken
 * for him.
 *
 * ── A games shelf (LOCAL-VISION-007) ────────────────────────────────────
 *
 * Apple Dash — the one editable game — keeps every control in its own card.
 * Beside it, once the read has settled, sits a play-only card (Block Muncher): a
 * fixed link in a separate tab, with no save, editor, request or setting behind
 * it. Both catalogs live in `buildStudioGames`.
 *
 * ── What it refuses to do ───────────────────────────────────────────────
 *
 *   • It never chooses. An unsettled read says it is LOOKING and offers
 *     nothing; a failed read says so, offers *Try again* and an explicit
 *     starter, and never claims the shelf is empty; only a settled, genuinely
 *     empty list shows one starter choice.
 *   • It never opens a game on a stale answer. The read must be about THIS
 *     child and project, and the chosen row goes through `versionBelongsTo` at
 *     the tap — the one identity check, which fails closed here.
 *   • It never swaps a game after the tap. One click freezes the decision for
 *     this mount and the editor reads it once, in its first visit.
 *
 * ── Work that did not land comes first ──────────────────────────────────
 *
 * An unfinished Save, or words nobody wrote down, live in
 * `buildStudioPendingStore` for this exact owner. They are not a game to
 * choose: the editor is where the exact *Try again* and the exact words are
 * offered back, so when the slot holds something on arrival this screen asks
 * nothing and the studio opens. The slot is read again at every tap — at a
 * choice, because a write from an earlier mount can land while this screen
 * sits here, and at *Open my studio*, because an acknowledgement can land
 * between the two taps and leave nothing to deal with (Chrome reproduced
 * exactly that, silently importing the starter).
 *
 * Nothing here is written and nothing is read from Firestore (the page's
 * existing subscription is passed in); the parent's view never reaches this
 * component; and once the editor is mounted every existing guard is the one
 * that was already there.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { BuildStudioVersion } from '../../core/types/buildStudio'
import BuildStudioEditor from './BuildStudioEditor'
import {
  readPendingNote,
  readPendingSave,
  type PendingOwner,
} from './buildStudioPendingStore'
import { editableGameForProject, PLAY_ONLY_GAMES } from './buildStudioGames'
import { savedLine } from './buildStudioSavedLine'
import { versionBelongsTo, VersionsStatus } from './useBuildStudioVersions'
import type { BuildStudioVersionsRead } from './useBuildStudioVersions'

export interface BuildStudioChildEntryProps {
  familyId: string
  /** The child this studio is FOR. Passed down, never re-read from the shell. */
  childId: string
  childName: string
  projectId: string
  /** This child's own configured voice engine, resolved by the page. */
  childVoiceInputEnhanced?: boolean
  /** The page's settled read. Checked here as well as there. */
  versions: BuildStudioVersionsRead
  onOutOfScopeSave?: (detail: string) => void
}

/** The frozen answer to "which game does this mount open". */
interface Launch {
  /** The chosen saved version, or `null` for the prepared starter. */
  version: BuildStudioVersion | null
}

/**
 * This owner's work that did not land — a Save that did not finish, or words
 * nobody wrote down — or `null`. The label is carried so a sentence can name
 * the save rather than describe it.
 */
function unresolvedWork(owner: PendingOwner): { saveLabel: string | null } | null {
  const save = readPendingSave(owner)
  const note = readPendingNote(owner)
  if (!save && !note) return null
  return { saveLabel: save?.label ?? null }
}

export default function BuildStudioChildEntry({
  familyId,
  childId,
  childName,
  projectId,
  childVoiceInputEnhanced,
  versions,
  onOutOfScopeSave,
}: BuildStudioChildEntryProps) {
  /**
   * The decision, frozen. Set once — by a tap, or on arrival when work is
   * already waiting — and never replaced, so this mount has one game. The
   * caller keys this component by family + child, so a route or profile change
   * retires the answer with the screen.
   */
  const [launch, setLaunch] = useState<Launch | null>(() =>
    unresolvedWork({ familyId, childId, projectId }) ? { version: null } : null,
  )
  /** Claimed synchronously, so two taps in one gesture are one launch. */
  const launchedRef = useRef(launch !== null)
  /** Work that turned up while this screen was on display. */
  const [heldAtTap, setHeldAtTap] = useState<{ saveLabel: string | null } | null>(null)
  /** A chosen row that is not this child's in this project. Said, not opened. */
  const [refused, setRefused] = useState(false)
  /** Bumped when the held-work notice retired because the slot had emptied. */
  const [workRetired, setWorkRetired] = useState(0)

  /**
   * Did a tap on THIS screen open the studio? Only then is focus moved —
   * arriving to waiting work is not an explicit launch, and taking focus on
   * first paint would be a surprise.
   */
  const launchedByTapRef = useRef(false)
  const studioRef = useRef<HTMLDivElement | null>(null)
  /** The ordinary chooser's primary button, for focus after a retired notice. */
  const primaryChoiceRef = useRef<HTMLButtonElement | null>(null)

  /**
   * Put keyboard focus where the screen just went.
   *
   * The `QuestExitGuardDialog` pattern — focus the element outright, guarded on
   * it still being connected. After a launch the target is the studio REGION
   * rather than a control, so nothing is pressed by accident and the next Tab
   * is the studio's own first button; after a retired notice it is the primary
   * choice, because the button that was tapped has gone.
   */
  useEffect(() => {
    if (!launch || !launchedByTapRef.current) return
    const region = studioRef.current
    if (!region?.isConnected) return
    region.focus()
  }, [launch])

  useEffect(() => {
    if (workRetired === 0) return
    const button = primaryChoiceRef.current
    if (!button?.isConnected) return
    button.focus()
  }, [workRetired])

  /** Take one explicit choice: a saved version, or the starter. */
  const choose = useCallback(
    (version: BuildStudioVersion | null) => {
      if (launchedRef.current) return
      // The one identity check, and it fails closed: a row that is not this
      // child's in this project opens nothing and says so.
      if (version && !versionBelongsTo(version, childId, projectId)) {
        setRefused(true)
        return
      }
      // Read at the TAP, not only at the render that drew the buttons.
      const held = unresolvedWork({ familyId, childId, projectId })
      if (held) {
        setHeldAtTap(held)
        return
      }
      launchedRef.current = true
      launchedByTapRef.current = true
      setRefused(false)
      setLaunch({ version })
    },
    [familyId, childId, projectId],
  )

  /**
   * Open the studio for work that is waiting — after reading the slot again.
   *
   * An acknowledgement for the exact held save can land between the tap that
   * raised the notice and this one. If it did, there is nothing to deal with:
   * the notice retires and the ordinary chooser comes back, built from the
   * latest read, instead of the starter opening with nothing said.
   */
  const openForHeldWork = useCallback(() => {
    if (launchedRef.current) return
    if (!unresolvedWork({ familyId, childId, projectId })) {
      setHeldAtTap(null)
      setWorkRetired((n) => n + 1)
      return
    }
    launchedRef.current = true
    launchedByTapRef.current = true
    setLaunch({ version: null })
  }, [familyId, childId, projectId])

  if (launch) {
    return (
      <Box
        ref={studioRef}
        // Focusable programmatically, deliberately NOT in the tab order.
        tabIndex={-1}
        role="region"
        aria-label={`${childName}’s Build Studio`}
        sx={{ outline: 'none' }}
      >
        <BuildStudioEditor
          // Keyed by the child AND the family, exactly as before.
          key={`${familyId}\u0000${childId}`}
          familyId={familyId}
          childId={childId}
          childName={childName}
          projectId={projectId}
          childVoiceInputEnhanced={childVoiceInputEnhanced}
          // The frozen choice, read once by the editor's first visit.
          initialVersion={launch.version}
          versions={versions}
          onOutOfScopeSave={onOutOfScopeSave}
        />
      </Box>
    )
  }

  // ── The question ───────────────────────────────────────────────────────

  /**
   * Is this read about the child and project on screen? Asked, not assumed —
   * an answer about anybody else is reported as not settled, so no label, date
   * or choice can come out of another child's list.
   */
  const readIsOurs = versions.childId === childId && versions.projectId === projectId
  const status = readIsOurs ? versions.status : VersionsStatus.Loading
  /** Newest first, as `useBuildStudioVersions` sorts them. */
  const latest =
    status === VersionsStatus.Ready && versions.versions.length > 0
      ? versions.versions[0]
      : null

  if (heldAtTap) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 560 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {childName}&apos;s Build Studio
        </Typography>
        <Alert severity="warning">
          <AlertTitle>Something from last time is still here</AlertTitle>
          {heldAtTap.saveLabel
            ? `A save called “${heldAtTap.saveLabel}” did not finish, so that comes first.`
            : 'Words you said earlier are not written down yet, so those come first.'}
        </Alert>
        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={openForHeldWork}
          sx={{ textTransform: 'none', fontWeight: 700, minHeight: 56 }}
        >
          Open my studio
        </Button>
      </Stack>
    )
  }

  /**
   * The editable game this chooser is for. Today the catalog holds exactly one
   * (Apple Dash), found by the project this screen was handed; the saved-game
   * reads, the starter and the shelf are that project's, unchanged.
   */
  const game = editableGameForProject(projectId)
  const gameTitle = game?.title ?? 'Apple Dash'
  const gameEmoji = game?.emoji ?? '🍎'

  /** The starter, as an explicit answer. Primary when it is the only one. */
  const starterChoice = (
    <Button
      ref={latest ? undefined : primaryChoiceRef}
      variant={latest ? 'outlined' : 'contained'}
      size="large"
      fullWidth
      onClick={() => choose(null)}
      sx={{ textTransform: 'none', fontWeight: 700, minHeight: 56 }}
    >
      {gameEmoji} Start {gameTitle}
    </Button>
  )

  /**
   * Play-only games: a fixed link, a separate tab, and nothing else. Drawn only
   * once the shelf read has settled (the same moment the chooser offers
   * anything), and never reads, writes or requests anything — the click is the
   * browser following a link, so this screen, and any work it is holding, stays
   * exactly where it is.
   */
  const playOnlyCards =
    status === VersionsStatus.Loading
      ? null
      : PLAY_ONLY_GAMES.map((playOnly) => (
          <Paper
            key={playOnly.id}
            component="section"
            variant="outlined"
            aria-labelledby={`game-${playOnly.id}`}
            sx={{ p: 2, borderRadius: 2 }}
          >
            <Stack spacing={1.5}>
              <Typography
                id={`game-${playOnly.id}`}
                variant="h6"
                component="h2"
                sx={{ fontWeight: 800 }}
              >
                {playOnly.emoji} {playOnly.title}
              </Typography>
              <Button
                component="a"
                href={playOnly.url}
                target="_blank"
                rel="noopener noreferrer"
                variant="contained"
                size="large"
                fullWidth
                aria-label={`Play ${playOnly.title} (opens in a new tab)`}
                sx={{ textTransform: 'none', fontWeight: 700, minHeight: 56 }}
              >
                Play
              </Button>
            </Stack>
          </Paper>
        ))

  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>
        {childName}&apos;s Build Studio
      </Typography>

      {/* Apple Dash's own card: every control it already had, grouped. */}
      <Paper
        component="section"
        variant="outlined"
        aria-labelledby={`game-${game?.id ?? 'apple-dash'}`}
        sx={{ p: 2, borderRadius: 2 }}
      >
        <Stack spacing={2}>
          <Typography
            id={`game-${game?.id ?? 'apple-dash'}`}
            variant="h6"
            component="h2"
            sx={{ fontWeight: 800 }}
          >
            {gameEmoji} {gameTitle}
          </Typography>

      {refused && (
        <Alert severity="warning">
          That saved game is not part of this one, so nothing was opened.
        </Alert>
      )}

      {/* LOOKING. No choice at all: a starter door over an unsettled shelf is
          this screen choosing. */}
      {status === VersionsStatus.Loading && (
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          role="status"
          aria-live="polite"
        >
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Looking for your saved games…
          </Typography>
        </Stack>
      )}

      {/* FAILED. The load-bearing sentence: a read that did not come back is
          NOT an empty shelf. The starter is still offered, as a tap. */}
      {status === VersionsStatus.Failed && (
        <>
          <Alert
            severity="warning"
            action={
              <Button
                size="small"
                onClick={versions.retry}
                sx={{ textTransform: 'none' }}
              >
                Try again
              </Button>
            }
          >
            Your saved games are still there — this is the list that didn&apos;t
            load, not your games.
          </Alert>
          {starterChoice}
        </>
      )}

      {/* READY, with saved games. The newest one is named and dated on one
          line, so the choice is made on what it IS. */}
      {status === VersionsStatus.Ready && latest && (
        <>
          <Button
            ref={primaryChoiceRef}
            variant="contained"
            size="large"
            fullWidth
            onClick={() => choose(latest)}
            sx={{ textTransform: 'none', fontWeight: 700, minHeight: 56 }}
          >
            ▶ Continue my saved game
          </Button>
          <Typography variant="body2">
            “{latest.label}” — {savedLine(latest.createdAt)}
          </Typography>
          {starterChoice}
        </>
      )}

      {/* READY and genuinely empty — the one state where "nothing saved yet" is
          true, and the one state with a single choice. */}
      {status === VersionsStatus.Ready && !latest && (
        <>
          <Typography variant="body2" color="text.secondary">
            Nothing saved yet.
          </Typography>
          {starterChoice}
        </>
      )}
        </Stack>
      </Paper>

      {playOnlyCards}
    </Stack>
  )
}
