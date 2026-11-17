import { describe, expect, it, vi } from 'vitest'

// `versionBelongsTo` is a pure predicate that happens to live beside the
// subscribe hook, so the collection helper is stubbed rather than initialising
// Firebase for a test about string comparison.
vi.mock('../../core/firebase/firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: () => ({ __col: 'buildStudioVersions' }),
}))

import type { BuildStudioVersion } from '../../core/types/buildStudio'
import { savedLine } from './BuildStudioVersionShelf'
import { versionBelongsTo } from './useBuildStudioVersions'

/**
 * The shelf's two repairs (LOCAL-BUILD-001 #6 and #10).
 *
 * Pure functions, pulled out of the component so they can be exhausted without
 * mounting anything.
 */

const CHILD = 'child-lincoln'
const PROJECT = 'apple-dash-starter'

function row(overrides: Partial<BuildStudioVersion> = {}): BuildStudioVersion {
  return {
    id: `${CHILD}__${PROJECT}__v-1`,
    childId: CHILD,
    projectId: PROJECT,
    versionId: 'v-1',
    label: 'One more life',
    createdAt: '2026-11-18T01:30:00.000Z',
    sourceArchive: '{}',
    byteSize: 2,
    fileCount: 1,
    sourceDigest: '2-abc',
    ...overrides,
  }
}

/**
 * The P2 repair. `requestOpen` checked only the child, so a row for another
 * project under the same child could load and be recorded as Apple Dash.
 *
 * POSITIVE CONTROL: drop the `projectId` comparison and the second case passes.
 */
describe('a row belongs to a child AND a project AND its own id', () => {
  it('accepts a well-formed row for this child and project', () => {
    expect(versionBelongsTo(row(), CHILD, PROJECT)).toBe(true)
  })

  it('refuses a same-child row from ANOTHER project', () => {
    expect(
      versionBelongsTo(
        row({ projectId: 'some-other-game', id: `${CHILD}__some-other-game__v-1` }),
        CHILD,
        PROJECT,
      ),
    ).toBe(false)
  })

  it('refuses another child’s row', () => {
    expect(
      versionBelongsTo(
        row({ childId: 'child-london', id: `child-london__${PROJECT}__v-1` }),
        CHILD,
        PROJECT,
      ),
    ).toBe(false)
  })

  it('refuses a row whose FIELDS and PATH disagree', () => {
    // Written under one identity, stored at another. Neither half is trusted
    // alone, which is why the document id is checked too.
    expect(versionBelongsTo(row({ id: `child-london__${PROJECT}__v-1` }), CHILD, PROJECT)).toBe(
      false,
    )
    expect(versionBelongsTo(row({ id: `${CHILD}__${PROJECT}__v-9` }), CHILD, PROJECT)).toBe(
      false,
    )
  })

  it('refuses a row with no version identity at all', () => {
    expect(versionBelongsTo(row({ versionId: '' }), CHILD, PROJECT)).toBe(false)
  })
})

/**
 * The P2 repair. `createdAt.slice(0, 10)` is the UTC date, printed beside a
 * `formatClockTime` reading in `America/Chicago` — so a 7 p.m. Central save
 * showed TOMORROW's date next to this evening's time.
 *
 * POSITIVE CONTROL: put the slice back and the first case fails.
 */
describe('the saved stamp reads one clock', () => {
  it('shows the family’s own date for a late-evening Central save', () => {
    // 2026-11-18T01:30Z is 2026-11-17 19:30 in America/Chicago.
    const line = savedLine('2026-11-18T01:30:00.000Z')
    expect(line).toContain('Nov 17')
    expect(line).not.toContain('Nov 18')
    expect(line).toMatch(/7:30/)
  })

  it('shows the same date and time for a midday save', () => {
    const line = savedLine('2026-11-17T18:00:00.000Z')
    expect(line).toContain('Nov 17')
    expect(line).toMatch(/12:00/)
  })

  it('says it does not know rather than printing a wrong date', () => {
    expect(savedLine(undefined)).toBe('Saved — time unknown')
    expect(savedLine('')).toBe('Saved — time unknown')
    expect(savedLine('not a date')).toBe('Saved — time unknown')
  })
})
