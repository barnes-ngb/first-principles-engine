/**
 * The child's way IN: which game opens, chosen before anything is loaded
 * (LOCAL-BUILD-001).
 *
 * ── Why this exists ─────────────────────────────────────────────────────
 *
 * The studio used to mount the editor immediately and import the prepared
 * starter, every time. A child who had saved four versions and came back to
 * change something therefore arrived in the starter, with his own games one
 * scroll down behind an *Open this one* that is a REPLACEMENT — a door the page
 * is obliged to warn him about, because it throws away whatever is open. So the
 * ordinary case ("carry on with my game") was the one that cost the most taps
 * and read the most like a loss.
 *
 * Now the first screen is a question with two explicit answers — *Continue my
 * saved game*, naming the newest save and when it was saved, and *Start Apple
 * Dash* — and neither is taken for him.
 *
 * ── What it refuses to do ───────────────────────────────────────────────
 *
 *   • It never chooses. A read that has not settled says it is LOOKING and
 *     offers nothing; a read that FAILED says so, offers *Try again* and an
 *     explicit starter, and never claims the shelf is empty; only a settled,
 *     genuinely empty list shows the one starter choice.
 *   • It never opens a game on a stale answer. The list must be the one for
 *     THIS family, child and project (`childId`/`projectId` on the read are
 *     checked, not assumed), which is what an `A → B → A` cannot fake away, and
 *     the chosen row is re-checked through `versionBelongsTo` at the tap.
 *   • It never swaps a game after the tap. The click freezes ONE decision for
 *     this mount, and the editor reads it once in its first visit — so a
 *     snapshot that lands a moment later cannot change what is open or what it
 *     is called.
 *
 * ── Work that did not land comes first ──────────────────────────────────
 *
 * An unfinished Save, or words nobody has written down, live in
 * `buildStudioPendingStore` for this exact owner. They are not a game to
 * choose; they are work at risk, and the editor is where the exact *Try again*
 * and the exact words are offered back. So when the slot holds something on
 * arrival this screen does not ask a question at all — the studio opens and the
 * retry is reachable without first choosing a saved game. The slot is read
 * AGAIN at the tap, because a write started in an earlier mount can land while
 * this screen is sitting there: that work then takes priority, said in a
 * sentence, with one explicit button into the studio rather than a game chosen
 * for him.
 *
 * ── What it does not touch ──────────────────────────────────────────────
 *
 * Nothing is written, nothing is read from Firestore here (the page's existing
 * subscription is passed in), the parent's view never reaches this component,
 * and once the editor is mounted every existing guard — the visit boundary, the
 * pre-replacement capture, the departure and profile holds, the dirty
 * comparison, recovery, downloads — is the one that was already there.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { BuildStudioVersion } from '../../core/types/buildStudio'
import BuildStudioEditor from './BuildStudioEditor'
import {
  readPendingNote,
  readPendingSave,
  type PendingOwner,
} from './buildStudioPendingStore'
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
 * nobody wrote down — or `null`.
 *
 * Read from the store on demand rather than subscribed, because it is consulted
 * at exactly two moments: when this screen first appears, and at the tap. The
 * label is carried so the sentence can name the save instead of describing it.
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
   * already waiting — and never replaced, so this mount has one game.
   *
   * The component is keyed by family + child by its caller, so a route or
   * profile change retires the whole screen rather than carrying an answer
   * about one child into another's.
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

  /**
   * Did a tap on THIS screen open the studio?
   *
   * Only then is focus moved. Arriving to waiting work is not an explicit
   * launch, and taking focus on first paint would be a surprise rather than a
   * courtesy.
   */
  const launchedByTapRef = useRef(false)
  const studioRef = useRef<HTMLDivElement | null>(null)

  /**
   * Put keyboard focus into the studio after an explicit launch.
   *
   * The `QuestExitGuardDialog` pattern: focus the element outright, guarded on
   * it still being connected. The region itself is the target rather than a
   * control, so nothing is pressed by accident and the next Tab lands on the
   * studio's own first button instead of the top of the page.
   */
  useEffect(() => {
    if (!launch || !launchedByTapRef.current) return
    const region = studioRef.current
    if (!region?.isConnected) return
    region.focus()
  }, [launch])

  /** Take one explicit choice: a saved version, or the starter. */
  const choose = useCallback(
    (version: BuildStudioVersion | null) => {
      if (launchedRef.current) return
      // The same identity the shelf's Open and the import both use. A row that
      // is not this child's in this project opens nothing and says so.
      if (version && !versionBelongsTo(version, childId, projectId)) {
        setRefused(true)
        return
      }
      // Re-read at the TAP, not only at the render that drew the buttons: a
      // write from an earlier mount can land in the recovery slot while this
      // screen is sitting here, and that work comes before a new game.
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

  /** Open the studio for work that is waiting — its own deliberate tap. */
  const openForHeldWork = useCallback(() => {
    if (launchedRef.current) return
    launchedRef.current = true
    launchedByTapRef.current = true
    setLaunch({ version: null })
  }, [])

  if (launch) {
    return (
      <Box
        ref={studioRef}
        // Focusable programmatically, deliberately NOT in the tab order: this
        // is where focus is put after a launch, not a stop on the way through.
        tabIndex={-1}
        role="region"
        aria-label={`${childName}’s Build Studio`}
        sx={{ outline: 'none' }}
      >
        <BuildStudioEditor
          // Keyed by the child AND the family, exactly as before: the editor
          // for one identity can never be reused for another.
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
   * Is this read about the child and project on screen?
   *
   * Asked rather than assumed. An answer about anybody else is reported as not
   * settled, so no label, date or choice can come out of another child's or
   * another project's list.
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
            ? `A save called “${heldAtTap.saveLabel}” did not finish, so that comes first. Open your studio and you can try it again — or let it go — in there.`
            : 'Words you said earlier have not been written down yet, so those come first. Open your studio and you can save them — or let them go — in there.'}
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
        <Typography variant="caption" color="text.secondary">
          Your saved games are all still on your shelf in there, and you can open
          any of them once that is sorted out.
        </Typography>
      </Stack>
    )
  }

  /**
   * The starter, as an explicit answer.
   *
   * Primary when it is the only one there is, secondary beside a saved game —
   * the shape of the screen says which is the ordinary thing to do, and neither
   * happens without a tap.
   */
  const starterChoice = (
    <Button
      variant={latest ? 'outlined' : 'contained'}
      size="large"
      fullWidth
      onClick={() => choose(null)}
      sx={{ textTransform: 'none', fontWeight: 700, minHeight: 56 }}
    >
      🍎 Start Apple Dash
    </Button>
  )

  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      <Stack spacing={0.5}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {childName}&apos;s Build Studio
        </Typography>
        <Typography variant="body1">
          Carry on with a game you saved, or start the Apple Dash starter.
        </Typography>
      </Stack>

      {refused && (
        <Alert severity="warning">
          That saved game is not part of this one, so nothing was opened. Nothing
          changed — try one of your own saves, or start Apple Dash.
        </Alert>
      )}

      {/* LOOKING. It says what it is doing and offers no choice at all: a
          starter door drawn over an unsettled shelf is this screen choosing. */}
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
          NOT an empty shelf, and a child is never told his games are gone
          because one request failed. The starter is still offered — as a
          starter, named, with what it does and does not do said out loud. */}
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
            <AlertTitle>Couldn&apos;t look at your shelf just now</AlertTitle>
            Your saved games are still there — this is the list that didn&apos;t
            load, not your games. Tap Try again to look once more.
          </Alert>
          {starterChoice}
          <Typography variant="caption" color="text.secondary">
            Starting Apple Dash opens the prepared starter game. It saves nothing
            and changes nothing you have saved before.
          </Typography>
        </>
      )}

      {/* READY, with saved games. The newest one is named and dated, so the
          choice is made on what it IS rather than on a promise. */}
      {status === VersionsStatus.Ready && latest && (
        <>
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={() => choose(latest)}
            sx={{ textTransform: 'none', fontWeight: 700, minHeight: 56 }}
          >
            ▶ Continue my saved game
          </Button>
          <Typography variant="body2">
            That opens “{latest.label}” — {savedLine(latest.createdAt)}.
          </Typography>
          {starterChoice}
          <Typography variant="caption" color="text.secondary">
            Apple Dash is the prepared starter, not one of your saves. Every game
            you have saved is on your shelf once you are in, and you can open any
            of them there.
          </Typography>
        </>
      )}

      {/* READY and genuinely empty — the one state where "nothing saved yet" is
          a true sentence, and the one state with a single choice. */}
      {status === VersionsStatus.Ready && !latest && (
        <>
          <Typography variant="body2" color="text.secondary">
            Nothing saved yet. This is where your saved games will be.
          </Typography>
          {starterChoice}
        </>
      )}
    </Stack>
  )
}
