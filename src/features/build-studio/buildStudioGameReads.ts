/**
 * One listener, many shelves (FEAT-247).
 *
 * `useBuildStudioVersions` opens ONE Firestore listener per child (one equality
 * filter on `childId`) and keeps every row of theirs in `childRows`. A second
 * editable game must not open a second identical listener, so its shelf — and
 * the parent's combined one — are DERIVED here from the read that is already
 * open. Nothing in this file subscribes, requests or writes.
 *
 * Kept out of `useBuildStudioVersions.ts` on purpose: it is pure, and a module
 * that owns a subscription is the wrong place to also own the answer to *which of
 * these rows are Lantern Cove's*.
 */

import type { BuildStudioVersion } from '../../core/types/buildStudio'
import { editableGameForProject, EDITABLE_GAMES } from './buildStudioGames'
import {
  versionBelongsTo,
  VersionsStatus,
  type BuildStudioVersionsRead,
} from './useBuildStudioVersions'

/**
 * The shelf for ANOTHER project, derived from a read that is already settled.
 *
 * It keeps every guard the hook has — the status, the child and the failure are
 * the source read's own, and each row passes `versionBelongsTo` for the project
 * asked for — so a Failed read stays Failed (never an empty shelf) and a Loading
 * read stays Loading.
 *
 * `undefined` when the source carries no `childRows` and is not itself about the
 * project asked for: this read cannot speak for a project it knows nothing about,
 * and the caller then does not offer that project's shelf at all rather than
 * guessing it is empty.
 */
export function versionsReadForProject(
  read: BuildStudioVersionsRead,
  projectId: string,
): BuildStudioVersionsRead | undefined {
  if (read.projectId === projectId) return read
  // A read with no `childRows` cannot speak for another project.
  if (read.childRows === undefined) return undefined
  // Loading and Failed are about the child's whole list, so they carry over.
  if (read.status !== VersionsStatus.Ready) return { ...read, projectId, versions: [] }
  const child = read.childId
  if (!child) return undefined
  return {
    ...read,
    projectId,
    versions: read.childRows.filter((row) => versionBelongsTo(row, child, projectId)),
  }
}

/**
 * The parent's one read-only shelf: every EDITABLE game's saves, newest first.
 *
 * Rows of a project the catalog does not know are left out (they are not a game
 * this app can name), and each kept row still passes `versionBelongsTo` for its
 * own game. With no `childRows` it falls back to the read's own project, so a
 * caller that knows one game still gets exactly that shelf.
 */
export function allGamesVersionsRead(read: BuildStudioVersionsRead): BuildStudioVersionsRead {
  if (read.status !== VersionsStatus.Ready || read.childRows === undefined) return read
  const child = read.childId
  if (!child) return read
  const rows = read.childRows.filter((row) =>
    EDITABLE_GAMES.some((game) => versionBelongsTo(row, child, game.projectId)),
  )
  return { ...read, projectId: null, versions: rows }
}

/** The game title a saved row belongs to, for a shelf that mixes games. */
export function gameTitleForVersion(version: BuildStudioVersion): string | null {
  return editableGameForProject(version.projectId)?.title ?? null
}
