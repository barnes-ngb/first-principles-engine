import {
  collection,
  type CollectionReference,
  type FirestoreDataConverter,
  getFirestore,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
} from 'firebase/firestore'

import type {
  ActivityConfig,
  AIUsageEntry,
  Artifact,
  AvatarProfile,
  Book,
  BookProgress,
  BookThemeConfig,
  ChapterBook,
  ChapterResponse,
  Child,
  DadLabReport,
  DailyArmorSession,
  DailyPlan,
  DayLog,
  Evaluation,
  EvaluationSession,
  HoursAdjustment,
  HoursEntry,
  LadderProgress,
  LessonCard,
  PlannerConversation,
  ScanRecord,
  SightWordProgress,
  SkillSnapshot,
  Sticker,
  StoryGame,
  WeekPlan,
  WeeklyReview,
  WorkbookConfig,
  XpLedger,
} from '../types'
import type { ChildSkillMap } from '../curriculum/skillStatus'
import { app } from './firebase'

export const db = getFirestore(app)

/** Recursively strip `undefined` values, which Firestore rejects. */
export function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      result[key] = value
        .filter((item) => item !== undefined)
        .map((item) =>
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

export const hoursAdjustmentsCollection = (
  familyId: string,
): CollectionReference<HoursAdjustment> =>
  collection(
    db,
    `families/${familyId}/hoursAdjustments`,
  ) as CollectionReference<HoursAdjustment>

/** Normalize legacy planType values: 'A' → 'normal', 'B' → 'mvd'. */
function normalizePlanType(raw: string): DailyPlan['planType'] {
  if (raw === 'A' || raw === 'normal') return 'normal'
  if (raw === 'B' || raw === 'mvd') return 'mvd'
  return 'normal'
}

const dailyPlanConverter: FirestoreDataConverter<DailyPlan> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as DailyPlan & { planType: string }
    return {
      ...data,
      id: snapshot.id,
      planType: normalizePlanType(data.planType),
    }
  },
}

export const dailyPlansCollection = (
  familyId: string,
): CollectionReference<DailyPlan> =>
  collection(db, `families/${familyId}/dailyPlans`).withConverter(
    dailyPlanConverter,
  ) as CollectionReference<DailyPlan>

/** Daily plan doc ID: {date}_{childId} */
export const dailyPlanDocId = (date: string, childId: string): string =>
  `${date}_${childId}`

const dadLabReportConverter: FirestoreDataConverter<DadLabReport> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as DadLabReport
    return { ...data, id: snapshot.id, status: data.status ?? 'complete' }
  },
}

export const dadLabReportsCollection = (
  familyId: string,
): CollectionReference<DadLabReport> =>
  collection(db, `families/${familyId}/dadLabReports`).withConverter(
    dadLabReportConverter,
  ) as CollectionReference<DadLabReport>

/** Ladder progress per child per ladderKey. Doc ID: {childId}_{ladderKey} */
export const ladderProgressCollection = (
  familyId: string,
): CollectionReference<LadderProgress> =>
  collection(db, `families/${familyId}/ladderProgress`) as CollectionReference<LadderProgress>

export const ladderProgressDocId = (childId: string, ladderKey: string): string =>
  `${childId}_${ladderKey}`

// ── Skill Snapshots (Lincoln Evaluation) ────────────────────────

const skillSnapshotConverter: FirestoreDataConverter<SkillSnapshot> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as SkillSnapshot
    return {
      ...data,
      id: snapshot.id,
    }
  },
}

/** Skill snapshot per child. Doc ID: {childId} */
export const skillSnapshotsCollection = (
  familyId: string,
): CollectionReference<SkillSnapshot> =>
  collection(db, `families/${familyId}/skillSnapshots`).withConverter(
    skillSnapshotConverter,
  ) as CollectionReference<SkillSnapshot>

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

const workbookConfigConverter: FirestoreDataConverter<WorkbookConfig> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as WorkbookConfig
    return { ...data, id: snapshot.id }
  },
}

