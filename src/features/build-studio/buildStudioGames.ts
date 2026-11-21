/**
 * The games the child's chooser offers (LOCAL-VISION-007, slice 1; FEAT-247).
 *
 * Two separate catalogs on purpose, so a play-only game can never grow an
 * editor by accident and an editable game brings its own starter, project id,
 * readiness rule and copy rather than borrowing another's:
 *
 *   • EDITABLE games have a starter, a project id and a shelf of saved
 *     versions. Apple Dash and Lantern Cove, each described by ONE explicit
 *     {@link EditableGame} — the editor, the bridge, the writer call and the
 *     chooser read the descriptor, never the game's id, so a third game is a new
 *     row and not a new `if`.
 *   • PLAY-ONLY games are a fixed link to somewhere else. There is no save, no
 *     editor, no settings, no request this app makes, and no frame — the link
 *     opens in a separate tab so the chooser survives.
 *
 * Nothing here reads a flag, a child, a profile or Firestore. Whether a child
 * sees the chooser at all is the studio's existing access rule, unchanged.
 *
 * ── What a descriptor decides, and what it must not ─────────────────────────
 *
 * It decides which source a game starts from, what "this arrived whole" means
 * for it, whether it carries a challenge/reflection surface, and whether a NEW
 * save is eligible for automatic hours credit. That last flag is only the
 * editor's half of a fence: the writer independently refuses to stamp or queue
 * credit for any project outside `CREDIT_PROJECT_IDS`, so a descriptor mistake
 * cannot credit an unrecognised game.
 */

import {
  parseBuildStudioSource,
  type BuildStudioSourceFiles,
  type BuildStudioVersion,
} from '../../core/types/buildStudio'
import {
  BUILD_STUDIO_PROJECT_ID,
  BUILD_STUDIO_PROJECT_NAME,
  reopenedVersionLooksLoaded,
  starterImportLooksCorrect,
  STARTER_PROJECT_PNG_URL,
  starterSourceFiles,
} from './buildStudioStarter'
import {
  LANTERN_COVE_ARCHIVE_INCOMPLETE,
  LANTERN_COVE_FIRST_EDIT_PROMPT,
  LANTERN_COVE_PROJECT_ID,
  LANTERN_COVE_PROJECT_NAME,
  LANTERN_COVE_STARTER_LINE,
  LANTERN_COVE_STARTER_NOT_READY,
  lanternCoveArchiveComplete,
  lanternCoveStarterFiles,
  lanternCoveStarterLooksCorrect,
} from './lanternCoveStarter'

export interface EditableGame {
  /** Stable catalog id. */
  id: string
  title: string
  emoji: string
  /** The project this game's versions are stored under. */
  projectId: string
  /** The editor-visible project name the bridge binds on (`pxt.json` `name`). */
  projectName: string
  /** The prepared starter, as the file map the editor takes. A fresh object. */
  starterFiles: () => BuildStudioSourceFiles
  /** Did the STARTER arrive correctly? Asked once, straight after the import. */
  starterReady: (files: BuildStudioSourceFiles) => boolean
  /**
   * Is this source a whole project of this game?
   *
   * Asked of everything about to be trusted as the child's game: the latest
   * capture the bridge accepts, a saved version about to open, a recovery file
   * about to replace a visit, and a reopened version's readback. For Apple Dash
   * this is the released minimum (a manifest and a `main.ts`), so every archive
   * it ever stored still opens; Lantern Cove requires its whole native archive.
   */
  archiveComplete: (files: BuildStudioSourceFiles) => boolean
  /**
   * `true` only where the bridge itself must refuse a capture that fails
   * {@link archiveComplete}. Apple Dash keeps the released admission rule.
   */
  enforceCompleteCapture: boolean
  /** Sentence for a saved game or file that is missing part of itself. */
  incompleteArchiveLine: string
  /** Sentence for a starter that did not arrive correctly. */
  starterNotReadyLine: string
  /** The caption while the starter is open. */
  starterVisitLine: string
  /** An optional first thing to try. A suggestion; nothing records it. */
  firstEditPrompt: string | null
  /** The MakeCode project file for a grown-up fallback, when one was prepared. */
  starterFallbackUrl: string | null
  /**
   * This game's authored Build Challenges (`buildStudioChallenges.ts`, one catalog
   * per project): the optional card with Hear it, a prediction, Play, a reported
   * result, swap and skip, frozen with the exact version it was saved in.
   */
  hasChallenge: boolean
  /**
   * Apple Dash's fixed "extra life" goal, its Hear it / Hint buttons and the
   * legacy goal id an ordinary save carries. Read from the source's life value,
   * so it belongs to Apple Dash alone.
   */
  hasLivesGoal: boolean
  /** The optional spoken/typed reflection, which files an `artifacts` note. */
  hasReflection: boolean
  /**
   * May a NEW save of this game be stamped for automatic hours credit? Apple Dash
   * and Lantern Cove. See the module note: the writer fences this again, against
   * the one list of credit projects (`CREDIT_PROJECT_IDS`).
   */
  creditEligible: boolean
}

