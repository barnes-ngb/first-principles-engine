import type { BuildStudioCreditProvenance } from './buildStudio'
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
  source?: string
  /**
   * Source-linked provenance for a parent-confirmed Build Studio credit
   * (LOCAL-VISION-007 slice 3). Additive; never read by the hours math.
   */
  buildStudioCredit?: BuildStudioCreditProvenance
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
  /**
   * Provenance link to the `dadLabReports` doc a correction was written for
   * (DATA-16 Dad Lab hours routing audit). Additive metadata only — it is the
   * idempotence key (with `source`) so the audit never proposes the same report
   * twice. The counting path (`collectHoursContributions`) does NOT read this
   * field, so it cannot change any compliance total.
   */
  labReportId?: string
}
