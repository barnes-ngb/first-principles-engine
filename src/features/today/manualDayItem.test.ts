import { describe, expect, it } from 'vitest'

import { SubjectBucket } from '../../core/types/enums'
import { checklistItemKey } from './dayWriteGuard'
import { buildManualChecklistItem } from './manualDayItem'
import { parseMinutesFromLabel } from './weekRibbon.logic'

describe('buildManualChecklistItem (FEAT-142)', () => {
  it('stamps source: manual, never planner', () => {
    // `retainChecklistForApply` drops incomplete PLANNER residue, so a fake
    // planner row would be silently deleted by a later re-apply — the same
    // reasoning `buildWatchChecklistItem` records.
    const item = buildManualChecklistItem({ title: 'Sight word games', estimatedMinutes: 15 })
    expect(item.source).toBe('manual')
  })

  it('carries the minutes in the label the way every saved row does', () => {
    const item = buildManualChecklistItem({ title: 'Sight word games', estimatedMinutes: 15 })
    expect(item.label).toBe('Sight word games (15m)')
    // The suffix is not decoration — the legacy minutes reader parses it back.
    expect(parseMinutesFromLabel(item.label)).toBe(15)
  })

  it('records the minutes on the field the hours math reads', () => {
    // `checklistItemCountedMinutes` reads `estimatedMinutes ?? plannedMinutes`
    // off a COMPLETED row.
    const item = buildManualChecklistItem({ title: 'Nature walk', estimatedMinutes: 30 })
    expect(item.estimatedMinutes).toBe(30)
  })

  it('starts incomplete — adding a row is not doing the work', () => {
    const item = buildManualChecklistItem({ title: 'Nature walk', estimatedMinutes: 30 })
    expect(item.completed).toBe(false)
  })

  it('keeps the subject when given one and omits the field entirely when not', () => {
    const withSubject = buildManualChecklistItem({
      title: 'Sight word games',
      estimatedMinutes: 15,
      subjectBucket: SubjectBucket.Reading,
    })
    expect(withSubject.subjectBucket).toBe(SubjectBucket.Reading)

    const without = buildManualChecklistItem({ title: 'Nature walk', estimatedMinutes: 30 })
    expect(without).not.toHaveProperty('subjectBucket')
  })

  it('trims the title rather than baking whitespace into the identity', () => {
    const item = buildManualChecklistItem({ title: '  Copywork  ', estimatedMinutes: 10 })
    expect(item.label).toBe('Copywork (10m)')
  })

  it('produces a row the day-write guard can identify', () => {
    // The chat resolves a row by `checklistItemKey`; a row it adds has to be
    // findable by the same key on the next turn.
    const item = buildManualChecklistItem({
      title: 'Sight word games',
      estimatedMinutes: 15,
      subjectBucket: SubjectBucket.Reading,
    })
    expect(checklistItemKey(item)).toBe('Sight word games (15m)::Reading')
  })

  it('creates no block and no evidence link — it is one checklist row', () => {
    const item = buildManualChecklistItem({ title: 'Nature walk', estimatedMinutes: 30 })
    expect(item).not.toHaveProperty('plannedMinutes')
    expect(item).not.toHaveProperty('evidenceArtifactId')
    expect(Object.keys(item).sort()).toEqual(
      ['completed', 'estimatedMinutes', 'label', 'source'].sort(),
    )
  })
})
