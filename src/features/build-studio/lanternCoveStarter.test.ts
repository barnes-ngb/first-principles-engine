import { describe, expect, it, vi } from 'vitest'

/**
 * Lantern Cove's source, its two readiness questions, the descriptor that wires
 * it in, and the shelf reads derived from the one open listener (FEAT-247).
 *
 * The bytes under test are the REAL staged files — nothing here retypes them —
 * so a change to a staged file that breaks "complete" or "the starter arrived"
 * fails here before it can reach a child.
 */

vi.mock('../../core/firebase/firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: () => ({ __col: 'buildStudioVersions' }),
}))

import {
  buildStudioSourceDigest,
  buildStudioVersionDocId,
  serializeBuildStudioSource,
  type BuildStudioSourceFiles,
  type BuildStudioVersion,
} from '../../core/types/buildStudio'
import {
  APPLE_DASH_GAME,
  EDITABLE_GAMES,
  LANTERN_COVE_GAME,
  savedVersionIsWhole,
} from './buildStudioGames'
import { allGamesVersionsRead, gameTitleForVersion, versionsReadForProject } from './buildStudioGameReads'
import { sourceSignature } from './buildStudioScope'
import { starterSourceFiles } from './buildStudioStarter'
import {
  LANTERN_COVE_PROJECT_ID,
  LANTERN_COVE_PROJECT_NAME,
  LANTERN_COVE_REQUIRED_FILES,
  lanternCoveArchiveComplete,
  lanternCoveArchiveProblem,
  lanternCoveStarterFiles,
  lanternCoveStarterLooksCorrect,
} from './lanternCoveStarter'
import { VersionsStatus, type BuildStudioVersionsRead } from './useBuildStudioVersions'

const starter = (): BuildStudioSourceFiles => lanternCoveStarterFiles()

/** The same files without one name — no destructuring, so no unused binding. */
const without = (files: BuildStudioSourceFiles, name: string): BuildStudioSourceFiles =>
  Object.fromEntries(Object.entries(files).filter(([key]) => key !== name))

/** The staged map with its `data` rewritten through `edit` (hex text in, hex text out). */
function withEditedMap(
  files: BuildStudioSourceFiles,
  edit: (hex: string) => string,
): BuildStudioSourceFiles {
  const jres = JSON.parse(files['tilemap.g.jres'])
  jres['Lantern Cove1'].data = btoa(edit(atob(jres['Lantern Cove1'].data)))
  return { ...files, 'tilemap.g.jres': JSON.stringify(jres, null, 4) }
}

describe('the staged source', () => {
  it('is exactly the five tested files, under the names MakeCode expects', () => {
    const files = starter()
    expect(Object.keys(files).sort()).toEqual([...LANTERN_COVE_REQUIRED_FILES].sort())
    expect(files['main.ts'].startsWith('namespace SpriteKind {')).toBe(true)
    expect(files['tilemap.g.ts'].startsWith('// Auto-generated code. Do not edit.')).toBe(true)
    expect(JSON.parse(files['pxt.json']).name).toBe(LANTERN_COVE_PROJECT_NAME)
  })

  it('carries no carriage return, so a Windows checkout cannot change what MakeCode is handed', () => {
    for (const [name, text] of Object.entries(starter())) {
      expect(text.includes('\r'), `${name} has a CR`).toBe(false)
    }
  })

  it('keeps the pixel-row trailing spaces the generator wrote (bytes are not "tidied")', () => {
    expect(starter()['main.ts']).toContain('e 5 5 5 5 5 5 . \n')
  })

  it('is a fresh object each call, so one visit cannot mutate the next one’s starter', () => {
    const a = starter()
    a['main.ts'] = 'changed'
    expect(starter()['main.ts']).not.toBe('changed')
  })

  it('uses a project id the writer and the doc id accept, with no id separator inside it', () => {
    expect(LANTERN_COVE_PROJECT_ID).toMatch(/^[A-Za-z0-9_-]{4,64}$/)
    expect(LANTERN_COVE_PROJECT_ID).not.toContain('__')
    expect(LANTERN_COVE_PROJECT_ID).not.toBe(APPLE_DASH_GAME.projectId)
  })
})

