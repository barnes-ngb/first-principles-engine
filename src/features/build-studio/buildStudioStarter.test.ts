import { describe, expect, it } from 'vitest'

import {
  blocksLookAuthored,
  BUILD_STUDIO_GOAL,
  BUILD_STUDIO_PROJECT_NAME,
  starterImportLooksCorrect,
  starterSourceFiles,
  STARTER_MAIN_TS,
  STARTER_PXT_JSON,
  STARTER_TUNING_NUMBERS,
} from './buildStudioStarter'

/**
 * The starter (LOCAL-BUILD-001).
 *
 * The things that can be checked without a browser are checked here; the one
 * that cannot — whether MakeCode's decompiler really turns this TypeScript into
 * editable blocks — is checked AT RUNTIME by `starterImportLooksCorrect`, whose
 * own behaviour is pinned below. That split is deliberate and stated in the
 * module docstring rather than hidden.
 */

describe('the manifest is a real blocks project', () => {
  const manifest = JSON.parse(STARTER_PXT_JSON) as {
    name: string
    files: string[]
    preferredEditor: string
    dependencies: Record<string, string>
  }

  it('parses, and names the project the bridge binds on', () => {
    expect(manifest.name).toBe(BUILD_STUDIO_PROJECT_NAME)
  })

  it('is a BLOCKS project — he works in blocks, not JavaScript', () => {
    expect(manifest.preferredEditor).toBe('blocksprj')
  })

  it('declares both files and the arcade device dependency', () => {
    expect(manifest.files).toEqual(['main.blocks', 'main.ts'])
    expect(manifest.dependencies).toEqual({ device: '*' })
  })

  it('says a grown-up made it — the scaffold is never claimed as his', () => {
    expect(STARTER_PXT_JSON).toMatch(/Dad made/)
    expect(BUILD_STUDIO_PROJECT_NAME).toMatch(/starter/i)
  })

  it('is not, and does not shadow, the named public Eater Princess project', () => {
    const files = starterSourceFiles()
    for (const text of Object.values(files)) {
      expect(text.toLowerCase()).not.toContain('eater princess')
    }
  })
})

