import { describe, it, expect } from 'vitest'

import { SubjectBucket } from '../../core/types/enums'
import { WatchVideoStatus } from '../../core/types/watch'
import type { ChatAction } from '../../core/types'
import {
  WATCH_NOTICES,
  describeVetInShape,
  describeWatchAction,
  isWatchAction,
  resolveWatchAction,
  resolveWatchActionForDisplay,
  watchActionFootnote,
  type ChatWatchVideo,
  type PlannableDay,
  type WatchAction,
} from './watchActions'

// ── Fixtures ─────────────────────────────────────────────────────────────────
//
// The module is pure and holds no clock, so the plannable window is supplied.
// These are fixed dates on purpose: the WINDOW's correctness (is it really this
// week and next, in the family's zone) belongs to `useChatWeekDays.test.ts`,
// which pins TZ for it. Here the question is only "does the resolver accept
// exactly the days it was handed".

const PLANNABLE: PlannableDay[] = [
  { dateKey: '2026-08-17', label: 'Monday' },
  { dateKey: '2026-08-18', label: 'Tuesday' },
  { dateKey: '2026-08-19', label: 'Wednesday' },
  { dateKey: '2026-08-20', label: 'Thursday' },
  { dateKey: '2026-08-21', label: 'Friday' },
  { dateKey: '2026-08-24', label: 'next Monday' },
  { dateKey: '2026-08-25', label: 'next Tuesday' },
  { dateKey: '2026-08-26', label: 'next Wednesday' },
  { dateKey: '2026-08-27', label: 'next Thursday' },
  { dateKey: '2026-08-28', label: 'next Friday' },
]

const GLACIERS: ChatWatchVideo = {
  id: 'vid_glacier',
  youtubeId: 'dQw4w9WgXcQ',
  title: 'How Glaciers Move',
  plannedMinutes: 9,
  subjectBucket: SubjectBucket.Science,
  childId: 'lincoln1',
}

const RETIRED_VOLCANO: ChatWatchVideo = {
  id: 'vid_volcano',
  youtubeId: 'aBcDeFgHiJk',
  title: 'Inside a Volcano',
  plannedMinutes: 12,
  subjectBucket: SubjectBucket.Science,
  childId: 'both',
  status: WatchVideoStatus.Retired,
}

const LIBRARY = [GLACIERS, RETIRED_VOLCANO]

const VET_IN: Extract<WatchAction, { kind: 'vetInVideo' }> = {
  kind: 'vetInVideo',
  childId: 'lincoln1',
  youtubeId: 'zZzZzZzZzZz',
  title: 'How Rivers Carve Canyons',
  plannedMinutes: 11,
  subjectBucket: SubjectBucket.Science,
  why: 'He asked how the Grand Canyon got there',
  suggestedFromUrl: 'https://www.youtube.com/watch?v=zZzZzZzZzZz',
}

const PLAN: Extract<WatchAction, { kind: 'planVideoOnDay' }> = {
  kind: 'planVideoOnDay',
  childId: 'lincoln1',
  watchVideoId: 'vid_glacier',
  dateKey: '2026-08-25',
}

describe('isWatchAction (FEAT-149)', () => {
  it('narrows exactly the two watch kinds and nothing else', () => {
    expect(isWatchAction(VET_IN)).toBe(true)
    expect(isWatchAction(PLAN)).toBe(true)
    const sightWord: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'because' }
    expect(isWatchAction(sightWord)).toBe(false)
  })
})

describe('resolveWatchAction — vetInVideo (FEAT-149)', () => {
  it('resolves a video that is not in the library yet', () => {
    const res = resolveWatchAction(VET_IN, LIBRARY, PLANNABLE, true)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.resolved.action).toBe(VET_IN)
  })

  it('resolves against an EMPTY library — nothing is a duplicate of nothing', () => {
    expect(resolveWatchAction(VET_IN, [], PLANNABLE, true).ok).toBe(true)
  })

  it('drops a duplicate of an ACTIVE video and offers to plan it instead', () => {
    const dup = { ...VET_IN, youtubeId: GLACIERS.youtubeId }
    const res = resolveWatchAction(dup, LIBRARY, PLANNABLE, true)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.notice).toContain('already in the Watch Library')
      // The phantom-card lesson: a drop must say what to do next, not just "no".
      expect(res.notice).toContain('plan it onto a day')
      // It names the LIBRARY's title, not the one the model just made up.
      expect(res.notice).toContain('How Glaciers Move')
      expect(res.notice).not.toContain('How Rivers Carve Canyons')
    }
  })

  it('drops a duplicate of a RETIRED video and names the Archive — never un-retires', () => {
    const dup = { ...VET_IN, youtubeId: RETIRED_VOLCANO.youtubeId }
    const res = resolveWatchAction(dup, LIBRARY, PLANNABLE, true)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.notice).toContain('retired')
      expect(res.notice).toContain('Archive')
      expect(res.notice).toContain('Inside a Volcano')
    }
  })

  it('matches a duplicate on the youtubeId, not on the title', () => {
    // Same video, a different parent-authored title: still a duplicate.
    const renamed = { ...VET_IN, youtubeId: GLACIERS.youtubeId, title: 'Ice rivers!' }
    expect(resolveWatchAction(renamed, LIBRARY, PLANNABLE, true).ok).toBe(false)
    // A different video that happens to share a title: NOT a duplicate.
    const sameTitle = { ...VET_IN, title: GLACIERS.title }
    expect(resolveWatchAction(sameTitle, LIBRARY, PLANNABLE, true).ok).toBe(true)
  })

  it('drops everything for a non-parent, with the capability reason', () => {
    const res = resolveWatchAction(VET_IN, LIBRARY, PLANNABLE, false)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.notice).toBe(WATCH_NOTICES.notPermitted)
  })
})

