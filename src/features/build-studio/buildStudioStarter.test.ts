import { describe, expect, it } from 'vitest'

import {
  blocksLookAuthored,
  BUILD_STUDIO_GOAL,
  BUILD_STUDIO_PROJECT_NAME,
  LIFE_BLOCK_TYPE,
  reopenedVersionLooksLoaded,
  starterBlocksMatchSource,
  starterImportLooksCorrect,
  starterSourceFiles,
  STARTER_DESCRIPTION,
  STARTER_BLOCKS_SHA256,
  STARTER_MAIN_BLOCKS,
  STARTER_MAIN_TS,
  STARTER_PROJECT_PNG_SHA256,
  STARTER_PROJECT_PNG_URL,
  STARTER_PXT_JSON,
  STARTER_TS_SHA256,
  STARTER_TUNING_NUMBERS,
} from './buildStudioStarter'

/**
 * The starter (LOCAL-BUILD-001), after the blank-Blocks regression.
 *
 * ── What this file is now FOR ─────────────────────────────────────────────
 *
 * The first version of this suite asserted that `main.blocks` was EMPTY and
 * that `blocksLookAuthored` said so. That pinned the defect: a blocks-first
 * project with empty XML opens on a blank workspace in stock 4.1.28, and the
 * next save writes the blank workspace over the TypeScript — losing the life
 * statement the whole first goal is about.
 *
 * So the assertions are inverted. The shipped Blocks must be the real,
 * generated ones, they must contain the life block, and they must agree with
 * the TypeScript they were generated from.
 *
 * POSITIVE CONTROL: replace `STARTER_MAIN_BLOCKS` with
 * `'<xml xmlns="…"></xml>'` and the first three blocks below fail.
 */