describe('a complete archive', () => {
  it('is what the staged starter is, and the starter check agrees', () => {
    expect(lanternCoveArchiveProblem(starter())).toBeNull()
    expect(lanternCoveArchiveComplete(starter())).toBe(true)
    expect(lanternCoveStarterLooksCorrect(starter())).toBe(true)
  })

  it('still accepts real edits to the code, the Blocks and the map', () => {
    const base = starter()
    const edits: Record<string, BuildStudioSourceFiles> = {
      'faster hero (code)': {
        ...base,
        'main.ts': base['main.ts'].replace('let walkSpeed = 60', 'let walkSpeed = 90'),
      },
      'faster hero (blocks)': {
        ...base,
        'main.blocks': base['main.blocks'].replace('<field name="NUM">60</field>', '<field name="NUM">90</field>'),
      },
      'hero starts somewhere else': {
        ...base,
        'main.ts': base['main.ts'].replace(
          'tiles.placeOnTile(hero, tiles.getTileLocation(1, 1))',
          'tiles.placeOnTile(hero, tiles.getTileLocation(2, 1))',
        ),
        'main.blocks': base['main.blocks'].replace(
          /(<field name="VAR" id="\^E~TybjUfz\?\(F\*\/kaWtJ">hero<\/field><\/block><\/value><value name="loc"><shadow type="mapgettile"><value name="col"><shadow type="math_number"><field name="NUM">)1/,
          '$12',
        ),
      },
      'a painted tile': withEditedMap(base, (hex) => hex.slice(0, 10) + '03' + hex.slice(12)),
      'an erased wall': withEditedMap(base, (hex) => hex.slice(0, -2) + '00'),
    }
    for (const [name, files] of Object.entries(edits)) {
      expect(lanternCoveArchiveProblem(files), name).toBeNull()
      expect(sourceSignature(files), `${name} reads as a real change`).not.toBe(sourceSignature(base))
    }
  })

  it('does not insist on editor scratch files, and tolerates extra declared assets that are present', () => {
    const base = starter()
    const manifest = JSON.parse(base['pxt.json'])
    manifest.files = [...manifest.files, 'assets.json']
    expect(
      lanternCoveArchiveProblem({
        ...base,
        'pxt.json': JSON.stringify(manifest),
        'assets.json': '{}',
        '.simstate.json': '{}',
        _history: 'x',
      }),
    ).toBeNull()
  })

  it.each<[string, (f: BuildStudioSourceFiles) => BuildStudioSourceFiles, string]>([
    ['no map pair at all (what the released minimum check lets through)', (f) => ({ 'pxt.json': f['pxt.json'], 'main.ts': f['main.ts'] }), 'missing-or-blank'],
    ['tilemap.g.jres removed', (f) => without(f, 'tilemap.g.jres'), 'missing-or-blank:tilemap.g.jres'],
    ['tilemap.g.ts removed', (f) => without(f, 'tilemap.g.ts'), 'missing-or-blank:tilemap.g.ts'],
    ['tilemap.g.ts blank', (f) => ({ ...f, 'tilemap.g.ts': '   \n' }), 'missing-or-blank:tilemap.g.ts'],
    ['main.blocks removed', (f) => without(f, 'main.blocks'), 'missing-or-blank:main.blocks'],
    ['tilemap.g.jres is not JSON', (f) => ({ ...f, 'tilemap.g.jres': '{ not json' }), 'map-jres-unreadable'],
    ['tilemap.g.jres is a list', (f) => ({ ...f, 'tilemap.g.jres': '[]' }), 'map-jres-unreadable'],
    ['no tilemap entry in the jres', (f) => ({ ...f, 'tilemap.g.jres': JSON.stringify({ '*': { mimeType: 'image/x-mkcd-f4' } }) }), 'map-missing'],
    ['tilemap data emptied', (f) => withEditedMap(f, () => ''), 'map-data-unusable'],
    ['tilemap data cut off after the header', (f) => withEditedMap(f, (hex) => hex.slice(0, 20)), 'map-data-unusable'],
    ['tilemap data not hex', (f) => withEditedMap(f, (hex) => 'zz' + hex.slice(2)), 'map-data-unusable'],
    ['tilemap data zero-sized', (f) => withEditedMap(f, (hex) => hex.slice(0, 2) + '0000' + hex.slice(6)), 'map-data-unusable'],
    [
      'tilemap data is not base64',
      (f) => {
        const jres = JSON.parse(f['tilemap.g.jres'])
        jres['Lantern Cove1'].data = '%%%not base64%%%'
        return { ...f, 'tilemap.g.jres': JSON.stringify(jres) }
      },
      'map-data-unusable',
    ],
    [
      'tileset names a tile that is gone',
      (f) => {
        const jres = JSON.parse(f['tilemap.g.jres'])
        delete jres.tile3
        return { ...f, 'tilemap.g.jres': JSON.stringify(jres) }
      },
      'map-tile-missing:tile3',
    ],
    [
      'tileset emptied',
      (f) => {
        const jres = JSON.parse(f['tilemap.g.jres'])
        jres['Lantern Cove1'].tileset = []
        return { ...f, 'tilemap.g.jres': JSON.stringify(jres) }
      },
      'map-no-tileset',
    ],
    ['tilemap.g.ts lost its factory', (f) => ({ ...f, 'tilemap.g.ts': '// Auto-generated code. Do not edit.\nnamespace myTiles {}\n' }), 'map-ts-no-factory'],
    [
      'the map in the jres is not in the ts',
      (f) => ({ ...f, 'tilemap.g.ts': f['tilemap.g.ts'].replaceAll('Lantern Cove1', 'Somewhere Else') }),
      'map-not-in-ts',
    ],
    ['the manifest is not JSON', (f) => ({ ...f, 'pxt.json': 'nope' }), 'manifest-unreadable'],
    ['the manifest names another project', (f) => ({ ...f, 'pxt.json': JSON.stringify({ ...JSON.parse(f['pxt.json']), name: 'Apple Dash starter' }) }), 'manifest-wrong-project'],
    ['the manifest declares no files', (f) => ({ ...f, 'pxt.json': JSON.stringify({ ...JSON.parse(f['pxt.json']), files: [] }) }), 'manifest-no-files'],
    [
      'the manifest declares a text asset that is not there',
      (f) => ({ ...f, 'pxt.json': JSON.stringify({ ...JSON.parse(f['pxt.json']), files: [...JSON.parse(f['pxt.json']).files, 'images.g.ts'] }) }),
      'declared-file-missing:images.g.ts',
    ],
    ['the Blocks are not well-formed XML', (f) => ({ ...f, 'main.blocks': f['main.blocks'] + '</block>' }), 'blocks-unreadable'],
    ['the Blocks are an empty workspace', (f) => ({ ...f, 'main.blocks': '<xml xmlns="https://developers.google.com/blockly/xml"></xml>' }), 'blocks-empty'],
  ])('is NOT complete: %s', (_name, mutate, expected) => {
    const problem = lanternCoveArchiveProblem(mutate(starter()))
    expect(problem).not.toBeNull()
    expect(problem as string).toContain(expected)
    expect(lanternCoveArchiveComplete(mutate(starter()))).toBe(false)
    expect(lanternCoveStarterLooksCorrect(mutate(starter()))).toBe(false)
  })

  it('is not an Apple Dash archive, and an Apple Dash starter is not this game', () => {
    expect(lanternCoveArchiveComplete(starterSourceFiles())).toBe(false)
    expect(lanternCoveStarterLooksCorrect(starterSourceFiles())).toBe(false)
    expect(APPLE_DASH_GAME.archiveComplete(starter())).toBe(true) // the released minimum, unchanged
  })
})

