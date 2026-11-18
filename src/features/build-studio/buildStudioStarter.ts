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
 * It is called *"Apple Dash starter"* and described as a **prepared starter**
 * everywhere a person reads it, because the app must never present a scaffold
 * as the child's own work. It makes no claim about who wrote it beyond that.
 * The named public *Eater Princess* project is a different thing entirely — it
 * is his, it is published, and nothing here reads it, writes it, imports it or
 * shares a name with it.
 *
 * ── Why it ships POPULATED Blocks ─────────────────────────────────────────
 *
 * The first draft shipped canonical TypeScript and an EMPTY `main.blocks`, and
 * relied on `switchblocks` to decompile. Independent verification in stock
 * 4.1.28 showed that is wrong in the worst way available: a blocks-first
 * project with empty XML opens on a BLANK workspace, and the next save writes
 * that blank workspace over the TypeScript — so the life statement the whole
 * first goal is about disappears. A `switchblocks` acknowledgment does not mean
 * a decompile happened, so it is not readiness either.
 *
 * So {@link STARTER_MAIN_BLOCKS} is now the real thing: XML generated offline
 * by stock Arcade 4.1.28 / PXT 13.1.25 **from the exact `STARTER_MAIN_TS`
 * below**, verified in a fresh stock runtime (visible life 3, a touch edit from
 * 3 to 4 changing both TS and XML, four-heart gameplay). The two files are a
 * matched pair, and {@link STARTER_TS_SHA256} / {@link STARTER_BLOCKS_SHA256}
 * record the exact pair that was verified — so an edit to one and not the other
 * is a discrepancy a reader can see rather than a silent regression.
 *
 * `STARTER_MAIN_TS` is therefore **frozen**: changing it invalidates the
 * generated XML, and the two must be regenerated together.
 *
 * Readiness is still CHECKED rather than assumed: after import the page asks
 * the editor for the project back and runs {@link starterImportLooksCorrect}
 * over what comes. If the life block is not in the returned Blocks, the page
 * says so and closes the edit/save controls instead of letting a child work in
 * a blank workspace.
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
 * The REAL blocks workspace — generated offline by stock Arcade 4.1.28 /
 * PXT 13.1.25 from {@link STARTER_MAIN_TS} above, and verified in a fresh stock
 * runtime.
 *
 * Data, not hand-authored XML: it is the editor's own output for this exact
 * TypeScript, which is why its block ids, shadows, mutations and variable ids
 * are the ones Blockly expects. Every backtick inside it is escaped for the
 * template literal; the `img` literals keep their real newlines because that is
 * what the field value is.
 *
 * Paired with the TypeScript. Regenerate BOTH together or neither.
 */
