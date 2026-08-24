// ── Data-review export (FEAT-120) — the pure builder ─────────────────────────
//
// One markdown file per child, formatted for an LLM to review, so the design
// chat can finally SEE the family's stored data instead of inferring it from
// code. Typed inputs in, one string out.
//
// **READ-ONLY, structurally.** This module has no React and no Firestore
// imports — it cannot write anything. A thin loader
// (`useDataReviewExport`) fetches the collections through the existing typed
// helpers and feeds this builder; every formatting, summarizing, and integrity
// decision lives here so it is testable without mocking Firestore.
//
// **The §14 jargon scrub does NOT apply here.** The export is machine review
// on a parent-only `?diag=1` surface (grandfathered out of the display rules),
// so band numbers, node ids, counts, and percentages are deliberate. Nothing in
// this file may be rendered on a kid-facing or normal parent surface.
//
// **No silent truncation.** Full history is the default. When a per-collection
// cap is hit the loader reports it and the export NAMES it — "showing most
// recent N of M" — in the section header and again as a FLAG in the integrity
// appendix. A capped read must never read as a complete one.

import type {
  ActivityConfig,
  Artifact,
  DadLabReport,
  DayLog,
  EvaluationSession,
  HoursAdjustment,
  HoursEntry,
  SightWordProgress,
  SkillSnapshot,
  WorkbookConfig,
  XpLedger,
} from '../../core/types'
import type {
  DispositionCache,
  DispositionKey,
  DispositionOverrides,
} from '../../core/types/disposition'
import type {
  ConceptStateKind,
  EvidenceRef,
  LearnerModel,
} from '../../core/types/learnerModel'
import type { HoursRequirement } from '../../core/compliance/stateCompliance'
import { FOUNDATION_NODE_MAP } from '../../core/foundations'
import {
  isPositionAddressable,
  matchWorkbookBridge,
  resolveNativePosition,
} from '../../core/foundations/workbookBridge'
import { reportArtifactIds } from '../dad-lab/reportArtifacts'
import {
  computeHoursSummary,
  computeSubjectDistribution,
} from './records.logic'

// ─── Inputs ──────────────────────────────────────────────────────────────────

/**
 * Export scope. **Full history is the default** (owner call 2026-07-25 — the
 * first audit needs the complete picture); `current-year` exists for the later
 * recurring audits and collapses prior-year DETAIL to rollups. Both modes are
 * fed the same full-history data — the mode only governs rendering, so a
 * prior-year rollup is always exact rather than an artifact of a narrower query.
 */
export const DataReviewExportMode = {
  FullHistory: 'full-history',
  CurrentYear: 'current-year',
} as const
export type DataReviewExportMode =
  (typeof DataReviewExportMode)[keyof typeof DataReviewExportMode]

/**
 * What one collection read actually returned — the anti-silent-truncation
 * record. The loader pages each collection newest-first family-wide and filters
 * to this child in memory, so three numbers matter and all three are reported:
 * how many rows were KEPT, how many documents were SCANNED, and the collection's
 * server-side TOTAL. Any shortfall is named in the section header and again in
 * the integrity appendix; a capped read must never read as a complete one.
 */
export interface CollectionReadReport {
  /** Collection label as it appears in the export, e.g. `artifacts`. */
  collection: string
  /** Rows kept for THIS child and rendered in the section. */
  shown: number
  /** Documents actually read from the collection (family-wide, newest first). */
  scanned?: number
  /** Server-side family-wide document count for the collection. */
  total?: number
  /** The per-collection scan cap. Set ONLY when it was HIT. */
  cap?: number
  /** Free-text caveat rendered alongside the count line. */
  note?: string
}

/** Identity fields the header renders. All optional except id + name. */
export interface DataReviewChild {
  id: string
  name: string
  grade?: string
  birthdate?: string
}

/** Version tags for the graphs + bridges the model was written against. */
export interface DataReviewVersions {
  /** `foundationGraphVersion()`, e.g. "reading@1+math@1". */
  graph: string
  fastPhonicsBridge: number
  mathseedsBridge: number
  tgtbLa1Bridge: number
  tagConceptBridge: number
}

/** The disposition layer as stored on the child doc (AI cache + overrides). */
export interface DataReviewDisposition {
  cache?: DispositionCache
  overrides?: DispositionOverrides
}

/**
 * `evaluationSessions` carries three different shapes under one collection:
 * guided evaluations, interactive Knowledge Mine quests (`sessionType:
 * 'interactive'`), and fluency practice (`sessionType: 'fluency'`). The extra
 * fields are declared here so §8/§9 can split them without a cast.
 */
export interface DataReviewEvaluationSession extends EvaluationSession {
  sessionType?: string
  questMode?: string
  finalLevel?: number
  totalCorrect?: number
  totalQuestions?: number
  diamondsMined?: number
  diamondsEarned?: number
}

export interface DataReviewExportInput {
  /** ISO stamp of when this file was generated (caller supplies the clock). */
  generatedAt: string
  mode: DataReviewExportMode
  child: DataReviewChild
  /** The CURRENT school year, from the shared `getSchoolYearRange()` helper. */
  schoolYear: { start: string; end: string }
  /** School-year boundary from the active state config (MO: July 1). */
  schoolYearStart: { month: number; day: number }
  /** Annual hours targets, or `null` for a state that imposes none. */
  hoursRequirement: HoursRequirement | null
  versions: DataReviewVersions
  activityConfigs: ActivityConfig[]
  /** Legacy `workbookConfigs` — surfaced so the dual-system debt is visible. */
  workbookConfigs: WorkbookConfig[]
  learnerModel: LearnerModel | null
  skillSnapshot: SkillSnapshot | null
  sightWords: SightWordProgress[]
  dayLogs: DayLog[]
  hoursEntries: HoursEntry[]
  hoursAdjustments: HoursAdjustment[]
  artifacts: Artifact[]
  dadLabReports: DadLabReport[]
  evaluationSessions: DataReviewEvaluationSession[]
  disposition: DataReviewDisposition | null
  /** Per-event `xpLedger` docs (doc ID `{childId}_{dedupKey}`). */
  xpEvents: XpLedger[]
  /** The cumulative `xpLedger` doc (doc ID `{childId}`), when it exists. */
  xpTotals: XpLedger | null
  reads: CollectionReadReport[]
}

// ─── Small formatting helpers ────────────────────────────────────────────────

/** The deliberate "we looked and there is nothing here" marker. */
const DASH = '—'
/** The deliberate "this field should carry a value and does not" marker. */
const MISSING = 'MISSING'

const orDash = (value: string | number | null | undefined): string =>
  value == null || value === '' ? DASH : String(value)

