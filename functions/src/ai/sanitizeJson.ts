/**
 * Sanitize JSON strings returned by LLMs that may contain minor formatting
 * issues such as trailing commas, unescaped control characters inside strings,
 * or markdown code fences.
 *
 * NOTE: A deliberate client-side port lives at `src/core/utils/sanitizeJson.ts`
 * (separate build root — `functions/` cannot be imported from `src/`).
 * TODO: consolidate the two sanitizeJson copies behind a shared package
 * (future ARCH item) once cross-root sharing is set up.
 */

/**
 * Strip markdown code fences that LLMs commonly wrap around JSON output.
 */
function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  // Also try stripping simple start/end fences
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  return cleaned;
}

/**
 * Remove trailing commas before closing brackets/braces.
 * E.g. `["a", "b",]` → `["a", "b"]` and `{"a": 1,}` → `{"a": 1}`
 *
 * This only operates outside of string literals to avoid corrupting values.
 */
function removeTrailingCommas(text: string): string {
  // Replace trailing commas before ] or } (allowing whitespace between)
  return text.replace(/,\s*([}\]])/g, "$1");
}

/**
 * Candidate JSON spans for text that carries a leading or trailing preamble
 * (e.g. `Here is the JSON:\n{ ... }` or `{ ... }\nHope that helps!`). Returns an
 * object span (first `{` → last `}`) AND an array span (first `[` → last `]`)
 * when each exists, object first — the caller tries each until one parses.
 *
 * Trying BOTH rather than choosing by the first bracket avoids mis-slicing a
 * bracketed aside: `Here is the JSON [per schema]:\n{ ... }` leads with `[`, but
 * the real payload is the object; the object span parses and the aside span does
 * not, so the object wins.
 *
 * FALLBACK only — `sanitizeAndParseJson` runs this after a direct parse throws,
 * so a response that already parses cleanly is never re-sliced.
 */
function candidateJsonSpans(text: string): string[] {
  const spans: string[] = [];
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) spans.push(text.slice(objStart, objEnd + 1));
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) spans.push(text.slice(arrStart, arrEnd + 1));
  return spans;
}

/**
 * Escape unescaped control characters (newlines, tabs) that appear inside
 * JSON string values. LLMs sometimes produce literal newlines within strings.
 */
function escapeControlCharsInStrings(text: string): string {
  // Walk through the string tracking whether we're inside a JSON string value
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      result += ch;
      if (inString) {
        escaped = true;
      }
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      if (ch === "\n") {
        result += "\\n";
        continue;
      }
      if (ch === "\r") {
        result += "\\r";
        continue;
      }
      if (ch === "\t") {
        result += "\\t";
        continue;
      }
    }

    result += ch;
  }

  return result;
}

/**
 * Clean and parse a JSON string from an LLM response.
 *
 * Applies the following sanitization steps:
 * 1. Strip markdown code fences
 * 2. Remove trailing commas in arrays/objects
 * 3. Escape unescaped control characters inside string values
 * 4. Parse with JSON.parse
 * 5. On failure, strip a leading/trailing preamble by extracting the outermost
 *    JSON span and retry once (fences don't cover `Here is the JSON: { ... }`).
 */
export function sanitizeAndParseJson<T = unknown>(raw: string): T {
  let text = stripCodeFences(raw);
  text = removeTrailingCommas(text);
  text = escapeControlCharsInStrings(text);
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    // The fence remover doesn't strip conversational preamble/suffix text around
    // the payload. Try each candidate JSON span (object, then array) and return
    // the first that parses — the earlier passes (trailing commas, control chars)
    // already ran over `text`, so the slice is clean. Only reached after a direct
    // parse fails, so valid JSON is untouched.
    for (const span of candidateJsonSpans(text)) {
      if (span === text) continue;
      try {
        return JSON.parse(span) as T;
      } catch {
        /* try the next candidate span */
      }
    }
    throw err;
  }
}