export const STARTER_MAIN_BLOCKS = `<xml xmlns="https://developers.google.com/blockly/xml"><variables><variable type="KIND_SpriteKind" id="#d)|q+y*)0P_amGPN-lJ">Player</variable><variable type="KIND_SpriteKind" id="YQFR%G.B3eqJY!tGr/a!">Projectile</variable><variable type="KIND_SpriteKind" id=":oSoV!-RclW^9/}9hu\`x">Food</variable><variable type="KIND_SpriteKind" id="8*#^NrwPkI@QT_)EgWFm">Enemy</variable><variable id=":QMXZ5atCqqE[j^]yTz9">apple</variable><variable id="f%1GeTRFf|XGG:(ihL(W">rock</variable><variable id="^43MAt/X!FD-gk!-V8QV">hero</variable></variables><block type="pxt-on-start" x="20" y="20"><statement name="HANDLER"><block type="gamesetbackgroundcolor"><value name="color"><shadow type="colorindexpicker"><field name="index">9</field></shadow></value><next><block type="hudSetLife"><value name="value"><shadow type="math_number"><field name="NUM">3</field></shadow></value><next><block type="hudsetScore"><value name="value"><shadow type="math_number"><field name="NUM">0</field></shadow></value><next><block type="gamecountdown"><value name="duration"><shadow type="math_number"><field name="NUM">45</field></shadow></value><next><block type="variables_set"><field name="VAR" id="^43MAt/X!FD-gk!-V8QV">hero</field><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="spritescreate"><value name="img"><shadow type="screen_image_picker"><field name="img">img\`
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
\`</field><data>{"commentRefs":[],"fieldData":{"img":null}}</data></shadow></value><value name="kind"><shadow type="spritekind"><field name="MEMBER">Player</field></shadow></value></block></value><next><block type="spritesetpos"><value name="sprite"><block type="variables_get"><field name="VAR" id="^43MAt/X!FD-gk!-V8QV">hero</field></block></value><value name="x"><shadow type="positionPicker"><field name="index">80</field></shadow></value><value name="y"><shadow type="positionPicker"><field name="index">104</field></shadow></value><next><block type="spritesetsetstayinscreen"><value name="sprite"><block type="variables_get"><field name="VAR" id="^43MAt/X!FD-gk!-V8QV">hero</field></block></value><value name="on"><shadow type="toggleOnOff"><field name="on">true</field></shadow></value><next><block type="game_control_sprite"><mutation xmlns="http://www.w3.org/1999/xhtml" _expanded="2" _input_init="true"></mutation><value name="sprite"><block type="variables_get"><field name="VAR" id="^43MAt/X!FD-gk!-V8QV">hero</field></block></value><value name="vx"><shadow type="spriteSpeedPicker"><field name="speed">90</field></shadow></value><value name="vy"><shadow type="spriteSpeedPicker"><field name="speed">0</field></shadow></value></block></next></block></next></block></next></block></next></block></next></block></next></block></next></block></next></block></statement></block><block type="gameinterval" x="20" y="547"><value name="period"><shadow type="timePicker"><field name="ms">1200</field></shadow></value><statement name="HANDLER"><block type="variables_set"><field name="VAR" id=":QMXZ5atCqqE[j^]yTz9">apple</field><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="spritescreate"><value name="img"><shadow type="screen_image_picker"><field name="img">img\`
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
\`</field><data>{"commentRefs":[],"fieldData":{"img":null}}</data></shadow></value><value name="kind"><shadow type="spritekind"><field name="MEMBER">Food</field></shadow></value></block></value><next><block type="spritesetpos"><value name="sprite"><block type="variables_get"><field name="VAR" id=":QMXZ5atCqqE[j^]yTz9">apple</field></block></value><value name="x"><shadow type="positionPicker"><field name="index">0</field></shadow><block type="device_random"><value name="min"><shadow type="math_number"><field name="NUM">8</field></shadow></value><value name="limit"><shadow type="math_number"><field name="NUM">152</field></shadow></value></block></value><value name="y"><shadow type="positionPicker"><field name="index">2</field></shadow></value><next><block type="spritesetsetflag"><field name="flag">SpriteFlag.AutoDestroy</field><value name="sprite"><block type="variables_get"><field name="VAR" id=":QMXZ5atCqqE[j^]yTz9">apple</field></block></value><value name="on"><shadow type="toggleOnOff"><field name="on">true</field></shadow></value><next><block type="Sprite_blockCombine_set"><field name="property">Sprite.vy@set</field><value name="mySprite"><block type="variables_get"><field name="VAR" id=":QMXZ5atCqqE[j^]yTz9">apple</field></block></value><value name="value"><shadow type="math_number"><field name="NUM">45</field></shadow></value></block></next></block></next></block></next></block></statement></block><block type="gameinterval" x="20" y="882"><value name="period"><shadow type="timePicker"><field name="ms">2000</field></shadow></value><statement name="HANDLER"><block type="variables_set"><field name="VAR" id="f%1GeTRFf|XGG:(ihL(W">rock</field><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="spritescreate"><value name="img"><shadow type="screen_image_picker"><field name="img">img\`
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
\`</field><data>{"commentRefs":[],"fieldData":{"img":null}}</data></shadow></value><value name="kind"><shadow type="spritekind"><field name="MEMBER">Enemy</field></shadow></value></block></value><next><block type="spritesetpos"><value name="sprite"><block type="variables_get"><field name="VAR" id="f%1GeTRFf|XGG:(ihL(W">rock</field></block></value><value name="x"><shadow type="positionPicker"><field name="index">0</field></shadow><block type="device_random"><value name="min"><shadow type="math_number"><field name="NUM">8</field></shadow></value><value name="limit"><shadow type="math_number"><field name="NUM">152</field></shadow></value></block></value><value name="y"><shadow type="positionPicker"><field name="index">2</field></shadow></value><next><block type="spritesetsetflag"><field name="flag">SpriteFlag.AutoDestroy</field><value name="sprite"><block type="variables_get"><field name="VAR" id="f%1GeTRFf|XGG:(ihL(W">rock</field></block></value><value name="on"><shadow type="toggleOnOff"><field name="on">true</field></shadow></value><next><block type="Sprite_blockCombine_set"><field name="property">Sprite.vy@set</field><value name="mySprite"><block type="variables_get"><field name="VAR" id="f%1GeTRFf|XGG:(ihL(W">rock</field></block></value><value name="value"><shadow type="math_number"><field name="NUM">60</field></shadow></value></block></next></block></next></block></next></block></statement></block><block type="spritesoverlap" x="20" y="1217"><value name="HANDLER_DRAG_PARAM_sprite"><block type="argument_reporter_custom" deletable="false"><mutation typename="Sprite"></mutation><field name="VALUE">sprite</field></block></value><value name="kind"><shadow type="spritekind"><field name="MEMBER">Player</field></shadow></value><value name="HANDLER_DRAG_PARAM_otherSprite"><block type="argument_reporter_custom" deletable="false"><mutation typename="Sprite"></mutation><field name="VALUE">otherSprite</field></block></value><value name="otherKind"><shadow type="spritekind"><field name="MEMBER">Food</field></shadow></value><statement name="HANDLER"><block type="spritedestroy"><mutation xmlns="http://www.w3.org/1999/xhtml" _expanded="0" _input_init="true"></mutation><field name="effect">effects.spray</field><value name="sprite"><block type="argument_reporter_custom"><mutation typename="Sprite"></mutation><field name="VALUE">otherSprite</field></block></value><next><block type="hudChangeScoreBy"><value name="value"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block></next></block></statement></block><block type="spritesoverlap" x="20" y="1446"><value name="HANDLER_DRAG_PARAM_sprite"><block type="argument_reporter_custom" deletable="false"><mutation typename="Sprite"></mutation><field name="VALUE">sprite</field></block></value><value name="kind"><shadow type="spritekind"><field name="MEMBER">Player</field></shadow></value><value name="HANDLER_DRAG_PARAM_otherSprite"><block type="argument_reporter_custom" deletable="false"><mutation typename="Sprite"></mutation><field name="VALUE">otherSprite</field></block></value><value name="otherKind"><shadow type="spritekind"><field name="MEMBER">Enemy</field></shadow></value><statement name="HANDLER"><block type="spritedestroy"><mutation xmlns="http://www.w3.org/1999/xhtml" _expanded="0" _input_init="true"></mutation><field name="effect">effects.spray</field><value name="sprite"><block type="argument_reporter_custom"><mutation typename="Sprite"></mutation><field name="VALUE">otherSprite</field></block></value><next><block type="hudChangeLifeBy"><value name="value"><shadow type="math_number"><field name="NUM">-1</field></shadow></value></block></next></block></statement></block></xml>`

