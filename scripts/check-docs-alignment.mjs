#!/usr/bin/env node
/**
 * Docs & Data Alignment checker (DOC-08).
 *
 * Plain Node, zero dependencies — runs the same on Windows PowerShell (`npm run
 * docs:check`) and in CI. Detects the classes of doc/index/ledger drift that had
 * been getting caught by hand (duplicate ledger IDs, phantom index rows, stale
 * design-doc anchors, disagreeing collection counts, undeclared raw refs).
 *
 * Exit code: non-zero if any HARD check fails. SOFT checks only warn (exit stays
 * 0 for SOFT-only findings). `--fix` applies the safe rewrites (generated spans)
 * before reporting.
 *
 * The parsers are exported for unit tests (`check-docs-alignment.test.mjs`); the
 * CLI runner only fires when the file is invoked directly.
 */

import {
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
  statSync,
} from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = dirname(__dirname)

// ── Pure parsers (unit-tested) ──────────────────────────────────────────────

/**
 * Parse the ledger's issue rows. Each row's FIRST cell holds the owning ID in
 * bold: `| **DOC-08** | ... |`. Bolded IDs *inside* other rows (cross-references)
 * are not row owners and are deliberately ignored — we only read the ID column.
 *
 * @returns {{ rows: {id,lane,num,line}[], duplicates: {id,lines:number[]}[], gaps: {lane,missing:number[]}[] }}
 */
export function parseLedgerIds(md) {
  const lines = md.split(/\r?\n/)
  const rows = []
  const rowRe = /^\|\s*\*\*([A-Z]+)-(\d+)\*\*\s*\|/
  lines.forEach((line, i) => {
    const m = line.match(rowRe)
    if (m) rows.push({ id: `${m[1]}-${m[2]}`, lane: m[1], num: Number(m[2]), line: i + 1 })
  })

  const byId = new Map()
  for (const r of rows) {
    if (!byId.has(r.id)) byId.set(r.id, [])
    byId.get(r.id).push(r.line)
  }
  const duplicates = []
  for (const [id, ln] of byId) if (ln.length > 1) duplicates.push({ id, lines: ln })

  // Gaps ≥3 within a lane (informational only).
  const byLane = new Map()
  for (const r of rows) {
    if (!byLane.has(r.lane)) byLane.set(r.lane, new Set())
    byLane.get(r.lane).add(r.num)
  }
  const gaps = []
  for (const [lane, nums] of byLane) {
    const max = Math.max(...nums)
    const missing = []
    for (let n = 1; n <= max; n++) if (!nums.has(n)) missing.push(n)
    // Only surface a run of ≥3 consecutive missing numbers.
    let run = []
    const runs = []
    for (let n = 1; n <= max; n++) {
      if (!nums.has(n)) run.push(n)
      else {
        if (run.length >= 3) runs.push(...run)
        run = []
      }
    }
    if (run.length >= 3) runs.push(...run)
    if (runs.length) gaps.push({ lane, missing: runs })
  }

  return { rows, duplicates, gaps }
}

/**
 * Extract every `Ledger anchor: X-N` reference from a doc body. Bold markers
 * around the ID are tolerated (`Ledger anchor: **FEAT-46**`).
 * @returns {{ id: string, line: number }[]}
 */
export function parseLedgerAnchors(text) {
  const out = []
  const lines = text.split(/\r?\n/)
  const re = /Ledger anchor:?\s*\**([A-Z]+-\d+)\**/g
  lines.forEach((line, i) => {
    let m
    re.lastIndex = 0
    while ((m = re.exec(line))) out.push({ id: m[1], line: i + 1 })
  })
  return out
}

/**
 * Parse the "Repo Docs (`/docs`)" table of DOCUMENT_INDEX.md. Only rows in that
 * first table are validated against the filesystem — later tables reference
 * Google-Drive docs and root source files that don't live under `docs/`.
 *
 * @returns {{ path: string, status: string, isDir: boolean, isGlob: boolean, line: number }[]}
 */
