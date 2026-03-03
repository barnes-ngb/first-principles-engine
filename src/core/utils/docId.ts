const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Extract the `date` portion from a composite Firestore document ID.
 * Handles both `{date}_{childId}` (new) and `{childId}_{date}` (legacy)
 * formats by checking which segment looks like a YYYY-MM-DD date.
 */
export const parseDateFromDocId = (docId: string): string => {
  const prefix = docId.slice(0, 10)
  if (DATE_RE.test(prefix)) return prefix
  const suffix = docId.slice(-10)
  if (DATE_RE.test(suffix)) return suffix
  return docId
}

/**
 * Derive a childId from a Firestore document ID that encodes both date and
 * childId separated by `_`.  Handles both `${date}_${childId}` and
 * `${childId}_${date}` formats.
 */
export function deriveChildIdFromDocId(docId: string): string | undefined {
  const idx = docId.indexOf('_')
  if (idx === -1) return undefined

  const first = docId.slice(0, idx)
  const rest = docId.slice(idx + 1)

  if (DATE_RE.test(first) && rest.length > 0) return rest
  if (DATE_RE.test(rest) && first.length > 0) return first
  return undefined
}
