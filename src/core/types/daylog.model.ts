import type { DayBlock, DayLog } from './domain'
import { DayBlockType, Location, SubjectBucket } from './enums'

const baseChecklist = (label: string, id: string) => ({
  id,
  label,
  completed: false,
})

export const DEFAULT_DAY_BLOCKS: DayBlock[] = [
  {
    id: 'formation',
    type: DayBlockType.Formation,
    title: 'Formation',
    subjectBucket: SubjectBucket.Other,
    location: Location.Home,
    plannedMinutes: 15,
    actualMinutes: 0,
    notes: '',
    checklist: [baseChecklist('Set the intention', 'formation-1')],
  },
  {
    id: 'reading',
    type: DayBlockType.Reading,
    title: 'Reading',
    subjectBucket: SubjectBucket.Reading,
    location: Location.Home,
    plannedMinutes: 30,
    actualMinutes: 0,
    notes: '',
    checklist: [baseChecklist('Read together', 'reading-1')],
  },
  {
    id: 'speech',
    type: DayBlockType.Speech,
    title: 'Speech',
    subjectBucket: SubjectBucket.LanguageArts,
    location: Location.Home,
    plannedMinutes: 20,
    actualMinutes: 0,
    notes: '',
    checklist: [baseChecklist('Practice aloud', 'speech-1')],
  },
  {
    id: 'math',
    type: DayBlockType.Math,
    title: 'Math',
    subjectBucket: SubjectBucket.Math,
    location: Location.Home,
    plannedMinutes: 30,
    actualMinutes: 0,
    notes: '',
    checklist: [baseChecklist('Complete math set', 'math-1')],
  },
  {
    id: 'project',
    type: DayBlockType.Project,
    title: 'Project',
    subjectBucket: SubjectBucket.Science,
    location: Location.Community,
    plannedMinutes: 45,
    actualMinutes: 0,
    notes: '',
    checklist: [baseChecklist('Capture progress', 'project-1')],
  },
]

export const createDefaultDayLog = (date: string): DayLog => ({
  date,
  blocks: DEFAULT_DAY_BLOCKS,
  checklist: [],
  artifacts: [],
})