export function parseIndexRows(md) {
  const lines = md.split(/\r?\n/)
  const rows = []
  let inRepoDocs = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^##\s+Repo Docs/i.test(line)) {
      inRepoDocs = true
      continue
    }
    // The Repo Docs table ends at the next top-level heading (`## `).
    if (inRepoDocs && /^##\s+/.test(line) && !/^##\s+Repo Docs/i.test(line)) break
    if (!inRepoDocs) continue
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map((c) => c.trim())
    // cells[0] is '' (leading pipe); [1] Document, [2] Status.
    if (cells.length < 3) continue
    const docCell = cells[1]
    const statusCell = cells[2]
    // Skip the header + separator rows.
    if (/^Document$/i.test(docCell) || /^-+$/.test(docCell.replace(/[:\s]/g, '') || '-')) continue
    if (/^\|?[-:\s]+$/.test(line.replace(/\|/g, '-'))) continue
    // First backtick-quoted token in the Document cell is the path.
    const pm = docCell.match(/`([^`]+)`/)
    if (!pm) continue
    const path = pm[1]
    const status = (statusCell.match(/[A-Z][A-Z-]+/) || [''])[0]
    rows.push({
      path,
      status,
      isDir: path.endsWith('/'),
      isGlob: path.includes('*'),
      line: i + 1,
    })
  }
  return rows
}

/**
 * Collect every backtick-quoted token in a markdown doc (used for the
 * filesystem→index direction: does the index name this file anywhere?).
 * @returns {Set<string>}
 */
export function collectBacktickTokens(md) {
  const out = new Set()
  const re = /`([^`]+)`/g
  let m
  while ((m = re.exec(md))) out.add(m[1])
  return out
}

/**
 * The canonical Firestore collection count = number of exported `*Collection`
 * helper functions in firestore.ts. Precise + mechanical: counts the helper
 * declarations, never the `FirestoreDataConverter<T>` type parameters.
 * @returns {number}
 */
export function deriveCollectionCount(src) {
  const re = /^export const \w+Collection\s*=/gm
  const matches = src.match(re)
  return matches ? matches.length : 0
}

/**
 * Find every generated collection-count span and its numeric value.
 * @returns {{ value: number, index: number }[]}
 */
export function parseGenSpans(text) {
  const out = []
  const re = /<!--\s*gen:collection-count\s*-->(\d+)<!--\s*\/gen\s*-->/g
  let m
  while ((m = re.exec(text))) out.push({ value: Number(m[1]), index: m.index })
  return out
}

/** Rewrite every collection-count span in `text` to `count`. */
export function rewriteGenSpans(text, count) {
  return text.replace(
    /<!--\s*gen:collection-count\s*-->\d+<!--\s*\/gen\s*-->/g,
    `<!-- gen:collection-count -->${count}<!-- /gen -->`,
  )
}

/**
 * Parse the entries of an `export const X = { Key: 'value', ... } as const`
 * block, ignoring `//` comment lines.
 * @returns {{ key: string, value: string }[]}
 */
export function parseAsConstEntries(src, constName) {
  const start = src.indexOf(`export const ${constName} = {`)
  if (start === -1) return []
  const end = src.indexOf('} as const', start)
  if (end === -1) return []
  const block = src.slice(start, end)
  const out = []
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/\/\/.*$/, '')
    const m = line.match(/^\s*(\w+):\s*['"]([^'"]+)['"]/)
    if (m) out.push({ key: m[1], value: m[2] })
  }
  return out
}

/**
 * Extract raw `collection(db, `families/…`)` template-literal refs from a source
 * file's content. Returns the trailing path segment (the collection/subcollection
 * name) for each, skipping interpolation-only segments.
 * @returns {{ collection: string, path: string }[]}
 */