describe('the shipped Blocks are real, and match the shipped TypeScript', () => {
  it('is not an empty workspace', () => {
    expect(STARTER_MAIN_BLOCKS).not.toMatch(/^<xml[^>]*><\/xml>$/)
    expect(STARTER_MAIN_BLOCKS).toContain('type="pxt-on-start"')
    expect(STARTER_MAIN_BLOCKS).toMatch(/<statement\s/)
  })

  it('carries the LIFE block, which is the one the first goal is about', () => {
    expect(STARTER_MAIN_BLOCKS).toContain(`type="${LIFE_BLOCK_TYPE}"`)
    expect(blocksLookAuthored(STARTER_MAIN_BLOCKS)).toBe(true)
  })

  it('shows the same life number in the Blocks as in the TypeScript', () => {
    // The exact failure mode: good TypeScript beside Blocks that disagree with
    // it, where the next save makes the Blocks win.
    expect(STARTER_MAIN_TS).toContain('info.setLife(3)')
    expect(starterBlocksMatchSource(STARTER_MAIN_BLOCKS, STARTER_MAIN_TS)).toBe(true)
  })

  it('carries every block the game needs, not just the life one', () => {
    for (const type of [
      'gameinterval',
      'spritesoverlap',
      'spritescreate',
      'game_control_sprite',
      'gamecountdown',
      'hudChangeLifeBy',
      'hudChangeScoreBy',
    ]) {
      expect(STARTER_MAIN_BLOCKS, `missing ${type}`).toContain(`type="${type}"`)
    }
  })

  it('declares the sprite kinds and variables the blocks reference', () => {
    expect(STARTER_MAIN_BLOCKS).toContain('<variables>')
    for (const name of ['Player', 'Food', 'Enemy', 'hero', 'apple', 'rock']) {
      expect(STARTER_MAIN_BLOCKS).toContain(`>${name}</variable>`)
    }
  })

  it('keeps all three sprite images in the Blocks', () => {
    const images = STARTER_MAIN_BLOCKS.match(/<field name="img">img`/g)
    expect(images).toHaveLength(3)
  })
})

describe('the TypeScript is the half the Blocks were generated from', () => {
  it('still declares the exact game logic', () => {
    // The two files are a matched pair. If this changes, the Blocks are stale
    // and must be regenerated with it.
    expect(STARTER_MAIN_TS).toContain('info.setLife(3)')
    expect(STARTER_MAIN_TS).toContain('info.startCountdown(45)')
    expect(STARTER_MAIN_TS).toContain('controller.moveSprite(hero, 90, 0)')
    expect(STARTER_MAIN_TS).toContain('game.onUpdateInterval(1200')
    expect(STARTER_MAIN_TS).toContain('game.onUpdateInterval(2000')
    expect(STARTER_MAIN_TS).toContain('info.changeScoreBy(1)')
    expect(STARTER_MAIN_TS).toContain('info.changeLifeBy(-1)')
  })

  it('has one player, one collectible and one obstacle', () => {
    expect(STARTER_MAIN_TS).toContain('SpriteKind.Player')
    expect(STARTER_MAIN_TS).toContain('SpriteKind.Food')
    expect(STARTER_MAIN_TS).toContain('SpriteKind.Enemy')
  })

  it('has well-formed 16×16 sprite images', () => {
    // A malformed `img` literal does not fail loudly — it fails to COMPILE, so
    // the game simply does not run.
    const literals = [...STARTER_MAIN_TS.matchAll(/img`([^`]*)`/g)].map((m) => m[1])
    expect(literals).toHaveLength(3)
    for (const literal of literals) {
      const rows = literal
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      expect(rows).toHaveLength(16)
      for (const row of rows) expect(row.split(/\s+/)).toHaveLength(16)
      expect(literal.replace(/\s+/g, '')).toMatch(/^[.0-9a-f]+$/)
    }
  })
})

describe('the manifest is a real blocks project, neutrally described', () => {
  const manifest = JSON.parse(STARTER_PXT_JSON) as {
    name: string
    description: string
    files: string[]
    preferredEditor: string
    dependencies: Record<string, string>
  }

  it('names the project the bridge binds on', () => {
    expect(manifest.name).toBe(BUILD_STUDIO_PROJECT_NAME)
  })

  it('is a BLOCKS project — he works in blocks, not JavaScript', () => {
    expect(manifest.preferredEditor).toBe('blocksprj')
  })

  it('declares both files and the arcade device dependency', () => {
    expect(manifest.files).toEqual(['main.blocks', 'main.ts'])
    expect(manifest.dependencies).toEqual({ device: '*' })
  })

  it('calls itself a prepared starter and claims no author', () => {
    expect(manifest.description).toBe(STARTER_DESCRIPTION)
    expect(STARTER_DESCRIPTION).toMatch(/prepared starter/i)
    expect(BUILD_STUDIO_PROJECT_NAME).toMatch(/starter/i)
  })

  it('makes no Dad or child authorship claim anywhere in the project', () => {
    for (const text of Object.values(starterSourceFiles())) {
      expect(text).not.toMatch(/\bDad\b/)
      expect(text).not.toMatch(/\bmade for you\b/i)
      expect(text.toLowerCase()).not.toContain('eater princess')
    }
  })

  it('ships the three files, with populated Blocks among them', () => {
    const files = starterSourceFiles()
    expect(Object.keys(files).sort()).toEqual(['main.blocks', 'main.ts', 'pxt.json'])
    expect(blocksLookAuthored(files['main.blocks'])).toBe(true)
  })
})

describe('the verified pair is recorded as data', () => {
  it('carries a well-formed digest for each half and for the PNG', () => {
    // Provenance, not a runtime check: these are the digests of the exact
    // TypeScript, Blocks and project file that were verified in a real stock
    // runtime, so an edit to one half and not the other is visible to a reader.
    for (const digest of [
      STARTER_TS_SHA256,
      STARTER_BLOCKS_SHA256,
      STARTER_PROJECT_PNG_SHA256,
    ]) {
      expect(digest).toMatch(/^[0-9a-f]{64}$/)
    }
    expect(new Set([STARTER_TS_SHA256, STARTER_BLOCKS_SHA256]).size).toBe(2)
  })
})

describe('the standalone recovery file is the STARTER and says so', () => {
  it('points at the checked project PNG', () => {
    expect(STARTER_PROJECT_PNG_URL).toBe('/build-studio/apple-dash-starter.png')
  })

  it('is a MakeCode project file, not this app’s archive', () => {
    // Different formats, and the UI must not offer one where the other is
    // needed. The `.png` is what stock MakeCode's Import dialog accepts.
    expect(STARTER_PROJECT_PNG_URL.endsWith('.png')).toBe(true)
  })
})

describe('an empty or mismatched workspace does not count as the starter', () => {
  /**
   * POSITIVE CONTROL: drop the life-block requirement from
   * `blocksLookAuthored` and the empty-on-start and no-life cases pass.
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
      'an on start with a body but NO life block',
      '<xml xmlns="x"><block type="pxt-on-start"><statement name="HANDLER">' +
        '<block type="hudsetScore"><value name="value"><shadow type="math_number">' +
        '<field name="NUM">0</field></shadow></value></block></statement></block></xml>',
    ],
  ])('refuses %s', (_label, xml) => {
    expect(blocksLookAuthored(xml)).toBe(false)
  })

  it('refuses Blocks whose life number disagrees with the TypeScript', () => {
    const fourInBlocks = STARTER_MAIN_BLOCKS.replace(
      /(type="hudSetLife"[\s\S]{0,200}?<field name="NUM">)3(<\/field>)/,
      '$14$2',
    )
    expect(fourInBlocks).not.toBe(STARTER_MAIN_BLOCKS)
    expect(starterBlocksMatchSource(fourInBlocks, STARTER_MAIN_TS)).toBe(false)
  })

  it('accepts Blocks and TypeScript that agree on a CHANGED number', () => {
    // A child who set 4 lives has a matched pair at 4. The check is about
    // agreement, not about the number being 3.
    const fourTs = STARTER_MAIN_TS.replace('info.setLife(3)', 'info.setLife(4)')
    const fourBlocks = STARTER_MAIN_BLOCKS.replace(
      /(type="hudSetLife"[\s\S]{0,200}?<field name="NUM">)3(<\/field>)/,
      '$14$2',
    )
    expect(starterBlocksMatchSource(fourBlocks, fourTs)).toBe(true)
  })
})

describe('the import check asks about BOTH halves', () => {
  it('passes for the files as shipped', () => {
    expect(starterImportLooksCorrect(starterSourceFiles())).toBe(true)
  })

  it('FAILS on the blank-Blocks shape that lost the life statement', () => {
    expect(
      starterImportLooksCorrect({
        'pxt.json': STARTER_PXT_JSON,
        'main.ts': STARTER_MAIN_TS,
        'main.blocks': '<xml xmlns="https://developers.google.com/blockly/xml"></xml>',
      }),
    ).toBe(false)
  })

  it('fails when the source was truncated, even though Blocks arrived', () => {
    expect(
      starterImportLooksCorrect({
        'pxt.json': STARTER_PXT_JSON,
        'main.ts': 'info.setLife(3)',
        'main.blocks': STARTER_MAIN_BLOCKS,
      }),
    ).toBe(false)
  })
})

describe('a reopened version is judged more gently, on purpose', () => {
  it('accepts a child’s own project with no life block left in it', () => {
    // His game is his. The app does not get to require a life block in it.
    expect(
      reopenedVersionLooksLoaded({
        'pxt.json': STARTER_PXT_JSON,
        'main.ts': 'scene.setBackgroundColor(5)\n',
        'main.blocks': '<xml xmlns="x"></xml>',
      }),
    ).toBe(true)
  })

  it('still refuses a blank frame mistaken for his saved work', () => {
    expect(
      reopenedVersionLooksLoaded({ 'pxt.json': STARTER_PXT_JSON, 'main.ts': '   ' }),
    ).toBe(false)
    expect(reopenedVersionLooksLoaded({ 'main.ts': 'x' })).toBe(false)
  })
})

describe('the goal names the block without baking in its number', () => {
  it('carries a prefix, not “set life to 3”', () => {
    expect(BUILD_STUDIO_GOAL.blockLabelPrefix).toBe('set life to')
    expect(BUILD_STUDIO_GOAL).not.toHaveProperty('blockLabel')
  })

  it('still records what the shipped starter says, for the tuning list', () => {
    expect(BUILD_STUDIO_GOAL.starterBlockLabel).toBe('set life to 3')
  })
})

describe('the tuning list points at real blocks', () => {
  it('names five numbers, each with a block and a place to look', () => {
    expect(STARTER_TUNING_NUMBERS).toHaveLength(5)
    for (const tuning of STARTER_TUNING_NUMBERS) {
      expect(tuning.label.length).toBeGreaterThan(2)
      expect(tuning.blockLabel.length).toBeGreaterThan(2)
      expect(tuning.where.length).toBeGreaterThan(2)
    }
  })

  it('every number it names is in the shipped program', () => {
    const byId = Object.fromEntries(STARTER_TUNING_NUMBERS.map((t) => [t.id, t.value]))
    expect(STARTER_MAIN_TS).toContain(`info.setLife(${byId.lives})`)
    expect(STARTER_MAIN_TS).toContain(`info.startCountdown(${byId.roundSeconds})`)
    expect(STARTER_MAIN_TS).toContain(`info.changeScoreBy(${byId.applePoints})`)
    expect(STARTER_MAIN_TS).toContain(`game.onUpdateInterval(${byId.spawnInterval}`)
    expect(STARTER_MAIN_TS).toContain(`controller.moveSprite(hero, ${byId.speed}`)
  })
})