/** Escape the characters that would break a markdown table cell. */
const cell = (value: string | number | null | undefined): string =>
  orDash(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

const truncate = (value: string | undefined | null, max: number): string => {
  if (!value) return DASH
  const flat = value.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1)}…`
}

/** First 10 chars of an ISO stamp — the `YYYY-MM-DD` day. */
const day = (iso: string | undefined | null): string => (iso ?? '').slice(0, 10)

const hours = (minutes: number): string => (minutes / 60).toFixed(1)

const pluralItems = (n: number): string => `${n} item${n === 1 ? '' : 's'}`

/** Whole days between two ISO stamps, floored at 0. */
export const daysBetween = (fromIso: string, toIso: string): number => {
  const from = Date.parse(fromIso)
  const to = Date.parse(toIso)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.floor((to - from) / 86_400_000))
}

/**
 * The school-year key a `YYYY-MM-DD` date falls in, e.g. `2025-26` for MO's
 * July-1 boundary. Dates before the boundary belong to the PRIOR year's key.
 */
export const schoolYearKey = (
  dateYmd: string,
  start: { month: number; day: number },
): string => {
  const [y, m, d] = dateYmd.slice(0, 10).split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return 'unknown'
  }
  const afterBoundary = m > start.month || (m === start.month && d >= start.day)
  const startYear = afterBoundary ? y : y - 1
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

/** The inclusive `YYYY-MM-DD` range for a school-year key. */
export const schoolYearRangeForKey = (
  key: string,
  start: { month: number; day: number },
): { start: string; end: string } => {
  const startYear = Number(key.slice(0, 4))
  const pad = (n: number) => String(n).padStart(2, '0')
  const first = `${startYear}-${pad(start.month)}-${pad(start.day)}`
  const endDate = new Date(Date.UTC(startYear + 1, start.month - 1, start.day))
  endDate.setUTCDate(endDate.getUTCDate() - 1)
  return { start: first, end: endDate.toISOString().slice(0, 10) }
}

/** Group any dated rows by school-year key, newest key first. */
const groupBySchoolYear = <T>(
  rows: T[],
  dateOf: (row: T) => string,
  start: { month: number; day: number },
): Array<[string, T[]]> => {
  const byYear = new Map<string, T[]>()
  for (const row of rows) {
    const key = schoolYearKey(dateOf(row), start)
    const list = byYear.get(key) ?? []
    list.push(row)
    byYear.set(key, list)
  }
  return Array.from(byYear.entries()).sort((a, b) => b[0].localeCompare(a[0]))
}

/** The read report for one collection, when the loader supplied one. */
const readFor = (
  input: DataReviewExportInput,
  collection: string,
): CollectionReadReport | undefined =>
  input.reads.find((r) => r.collection === collection)

/**
 * Section-header count line. Always states the row count so a silently-empty
 * query reads as `0 items`, never as a missing section — and NAMES any shortfall
 * (cap hit, or documents the date-ordered query never returned).
 */
const countLine = (
  input: DataReviewExportInput,
  collection: string,
  shown: number,
): string => {
  const report = readFor(input, collection)
  const note = report?.note ? ` ${report.note}` : ''
  const head = `\`${collection}\` — ${pluralItems(shown)}`
  if (report?.cap != null) {
    const total = report.total != null ? String(report.total) : `${report.cap}+`
    return `_${head} kept for this child — **showing the most recent ${report.cap} of ${total} \`${collection}\` documents** (scan cap HIT; older rows are NOT in this file).${note}_`
  }
  if (
    report?.scanned != null &&
    report.total != null &&
    report.scanned < report.total
  ) {
    return `_${head} kept for this child — **${report.scanned} of ${report.total} \`${collection}\` documents were read**; ${report.total - report.scanned} were not returned by the date-ordered query (missing or malformed date field).${note}_`
  }
  if (report?.total != null) {
    return `_${head} kept for this child, from ${report.total} family-wide \`${collection}\` document(s).${note}_`
  }
  return `_${head}.${note}_`
}

/** Render a markdown table, or a plain "none" line when there are no rows. */
const table = (headers: string[], rows: string[][], emptyNote: string): string[] => {
  if (rows.length === 0) return [`_${emptyNote}_`]
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ]
}

/** Cap an id list in a FLAG detail so one bad collection can't flood the file. */
const MAX_FLAGGED_IDS = 25
const idList = (ids: string[]): string => {
  if (ids.length === 0) return DASH
  const shown = ids.slice(0, MAX_FLAGGED_IDS)
  const suffix =
    ids.length > MAX_FLAGGED_IDS ? ` …and ${ids.length - MAX_FLAGGED_IDS} more` : ''
  return `\`${shown.join('`, `')}\`${suffix}`
}

// ─── Workbook bridge status (the FEAT-63 gate) ───────────────────────────────

export interface WorkbookBridgeStatus {
  /** Machine status, mirroring the position-sync outcomes. */
  status: 'synced' | 'pending-curation' | 'ambiguous' | 'no-bridge' | 'no-position'
  /** Human line rendered in §1. */
  label: string
}

/**
 * Resolve a tracked workbook's bridge status through the SAME pure gate the
 * FEAT-63 position sync uses (`matchWorkbookBridge` → `resolveNativePosition`),
 * so this export can never claim a workbook is bridged when the sync would
 * report "pending curation". No guessing: an unmatched name is `no-bridge`, a
 * tie is `ambiguous`.
 */
export const workbookBridgeStatus = (
  name: string | undefined | null,
  position: number | undefined | null,
): WorkbookBridgeStatus => {
  const match = matchWorkbookBridge(name)
  if (match.status === 'none') return { status: 'no-bridge', label: 'no bridge yet' }
  if (match.status === 'ambiguous') {
    return {
      status: 'ambiguous',
      label: `ambiguous — needs alias curation (${match.bridgeIds.join(', ')})`,
    }
  }
  const bridge = match.bridge
  if (position == null) {
    return {
      status: 'no-position',
      label: `bridge \`${bridge.sourceId}\` matched, but no current position is tracked`,
    }
  }
  if (!isPositionAddressable(bridge)) {
    return {
      status: 'pending-curation',
      label: `bridge \`${bridge.sourceId}\` present, no unit boundaries curated`,
    }
  }
  const native = resolveNativePosition(bridge, position)
  if (native == null) {
    return {
      status: 'pending-curation',
      label: `bridge \`${bridge.sourceId}\` present, lesson→unit mapping pending curation`,
    }
  }
  return {
    status: 'synced',
    label: `synced → \`${bridge.sourceId}\` native unit ${native}`,
  }
}

// ─── Integrity checks ────────────────────────────────────────────────────────

export interface IntegrityCheck {
  /** Stable slug so a follow-up fix run can cite the check. */
  id: string
  label: string
  status: 'PASS' | 'FLAG'
  /** One line of evidence. FLAG lines carry the offending doc ids. */
  detail: string
}

/** An open question is "stale" once it has waited this long unresolved. */
export const OPEN_QUESTION_STALE_DAYS = 30

/**
 * Every artifact id a Dad Lab report OWNS. The lab↔artifact relationship is
 * stored on **either** side depending on which capture flow wrote it:
 *
 * - `Artifact.labSessionId` — stamped on the artifact (the session-linked flow);
 * - `DadLabReport.childReports[*].artifacts[]` — the legacy per-child capture;
 * - `DadLabReport.beats[*].items[].artifactId` — the FEAT-56 three-beat capture,
 *   which is today's DEFAULT and whose artifacts carry **no** `labSessionId`.
 *
 * Resolving only the artifact side would flag every three-beat report as having
 * no evidence and would call its photos unlinked — false findings against
 * perfectly well-connected data, which is exactly what this export must not do.
 *
 * The report side of that union is the shared `dad-lab/reportArtifacts` helper
 * (UX-85) — the same one the lab cards count and render from, so the export and
 * the card can never disagree about what a report holds. Aliased under the name
 * this module's own call sites and tests already use; there is one definition.
 * The helper is pure — no React, no Firestore — so the module header's
 * structural read-only guarantee is unchanged.
 */
export const reportOwnedArtifactIds = reportArtifactIds

/** How an artifact resolves to a Dad Lab report, if at all. */
export type LabLinkKind = 'labSessionId' | 'report-owned' | 'none'

export interface LabLinkage {
  /** Artifacts that claim a lab connection of any kind. */
  labArtifacts: Artifact[]
  /** Lab artifacts that resolve to no report from EITHER direction. */
  orphanArtifacts: Artifact[]
  /** Reports no artifact resolves to from EITHER direction. */
  reportsWithoutArtifacts: DadLabReport[]
  /** Count of artifacts resolving to a report id (either direction). */
  countForReport: (reportId: string | undefined) => number
  /** How one artifact resolved. */
  linkKindFor: (artifact: Artifact) => LabLinkKind
  /** True when this artifact is owned by some report's own id list. */
  isReportOwned: (artifactId: string | undefined) => boolean
}

/**
 * Resolve the lab↔artifact graph from **both** directions (see
 * {@link reportOwnedArtifactIds}) so neither capture flow reads as an orphan.
 */
