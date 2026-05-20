import type { CurriculumDomain } from './curriculumMap'

export const SkillStatus = {
  /** Not yet encountered */
  NotStarted: 'not-started',
  /** Currently working on */
  InProgress: 'in-progress',
  /** Demonstrated understanding */
  Mastered: 'mastered',
} as const
export type SkillStatus = (typeof SkillStatus)[keyof typeof SkillStatus]

export const SkillStatusLabel: Record<SkillStatus, string> = {
  [SkillStatus.NotStarted]: 'Not Started',
  [SkillStatus.InProgress]: 'Working On',
  [SkillStatus.Mastered]: 'Mastered',
}

export interface SkillNodeStatus {
  /** Curriculum node ID (e.g., 'reading.phonics.cvc') */
  nodeId: string
  status: SkillStatus
  /** Source of status: manual (Shelly marked), evaluation (from quest/eval), program (from linked program) */
  source: 'manual' | 'evaluation' | 'program'
  /** ISO date when status was last updated */
  updatedAt: string
  /** Optional notes from Shelly */
  notes?: string
}

/** Per-child skill map document stored in Firestore */
export interface ChildSkillMap {
  id?: string
  childId: string
  /** Map of nodeId → status entry */
  skills: Record<string, SkillNodeStatus>
  updatedAt: string
}

/** Summary stats for a domain */
export interface DomainSummary {
  domain: CurriculumDomain
  total: number
  mastered: number
  inProgress: number
  notStarted: number
}
