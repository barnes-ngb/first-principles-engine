import { describe, expect, it } from 'vitest'

import type { ActivityConfig } from '../../core/types/planning'
import { ActivityFrequency, ActivityType, SubjectBucket } from '../../core/types/enums'
import { bridgeNameForActivity, workbookBridgeForSource } from '../../core/foundations/workbookBridge'
import { activityConfigsToRoutineText } from '../planner-chat/chatPlanner.logic'
import { findDuplicateActivities } from '../shelly-chat/curriculumActions'
import { isWorkbookMatch } from '../../core/hooks/useScanToActivityConfig'
import { activityNames } from '../../core/utils/activityNames'
import { resolveQuickLogChips } from '../today/quickLogChips'

const COVER = 'The Good and the Beautiful Math'

const config = (over: Partial<ActivityConfig> = {}): ActivityConfig =>
  ({
    id: 'cfg-math',
    name: 'Math K',
    aliases: [COVER],
    type: ActivityType.Workbook,
    subjectBucket: SubjectBucket.Math,
    defaultMinutes: 30,
    frequency: ActivityFrequency.Daily,
    childId: 'lincoln',
    sortOrder: 1,
    completed: false,
    scannable: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as ActivityConfig

describe('a scan still finds a renamed workbook (UX-280)', () => {
  it('matches on an alternate where the name alone would miss', () => {
    // Deliberately NOT a GATB book: `isWorkbookMatch` has a same-subject rule
    // that rescues those, so a GATB example would pass without any alternate
    // and prove nothing.
    const renamed = config({
      name: 'Phonics',
      aliases: ['Explode the Code Book 3'],
      subjectBucket: SubjectBucket.Reading,
    })
    const scanned = 'Explode the Code'

    // The name alone is a miss — "Phonics" and the cover share no form.
    expect(isWorkbookMatch('Phonics', scanned, 'Reading', 'Reading')).toBe(false)
    // Every name the row answers to includes the cover, so the ladder lands.
    const hit = activityNames(renamed).some((n) =>
      isWorkbookMatch(n, scanned, 'Reading', 'Reading'),
    )
    expect(hit).toBe(true)
  })

  it('does not lower the bar — an unrelated workbook still misses', () => {
    // Widening a match is how a scan starts updating the wrong workbook. The
    // alternates add candidates; they never loosen the comparison.
    const other = config({ id: 'cfg-reading', name: 'Reading', aliases: ['Explode the Code'] })
    const hit = activityNames(other).some((n) => isWorkbookMatch(n, 'Mathseeds', 'Reading', 'Math'))
    expect(hit).toBe(false)
  })
})

describe('the duplicate notice sees alternates (UX-280)', () => {
  const add = {
    kind: 'addActivity' as const,
    name: COVER,
    childId: 'lincoln',
    subjectBucket: SubjectBucket.Math,
    defaultMinutes: 30,
    frequency: ActivityFrequency.Daily,
    type: ActivityType.Workbook,
  }

  it('names the row she renamed away from that name', () => {
    const matches = findDuplicateActivities(add, [
      { id: 'cfg-math', name: 'Math K', aliases: [COVER], childId: 'lincoln', defaultMinutes: 30 },
    ])
    expect(matches.map((m) => m.id)).toEqual(['cfg-math'])
  })

  it('still ignores a completed program, and a name that differs by a real word', () => {
    expect(
      findDuplicateActivities(add, [
        { id: 'done', name: 'x', aliases: [COVER], completed: true, childId: 'lincoln', defaultMinutes: 30 },
        { id: 'near', name: 'Good and the Beautiful Math', childId: 'lincoln', defaultMinutes: 30 },
      ]),
    ).toEqual([])
  })
})

describe('the workbook bridge follows the rename (UX-280)', () => {
  it('resolves through an alternate when the name no longer matches a bridge', () => {
    // "Math K" resolves nothing; the cover name is what the curated table knows.
    expect(workbookBridgeForSource('Math K')).toBeNull()
    const viaAlias = bridgeNameForActivity(config({ aliases: ['Mathseeds'] }))
    expect(workbookBridgeForSource(viaAlias)).not.toBeNull()
  })

  it('falls back to exactly what the callers used to pick when nothing resolves', () => {
    expect(bridgeNameForActivity({ name: 'Math K' })).toBe('Math K')
    expect(bridgeNameForActivity({ name: null, curriculum: 'Some Book' })).toBe('Some Book')
    expect(bridgeNameForActivity(null)).toBeUndefined()
  })
})

describe('alternates the planner and the kids never see (UX-280)', () => {
  it('the routine text sends the name and no alternate', () => {
    // `buildPlannerPrompt` tells the model to copy these EXACT names, and offers
    // no way to say "these two are the same thing". Handing it synonyms invites
    // a third name that matches neither, and every downstream item title, day
    // label and duplicate check is built from what it copies.
    const text = activityConfigsToRoutineText([config()])
    expect(text).toContain('Math K')
    expect(text).not.toContain(COVER)
  })

  it("the kids' quick-log row shows her label, not an old name", () => {
    // The chip de-dupe asks "would a kid read these as the same word?", which is
    // about the label on the chip. Reading alternates there would drop her
    // renamed chip because its OLD name matched a built-in — a rename silently
    // undoing itself on the one surface a child uses.
    const chips = resolveQuickLogChips([
      config({ id: 'c1', name: 'Story time', aliases: ['Reading'], quickLog: true }),
    ])
    const labels = chips.map((c) => c.label)
    expect(labels).toContain('Story time')
    expect(labels).toContain('📚 Reading') // the built-in is NOT displaced
  })
})
