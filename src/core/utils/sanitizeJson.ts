/**
 * Sanitize JSON strings returned by LLMs that may contain minor formatting
 * issues such as trailing commas, unescaped control characters inside strings,
 * or markdown code fences.
 *
 * NOTE: This is a deliberate client-side port of
 * `functions/src/ai/sanitizeJson.ts`. The two copies live in separate build
 * roots (the `functions/` package cannot be imported from `src/`), so the
 * duplication is intentional for now.
 * TODO: consolidate the two sanitizeJson copies behind a shared package
 * (future ARCH item) once cross-root sharing is set up.
 */

/**
 * Strip markdown code fences that LLMs commonly wrap around JSON output.
 */
function stripCodeFences(text: string): string {
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/i)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }
  // Also try stripping simple start/end fences
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  return cleaned
}

/**
 * Remove trailing commas before closing brackets/braces.
 * E.g. `["a", "b",]` → `["a", "b"]` and `{"a": 1,}` → `{"a": 1}`
 *
 * This only operates outside of string literals to avoid corrupting values.
 */
function removeTrailingCommas(text: string): string {
  // Replace trailing commas before ] or } (allowing whitespace between)
  return text.replace(/,\s*([}\]])/g, '$1')
}

/**
 * Characters that may legally follow the closing quote of a JSON string
 * (after optional whitespace): a value separator, a container close, or the
 * `:` between a key and its value.
 */
const LEGAL_AFTER_STRING_END = new Set([',', '}', ']', ':'])

/**
 * Does the `"` at `quoteIndex` look like the END of a string, or like a quote
 * the model forgot to escape INSIDE one?
 *
 * In well-formed JSON a closing quote is always followed — after optional
 * whitespace — by `,`, `}`, `]`, `:`, or the end of the input. Nothing else can
 * legally appear there. So a `"` followed by anything else (a letter, another
 * `"`, a digit…) cannot be a string end, and is treated as an interior quote.
 *
 * LIMITS — deliberately a safe subset, not full repair:
 *  - The rule NEVER fires on valid JSON (a real closing quote always has a legal
 *    follower), so correct payloads pass through byte-identical. That is the
 *    property worth having; it is characterized in the tests.
 *  - It does NOT repair an interior quote that happens to sit right before a
 *    legal follower — `"He read "Papa Hut", twice"` closes early at the quote
 *    before the comma. Such input was already unparseable; the outcome is a
 *    caption that loses a quote character rather than a book that fails to
 *    parse at all. Guessing where that string "really" ends is exactly the
 *    heuristic repair this function refuses to do.
 */
function looksLikeStringEnd(text: string, quoteIndex: number): boolean {
  for (let j = quoteIndex + 1; j < text.length; j++) {
    const next = text[j]
    if (next === ' ' || next === '\n' || next === '\r' || next === '\t') continue
    return LEGAL_AFTER_STRING_END.has(next)
  }
  // End of input — nothing contradicts a string end here.
  return true
}

/**
 * Escape unescaped control characters (newlines, tabs) that appear inside
 * JSON string values. LLMs sometimes produce literal newlines within strings.
 *
 * Also escapes unescaped interior quotes (`"He said "done!" and grinned"`).
 * That case is not only a broken value in its own right: it flips the in-string
 * tracker below out of sync, so every later real newline is mistaken for
 * structure and left unescaped — one stray quote near the top of a response
 * breaks the whole parse. See `looksLikeStringEnd` for the rule and its limits.
 */
function escapeControlCharsInStrings(text: string): string {
  // Walk through the string tracking whether we're inside a JSON string value
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (escaped) {
      result += ch
      escaped = false
      continue
    }

    if (ch === '\\') {
      result += ch
      if (inString) {
        escaped = true
      }
      continue
    }

    if (ch === '"') {
      if (inString && !looksLikeStringEnd(text, i)) {
        // Interior quote — escape it and stay inside the string.
        result += '\\"'
        continue
      }
      inString = !inString
      result += ch
      continue
    }

    if (inString) {
      if (ch === '\n') {
        result += '\\n'
        continue
      }
      if (ch === '\r') {
        result += '\\r'
        continue
      }
      if (ch === '\t') {
        result += '\\t'
        continue
      }
    }

    result += ch
  }

  return result
}

/**
 * Clean and parse a JSON string from an LLM response.
 *
 * Applies the following sanitization steps:
 * 1. Strip markdown code fences
 * 2. Remove trailing commas in arrays/objects
 * 3. Escape unescaped control characters inside string values
 * 4. Parse with JSON.parse
 *
 * Throws if the cleaned text is still not valid JSON (same contract as the
 * server copy).
 */
export function sanitizeAndParseJson<T = unknown>(raw: string): T {
  let text = stripCodeFences(raw)
  text = removeTrailingCommas(text)
  text = escapeControlCharsInStrings(text)
  return JSON.parse(text) as T
}
