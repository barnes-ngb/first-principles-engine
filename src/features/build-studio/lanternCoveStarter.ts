/**
 * The Lantern Cove starter: a second prepared, ADULT-AUTHORED Arcade game
 * (FEAT-247).
 *
 * ── What it is ─────────────────────────────────────────────────────────────
 *
 * A small walk-around game on a native MakeCode tilemap: find five treasures,
 * raise the camp flag. It is a *prepared starter* wherever a person reads it,
 * never presented as the child's own work.
 *
 * ── The bytes are staged, not retyped ──────────────────────────────────────
 *
 * The five files live in `starters/lantern-cove/` exactly as they were tested.
 * `main.ts.txt` and `tilemap.g.ts.txt` carry a `.txt` suffix only so the
 * TypeScript compiler and ESLint do not treat generated MakeCode output as app
 * source; they are returned to MakeCode as `main.ts` and `tilemap.g.ts`. Every
 * file is read as RAW text and handed over untouched — no newline rewriting, no
 * trailing-space repair (unlike the Apple Dash Blocks, which needed one). A
 * `.gitattributes` beside them pins `-text` so a Windows checkout cannot change
 * what the editor is handed.
 *
 * ── Two different questions, kept apart ────────────────────────────────────
 *
 * {@link lanternCoveArchiveProblem} asks whether a source is a COMPLETE native
 * Lantern Cove archive. It runs on everything that is about to be trusted as the
 * child's game — the latest save the bridge accepts, a saved version about to be
 * opened, a recovery file about to replace a visit — and it deliberately permits
 * real changes to the Blocks, the code and the map: the app does not get to
 * decide what his game may become. What it refuses is a source that has LOST
 * part of itself, because the released bridge's minimum check (`main.ts` and
 * `pxt.json`) accepts a capture with no map at all, and a save of that would
 * quietly replace a cove with a game that cannot start.
 *
 * {@link lanternCoveStarterLooksCorrect} asks whether the STARTER arrived. It is
 * stricter, and it runs exactly once per starter visit, before anything is
 * touched, for the same reason `starterImportLooksCorrect` does. It keeps the
 * scaffold checks below AND compares all five returned sources with the staged
 * starter (`lanternCoveFidelity.ts`), forgiving only the differences stock
 * MakeCode's own serialisation produces — so a separately changed `main.ts`, an
 * altered Blocks value, rule or asset, or a corrupt map or wall layer closes the
 * controls even though the scaffold survived.
 *
 * {@link lanternCoveArchiveComplete} never compares bytes with the staged files: a
 * child's edit is the whole point, so a reopened save, a recovery file and a
 * capture are judged for completeness alone.
 */

import type { BuildStudioSourceFiles } from '../../core/types/buildStudio'
import { compareLanternCoveToStarter } from './lanternCoveFidelity'
import STARTER_BLOCKS from './starters/lantern-cove/main.blocks?raw'
import STARTER_MAIN_TS from './starters/lantern-cove/main.ts.txt?raw'
import STARTER_PXT_JSON from './starters/lantern-cove/pxt.json?raw'
import STARTER_TILEMAP_JRES from './starters/lantern-cove/tilemap.g.jres?raw'
import STARTER_TILEMAP_TS from './starters/lantern-cove/tilemap.g.ts.txt?raw'

/** The project this game's versions are stored under. Path-safe, no `__`. */
export const LANTERN_COVE_PROJECT_ID = 'lantern-cove-starter'

/** The MakeCode manifest name, and so the editor header name the bridge binds on. */
export const LANTERN_COVE_PROJECT_NAME = 'Lantern Cove'

/** The five files a complete native Lantern Cove project always carries. */
export const LANTERN_COVE_REQUIRED_FILES: readonly string[] = [
  'pxt.json',
  'main.blocks',
  'main.ts',
  'tilemap.g.jres',
  'tilemap.g.ts',
]

/** The staged starter, as the file map the editor takes. A fresh object each call. */
export function lanternCoveStarterFiles(): BuildStudioSourceFiles {
  return {
    'pxt.json': STARTER_PXT_JSON,
    'main.blocks': STARTER_BLOCKS,
    'main.ts': STARTER_MAIN_TS,
    'tilemap.g.jres': STARTER_TILEMAP_JRES,
    'tilemap.g.ts': STARTER_TILEMAP_TS,
  }
}

/** What the page says while the starter is open. Neutral about who wrote it. */
export const LANTERN_COVE_STARTER_LINE =
  'This is a prepared starter game. Walk around the cove, find the treasures and raise the flag — then change it however you like. Every save keeps the one before it.'

/**
 * The first thing to try. A suggestion, never a requirement: nothing is scored,
 * checked or recorded about whether it was done.
 */
export const LANTERN_COVE_FIRST_EDIT_PROMPT =
  'Try this first: move your hero’s starting spot. Find the block that puts the hero on a tile, change its numbers, then tap Play it.'

