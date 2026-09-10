/**
 * The finding-tag bridge registry — AUDIT-226 (UX-346 / UX-347 / UX-348).
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `mapFindingToNode` is the one route from a **skill tag** (what an evaluation,
 * a quest or a priority skill says a child was assessed on) to a **curriculum
 * node**, and from there — through `foundations/curriculumNodeBridge` — to a
 * **foundations concept**, where the learner model's one calibrated writer may
 * move that concept UP or DOWN.
 *
 * Its keyword fallback used to be an ordered chain of `String.includes` tests
 * over a tag whose separators had been stripped. That technique produced at
 * least three independent defects, and **two of the three were found by
 * accident** while a run was doing something else:
 *
 *   - `UX-347` — `writing.paragraph` → `math.data.graphs`, because "para-graph"
 *     contains `graph`. Unlike UX-288's pair, that target is a real foundations
 *     concept, so nothing downstream filtered it: a writing finding was written
 *     as evidence about reading charts, on the writer permitted to downgrade.
 *   - `UX-346` — `math.number-sense`, the FIRST tag in the evaluation prompt's
 *     own math list, resolved to nothing at all.
 *   - `UX-348` — `math.wordProblems` answered the band-5 multi-step concept
 *     while the owner-curated `tagConceptBridge` answers the band-1-2 one-step
 *     concept, and nothing compared the two.
 *
 * Repairing three entries would have left the fourth undiscovered. So this
 * module does to the tag bridge what `childSwitchSurfaces.ts` did to the
 * child-switch class: **enumerate the whole surface from the source**, classify
 * every entry in a registry, and fail closed when a tag joins it unclassified
 * or lands in a domain it does not name.
 *
 * ── The tag universe is not one list ───────────────────────────────────────
 *
 * Four sources, each derived rather than copied (see {@link TagSource}):
 *
 *   - `prompt-list` — the three `SKILL TAGS` blocks the Cloud Function prompts
 *     hand the model. These are what an evaluation is *told* to emit.
 *   - `prompt-example` — the `"skill": "…"` literals in the same prompts. The
 *     **reading** evaluation has no SKILL TAGS block at all, so its examples are
 *     the only statement of its vocabulary that exists.
 *   - `catalog` — `skillTags.ts`'s `ALL_SKILL_TAGS`, which a `prioritySkill`
 *     carries into `seedLearnerModel`'s Gate 3.
 *   - `level-map` — the keys of the five `skillLevelMaps.ts` maps, which
 *     `deriveWorkingLevelMastery` feeds to `mapFindingToNode` directly. These
 *     reach `childSkillMaps` only; they never reach a foundations concept.
 *
 * ── Fail closed ────────────────────────────────────────────────────────────
 *
 * `[ledger-shape]` (PR #1814): a guard that passes on malformed input is worse
 * than no guard, because it reports PASS on what it did not read. So a census
 * that does not parse, a row with the wrong cell count, a blank cell, an
 * unrecognised verdict, a verdict with no rationale, a stale derived cell, a
 * duplicate row, a row naming a tag no source emits, and a table that yields
 * zero rows are all reported — and the invariant test proves the guard fails by
 * feeding it an unclassified tag and a cross-domain resolution.
 *
 * Pure: no `node:fs`. The caller supplies the prompt source (see
 * `findingTagSources.ts`).
 */

import { mapFindingToNode } from '../core/curriculum/mapFindingToNode'
import { CURRICULUM_NODE_MAP } from '../core/curriculum/curriculumMap'
import {
  COMPREHENSION_SKILL_LEVEL_MAP,
  MATH_SKILL_LEVEL_MAP,
  PHONICS_SKILL_LEVEL_MAP,
  SENTENCE_SKILL_LEVEL_MAP,
  WRITING_SKILL_LEVEL_MAP,
} from '../core/curriculum/skillLevelMaps'
import { ALL_SKILL_TAGS } from '../core/types/skillTags'
import { FOUNDATION_NODE_MAP } from '../core/foundations/index'
import { resolveFoundationConcepts } from '../core/foundations/curriculumNodeBridge'
import { TAG_CONCEPT_BRIDGE } from '../core/foundations/tagConceptBridge'

