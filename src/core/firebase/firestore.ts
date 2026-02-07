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
  DayLog,
  Evaluation,
  HoursEntry,
  Ladder,
  MilestoneProgress,
  WeekPlan,
} from '../types/domain'
import { app } from './firebase'

export const db = getFirestore(app)

const dayLogConverter: FirestoreDataConverter<DayLog> = {
  toFirestore: (data) => data,
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) =>
    snapshot.data(options) as DayLog,
}

const artifactConverter: FirestoreDataConverter<Artifact> = {
  toFirestore: (data) => data,
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as Artifact
    return {
      ...data,
      id: data.id ?? snapshot.id,
    }
  },
}

const hoursEntryConverter: FirestoreDataConverter<HoursEntry> = {
  toFirestore: (data) => data,
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