export interface PlayOnlyGame {
  id: string
  title: string
  emoji: string
  /** Fixed, absolute, https. Never built from a child, a profile or a query. */
  url: string
}

/** Apple Dash — behaviour unchanged; this row only names what was implicit. */
export const APPLE_DASH_GAME: EditableGame = {
  id: 'apple-dash',
  title: 'Apple Dash',
  emoji: '🍎',
  projectId: BUILD_STUDIO_PROJECT_ID,
  projectName: BUILD_STUDIO_PROJECT_NAME,
  starterFiles: starterSourceFiles,
  starterReady: starterImportLooksCorrect,
  archiveComplete: reopenedVersionLooksLoaded,
  enforceCompleteCapture: false,
  incompleteArchiveLine: 'That saved game did not open properly, so it was not opened.',
  starterNotReadyLine:
    'The starter did not open properly, so saving is turned off. Nothing is lost — a grown-up can import the starter file below into MakeCode.',
  starterVisitLine:
    'This is a prepared starter game. Change it however you like — every save keeps the one before it.',
  firstEditPrompt: null,
  starterFallbackUrl: STARTER_PROJECT_PNG_URL,
  hasChallenge: true,
  hasLivesGoal: true,
  hasReflection: true,
  creditEligible: true,
}

/**
 * Lantern Cove — a native-tilemap walk-around with its own five challenges, saved
 * versions, optional reflection and the same automatic hours credit as Apple Dash.
 */
export const LANTERN_COVE_GAME: EditableGame = {
  id: 'lantern-cove',
  title: 'Lantern Cove',
  emoji: '🏮',
  projectId: LANTERN_COVE_PROJECT_ID,
  projectName: LANTERN_COVE_PROJECT_NAME,
  starterFiles: lanternCoveStarterFiles,
  starterReady: lanternCoveStarterLooksCorrect,
  archiveComplete: lanternCoveArchiveComplete,
  enforceCompleteCapture: true,
  incompleteArchiveLine: LANTERN_COVE_ARCHIVE_INCOMPLETE,
  starterNotReadyLine: LANTERN_COVE_STARTER_NOT_READY,
  starterVisitLine: LANTERN_COVE_STARTER_LINE,
  firstEditPrompt: LANTERN_COVE_FIRST_EDIT_PROMPT,
  starterFallbackUrl: null,
  hasChallenge: true,
  hasLivesGoal: false,
  hasReflection: true,
  creditEligible: true,
}

/** Order is the order the chooser draws them. Apple Dash stays first. */
export const EDITABLE_GAMES: readonly EditableGame[] = [APPLE_DASH_GAME, LANTERN_COVE_GAME]

export const PLAY_ONLY_GAMES: readonly PlayOnlyGame[] = [
  {
    id: 'block-muncher',
    title: 'Block Muncher',
    emoji: '🟩',
    url: 'https://barnes-ngb.github.io/block-muncher/',
  },
]

/** The editable game for a project id, or `null`. */
export function editableGameForProject(projectId: string): EditableGame | null {
  return EDITABLE_GAMES.find((game) => game.projectId === projectId) ?? null
}

/**
 * Would this stored version open as a WHOLE project of this game?
 *
 * Only a game that enforces a whole-archive rule asks — Apple Dash opens every
 * archive it ever stored and lets the editor's readback judge, exactly as before.
 * An archive that will not parse is incomplete, never a reason to throw. Asked at
 * the chooser's tap AND again by the editor's open action, so the shelf, the
 * chooser and the import cannot disagree about which saves open.
 */
export function savedVersionIsWhole(game: EditableGame, version: BuildStudioVersion): boolean {
  if (!game.enforceCompleteCapture) return true
  try {
    return game.archiveComplete(parseBuildStudioSource(version.sourceArchive))
  } catch {
    return false
  }
}