/** Workbook config per child per workbook. Doc ID: {childId}_{workbookName_slug} */
export const workbookConfigsCollection = (
  familyId: string,
): CollectionReference<WorkbookConfig> =>
  collection(db, `families/${familyId}/workbookConfigs`).withConverter(
    workbookConfigConverter,
  ) as CollectionReference<WorkbookConfig>

export const workbookConfigDocId = (childId: string, workbookName: string): string =>
  `${childId}_${workbookName.toLowerCase().replace(/\s+/g, '-')}`

// ── Activity Configs (structured routine + workbook replacement) ──

const activityConfigConverter: FirestoreDataConverter<ActivityConfig> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as ActivityConfig
    return { ...data, id: snapshot.id }
  },
}

/** Activity configs per family. One doc per activity. */
export const activityConfigsCollection = (
  familyId: string,
): CollectionReference<ActivityConfig> =>
  collection(db, `families/${familyId}/activityConfigs`).withConverter(
    activityConfigConverter,
  ) as CollectionReference<ActivityConfig>

/** Normalize curriculum names for consistent matching.
 * "GATB LA", "Good and the Beautiful Language Arts", "TGTB Level 1" all → "gatb-la" base key.
 */
export function normalizeCurriculumKey(name: string): string {
  const lower = name.toLowerCase()
  // GATB variants
  if (/good.*beautiful|gatb|tgtb/.test(lower)) {
    if (/math/.test(lower)) return 'gatb-math'
    if (/lang|la\b|reading|phonics/.test(lower)) return 'gatb-la'
    if (/science/.test(lower)) return 'gatb-science'
    if (/handwriting/.test(lower)) return 'gatb-handwriting'
    return 'gatb'
  }
  // Reading Eggs
  if (/reading.*egg/.test(lower)) return 'reading-eggs'
  // Fallback: slugify
  return lower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── Weekly Reviews (AI-generated adaptive reviews) ──────────────

export const weeklyReviewsCollection = (
  familyId: string,
): CollectionReference<WeeklyReview> =>
  collection(db, `families/${familyId}/weeklyReviews`) as CollectionReference<WeeklyReview>

/** Weekly review doc ID: {weekKey}_{childId} */
export const weeklyReviewDocId = (weekKey: string, childId: string): string =>
  `${weekKey}_${childId}`

// ── XP Ledger (cumulative XP tracking) ──────────────────────────

/** XP ledger per child. Doc ID: {childId} */
export const xpLedgerCollection = (
  familyId: string,
): CollectionReference<XpLedger> =>
  collection(db, `families/${familyId}/xpLedger`) as CollectionReference<XpLedger>

// ── Books (Book Builder) ──────────────────────────────────────

export const booksCollection = (familyId: string): CollectionReference<Book> =>
  collection(db, `families/${familyId}/books`) as CollectionReference<Book>

export const stickerLibraryCollection = (familyId: string): CollectionReference<Sticker> =>
  collection(db, `families/${familyId}/stickerLibrary`) as CollectionReference<Sticker>

export const bookThemesCollection = (familyId: string): CollectionReference<BookThemeConfig> =>
  collection(db, `families/${familyId}/bookThemes`) as CollectionReference<BookThemeConfig>

// ── Sight Word Progress ──────────────────────────────────────────

/** Sight word progress: families/{familyId}/sightWordProgress/{childId_word} */
export const sightWordProgressCollection = (familyId: string) =>
  collection(db, `families/${familyId}/sightWordProgress`) as CollectionReference<SightWordProgress>

/** Doc ID format: {childId}_{word} (e.g., "lincoln123_the") */
export const sightWordProgressDocId = (childId: string, word: string): string =>
  `${childId}_${word.toLowerCase().replace(/\s+/g, '-')}`

// ── AI Usage ────────────────────────────────────────────────────

export const aiUsageCollection = (
  familyId: string,
): CollectionReference<AIUsageEntry> =>
  collection(db, `families/${familyId}/aiUsage`) as CollectionReference<AIUsageEntry>

// ── Avatar Profiles ────────────────────────────────────────────

const avatarProfileConverter: FirestoreDataConverter<AvatarProfile> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) =>
    snapshot.data(options) as AvatarProfile,
}

