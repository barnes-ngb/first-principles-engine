/**
 * The one prepared, ADULT-AUTHORED Arcade starter (LOCAL-BUILD-001).
 *
 * ── What it is, and whose it is ────────────────────────────────────────────
 *
 * A small catcher game: one player, one collectible, one obstacle, one rule.
 * Catch an apple and the score goes up; hit a rock and a life goes down; the
 * round ends on the countdown or on the last life. Every number a child would
 * want to change is a literal in its own block, which is the whole point — the
 * first authored goal is to change one of them.
 *
 * It is named *"Apple Dash starter"* and its description says Dad made it,
 * because the app must never present a scaffold as the child's own work. The
 * named public *Eater Princess* project is a different thing entirely — it is
 * his, it is published, and nothing here reads it, writes it, imports it or
 * shares a name with it.
 *
 * ── Why the source of truth is `main.ts` ──────────────────────────────────
 *
 * The project ships canonical, block-shaped TypeScript and an EMPTY
 * `main.blocks`, and the bridge sends `switchblocks` after importing so the
 * editor decompiles the TypeScript into real, editable blocks. The alternative
 * — hand-authoring `main.blocks` XML — means hand-writing Blockly block ids and
 * field names for sprite creation, overlap handlers and update intervals, and a
 * single wrong id renders as a silently missing block. Hand-written XML is
 * exactly the "empty on-start or stale XML" the slice refuses to count.
 *
 * Writing it this way does not make the risk go away, it moves it somewhere
 * that can be CHECKED: after import the page asks the editor for the project
 * back and runs {@link blocksLookAuthored} over the `main.blocks` it returns.
 * If the decompile produced nothing, the page says so plainly and offers the
 * download / open-in-MakeCode fallback instead of letting a child edit a blank
 * workspace and save it over his game.
 *
 * Every statement below is written in the style the blocks editor itself emits
 * (the shape the independent probe's round-trip confirms), because that is what
 * the decompiler is guaranteed to be able to read back.
 */

import type { BuildStudioSourceFiles } from '../../core/types/buildStudio'

/** The project this slice has. One starter, one id. */
export const BUILD_STUDIO_PROJECT_ID = 'apple-dash-starter'

/** The editor-visible project name. Bound on, so a stray auto-created
 * *Untitled* project can never be mistaken for this one. */
export const BUILD_STUDIO_PROJECT_NAME = 'Apple Dash starter'

/**
 * The Arcade editor this starter was written against.
 *
 * Recorded rather than enforced: a newer editor opening an older project is the
 * ordinary case and must keep working. What the version is FOR is the honest
 * banner — if the handshake stops behaving, a reader can see which editor the
 * app was built against and which one answered.
 */
export const ARCADE_TARGET = 'arcade'
export const ARCADE_TARGET_VERSION = '4.1.28'
export const ARCADE_PXT_VERSION = '13.1.25'

const HERO_IMAGE = `
        . . . . . . . . . . . . . . . .
        . . . . . . f f f f . . . . . .
        . . . . . f d d d d f . . . . .
        . . . . . f d f d f d . . . . .
        . . . . . f d d d d d . . . . .
        . . . . . . f d d d f . . . . .
        . . . . . . . f f f . . . . . .
        . . . . . . 8 8 8 8 8 . . . . .
        . . . . . 8 8 8 8 8 8 8 . . . .
        . . . . 5 8 8 8 8 8 8 8 5 . . .
        . . . . . . 8 8 8 8 8 . . . . .
        . . . . . . 8 8 . 8 8 . . . . .
        . . . . . . 1 1 . 1 1 . . . . .
        . . . . . . 1 1 . 1 1 . . . . .
        . . . . . f f f . f f f . . . .
        . . . . . . . . . . . . . . . .
    `