// ── Where a tag comes from ──────────────────────────────────────────────────

/** Which surface hands this tag to the bridge. */
export const TagSource = {
  /** A `SKILL TAGS` block in a Cloud Function prompt — what the model is told. */
  PromptList: 'prompt-list',
  /** A `"skill": "…"` literal in a prompt — the reading eval's only vocabulary. */
  PromptExample: 'prompt-example',
  /** `skillTags.ts` — carried by a `prioritySkill` into Gate 3. */
  Catalog: 'catalog',
  /** A `skillLevelMaps.ts` key — reaches `childSkillMaps` only. */
  LevelMap: 'level-map',
} as const
export type TagSource = (typeof TagSource)[keyof typeof TagSource]

/** Sources whose tags reach the FOUNDATIONS side (the learner model). */
const FOUNDATIONS_REACHING_SOURCES: readonly TagSource[] = [
  TagSource.PromptList,
  TagSource.PromptExample,
  TagSource.Catalog,
]

/**
 * Strings that appear in a `"skill": "…"` position in a prompt but are not tags:
 * the prompts' own placeholders, and prose the model is told to write there.
 *
 * Named explicitly rather than filtered by a shape rule, because two of them
 * (`specific.skill.tag`, `math.specific.skill`) are dot-shaped and would pass
 * any such rule — and because an exclusion list a person can read is auditable
 * in a way a regex is not. A string that stops appearing in the prompts simply
 * stops being excluded; a NEW placeholder shows up as an unclassified tag, which
 * fails the guard loudly rather than being swallowed.
 */
export const PROMPT_PLACEHOLDER_SKILLS: readonly string[] = [
  'specific.skill.tag',
  'math.specific.skill',
  'Name of skill to stop drilling',
  'Explicit who/what',
  'CVC blending',
  'Addition within 20',
]

/** A skill-tag-shaped string: dotted, no spaces. */
const TAG_SHAPED = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9-]+)+$/

/** Tag tokens inside a `SKILL TAGS` bullet, which may list several with ` / `. */
const TAG_IN_BULLET = /\b[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9-]+)+\b/g

/**
 * The `SKILL TAGS` blocks of a prompt source: the heading line plus every `- `
 * bullet that immediately follows it.
 *
 * Returned as blocks rather than a flat tag list so the guard can assert that
 * the expected number of blocks was actually found — a prompt edit that renames
 * the heading would otherwise silently shrink the universe to nothing, which is
 * the `[ledger-shape]` failure in a different costume.
 */
export function promptSkillTagBlocks(source: string): string[][] {
  const lines = source.split(/\r?\n/)
  const blocks: string[][] = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^SKILL TAGS/.test(lines[i])) continue
    const bullets: string[] = []
    for (let j = i + 1; j < lines.length && lines[j].startsWith('- '); j += 1) {
      bullets.push(lines[j])
    }
    blocks.push(bullets)
  }
  return blocks
}

/** Every tag named in a prompt's `SKILL TAGS` blocks. */
export function promptListTags(source: string): string[] {
  const out = new Set<string>()
  for (const block of promptSkillTagBlocks(source)) {
    for (const bullet of block) {
      for (const m of bullet.matchAll(TAG_IN_BULLET)) out.add(m[0])
    }
  }
  return [...out]
}

/** Every tag-shaped `"skill": "…"` literal in a prompt, placeholders removed. */
export function promptExampleTags(source: string): string[] {
  const out = new Set<string>()
  for (const m of source.matchAll(/"skill":\s*"([^"]+)"/g)) {
    const value = m[1]
    if (PROMPT_PLACEHOLDER_SKILLS.includes(value)) continue
    if (!TAG_SHAPED.test(value)) continue
    out.add(value)
  }
  return [...out]
}

