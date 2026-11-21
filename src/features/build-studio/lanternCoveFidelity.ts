/**
 * Lantern Cove source fidelity (FEAT-247, slice 4).
 *
 * Two questions, answered here and nowhere else, over the five-file native
 * archive:
 *
 *   1. {@link compareLanternCoveToStarter} — "is this the prepared starter, after
 *      ONLY the differences stock MakeCode's own serialisation produces?" Asked once
 *      per pristine visit (through `lanternCoveStarterLooksCorrect`) and by the
 *      local raw-copy preflight, which prints the per-file report so the exact
 *      differences can be inspected rather than inferred.
 *   2. {@link lanternCoveCreditSignature} — "what is the work in this archive?" The
 *      canonical form two saves are compared by for hours credit, so a stock
 *      import → capture round trip of an unchanged cove is never mistaken for a
 *      change, while a code line, a painted tile or a wall mark always is.
 *
 * ── What is, and is not, treated as nonsemantic ────────────────────────────
 *
 * The prior controller run showed IDENTICAL `main.ts`, `tilemap.g.ts` and
 * `tilemap.g.jres` after import and capture, with the normalised Blocks and the
 * manifest differing. So:
 *
 *   • `main.ts` and `tilemap.g.ts` are compared as exact strings. No newline or
 *     whitespace repair: a changed line of code is the thing being detected.
 *   • `tilemap.g.jres` is compared as JSON by value (key order and whitespace are
 *     not meaning). Its `data` field IS the map and the wall layer, so a changed
 *     tile or wall mark is a difference.
 *   • `main.blocks` is compared structurally ({@link canonicalBlocks}): block types,
 *     field values, mutations, shadows and nesting all count; ids, x/y positions,
 *     attribute order, namespace declarations, whitespace and the order of the
 *     top-level stacks do not. An altered value, rule or asset is a difference
 *     even when the scaffold around it is intact.
 *   • `pxt.json` is compared on its meaning ({@link canonicalManifest}): the project
 *     name, the set of files and the set of extensions. Everything else in the
 *     manifest ({@link MANIFEST_IGNORED_KEYS}) is metadata MakeCode rewrites.
 *
 * Nothing here is a guess about files the starter never had: only the starter's
 * own declared files are compared, and the editor's scratch (`_`-private keys,
 * `.simstate.json`) is outside the archive's meaning, as everywhere else.
 *
 * Pure and dependency-light on purpose (no DOM, no Vite `?raw` imports): the
 * Blocks canonicaliser is a small tokenizer rather than `DOMParser`, so the same
 * code runs under Node for the preflight.
 */

import {
  buildStudioSourceKeys,
  EDITOR_SCRATCH_FILES,
  type BuildStudioSourceFiles,
} from '../../core/types/buildStudio'

/**
 * Manifest keys treated as project metadata rather than meaning. What is KNOWN is
 * only that the normalised manifest differs after a stock import and capture while
 * the code and map do not; WHICH keys move has not been observed, so this list is
 * an assumption to be confirmed (or corrected) with `scripts/lanternCovePreflight.ts`
 * against a raw copy from the pinned editor. Anything NOT listed here is compared,
 * so a key missing from this list fails CLOSED (a stock round trip that rewrites it
 * would keep the starter's controls shut), while an entry that does not belong here
 * would let a real manifest change pass. The project's name, file set and extension
 * set are always compared.
 */
export const MANIFEST_IGNORED_KEYS: readonly string[] = [
  'description',
  'targetVersion',
  'targetVersionBuild',
  'preferredEditor',
  'public',
]

// ── JSON helpers ─────────────────────────────────────────────────────────────

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

/** The tilemap resource file, canonicalised by value; `null` when unreadable. */
export function canonicalJres(text: string): string | null {
  const parsed = parseJson(text)
  return parsed !== undefined && parsed !== null && typeof parsed === 'object' ? stableJson(parsed) : null
}

// ── The manifest ─────────────────────────────────────────────────────────────

/**
 * The meaning of a `pxt.json`: its name, the SET of files it lists and the SET of
 * extensions it depends on. `null` when it is not a readable manifest.
 */
export function canonicalManifest(text: string): string | null {
  const parsed = parseJson(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const manifest = parsed as Record<string, unknown>
  const files = Array.isArray(manifest.files)
    ? manifest.files.filter((f): f is string => typeof f === 'string').sort()
    : []
  const dependencies =
    manifest.dependencies && typeof manifest.dependencies === 'object' && !Array.isArray(manifest.dependencies)
      ? Object.keys(manifest.dependencies as Record<string, unknown>).sort()
      : []
  const rest: Record<string, unknown> = {}
  for (const key of Object.keys(manifest)) {
    if (key === 'name' || key === 'files' || key === 'dependencies') continue
    if (MANIFEST_IGNORED_KEYS.includes(key)) continue
    rest[key] = manifest[key]
  }
  return stableJson({ name: manifest.name ?? null, files, dependencies, rest })
}

// ── The Blocks ───────────────────────────────────────────────────────────────

interface XmlNode {
  tag: string
  attrs: Array<[string, string]>
  children: XmlNode[]
  text: string
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&(lt|gt|amp|quot|apos);/g, (m) => ENTITIES[m] ?? m)
}

/** Attributes that carry identity or placement, never meaning. */
const BLOCK_NOISE_ATTRIBUTES = new Set(['id', 'x', 'y', 'xmlns'])