const APPLE_IMAGE = `
        . . . . . . . . . . . . . . . .
        . . . . . . . 7 7 . . . . . . .
        . . . . . . 7 7 . . . . . . . .
        . . . . 2 2 2 2 2 2 . . . . . .
        . . . 2 2 2 2 2 2 2 2 . . . . .
        . . 2 2 2 2 2 2 2 2 2 2 . . . .
        . . 2 2 1 2 2 2 2 2 2 2 . . . .
        . . 2 2 2 2 2 2 2 2 2 2 . . . .
        . . 2 2 2 2 2 2 2 2 2 2 . . . .
        . . . 2 2 2 2 2 2 2 2 . . . . .
        . . . . 2 2 2 2 2 2 . . . . . .
        . . . . . 2 2 2 2 . . . . . . .
        . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . . . . .
    `

const ROCK_IMAGE = `
        . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . . . . .
        . . . . . e e e e . . . . . . .
        . . . . e e e e e e . . . . . .
        . . . e e e e e e e e . . . . .
        . . e e e d e e e e e e . . . .
        . . e e e e e e e e e e . . . .
        . . e e e e e e d e e e . . . .
        . . . e e e e e e e e . . . . .
        . . . . e e e e e e . . . . . .
        . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . . . . .
        . . . . . . . . . . . . . . . .
    `

/**
 * The starter's `main.ts`.
 *
 * Read it as the blocks it becomes: two *on sprite overlap* handlers, two *on
 * game update every N ms* loops, and an *on start* carrying the five tuning
 * numbers. The one the first goal is about is `info.setLife(3)` — the
 * **set life to 3** block.
 */
export const STARTER_MAIN_TS = `let rock: Sprite = null
let apple: Sprite = null
let hero: Sprite = null
sprites.onOverlap(SpriteKind.Player, SpriteKind.Food, function (sprite, otherSprite) {
    otherSprite.destroy()
    info.changeScoreBy(1)
})
sprites.onOverlap(SpriteKind.Player, SpriteKind.Enemy, function (sprite, otherSprite) {
    otherSprite.destroy()
    info.changeLifeBy(-1)
})
game.onUpdateInterval(1200, function () {
    apple = sprites.create(img\`${APPLE_IMAGE}\`, SpriteKind.Food)
    apple.setPosition(randint(8, 152), 2)
    apple.setFlag(SpriteFlag.AutoDestroy, true)
    apple.vy = 45
})
game.onUpdateInterval(2000, function () {
    rock = sprites.create(img\`${ROCK_IMAGE}\`, SpriteKind.Enemy)
    rock.setPosition(randint(8, 152), 2)
    rock.setFlag(SpriteFlag.AutoDestroy, true)
    rock.vy = 60
})
scene.setBackgroundColor(9)
info.setLife(3)
info.setScore(0)
info.startCountdown(45)
hero = sprites.create(img\`${HERO_IMAGE}\`, SpriteKind.Player)
hero.setPosition(80, 104)
hero.setStayInScreen(true)
controller.moveSprite(hero, 90, 0)
`

/**
 * An empty blocks workspace, deliberately.
 *
 * `switchblocks` is what fills it, from `main.ts`. A placeholder with blocks in
 * it would be the *stale XML* case: the editor would show those and ignore the
 * TypeScript, so the child would edit something other than the game that plays.
 */
export const STARTER_MAIN_BLOCKS =
  '<xml xmlns="https://developers.google.com/blockly/xml"></xml>'

export const STARTER_PXT_JSON = JSON.stringify(
  {
    name: BUILD_STUDIO_PROJECT_NAME,
    description:
      'A starter game Dad made for you: catch the apples, dodge the rocks. Change the numbers and see what happens.',
    dependencies: { device: '*' },
    files: ['main.blocks', 'main.ts'],
    preferredEditor: 'blocksprj',
  },
  null,
  4,
)

/** The starter, as the file map the editor takes. */
export function starterSourceFiles(): BuildStudioSourceFiles {
  return {
    'pxt.json': STARTER_PXT_JSON,
    'main.blocks': STARTER_MAIN_BLOCKS,
    'main.ts': STARTER_MAIN_TS,
  }
}

// ── The authored goal ───────────────────────────────────────────────────────

