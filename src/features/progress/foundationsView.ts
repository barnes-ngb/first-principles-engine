/**
 * Pure presenters for the Foundations tab (FEAT-65, Phase 3b). Read-only view
 * logic over the stored `LearnerModel` — no writes, no AI. Kept separate from the
 * component so the §14 display-rule scrub and the loop-confirmation match are unit
 * tested directly.
 *
 * **§14 display rules (LOCKED):** these helpers never surface band numbers,
 * working-level numbers, or percentages. Source units ("Peak 13") survive; derived
 * band/level/percent are scrubbed or replaced with plain-language source labels.
 */
import { FOUNDATION_NODE_MAP } from '../../core/foundations'
import type { FoundationDomain } from '../../core/foundations/types'
import type {
  ChangeEntry,
  ConceptStateEntry,
  ConceptStateKind,
  EvidenceRef,
  LearnerModel,
  SynthesisMove,
} from '../../core/types/learnerModel'

/** Display order + MUI theme color token for each of the four states. */
export const STATE_META: Array<{
  state: ConceptStateKind
  label: string
  color: string
}> = [
  { state: 'solid', label: 'Solid', color: 'success.main' },
  { state: 'forming', label: 'Forming', color: 'info.main' },
  { state: 'frontier', label: 'Frontier', color: 'warning.main' },
  { state: 'not-yet', label: 'Not yet', color: 'text.disabled' },
]

export const STATE_LABEL: Record<ConceptStateKind, string> = {
  solid: 'Solid',
  forming: 'Forming',
  frontier: 'Frontier',
  'not-yet': 'Not yet',
}

/**
 * §14 scrub — strip derived jargon (band N, working-level N, level N, N/N, N%)
 * from any dynamic string before it reaches a parent surface. A no-op on
 * already-compliant synthesis prose; a safety net on seeded notes that still
 * carry "working level 4" etc. Source units like "Peak 13" are left untouched.
 */
export function scrubDisplayJargon(text: string): string {
  return text
    .replace(/\s*\(band[^)]*\)/gi, '') // "(band 1 < frontier)"
    .replace(/\baround\s+(working\s+)?level\s*\d+\s*/gi, '') // "around working level 4 "
    .replace(/\b(working\s+)?level\s*\d+/gi, '') // "working level 4" / "level 4"
    .replace(/\bband\s*\d+/gi, '') // "band 4"
    .replace(/\b\d+\s*\/\s*\d+\b/g, '') // "3/350"
    .replace(/\b\d+\s*%/g, '') // "1%"
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([—–])\s*$/g, '')
    .replace(/^\s*[—–]\s+/g, '')
    .trim()
}

/** Prettify a canonical curriculum source id into a parent-facing name. */
export function prettySource(source: string | undefined): string | undefined {
  if (!source) return undefined
  const known: Record<string, string> = {
    fastphonics: 'Fast Phonics',
    readingeggs: 'Reading Eggs',
    mathseeds: 'Mathseeds',
    workbook: 'Workbook',
    tgtb: 'The Good & The Beautiful',
  }
  const norm = source.toLowerCase().replace(/[^a-z0-9]/g, '')
  return known[norm] ?? source
}

/**
 * A §14-safe "source + date" line for one evidence ref. Uses structured source
 * fields (never the raw `note`, which may carry "working level 4"): every state
 * is traceable to a source a parent recognises, in plain words.
 */
export function evidenceSourceLine(ref: EvidenceRef): string {
  const date = ref.observedAt ? ref.observedAt.slice(0, 10) : ''
  const suffix = date ? ` · ${date}` : ''
  switch (ref.kind) {
    case 'attestation':
      return `You confirmed this${suffix}`
    case 'curriculumPosition': {
      const src = prettySource(ref.source)
      const head = [src, ref.unit].filter(Boolean).join(' ')
      const detail = ref.detail ? scrubDisplayJargon(ref.detail) : ''
      const body = [head || 'From your curriculum', detail]
        .filter(Boolean)
        .join(' — ')
      return `${body}${suffix}`
    }
    case 'workingLevel':
      return `From the skill snapshot${suffix}`
    case 'sightWordShare':
      return `From sight-word tracking${suffix}`
    case 'completedProgram':
      return `Completed ${prettySource(ref.source) ?? 'a program'}${suffix}`
    case 'eval':
      return `From an evaluation${suffix}`
    case 'quest':
      return `From a Knowledge Mine round${suffix}`
    case 'scan':
      return `From a scan${suffix}`
    default:
      return `Recorded${suffix}`
  }
}

