import {
  collection,
  type CollectionReference,
  doc,
  type DocumentReference,
  type FirestoreDataConverter,
  initializeFirestore,
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
  BusinessGoal,
  BusinessLogEntry,
  CatalogOrder,
  CatalogProduct,
  ChapterBook,
  ChapterResponse,
  Child,
  ConceptArc,
  DadLabReport,
  DailyArmorSession,
  DailyPlan,
  DayLog,
  Evaluation,
  EvaluationSession,
  FeatureRequest,
  HelpCard,
  HoursAdjustment,
  HoursEntry,
  KitRoster,
  LadderProgress,
  LearnerModel,
  LearnerReviewSession,
  LessonCard,
  MonthlyReview,
  PlannerConversation,
  ScanRecord,
  SightWordProgress,
  SkillSnapshot,
  Sticker,
  StonebridgeProgress,
  StoryGame,
  WeekPlan,
  WeeklyReview,
  WorkbookConfig,
  XpLedger,
} from '../types'
import type { ChildSkillMap } from '../curriculum/skillStatus'
import type { ErrorLog } from '../types/errorLog'
import { app } from './firebase'

export const db = initializeFirestore(app, { ignoreUndefinedProperties: true })

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

// ── Concept Arcs (Dad Lab Concept Arcs — FEAT-44 / builds FEAT-41) ──
// Additive planning layer above DadLabReport. Covered by the family catch-all
// in firestore.rules (no dedicated rule needed). Write via addDoc /
// updateDoc / setDoc(merge) only — never bare setDoc.

export const conceptArcConverter: FirestoreDataConverter<ConceptArc> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as ConceptArc
    return { ...data, id: snapshot.id }
  },
}

/** Concept arcs per family. Auto-ID documents. */
export const conceptArcsCollection = (
  familyId: string,
): CollectionReference<ConceptArc> =>
  collection(db, `families/${familyId}/conceptArcs`).withConverter(
    conceptArcConverter,
  ) as CollectionReference<ConceptArc>

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

// ── Help Cards (Today inline teaching help — FEAT-43) ───────────
// Doc ID: `{childId}__{subjectSlug}__{labelSlug}` (see core/utils/helpCard.ts).

export const helpCardsCollection = (
  familyId: string,
): CollectionReference<HelpCard> =>
  collection(db, `families/${familyId}/helpCards`) as CollectionReference<HelpCard>

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
    // Firestore serverTimestamp() returns a Timestamp object, not a string.
    // Coerce to ISO so date formatting in CurriculumTab doesn't render "Invalid Date".
    for (const field of ['updatedAt', 'createdAt'] as const) {
      const raw = data[field] as unknown
      if (raw && typeof raw !== 'string' && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
        data[field] = (raw as { toDate: () => Date }).toDate().toISOString()
      }
    }
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

// ── Monthly Reviews (Monthly Review Book — auto-generated) ──────

export const monthlyReviewsCollection = (
  familyId: string,
): CollectionReference<MonthlyReview> =>
  collection(db, `families/${familyId}/monthlyReviews`) as CollectionReference<MonthlyReview>

/** Monthly review doc ID: {childId}_{YYYY-MM} */
export const monthlyReviewDocId = (childId: string, month: string): string =>
  `${childId}_${month}`

export const monthlyReviewDoc = (
  familyId: string,
  reviewId: string,
): DocumentReference<MonthlyReview> =>
  doc(db, 'families', familyId, 'monthlyReviews', reviewId) as DocumentReference<MonthlyReview>

// ── XP Ledger (cumulative XP tracking) ──────────────────────────

/** XP ledger per child. Doc ID: {childId} */
export const xpLedgerCollection = (
  familyId: string,
): CollectionReference<XpLedger> =>
  collection(db, `families/${familyId}/xpLedger`) as CollectionReference<XpLedger>

// ── Feature Requests (Shelly portal friction log) ───────────────

/**
 * Silent friction log: `families/{familyId}/featureRequests/{id}`.
 * Feedback metadata (not a child's record) — written fire-and-forget by the
 * Shelly chat when she voices an unmet want. Read by Step 5b's scheduled CF.
 */
export const featureRequestsCollection = (
  familyId: string,
): CollectionReference<FeatureRequest> =>
  collection(db, `families/${familyId}/featureRequests`) as CollectionReference<FeatureRequest>

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

// ── Stonebridge (Banner Rally) mission progress ───────────────
// Mission progress only — never XP / diamonds. Doc ID: {childId}
export const stonebridgeProgressCollection = (
  familyId: string,
): CollectionReference<StonebridgeProgress> =>
  collection(db, `families/${familyId}/stonebridgeProgress`) as CollectionReference<StonebridgeProgress>

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

// ── Learner Models (Foundations synthesis — FEAT-48) ────────────

const learnerModelConverter: FirestoreDataConverter<LearnerModel> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as LearnerModel
    return { ...data, id: snapshot.id }
  },
}

/** Per-child learner model. Doc ID: {childId} (D1). */
export const learnerModelsCollection = (
  familyId: string,
): CollectionReference<LearnerModel> =>
  collection(db, `families/${familyId}/learnerModels`).withConverter(
    learnerModelConverter,
  ) as CollectionReference<LearnerModel>

const learnerReviewSessionConverter: FirestoreDataConverter<LearnerReviewSession> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as LearnerReviewSession
    return { ...data, id: snapshot.id }
  },
}

/** Persisted Foundations Review Chat sessions. Doc ID: `{childId}_{domain}` (FEAT-51). */
export const learnerReviewSessionsCollection = (
  familyId: string,
): CollectionReference<LearnerReviewSession> =>
  collection(db, `families/${familyId}/learnerReviewSessions`).withConverter(
    learnerReviewSessionConverter,
  ) as CollectionReference<LearnerReviewSession>

