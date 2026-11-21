import { describe, expect, it } from 'vitest'

/**
 * Lantern Cove source fidelity and the credit signature (FEAT-247, slice 4).
 *
 * The bytes under test are the REAL staged starter. Each "stock" alteration below
 * stands for the KIND of re-serialisation observed (the normalised Blocks and
 * manifest differ after a stock import and capture; the code and map do not): Blocks
 * ids/positions/spacing, manifest metadata and key order, map JSON layout. They are
 * constructed here, not captured — the real set is for the raw-copy preflight to
 * confirm. Each "meaningful" one changes what the game is. A control line proves the
 * alteration really changed the text, so a staged-file edit that made one a no-op
 * fails here rather than weakening it.
 */

import type { BuildStudioSourceFiles } from '../../core/types/buildStudio'
import {
  canonicalBlocks,
  canonicalManifest,
  compareLanternCoveToStarter,
  lanternCoveCreditSignature,
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

/** Blocks as a stock round trip may leave them: no ids or positions, re-spaced. */
const stockBlocks = (xml: string) =>
  xml
    .replace(/ (x|y)="-?\d+"/g, '')
    .replace(/ id="[^"]*"/g, '')
    .replace(/></g, '>\n  <')

/** A manifest with rewritten metadata and reversed key order. */
function stockManifest(json: string): string {
  const parsed = JSON.parse(json) as Record<string, unknown>
  const reversed = Object.fromEntries(Object.entries({ ...parsed, description: 'Rewritten by the editor', targetVersion: '9.9.9' }).reverse())
  return JSON.stringify(reversed, null, 2)
}

/** What a stock import → capture round trip may do to an UNCHANGED cove. */
function stockRoundTrip(files: BuildStudioSourceFiles): BuildStudioSourceFiles {
  return {
    ...files,
    'main.blocks': stockBlocks(files['main.blocks']),
    'pxt.json': stockManifest(files['pxt.json']),
    'tilemap.g.jres': JSON.stringify(JSON.parse(files['tilemap.g.jres'])),
  }
}

describe('the starter, per file', () => {
  it('is the starter: every file identical', () => {
    const report = compareLanternCoveToStarter(starter(), starter())
    expect(report.matches).toBe(true)
    expect(report.files.map((f) => f.status)).toEqual(['identical', 'identical', 'identical', 'identical', 'identical'])
    expect(lanternCoveStarterLooksCorrect(starter())).toBe(true)
    expect(lanternCoveStarterProblem(starter())).toBeNull()
  })

  it('forgives only stock re-serialisation: Blocks spacing/ids/positions, manifest metadata and order, map JSON layout', () => {
    const base = starter()
    const altered = stockRoundTrip(base)
    // Controls: the alterations are real.
    expect(altered['main.blocks']).not.toBe(base['main.blocks'])
    expect(altered['pxt.json']).not.toBe(base['pxt.json'])

    const report = compareLanternCoveToStarter(altered, base)
    expect(report.matches).toBe(true)
    expect(report.files.find((f) => f.file === 'main.ts')?.status).toBe('identical')
    expect(report.files.find((f) => f.file === 'tilemap.g.ts')?.status).toBe('identical')
    expect(report.files.find((f) => f.file === 'main.blocks')?.status).toBe('equivalent')
    expect(report.files.find((f) => f.file === 'pxt.json')?.status).toBe('equivalent')
    expect(lanternCoveStarterLooksCorrect(altered)).toBe(true)
  })

  it('a separately changed main.ts is not the starter, though every scaffold check still passes', () => {
    const base = starter()
    const changed = { ...base, 'main.ts': `${base['main.ts']}\n// edited` }
    expect(lanternCoveArchiveComplete(changed)).toBe(true)
    expect(lanternCoveStarterLooksCorrect(changed)).toBe(false)
    expect(lanternCoveStarterProblem(changed)).toBe('main.ts:different')
    // …and the report says where, for the raw-copy preflight.
    expect(compareLanternCoveToStarter(changed, base).files.find((f) => f.file === 'main.ts')?.detail).toMatch(/^line \d+:/)
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

  it('a corrupt map is caught: a changed tile with a valid header, and a truncated wall layer', () => {
    const base = starter()
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

  it('a missing or unreadable file names itself', () => {
    const base = starter()
    expect(lanternCoveStarterProblem(without(base, 'tilemap.g.ts'))).toBe('tilemap.g.ts:missing')
    expect(lanternCoveStarterProblem({ ...base, 'main.blocks': '<xml><block' })).toBe('main.blocks:unreadable')
    expect(lanternCoveStarterLooksCorrect(without(base, 'tilemap.g.jres'))).toBe(false)
  })

  it('a child’s EDITED game is still a complete archive: the starter check is for the starter only', () => {
    const base = starter()
    const edited = { ...base, 'main.ts': base['main.ts'].replace('tiles.getTileLocation(1, 1)', 'tiles.getTileLocation(3, 2)') }
    expect(lanternCoveArchiveComplete(edited)).toBe(true)
  })
})

describe('the canonical forms', () => {
  it('Blocks ignore ids, positions, attribute order, whitespace and the order of top-level stacks — and nothing else', () => {
    const a = '<xml xmlns="x"><block type="t" id="1" x="5" y="6"><field name="N">3</field></block><block type="u" id="2"/></xml>'
    const b = '<xml>\n <block id="9" type="u"/>\n <block y="1" type="t" x="2" id="7"><field name="N">3</field></block>\n</xml>'
    expect(canonicalBlocks(a)).toBe(canonicalBlocks(b))
    expect(canonicalBlocks(a)).not.toBe(canonicalBlocks(a.replace('>3<', '>4<')))
    expect(canonicalBlocks('<xml><block></xml>')).toBeNull()
    expect(canonicalBlocks('<notxml/>')).toBeNull()
  })

  it('the manifest is its name, its file set and its extension set', () => {
    const base = JSON.stringify({ name: 'A', files: ['b', 'a'], dependencies: { device: '*' }, description: 'x' })
    const same = JSON.stringify({ description: 'y', dependencies: { device: 'pkg:1' }, files: ['a', 'b'], name: 'A' })
    expect(canonicalManifest(base)).toBe(canonicalManifest(same))
    expect(canonicalManifest(base)).not.toBe(canonicalManifest(base.replace('"a"', '"c"')))
    expect(canonicalManifest(base)).not.toBe(canonicalManifest(base.replace('"device"', '"other"')))
    expect(canonicalManifest('{')).toBeNull()
  })
})

describe('the credit signature', () => {
  const sig = (files: BuildStudioSourceFiles) => lanternCoveCreditSignature(files)

  it('an unchanged stock round trip has the SAME signature, so it can never be mistaken for a change', () => {
    const base = starter()
    expect(sig(base)).not.toBeNull()
    expect(sig(stockRoundTrip(base))).toBe(sig(base))
  })

  it('a code line, a painted tile and a wall mark each change it', () => {
    const base = starter()
    const baseline = sig(base)
    expect(sig({ ...base, 'main.ts': `${base['main.ts']}\ninfo.changeScoreBy(1)` })).not.toBe(baseline)
    expect(sig(withMap(base, flipTile))).not.toBe(baseline)
    expect(sig(withMap(base, flipWall))).not.toBe(baseline)
    expect(sig({ ...base, 'tilemap.g.ts': `${base['tilemap.g.ts']}\n// x` })).not.toBe(baseline)
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
