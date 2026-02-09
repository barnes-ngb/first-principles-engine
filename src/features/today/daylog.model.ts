import { DayBlockType } from '../../core/types/enums'
import type {
  ChecklistItem,
  DayBlock,
  DayLog,
  MathRoutine,
  ReadingRoutine,
  SpeechRoutine,
} from '../../core/types/domain'

const defaultDayLogChecklistItems: ChecklistItem[] = []

const defaultBlocks: DayBlock[] = [
  {
    type: DayBlockType.Formation,
    title: 'Formation',
  },
  {
    type: DayBlockType.Reading,
    title: 'Reading',
  },
  {
    type: DayBlockType.Speech,
    title: 'Speech',
  },
  {
    type: DayBlockType.Math,
    title: 'Math',
  },
  {
    type: DayBlockType.Together,
    title: 'Together',
  },
  {
    type: DayBlockType.Movement,
    title: 'Movement',
  },
  {
    type: DayBlockType.Project,
    title: 'Project',
  },
  {
    type: DayBlockType.FieldTrip,
    title: 'Field Trip',
  },
  {
    type: DayBlockType.Other,
    title: 'Other',
  },
]

const cloneChecklistItems = (
  items?: ChecklistItem[],
): ChecklistItem[] | undefined => {
  if (!items || items.length === 0) {
    return undefined
  }

  return items.map((item) => ({ ...item }))
}

export const emptyReadingRoutine = (): ReadingRoutine => ({
  handwriting: { done: false },
  spelling: { done: false },
  sightWords: { done: false },
  minecraft: { done: false },
  readingEggs: { done: false },
})

export const emptyMathRoutine = (): MathRoutine => ({
  done: false,
})

export const emptySpeechRoutine = (): SpeechRoutine => ({
  done: false,
})

export const createDefaultDayLog = (childId: string, date: string): DayLog => {
  const checklist = cloneChecklistItems(defaultDayLogChecklistItems)

  return {
    childId,
    date,
    blocks: defaultBlocks.map((block) => ({
      ...block,
      checklist: cloneChecklistItems(block.checklist),
    })),
    reading: emptyReadingRoutine(),
    math: emptyMathRoutine(),
    speech: emptySpeechRoutine(),
    ...(checklist ? { checklist } : {}),
  }
}