/**
 * The exact verified pair, recorded as data.
 *
 * These are the SHA-256 digests of the TypeScript the Blocks were generated
 * from and of the Blocks themselves, taken at generation time in stock
 * 4.1.28 / PXT 13.1.25. They are written here so that a change to one file and
 * not the other is visible, and so a reader can tell which pair was tested in a
 * real runtime. Nothing computes them at runtime — this app has no synchronous
 * SHA-256 and does not need one.
 */
export const STARTER_TS_SHA256 =
  '24a6d3341506a9bdaf7c5c0faf1b8c0c8e58168e6380278b84abc1f75a22e750'
export const STARTER_BLOCKS_SHA256 =
  '9ec607fc3e54cbda4b456d58752fae154cd630fe42fb8b8b59161e777154e46f'

/**
 * Neutral description. "A prepared starter" and nothing about who wrote it.
 *
 * The same text is in the metadata of the standalone recovery PNG, so the two
 * cannot describe the project differently.
 */
export const STARTER_DESCRIPTION =
  'A prepared starter game: catch the apples, dodge the rocks. Change the numbers and see what happens.'

export const STARTER_PXT_JSON = JSON.stringify(
  {
    name: BUILD_STUDIO_PROJECT_NAME,
    description: STARTER_DESCRIPTION,
    dependencies: { device: '*' },
    files: ['main.blocks', 'main.ts'],
    preferredEditor: 'blocksprj',
  },
  null,
  4,
)

/**
 * The standalone MakeCode project PNG for this starter.
 *
 * **It is the STARTER, and only the starter.** A MakeCode `.png` project file
 * is a different thing from this app's JSON archive or a `main.ts` text file:
 * it is the one format stock MakeCode's own *Import* dialog accepts, which is
 * why it exists. It was compiled from the same TypeScript and the same
 * populated Blocks and carries the same neutral description, and a clean
 * standalone import was verified to recover life 3.
 *
 * It is NEVER offered as recovery of a child's edited work — edited source
 * recovery is the exported archive, which is a separate route with separate
 * wording. Substituting the starter for a failed save would silently replace
 * what he made with what he started from.
 */