/** A concept entry paired with its node id and plain-language name. */
export interface TerrainConcept {
  conceptId: string
  kidName: string
  parentDescription: string
  entry: ConceptStateEntry
}

/** A domain group of concepts for the terrain map, in fixed reading→math order. */
export interface TerrainDomain {
  domain: FoundationDomain
  label: string
  concepts: TerrainConcept[]
}

const DOMAIN_LABEL: Record<string, string> = {
  reading: 'Reading',
  math: 'Math',
}

/**
 * Group a model's concept states by domain for the terrain map. Domains come out
 * reading→math; within a domain, solid→forming→frontier→not-yet then by name, so
 * the strongest ground reads first. Concepts whose node id is unknown to the graph
 * are dropped (they can't be named §14-safely).
 */
export function groupTerrainByDomain(model: LearnerModel): TerrainDomain[] {
  const rank = new Map(STATE_META.map((m, i) => [m.state, i]))
  const byDomain = new Map<string, TerrainConcept[]>()
  for (const [conceptId, entry] of Object.entries(model.conceptStates)) {
    const node = FOUNDATION_NODE_MAP[conceptId]
    if (!node) continue
    const list = byDomain.get(node.domain) ?? []
    list.push({
      conceptId,
      kidName: node.kidName,
      parentDescription: node.parentDescription,
      entry,
    })
    byDomain.set(node.domain, list)
  }
  const order = ['reading', 'math']
  const domains = [...byDomain.keys()].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  )
  return domains.map((domain) => ({
    domain: domain as FoundationDomain,
    label: DOMAIN_LABEL[domain] ?? domain,
    concepts: (byDomain.get(domain) ?? []).sort((a, b) => {
      const r = (rank.get(a.entry.state) ?? 9) - (rank.get(b.entry.state) ?? 9)
      return r !== 0 ? r : a.kidName.localeCompare(b.kidName)
    }),
  }))
}

/** Count concepts per state, for the terrain summary chips. */
export function countByState(
  model: LearnerModel,
): Record<ConceptStateKind, number> {
  const counts: Record<ConceptStateKind, number> = {
    solid: 0,
    forming: 0,
    frontier: 0,
    'not-yet': 0,
  }
  for (const entry of Object.values(model.conceptStates)) {
    counts[entry.state] += 1
  }
  return counts
}

/**
 * A loop-confirmation (Step 3 / G3): a concept that has **become solid**, surfaced
 * as a celebratory answer to "did the focus work?". Deterministic string-matching
 * over the stored `changeFeed` — no AI. `wasFocus` is true when the concept is also
 * a current synthesis focus, which earns the stronger "your focus is working"
 * framing. One-directional by construction: only `→ solid` graduations qualify, so
 * nothing ever renders as a scored loss (ETHOS-02).
 */
export interface FocusConfirmation {
  conceptId: string
  kidName: string
  at: string
  wasFocus: boolean
}

export function computeFocusConfirmations(
  changeFeed: ChangeEntry[],
  whatMattersNext: SynthesisMove[],
): FocusConfirmation[] {
  const focusIds = new Set(whatMattersNext.map((m) => m.conceptId))
  return changeFeed
    .filter((c) => c.to === 'solid' && c.from !== 'solid')
    .map((c) => ({
      conceptId: c.conceptId,
      kidName: FOUNDATION_NODE_MAP[c.conceptId]?.kidName ?? c.conceptId,
      at: c.at,
      wasFocus: focusIds.has(c.conceptId),
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
}

/** The "What moved" feed: every change, most-recent first, with a §14-safe line. */
export interface MovedEntry {
  conceptId: string
  kidName: string
  toLabel: string
  at: string
  /** Plain-language, accumulating framing — never a downgrade phrasing. */
  line: string
}

export function computeMovedFeed(changeFeed: ChangeEntry[]): MovedEntry[] {
  return [...changeFeed]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((c) => {
      const kidName = FOUNDATION_NODE_MAP[c.conceptId]?.kidName ?? c.conceptId
      const toLabel = STATE_LABEL[c.to]
      const line =
        c.to === 'solid'
          ? `${kidName} became solid`
          : `${kidName} is now ${toLabel.toLowerCase()}`
      return { conceptId: c.conceptId, kidName, toLabel, at: c.at, line }
    })
}
