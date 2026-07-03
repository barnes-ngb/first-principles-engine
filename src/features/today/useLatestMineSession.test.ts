import { describe, expect, it } from 'vitest'

import { selectLatestMineSessionToday, type MineSessionLike } from './useLatestMineSession'

const TODAY = '2026-07-03'

function session(overrides: Partial<MineSessionLike>): MineSessionLike {
  return {
    childId: 'c1',
    domain: 'reading',
    status: 'complete',
    messages: [],
    findings: [],
    recommendations: [],
    evaluatedAt: `${TODAY}T10:00:00.000Z`,
    sessionType: 'interactive',
    ...overrides,
  } as MineSessionLike
}

describe('selectLatestMineSessionToday', () => {
  it("returns today's interactive session (complete or partial)", () => {
    const complete = session({ evaluatedAt: `${TODAY}T09:00:00.000Z` })
    const partial = session({ status: 'partial', evaluatedAt: `${TODAY}T11:00:00.000Z` })
    expect(selectLatestMineSessionToday([complete, partial], TODAY)).toBe(partial)
  })

  it('picks the most recent session when multiple exist today', () => {
    const early = session({ evaluatedAt: `${TODAY}T08:00:00.000Z` })
    const late = session({ evaluatedAt: `${TODAY}T15:30:00.000Z` })
    expect(selectLatestMineSessionToday([early, late], TODAY)).toBe(late)
  })

  it('returns null when there is no session today', () => {
    expect(selectLatestMineSessionToday([], TODAY)).toBeNull()
  })

  it('returns null when the only session is from an earlier day', () => {
    const older = session({ evaluatedAt: '2026-07-01T10:00:00.000Z' })
    expect(selectLatestMineSessionToday([older], TODAY)).toBeNull()
  })

  it('ignores non-interactive sessions dated today', () => {
    const evalChat = session({ sessionType: 'evaluation' })
    expect(selectLatestMineSessionToday([evalChat], TODAY)).toBeNull()
  })

  it('ignores in-progress / abandoned sessions', () => {
    const inProgress = session({ status: 'in-progress' })
    const abandoned = session({ status: 'abandoned' })
    expect(selectLatestMineSessionToday([inProgress, abandoned], TODAY)).toBeNull()
  })
})