describe('the starter check is stricter than "complete", and only for the starter', () => {
  it('refuses a complete archive that has lost the game', () => {
    const base = starter()
    const noTreasureHandler = {
      ...base,
      'main.ts': base['main.ts'].replace('sprites.onOverlap(', 'sprites.onDestroyed('),
    }
    expect(lanternCoveArchiveComplete(noTreasureHandler)).toBe(true)
    expect(lanternCoveStarterLooksCorrect(noTreasureHandler)).toBe(false)

    const noOnStart = {
      ...base,
      'main.blocks': base['main.blocks'].replace('type="pxt-on-start"', 'type="some-other-root"'),
    }
    expect(lanternCoveArchiveComplete(noOnStart)).toBe(true)
    expect(lanternCoveStarterLooksCorrect(noOnStart)).toBe(false)
  })

  it('does not insist an EDITED game keeps the starter’s treasure count', () => {
    const base = starter()
    const fewer = { ...base, 'main.ts': base['main.ts'].replace('placeTreasure(6, 5)\n', '') }
    expect(lanternCoveArchiveComplete(fewer)).toBe(true)
  })
})

describe('the descriptors', () => {
  it('Apple Dash stays creditable and Lantern Cove does not', () => {
    expect(APPLE_DASH_GAME.creditEligible).toBe(true)
    expect(LANTERN_COVE_GAME.creditEligible).toBe(false)
  })

  it('Lantern Cove has no challenge, no reflection and no PNG fallback; Apple Dash keeps all three', () => {
    expect(LANTERN_COVE_GAME.hasChallenge).toBe(false)
    expect(LANTERN_COVE_GAME.hasReflection).toBe(false)
    expect(LANTERN_COVE_GAME.starterFallbackUrl).toBeNull()
    expect(APPLE_DASH_GAME.hasChallenge).toBe(true)
    expect(APPLE_DASH_GAME.hasReflection).toBe(true)
    expect(APPLE_DASH_GAME.starterFallbackUrl).toBe('/build-studio/apple-dash-starter.png')
  })

  it('only Lantern Cove enforces the whole-archive rule on the bridge; Apple Dash admission is unchanged', () => {
    expect(LANTERN_COVE_GAME.enforceCompleteCapture).toBe(true)
    expect(APPLE_DASH_GAME.enforceCompleteCapture).toBe(false)
  })

  it('Apple Dash’s starter is untouched', () => {
    expect(APPLE_DASH_GAME.starterFiles()).toEqual(starterSourceFiles())
    expect(APPLE_DASH_GAME.projectId).toBe('apple-dash-starter')
    expect(APPLE_DASH_GAME.projectName).toBe('Apple Dash starter')
  })

  it('every game binds the editor on its own manifest name', () => {
    for (const game of EDITABLE_GAMES) {
      expect(JSON.parse(game.starterFiles()['pxt.json']).name).toBe(game.projectName)
      expect(game.starterReady(game.starterFiles())).toBe(true)
    }
  })
})