export const computeLabLinkage = (
  reports: DadLabReport[],
  artifacts: Artifact[],
): LabLinkage => {
  const reportIds = new Set(
    reports.map((r) => r.id).filter((id): id is string => Boolean(id)),
  )
  /** artifactId → the report that lists it. */
  const ownerByArtifactId = new Map<string, DadLabReport>()
  for (const report of reports) {
    for (const artifactId of reportOwnedArtifactIds(report)) {
      ownerByArtifactId.set(artifactId, report)
    }
  }

  const linkKindFor = (a: Artifact): LabLinkKind => {
    if (a.labSessionId && reportIds.has(a.labSessionId)) return 'labSessionId'
    if (a.id && ownerByArtifactId.has(a.id)) return 'report-owned'
    return 'none'
  }

  // An artifact "claims" a lab connection when it names a session, carries a
  // capture beat, is tagged to the dad-lab domain, or a report lists its id.
  const labArtifacts = artifacts.filter(
    (a) =>
      Boolean(a.labSessionId) ||
      Boolean(a.labBeat) ||
      a.tags?.domain === 'dad-lab' ||
      (a.id != null && ownerByArtifactId.has(a.id)),
  )

  const countByReportId = new Map<string, number>()
  for (const a of labArtifacts) {
    const kind = linkKindFor(a)
    const reportId =
      kind === 'labSessionId'
        ? (a.labSessionId as string)
        : kind === 'report-owned'
          ? ownerByArtifactId.get(a.id as string)?.id
          : undefined
    if (!reportId) continue
    countByReportId.set(reportId, (countByReportId.get(reportId) ?? 0) + 1)
  }

  return {
    labArtifacts,
    orphanArtifacts: labArtifacts.filter((a) => linkKindFor(a) === 'none'),
    reportsWithoutArtifacts: reports.filter(
      (r) => !r.id || (countByReportId.get(r.id) ?? 0) === 0,
    ),
    countForReport: (reportId) =>
      reportId ? (countByReportId.get(reportId) ?? 0) : 0,
    linkKindFor,
    isReportOwned: (artifactId) =>
      Boolean(artifactId) && ownerByArtifactId.has(artifactId as string),
  }
}

/**
 * An artifact is "linked" when anything can resolve it — including a Dad Lab
 * report that owns its id from the report side (the three-beat capture writes
 * no `labSessionId`, so the artifact's own fields are not the whole story).
 */
const artifactHasLink = (a: Artifact, linkage: LabLinkage): boolean =>
  Boolean(a.dayLogId || a.labSessionId || a.projectId || a.weekKey) ||
  linkage.isReportOwned(a.id)

/** The most recent `observedAt` across every evidence ref in the model. */
const lastModelEvidenceAt = (model: LearnerModel | null): string | null => {
  if (!model) return null
  let latest: string | null = null
  for (const entry of Object.values(model.conceptStates ?? {})) {
    for (const ref of entry.evidence ?? []) {
      if (!ref.observedAt) continue
      if (latest == null || ref.observedAt > latest) latest = ref.observedAt
    }
  }
  return latest
}

/** True when the model carries `eval` evidence stamped with this session id. */
const modelHasEvalWriteback = (
  model: LearnerModel | null,
  sessionId: string | undefined,
): boolean => {
  if (!model || !sessionId) return false
  return Object.values(model.conceptStates ?? {}).some((entry) =>
    (entry.evidence ?? []).some(
      (ref) => ref.kind === 'eval' && ref.sourceId === sessionId,
    ),
  )
}

/**
 * Guided evaluations only — quests and fluency practice live under the same
 * collection but carry a `sessionType`.
 */
const isGuidedEval = (s: DataReviewEvaluationSession): boolean =>
  s.sessionType !== 'interactive' && s.sessionType !== 'fluency'

/**
 * Whether a guided eval's findings appear to have reached the skill snapshot.
 * **Inferred, not stored** — nothing writes an "applied" marker on the session
 * (itself an audit finding, surfaced as its own check). The inference: the
 * snapshot carries a priority skill tagged with one of the session's finding
 * skills AND the snapshot was updated at or after the session.
 */
export const evalLooksAppliedToSnapshot = (
  session: DataReviewEvaluationSession,
  snapshot: SkillSnapshot | null,
): boolean => {
  if (!snapshot || session.findings.length === 0) return false
  if (snapshot.updatedAt && snapshot.updatedAt < session.evaluatedAt) return false
  const tags = new Set((snapshot.prioritySkills ?? []).map((s) => String(s.tag)))
  return session.findings.some((f) => tags.has(f.skill))
}

/**
 * Every deterministic check, computed over the same typed inputs the sections
 * render. Exported so tests assert the checks directly rather than by scraping
 * markdown. Every FLAG carries the doc id(s) a follow-up fix run needs.
 */