/**
 * The first — and in this slice the only — authored goal.
 *
 * One obvious thing to do, named in the words a seven-year-old would use, over
 * a block that really is in his game. **No score, no streak, no level, no
 * progress meter and no reward** hangs off finishing it: there is nothing to
 * complete. The goal is a sentence on the screen and the subject of the hints.
 */
export const BUILD_STUDIO_GOAL = {
  id: 'one-more-life',
  title: 'Give your hero one more life',
  /** The block the goal is about, spelled as the editor spells it. */
  blockLabel: 'set life to 3',
} as const

/**
 * The numbers worth changing, and which block each one lives in.
 *
 * **Read-only.** This is a map so a child can FIND the number in the editor,
 * not a set of controls that change it for him — an app-side slider writing
 * into his source would mean the app made the edit and he watched. He makes his
 * own edits in stock MakeCode Arcade.
 */
export interface StarterTuningNumber {
  id: string
  /** What the number means, in his words. */
  label: string
  /** The block to look for, spelled as the editor spells it. */
  blockLabel: string
  /** What the starter ships with. */
  value: number
  /** Where in the program the block sits. */
  where: string
}

export const STARTER_TUNING_NUMBERS: readonly StarterTuningNumber[] = [
  {
    id: 'lives',
    label: 'Lives',
    blockLabel: 'set life to 3',
    value: 3,
    where: 'on start',
  },
  {
    id: 'speed',
    label: 'How fast your hero moves',
    blockLabel: 'move hero with buttons — vx 90',
    value: 90,
    where: 'on start',
  },
  {
    id: 'roundSeconds',
    label: 'How long a round lasts',
    blockLabel: 'start countdown 45 s',
    value: 45,
    where: 'on start',
  },
  {
    id: 'applePoints',
    label: 'Points for one apple',
    blockLabel: 'change score by 1',
    value: 1,
    where: 'on sprite overlap — Player and Food',
  },
  {
    id: 'spawnInterval',
    label: 'How often a new apple falls (ms)',
    blockLabel: 'on game update every 1200 ms',
    value: 1200,
    where: 'the apple loop',
  },
]

// ── The check that the starter actually arrived as blocks ──────────────────

/** The fewest blocks a workspace must hold to be the starter rather than a
 * blank page. The starter decompiles to far more than this; the floor is set
 * low on purpose, because the thing being detected is *nothing at all*. */
const MIN_AUTHORED_BLOCKS = 3

/**
 * Does this `main.blocks` hold an authored workspace?
 *
 * The slice's rule is that an empty on-start or stale XML does not count, so
 * this is the predicate that says so. It is deliberately crude: it counts
 * `<block ` elements. A workspace the decompiler failed to fill has none; one
 * holding only an empty `on start` has exactly one. Neither passes.
 */
export function blocksLookAuthored(mainBlocks: string | undefined): boolean {
  if (!mainBlocks) return false
  const blocks = mainBlocks.match(/<block\s/g)
  if (!blocks || blocks.length < MIN_AUTHORED_BLOCKS) return false
  // `pxt-on-start` with nothing inside it is the empty-workspace shape the
  // slice names explicitly, and it would otherwise pass on block count alone
  // once a couple of stray shadows are present.
  return /<statement\s/.test(mainBlocks)
}

/**
 * Did the STARTER arrive correctly — editable blocks AND playable source?
 *
 * **Used exactly once per visit: immediately after importing the starter,
 * before the child has touched anything.** It is not, and must never become, a
 * check on a save: a child who deletes the life block, swaps the apple for a
 * dragon or throws the whole thing away has made his game, and a writer that
 * refused that would be the app deciding what his game is allowed to be.
 *
 * Both halves are asserted, because they fail separately: a project can carry
 * blocks the decompiler produced and a `main.ts` the editor truncated, or
 * blocks that never got made over source that is perfectly fine.
 */
export function starterImportLooksCorrect(files: BuildStudioSourceFiles): boolean {
  const ts = files['main.ts']
  if (typeof ts !== 'string' || !ts.includes('sprites.create')) return false
  if (!ts.includes('info.setLife')) return false
  return blocksLookAuthored(files['main.blocks'])
}
