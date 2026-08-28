import { describe, expect, it } from 'vitest'

import { PROGRESS_TABS, progressPath } from './progressNav'

describe('progressPath — UX-52', () => {
  it('names the tab so the parent lands where the link says', () => {
    expect(progressPath(PROGRESS_TABS.MonthlyBooks)).toBe('/progress?tab=monthly-books')
    expect(progressPath(PROGRESS_TABS.SkillSnapshot)).toBe('/progress?tab=skill-snapshot')
  })

  it('carries ?diag=1 through — a bare path silently undid the parent’s choice', () => {
    expect(progressPath(PROGRESS_TABS.MonthlyBooks, new URLSearchParams('diag=1'))).toBe(
      '/progress?tab=monthly-books&diag=1',
    )
  })

  it('carries the flag even with no tab opinion', () => {
    expect(progressPath(undefined, new URLSearchParams('diag=1'))).toBe('/progress?diag=1')
  })

  it('leaks nothing else from the calling page', () => {
    const from = new URLSearchParams('diag=1&date=2026-08-26&childId=lincoln&week=2026-08-24')
    expect(progressPath(PROGRESS_TABS.Foundations, from)).toBe(
      '/progress?tab=foundations&diag=1',
    )
  })

  it('is a bare path when there is nothing to carry', () => {
    expect(progressPath()).toBe('/progress')
    expect(progressPath(undefined, new URLSearchParams('date=2026-08-26'))).toBe('/progress')
  })
})