export const computeIntegrityChecks = (
  input: DataReviewExportInput,
): IntegrityCheck[] => {
  const checks: IntegrityCheck[] = []
  const { artifacts, dadLabReports, learnerModel, skillSnapshot } = input
  const linkage = computeLabLinkage(dadLabReports, artifacts)

  // 1 — artifacts with no resolvable link (from either side).
  const unlinked = artifacts.filter((a) => !artifactHasLink(a, linkage))
  checks.push({
    id: 'artifact-unlinked',
    label: 'Artifacts carry at least one resolvable link (dayLog / lab / project / week)',
    status: unlinked.length === 0 ? 'PASS' : 'FLAG',
    detail:
      unlinked.length === 0
        ? `all ${artifacts.length} artifact(s) link to something`
        : `${unlinked.length} of ${artifacts.length} artifact(s) have no dayLogId, labSessionId, projectId, or weekKey, and no Dad Lab report lists them: ${idList(
            unlinked.map((a) => a.id ?? MISSING),
          )}`,
  })

  // 2 — lab artifacts that resolve to no report from EITHER direction.
  const { labArtifacts, orphanArtifacts, reportsWithoutArtifacts } = linkage
  checks.push({
    id: 'lab-artifact-orphan',
    label: 'Lab-tagged artifacts resolve to a Dad Lab report',
    status: orphanArtifacts.length === 0 ? 'PASS' : 'FLAG',
    detail:
      orphanArtifacts.length === 0
        ? `all ${labArtifacts.length} lab-tagged artifact(s) resolve (by labSessionId or by a report listing them)`
        : `${orphanArtifacts.length} of ${labArtifacts.length} lab-tagged artifact(s) resolve to no report — neither their labSessionId nor any report's own artifact-id list: ${idList(
            orphanArtifacts.map(
              (a) => `${a.id ?? MISSING}→${a.labSessionId ?? 'no labSessionId'}`,
            ),
          )}`,
  })

  // 3 — reports no artifact resolves to, from either direction.
  checks.push({
    id: 'lab-report-no-artifacts',
    label: 'Dad Lab reports have at least one linked artifact',
    status: reportsWithoutArtifacts.length === 0 ? 'PASS' : 'FLAG',
    detail:
      reportsWithoutArtifacts.length === 0
        ? `all ${dadLabReports.length} report(s) have linked artifacts`
        : `${reportsWithoutArtifacts.length} of ${dadLabReports.length} report(s) have no artifact referencing them and list none of their own: ${idList(
            reportsWithoutArtifacts.map((r) => r.id ?? MISSING),
          )}`,
  })

  // 4 — workbook configs with no bridge / pending lesson curation.
  const tracked = input.activityConfigs.filter((c) => c.currentPosition != null)
  const unbridged = tracked
    .map((c) => ({
      config: c,
      status: workbookBridgeStatus(c.name || c.curriculum, c.currentPosition),
    }))
    .filter((r) => r.status.status !== 'synced')
  checks.push({
    id: 'workbook-bridge',
    label: 'Tracked workbook positions resolve through the FEAT-63 bridge gate',
    status: unbridged.length === 0 ? 'PASS' : 'FLAG',
    detail:
      unbridged.length === 0
        ? `all ${tracked.length} tracked position(s) resolve to a bridge unit`
        : `${unbridged.length} of ${tracked.length} tracked position(s) do not reach the learner model: ${idList(
            unbridged.map((r) => `${r.config.id}(${r.status.status})`),
          )}`,
  })

  // 5 — unresolved open questions older than the stale window. An OpenQuestion
  // carries no created stamp of its own, so the age is anchored to the most
  // recent evidence on ITS concept (falling back to the model's own stamps) —
  // the closest honest "when was this concept last touched" signal we have.
  const questionAnchor = (conceptId: string): string =>
    [...(learnerModel?.conceptStates?.[conceptId]?.evidence ?? [])]
      .map((e) => e.observedAt)
      .filter(Boolean)
      .sort()
      .pop() ??
    learnerModel?.updatedAt ??
    learnerModel?.seededAt ??
    input.generatedAt
  const staleQuestions = (learnerModel?.openQuestions ?? []).filter(
    (q) =>
      !q.resolvedAt &&
      daysBetween(questionAnchor(q.conceptId), input.generatedAt) >
        OPEN_QUESTION_STALE_DAYS,
  )
  checks.push({
    id: 'open-question-stale',
    label: `Routed open questions resolved within ${OPEN_QUESTION_STALE_DAYS} days`,
    status: staleQuestions.length === 0 ? 'PASS' : 'FLAG',
    detail:
      staleQuestions.length === 0
        ? `${(learnerModel?.openQuestions ?? []).filter((q) => !q.resolvedAt).length} question(s) waiting, none past the window`
        : `${staleQuestions.length} routed question(s) still waiting past ${OPEN_QUESTION_STALE_DAYS} days: ${idList(
            staleQuestions.map((q) => `${q.conceptId}→${q.routedTo}`),
          )}`,
  })

  // 6 — learner model synthesis stale.
  const staleAt = learnerModel?.synthesisStaleAt ?? null
  const generatedAt = learnerModel?.synthesis?.generatedAt ?? null
  const synthesisStale = Boolean(staleAt) && (!generatedAt || staleAt! > generatedAt)
  checks.push({
    id: 'learner-model-stale',
    label: 'Learner-model synthesis is current with the deterministic layer',
    status: !learnerModel || !synthesisStale ? 'PASS' : 'FLAG',
    detail: !learnerModel
      ? 'no learner model stored — nothing to compare'
      : synthesisStale
        ? `synthesisStaleAt ${staleAt} is later than synthesis.generatedAt ${orDash(generatedAt)} — the stored synthesis is behind the concept states (doc \`learnerModels/${input.child.id}\`)`
        : `synthesisStaleAt ${orDash(staleAt)} · synthesis.generatedAt ${orDash(generatedAt)}`,
  })

  // 7 — snapshot newer than the model's last evidence write.
  const lastEvidence = lastModelEvidenceAt(learnerModel)
  const snapshotAhead = Boolean(
    skillSnapshot?.updatedAt &&
      lastEvidence &&
      skillSnapshot.updatedAt > lastEvidence,
  )
  checks.push({
    id: 'snapshot-ahead-of-model',
    label: 'Learner model is not behind the skill snapshot',
    status: snapshotAhead ? 'FLAG' : 'PASS',
    detail: !skillSnapshot
      ? 'no skill snapshot stored — nothing to compare'
      : !lastEvidence
        ? 'no learner-model evidence stored — nothing to compare'
        : snapshotAhead
          ? `skillSnapshots/${input.child.id}.updatedAt ${skillSnapshot.updatedAt} is newer than the model's last evidence write ${lastEvidence} — the model may be behind`
          : `snapshot ${orDash(skillSnapshot.updatedAt)} · last model evidence ${lastEvidence}`,
  })

  // 8 — guided evaluations that never reached either downstream store.
  const guided = input.evaluationSessions.filter(
    (s) => isGuidedEval(s) && s.findings.length > 0,
  )
  const neverApplied = guided.filter(
    (s) =>
      !modelHasEvalWriteback(learnerModel, s.id) &&
      !evalLooksAppliedToSnapshot(s, skillSnapshot),
  )
  checks.push({
    id: 'eval-never-applied',
    label: 'Guided evaluations reached the skill snapshot or the learner model',
    status: neverApplied.length === 0 ? 'PASS' : 'FLAG',
    detail:
      neverApplied.length === 0
        ? `all ${guided.length} guided evaluation(s) with findings show downstream evidence`
        : `${neverApplied.length} of ${guided.length} guided evaluation(s) with findings show NO learner-model \`eval\` evidence and no matching snapshot priority skill: ${idList(
            neverApplied.map((s) => s.id ?? MISSING),
          )}`,
  })

  // 9 — photo/audio artifacts with no media at all.
  const mediaTypes = new Set(['Photo', 'photo', 'Audio', 'audio', 'Video', 'video'])
  const medialess = artifacts.filter(
    (a) =>
      mediaTypes.has(a.type as string) && !a.uri && (a.mediaUrls?.length ?? 0) === 0,
  )
  checks.push({
    id: 'artifact-media-missing',
    label: 'Photo / audio / video artifacts carry a media URL',
    status: medialess.length === 0 ? 'PASS' : 'FLAG',
    detail:
      medialess.length === 0
        ? 'every media-typed artifact carries a uri or mediaUrls entry'
        : `${medialess.length} media-typed artifact(s) have neither uri nor mediaUrls: ${idList(
            medialess.map((a) => a.id ?? MISSING),
          )}`,
  })

  // 10 — completed Dad Labs with no subject tags write ZERO hours (DATA-16).
  const untaggedLabs = dadLabReports.filter(
    (r) => r.status === 'complete' && (r.subjectTags?.length ?? 0) === 0,
  )
  checks.push({
    id: 'dad-lab-untagged',
    label: 'Completed Dad Labs carry subject tags (untagged labs log zero hours)',
    status: untaggedLabs.length === 0 ? 'PASS' : 'FLAG',
    detail:
      untaggedLabs.length === 0
        ? 'every completed lab carries at least one subject tag'
        : `${untaggedLabs.length} completed lab(s) have empty subjectTags, so they contributed no compliance minutes (DATA-16): ${idList(
            untaggedLabs.map((r) => r.id ?? MISSING),
          )}`,
  })

  // 11 — per-collection row counts, and any shortfall in what was read.
  const short = input.reads.filter(
    (r) =>
      r.cap != null ||
      (r.scanned != null && r.total != null && r.scanned < r.total),
  )
  checks.push({
    id: 'collection-row-counts',
    label: 'Every collection was read completely (no cap hit, no unread documents)',
    status: short.length === 0 ? 'PASS' : 'FLAG',
    detail:
      short.length === 0
        ? input.reads.map((r) => `${r.collection}=${r.shown}`).join(' · ') ||
          'no reads reported'
        : `${short.length} collection(s) are PARTIAL in this file: ${short
            .map((r) =>
              r.cap != null
                ? `${r.collection} scanned the most recent ${r.cap} of ${r.total ?? `${r.cap}+`} (cap hit)`
                : `${r.collection} read ${r.scanned} of ${r.total}`,
            )
            .join(' · ')}`,
  })

  return checks
}

// ─── Sections ────────────────────────────────────────────────────────────────

const buildHeader = (input: DataReviewExportInput): string[] => {
  const { child, versions, mode } = input
  return [
    `# Data review export — ${child.name}`,
    '',
    '| Field | Value |',
    '|---|---|',
    `| Generated at | ${input.generatedAt} |`,
    `| Scope | ${mode === DataReviewExportMode.FullHistory ? '**FULL HISTORY** (default)' : '**CURRENT SCHOOL YEAR ONLY** (prior years collapsed to rollups)'} |`,
    `| Child | ${cell(child.name)} (\`${child.id}\`) |`,
    `| Grade band | ${cell(child.grade)} |`,
    `| Birthdate | ${cell(child.birthdate)} |`,
    `| Current school year | ${input.schoolYear.start} → ${input.schoolYear.end} |`,
    `| Concept graph version | \`${versions.graph}\` |`,
    `| Fast Phonics bridge | v${versions.fastPhonicsBridge} |`,
    `| Mathseeds bridge | v${versions.mathseedsBridge} |`,
    `| TGTB LA1 bridge | v${versions.tgtbLa1Bridge} |`,
    `| Tag→concept bridge | v${versions.tagConceptBridge} |`,
    '',
    '## Purpose (read this first)',
    '',
    'This file is a **read-only dump of one child\'s stored data**, written for an AI to audit. It exists',
    'because the design conversation can read the code but has never seen the data, so nobody can check',
    'whether evidence is actually connected to the right things.',
    '',
    `- A \`${DASH}\` means the field is empty and that is expected or unremarkable.`,
    `- \`${MISSING}\` means a field that should carry a value does not.`,
    '- Both markers are **deliberate**. Do not treat them as export bugs — they are the signal.',
    '- Every section header states its row count, so an empty section reads as `0 items`, never as a',
    '  missing section. If a per-collection cap was hit, the header says so explicitly.',
    '- Band numbers, node ids, counts, and percentages appear on purpose: this is machine review on a',
    '  parent-only diagnostic surface, not a parent- or kid-facing display.',
    '- The `## Integrity checks` appendix at the end lists deterministic PASS/FLAG lines with doc ids.',
    '',
    '---',
  ]
}

