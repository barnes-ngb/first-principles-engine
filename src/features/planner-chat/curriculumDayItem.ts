import type { ActivityConfig, DraftPlanItem, DraftWeeklyPlan } from '../../core/types'
import { addItemToLiveDay } from '../today/liveDayEdit'
import { buildApplyChecklist } from './applyWeekPlan'
import { dateKeyForDayPlan, generateItemId, WEEK_DAYS } from './chatPlanner.logic'
import { editDraftDayItems } from './editDraftDayItems'

export function canPlanActivity(config: ActivityConfig, childId: string): boolean {
  return !config.completed && (config.childId === childId || config.childId === 'both')
    && !(config.type === 'workbook' && config.childId === 'both')
    && ['workbook', 'routine', 'strand', 'app', 'activity'].includes(config.type)
}

/** Keep the chosen identity and duration; selecting a resource is not evidence of mastery. */
export function buildCurriculumDraftItem(config: ActivityConfig): DraftPlanItem {
  return {
    id: generateItemId(),
    activityConfigId: config.id,
    title: config.name,
    subjectBucket: config.subjectBucket,
    estimatedMinutes: config.defaultMinutes,
    skillTags: [],
    accepted: true,
    category: 'must-do',
    // UX-363: the row says what the config IS, rather than being flattened into
    // one of three words. This used to read `workbook ? 'workbook' : routine ?
    // 'routine' : 'activity'`, so a strand, an app and a formation block all
    // arrived on Today as `'activity'` — the hand-written-union shape UX-204
    // made unrepresentable on Progress → Curriculum, on the field that decides
    // what a row's door is. `ChecklistItemKind` spreads `ActivityType`, so the
    // config's own type is carried verbatim and an eighth member needs no edit
    // here at all.
    itemType: config.type,
    isAppBlock: config.type === 'app',
  }
}

/** Draft additions wait for Apply. Live additions use the existing guarded manual-add lane. */
export async function addCurriculumItemToPlan(params: {
  canEdit: boolean
  familyId: string
  childId: string
  weekStart: string
  draft: DraftWeeklyPlan
  dayIndex: number
  applied: boolean
  config: ActivityConfig
}): Promise<DraftWeeklyPlan> {
  const { canEdit, familyId, childId, weekStart, draft, dayIndex, applied, config } = params
  const day = draft.days[dayIndex]
  if (!canEdit || !familyId || !childId || !canPlanActivity(config, childId)) {
    throw new Error('Choose an available activity for this child.')
  }
  if (!day || !WEEK_DAYS.includes(day.day as typeof WEEK_DAYS[number])
    || day.appliedDayType === 'life') {
    throw new Error('Choose a planned school day.')
  }
  const item = buildCurriculumDraftItem(config)
  if (applied) {
    const [checklistItem] = buildApplyChecklist([item], [config], new Map())
    const outcome = await addItemToLiveDay({
      canEdit, familyId, childId,
      dateKey: dateKeyForDayPlan(weekStart, day.day as typeof WEEK_DAYS[number]),
      item: { ...checklistItem, source: 'manual' },
    })
    if (outcome.status !== 'done') throw new Error('Could not add this item to the day.')
  }
  return {
    ...draft,
    days: draft.days.map((existing, index) => index === dayIndex
      ? editDraftDayItems(existing, [...existing.items, item]) : existing),
  }
}
