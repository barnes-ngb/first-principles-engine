// ── Foundations Review Chat persona (FEAT-53, amendment A) ───────────────
//
// The 2a UI shipped with a placeholder copied from shellyChat that named a
// person ("Reply to Shelly…") — a mirroring bug. The review assistant is NOT a
// person: it is the family's foundations review guide. These constants are the
// single source of its naming so nothing drifts back to a person's name.
//
// - PERSONA_NAME names the assistant wherever a name is needed (header sub-text,
//   the "thinking" line, error copy, the CF system-prompt self-reference).
// - PLACEHOLDER_TEXT names no person — the composer input placeholder.
//
// Owner-confirmed 2026-07-04. Warm, but honest about being the engine.

export const PERSONA_NAME = 'Learning Engine'
export const PLACEHOLDER_TEXT = 'Reply…'