const buildWorkbookSection = (input: DataReviewExportInput): string[] => {
  const configs = [...input.activityConfigs].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  )
  const rows = configs.map((c) => {
    const status = workbookBridgeStatus(c.name || c.curriculum, c.currentPosition)
    return [
      cell(c.id),
      cell(c.name),
      cell(c.subjectBucket),
      cell(c.type),
      c.currentPosition == null
        ? DASH
        : `${c.currentPosition}${c.totalUnits ? ` / ${c.totalUnits}` : ''} ${c.unitLabel ?? ''}`.trim(),
      c.completed ? `yes (${cell(c.completedDate)})` : 'no',
      cell(status.label),
    ]
  })

  const legacyRows = input.workbookConfigs.map((w) => [
    cell(w.id),
    cell(w.name),
    cell(w.subjectBucket),
    `${w.currentPosition} / ${w.totalUnits} ${w.unitLabel ?? ''}`.trim(),
    w.completed ? 'yes' : 'no',
    cell(w.updatedAt),
  ])

  return [
    `## 1. Workbook / activity configs`,
    '',
    countLine(input, 'activityConfigs', configs.length),
    '',
    ...table(
      ['Doc id', 'Name', 'Subject', 'Type', 'Position', 'Completed', 'Bridge status (FEAT-63 gate)'],
      rows,
      'No activity configs stored for this child.',
    ),
    '',
    `### 1b. Legacy \`workbookConfigs\` (superseded by \`activityConfigs\`)`,
    '',
    countLine(input, 'workbookConfigs', input.workbookConfigs.length),
    '',
    ...table(
      ['Doc id', 'Name', 'Subject', 'Position', 'Completed', 'Updated'],
      legacyRows,
      'No legacy workbookConfigs docs for this child.',
    ),
    '',
    '---',
  ]
}

const STATE_ORDER: ConceptStateKind[] = ['frontier', 'forming', 'solid', 'not-yet']

const evidenceLine = (ref: EvidenceRef): string =>
  `${ref.kind}@${day(ref.observedAt)} — ${truncate(ref.note, 140)}`

const buildLearnerModelSection = (input: DataReviewExportInput): string[] => {
  const model = input.learnerModel
  const lines: string[] = ['## 2. Learner model', '']

  if (!model) {
    lines.push(
      `_0 items — no \`learnerModels/${input.child.id}\` document stored. Every model-derived section below is empty for that reason, not because the query failed._`,
      '',
      '---',
    )
    return lines
  }

  const entries = Object.entries(model.conceptStates ?? {})
  const staleAt = model.synthesisStaleAt ?? null
  const generatedAt = model.synthesis?.generatedAt ?? null
  const stale = Boolean(staleAt) && (!generatedAt || staleAt! > generatedAt)

  lines.push(
    `_${pluralItems(entries.length)} in \`conceptStates\`._`,
    '',
    '| Field | Value |',
    '|---|---|',
    `| status | ${cell(model.status)} |`,
    `| graphVersion | \`${cell(model.graphVersion)}\` |`,
    `| seededAt | ${cell(model.seededAt)} |`,
    `| updatedAt | ${cell(model.updatedAt)} |`,
    `| synthesis.generatedAt | ${cell(generatedAt)} |`,
    `| synthesisStaleAt | ${cell(staleAt)} |`,
    `| synthesis fresh? | ${stale ? '**STALE — the stored synthesis is behind the concept states**' : 'current'} |`,
    `| synthesis.model | ${cell(model.synthesis?.model)} |`,
    '',
  )

  // Concept states, grouped by state, frontier-first.
  const grouped = new Map<ConceptStateKind, Array<[string, (typeof entries)[number][1]]>>()
  for (const [nodeId, entry] of entries) {
    const list = grouped.get(entry.state) ?? []
    list.push([nodeId, entry])
    grouped.set(entry.state, list)
  }

  lines.push('### 2a. Concept states', '')
  for (const state of STATE_ORDER) {
    const list = (grouped.get(state) ?? []).sort((a, b) => a[0].localeCompare(b[0]))
    lines.push(`**${state}** — ${pluralItems(list.length)}`, '')
    lines.push(
      ...table(
        ['Concept id', 'Kid name', 'Band', 'Evidence count', 'Evidence kinds', 'Most recent evidence', 'needsReconcile'],
        list.map(([nodeId, entry]) => {
          const node = FOUNDATION_NODE_MAP[nodeId]
          const evidence = entry.evidence ?? []
          const kinds = Array.from(new Set(evidence.map((e) => e.kind)))
          const latest = [...evidence].sort((a, b) =>
            (b.observedAt ?? '').localeCompare(a.observedAt ?? ''),
          )[0]
          return [
            `\`${nodeId}\``,
            cell(node?.kidName),
            node?.band == null ? MISSING : String(node.band),
            String(evidence.length),
            kinds.length ? kinds.join(', ') : DASH,
            latest ? cell(evidenceLine(latest)) : DASH,
            entry.needsReconcile ? '**yes**' : 'no',
          ]
        }),
        `No concepts in state \`${state}\`.`,
      ),
      '',
    )
  }

  // Modality calibration — verbatim.
  lines.push('### 2b. Modality calibration (verbatim)', '')
  const cal = model.modalityCalibration
  lines.push(
    ...table(
      ['Modality', 'Level', 'Note'],
      (['reading', 'writing', 'math'] as const).map((m) => [
        m,
        cal?.[m]?.level == null ? DASH : String(cal[m].level),
        cell(cal?.[m]?.note),
      ]),
      'No modality calibration stored.',
    ),
    '',
  )

  // Synthesis.
  lines.push('### 2c. Synthesis (LLM judgment layer)', '')
  if (!model.synthesis) {
    lines.push('_0 items — no synthesis has been generated for this model._', '')
  } else {
    lines.push(
      `**narrative:** ${truncate(model.synthesis.narrative, 1200)}`,
      '',
      `**whatMattersNext** — ${pluralItems(model.synthesis.whatMattersNext.length)}`,
      '',
      ...table(
        ['Concept id', 'Kid name', 'Vehicle', 'Why'],
        model.synthesis.whatMattersNext.map((m) => [
          `\`${m.conceptId}\``,
          cell(m.kidName),
          cell(m.suggestedVehicle),
          cell(truncate(m.why, 300)),
        ]),
        'No moves in the stored synthesis.',
      ),
      '',
      `**openQuestionsSummary** — ${pluralItems(model.synthesis.openQuestionsSummary.length)}`,
      '',
      ...(model.synthesis.openQuestionsSummary.length
        ? model.synthesis.openQuestionsSummary.map((q) => `- ${q}`)
        : ['_No summary lines stored._']),
      '',
    )
  }

  // Open questions.
  const questions = model.openQuestions ?? []
  lines.push(
    '### 2d. Open questions (routed asks)',
    '',
    `_${pluralItems(questions.length)}._`,
    '',
    ...table(
      ['Concept id', 'Routed to', 'Question', 'Status', 'Resolved at', 'Resolved by session'],
      questions.map((q) => [
        `\`${q.conceptId}\``,
        cell(q.routedTo),
        cell(truncate(q.question, 200)),
        q.resolvedAt ? 'resolved' : 'waiting',
        cell(q.resolvedAt),
        cell(q.resolvedBySessionId),
      ]),
      'No routed open questions stored.',
    ),
    '',
  )

  // Change feed tail.
  const feed = model.changeFeed ?? []
  const tail = feed.slice(-20).reverse()
  lines.push(
    '### 2e. Change feed (most recent 20)',
    '',
    `_${pluralItems(feed.length)} total; showing ${tail.length}._`,
    '',
    ...table(
      ['At', 'Concept id', 'From', 'To', 'Cause'],
      tail.map((c) => [
        cell(c.at),
        `\`${c.conceptId}\``,
        cell(c.from),
        cell(c.to),
        cell(truncate(c.cause, 200)),
      ]),
      'No change-feed entries stored.',
    ),
    '',
    '---',
  )

  return lines
}