// ── Chapter Responses (Read-Aloud Discussion Evidence) ──────────

/** Chapter responses per child. Auto-ID documents. */
export const chapterResponsesCollection = (
  familyId: string,
): CollectionReference<ChapterResponse> =>
  collection(db, `families/${familyId}/chapterResponses`) as CollectionReference<ChapterResponse>

// ── Chapter Books (Global Curriculum Library) ───────────────────

/** Global chapter book library. Path: chapterBooks/{bookId} */
export const chapterBooksCollection = (): CollectionReference<ChapterBook> =>
  collection(db, 'chapterBooks') as CollectionReference<ChapterBook>

// ── Book Progress (Per-Family Read-Aloud Tracking) ──────────────

/** Book progress per child. Doc ID: {childId}_{bookId} */
export const bookProgressCollection = (
  familyId: string,
): CollectionReference<BookProgress> =>
  collection(db, `families/${familyId}/bookProgress`) as CollectionReference<BookProgress>

/** Book progress doc ID: {childId}_{bookId} */
export const bookProgressDocId = (childId: string, bookId: string): string =>
  `${childId}_${bookId}`

// ── Barnes Bros Business (FEAT-30) ──────────────────────────────

const businessLogConverter: FirestoreDataConverter<BusinessLogEntry> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as BusinessLogEntry
    return { ...data, id: snapshot.id }
  },
}

/**
 * Append-only sales/earnings event log. Use `addDoc` only — entries are never
 * mutated (additive thermometer). Path: families/{familyId}/businessLog/{autoId}
 */
export const businessLogCollection = (
  familyId: string,
): CollectionReference<BusinessLogEntry> =>
  collection(db, `families/${familyId}/businessLog`).withConverter(
    businessLogConverter,
  ) as CollectionReference<BusinessLogEntry>

const businessGoalConverter: FirestoreDataConverter<BusinessGoal> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as BusinessGoal
    return { ...data, id: snapshot.id }
  },
}

/**
 * Goal config (the milestone stack). One doc per child operator — write via
 * `setDoc(..., { merge: true })` / `updateDoc`, never bare `setDoc`.
 * Doc ID: {childId}
 */
export const businessGoalsCollection = (
  familyId: string,
): CollectionReference<BusinessGoal> =>
  collection(db, `families/${familyId}/businessGoals`).withConverter(
    businessGoalConverter,
  ) as CollectionReference<BusinessGoal>

// ── GDQ Kit Builder (FEAT-80) ───────────────────────────────────

export const kitRosterConverter: FirestoreDataConverter<KitRoster> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as KitRoster
    return { ...data, id: snapshot.id }
  },
}

/**
 * Kit rosters — the reusable GDQ kit cast + rules (§4). A kid makes MANY kits,
 * so this is an auto-ID collection (like `businessLog`), not a one-doc-per-child
 * config. Use `addDoc` to create; `updateDoc` to edit. Filter by `childId`.
 * Path: families/{familyId}/kitRosters/{autoId}
 */
export const kitRostersCollection = (
  familyId: string,
): CollectionReference<KitRoster> =>
  collection(db, `families/${familyId}/kitRosters`).withConverter(
    kitRosterConverter,
  ) as CollectionReference<KitRoster>

// ── Barnes Bros Product Catalog (FEAT-81) ───────────────────────

export const catalogProductConverter: FirestoreDataConverter<CatalogProduct> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as CatalogProduct
    return { ...data, id: snapshot.id }
  },
}

/**
 * Curated products the Barnes Bros show/sell (the "show" layer). A kid makes
 * many products, so this is an auto-ID collection (like `businessLog`), not a
 * one-doc-per-child config. Family-scoped — a catalog is the family's
 * storefront, not per-child. Use `addDoc` to create; `updateDoc` to edit (no
 * deletes — `status: 'retired'` retires). Path: families/{familyId}/catalogProducts/{autoId}
 */
export const catalogProductsCollection = (
  familyId: string,
): CollectionReference<CatalogProduct> =>
  collection(db, `families/${familyId}/catalogProducts`).withConverter(
    catalogProductConverter,
  ) as CollectionReference<CatalogProduct>

// ── Barnes Bros Order Queue (FEAT-89) ───────────────────────────

export const catalogOrderConverter: FirestoreDataConverter<CatalogOrder> = {
  toFirestore: (data) => stripUndefined(data as unknown as Record<string, unknown>),
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions) => {
    const data = snapshot.data(options) as CatalogOrder
    return { ...data, id: snapshot.id }
  },
}

/**
 * Orders placed from the public catalog site, fulfilled in-app (FEAT-89). The
 * customer-facing write happens server-side via the `submitCatalogOrder` Cloud
 * Function (admin SDK) — the public page has no auth — so `firestore.rules`
 * stays owner-only + untouched. In-app this collection is read (newest first) +
 * status-advanced. Additive, auto-ID, no deletes. Family-scoped — a catalog is
 * the family's storefront, not per-child. Path: families/{familyId}/orders/{autoId}
 */
export const catalogOrdersCollection = (
  familyId: string,
): CollectionReference<CatalogOrder> =>
  collection(db, `families/${familyId}/orders`).withConverter(
    catalogOrderConverter,
  ) as CollectionReference<CatalogOrder>

// ── Error Log (ARCH-11 client error reporting) ──────────────────

/** Scrubbed client error records. Path: families/{familyId}/errorLog/{autoId} */
export const errorLogsCollection = (
  familyId: string,
): CollectionReference<ErrorLog> =>
  collection(db, `families/${familyId}/errorLog`) as CollectionReference<ErrorLog>
