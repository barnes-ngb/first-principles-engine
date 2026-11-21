/**
 * Lantern Cove source fidelity (FEAT-247, slice 4).
 *
 * Two questions, answered here and nowhere else, over the five-file native
 * archive. They are kept APART on purpose: the first is a proof about one visit's
 * bytes and tolerates almost nothing; the second is a comparison between two of a
 * child's saves and tolerates the editor's ongoing metadata.
 *
 *   1. {@link compareLanternCoveToStarter} — "is this the prepared starter, after
 *      ONLY the differences stock MakeCode's own round trip was measured to
 *      produce?" Asked once per pristine visit (through
 *      `lanternCoveStarterLooksCorrect`) and by the local raw-copy preflight, which
 *      prints the per-file report so the exact differences can be inspected.
 *   2. {@link lanternCoveCreditSignature} — "what is the work in this archive?" The
 *      canonical form two saves are compared by for hours credit, so a stock
 *      import → capture round trip of an unchanged cove is never mistaken for a
 *      change, while a code line, a painted tile or a wall mark always is.
 *
 * ── The pristine proof: measured differences only ──────────────────────────
 *
 * The released editor controller's own import → capture round trip of the
 * prepared starter (stock controller HTML and all four script URLs, as Microsoft
 * served them) changed exactly this, and the proof forgives exactly this:
 *
 *   • `main.ts`, `tilemap.g.ts` and `tilemap.g.jres` came back byte-identical, so
 *     they are compared as exact strings. No newline repair, no JSON re-reading.
 *   • `pxt.json` gained ONE trailing LF; every value and dependency version was the
 *     same. So the returned manifest must equal the starter's bytes, or the
 *     starter's bytes plus a single `\n`. It is not parsed.
 *   • `main.blocks` changed only three layout attribute pairs: the x/y of the
 *     top-level `pxt-on-start`, `spritesoverlap` and `function_definition` blocks.
 *     Those three opening tags, in stock form (`<block type="…" x="N" y="N">`), are
 *     compared with the x/y removed — and the rest of the file is compared
 *     BYTE FOR BYTE. A different variable id, field value, rule order, namespace,
 *     entity or any other markup is a difference. There is deliberately no XML
 *     reading here: equivalence is never inferred, so a changed value cannot be
 *     argued into a match.
 *   • The set of ordinary files must be the prepared set. The editor's named
 *     scratch ({@link EDITOR_SCRATCH_FILES}) and `_`-private keys such as
 *     `_history` are outside the archive's meaning and are ignored; any other
 *     extra file is a difference.
 *
 * Well-formedness (a real `DOMParser`) is NOT asked here — this module has no DOM
 * so the same code runs under Node for the preflight. `lanternCoveStarterLooksCorrect`
 * runs `lanternCoveArchiveComplete` first, which does parse the Blocks with the
 * real parser, before this comparison is consulted.
 *
 * ── The credit signature: a separate, looser question ──────────────────────
 *
 * Reopened and ongoing saves are judged for completeness elsewhere; here two of
 * them are compared for WORK. {@link lanternCoveCreditSignature} reads the code and
 * the map (`main.ts`, the map's `.ts`, and the `.jres` by value — tiles AND wall
 * layer) plus the manifest's meaning ({@link creditManifest}: name, file set,
 * dependencies WITH their values, and every key not in
 * {@link MANIFEST_IGNORED_KEYS}). Nothing in the pristine proof is borrowed by it
 * and nothing in it loosens the proof.
 *
 * Pure and dependency-light on purpose (no DOM, no Vite `?raw` imports).
 */

import {
  buildStudioSourceKeys,
  EDITOR_PRIVATE_PREFIX,
  EDITOR_SCRATCH_FILES,
  type BuildStudioSourceFiles,
} from '../../core/types/buildStudio'

// ── The pristine proof ───────────────────────────────────────────────────────

/**
 * The three starter blocks whose x/y the stock round trip was measured to move,
 * matched only in the stock opening-tag form: `type` first, then numeric `x` and
 * `y`, then `>`. The tag shape cannot occur inside a field value or attribute —
 * a raw `<` is not legal there — so removing the position never touches literal
 * content, and a tag in any other form simply is not normalised.
 */
const STARTER_POSITIONED_BLOCK =
  /<block type="(pxt-on-start|spritesoverlap|function_definition)" x="-?\d+(?:\.\d+)?" y="-?\d+(?:\.\d+)?">/g

/** The Blocks text with those tags' x/y removed, and how many tags were so normalised. */
export function withoutStarterBlockPositions(blocks: string): { text: string; positioned: number } {
  let positioned = 0
  const text = blocks.replace(STARTER_POSITIONED_BLOCK, (_tag, type: string) => {
    positioned += 1
    return `<block type="${type}">`
  })
  return { text, positioned }
}