const buildSkillSnapshotSection = (input: DataReviewExportInput): string[] => {
  const snap = input.skillSnapshot
  const lines: string[] = ['## 3. Skill snapshot', '']
  if (!snap) {
    lines.push(
      `_0 items — no \`skillSnapshots/${input.child.id}\` document stored._`,
      '',
      '---',
    )
    return lines
  }

  const levels = snap.workingLevels ?? {}
  lines.push(
    `_updatedAt ${orDash(snap.updatedAt)} · createdAt ${orDash(snap.createdAt)} · blocksUpdatedAt ${orDash(snap.blocksUpdatedAt)}._`,
    '',
    '### 3a. Working levels',
    '',
    ...table(
      ['Domain', 'Level', 'Source', 'Updated', 'Evidence'],
      (['phonics', 'comprehension', 'math', 'writing', 'sentence'] as const)
        .filter((k) => levels[k] != null)
        .map((k) => {
          const wl = levels[k]!
          return [k, String(wl.level), cell(wl.source), cell(wl.updatedAt), cell(truncate(wl.evidence, 160))]
        }),
      'No working levels stored.',
    ),
    '',
    `### 3b. Priority skills — ${pluralItems(snap.prioritySkills?.length ?? 0)}`,
    '',
    ...table(
      ['Tag', 'Label', 'Level', 'Mastery gate', 'Notes'],
      (snap.prioritySkills ?? []).map((s) => [
        `\`${s.tag}\``,
        cell(s.label),
        cell(s.level),
        s.masteryGate == null ? DASH : String(s.masteryGate),
        cell(truncate(s.notes, 200)),
      ]),
      'No priority skills stored.',
    ),
    '',
    `### 3c. Supports — ${pluralItems(snap.supports?.length ?? 0)}`,
    '',
    ...table(
      ['Label', 'Description'],
      (snap.supports ?? []).map((s) => [cell(s.label), cell(truncate(s.description, 240))]),
      'No supports stored.',
    ),
    '',
    `### 3d. Stop rules — ${pluralItems(snap.stopRules?.length ?? 0)}`,
    '',
    ...table(
      ['Label', 'Trigger', 'Action'],
      (snap.stopRules ?? []).map((r) => [
        cell(r.label),
        cell(truncate(r.trigger, 200)),
        cell(truncate(r.action, 200)),
      ]),
      'No stop rules stored.',
    ),
    '',
    `### 3e. Completed programs — ${pluralItems(snap.completedPrograms?.length ?? 0)}`,
    '',
    ...(snap.completedPrograms?.length
      ? snap.completedPrograms.map((p) => `- \`${p}\``)
      : ['_No completed programs stored._']),
    '',
    `### 3f. Conceptual blocks — ${pluralItems(snap.conceptualBlocks?.length ?? 0)}`,
    '',
    ...table(
      ['Id', 'Name', 'Status', 'Source', 'Detected', 'Last reinforced', 'Affected skills', 'Rationale'],
      (snap.conceptualBlocks ?? []).map((b) => [
        cell(b.id),
        cell(b.name),
        cell(b.status ?? b.recommendation),
        cell(b.source),
        cell(b.detectedAt),
        cell(b.lastReinforcedAt),
        b.affectedSkills?.length ? b.affectedSkills.join(', ') : DASH,
        cell(truncate(b.rationale, 200)),
      ]),
      'No conceptual blocks stored.',
    ),
    '',
    '---',
  )
  return lines
}

const buildSightWordSection = (input: DataReviewExportInput): string[] => {
  const words = input.sightWords
  const byLevel = new Map<string, number>()
  for (const w of words) {
    byLevel.set(w.masteryLevel, (byLevel.get(w.masteryLevel) ?? 0) + 1)
  }
  const known = words.filter(
    (w) => w.masteryLevel === 'mastered' || w.shellyConfirmed,
  ).length

  // The 3-vs-548 lesson: name BOTH sources. In-app tracking is one source; an
  // external curriculum position recorded on the learner model is another, and
  // they routinely disagree by two orders of magnitude.
  const externalRefs: EvidenceRef[] = []
  const seen = new Set<string>()
  for (const entry of Object.values(input.learnerModel?.conceptStates ?? {})) {
    for (const ref of entry.evidence ?? []) {
      if (ref.kind !== 'curriculumPosition') continue
      const key = `${ref.source}|${ref.unit}|${ref.detail}|${ref.note}`
      if (seen.has(key)) continue
      seen.add(key)
      externalRefs.push(ref)
    }
  }

  return [
    '## 4. Sight words',
    '',
    countLine(input, 'sightWordProgress', words.length),
    '',
    '**Source A — in-app `sightWordProgress` tracking**',
    '',
    ...table(
      ['Metric', 'Count'],
      [
        ['tracked (docs)', String(words.length)],
        ['known (mastered or parent-confirmed)', String(known)],
        ...Array.from(byLevel.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([level, n]) => [`masteryLevel=${level}`, String(n)]),
      ],
      'No sight-word progress docs for this child.',
    ),
    '',
    '**Source B — external curriculum position recorded on the learner model**',
    '',
    `_${externalRefs.length} \`curriculumPosition\` evidence ref(s) on the learner model. These are the claims made by an outside program (Fast Phonics, Reading Eggs, a workbook). They are a DIFFERENT source from Source A and the two are expected to disagree — naming both is the point._`,
    '',
    ...table(
      ['Source', 'Unit', 'Detail', 'Via', 'Observed', 'Note'],
      externalRefs.map((r) => [
        cell(r.source),
        cell(r.unit),
        cell(r.detail),
        cell(r.via),
        cell(day(r.observedAt)),
        cell(truncate(r.note, 200)),
      ]),
      'No external curriculum-position evidence on the learner model.',
    ),
    '',
    '---',
  ]
}

const buildHoursSection = (input: DataReviewExportInput): string[] => {
  const start = input.schoolYearStart
  const keys = new Set<string>()
  for (const l of input.dayLogs) keys.add(schoolYearKey(l.date, start))
  for (const e of input.hoursEntries) keys.add(schoolYearKey(e.date, start))
  for (const a of input.hoursAdjustments) keys.add(schoolYearKey(a.date, start))
  const currentKey = schoolYearKey(input.schoolYear.start, start)
  const sortedKeys = Array.from(keys)
    .filter((k) => k !== 'unknown')
    .sort((a, b) => b.localeCompare(a))

  const target = input.hoursRequirement
  const lines: string[] = [
    '## 5. Hours',
    '',
    `_${sortedKeys.length} school year(s) with recorded time. Counted through the SHARED counting path (\`collectHoursContributions\` / \`computeHoursSummary\`) — this export never re-derives the counting rules._`,
    '',
    countLine(input, 'hours', input.hoursEntries.length),
    countLine(input, 'days', input.dayLogs.length),
    countLine(input, 'hoursAdjustments', input.hoursAdjustments.length),
    '',
  ]

  if (sortedKeys.length === 0) {
    lines.push('_0 items — no day logs, hours entries, or adjustments recorded._', '', '---')
    return lines
  }

  // Per-year totals table (a rollup — always shown in full in BOTH modes).
  const summaries = sortedKeys.map((key) => {
    const inYear = (date: string) => schoolYearKey(date, start) === key
    const summary = computeHoursSummary(
      input.dayLogs.filter((l) => inYear(l.date)),
      input.hoursEntries.filter((e) => inYear(e.date)),
      input.hoursAdjustments.filter((a) => inYear(a.date)),
      input.child.id,
    )
    return { key, summary }
  })

  lines.push(
    '### 5a. Per-school-year totals vs targets',
    '',
    ...table(
      ['School year', 'Days with time', 'Total h', 'Target', 'Core h', 'Target', 'Core-at-home h', 'Target', 'Adjustment h'],
      summaries.map(({ key, summary }) => [
        key === currentKey ? `**${key}** (current)` : key,
        String(Object.keys(summary.byDate).length),
        hours(summary.totalMinutes),
        target ? String(target.total) : DASH,
        hours(summary.coreMinutes),
        target ? String(target.core) : DASH,
        hours(summary.coreHomeMinutes),
        target ? String(target.coreAtHome) : DASH,
        hours(summary.adjustmentMinutes),
      ]),
      'No recorded hours.',
    ),
    '',
  )

  // Per-subject distribution: every year in full mode, current year only when
  // prior-year detail is collapsed.
  const detailYears =
    input.mode === DataReviewExportMode.FullHistory
      ? summaries
      : summaries.filter((s) => s.key === currentKey)

  lines.push('### 5b. Per-subject distribution', '')
  if (input.mode !== DataReviewExportMode.FullHistory) {
    lines.push(
      `_Current-year-only mode: prior years are represented by their §5a totals; per-subject detail is shown for ${currentKey} only._`,
      '',
    )
  }
  for (const { key, summary } of detailYears) {
    const dist = computeSubjectDistribution(summary)
    lines.push(
      `**${key}** — total ${hours(dist.totalMinutes)} h · core ${hours(dist.coreMinutes)} h · non-core ${hours(dist.nonCoreMinutes)} h`,
      '',
      ...table(
        ['Subject', 'Hours', '% of total', 'Home hours', 'Core?'],
        dist.rows.map((r) => [
          cell(r.label),
          hours(r.totalMinutes),
          dist.percentagesMeaningful ? `${r.percent.toFixed(0)}%` : DASH,
          hours(r.homeMinutes),
          r.isCore ? 'core' : DASH,
        ]),
        'No subject time recorded this year.',
      ),
      '',
    )
  }

  lines.push('---')
  return lines
}

