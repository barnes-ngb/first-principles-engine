import { DayBlockType } from '../../core/types/enums'
import type { ChecklistItem, DayBlock, DayLog } from '../../core/types/domain'

const defaultChecklist: ChecklistItem[] = [
  { label: 'Capture highlights', completed: false },
  { label: 'Log reflection', completed: false },
]

const defaultBlocks: DayBlock[] = [
  { type: DayBlockType.Formation, title: 'Formation' },
  { type: DayBlockType.Reading, title: 'Reading' },
  { type: DayBlockType.Speech, title: 'Speech' },
  { type: DayBlockType.Math, title: 'Math' },
  { type: DayBlockType.Together, title: 'Together' },
  { type: DayBlockType.Movement, title: 'Movement' },
  { type: DayBlockType.Project, title: 'Project' },
]

export function createDefaultDayLog(date: string): DayLog {
  return {
    date,
    blocks: defaultBlocks,
    checklist: defaultChecklist,
  }
}
