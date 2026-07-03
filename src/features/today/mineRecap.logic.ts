import type { EvaluationFinding } from '../../core/types/evaluation'

/**
 * True when a session `summary` is the score-y client fallback (or empty).
 * The Knowledge Mine's fallback summary reads like
 * "Interactive reading quest: 4/6 correct, reached level 3" — a
 * correct/total + level line the charter's diamonds-not-scores framing keeps
 * off the parent recap. When it matches, the card shows a plain no-shame line.
 */
export function isScoreyFallbackSummary(summary?: string): boolean {
  if (!summary || !summary.trim()) return true
  return (
    /^interactive\b/i.test(summary.trim()) ||
    /\d+\s*\/\s*\d+/.test(summary) || // X/Y correct
    /reached level/i.test(summary) ||
    /\d+\s*%/.test(summary) // percentage
  )
}

/** Domain slug → calm display label (e.g. 'reading' → 'Reading'). */
export function domainLabel(domain: string): string {
  if (!domain) return 'Learning'
  return domain.charAt(0).toUpperCase() + domain.slice(1)
}

/** Dedupe skill labels, preserving first-seen order. */
export function uniqueSkills(findings: EvaluationFinding[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const f of findings) {
    const skill = (f.skill ?? '').trim()
    if (skill && !seen.has(skill)) {
      seen.add(skill)
      out.push(skill)
    }
  }
  return out
}