describe('savedVersionIsWhole', () => {
  const version = (files: BuildStudioSourceFiles): BuildStudioVersion => {
    const sourceArchive = serializeBuildStudioSource(files)
    return {
      id: buildStudioVersionDocId('c1', LANTERN_COVE_PROJECT_ID, 'v-1'),
      childId: 'c1',
      projectId: LANTERN_COVE_PROJECT_ID,
      versionId: 'v-1',
      label: 'x',
      createdAt: '2026-11-20T10:00:00.000Z',
      sourceArchive,
      byteSize: sourceArchive.length,
      fileCount: Object.keys(files).length,
      sourceDigest: buildStudioSourceDigest(sourceArchive),
    }
  }

  it('opens an exact saved Lantern Cove, and refuses one that lost its map or will not parse', () => {
    expect(savedVersionIsWhole(LANTERN_COVE_GAME, version(starter()))).toBe(true)
    const mapless = without(starter(), 'tilemap.g.jres')
    expect(savedVersionIsWhole(LANTERN_COVE_GAME, version(mapless))).toBe(false)
    expect(
      savedVersionIsWhole(LANTERN_COVE_GAME, { ...version(starter()), sourceArchive: '{ not an archive' }),
    ).toBe(false)
  })

  it('never judges Apple Dash saves — every archive it ever stored still opens', () => {
    const old = version({ 'pxt.json': '{}', 'main.ts': 'let a = 1' })
    expect(savedVersionIsWhole(APPLE_DASH_GAME, old)).toBe(true)
    expect(savedVersionIsWhole(APPLE_DASH_GAME, { ...old, sourceArchive: 'garbage' })).toBe(true)
  })
})

