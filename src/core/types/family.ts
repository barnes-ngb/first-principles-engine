import type {
  DayBlockType,
  EvidenceType,
  RoutineItemKey,
} from './enums'

export interface FamilySettings {
  id?: string
  timeZone?: string
  weekStartDay?: string
  preferredEvidence?: EvidenceType[]
}

export interface Child {
  id: string
  name: string
  birthdate?: string
  grade?: string
  settings?: FamilySettings
  /** Ordered list of day-block types this child uses (priority order). */
  dayBlocks?: DayBlockType[]
  /** Ordered list of routine items this child logs (priority order). */
  routineItems?: RoutineItemKey[]
}