/** Said when the starter did not arrive whole. The ORIGINAL starter, named as such. */
export const LANTERN_COVE_STARTER_NOT_READY =
  'The Lantern Cove starter did not open properly, so saving is turned off. Nothing is lost — your saved games are still on your shelf. Reload Build Studio to try again.'

/** Said when a saved or opened game is missing part of itself. */
export const LANTERN_COVE_ARCHIVE_INCOMPLETE =
  'That Lantern Cove game is missing part of its map or blocks, so it was not opened and nothing was changed. It is still on your shelf.'

// ── Parsing helpers ──────────────────────────────────────────────────────────

function isNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** The Blocks XML, STRICTLY parsed. `null` for anything not well-formed. */
function parseBlocksRoot(mainBlocks: string): Element | null {
  if (typeof DOMParser === 'undefined') return null
  let parsed: Document
  try {
    parsed = new DOMParser().parseFromString(mainBlocks, 'text/xml')
  } catch {
    return null
  }
  if (parsed.getElementsByTagName('parsererror').length > 0) return null
  const root = parsed.documentElement
  return root && root.tagName === 'xml' ? root : null
}

const TILEMAP_MIME = 'application/mkcd-tilemap'

interface TilemapEntry {
  id: string
  data: unknown
  tileset: unknown
}

/** Every native tilemap in a parsed `tilemap.g.jres`. */
function tilemapEntries(jres: Record<string, unknown>): TilemapEntry[] {
  const found: TilemapEntry[] = []
  for (const [key, value] of Object.entries(jres)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = value as Record<string, unknown>
    if (entry.mimeType !== TILEMAP_MIME) continue
    found.push({ id: typeof entry.id === 'string' ? entry.id : key, data: entry.data, tileset: entry.tileset })
  }
  return found
}

/**
 * Does this tilemap `data` hold a map?
 *
 * The field is base64 of the ASCII hex of the map's buffer: a version byte, the
 * width and the height as little-endian 16-bit numbers, then one tile id per
 * cell (and the wall layer after it). This checks the header and that the tile
 * layer AND the wall bitmap are all there — a truncated or emptied map is the
 * "missing tile data" failure — and deliberately NOT the wall layer's own
 * contents, which are the editor's business and not worth refusing a child's
 * game over.
 */
