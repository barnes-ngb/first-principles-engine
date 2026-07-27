import { describe, expect, it } from 'vitest'

import { WatchVideoStatus } from '../../core/types/watch'
import type { WatchVideo } from '../../core/types'
import { activeVideos, isActive, isRetired, retiredVideos } from './watchLibraryStatus'

const video = (id: string, status?: WatchVideo['status']): WatchVideo => ({
  id,
  youtubeId: 'dQw4w9WgXcQ',
  title: `Video ${id}`,
  plannedMinutes: 12,
  subjectBucket: 'SocialStudies',
  childId: 'both',
  addedBy: 'parent',
  vettedAt: '2026-07-26T00:00:00.000Z',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  ...(status ? { status } : {}),
})

describe('watchLibraryStatus (FEAT-129)', () => {
  it('treats an ABSENT status as active — pre-FEAT-129 docs need no backfill', () => {
    const legacy = video('legacy')
    expect(legacy.status).toBeUndefined()
    expect(isActive(legacy)).toBe(true)
    expect(isRetired(legacy)).toBe(false)
  })

  it('reads an explicit active/retired status', () => {
    expect(isActive(video('a', WatchVideoStatus.Active))).toBe(true)
    expect(isRetired(video('a', WatchVideoStatus.Active))).toBe(false)
    expect(isRetired(video('r', WatchVideoStatus.Retired))).toBe(true)
    expect(isActive(video('r', WatchVideoStatus.Retired))).toBe(false)
  })

  it('activeVideos drops retired entries and keeps order', () => {
    const list = [
      video('legacy'),
      video('r', WatchVideoStatus.Retired),
      video('a', WatchVideoStatus.Active),
    ]
    expect(activeVideos(list).map((v) => v.id)).toEqual(['legacy', 'a'])
    expect(retiredVideos(list).map((v) => v.id)).toEqual(['r'])
  })

  it('does not mutate the input list', () => {
    const list = [video('a'), video('r', WatchVideoStatus.Retired)]
    activeVideos(list)
    expect(list).toHaveLength(2)
  })
})
