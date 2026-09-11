import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync(resolve(__dirname, './useBook.ts'), 'utf8')

/**
 * Codex round 1, P2 — the unmount hours write must land AFTER the flushed edit.
 *
 * React runs a component's effect cleanups in the order the effects were
 * declared, and UX-353 made `useDebounce` flush its pending call on unmount
 * rather than dropping it. `persist` writes the whole book with a **non-merge**
 * `setDoc` carrying the `totalMinutes` this hook last read, so with the hours
 * effect declared first the two unmount writes queued on one document in the
 * wrong order: the merge recorded the session's minutes and the flushed
 * full-document write then put the old total back — leaving `books.totalMinutes`
 * disagreeing with the `hours` entry `logBookHours` had just written.
 *
 * The fix is an ORDER, which means the thing to assert is the order. A render
 * test would prove it for one arrangement of a 2,100-line hook and say nothing
 * about the next person moving an effect; this fails the moment the hours write
 * is declared above the debounce again, which is the whole hazard.
 *
 * POSITIVE CONTROL: move the `logBookHours` effect back above
 * `const debouncedPersist = useDebounce(persist, 500)` and the first case fails.
 */
describe('useBook — unmount write order (Codex round 1, P2)', () => {
  it('declares the hours write after the debounced persist', () => {
    const debounceAt = SRC.indexOf('const debouncedPersist = useDebounce(persist, 500)')
    const hoursAt = SRC.indexOf('logBookHours(familyId, book.childId, elapsed')

    expect(debounceAt).toBeGreaterThan(-1)
    expect(hoursAt).toBeGreaterThan(-1)
    expect(
      hoursAt,
      'the unmount hours write must be declared AFTER the debounced persist, ' +
        "or its cleanup runs first and the flushed full-document write puts the old totalMinutes back",
    ).toBeGreaterThan(debounceAt)
  })

  it('still writes the minutes as a MERGE, so the flush cannot be what carries them', () => {
    // The two writes stay exactly as they were; this change is the order and
    // nothing else. No hours math, no fold, no rounding moved.
    expect(SRC).toMatch(
      /totalMinutes: newTotal, updatedAt: new Date\(\)\.toISOString\(\) \}, \{ merge: true \}/,
    )
    expect(SRC).toMatch(/const newTotal = \(book\.totalMinutes \?\? 0\) \+ elapsed/)
  })

  it('leaves exactly one unmount hours write — not a copy in each position', () => {
    // Its declaration, and exactly one call site.
    expect(SRC.match(/logBookHours\(/g) ?? []).toHaveLength(2)
    expect(SRC).toMatch(/async function logBookHours\(/)
  })
})
