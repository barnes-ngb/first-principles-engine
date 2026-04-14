// ── Disposition Profile Types ─────────────────────────────────

export interface DispositionEntry {
  level: 'growing' | 'steady' | 'emerging' | 'not-yet-visible'
  narrative: string
  trend: 'up' | 'stable' | 'down' | 'insufficient-data'
}

export interface DispositionResult {
  profileDate: string
  periodWeeks: number
  dispositions: {
    curiosity: DispositionEntry
    persistence: DispositionEntry
    articulation: DispositionEntry
    selfAwareness: DispositionEntry
    ownership: DispositionEntry
  }
  celebration: string
  nudge: string
  parentNote: string
}

export type DispositionKey = keyof DispositionResult['dispositions']

// ── Parent Override (separate storage from AI result) ─────────

/** Parent override on an AI disposition narrative. Stored separately from the AI-generated result. */
export interface DispositionNarrativeOverride {
  text: string
  overriddenBy: string
  overriddenAt: string
  note?: string
}

/** Per-disposition overrides. Stored on the child document as `dispositionOverrides`. */
export type DispositionOverrides = {
  [K in DispositionKey]?: DispositionNarrativeOverride
}

/** Shape of the cached AI disposition on the child document. */
export interface DispositionCache {
  result: DispositionResult
  generatedAt: string
}

/**
 * Returns the effective narrative text for a disposition, preferring
 * parentOverride over the AI's original narrative.
 */
export function effectiveDispositionText(
  entry: DispositionEntry,
  override?: DispositionNarrativeOverride,
): string {
  return override?.text ?? entry.narrative
}