export type FidelityStatus = 'identical' | 'equivalent' | 'different' | 'missing'

export interface FidelityFileReport {
  file: string
  status: FidelityStatus
  /** Short, stable, for tests and the preflight. Never shown to a child. */
  detail: string
}

export interface FidelityReport {
  /** Every file is identical or equivalent, and no unexpected file came back. */
  matches: boolean
  files: FidelityFileReport[]
}

/**
 * The first place two strings differ: the line, the column and a window of text
 * around it from each side. (A Blocks file can be a single very long line, so the
 * window is centred on the difference rather than clipped from the start.)
 */
export function firstDifference(a: string, b: string): string {
  const x = a.split('\n')
  const y = b.split('\n')
  const length = Math.max(x.length, y.length)
  const window = (s: string | undefined, col: number) => {
    if (s === undefined) return '(no line)'
    const from = Math.max(0, col - 30)
    return `${from > 0 ? '…' : ''}${s.slice(from, col + 50)}${col + 50 < s.length ? '…' : ''}`
  }
  for (let i = 0; i < length; i += 1) {
    if (x[i] !== y[i]) {
      let col = 0
      const l = x[i] ?? ''
      const r = y[i] ?? ''
      while (col < l.length && col < r.length && l[col] === r[col]) col += 1
      return `line ${i + 1}: col ${col + 1}: returned ${JSON.stringify(window(x[i], col))} vs starter ${JSON.stringify(window(y[i], col))}`
    }
  }
  return 'same lines, different length'
}

function compareExact(file: string, returned: string | undefined, starter: string): FidelityFileReport {
  if (typeof returned !== 'string' || returned === '') return { file, status: 'missing', detail: 'not returned' }
  if (returned === starter) return { file, status: 'identical', detail: 'byte-identical' }
  return { file, status: 'different', detail: firstDifference(returned, starter) }
}

/** `pxt.json`: the starter's bytes, or the starter's bytes plus exactly one LF. */
function compareManifest(returned: string | undefined, starter: string): FidelityFileReport {
  const file = 'pxt.json'
  if (typeof returned !== 'string' || returned === '') return { file, status: 'missing', detail: 'not returned' }
  if (returned === starter) return { file, status: 'identical', detail: 'byte-identical' }
  if (returned === `${starter}\n`) {
    return { file, status: 'equivalent', detail: 'byte-identical plus one trailing LF' }
  }
  return { file, status: 'different', detail: firstDifference(returned, starter) }
}

/** `main.blocks`: byte-identical once the three stock block positions are removed. */
function compareBlocks(returned: string | undefined, starter: string): FidelityFileReport {
  const file = 'main.blocks'
  if (typeof returned !== 'string' || returned === '') return { file, status: 'missing', detail: 'not returned' }
  if (returned === starter) return { file, status: 'identical', detail: 'byte-identical' }
  const a = withoutStarterBlockPositions(returned)
  const b = withoutStarterBlockPositions(starter)
  // The same number of positioned tags on both sides: a stock tag that LOST its
  // position (or a fourth that gained one) is a structural difference, not layout.
  if (a.positioned === b.positioned && a.text === b.text) {
    return { file, status: 'equivalent', detail: `byte-identical except the x/y of ${a.positioned} starter block tags` }
  }
  if (a.positioned !== b.positioned) {
    return {
      file,
      status: 'different',
      detail: `${a.positioned} stock-positioned starter block tags returned vs ${b.positioned} in the starter`,
    }
  }
  return { file, status: 'different', detail: firstDifference(a.text, b.text) }
}

/** Names that belong to the archive: not the editor's scratch, not `_`-private. */
function ordinaryFileNames(files: BuildStudioSourceFiles): string[] {
  const scratch = new Set(EDITOR_SCRATCH_FILES)
  return Object.keys(files)
    .filter((name) => !name.startsWith(EDITOR_PRIVATE_PREFIX) && !scratch.has(name))
    .sort()
}

/**
 * Compare the returned sources with the prepared starter, per file.
 *
 * The five files are judged as the module header states. Then the SET of ordinary
 * files must be the prepared one: a file the starter does not have is a
 * difference, reported under its own name. Only the editor's named scratch and
 * `_`-private keys are ignored.
 */