export const STARTER_PROJECT_PNG_URL = '/build-studio/apple-dash-starter.png'
export const STARTER_PROJECT_PNG_SHA256 =
  'a49f1b07a6ee285474253bc70e5c642cda0d1f2cab76abd6307e893f18a4989d'

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
  /**
   * The block the goal is about, WITHOUT its number — the number comes from
   * whatever source is open (`buildStudioHints.lifeBlockLabel`). A label with
   * `3` baked in kept telling a child to find *set life to 3* after he had
   * already changed it to 4.
   */
  blockLabelPrefix: 'set life to',
  /** What the SHIPPED starter's block says, for the tuning list only. */
  starterBlockLabel: 'set life to 3',
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

/**
 * The Blockly block type stock Arcade uses for *set life to N*.
 *
 * The one block the whole first goal is about, and the one the hints name. It
 * is checked by TYPE rather than by counting elements, because counting was the
 * mistake the first draft made: a blank workspace that happens to carry a
 * couple of stray shadows passes a count, and the verified failure was
 * precisely a workspace with no life statement in it.
 */
export const LIFE_BLOCK_TYPE = 'hudSetLife'

/** The `pxt-on-start` block. Without it nothing in the workspace runs. */
const ON_START_BLOCK_TYPE = 'pxt-on-start'

/**
 * Does this `main.blocks` hold a real, runnable workspace?
 *
 * Three questions, each one a verified failure mode rather than a precaution:
 * is there an `on start` at all, does it have a body, and is the **life block**
 * in it. An empty workspace fails the first two; the blank-import regression
 * that lost the life statement fails the third while passing a block count.
 */
export function blocksLookAuthored(mainBlocks: string | undefined): boolean {
  if (!mainBlocks) return false
  if (!mainBlocks.includes(`type="${ON_START_BLOCK_TYPE}"`)) return false
  if (!/<statement\s/.test(mainBlocks)) return false
  return mainBlocks.includes(`type="${LIFE_BLOCK_TYPE}"`)
}

/**
 * Do these Blocks and this TypeScript describe the SAME program?
 *
 * Not a decompile — a correspondence check on the handful of facts that would
 * tell a reader the two halves disagree, which is the state the blank-XML
 * regression produced (good TypeScript, Blocks that would overwrite it). It
 * reads the numbers out of each side and compares them.
 *
 * Only ever applied to the shipped starter, before the child touches anything.
 */
export function starterBlocksMatchSource(
  mainBlocks: string | undefined,
  mainTs: string | undefined,
): boolean {
  if (!mainBlocks || !mainTs) return false
  if (!blocksLookAuthored(mainBlocks)) return false
  const lifeInTs = mainTs.match(/info\.setLife\((\d+)\)/)
  if (!lifeInTs) return false
  // The life block's own shadow number, read as the value next to the type.
  const lifeInBlocks = mainBlocks.match(
    new RegExp(`type="${LIFE_BLOCK_TYPE}"[\\s\\S]{0,200}?<field name="NUM">(-?\\d+)</field>`),
  )
  if (!lifeInBlocks) return false
  return lifeInBlocks[1] === lifeInTs[1]
}

/**
 * Did the STARTER arrive correctly — a real block workspace AND the playable
 * source it matches?
 *
 * **Used exactly once per visit: immediately after importing the starter,
 * before the child has touched anything.** It is not, and must never become, a
 * check on a save: a child who deletes the life block, swaps the apple for a
 * dragon or throws the whole thing away has made his game, and a writer that
 * refused that would be the app deciding what his game is allowed to be.
 *
 * Both halves are asserted, because they fail separately — and the failure that
 * made this necessary passed the old version of this check: a project whose
 * TypeScript was fine and whose Blocks were blank, which the next save would
 * have written over the TypeScript.
 */
export function starterImportLooksCorrect(files: BuildStudioSourceFiles): boolean {
  const ts = files['main.ts']
  if (typeof ts !== 'string' || !ts.includes('sprites.create')) return false
  if (!ts.includes('info.setLife')) return false
  return starterBlocksMatchSource(files['main.blocks'], ts)
}

/**
 * Did a REOPENED version arrive as a usable project?
 *
 * Deliberately weaker than the starter check and deliberately not the same
 * function: the stored bytes are the child's own, so the app does not get to
 * decide his game must still contain a life block. What it does require is that
 * the editor handed back a project with his source in it, so a blank frame is
 * not mistaken for his saved work.
 */
export function reopenedVersionLooksLoaded(files: BuildStudioSourceFiles): boolean {
  const ts = files['main.ts']
  const manifest = files['pxt.json']
  return typeof ts === 'string' && ts.trim() !== '' && typeof manifest === 'string'
}