/** Avatar profile per child. Doc ID: {childId} */
export const avatarProfilesCollection = (
  familyId: string,
): CollectionReference<AvatarProfile> =>
  collection(db, `families/${familyId}/avatarProfiles`).withConverter(
    avatarProfileConverter,
  ) as CollectionReference<AvatarProfile>

/** Build a dedup doc ID for XP ledger event entries. */
export const xpLedgerDocId = (childId: string, dedupKey: string): string =>
  `${childId}_${dedupKey}`

// ── Daily Armor Sessions ──────────────────────────────────────

/** Daily armor session. Doc ID: {childId}-{YYYY-MM-DD} */
export const dailyArmorSessionsCollection = (
  familyId: string,
): CollectionReference<DailyArmorSession> =>
  collection(db, `families/${familyId}/dailyArmorSessions`) as CollectionReference<DailyArmorSession>

/** Build doc ID for a daily armor session. */
export const dailyArmorSessionDocId = (childId: string, date: string): string =>
  `${childId}-${date}`

// ── Evaluation Sessions (Diagnostic Assessment Chat) ──────────

const evaluationSessionConverter: FirestoreDataConverter<EvaluationSession> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as EvaluationSession
    return { ...data, id: snapshot.id }
  },
}

export const evaluationSessionsCollection = (
  familyId: string,
): CollectionReference<EvaluationSession> =>
  collection(db, `families/${familyId}/evaluationSessions`).withConverter(
    evaluationSessionConverter,
  ) as CollectionReference<EvaluationSession>

// ── Story Games (Game Workshop) ─────────────────────────────────

const storyGameConverter: FirestoreDataConverter<StoryGame> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as StoryGame
    return {
      ...data,
      id: snapshot.id,
    }
  },
}

// ── Curriculum Scans ──────────────────────────────────────────

export const scansCollection = (
  familyId: string,
): CollectionReference<ScanRecord> =>
  collection(db, `families/${familyId}/scans`) as CollectionReference<ScanRecord>

// ── Story Games (Game Workshop) ─────────────────────────────────

export const storyGamesCollection = (
  familyId: string,
): CollectionReference<StoryGame> =>
  collection(db, `families/${familyId}/storyGames`).withConverter(
    storyGameConverter,
  ) as CollectionReference<StoryGame>

// ── Shelly Chat ─────────────────────────────────────────────────

export const shellyChatThreadsCollection = (familyId: string) =>
  collection(db, 'families', familyId, 'shellyChatThreads')

export const shellyChatMessagesCollection = (familyId: string, threadId: string) =>
  collection(db, 'families', familyId, 'shellyChatThreads', threadId, 'messages')

// ── Child Skill Maps (Learning Map) ─────────────────────────────

/** Skill map per child. Doc ID: {childId} */
export const childSkillMapsCollection = (
  familyId: string,
): CollectionReference<ChildSkillMap> =>
  collection(db, `families/${familyId}/childSkillMaps`) as CollectionReference<ChildSkillMap>

// ── Chapter Responses (Read-Aloud Discussion Evidence) ──────────

/** Chapter responses per child. Auto-ID documents. */
export const chapterResponsesCollection = (
  familyId: string,
): CollectionReference<ChapterResponse> =>
  collection(db, `families/${familyId}/chapterResponses`) as CollectionReference<ChapterResponse>

// ── Chapter Books (Global Curriculum Library) ───────────────────

/** Global chapter book library. Path: curriculum/chapterBooks/{bookId} */
export const chapterBooksCollection = (): CollectionReference<ChapterBook> =>
  collection(db, 'curriculum', 'chapterBooks') as unknown as CollectionReference<ChapterBook>

// ── Book Progress (Per-Family Read-Aloud Tracking) ──────────────

/** Book progress per child. Doc ID: {childId}_{bookId} */
export const bookProgressCollection = (
  familyId: string,
): CollectionReference<BookProgress> =>
  collection(db, `families/${familyId}/bookProgress`) as CollectionReference<BookProgress>

/** Book progress doc ID: {childId}_{bookId} */
export const bookProgressDocId = (childId: string, bookId: string): string =>
  `${childId}_${bookId}`