/** Every key of the five working-level maps. */
export function levelMapTags(): string[] {
  const out = new Set<string>()
  for (const map of [
    PHONICS_SKILL_LEVEL_MAP,
    COMPREHENSION_SKILL_LEVEL_MAP,
    MATH_SKILL_LEVEL_MAP,
    WRITING_SKILL_LEVEL_MAP,
    SENTENCE_SKILL_LEVEL_MAP,
  ]) {
    for (const key of Object.keys(map)) out.add(key)
  }
  return [...out]
}

// ── The classification ──────────────────────────────────────────────────────

/** What the registry says about one tag, all of it derived from the source. */
export interface TagRow {
  tag: string
  /** Every source that emits it, in declared order, joined with ` + `. */
  sources: TagSource[]
  /** `mapFindingToNode`'s answer, or null. */
  node: string | null
  /** The curriculum domain of that node, or null. */
  nodeDomain: string | null
  /** `resolveFoundationConcepts`' concept ids. */
  conceptIds: string[]
  /** Its outcome word. */
  outcome: string
  /** The owner-curated answer: `null` when the tag is not in the table. */
  curated: string[] | null
  /** Does this tag reach the foundations side at all? */
  reachesFoundations: boolean
  /** Does the tag's leading segment declare a domain, and if so which? */
  declaredDomain: string | null
  /** Declared a domain and resolved outside it, outside the allowed lane. */
  crossDomain: boolean
}

/** The one declared cross-domain lane — see `mapFindingToNode`'s domain anchor. */
const DOMAINS_A_TAG_MAY_REACH: Record<string, readonly string[]> = {
  reading: ['reading'],
  math: ['math'],
  writing: ['writing', 'reading'],
  speech: ['speech'],
}

/** Leading segment → the domain it declares. Mirrors the bridge's own anchor. */
const DOMAIN_BY_LEADING_SEGMENT: Record<string, string> = {
  phonics: 'reading',
  reading: 'reading',
  math: 'math',
  writing: 'writing',
  speech: 'speech',
}

/** The domain a tag declares by its leading segment, or null. */
export function declaredDomainOf(tag: string): string | null {
  const lead = tag.toLowerCase().split('.')[0] ?? ''
  return DOMAIN_BY_LEADING_SEGMENT[lead] ?? null
}

/** Classify one tag against the live bridge. Pure. */
export function classifyTag(tag: string, sources: readonly TagSource[]): TagRow {
  const node = mapFindingToNode(tag)
  const nodeDomain = node ? CURRICULUM_NODE_MAP[node]?.domain ?? null : null
  const resolved = resolveFoundationConcepts(node, tag)
  const curated = TAG_CONCEPT_BRIDGE[tag] ?? null
  const declaredDomain = declaredDomainOf(tag)
  const allowed = declaredDomain ? DOMAINS_A_TAG_MAY_REACH[declaredDomain] ?? [] : []
  return {
    tag,
    sources: [...sources],
    node,
    nodeDomain,
    conceptIds: resolved.conceptIds,
    outcome: resolved.outcome,
    curated,
    reachesFoundations: sources.some((s) => FOUNDATIONS_REACHING_SOURCES.includes(s)),
    declaredDomain,
    crossDomain: Boolean(declaredDomain && nodeDomain && !allowed.includes(nodeDomain)),
  }
}

/**
 * The whole tag universe, classified and sorted by tag.
 *
 * @param chatSource the text of `functions/src/ai/chat.ts`.
 */
export function deriveTagRows(chatSource: string): TagRow[] {
  const bySource: ReadonlyArray<readonly [TagSource, string[]]> = [
    [TagSource.PromptList, promptListTags(chatSource)],
    [TagSource.PromptExample, promptExampleTags(chatSource)],
    [TagSource.Catalog, [...ALL_SKILL_TAGS]],
    [TagSource.LevelMap, levelMapTags()],
  ]
  const sources = new Map<string, TagSource[]>()
  for (const [source, tags] of bySource) {
    for (const tag of tags) {
      const existing = sources.get(tag) ?? []
      if (!existing.includes(source)) existing.push(source)
      sources.set(tag, existing)
    }
  }
  return [...sources.entries()]
    .map(([tag, srcs]) => classifyTag(tag, srcs))
    .sort((a, b) => a.tag.localeCompare(b.tag))
}