function tilemapDataLooksUsable(data: unknown): boolean {
  if (!isNonBlank(data)) return false
  let hex: string
  try {
    hex = atob(data)
  } catch {
    return false
  }
  if (hex.length < 10 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return false
  const byteAt = (index: number) => parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  const width = byteAt(1) | (byteAt(2) << 8)
  const height = byteAt(3) | (byteAt(4) << 8)
  if (width < 1 || height < 1) return false
  // 5-byte header, one terrain byte per cell, then the 4bpp wall bitmap
  // (ceil(cells / 2) bytes). MakeCode reads a missing wall tail as zero bits
  // without complaint, so a truncation that keeps every terrain byte but loses
  // the wall plane must be refused here.
  const cells = width * height
  return hex.length / 2 >= 5 + cells + Math.ceil(cells / 2)
}

/**
 * Why this is NOT a complete native Lantern Cove archive — or `null` when it is.
 *
 * The reason is a short stable string for tests and diagnostics; it is never
 * shown to a child. Everything is read from the source itself, nothing is
 * compared with the staged bytes, and every real edit (a block, a line of code,
 * a painted tile, a new map) still passes.
 */
export function lanternCoveArchiveProblem(files: BuildStudioSourceFiles): string | null {
  for (const name of LANTERN_COVE_REQUIRED_FILES) {
    if (!isNonBlank(files[name])) return `missing-or-blank:${name}`
  }

  // ── The manifest: this project, and every text asset it declares ─────────
  const manifest = parseJsonObject(files['pxt.json'])
  if (!manifest) return 'manifest-unreadable'
  if (manifest.name !== LANTERN_COVE_PROJECT_NAME) return 'manifest-wrong-project'
  const declared = manifest.files
  if (!Array.isArray(declared) || declared.length === 0) return 'manifest-no-files'
  for (const entry of declared) {
    if (typeof entry !== 'string' || !entry) return 'manifest-bad-file-entry'
    if (typeof files[entry] !== 'string') return `declared-file-missing:${entry}`
  }
  // The manifest must also LIST the four other required files: a physical map
  // pair the manifest omits is not part of the project MakeCode will load.
  for (const name of LANTERN_COVE_REQUIRED_FILES) {
    if (name === 'pxt.json') continue
    if (!declared.includes(name)) return `manifest-omits-file:${name}`
  }

  // ── The Blocks: well-formed, and actually holding blocks ─────────────────
  const blocksRoot = parseBlocksRoot(files['main.blocks'])
  if (!blocksRoot) return 'blocks-unreadable'
  if (blocksRoot.getElementsByTagName('block').length === 0) return 'blocks-empty'

  // ── The native map pair ──────────────────────────────────────────────────
  const jres = parseJsonObject(files['tilemap.g.jres'])
  if (!jres) return 'map-jres-unreadable'
  const maps = tilemapEntries(jres)
  if (maps.length === 0) return 'map-missing'
  const mapTs = files['tilemap.g.ts']
  if (!mapTs.includes('_registerFactory("tilemap"') || !mapTs.includes('createTilemap(')) {
    return 'map-ts-no-factory'
  }
  for (const map of maps) {
    if (!tilemapDataLooksUsable(map.data)) return `map-data-unusable:${map.id}`
    if (!Array.isArray(map.tileset) || map.tileset.length === 0) return `map-no-tileset:${map.id}`
    for (const ref of map.tileset) {
      if (typeof ref !== 'string') return `map-bad-tile-ref:${map.id}`
      const named = /^myTiles\.(.+)$/.exec(ref)
      if (named && !(named[1] in jres)) return `map-tile-missing:${named[1]}`
    }
    if (!mapTs.includes(JSON.stringify(map.id))) return `map-not-in-ts:${map.id}`
  }
  return null
}

/** Is this a complete native Lantern Cove archive? */
export function lanternCoveArchiveComplete(files: BuildStudioSourceFiles): boolean {
  return lanternCoveArchiveProblem(files) === null
}

// ── The starter's own scaffold, checked on the way in ──────────────────────

function blockTypesIn(parent: Element): string[] {
  return Array.from(parent.getElementsByTagName('block')).map(
    (block) => block.getAttribute('type') ?? '',
  )
}

const STARTER_ON_START_TYPES = [
  'set_current_tilemap',
  'spritescreate',
  'mapplaceontile',
  'game_control_sprite',
  'hudsetScore',
]

/**
 * Did the STARTER arrive correctly?
 *
 * Used once per starter visit, straight after the import and before the child
 * has touched anything — never on a save, a reopened version or a recovery, all
 * of which are judged by {@link lanternCoveArchiveComplete} alone. A complete
 * archive that has lost the game (no on-start, no treasure handler, no tile
 * placement) is not the starter that was staged.
 */
export function lanternCoveStarterLooksCorrect(files: BuildStudioSourceFiles): boolean {
  if (!lanternCoveArchiveComplete(files)) return false

  const root = parseBlocksRoot(files['main.blocks'])
  if (!root) return false
  const roots = Array.from(root.children).filter((child) => child.tagName === 'block')
  const typeOf = (block: Element) => block.getAttribute('type')
  const onStart = roots.filter((block) => typeOf(block) === 'pxt-on-start')
  if (onStart.length !== 1) return false
  if (!roots.some((block) => typeOf(block) === 'spritesoverlap')) return false
  if (!roots.some((block) => typeOf(block) === 'function_definition')) return false
  const inOnStart = blockTypesIn(onStart[0])
  if (!STARTER_ON_START_TYPES.every((type) => inOnStart.includes(type))) return false
  if (inOnStart.filter((type) => type === 'function_call').length < 5) return false

  const ts = files['main.ts']
  const needs: ReadonlyArray<readonly [RegExp, number]> = [
    [/\btiles\s*\.\s*setCurrentTilemap\s*\(/g, 1],
    [/\bsprites\s*\.\s*onOverlap\s*\(/g, 1],
    [/\binfo\s*\.\s*changeScoreBy\s*\(/g, 1],
    [/\bcontroller\s*\.\s*moveSprite\s*\(/g, 1],
    [/\btiles\s*\.\s*placeOnTile\s*\(/g, 2],
    // the definition and the five treasure calls
    [/\bplaceTreasure\s*\(/g, 6],
  ]
  if (!needs.every(([call, atLeast]) => (ts.match(call) ?? []).length >= atLeast)) return false

  const jres = parseJsonObject(files['tilemap.g.jres'])
  if (!jres) return false
  if (!tilemapEntries(jres).some((map) => map.id === 'Lantern Cove1')) return false

  // The scaffold above can survive a changed value, a changed rule, a swapped
  // asset or a corrupted map. The last word is the prepared starter itself,
  // compared file by file with only MakeCode's own re-serialisation forgiven.
  return lanternCoveStarterProblem(files) === null
}

/**
 * Why the returned sources are not the prepared starter — or `null` when all five
 * match it after only the known stock serialisation differences. The reason names
 * the first file that differs; it is for tests and diagnostics, never a child.
 */
export function lanternCoveStarterProblem(files: BuildStudioSourceFiles): string | null {
  const report = compareLanternCoveToStarter(files, lanternCoveStarterFiles())
  const bad = report.files.find((f) => f.status !== 'identical' && f.status !== 'equivalent')
  return bad ? `${bad.file}:${bad.status}` : null
}
