/**
 * The one "Make a book" door (FEAT-187 — UX-102 / UX-116 / UX-118).
 *
 * Before this, the shelf had three ways to make a book and five verbs for the
 * act: a "Make a New Book" dialog with **Blank Book** / **Write it with AI**
 * tabs, a `text.secondary` link inside the AI tab reading "Use Story Guide
 * (guided questions)", and — from the header — "Create Sight Word Story". The
 * 2026-09 Books audit's question was whether a parent could tell from the shelf
 * which door to use. She could not: two of those doors called the same
 * `generateStory` call with different rules, and nothing on screen said so.
 *
 * Owner decision (Nathan, 2026-09-04): **one door, two choices.** The Story
 * Guide wizard retires (its route redirects; see `router.tsx`), and the shelf
 * asks one question with two answers — write it yourself, or make one with
 * Shelly. Each carries one verb and one line saying what happens next.
 *
 * Pure by design: this module holds the copy and nothing else, so the wording
 * can be held to the kid readability bar (`src/test/kidReadability.ts`) in a
 * test that never mounts a dialog. `BookshelfPage` renders it; the choice ids
 * are what the page switches on.
 */
import type { ArtHelpAudience } from './artHelpContent'

/** Which of the two doors the person picked. `null` = the choice step itself. */
export const MakeBookChoice = {
  /** A blank book, straight into the editor. */
  Myself: 'myself',
  /** The Generate chat (FEAT-169 → 176), the one AI path left. */
  WithShelly: 'with-shelly',
} as const
export type MakeBookChoice = (typeof MakeBookChoice)[keyof typeof MakeBookChoice]

export interface MakeBookChoiceCopy {
  id: MakeBookChoice
  /** The verb on the choice. One verb per choice — FEAT-181 settled "Make". */
  label: string
  /** One line: what happens after the tap. */
  next: string
}

/**
 * The door's own title. One string for both audiences — the previous pair
 * ("Craft a New Book" for Lincoln, "Make a New Book" otherwise) was a
 * name-keyed *label set* for one act, which the audit filed under UX-125 and
 * FEAT-181 settled as "Make". Personality lives in the palette, not in a second
 * vocabulary for the same button.
 */
export const MAKE_BOOK_DOOR_TITLE = 'Make a book'

/** What the shelf's entry points call the door, so tile and sheet agree. */
export const MAKE_BOOK_DOOR_LABEL = 'Make a book'

const CHOICES: Readonly<Record<ArtHelpAudience, readonly MakeBookChoiceCopy[]>> = {
  kid: [
    {
      id: MakeBookChoice.Myself,
      label: 'Write it myself',
      next: 'You get blank pages to fill.',
    },
    {
      id: MakeBookChoice.WithShelly,
      label: 'Make one with Shelly',
      next: 'Tell her your idea. She writes it.',
    },
  ],
  parent: [
    {
      id: MakeBookChoice.Myself,
      label: 'Write it myself',
      next: 'A blank book opens in the editor — you add the words and the pictures.',
    },
    {
      id: MakeBookChoice.WithShelly,
      label: 'Make one with Shelly',
      next: 'Describe the story in a chat — Shelly writes it, you revise it, then it is illustrated.',
    },
  ],
}

/**
 * The two choices, in order, for one audience. Gated on **capability**
 * (`isChildProfile`), never on a name — the same rule the FEAT-178 help sheets
 * follow.
 */
export function makeBookChoices(audience: ArtHelpAudience): readonly MakeBookChoiceCopy[] {
  return CHOICES[audience]
}