// ── The verdicts ────────────────────────────────────────────────────────────

/**
 * What the registry says about where a tag lands. Five words, and they are the
 * answers this survey turned out to need rather than a taxonomy chosen up front.
 */
export const TagVerdict = {
  /** It lands on the concept the tag names. */
  Correct: 'CORRECT',
  /** It resolves to nothing, and that is right — the row says why. */
  DroppedRight: 'DROPPED-RIGHT',
  /** It resolves to nothing while a real target exists (`UX-346`'s class). */
  DroppedWrong: 'DROPPED-WRONG',
  /** It lands on a concept the tag does not name (`UX-347` / `UX-348`'s class). */
  MisRouted: 'MIS-ROUTED',
  /** `tagConceptBridge` owns the answer, and the bridge agrees with it. */
  Curated: 'CURATED',
} as const
export type TagVerdict = (typeof TagVerdict)[keyof typeof TagVerdict]

export const TAG_VERDICTS: readonly TagVerdict[] = Object.values(TagVerdict)

// ── The census, as data ─────────────────────────────────────────────────────

/** 1-indexed: Tag · Source · Node · Concept · Eval · **Verdict** · Severity. */
export const CENSUS_COLUMNS = 7
const SOURCE_COLUMN = 2
const NODE_COLUMN = 3
const CONCEPT_COLUMN = 4
const EVAL_COLUMN = 5
const VERDICT_COLUMN = 6
const SEVERITY_COLUMN = 7

export interface TagCensusRow {
  tag: string
  cells: string[]
  /** 1-indexed line in the census file, for an error a person can act on. */
  line: number
}

/**
 * Split a markdown table row on its UNESCAPED pipes — a cell legitimately
 * contains `childId \| 'both'`-style escapes, and counting one as a boundary is
 * the `[ledger-shape]` class: the row renders right and the guard reads it wrong.
 */
function splitRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '\\' && line[i + 1] === '|') {
      current += '\\|'
      i += 1
      continue
    }
    if (ch === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current.trim())
  return cells
}

/**
 * Rows of the census's tag table: any table row whose first cell is a code span
 * holding a tag. A malformed row that LOOKS like one is returned so the caller
 * reports it rather than reading past it.
 */
