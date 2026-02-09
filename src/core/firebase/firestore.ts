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
  MilestoneProgress,
  Project,
  Session,
  WeekPlan,
  WeeklyScore,
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

export const labSessionsCollection = (
  familyId: string,
): CollectionReference<LabSession> =>
  collection(db, `families/${familyId}/labSessions`) as CollectionReference<LabSession>

export const dadLabCollection = (
  familyId: string,
): CollectionReference<DadLabWeek> =>
  collection(db, `families/${familyId}/dadLab`) as CollectionReference<DadLabWeek>