describe('every sprite image is a well-formed 16×16 literal', () => {
  /**
   * A malformed `img` literal does not fail loudly — it fails to COMPILE, so
   * the game simply does not run, which is the worst possible way for this to
   * be wrong. Each literal is counted here instead.
   */
  const literals = [...STARTER_MAIN_TS.matchAll(/img`([^`]*)`/g)].map((m) => m[1])

  it('finds the three images the game draws', () => {
    expect(literals).toHaveLength(3)
  })

  it.each([0, 1, 2])('image %i is 16 rows of 16 pixels', (index) => {
    const rows = literals[index]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    expect(rows).toHaveLength(16)
    for (const row of rows) {
      expect(row.split(/\s+/)).toHaveLength(16)
    }
  })

  it('uses only transparent and palette characters', () => {
    for (const literal of literals) {
      expect(literal.replace(/\s+/g, '')).toMatch(/^[.0-9a-f]+$/)
    }
  })
})

describe('the program is the game the page describes', () => {
  it('has one player, one collectible and one obstacle', () => {
    expect(STARTER_MAIN_TS).toContain('SpriteKind.Player')
    expect(STARTER_MAIN_TS).toContain('SpriteKind.Food')
    expect(STARTER_MAIN_TS).toContain('SpriteKind.Enemy')
  })

  it('carries the life block the goal and the hints both name', () => {
    expect(STARTER_MAIN_TS).toContain('info.setLife(3)')
    expect(BUILD_STUDIO_GOAL.blockLabel).toBe('set life to 3')
  })

  it('declares every tuning number the page points at', () => {
    // The page's list is a map to real blocks. A number in the list that is not
    // in the program would send a child looking for something that is not
    // there — the exact failure the hint wording rule exists to prevent.
    const byId = Object.fromEntries(STARTER_TUNING_NUMBERS.map((t) => [t.id, t.value]))
    expect(STARTER_MAIN_TS).toContain(`info.setLife(${byId.lives})`)
    expect(STARTER_MAIN_TS).toContain(`info.startCountdown(${byId.roundSeconds})`)
    expect(STARTER_MAIN_TS).toContain(`info.changeScoreBy(${byId.applePoints})`)
    expect(STARTER_MAIN_TS).toContain(`game.onUpdateInterval(${byId.spawnInterval}`)
    expect(STARTER_MAIN_TS).toContain(`controller.moveSprite(hero, ${byId.speed}`)
  })

  it('names five numbers, each with a block and a place to look', () => {
    expect(STARTER_TUNING_NUMBERS).toHaveLength(5)
    for (const tuning of STARTER_TUNING_NUMBERS) {
      expect(tuning.label.length).toBeGreaterThan(2)
      expect(tuning.blockLabel.length).toBeGreaterThan(2)
      expect(tuning.where.length).toBeGreaterThan(2)
    }
  })

  it('ships an EMPTY blocks file, so the decompile is what fills it', () => {
    const files = starterSourceFiles()
    expect(files['main.blocks']).not.toMatch(/<block\s/)
    expect(blocksLookAuthored(files['main.blocks'])).toBe(false)
  })
})

describe('an empty workspace does not count as the starter', () => {
  /**
   * The slice's own rule: an empty on-start or stale XML is not an arrival.
   * POSITIVE CONTROL: drop the `<statement` requirement from
   * `blocksLookAuthored` and the empty-on-start case passes.
   */
  it.each([
    ['nothing at all', undefined],
    ['an empty string', ''],
    ['an empty workspace', '<xml xmlns="x"></xml>'],
    [
      'an empty on start',
      '<xml xmlns="x"><block type="pxt-on-start" x="0" y="0"></block></xml>',
    ],
    [
      'two bare blocks and no body',
      '<xml xmlns="x"><block type="a"/><block type="b"/></xml>',
    ],
  ])('refuses %s', (_label, xml) => {
    expect(blocksLookAuthored(xml)).toBe(false)
  })

  it('accepts a workspace with blocks inside a statement', () => {
    expect(blocksLookAuthored(AUTHORED_BLOCKS)).toBe(true)
  })
})

/**
 * A workspace shaped like a decompiled `on start`: an outer block, a statement
 * body, and enough blocks in it to clear the floor. The real starter decompiles
 * to far more than this.
 */
const AUTHORED_BLOCKS =
  '<xml xmlns="x"><block type="pxt-on-start" x="0" y="0"><statement name="HANDLER">' +
  '<block type="hudsetLife"><value name="value"><shadow type="math_number">' +
  '<field name="NUM">3</field></shadow></value>' +
  '<next><block type="hudsetScore"><value name="value"><shadow type="math_number">' +
  '<field name="NUM">0</field></shadow></value></block></next>' +
  '</block></statement></block></xml>'

describe('the import check asks about BOTH halves', () => {
  const blocks = AUTHORED_BLOCKS

  it('passes when blocks arrived and the source is the starter', () => {
    expect(
      starterImportLooksCorrect({
        'pxt.json': STARTER_PXT_JSON,
        'main.ts': STARTER_MAIN_TS,
        'main.blocks': blocks,
      }),
    ).toBe(true)
  })

  it('fails when the blocks never appeared, even though the code is fine', () => {
    expect(
      starterImportLooksCorrect({
        'pxt.json': STARTER_PXT_JSON,
        'main.ts': STARTER_MAIN_TS,
        'main.blocks': '<xml xmlns="x"></xml>',
      }),
    ).toBe(false)
  })

  it('fails when the source was truncated, even though blocks appeared', () => {
    expect(
      starterImportLooksCorrect({
        'pxt.json': STARTER_PXT_JSON,
        'main.ts': 'info.setLife(3)',
        'main.blocks': blocks,
      }),
    ).toBe(false)
  })
})