/** A tolerant XML reader for MakeCode's Blocks file. `null` when not well formed. */
function readXml(source: string): XmlNode | null {
  const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  const stack: XmlNode[] = []
  let root: XmlNode | null = null
  let match: RegExpExecArray | null
  let consumed = 0
  while ((match = token.exec(source)) !== null) {
    if (match.index !== consumed) return null // something the tokenizer could not read
    consumed = token.lastIndex
    const [whole, cdata, closing, tag, rawAttrs, selfClosing, text] = match
    if (whole.startsWith('<!--') || whole.startsWith('<?')) continue
    if (cdata !== undefined) {
      if (stack.length) stack[stack.length - 1].text += cdata
      continue
    }
    if (text !== undefined) {
      if (stack.length) stack[stack.length - 1].text += decodeEntities(text)
      else if (text.trim() !== '') return null
      continue
    }
    if (closing) {
      const open = stack.pop()
      if (!open || open.tag !== tag) return null
      if (stack.length === 0) {
        if (root) return null
        root = open
      }
      continue
    }
    const attrs: Array<[string, string]> = []
    const attrPattern = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    let a: RegExpExecArray | null
    while ((a = attrPattern.exec(rawAttrs ?? '')) !== null) {
      attrs.push([a[1], decodeEntities(a[2] ?? a[3] ?? '')])
    }
    const node: XmlNode = { tag, attrs, children: [], text: '' }
    if (stack.length) stack[stack.length - 1].children.push(node)
    if (selfClosing) {
      if (stack.length === 0) {
        if (root) return null
        root = node
      }
    } else {
      stack.push(node)
    }
  }
  if (consumed !== source.length || stack.length !== 0) return null
  return root
}

function canonicalNode(node: XmlNode, isRoot: boolean): string {
  const attrs = node.attrs
    .filter(([name]) => !BLOCK_NOISE_ATTRIBUTES.has(name))
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .sort()
    .join(' ')
  let children = node.children.map((child) => canonicalNode(child, false))
  // The order of the workspace's top-level stacks is placement, not meaning.
  if (isRoot) children = children.sort()
  const text = node.children.length > 0 ? '' : node.text.trim()
  return `<${node.tag}${attrs ? ` ${attrs}` : ''}>${text}${children.join('')}</${node.tag}>`
}

/**
 * The structure of a Blocks file with identity and placement removed. `null` when
 * it is not well-formed XML with an `<xml>` root.
 */
export function canonicalBlocks(source: string): string | null {
  const root = readXml(source)
  if (!root || root.tag !== 'xml') return null
  return canonicalNode(root, true)
}

// ── Comparison with the prepared starter ─────────────────────────────────────

export type FidelityStatus = 'identical' | 'equivalent' | 'different' | 'unreadable' | 'missing'

export interface FidelityFileReport {
  file: string
  status: FidelityStatus
  /** Short, stable, for tests and the preflight. Never shown to a child. */
  detail: string
}

export interface FidelityReport {
  /** Every file is identical or equivalent. */
  matches: boolean
  files: FidelityFileReport[]
}

/** The first place two strings differ, as a line number and the two lines. */
export function firstDifference(a: string, b: string): string {
  const x = a.split('\n')
  const y = b.split('\n')
  const length = Math.max(x.length, y.length)
  for (let i = 0; i < length; i += 1) {
    if (x[i] !== y[i]) {
      const clip = (s: string | undefined) => (s === undefined ? '(no line)' : s.length > 80 ? `${s.slice(0, 80)}…` : s)
      return `line ${i + 1}: returned ${JSON.stringify(clip(x[i]))} vs starter ${JSON.stringify(clip(y[i]))}`
    }
  }
  return 'same lines, different length'
}

function compareExact(file: string, returned: string | undefined, starter: string): FidelityFileReport {
  if (typeof returned !== 'string' || returned === '') return { file, status: 'missing', detail: 'not returned' }
  if (returned === starter) return { file, status: 'identical', detail: 'byte-identical' }
  return { file, status: 'different', detail: firstDifference(returned, starter) }
}

function compareCanonical(
  file: string,
  returned: string | undefined,
  starter: string,
  canon: (text: string) => string | null,
): FidelityFileReport {
  if (typeof returned !== 'string' || returned === '') return { file, status: 'missing', detail: 'not returned' }
  if (returned === starter) return { file, status: 'identical', detail: 'byte-identical' }
  const a = canon(returned)
  const b = canon(starter)
  if (a === null) return { file, status: 'unreadable', detail: 'returned file does not parse' }
  if (b === null) return { file, status: 'unreadable', detail: 'starter file does not parse' }
  if (a === b) return { file, status: 'equivalent', detail: 'same meaning, different serialisation' }
  return { file, status: 'different', detail: firstDifference(a.replace(/></g, '>\n<'), b.replace(/></g, '>\n<')) }
}

/**
 * Compare the five returned sources with the prepared starter, per file.
 *
 * Only the starter's own required files are judged; a stock-added undeclared file
 * is outside the question. Every file must be identical or equivalent for
 * `matches` to be true.
 */
export function compareLanternCoveToStarter(
  returned: BuildStudioSourceFiles,
  starter: BuildStudioSourceFiles,
): FidelityReport {
  const files: FidelityFileReport[] = [
    compareCanonical('pxt.json', returned['pxt.json'], starter['pxt.json'], canonicalManifest),
    compareCanonical('main.blocks', returned['main.blocks'], starter['main.blocks'], canonicalBlocks),
    compareExact('main.ts', returned['main.ts'], starter['main.ts']),
    compareCanonical('tilemap.g.jres', returned['tilemap.g.jres'], starter['tilemap.g.jres'], canonicalJres),
    compareExact('tilemap.g.ts', returned['tilemap.g.ts'], starter['tilemap.g.ts']),
  ]
  return {
    matches: files.every((f) => f.status === 'identical' || f.status === 'equivalent'),
    files,
  }
}

// ── The canonical work, for credit ───────────────────────────────────────────

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
  const manifest = canonicalManifest(manifestText)
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