/** Compact `day=… lab=… proj=… week=…` cell; `—` for each missing link. */
const artifactLinks = (a: Artifact): string => {
  const parts = [
    `day=${orDash(a.dayLogId)}`,
    `lab=${orDash(a.labSessionId)}${a.labSessionId ? ` (stage=${orDash(a.labStage)}, beat=${orDash(a.labBeat)})` : ''}`,
    `proj=${orDash(a.projectId)}`,
    `week=${orDash(a.weekKey)}`,
    `weekPlan=${orDash(a.weekPlanId)}`,
    `ladder=${a.tags?.ladderRef ? `${a.tags.ladderRef.ladderId}/${a.tags.ladderRef.rungId}` : DASH}`,
  ]
  return parts.join(' · ')
}

const artifactMedia = (a: Artifact): string => {
  const urls = a.mediaUrls?.length ? a.mediaUrls : a.uri ? [a.uri] : []
  if (urls.length === 0) return DASH
  return urls.join('<br>')
}

const buildArtifactSection = (input: DataReviewExportInput): string[] => {
  const start = input.schoolYearStart
  const currentKey = schoolYearKey(input.schoolYear.start, start)
  const sorted = [...input.artifacts].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
  const byYear = groupBySchoolYear(sorted, (a) => a.createdAt, start)

  const lines: string[] = [
    '## 6. Artifacts index',
    '',
    countLine(input, 'artifacts', sorted.length),
    '',
  ]

  if (sorted.length === 0) {
    lines.push('_0 items — no artifacts stored for this child._', '', '---')
    return lines
  }

  for (const [yearKey, yearArtifacts] of byYear) {
    const collapse =
      input.mode !== DataReviewExportMode.FullHistory && yearKey !== currentKey
    lines.push(`### ${yearKey} — ${pluralItems(yearArtifacts.length)}`, '')

    if (collapse) {
      const byMonth = new Map<string, number>()
      for (const a of yearArtifacts) {
        const month = a.createdAt.slice(0, 7)
        byMonth.set(month, (byMonth.get(month) ?? 0) + 1)
      }
      lines.push(
        '_Current-year-only mode: prior-year detail collapsed to a count-per-month rollup._',
        '',
        ...table(
          ['Month', 'Artifacts'],
          Array.from(byMonth.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([month, n]) => [month, String(n)]),
          'No artifacts this year.',
        ),
        '',
      )
      continue
    }

    const byMonth = new Map<string, Artifact[]>()
    for (const a of yearArtifacts) {
      const month = a.createdAt.slice(0, 7)
      const list = byMonth.get(month) ?? []
      list.push(a)
      byMonth.set(month, list)
    }
    for (const [month, monthArtifacts] of Array.from(byMonth.entries()).sort(
      (a, b) => b[0].localeCompare(a[0]),
    )) {
      lines.push(
        `#### ${month} — ${pluralItems(monthArtifacts.length)}`,
        '',
        ...table(
          ['Doc id', 'Date', 'Title', 'Type', 'Subject', 'Stage', 'Links', 'Media', 'Notes / content'],
          monthArtifacts.map((a) => [
            `\`${a.id ?? MISSING}\``,
            cell(day(a.createdAt)),
            cell(a.title),
            cell(a.type),
            cell(a.tags?.subjectBucket),
            cell(a.tags?.engineStage),
            cell(artifactLinks(a)),
            artifactMedia(a),
            cell(truncate([a.notes, a.content].filter(Boolean).join(' — '), 240)),
          ]),
          'No artifacts this month.',
        ),
        '',
      )
    }
  }

  lines.push('---')
  return lines
}

const buildDadLabSection = (input: DataReviewExportInput): string[] => {
  const start = input.schoolYearStart
  const currentKey = schoolYearKey(input.schoolYear.start, start)
  const reports = [...input.dadLabReports].sort((a, b) => b.date.localeCompare(a.date))
  const linkage = computeLabLinkage(reports, input.artifacts)
  const { labArtifacts, orphanArtifacts, reportsWithoutArtifacts } = linkage

  const shown =
    input.mode === DataReviewExportMode.FullHistory
      ? reports
      : reports.filter((r) => schoolYearKey(r.date, start) === currentKey)
  const collapsed = reports.length - shown.length

  /** Human label for how one artifact resolved to a report. */
  const linkLabel = (a: Artifact): string => {
    switch (linkage.linkKindFor(a)) {
      case 'labSessionId':
        return 'yes — via `labSessionId`'
      case 'report-owned':
        return 'yes — the report lists this artifact id'
      case 'none':
        return '**NO — orphan**'
    }
  }

  return [
    '## 7. Dad Lab',
    '',
    countLine(input, 'dadLabReports', reports.length),
    '',
    ...(collapsed > 0
      ? [
          `_Current-year-only mode: ${collapsed} prior-year report(s) collapsed out of the detail table (they remain counted above and in the integrity checks)._`,
          '',
        ]
      : []),
    ...table(
      ['Doc id', 'Date', 'Title', 'Type', 'Status', 'Subject tags', 'Total minutes', 'Linked artifacts', 'Arc'],
      shown.map((r) => [
        `\`${r.id ?? MISSING}\``,
        cell(r.date),
        cell(r.title),
        cell(r.labType),
        cell(r.status),
        r.subjectTags?.length ? r.subjectTags.join(', ') : MISSING,
        r.totalMinutes == null ? DASH : String(r.totalMinutes),
        String(linkage.countForReport(r.id)),
        r.arcId ? `\`${r.arcId}\`${r.arcStepIndex != null ? ` step ${r.arcStepIndex}` : ''}` : DASH,
      ]),
      'No Dad Lab reports stored.',
    ),
    '',
    `### 7b. Lab-tagged artifacts cross-reference — ${pluralItems(labArtifacts.length)}`,
    '',
    '_The lab↔artifact link is stored on **either** side: on the artifact as `labSessionId`, or on the report as `childReports[*].artifacts[]` / `beats[*].items[].artifactId` (the FEAT-56 three-beat capture, today\'s default, writes no `labSessionId`). Both directions are resolved here, so a well-connected three-beat report is never reported as an orphan._',
    '',
    ...table(
      ['Artifact id', 'Date', 'labSessionId', 'Resolves to a report?', 'Stage', 'Beat', 'childId'],
      labArtifacts.map((a) => [
        `\`${a.id ?? MISSING}\``,
        cell(day(a.createdAt)),
        a.labSessionId ? `\`${a.labSessionId}\`` : DASH,
        linkLabel(a),
        cell(a.labStage),
        cell(a.labBeat),
        cell(a.childId),
      ]),
      'No lab-tagged artifacts stored.',
    ),
    '',
    `_Orphans: ${orphanArtifacts.length} lab artifact(s) resolving to no report · ${reportsWithoutArtifacts.length} report(s) with no linked artifact. Both directions are FLAGged in the integrity appendix with ids._`,
    '',
    '---',
  ]
}

