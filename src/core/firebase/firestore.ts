import {
  collection,
  type CollectionReference,
  type FirestoreDataConverter,
  getFirestore,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
} from 'firebase/firestore'

import type {
  Artifact,
  Child,
  DadLabWeek,
  DailyPlan,
  DayLog,
  Evaluation,
  HoursAdjustment,
  HoursEntry,
  LabSession,
  Ladder,
  LadderProgress,
  LessonCard,
  MilestoneProgress,
  PlannerConversation,
  PlannerSession,
  Project,
  Session,
  SkillSnapshot,
  WeekPlan,
  WeeklyScore,
  WorkbookConfig,
} from '../types/domain'
import { app } from './firebase'

export const db = getFirestore(app)

/** Recursively strip `undefined` values, which Firestore rejects. */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? stripUndefined(item as Record<string, unknown>)
          : item,
      )
    } else if (typeof value === 'object' && value !== null) {
      result[key] = stripUndefined(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

const dayLogConverter: FirestoreDataConverter<DayLog> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) =>
    snapshot.data(options) as DayLog,
}

const artifactConverter: FirestoreDataConverter<Artifact> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as Artifact
    return {
      ...data,
      id: data.id ?? snapshot.id,
    }
  },
}

const hoursEntryConverter: FirestoreDataConverter<HoursEntry> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as HoursEntry
    return {
      ...data,
      id: data.id ?? snapshot.id,
      date: data.date ?? snapshot.id,
    }
  },
}

export const childrenCollection = (familyId: string): CollectionReference<Child> =>
  collection(db, `families/${familyId}/children`) as CollectionReference<Child>

export const weeksCollection = (familyId: string): CollectionReference<WeekPlan> =>
  collection(db, `families/${familyId}/weeks`) as CollectionReference<WeekPlan>

export const daysCollection = (familyId: string): CollectionReference<DayLog> =>
  collection(db, `families/${familyId}/days`).withConverter(
    dayLogConverter,
  ) as CollectionReference<DayLog>

export const artifactsCollection = (
  familyId: string,
): CollectionReference<Artifact> =>
  collection(db, `families/${familyId}/artifacts`).withConverter(
    artifactConverter,
  ) as CollectionReference<Artifact>

export const hoursCollection = (
  familyId: string,
): CollectionReference<HoursEntry> =>
  collection(db, `families/${familyId}/hours`).withConverter(
    hoursEntryConverter,
  ) as CollectionReference<HoursEntry>

export const evaluationsCollection = (
  familyId: string,
): CollectionReference<Evaluation> =>
  collection(db, `families/${familyId}/evaluations`) as CollectionReference<Evaluation>

export const laddersCollection = (familyId: string): CollectionReference<Ladder> =>
  collection(db, `families/${familyId}/ladders`) as CollectionReference<Ladder>

export const milestoneProgressCollection = (
  familyId: string,
): CollectionReference<MilestoneProgress> =>
  collection(
    db,
    `families/${familyId}/milestoneProgress`,
  ) as CollectionReference<MilestoneProgress>

export const hoursAdjustmentsCollection = (
  familyId: string,
): CollectionReference<HoursAdjustment> =>
  collection(
    db,
    `families/${familyId}/hoursAdjustments`,
  ) as CollectionReference<HoursAdjustment>

export const sessionsCollection = (familyId: string): CollectionReference<Session> =>
  collection(db, `families/${familyId}/sessions`) as CollectionReference<Session>

export const dailyPlansCollection = (
  familyId: string,
): CollectionReference<DailyPlan> =>
  collection(db, `families/${familyId}/dailyPlans`) as CollectionReference<DailyPlan>

export const projectsCollection = (familyId: string): CollectionReference<Project> =>
  collection(db, `families/${familyId}/projects`) as CollectionReference<Project>