export function parseTagCensusRows(markdown: string): TagCensusRow[] {
  const out: TagCensusRow[] = []
  markdown.split(/\r?\n/).forEach((line, i) => {
    if (!line.trimStart().startsWith('|')) return
    const m = line.match(/^\s*\|\s*`([^`]+)`/)
    if (!m) return
    // The verdict-vocabulary table at the top of the census also starts its rows
    // with a code span; a tag row's first cell is a tag, which always has a dot
    // or is a bare level-map key. Distinguished by the presence of a Verdict
    // column count instead: a vocabulary row has fewer cells and no tag.
    const cells = splitRow(line)
    const body = cells.slice(1, cells.length - 1)
    if (body.length !== CENSUS_COLUMNS) {
      // Keep it only if it looks like an attempt at a tag row, so a broken row
      // is reported. A 2- or 4-cell row belongs to another table in the doc.
      if (body.length < CENSUS_COLUMNS - 1 || body.length > CENSUS_COLUMNS + 1) return
    }
    out.push({ tag: m[1], cells: body, line: i + 1 })
  })
  return out
}

export interface TagCensusProblem {
  kind:
    | 'unclassified'
    | 'stale-row'
    | 'stale-cell'
    | 'duplicate-row'
    | 'bad-verdict'
    | 'unexplained-verdict'
    | 'blank-cell'
    | 'bad-shape'
    | 'empty-census'
    | 'cross-domain'
  message: string
}

/**
 * How much rationale a verdict cell must carry beyond its token — the
 * `childSwitchSurfaces` rule and the same reason: AUDIT-222 wrote "an
 * unexplained verdict is the row that comes back as a P1" and then had three of
 * its own rows overturned by a review round. A guard a future contributor can
 * silence with one word is paperwork, not enforcement.
 */
export const MIN_VERDICT_RATIONALE = 20

/** A verdict cell with its token, bold markers and leading punctuation removed. */
export function verdictRationale(cell: string): string {
  return cell
    .replace(/\*\*/g, '')
    .replace(/\b(?:DROPPED-RIGHT|DROPPED-WRONG|MIS-ROUTED|CORRECT|CURATED)\b/, '')
    .replace(/^[\s—–\-·:]+/, '')
    .trim()
}

/** The bare verdict token inside a cell. */
function verdictToken(cell: string): string {
  const m = cell.match(/\b(DROPPED-RIGHT|DROPPED-WRONG|MIS-ROUTED|CORRECT|CURATED)\b/)
  return m ? m[1] : ''
}

/** The derived cells a row must carry verbatim, so it cannot go stale. */
export function derivedCells(row: TagRow): {
  sources: string
  node: string
  concept: string
  evalRead: string
} {
  return {
    sources: row.sources.join(' + '),
    node: row.node ? `\`${row.node}\`` : '—',
    concept: row.conceptIds.length
      ? `\`${row.conceptIds.join('` + `')}\` (${row.outcome})`
      : `— (${row.outcome})`,
    evalRead: !row.reachesFoundations
      ? 'n/a — never reaches it'
      : row.conceptIds.length
        ? 'kept'
        : 'dropped',
  }
}

/**
 * Everything wrong with the census relative to the source it describes.
 *
 * Returns problems rather than throwing, so one red run names every new tag
 * instead of the first one.
 */
