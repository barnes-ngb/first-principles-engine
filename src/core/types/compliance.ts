import type {
  DayBlockType,
  SubjectBucket,
} from './enums'

export interface HoursEntry {
  id?: string
  childId?: string
  date: string
  hours?: number
  minutes: number
  blockType?: DayBlockType
  subjectBucket?: SubjectBucket
  location?: string
  quickCapture?: boolean
  notes?: string
  dayLogId?: string
  blockId?: string
}

export interface HoursAdjustment {
  id?: string
  childId?: string
  date: string
  minutes: number
  reason: string
  subjectBucket?: SubjectBucket
  location?: string
  source?: string
  createdAt?: string
}
