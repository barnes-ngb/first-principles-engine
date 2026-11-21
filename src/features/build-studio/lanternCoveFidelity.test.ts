import { describe, expect, it } from 'vitest'

/**
 * Lantern Cove source fidelity and the credit signature (FEAT-247, slice 4).
 *
 * The bytes under test are the REAL staged starter. Two different round trips are
 * modelled, and they are kept apart on purpose:
 *
 *   • {@link measuredStockTrip} — exactly what the released editor controller's
 *     import → capture was MEASURED to do to the prepared starter: `pxt.json` gains
 *     one trailing LF, and the x/y of the three starter blocks move (20,20→0,0;
 *     20,967→0,947; 20,1446→0,1426). Nothing else. This is the only thing the
 *     pristine proof may forgive.
 *   • {@link ongoingTrip} — the broader metadata churn an ONGOING version can carry
 *     (rewritten manifest metadata and key order, re-spaced Blocks, reformatted map
 *     JSON). It is constructed here, not measured, and only the CREDIT signature
 *     may forgive it; the pristine proof must refuse every part of it.
 *
 * Each "meaningful" alteration changes what the game is, and carries a control line
 * proving it really changed the text, so a staged-file edit that made one a no-op
 * fails here rather than weakening it.
 */

import type { BuildStudioSourceFiles } from '../../core/types/buildStudio'
import {
  compareLanternCoveToStarter,
  creditManifest,
  lanternCoveCreditSignature,
  withoutStarterBlockPositions,
} from './lanternCoveFidelity'
import {
  lanternCoveArchiveComplete,
  lanternCoveStarterFiles,
  lanternCoveStarterLooksCorrect,
  lanternCoveStarterProblem,
} from './lanternCoveStarter'

const starter = (): BuildStudioSourceFiles => lanternCoveStarterFiles()

const without = (files: BuildStudioSourceFiles, name: string): BuildStudioSourceFiles =>
  Object.fromEntries(Object.entries(files).filter(([key]) => key !== name))

/** The staged map with its `data` hex rewritten through `edit`. */
function withMap(files: BuildStudioSourceFiles, edit: (hex: string) => string): BuildStudioSourceFiles {
  const jres = JSON.parse(files['tilemap.g.jres'])
  jres['Lantern Cove1'].data = btoa(edit(atob(jres['Lantern Cove1'].data)))
  return { ...files, 'tilemap.g.jres': JSON.stringify(jres, null, 4) }
}

/** Change the first terrain byte's low nibble: a painted tile, still a valid map. */
const flipTile = (hex: string) => hex.slice(0, 10) + (hex[10] === '0' ? '1' : '0') + hex.slice(11)
/** Change the LAST nibble: the wall layer's tail, same length. */
const flipWall = (hex: string) => hex.slice(0, -1) + (hex.endsWith('0') ? '1' : '0')

/** The measured stock layout of the three starter blocks. */
const MEASURED_POSITIONS: Record<string, [number, number]> = {
  'pxt-on-start': [0, 0],
  spritesoverlap: [0, 947],
  function_definition: [0, 1426],
}

/** What the released editor controller was measured to do to the prepared starter. */
function measuredStockTrip(files: BuildStudioSourceFiles): BuildStudioSourceFiles {
  const blocks = files['main.blocks'].replace(
    /<block type="(pxt-on-start|spritesoverlap|function_definition)" x="-?\d+" y="-?\d+">/g,
    (_tag, type: string) => `<block type="${type}" x="${MEASURED_POSITIONS[type][0]}" y="${MEASURED_POSITIONS[type][1]}">`,
  )
  return { ...files, 'main.blocks': blocks, 'pxt.json': `${files['pxt.json']}\n` }
}

/** Broader churn an ongoing version may carry. Credit forgives it; the pristine proof must not. */
function ongoingTrip(files: BuildStudioSourceFiles): BuildStudioSourceFiles {
  const parsed = JSON.parse(files['pxt.json']) as Record<string, unknown>
  const reversed = Object.fromEntries(
    Object.entries({ ...parsed, description: 'Rewritten by the editor', targetVersion: '9.9.9' }).reverse(),
  )
  return {
    ...files,
    'main.blocks': files['main.blocks']
      .replace(/ (x|y)="-?\d+"/g, '')
      .replace(/ id="[^"]*"/g, '')
      .replace(/></g, '>\n  <'),
    'pxt.json': JSON.stringify(reversed, null, 2),
    'tilemap.g.jres': JSON.stringify(JSON.parse(files['tilemap.g.jres'])),
  }
}

