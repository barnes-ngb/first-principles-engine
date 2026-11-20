/**
 * The games the child's chooser offers (LOCAL-VISION-007, slice 1).
 *
 * Two separate catalogs on purpose, so a play-only game can never grow an
 * editor by accident and a later editable game brings its own starter, project
 * id and shelf rather than borrowing Apple Dash's:
 *
 *   • EDITABLE games have a starter, a project id and a shelf of saved
 *     versions. Today that is Apple Dash and nothing else.
 *   • PLAY-ONLY games are a fixed link to somewhere else. There is no save, no
 *     editor, no settings, no request this app makes, and no frame — the link
 *     opens in a separate tab so the chooser survives.
 *
 * Nothing here reads a flag, a child, a profile or Firestore. Whether a child
 * sees the chooser at all is the studio's existing access rule, unchanged.
 */

import { BUILD_STUDIO_PROJECT_ID } from './buildStudioStarter'

export interface EditableGame {
  /** Stable catalog id. */
  id: string
  title: string
  emoji: string
  /** The project this game's versions are stored under. */
  projectId: string
}

export interface PlayOnlyGame {
  id: string
  title: string
  emoji: string
  /** Fixed, absolute, https. Never built from a child, a profile or a query. */
  url: string
}

export const EDITABLE_GAMES: readonly EditableGame[] = [
  {
    id: 'apple-dash',
    title: 'Apple Dash',
    emoji: '🍎',
    projectId: BUILD_STUDIO_PROJECT_ID,
  },
]

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