describe('one listener, many shelves', () => {
  const row = (projectId: string, versionId: string, createdAt: string): BuildStudioVersion => ({
    id: buildStudioVersionDocId('c1', projectId, versionId),
    childId: 'c1',
    projectId,
    versionId,
    label: `${projectId}/${versionId}`,
    createdAt,
    sourceArchive: '{}',
    byteSize: 2,
    fileCount: 1,
    sourceDigest: 'd',
  })
  const apple = row('apple-dash-starter', 'v-a', '2026-11-20T10:00:00.000Z')
  const cove = row(LANTERN_COVE_PROJECT_ID, 'v-c', '2026-11-20T11:00:00.000Z')
  const stray = row('some-other-game', 'v-z', '2026-11-20T12:00:00.000Z')

  const source = (status: BuildStudioVersionsRead['status']): BuildStudioVersionsRead => ({
    status,
    versions: status === VersionsStatus.Ready ? [apple] : [],
    childId: 'c1',
    projectId: 'apple-dash-starter',
    error: status === VersionsStatus.Failed ? 'boom' : null,
    retry: () => undefined,
    childRows: status === VersionsStatus.Ready ? [stray, cove, apple] : [],
  })

  it('derives Lantern Cove’s shelf from the rows already delivered', () => {
    const lantern = versionsReadForProject(source(VersionsStatus.Ready), LANTERN_COVE_PROJECT_ID)
    expect(lantern?.projectId).toBe(LANTERN_COVE_PROJECT_ID)
    expect(lantern?.versions.map((v) => v.versionId)).toEqual(['v-c'])
    // and the primary read is returned as it is
    const primary = source(VersionsStatus.Ready)
    expect(versionsReadForProject(primary, 'apple-dash-starter')).toBe(primary)
  })

  it('keeps a failed read failed and an unsettled one unsettled — never an empty shelf', () => {
    expect(versionsReadForProject(source(VersionsStatus.Failed), LANTERN_COVE_PROJECT_ID)?.status).toBe('failed')
    expect(versionsReadForProject(source(VersionsStatus.Loading), LANTERN_COVE_PROJECT_ID)?.status).toBe('loading')
  })

  it('cannot speak for a project a read with no rows knows nothing about', () => {
    const legacy: BuildStudioVersionsRead = { ...source(VersionsStatus.Ready), childRows: undefined }
    expect(versionsReadForProject(legacy, LANTERN_COVE_PROJECT_ID)).toBeUndefined()
  })

  it('refuses a row whose id says another child or project', () => {
    const forged = { ...cove, id: buildStudioVersionDocId('c2', LANTERN_COVE_PROJECT_ID, 'v-c') }
    const read = { ...source(VersionsStatus.Ready), childRows: [forged] }
    expect(versionsReadForProject(read, LANTERN_COVE_PROJECT_ID)?.versions).toEqual([])
  })

  it('gives the parent one shelf of every editable game, newest first, each row nameable', () => {
    const combined = allGamesVersionsRead(source(VersionsStatus.Ready))
    expect(combined.versions.map((v) => v.versionId)).toEqual(['v-c', 'v-a']) // the stray game is not listed
    expect(combined.versions.map(gameTitleForVersion)).toEqual(['Lantern Cove', 'Apple Dash'])
    expect(gameTitleForVersion(stray)).toBeNull()
  })

  it('leaves a failed or unsettled read exactly as it was for the parent too', () => {
    const failed = source(VersionsStatus.Failed)
    expect(allGamesVersionsRead(failed)).toBe(failed)
  })
})
