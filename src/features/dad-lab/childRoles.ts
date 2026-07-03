import type { Child, ChildLabReport, DadLabReport } from '../../core/types'

/**
 * Name-agnostic role/report helpers for Dad Lab (ARCH-40).
 *
 * `DadLabReport` historically hardcoded `lincolnRole`/`londonRole` and keyed
 * `childReports` by the child's lowercase name. That breaks for any family with
 * different names or a third child. These pure helpers resolve roles and reports
 * by `childId` while keeping stored legacy-shaped docs rendering forever.
 */

/** Legacy field on the report keyed by the well-known Barnes child names. */
const LEGACY_ROLE_BY_NAME: Record<string, keyof Pick<DadLabReport, 'lincolnRole' | 'londonRole'>> = {
  lincoln: 'lincolnRole',
  london: 'londonRole',
}

/**
 * Resolve every child's role text keyed by `childId`.
 *
 * Prefers the modern `childRoles` map. For legacy docs (or gaps in a mixed doc),
 * falls back to mapping `lincolnRole`/`londonRole` onto whichever child's name
 * matches (case-insensitive). `childRoles` wins on any conflict, so a doc that
 * has both shapes renders from the new field.
 */
export function normalizeChildRoles(
  report: Pick<DadLabReport, 'childRoles' | 'lincolnRole' | 'londonRole'>,
  children: Child[],
): Record<string, string> {
  const roles: Record<string, string> = {}

  // Legacy fallback first (lower precedence).
  for (const child of children) {
    const legacyKey = LEGACY_ROLE_BY_NAME[child.name.toLowerCase()]
    const value = legacyKey ? report[legacyKey] : undefined
    if (value) roles[child.id] = value
  }

  // Modern shape overrides legacy on conflict.
  if (report.childRoles) {
    for (const [childId, value] of Object.entries(report.childRoles)) {
      if (value) roles[childId] = value
    }
  }

  return roles
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Match a `Key: value` line in an AI response block, case-insensitively. */
function matchLabeledLine(block: string, key: string): string {
  const match = block.match(new RegExp(`${escapeRegExp(key)}:\\s*(.+)`, 'i'))
  return match?.[1]?.trim() ?? ''
}

/**
 * Parse per-child role text out of an AI suggestion block into a
 * `childId -> role` map. For each child, prefers the `"«name»'s role:"` line
 * and falls back to a bare `"«name»:"` line — the same two lookups the inline
 * parsers used, now driven by the children list instead of hardcoded names.
 */
export function parseChildRoles(block: string, children: Child[]): Record<string, string> {
  const roles: Record<string, string> = {}
  for (const child of children) {
    const role =
      matchLabeledLine(block, `${child.name}'s role`) || matchLabeledLine(block, child.name)
    if (role) roles[child.id] = role
  }
  return roles
}

/**
 * Build the role-request lines for a Dad Lab suggestion prompt, one per child,
 * so the AI is asked for `"«name»'s role: [...]"` for every child in the family
 * rather than two hardcoded names.
 */
export function buildRoleRequestLines(children: Child[]): string {
  return children.map((child) => `${child.name}'s role: [what ${child.name} does]`).join('\n')
}

/**
 * Find a child's report regardless of whether `childReports` is keyed by
 * Firestore ID, lowercase name, or exact name. Lifts the triple-fallback that
 * `LabReportForm` and `KidLabView` scattered inline. Returns an empty report
 * (never `undefined`) so callers render blank rather than crash.
 */
export function resolveChildReport(
  childReports: Record<string, ChildLabReport> | undefined,
  child: Child,
): ChildLabReport {
  const reports = childReports ?? {}
  if (reports[child.id]) return reports[child.id]
  const nameKey = child.name.toLowerCase()
  if (reports[nameKey]) return reports[nameKey]
  if (reports[child.name]) return reports[child.name]
  return { artifacts: [] }
}