export const weeklyScoresCollection = (
  familyId: string,
): CollectionReference<WeeklyScore> =>
  collection(db, `families/${familyId}/weeklyScores`) as CollectionReference<WeeklyScore>

const labSessionConverter: FirestoreDataConverter<LabSession> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as LabSession
    return {
      ...data,
      id: snapshot.id,
    }
  },
}

/** Lab session doc ID: {weekKey}_{childId}_{projectId} (or {weekKey}_{childId} for legacy sessions). */
export const labSessionDocId = (weekKey: string, childId: string, projectId?: string): string =>
  projectId ? `${weekKey}_${childId}_${projectId}` : `${weekKey}_${childId}`

export const labSessionsCollection = (
  familyId: string,
): CollectionReference<LabSession> =>
  collection(db, `families/${familyId}/labSessions`).withConverter(
    labSessionConverter,
  ) as CollectionReference<LabSession>

export const dadLabCollection = (
  familyId: string,
): CollectionReference<DadLabWeek> =>
  collection(db, `families/${familyId}/dadLab`) as CollectionReference<DadLabWeek>

/** Ladder progress per child per ladderKey. Doc ID: {childId}_{ladderKey} */
export const ladderProgressCollection = (
  familyId: string,
): CollectionReference<LadderProgress> =>
  collection(db, `families/${familyId}/ladderProgress`) as CollectionReference<LadderProgress>

export const ladderProgressDocId = (childId: string, ladderKey: string): string =>
  `${childId}_${ladderKey}`

// ── Skill Snapshots (Lincoln Evaluation) ────────────────────────

/** Skill snapshot per child. Doc ID: {childId} */
export const skillSnapshotsCollection = (
  familyId: string,
): CollectionReference<SkillSnapshot> =>
  collection(db, `families/${familyId}/skillSnapshots`) as CollectionReference<SkillSnapshot>

// ── Planner Sessions (Shelly Planner) ───────────────────────────

const plannerSessionConverter: FirestoreDataConverter<PlannerSession> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as PlannerSession
    return {
      ...data,
      id: snapshot.id,
    }
  },
}

export const plannerSessionsCollection = (
  familyId: string,
): CollectionReference<PlannerSession> =>
  collection(db, `families/${familyId}/plannerSessions`).withConverter(
    plannerSessionConverter,
  ) as CollectionReference<PlannerSession>

/** Planner session doc ID: {weekKey}_{childId} */
export const plannerSessionDocId = (weekKey: string, childId: string): string =>
  `${weekKey}_${childId}`

// ── Lesson Cards ────────────────────────────────────────────────

export const lessonCardsCollection = (
  familyId: string,
): CollectionReference<LessonCard> =>
  collection(db, `families/${familyId}/lessonCards`) as CollectionReference<LessonCard>

// ── Planner Conversations (Chat Planner) ──────────────────────

const plannerConversationConverter: FirestoreDataConverter<PlannerConversation> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as PlannerConversation
    return {
      ...data,
      id: snapshot.id,
    }
  },
}

export const plannerConversationsCollection = (
  familyId: string,
): CollectionReference<PlannerConversation> =>
  collection(db, `families/${familyId}/plannerConversations`).withConverter(
    plannerConversationConverter,
  ) as CollectionReference<PlannerConversation>

/** Planner conversation doc ID: {weekKey}_{childId} */
export const plannerConversationDocId = (weekKey: string, childId: string): string =>
  `${weekKey}_${childId}`

// ── Workbook Configs (Pace Gauge) ────────────────────────────

/** Workbook config per child per workbook. Doc ID: {childId}_{workbookName_slug} */
export const workbookConfigsCollection = (
  familyId: string,
): CollectionReference<WorkbookConfig> =>
  collection(db, `families/${familyId}/workbookConfigs`) as CollectionReference<WorkbookConfig>

export const workbookConfigDocId = (childId: string, workbookName: string): string =>
  `${childId}_${workbookName.toLowerCase().replace(/\s+/g, '-')}`