export function tagCensusProblems(
  rows: readonly TagRow[],
  censusRows: readonly TagCensusRow[],
): TagCensusProblem[] {
  const problems: TagCensusProblem[] = []

  if (censusRows.length === 0) {
    problems.push({
      kind: 'empty-census',
      message:
        'the census tag table produced no rows — a guard that reads nothing reports PASS on everything',
    })
    return problems
  }

  // The cheap check that would have caught UX-347 on its own, and it is not
  // gated on the census at all: no tag may resolve into a domain it does not
  // name, however it is classified.
  for (const row of rows) {
    if (!row.crossDomain) continue
    problems.push({
      kind: 'cross-domain',
      message: `\`${row.tag}\` declares domain \`${row.declaredDomain}\` and resolves to \`${row.node}\` in \`${row.nodeDomain}\``,
    })
  }

  const byTag = new Map(rows.map((r) => [r.tag, r]))
  const seen = new Set<string>()

  for (const censusRow of censusRows) {
    if (censusRow.cells.length !== CENSUS_COLUMNS) {
      problems.push({
        kind: 'bad-shape',
        message: `line ${censusRow.line}: ${censusRow.cells.length} cells, expected ${CENSUS_COLUMNS} (escape any literal \`|\` as \\|) — \`${censusRow.tag}\``,
      })
      continue
    }
    if (censusRow.cells.some((c) => c === '')) {
      problems.push({
        kind: 'blank-cell',
        message: `line ${censusRow.line}: a blank cell — \`${censusRow.tag}\``,
      })
    }
    if (seen.has(censusRow.tag)) {
      problems.push({
        kind: 'duplicate-row',
        message: `line ${censusRow.line}: \`${censusRow.tag}\` has more than one row`,
      })
    }
    seen.add(censusRow.tag)

    const derivedRow = byTag.get(censusRow.tag)
    if (!derivedRow) {
      problems.push({
        kind: 'stale-row',
        message: `line ${censusRow.line}: \`${censusRow.tag}\` is not emitted by any source any more — remove the row or restore the tag`,
      })
      continue
    }

    const expected = derivedCells(derivedRow)
    const actual = {
      sources: censusRow.cells[SOURCE_COLUMN - 1],
      node: censusRow.cells[NODE_COLUMN - 1],
      concept: censusRow.cells[CONCEPT_COLUMN - 1],
      evalRead: censusRow.cells[EVAL_COLUMN - 1],
    }
    for (const key of ['sources', 'node', 'concept', 'evalRead'] as const) {
      if (actual[key] !== expected[key]) {
        problems.push({
          kind: 'stale-cell',
          message: `line ${censusRow.line}: \`${censusRow.tag}\` ${key} reads "${actual[key]}", source says "${expected[key]}"`,
        })
      }
    }

    const cell = censusRow.cells[VERDICT_COLUMN - 1]
    const token = verdictToken(cell)
    if (!token) {
      problems.push({
        kind: 'bad-verdict',
        message: `line ${censusRow.line}: \`${censusRow.tag}\` names no verdict (one of ${TAG_VERDICTS.join(' / ')})`,
      })
    } else if (verdictRationale(cell).length < MIN_VERDICT_RATIONALE) {
      problems.push({
        kind: 'unexplained-verdict',
        message: `line ${censusRow.line}: \`${censusRow.tag}\` says ${token} and does not say why`,
      })
    } else {
      // The verdict must not contradict what the source does.
      const landed = derivedRow.conceptIds.length > 0 || derivedRow.node !== null
      if (!landed && (token === TagVerdict.Correct || token === TagVerdict.MisRouted)) {
        problems.push({
          kind: 'bad-verdict',
          message: `line ${censusRow.line}: \`${censusRow.tag}\` says ${token} but resolves to nothing`,
        })
      }
      if (landed && token.startsWith('DROPPED') && derivedRow.node !== null && derivedRow.reachesFoundations && derivedRow.conceptIds.length > 0) {
        problems.push({
          kind: 'bad-verdict',
          message: `line ${censusRow.line}: \`${censusRow.tag}\` says ${token} but lands on \`${derivedRow.conceptIds.join('`, `')}\``,
        })
      }
      if (token === TagVerdict.Curated && !(derivedRow.curated && derivedRow.curated.length > 0)) {
        problems.push({
          kind: 'bad-verdict',
          message: `line ${censusRow.line}: \`${censusRow.tag}\` says CURATED but tagConceptBridge has no answer for it`,
        })
      }
    }
    if (censusRow.cells[SEVERITY_COLUMN - 1] === '') {
      problems.push({
        kind: 'blank-cell',
        message: `line ${censusRow.line}: \`${censusRow.tag}\` has no severity (use — where there is none)`,
      })
    }
  }

  for (const row of rows) {
    if (seen.has(row.tag)) continue
    problems.push({
      kind: 'unclassified',
      message: `\`${row.tag}\` (${row.sources.join(' + ')}) has no census row — it resolves to ${row.node ?? 'nothing'}`,
    })
  }

  return problems
}

/** Verdict token → count, for the census's own derived numbers. */
export function tallyTagVerdicts(censusRows: readonly TagCensusRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const verdict of TAG_VERDICTS) out[verdict] = 0
  for (const row of censusRows) {
    const token = verdictToken(row.cells[VERDICT_COLUMN - 1] ?? '')
    if (token) out[token] = (out[token] ?? 0) + 1
  }
  return out
}

/** Outcome word → count over the derived rows. */
export function tallyOutcomes(rows: readonly TagRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) out[row.outcome] = (out[row.outcome] ?? 0) + 1
  return out
}

/** Concepts the whole tag universe can reach, and the graph's total. */
export function conceptReach(rows: readonly TagRow[]): { reached: number; total: number } {
  const reached = new Set<string>()
  for (const row of rows) for (const id of row.conceptIds) reached.add(id)
  return { reached: reached.size, total: Object.keys(FOUNDATION_NODE_MAP).length }
}