describe('resolveWatchAction — planVideoOnDay (FEAT-149)', () => {
  it('resolves an active video onto a NEXT-week weekday', () => {
    const res = resolveWatchAction(PLAN, LIBRARY, PLANNABLE, true)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.resolved.video?.title).toBe('How Glaciers Move')
      expect(res.resolved.day?.label).toBe('next Tuesday')
    }
  })

  it('resolves an active video onto a CURRENT-week weekday', () => {
    const res = resolveWatchAction({ ...PLAN, dateKey: '2026-08-19' }, LIBRARY, PLANNABLE, true)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.resolved.day?.label).toBe('Wednesday')
  })

  it('refuses a RETIRED video by name — the activeVideos rule, stated once', () => {
    const res = resolveWatchAction(
      { ...PLAN, watchVideoId: 'vid_volcano' },
      LIBRARY,
      PLANNABLE,
      true,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.notice).toContain('Inside a Volcano')
      expect(res.notice).toContain('retired')
      expect(res.notice).toContain('Archive')
    }
  })

  it('refuses an id that names nothing in the library', () => {
    const res = resolveWatchAction(
      { ...PLAN, watchVideoId: 'vid_hallucinated' },
      LIBRARY,
      PLANNABLE,
      true,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.notice).toBe(WATCH_NOTICES.videoNotFound)
  })

  it('refuses a day outside the plannable window — weekend, past, and week-after-next', () => {
    for (const dateKey of ['2026-08-22', '2026-08-23', '2026-08-14', '2026-08-31']) {
      const res = resolveWatchAction({ ...PLAN, dateKey }, LIBRARY, PLANNABLE, true)
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.notice).toBe(WATCH_NOTICES.notPlannableDay)
    }
  })

  it('drops everything for a non-parent, with the capability reason', () => {
    const res = resolveWatchAction(PLAN, LIBRARY, PLANNABLE, false)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.notice).toBe(WATCH_NOTICES.notPermitted)
  })

  it('checks the video BEFORE the day, so a retired video reads as retired', () => {
    // Both wrong at once: the true first cause is the one the parent is told.
    const res = resolveWatchAction(
      { ...PLAN, watchVideoId: 'vid_volcano', dateKey: '2026-09-14' },
      LIBRARY,
      PLANNABLE,
      true,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.notice).toContain('Inside a Volcano')
  })
})

describe('resolveWatchActionForDisplay (the FEAT-144 split, FEAT-149)', () => {
  it("keeps a vet-in card rendering after its own write made it a duplicate", () => {
    const dup = { ...VET_IN, youtubeId: GLACIERS.youtubeId }
    // The gate correctly refuses it now…
    expect(resolveWatchAction(dup, LIBRARY, PLANNABLE, true).ok).toBe(false)
    // …but the already-tapped card still has to render its "Done ✓".
    expect(resolveWatchActionForDisplay(dup, LIBRARY, PLANNABLE)).not.toBeNull()
  })

  it('keeps a plan card rendering for a video retired after the tap', () => {
    const retiredPlan = { ...PLAN, watchVideoId: 'vid_volcano' }
    expect(resolveWatchAction(retiredPlan, LIBRARY, PLANNABLE, true).ok).toBe(false)
    expect(resolveWatchActionForDisplay(retiredPlan, LIBRARY, PLANNABLE)).not.toBeNull()
  })

  it('still renders nothing for a plan that can name nothing', () => {
    expect(
      resolveWatchActionForDisplay({ ...PLAN, watchVideoId: 'nope' }, LIBRARY, PLANNABLE),
    ).toBeNull()
    expect(
      resolveWatchActionForDisplay({ ...PLAN, dateKey: '2026-12-25' }, LIBRARY, PLANNABLE),
    ).toBeNull()
  })
})

describe('watch card wording (FEAT-149)', () => {
  it('names the video and the weekday in words — never an id, never a raw date', () => {
    const res = resolveWatchAction(PLAN, LIBRARY, PLANNABLE, true)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const line = describeWatchAction(res.resolved, 'Lincoln')
    expect(line).toBe('Add "How Glaciers Move" to Lincoln\'s next Tuesday')
    expect(line).not.toContain('vid_glacier')
    expect(line).not.toContain('2026-08-25')
  })

  it('names the library, not a day, for a vet-in', () => {
    const res = resolveWatchAction(VET_IN, LIBRARY, PLANNABLE, true)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(describeWatchAction(res.resolved, 'Lincoln')).toBe(
      'Add "How Rivers Carve Canyons" to Lincoln\'s Watch Library',
    )
  })

  it('shows the whole shape of a vet-in — subject and length', () => {
    expect(describeVetInShape(VET_IN)).toBe('Science · 11m')
  })

  it('footnotes what each write does NOT do', () => {
    expect(watchActionFootnote(VET_IN)).toContain('nothing lands on a day')
    expect(watchActionFootnote(PLAN)).toContain('Nothing already on it changes')
  })
})