const statusOf = (files: BuildStudioSourceFiles, file: string) =>
  compareLanternCoveToStarter(files, starter()).files.find((f) => f.file === file)?.status

describe('the starter, per file', () => {
  it('is the starter: every file identical', () => {
    const report = compareLanternCoveToStarter(starter(), starter())
    expect(report.matches).toBe(true)
    expect(report.files.map((f) => f.status)).toEqual(['identical', 'identical', 'identical', 'identical', 'identical'])
    expect(lanternCoveStarterLooksCorrect(starter())).toBe(true)
    expect(lanternCoveStarterProblem(starter())).toBeNull()
  })

  it('the staged Blocks carry exactly the three stock-form positioned tags the normalisation names', () => {
    const base = starter()
    expect(withoutStarterBlockPositions(base['main.blocks']).positioned).toBe(3)
    // Positioned tags are all there are: nothing else in the file carries an x= attribute.
    expect((base['main.blocks'].match(/\bx="/g) ?? []).length).toBe(3)
  })

  it('accepts the measured stock round trip: pxt.json plus one LF and three block positions, nothing else', () => {
    const base = starter()
    const altered = measuredStockTrip(base)
    // Controls: the alterations are real, and are exactly the measured ones.
    expect(altered['main.blocks']).not.toBe(base['main.blocks'])
    expect(altered['pxt.json']).toBe(`${base['pxt.json']}\n`)
    expect(altered['main.blocks']).toContain('<block type="spritesoverlap" x="0" y="947">')
    expect(altered['main.blocks']).toContain('<block type="function_definition" x="0" y="1426">')
    expect(altered['main.blocks']).toContain('<block type="pxt-on-start" x="0" y="0">')
    expect(withoutStarterBlockPositions(altered['main.blocks']).text).toBe(
      withoutStarterBlockPositions(base['main.blocks']).text,
    )

    const report = compareLanternCoveToStarter(altered, base)
    expect(report.matches).toBe(true)
    expect(report.files.map((f) => `${f.file}:${f.status}`)).toEqual([
      'pxt.json:equivalent',
      'main.blocks:equivalent',
      'main.ts:identical',
      'tilemap.g.jres:identical',
      'tilemap.g.ts:identical',
    ])
    expect(lanternCoveStarterLooksCorrect(altered)).toBe(true)
    expect(lanternCoveStarterProblem(altered)).toBeNull()
  })

  it('accepts a decimal position in the stock tag form, because that cannot touch literal content', () => {
    const base = starter()
    const moved = {
      ...base,
      'main.blocks': base['main.blocks'].replace('<block type="pxt-on-start" x="20" y="20">', '<block type="pxt-on-start" x="-3.5" y="12.25">'),
    }
    expect(moved['main.blocks']).not.toBe(base['main.blocks'])
    expect(statusOf(moved, 'main.blocks')).toBe('equivalent')
  })

  it('ignores the editor’s named scratch and _-private keys, and only those', () => {
    const base = measuredStockTrip(starter())
    const scratch = { ...base, '.simstate.json': '{"S/#run":"1"}', _history: '{"entries":[]}' }
    expect(compareLanternCoveToStarter(scratch, starter()).matches).toBe(true)
    expect(lanternCoveStarterLooksCorrect(scratch)).toBe(true)
  })

  it.each(['extra.ts', 'images.g.ts', 'main.blocks.bak', 'assets.json', 'README.md'])(
    'refuses any other extra ordinary file (%s) by its own name',
    (name) => {
      const withExtra = { ...starter(), [name]: 'x' }
      const report = compareLanternCoveToStarter(withExtra, starter())
      expect(report.matches).toBe(false)
      expect(report.files.find((f) => f.file === name)?.status).toBe('different')
      expect(lanternCoveStarterProblem(withExtra)).toBe(`${name}:different`)
      expect(lanternCoveStarterLooksCorrect(withExtra)).toBe(false)
    },
  )

  it('a separately changed main.ts is not the starter, though every scaffold check still passes', () => {
    const base = starter()
    const changed = { ...base, 'main.ts': `${base['main.ts']}\n// edited` }
    expect(lanternCoveArchiveComplete(changed)).toBe(true)
    expect(lanternCoveStarterLooksCorrect(changed)).toBe(false)
    expect(lanternCoveStarterProblem(changed)).toBe('main.ts:different')
    // …and the report says where, for the raw-copy preflight.
    expect(compareLanternCoveToStarter(changed, base).files.find((f) => f.file === 'main.ts')?.detail).toMatch(/^line \d+: col \d+:/)
  })

  it('a changed tilemap.g.ts is not the starter', () => {
    const base = starter()
    const changed = { ...base, 'tilemap.g.ts': `${base['tilemap.g.ts']}\n// x` }
    expect(lanternCoveArchiveComplete(changed)).toBe(true)
    expect(lanternCoveStarterProblem(changed)).toBe('tilemap.g.ts:different')
  })

  it('an altered Blocks value is caught even though the on-start scaffold is intact', () => {
    const base = starter()
    const altered = {
      ...base,
      'main.blocks': base['main.blocks'].replace(
        /(<field name="[^"]*">)(\d+)(<\/field>)/,
        (_m, open: string, _n: string, close: string) => `${open}99${close}`,
      ),
    }
    expect(altered['main.blocks']).not.toBe(base['main.blocks']) // the starter has a numeric field
    expect(lanternCoveArchiveComplete(altered)).toBe(true)
    expect(lanternCoveStarterLooksCorrect(altered)).toBe(false)
    expect(lanternCoveStarterProblem(altered)).toBe('main.blocks:different')
    // …and the same change riding along with the measured positions is still caught.
    expect(lanternCoveStarterProblem(measuredStockTrip(altered))).toBe('main.blocks:different')
  })

  it('a different Blocks variable id is caught, even beside the measured positions', () => {
    const base = starter()
    const renamed = {
      ...base,
      'main.blocks': base['main.blocks'].replace(/(<field name="VAR" id=")[^"]+(">hero<\/field>)/, '$1some-other-id$2'),
    }
    expect(renamed['main.blocks']).not.toBe(base['main.blocks'])
    expect(lanternCoveArchiveComplete(renamed)).toBe(true)
    expect(lanternCoveStarterProblem(renamed)).toBe('main.blocks:different')
    expect(lanternCoveStarterProblem(measuredStockTrip(renamed))).toBe('main.blocks:different')
  })

  it('does not infer equivalence: an entity spelling of the same value, or re-spaced markup, is a difference', () => {
    const base = starter()
    const entity = {
      ...base,
      'main.blocks': base['main.blocks'].replace('<field name="NUM">60</field>', '<field name="NUM">&#54;0</field>'),
    }
    expect(entity['main.blocks']).not.toBe(base['main.blocks'])
    expect(lanternCoveStarterProblem(entity)).toBe('main.blocks:different')

    const respaced = { ...base, 'main.blocks': base['main.blocks'].replace('><', '>\n<') }
    expect(respaced['main.blocks']).not.toBe(base['main.blocks'])
    expect(lanternCoveStarterProblem(respaced)).toBe('main.blocks:different')
  })

  it('only the stock tag form is normalised: a lost position, a swapped order or another block type is a difference', () => {
    const base = starter()
    const edit = (from: string, to: string) => {
      const next = { ...base, 'main.blocks': base['main.blocks'].replace(from, to) }
      expect(next['main.blocks']).not.toBe(base['main.blocks'])
      return next
    }
    expect(lanternCoveStarterProblem(edit('<block type="spritesoverlap" x="20" y="967">', '<block type="spritesoverlap">'))).toBe(
      'main.blocks:different',
    )
    expect(
      lanternCoveStarterProblem(edit('<block type="spritesoverlap" x="20" y="967">', '<block type="spritesoverlap" y="967" x="20">')),
    ).toBe('main.blocks:different')
    expect(
      lanternCoveStarterProblem(edit('<block type="spritesoverlap" x="20" y="967">', '<block type="spritesoverlap" x="20" y="967" id="q">')),
    ).toBe('main.blocks:different')
    // A block of a type that is NOT one of the three gaining a position.
    expect(lanternCoveStarterProblem(edit('<block type="game_control_sprite">', '<block type="game_control_sprite" x="1" y="2">'))).toBe(
      'main.blocks:different',
    )
  })

  it('an extra block stack (a changed rule) is caught', () => {
    const base = starter()
    const extra = {
      ...base,
      'main.blocks': base['main.blocks'].replace(
        '</xml>',
        '<block type="variables_set"><field name="VAR">x</field></block></xml>',
      ),
    }
    expect(extra['main.blocks']).not.toBe(base['main.blocks'])
    expect(lanternCoveStarterProblem(extra)).toBe('main.blocks:different')
  })

  it('a changed dependency version, or any other manifest byte, is caught', () => {
    const base = starter()
    const edit = (from: string, to: string) => {
      const next = { ...base, 'pxt.json': base['pxt.json'].replace(from, to) }
      expect(next['pxt.json']).not.toBe(base['pxt.json'])
      return next
    }
    const version = edit('"device": "*"', '"device": "pkg:1.2.3"')
    expect(lanternCoveArchiveComplete(version)).toBe(true)
    expect(lanternCoveStarterProblem(version)).toBe('pxt.json:different')
    expect(lanternCoveStarterProblem(measuredStockTrip(version))).toBe('pxt.json:different')
    expect(lanternCoveStarterProblem(edit('Walk around', 'Stroll around'))).toBe('pxt.json:different')
    expect(lanternCoveStarterProblem(edit('"blocksprj"', '"asmprj"'))).toBe('pxt.json:different')
  })

  it('only ONE trailing LF is forgiven on pxt.json', () => {
    const base = starter()
    for (const suffix of ['\n\n', '\r\n', ' ', ' \n']) {
      const next = { ...base, 'pxt.json': `${base['pxt.json']}${suffix}` }
      expect(statusOf(next, 'pxt.json'), JSON.stringify(suffix)).toBe('different')
    }
    expect(statusOf({ ...base, 'pxt.json': `\n${base['pxt.json']}` }, 'pxt.json')).toBe('different')
    expect(statusOf({ ...base, 'pxt.json': `${base['pxt.json']}\n` }, 'pxt.json')).toBe('equivalent')
  })

  it('refuses the broader ongoing-version churn: it is not what the stock round trip was measured to do', () => {
    const base = starter()
    const churned = ongoingTrip(base)
    // Controls: the churn is real.
    expect(churned['main.blocks']).not.toBe(base['main.blocks'])
    expect(churned['pxt.json']).not.toBe(base['pxt.json'])
    expect(churned['tilemap.g.jres']).not.toBe(base['tilemap.g.jres'])
    expect(statusOf(churned, 'main.blocks')).toBe('different')
    expect(statusOf(churned, 'pxt.json')).toBe('different')
    expect(statusOf(churned, 'tilemap.g.jres')).toBe('different')
    expect(lanternCoveStarterLooksCorrect(churned)).toBe(false)
  })

  it('a map is compared as bytes: a reformatted-but-equal JSON, a painted tile and a wall mark are all differences', () => {
    const base = starter()
    const reformatted = { ...base, 'tilemap.g.jres': JSON.stringify(JSON.parse(base['tilemap.g.jres'])) }
    expect(reformatted['tilemap.g.jres']).not.toBe(base['tilemap.g.jres'])
    expect(lanternCoveStarterProblem(reformatted)).toBe('tilemap.g.jres:different')

    const painted = withMap(base, flipTile)
    expect(lanternCoveArchiveComplete(painted)).toBe(true)
    expect(lanternCoveStarterLooksCorrect(painted)).toBe(false)
    expect(lanternCoveStarterProblem(painted)).toBe('tilemap.g.jres:different')

    const wallMark = withMap(base, flipWall)
    expect(lanternCoveArchiveComplete(wallMark)).toBe(true)
    expect(lanternCoveStarterProblem(wallMark)).toBe('tilemap.g.jres:different')

    const truncated = withMap(base, (hex) => hex.slice(0, hex.length - 4))
    expect(lanternCoveArchiveComplete(truncated)).toBe(false)
    expect(lanternCoveStarterLooksCorrect(truncated)).toBe(false)
  })

  it('a missing or malformed file names itself', () => {
    const base = starter()
    expect(lanternCoveStarterProblem(without(base, 'tilemap.g.ts'))).toBe('tilemap.g.ts:missing')
    expect(lanternCoveStarterProblem({ ...base, 'main.blocks': '' })).toBe('main.blocks:missing')
    expect(lanternCoveStarterProblem({ ...base, 'main.blocks': '<xml><block' })).toBe('main.blocks:different')
    expect(lanternCoveStarterLooksCorrect(without(base, 'tilemap.g.jres'))).toBe(false)
  })

  it('a child’s EDITED game is still a complete archive: the starter check is for the starter only', () => {
    const base = starter()
    const edited = { ...base, 'main.ts': base['main.ts'].replace('tiles.getTileLocation(1, 1)', 'tiles.getTileLocation(3, 2)') }
    expect(lanternCoveArchiveComplete(edited)).toBe(true)
    expect(lanternCoveStarterLooksCorrect(edited)).toBe(false)
  })
})

describe('the credit manifest', () => {
  it('is its name, file set, dependencies WITH their versions, and non-metadata keys', () => {
    const base = JSON.stringify({ name: 'A', files: ['b', 'a'], dependencies: { device: '*' }, description: 'x' })
    const sameMeaning = JSON.stringify({ description: 'y', targetVersion: '1', dependencies: { device: '*' }, files: ['a', 'b'], name: 'A' })
    expect(creditManifest(base)).toBe(creditManifest(sameMeaning))
    expect(creditManifest(base)).not.toBe(creditManifest(base.replace('"a"', '"c"')))
    expect(creditManifest(base)).not.toBe(creditManifest(base.replace('"device"', '"other"')))
    // Versions are values, and values are compared.
    expect(creditManifest(base)).not.toBe(creditManifest(base.replace('"*"', '"pkg:1"')))
    expect(creditManifest(base)).not.toBe(creditManifest(base.replace('"name":"A"', '"name":"B"')))
    expect(creditManifest(base)).not.toBe(creditManifest(JSON.stringify({ ...JSON.parse(base), extra: 1 })))
    expect(creditManifest('{')).toBeNull()
    expect(creditManifest('[]')).toBeNull()
  })
})

describe('the credit signature', () => {
  const sig = (files: BuildStudioSourceFiles) => lanternCoveCreditSignature(files)

  it('an unchanged round trip has the SAME signature — measured, or the broader ongoing churn', () => {
    const base = starter()
    expect(sig(base)).not.toBeNull()
    expect(sig(measuredStockTrip(base))).toBe(sig(base))
    expect(sig(ongoingTrip(base))).toBe(sig(base))
  })

  it('stays equal across editor scratch, which is not the work', () => {
    const base = starter()
    expect(sig({ ...base, '.simstate.json': '{}', _history: 'x' })).toBe(sig(base))
  })

  it('a code line, a painted tile and a wall mark each change it', () => {
    const base = starter()
    const baseline = sig(base)
    expect(sig({ ...base, 'main.ts': `${base['main.ts']}\ninfo.changeScoreBy(1)` })).not.toBe(baseline)
    expect(sig(withMap(base, flipTile))).not.toBe(baseline)
    expect(sig(withMap(base, flipWall))).not.toBe(baseline)
    expect(sig({ ...base, 'tilemap.g.ts': `${base['tilemap.g.ts']}\n// x` })).not.toBe(baseline)
  })

  it('a dependency version changes it; manifest UI metadata does not', () => {
    const base = starter()
    const baseline = sig(base)
    const versioned = { ...base, 'pxt.json': base['pxt.json'].replace('"device": "*"', '"device": "pkg:1.2.3"') }
    expect(versioned['pxt.json']).not.toBe(base['pxt.json'])
    expect(sig(versioned)).not.toBe(baseline)
    const metadata = {
      ...base,
      'pxt.json': JSON.stringify({ ...JSON.parse(base['pxt.json']), description: 'rewritten', targetVersion: '9.9.9', preferredEditor: 'tsprj' }),
    }
    expect(sig(metadata)).toBe(baseline)
  })

  it('a Blocks-only difference does not count — real block edits arrive as a different main.ts', () => {
    const base = starter()
    const blocksOnly = { ...base, 'main.blocks': base['main.blocks'].replace('</xml>', '<block type="variables_set"/></xml>') }
    expect(sig(blocksOnly)).toBe(sig(base))
  })

  it('a source file the manifest declares counts; one it does not declare is not part of the project', () => {
    const base = starter()
    const manifest = JSON.parse(base['pxt.json']) as { files: string[] }
    const declared = {
      ...base,
      'pxt.json': JSON.stringify({ ...manifest, files: [...manifest.files, 'extra.ts'] }),
      'extra.ts': 'let n = 1',
    }
    expect(sig(declared)).not.toBe(sig(base))
    expect(sig({ ...base, 'stray.ts': 'let n = 1' })).toBe(sig(base))
    expect(sig({ ...base, '.simstate.json': '{}' })).toBe(sig(base))
  })

  it('is null for an unreadable manifest or map, so a broken archive cannot equal anything', () => {
    const base = starter()
    expect(sig({ ...base, 'pxt.json': '{' })).toBeNull()
    expect(sig({ ...base, 'tilemap.g.jres': '{' })).toBeNull()
    expect(sig(without(base, 'pxt.json'))).toBeNull()
  })
})