const buildEvaluationSection = (input: DataReviewExportInput): string[] => {
  const start = input.schoolYearStart
  const currentKey = schoolYearKey(input.schoolYear.start, start)
  const guided = input.evaluationSessions
    .filter(isGuidedEval)
    .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))
  const shown =
    input.mode === DataReviewExportMode.FullHistory
      ? guided
      : guided.filter((s) => schoolYearKey(s.evaluatedAt, start) === currentKey)
  const collapsed = guided.length - shown.length

  return [
    '## 8. Evaluations (guided)',
    '',
    countLine(input, 'evaluationSessions', guided.length),
    '',
    '_"Applied to snapshot" is **INFERRED** — nothing stores an applied marker on the session doc. The inference is: the snapshot carries a priority skill matching one of this session\'s findings AND the snapshot was updated at or after the session. The absence of a real marker is itself an audit finding._',
    '',
    ...(collapsed > 0
      ? [
          `_Current-year-only mode: ${collapsed} prior-year evaluation(s) collapsed out of the detail table._`,
          '',
        ]
      : []),
    ...table(
      ['Doc id', 'Date', 'Domain', 'Status', 'Findings', 'Recs', 'Frontier', 'Applied to snapshot? (inferred)', 'Learner-model writeback?'],
      shown.map((s) => [
        `\`${s.id ?? MISSING}\``,
        cell(day(s.evaluatedAt)),
        cell(s.domain),
        cell(s.status),
        String(s.findings.length),
        String(s.recommendations.length),
        cell(truncate(s.frontier, 200)),
        evalLooksAppliedToSnapshot(s, input.skillSnapshot) ? 'yes' : 'no',
        modelHasEvalWriteback(input.learnerModel, s.id)
          ? 'yes (FEAT-76 `eval` evidence found)'
          : 'no — either never applied or predates the FEAT-76 writeback',
      ]),
      'No guided evaluation sessions stored.',
    ),
    '',
    '---',
  ]
}

const DISPOSITION_KEYS: DispositionKey[] = [
  'curiosity',
  'persistence',
  'articulation',
  'selfAwareness',
  'ownership',
]

const buildActivitySection = (input: DataReviewExportInput): string[] => {
  const quests = input.evaluationSessions.filter((s) => s.sessionType === 'interactive')
  const fluency = input.evaluationSessions.filter((s) => s.sessionType === 'fluency')
  const lastOf = (list: DataReviewEvaluationSession[]): string =>
    list.length === 0
      ? DASH
      : day([...list].sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))[0].evaluatedAt)

  const lines: string[] = [
    '## 9. Quest / Mine, dispositions, XP',
    '',
    '### 9a. Session counts',
    '',
    ...table(
      ['Kind', 'Sessions', 'Last activity'],
      [
        ['Knowledge Mine quests (`sessionType: interactive`)', String(quests.length), lastOf(quests)],
        ['Fluency practice (`sessionType: fluency`)', String(fluency.length), lastOf(fluency)],
      ],
      'No sessions stored.',
    ),
    '',
  ]

  // Quest breakdown by mode.
  const byMode = new Map<string, number>()
  for (const q of quests) byMode.set(q.questMode ?? 'unspecified', (byMode.get(q.questMode ?? 'unspecified') ?? 0) + 1)
  lines.push(
    ...table(
      ['Quest mode', 'Sessions'],
      Array.from(byMode.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([mode, n]) => [cell(mode), String(n)]),
      'No quest sessions to break down by mode.',
    ),
    '',
  )

  // Dispositions.
  const disp = input.disposition
  const result = disp?.cache?.result
  lines.push('### 9b. Disposition profile', '')
  if (!result) {
    lines.push('_0 items — no cached AI disposition on the child document._', '')
  } else {
    lines.push(
      `_generatedAt ${orDash(disp?.cache?.generatedAt)} · profileDate ${orDash(result.profileDate)} · periodWeeks ${orDash(result.periodWeeks)}._`,
      '',
      ...table(
        ['Disposition', 'Level', 'Trend', 'AI narrative', 'Parent override', 'Overridden at'],
        DISPOSITION_KEYS.map((key) => {
          const entry = result.dispositions[key]
          const override = disp?.overrides?.[key]
          return [
            key,
            cell(entry?.level),
            cell(entry?.trend),
            cell(truncate(entry?.narrative, 240)),
            override ? cell(truncate(override.text, 240)) : DASH,
            override ? cell(override.overriddenAt) : DASH,
          ]
        }),
        'No dispositions in the cached result.',
      ),
      '',
      `**celebration:** ${truncate(result.celebration, 400)}`,
      '',
      `**nudge:** ${truncate(result.nudge, 400)}`,
      '',
      `**parentNote:** ${truncate(result.parentNote, 400)}`,
      '',
    )
  }

  // XP — counts, never framed as a score.
  const totals = input.xpTotals
  const events = input.xpEvents
  const byType = new Map<string, { count: number; amount: number }>()
  for (const e of events) {
    const key = `${e.currencyType ?? 'xp'}:${e.type ?? e.category ?? 'unspecified'}`
    const bucket = byType.get(key) ?? { count: 0, amount: 0 }
    bucket.count += 1
    bucket.amount += e.amount ?? 0
    byType.set(key, bucket)
  }

  lines.push(
    '### 9c. XP ledger',
    '',
    countLine(input, 'xpLedger', events.length),
    '',
    '_These are **counts of recorded events**, not a score and not an assessment. The ledger is an invariant — this export only reads it._',
    '',
    ...table(
      ['Field', 'Value'],
      totals
        ? [
            ['totalXp', String(totals.totalXp ?? 0)],
            ['sources.routines', String(totals.sources?.routines ?? 0)],
            ['sources.quests', String(totals.sources?.quests ?? 0)],
            ['sources.books', String(totals.sources?.books ?? 0)],
            ['lastUpdatedAt', orDash(totals.lastUpdatedAt)],
          ]
        : [],
      `No cumulative xpLedger/${input.child.id} document stored.`,
    ),
    '',
    `**Per-event rollup by source category — ${pluralItems(events.length)}**`,
    '',
    ...table(
      ['Currency : type', 'Events', 'Summed amount'],
      Array.from(byType.entries())
        .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
        .map(([key, v]) => [`\`${key}\``, String(v.count), String(v.amount)]),
      'No per-event xpLedger documents stored.',
    ),
    '',
    '---',
  )

  return lines
}

const buildIntegritySection = (input: DataReviewExportInput): string[] => {
  const checks = computeIntegrityChecks(input)
  const flags = checks.filter((c) => c.status === 'FLAG').length
  return [
    '## Integrity checks',
    '',
    `_${checks.length} deterministic check(s) — ${checks.length - flags} PASS, ${flags} FLAG. Every FLAG carries the doc id(s) a follow-up fix run needs._`,
    '',
    ...table(
      ['Status', 'Check', 'Detail'],
      checks.map((c) => [
        c.status === 'PASS' ? 'PASS' : '**FLAG**',
        `\`${c.id}\` — ${cell(c.label)}`,
        cell(c.detail),
      ]),
      'No checks ran.',
    ),
    '',
    `### Collection row counts`,
    '',
    ...table(
      ['Collection', 'Rows kept (this child)', 'Documents scanned', 'Server-side total', 'Cap hit?', 'Note'],
      input.reads.map((r) => [
        `\`${r.collection}\``,
        String(r.shown),
        r.scanned == null ? DASH : String(r.scanned),
        r.total == null ? DASH : String(r.total),
        r.cap == null ? 'no' : `**yes (cap ${r.cap})**`,
        cell(r.note),
      ]),
      'The loader reported no collection reads.',
    ),
    '',
  ]
}

// ─── The builder ─────────────────────────────────────────────────────────────

/**
 * Build one child's data-review markdown file. Pure: same inputs → same string.
 * Sparse-native — every section renders (with `0 items`) against empty inputs,
 * so a missing collection is never mistaken for a missing section.
 */
export const buildDataReviewExport = (input: DataReviewExportInput): string =>
  [
    ...buildHeader(input),
    '',
    ...buildWorkbookSection(input),
    '',
    ...buildLearnerModelSection(input),
    '',
    ...buildSkillSnapshotSection(input),
    '',
    ...buildSightWordSection(input),
    '',
    ...buildHoursSection(input),
    '',
    ...buildArtifactSection(input),
    '',
    ...buildDadLabSection(input),
    '',
    ...buildEvaluationSection(input),
    '',
    ...buildActivitySection(input),
    '',
    ...buildIntegritySection(input),
  ].join('\n')

/** Download filename for one child's export. */
export const dataReviewExportFilename = (
  childName: string,
  generatedAt: string,
  mode: DataReviewExportMode,
): string => {
  const slug = childName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const scope = mode === DataReviewExportMode.FullHistory ? 'full-history' : 'current-year'
  return `${slug || 'child'}-data-review-${scope}-${day(generatedAt)}.md`
}