export function extractRawFamilyRefs(content) {
  const out = []
  const re = /collection\(\s*(?:db|firestore)\s*,\s*`(families\/[^`]+)`/g
  let m
  while ((m = re.exec(content))) {
    const path = m[1]
    const segs = path.split('/').filter((s) => s && !s.startsWith('${'))
    const last = segs[segs.length - 1]
    if (last) out.push({ collection: last, path })
  }
  return out
}

// ── Resilience invariants (DOC-09, learned from July 2026 bugs) ─────────────

/**
 * A src/features file that makes a raw remote call (`httpsCallable(...)`) should
 * keep that call within reach of BOTH a client-side timeout ceiling — an
 * explicit `timeout:` option, the FEAT-61 `withTimeout` wrapper, or an
 * AbortController/Signal — AND a `finally` (so the loading spinner always
 * clears). This is a deliberately coarse *file-level* heuristic: it proves the
 * file has both in reach, not that they guard the specific call, so the check
 * runs SOFT and the report says so. AI-request call sites that go through the
 * `useAI` hook are covered by construction (the hook wraps every call in
 * finally + the callable's own timeout) and are not raw `httpsCallable` sites.
 * Lesson: FEAT-61's 5-minute "Reading your photo…" spinner.
 *
 * @returns {{ hasRemoteCall: boolean, hasTimeout: boolean, hasFinally: boolean }}
 */
export function analyzeRemoteResilience(content) {
  return {
    // `httpsCallable<...>(` or `httpsCallable(` — the bare import (followed by
    // `}` or `,`) is not a call site and does not match.
    hasRemoteCall: /\bhttpsCallable\s*[<(]/.test(content),
    hasTimeout:
      /timeout:\s*\d/.test(content) ||
      /\bwithTimeout\b/.test(content) ||
      /\bAbortController\b/.test(content) ||
      /\bAbortSignal\b/.test(content),
    hasFinally: /\bfinally\s*\{/.test(content),
  }
}

/**
 * A src/features file with an image file-input (`<input type="file"
 * accept="…image…">`) should route the picked file through a downscale/compress
 * util before upload. Detection is a grep-adjacency heuristic on the file
 * itself; genuine originals-needed inputs (sketch capture) and inputs whose
 * downscale lives in an imported handler are allowlisted with a reason.
 * Lesson: FEAT-61 (full-res photos uploaded without a ceiling).
 *
 * @returns {{ hasImageInput: boolean, hasDownscale: boolean }}
 */
export function analyzeImageDownscale(content) {
  const hasFileInput = /type=["']file["']/.test(content)
  const acceptsImage = /accept=["'][^"']*image/.test(content)
  return {
    hasImageInput: hasFileInput && acceptsImage,
    hasDownscale:
      /\bdownscaleImage\b/.test(content) ||
      /\bcompressImage\b/.test(content) ||
      /\bcompressPhotoToDataUrl\b/.test(content) ||
      /\bcompressIfNeeded\b/.test(content),
  }
}

/** True when a catch body rethrows, surfaces a user-visible error, or logs at warn+. */
export function catchIsHandled(body) {
  return (
    /\bthrow\b/.test(body) || // rethrow
    /set\w*[Ee]rror\s*\(/.test(body) || // setError / setUploadError / setSaveError…
    /\bshowError\b|\benqueueSnackbar\b|\btoast\b|\balert\s*\(/.test(body) || // user-visible
    /console\.(warn|error)\b/.test(body) || // log at warn+
    /\blogger?\.(warn|error)\b/.test(body) ||
    /reportError|captureException|ErrorReporter|logError|scrubError/.test(body)
  )
}

/**
 * The silent-fallback census (FEAT-62): every `catch` block that neither
 * rethrows, sets a user-visible error, nor logs at warn+ — a swallowed failure.
 * Report-only, no allowlist. Each block is brace-matched from its `catch (…) {`;
 * string/comment braces are not stripped, so treat the count as a census, not a
 * proof. Lesson: FEAT-62's doubly-gated silent artifact-scan fallback.
 *
 * @returns {{ line: number, snippet: string }[]}
 */
export function findSilentCatches(content) {
  const out = []
  const re = /catch\s*(\([^)]*\))?\s*\{/g
  let m
  while ((m = re.exec(content)) !== null) {
    const braceStart = m.index + m[0].length - 1 // index of the opening `{`
    let depth = 0
    let i = braceStart
    for (; i < content.length; i++) {
      const ch = content[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) break
      }
    }
    const body = content.slice(braceStart + 1, i)
    if (!catchIsHandled(body)) {
      const line = content.slice(0, m.index).split(/\r?\n/).length
      out.push({ line, snippet: body.trim().replace(/\s+/g, ' ').slice(0, 80) })
    }
  }
  return out
}

// ── Filesystem helpers (CLI only) ───────────────────────────────────────────

function walkFiles(dir, filter, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      walkFiles(p, filter, out)
    } else if (filter(p)) {
      out.push(p)
    }
  }
  return out
}

function rel(p) {
  return p.slice(REPO_ROOT.length + 1).replace(/\\/g, '/')
}

// ── Check runner ────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const useColor = process.stdout.isTTY

function paint(c, s) {
  return useColor ? `${c}${s}${RESET}` : s
}

function readDoc(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8')
}

export function runChecks({ fix = false } = {}) {
  const hard = [] // { check, message }
  const soft = []
  const info = []
  const lines = []
  const log = (s) => lines.push(s)

  const config = JSON.parse(readDoc('scripts/docs-alignment.allow.json'))

  // Preload sources.
  const firestoreSrc = readDoc('src/core/firebase/firestore.ts')
  const derivedCount = deriveCollectionCount(firestoreSrc)
  const ledgerMd = readDoc('docs/review/REVIEW_HOME_BASE.md')
  const indexMd = readDoc('docs/DOCUMENT_INDEX.md')

  const docsDir = join(REPO_ROOT, 'docs')
  const allDocs = walkFiles(
    docsDir,
    (p) => p.endsWith('.md') && !rel(p).startsWith('docs/archive/'),
  ).map(rel)

  log(paint(DIM, `Derived Firestore collection count (firestore.ts): ${derivedCount}`))
  log('')

  // ── Check 1: Ledger ID uniqueness (HARD) ──────────────────────────────────
  const { rows, duplicates, gaps } = parseLedgerIds(ledgerMd)
  if (duplicates.length === 0) {
    log(paint(GREEN, `PASS  [ledger-ids] ${rows.length} rows, all IDs unique`))
  } else {
    log(paint(RED, `FAIL  [ledger-ids] duplicate ledger IDs found:`))
    for (const d of duplicates) {
      log(`        ${d.id} owns ${d.lines.length} rows (lines ${d.lines.join(', ')})`)
      hard.push({ check: 'ledger-ids', message: `${d.id} duplicated at lines ${d.lines.join(', ')}` })
    }
  }
  if (gaps.length) {
    for (const g of gaps) {
      log(paint(YELLOW, `INFO  [ledger-ids] lane ${g.lane} has a gap ≥3: missing ${g.missing.join(', ')}`))
      info.push({ check: 'ledger-ids', message: `lane ${g.lane} missing ${g.missing.join(', ')}` })
    }
  }
  log('')

  // ── Check 2: Index ↔ filesystem (HARD) ────────────────────────────────────
  const indexRows = parseIndexRows(indexMd)
  const indexTokens = collectBacktickTokens(indexMd)
  const skipStatus = new Set(['REMOVED', 'HISTORICAL', 'ARCHIVED'])
  const idxMisses = []
  for (const row of indexRows) {
    if (skipStatus.has(row.status)) continue
    if (row.isGlob) continue
    if (row.path.startsWith('archive/')) continue
    const abs = join(docsDir, row.path)
    if (!existsSync(abs)) {
      idxMisses.push(`line ${row.line}: '${row.path}' (status ${row.status || '—'}) does not exist under docs/`)
    }
  }
  // filesystem → index
  const fsMisses = []
  for (const f of allDocs) {
    const relToDocs = f.slice('docs/'.length)
    const base = basename(f)
    let found = false
    for (const t of indexTokens) {
      if (t === relToDocs || t === base || t.endsWith('/' + base) || t.endsWith('/' + relToDocs)) {
        found = true
        break
      }
    }
    if (!found) fsMisses.push(f)
  }
  if (idxMisses.length === 0 && fsMisses.length === 0) {
    log(paint(GREEN, `PASS  [index-fs] ${indexRows.length} index rows resolve; all ${allDocs.length} docs indexed`))
  } else {
    log(paint(RED, `FAIL  [index-fs] index/filesystem mismatch:`))
    for (const m of idxMisses) {
      log(`        index→fs  ${m}`)
      hard.push({ check: 'index-fs', message: `index→fs ${m}` })
    }
    for (const m of fsMisses) {
      log(`        fs→index  '${m}' is not referenced in DOCUMENT_INDEX.md`)
      hard.push({ check: 'index-fs', message: `fs→index ${m} not indexed` })
    }
  }
  log('')

  // ── Check 3: Ledger anchors (HARD) ────────────────────────────────────────
  const validIds = new Set(rows.map((r) => r.id))
  const anchorMisses = []
  for (const f of allDocs) {
    const anchors = parseLedgerAnchors(readDoc(f))
    for (const a of anchors) {
      if (!validIds.has(a.id)) anchorMisses.push(`${f}:${a.line} → ${a.id} (no such ledger row)`)
    }
  }
  if (anchorMisses.length === 0) {
    log(paint(GREEN, `PASS  [ledger-anchors] all 'Ledger anchor:' refs resolve to a ledger row`))
  } else {
    log(paint(RED, `FAIL  [ledger-anchors] dangling anchors:`))
    for (const m of anchorMisses) {
      log(`        ${m}`)
      hard.push({ check: 'ledger-anchors', message: m })
    }
  }
  log('')

  // ── Check 4: Collection count spans (HARD, generated) ─────────────────────
  if (fix) {
    for (const f of allDocs) {
      const before = readDoc(f)
      const after = rewriteGenSpans(before, derivedCount)
      if (after !== before) {
        writeFileSync(join(REPO_ROOT, f), after)
        log(paint(YELLOW, `FIX   [collection-count] rewrote span(s) in ${f} → ${derivedCount}`))
      }
    }
  }
  const countProblems = []
  // Every span anywhere must match.
  for (const f of allDocs) {
    for (const span of parseGenSpans(readDoc(f))) {
      if (span.value !== derivedCount) {
        countProblems.push(`${f}: span value ${span.value} ≠ derived ${derivedCount}`)
      }
    }
  }
  // Canonical docs must each carry a span.
  for (const f of config.collectionCountDocs || []) {
    const spans = parseGenSpans(readDoc(f))
    if (spans.length === 0) {
      countProblems.push(`${f}: missing required <!-- gen:collection-count --> span`)
    }
  }
  if (countProblems.length === 0) {
    log(paint(GREEN, `PASS  [collection-count] all spans == ${derivedCount}; canonical docs carry a span`))
  } else {
    log(paint(RED, `FAIL  [collection-count] (run \`npm run docs:fix\` for value mismatches):`))
    for (const m of countProblems) {
      log(`        ${m}`)
      hard.push({ check: 'collection-count', message: m })
    }
  }
  log('')

  // ── Check 5: Declared-but-unwritten EvidenceRef kinds (SOFT) ──────────────
  const srcFiles = walkFiles(
    join(REPO_ROOT, 'src'),
    (p) =>
      (p.endsWith('.ts') || p.endsWith('.tsx')) &&
      !/\.test\.[tj]sx?$/.test(p) &&
      !/__tests__/.test(p),
  )
  const srcContents = srcFiles.map((p) => ({ file: rel(p), body: readFileSync(p, 'utf8') }))
  const evidenceProblems = []
  for (const union of config.evidenceUnions || []) {
    const unionSrc = readDoc(union.file)
    const entries = parseAsConstEntries(unionSrc, union.constName)
    const allow = config.evidenceKindsAllow || {}
    for (const { key, value } of entries) {
      const written = srcContents.some(
        (c) =>
          c.file !== union.file &&
          (new RegExp(`kind:\\s*['"]${value}['"]`).test(c.body) ||
            new RegExp(`kind:\\s*${union.constName}\\.${key}\\b`).test(c.body)),
      )
      const allowed = Object.prototype.hasOwnProperty.call(allow, value)
      if (!written && !allowed) {
        evidenceProblems.push(`${union.constName}.${key} ('${value}') has no non-test writer and is not allowlisted`)
      }
      if (written && allowed) {
        evidenceProblems.push(`${union.constName}.${key} ('${value}') gained a writer — remove it from the allowlist`)
      }
    }
  }
  if (evidenceProblems.length === 0) {
    log(paint(GREEN, `PASS  [evidence-kinds] every declared kind is written or allowlisted`))
  } else {
    log(paint(YELLOW, `WARN  [evidence-kinds]:`))
    for (const m of evidenceProblems) {
      log(`        ${m}`)
      soft.push({ check: 'evidence-kinds', message: m })
    }
  }
  log('')

  // ── Check 6: Known raw family refs (SOFT) ─────────────────────────────────
  const rawAllow = config.rawRefsAllow || []
  const allowByFileColl = new Set(rawAllow.map((r) => `${r.file}::${r.collection}`))
  const seenAllow = new Set()
  const rawProblems = []
  for (const { file, body } of srcContents) {
    if (file === 'src/core/firebase/firestore.ts') continue
    for (const ref of extractRawFamilyRefs(body)) {
      const key = `${file}::${ref.collection}`
      if (allowByFileColl.has(key)) {
        seenAllow.add(key)
      } else {
        rawProblems.push(`new raw ref: collection(db, \`${ref.path}\`) in ${file} (not in allowlist)`)
      }
    }
  }
  for (const r of rawAllow) {
    const key = `${r.file}::${r.collection}`
    if (!seenAllow.has(key)) {
      rawProblems.push(`stale allowlist entry: ${r.file} no longer contains a raw '${r.collection}' ref`)
    }
  }
  if (rawProblems.length === 0) {
    log(paint(GREEN, `PASS  [raw-refs] no unexpected raw family collection refs`))
  } else {
    log(paint(YELLOW, `WARN  [raw-refs]:`))
    for (const m of rawProblems) {
      log(`        ${m}`)
      soft.push({ check: 'raw-refs', message: m })
    }
  }
  log('')

  // ── Resilience invariants (DOC-09) ────────────────────────────────────────
  // Three learned checks, each encoding a July 2026 bug. All non-HARD: checks 7
  // and 8 warn (SOFT), check 9 is a report-only census. Scoped to src/features.
  const featureContents = srcContents.filter((c) => c.file.startsWith('src/features/'))
  log(paint(DIM, `── Resilience invariants (DOC-09) ──`))
  log('')

  // ── Check 7: remote-call timeout + finally (SOFT → HARD after one clean month)
  const remoteAllow = new Set((config.remoteCallAllow || []).map((r) => r.file))
  const remoteSeen = new Set()
  const remoteWarns = []
  let remoteCallFiles = 0
  for (const { file, body } of featureContents) {
    const r = analyzeRemoteResilience(body)
    if (!r.hasRemoteCall) continue
    remoteCallFiles++
    if (remoteAllow.has(file)) {
      if (!(r.hasTimeout && r.hasFinally)) remoteSeen.add(file) // still needs the exception
      continue
    }
    if (r.hasTimeout && r.hasFinally) continue
    const missing = []
    if (!r.hasTimeout) missing.push('timeout/AbortController')
    if (!r.hasFinally) missing.push('finally')
    remoteWarns.push(`${file}: httpsCallable without ${missing.join(' + ')} in reach`)
  }
  for (const r of config.remoteCallAllow || []) {
    if (!remoteSeen.has(r.file)) {
      remoteWarns.push(`stale allowlist entry: ${r.file} no longer needs a remote-call exception`)
    }
  }
  if (remoteWarns.length === 0) {
    log(paint(GREEN, `PASS  [remote-timeout-finally] ${remoteCallFiles} httpsCallable file(s), all guarded or allowlisted`))
  } else {
    log(paint(YELLOW, `WARN  [remote-timeout-finally] (SOFT — flips HARD after one clean month; file-level heuristic, false negatives possible):`))
    for (const m of remoteWarns) {
      log(`        ${m}`)
      soft.push({ check: 'remote-timeout-finally', message: m })
    }
  }
  log('')

  // ── Check 8: image inputs route through a downscale (SOFT) ─────────────────
  const imageAllow = new Set((config.imageDownscaleAllow || []).map((r) => r.file))
  const imageSeen = new Set()
  const imageWarns = []
  let imageInputFiles = 0
  for (const { file, body } of featureContents) {
    const r = analyzeImageDownscale(body)
    if (!r.hasImageInput) continue
    imageInputFiles++
    if (imageAllow.has(file)) {
      if (!r.hasDownscale) imageSeen.add(file) // still needs the exception
      continue
    }
    if (r.hasDownscale) continue
    imageWarns.push(`${file}: image file-input with no downscale/compress call in-file`)
  }
  for (const r of config.imageDownscaleAllow || []) {
    if (!imageSeen.has(r.file)) {
      imageWarns.push(`stale allowlist entry: ${r.file} no longer needs an image-downscale exception`)
    }
  }
  if (imageWarns.length === 0) {
    log(paint(GREEN, `PASS  [image-downscale] ${imageInputFiles} image-input file(s), all downscale or allowlisted`))
  } else {
    log(paint(YELLOW, `WARN  [image-downscale] (SOFT; grep-adjacency heuristic):`))
    for (const m of imageWarns) {
      log(`        ${m}`)
      soft.push({ check: 'image-downscale', message: m })
    }
  }
  log('')

  // ── Check 9: silent-fallback census (report-only, never fails CI) ──────────
  let silentCount = 0
  const silentByFile = []
  for (const { file, body } of featureContents) {
    const silent = findSilentCatches(body)
    if (silent.length) {
      silentCount += silent.length
      silentByFile.push({ file, count: silent.length, first: silent[0] })
    }
  }
  silentByFile.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
  log(paint(YELLOW, `INFO  [silent-fallback-census] ${silentCount} swallowed catch(es) across ${silentByFile.length} file(s) in src/features (report-only — the monthly review triages these):`))
  for (const s of silentByFile.slice(0, 15)) {
    log(`        ${String(s.count).padStart(2)}  ${s.file}  (e.g. :${s.first.line})`)
    info.push({ check: 'silent-fallback-census', message: `${s.file}: ${s.count} silent catch(es)` })
  }
  if (silentByFile.length > 15) {
    log(paint(DIM, `        …and ${silentByFile.length - 15} more file(s)`))
  }
  log('')

  // ── Summary ───────────────────────────────────────────────────────────────
  const hardCount = hard.length
  const softCount = soft.length
  if (hardCount === 0) {
    log(paint(GREEN, `✔ HARD checks passed`) + (softCount ? paint(YELLOW, ` · ${softCount} SOFT warning(s)`) : ''))
  } else {
    log(paint(RED, `✖ ${hardCount} HARD failure(s)`) + (softCount ? paint(YELLOW, ` · ${softCount} SOFT warning(s)`) : ''))
  }
  log(
    paint(
      DIM,
      `Resilience census (DOC-09): ${remoteWarns.length} remote-guard · ${imageWarns.length} image-downscale · ${silentCount} silent catch(es)`,
    ),
  )

  const resilience = {
    remoteWarns: remoteWarns.length,
    imageWarns: imageWarns.length,
    silentCount,
    silentFiles: silentByFile.length,
    silentByFile,
  }
  return { hard, soft, info, output: lines.join('\n'), derivedCount, resilience }
}

// ── CLI entry ───────────────────────────────────────────────────────────────

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const fix = process.argv.includes('--fix')
  const { hard, output } = runChecks({ fix })
  process.stdout.write(output + '\n')
  process.exit(hard.length > 0 ? 1 : 0)
}