export function compareLanternCoveToStarter(
  returned: BuildStudioSourceFiles,
  starter: BuildStudioSourceFiles,
): FidelityReport {
  const files: FidelityFileReport[] = [
    compareManifest(returned['pxt.json'], starter['pxt.json']),
    compareBlocks(returned['main.blocks'], starter['main.blocks']),
    compareExact('main.ts', returned['main.ts'], starter['main.ts']),
    compareExact('tilemap.g.jres', returned['tilemap.g.jres'], starter['tilemap.g.jres']),
    compareExact('tilemap.g.ts', returned['tilemap.g.ts'], starter['tilemap.g.ts']),
  ]
  const prepared = new Set(ordinaryFileNames(starter))
  for (const name of ordinaryFileNames(returned)) {
    if (!prepared.has(name)) {
      files.push({ file: name, status: 'different', detail: 'a file the prepared starter does not have' })
    }
  }
  return {
    matches: files.every((f) => f.status === 'identical' || f.status === 'equivalent'),
    files,
  }
}

// ── The credit signature ─────────────────────────────────────────────────────

/**
 * Manifest keys the CREDIT comparison treats as project metadata rather than work.
 * Used only by {@link creditManifest}; the pristine proof compares `pxt.json` as
 * bytes and ignores nothing here. Anything NOT listed is compared, so a key missing
 * from this list fails toward "this changed", never toward a free credit. The
 * project's name, file set and dependencies (with their values) are always compared.
 */
export const MANIFEST_IGNORED_KEYS: readonly string[] = [
  'description',
  'targetVersion',
  'targetVersionBuild',
  'preferredEditor',
  'public',
]

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** JSON with every object's keys sorted, so equality is by value. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** The tilemap resource file, canonicalised by value; `null` when unreadable. Credit only. */
export function canonicalJres(text: string): string | null {
  const parsed = parseJson(text)
  return parsed !== undefined && parsed !== null && typeof parsed === 'object' ? stableJson(parsed) : null
}

/**
 * The meaning of a `pxt.json` for CREDIT: its name, the SET of files it lists, its
 * dependencies WITH their versions, and every key outside
 * {@link MANIFEST_IGNORED_KEYS}. `null` when it is not a readable manifest.
 */
export function creditManifest(text: string): string | null {
  const parsed = parseJson(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const manifest = parsed as Record<string, unknown>
  const files = Array.isArray(manifest.files)
    ? manifest.files.filter((f): f is string => typeof f === 'string').sort()
    : []
  const dependencies =
    manifest.dependencies && typeof manifest.dependencies === 'object' && !Array.isArray(manifest.dependencies)
      ? (manifest.dependencies as Record<string, unknown>)
      : {}
  const rest: Record<string, unknown> = {}
  for (const key of Object.keys(manifest)) {
    if (key === 'name' || key === 'files' || key === 'dependencies') continue
    if (MANIFEST_IGNORED_KEYS.includes(key)) continue
    rest[key] = manifest[key]
  }
  return stableJson({ name: manifest.name ?? null, files, dependencies, rest })
}

/** Source files a manifest may list that carry code or a map. */
const CODE_FILE = /\.(ts|py|jres)$/

/**
 * What the work in a Lantern Cove archive IS, as one string.
 *
 * Built from every code and map file the project's own manifest declares —
 * `main.ts`, the map's `.ts` and `.jres` (the tiles AND the wall layer), and any
 * further source the child added — plus the manifest's meaning. The Blocks file
 * and the manifest's metadata are deliberately left out: stock MakeCode
 * re-serialises both on every import and capture, while any real change to the
 * blocks changes the generated `main.ts`. Editor scratch and `_`-private keys are
 * outside it, and a file the manifest does not declare is not part of the project.
 *
 * `null` when the manifest or the map resource is unreadable, so a malformed
 * archive can neither equal another nor differ from it by accident.
 */
export function lanternCoveCreditSignature(files: BuildStudioSourceFiles): string | null {
  const manifestText = files['pxt.json']
  if (typeof manifestText !== 'string') return null
  const manifest = creditManifest(manifestText)
  if (manifest === null) return null
  const declared = (parseJson(manifestText) as { files?: unknown }).files
  if (!Array.isArray(declared)) return null
  const scratch = new Set(EDITOR_SCRATCH_FILES)
  const present = new Set(buildStudioSourceKeys(files))
  const names = Array.from(
    new Set([
      'main.ts',
      'tilemap.g.ts',
      'tilemap.g.jres',
      ...declared.filter((f): f is string => typeof f === 'string' && CODE_FILE.test(f)),
    ]),
  )
    .filter((name) => !scratch.has(name))
    .sort()
  const body: Record<string, string | null> = {}
  for (const name of names) {
    if (!present.has(name)) {
      body[name] = null
      continue
    }
    const text = files[name]
    if (name.endsWith('.jres')) {
      const canon = canonicalJres(text)
      if (canon === null) return null
      body[name] = canon
    } else {
      body[name] = text
    }
  }
  return stableJson({ manifest, body })
}
